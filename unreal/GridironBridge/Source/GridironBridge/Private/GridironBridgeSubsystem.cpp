#include "GridironBridgeSubsystem.h"
#include "WebSocketsModule.h"
#include "IWebSocket.h"
#include "JsonObjectConverter.h"
#include "Dom/JsonObject.h"
#include "Serialization/JsonReader.h"
#include "Serialization/JsonSerializer.h"
#include "Engine/GameInstance.h"
#include "TimerManager.h"

static const TCHAR* GProtocol = TEXT("gridiron.ue/1");

void UGridironBridgeSubsystem::Initialize(FSubsystemCollectionBase& Collection)
{
	Super::Initialize(Collection);
	FModuleManager::LoadModuleChecked<FWebSocketsModule>(TEXT("WebSockets"));
	Connect();
}

void UGridironBridgeSubsystem::Deinitialize()
{
	Disconnect();
	Super::Deinitialize();
}

void UGridironBridgeSubsystem::Connect()
{
	bWantConnection = true;
	if (Socket.IsValid() && Socket->IsConnected()) return;

	Socket = FWebSocketsModule::Get().CreateWebSocket(Url);
	TWeakObjectPtr<UGridironBridgeSubsystem> Weak(this);

	Socket->OnConnected().AddLambda([Weak]()
	{
		if (!Weak.IsValid()) return;
		Weak->OnConnectionChanged.Broadcast(true);
		Weak->Send(TEXT("ue.ready"), MakeShared<FJsonObject>());
	});
	Socket->OnMessage().AddLambda([Weak](const FString& Text)
	{
		if (Weak.IsValid()) Weak->HandleMessage(Text);
	});
	Socket->OnConnectionError().AddLambda([Weak](const FString& Error)
	{
		if (!Weak.IsValid()) return;
		UE_LOG(LogTemp, Verbose, TEXT("Gridiron bridge connection error: %s"), *Error);
		Weak->ScheduleReconnect();
	});
	Socket->OnClosed().AddLambda([Weak](int32, const FString&, bool)
	{
		if (!Weak.IsValid()) return;
		Weak->OnConnectionChanged.Broadcast(false);
		Weak->ScheduleReconnect();
	});
	Socket->Connect();
}

void UGridironBridgeSubsystem::Disconnect()
{
	bWantConnection = false;
	if (UGameInstance* GI = GetGameInstance()) GI->GetTimerManager().ClearTimer(ReconnectHandle);
	if (Socket.IsValid())
	{
		Socket->OnClosed().Clear();
		Socket->Close();
		Socket.Reset();
	}
}

bool UGridironBridgeSubsystem::IsConnected() const
{
	return Socket.IsValid() && Socket->IsConnected();
}

void UGridironBridgeSubsystem::ScheduleReconnect()
{
	UGameInstance* GI = GetGameInstance();
	if (!bWantConnection || !GI) return;
	GI->GetTimerManager().SetTimer(ReconnectHandle, FTimerDelegate::CreateUObject(this, &UGridironBridgeSubsystem::Connect), ReconnectSeconds, false);
}

void UGridironBridgeSubsystem::Send(const FString& Type, const TSharedRef<FJsonObject>& Payload)
{
	if (!IsConnected()) return;
	TSharedRef<FJsonObject> Msg = MakeShared<FJsonObject>();
	Msg->SetStringField(TEXT("protocol"), GProtocol);
	Msg->SetStringField(TEXT("type"), Type);
	Msg->SetNumberField(TEXT("seq"), ++Seq);
	Msg->SetNumberField(TEXT("sentAt"), static_cast<double>(FDateTime::UtcNow().ToUnixTimestamp()) * 1000.0);
	Msg->SetObjectField(TEXT("payload"), Payload);
	FString Out;
	const TSharedRef<TJsonWriter<>> Writer = TJsonWriterFactory<>::Create(&Out);
	FJsonSerializer::Serialize(Msg, Writer);
	Socket->Send(Out);
}

void UGridironBridgeSubsystem::ReportCutsceneFinished(const FString& EventId, bool bSkipped)
{
	TSharedRef<FJsonObject> Payload = MakeShared<FJsonObject>();
	Payload->SetStringField(TEXT("eventId"), EventId);
	Payload->SetBoolField(TEXT("skipped"), bSkipped);
	Send(TEXT("ue.cutscene.finished"), Payload);
}

void UGridironBridgeSubsystem::HandleMessage(const FString& Text)
{
	TSharedPtr<FJsonObject> Msg;
	if (!FJsonSerializer::Deserialize(TJsonReaderFactory<>::Create(Text), Msg) || !Msg.IsValid()) return;
	if (Msg->GetStringField(TEXT("protocol")) != GProtocol) return;

	const FString Type = Msg->GetStringField(TEXT("type"));
	const TSharedPtr<FJsonObject>* Payload = nullptr;
	if (!Msg->TryGetObjectField(TEXT("payload"), Payload) || !Payload) return;

	if (Type == TEXT("play.execution"))
	{
		FGridironPlay Play;
		FJsonObjectConverter::JsonObjectToUStruct((*Payload).ToSharedRef(), &Play, 0, 0);
		if (Play.Frames.Num() > 0) OnPlay.Broadcast(Play);
	}
	else if (Type == TEXT("cutscene.trigger"))
	{
		FGridironCutscene Cutscene;
		FJsonObjectConverter::JsonObjectToUStruct((*Payload).ToSharedRef(), &Cutscene, 0, 0);
		OnCutscene.Broadcast(Cutscene);
	}
	else if (Type == TEXT("stadium.state"))
	{
		FGridironStadium Stadium;
		FJsonObjectConverter::JsonObjectToUStruct((*Payload).ToSharedRef(), &Stadium, 0, 0);
		OnStadium.Broadcast(Stadium);
	}
	else if (Type == TEXT("session.start"))
	{
		TeamColors.Reset();
		const TArray<TSharedPtr<FJsonValue>>* Colors = nullptr;
		if ((*Payload)->TryGetArrayField(TEXT("colors"), Colors))
		{
			for (const TSharedPtr<FJsonValue>& C : *Colors) TeamColors.Add(FLinearColor(FColor::FromHex(C->AsString())));
		}
	}
}
