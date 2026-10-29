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

// FJsonObjectConverter stops at the first property it cannot convert, and JSON null cannot be
// converted into an FString/int/struct. Dropping nulls lets those fields keep their defaults.
static void StripNulls(const TSharedPtr<FJsonObject>& Object)
{
	if (!Object.IsValid()) return;
	TArray<FString> Remove;
	for (auto& Pair : Object->Values)
	{
		const TSharedPtr<FJsonValue>& Value = Pair.Value;
		if (!Value.IsValid() || Value->IsNull()) { Remove.Add(Pair.Key); continue; }
		if (Value->Type == EJson::Object) StripNulls(Value->AsObject());
		else if (Value->Type == EJson::Array)
		{
			TArray<TSharedPtr<FJsonValue>> Kept;
			for (const TSharedPtr<FJsonValue>& Item : Value->AsArray())
			{
				if (!Item.IsValid() || Item->IsNull()) continue;
				if (Item->Type == EJson::Object) StripNulls(Item->AsObject());
				Kept.Add(Item);
			}
			Pair.Value = MakeShared<FJsonValueArray>(Kept);
		}
	}
	for (const FString& Key : Remove) Object->RemoveField(Key);
}

template <typename T>
bool UGridironBridgeSubsystem::Convert(const TSharedPtr<FJsonObject>& Payload, T& Out)
{
	if (!Payload.IsValid()) return false;
	StripNulls(Payload);
	return FJsonObjectConverter::JsonObjectToUStruct(Payload.ToSharedRef(), &Out, 0, 0);
}

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

void UGridironBridgeSubsystem::ReportFlowState(EGridironFlowState State)
{
	TSharedRef<FJsonObject> Payload = MakeShared<FJsonObject>();
	const UEnum* Enum = StaticEnum<EGridironFlowState>();
	Payload->SetStringField(TEXT("state"), Enum->GetNameStringByValue(static_cast<int64>(State)));
	Send(TEXT("ue.flow.state"), Payload);
}

void UGridironBridgeSubsystem::HandleMessage(const FString& Text)
{
	TSharedPtr<FJsonObject> Msg;
	if (!FJsonSerializer::Deserialize(TJsonReaderFactory<>::Create(Text), Msg) || !Msg.IsValid()) return;
	if (Msg->GetStringField(TEXT("protocol")) != GProtocol) return;

	const FString Type = Msg->GetStringField(TEXT("type"));
	const TSharedPtr<FJsonObject>* PayloadPtr = nullptr;
	if (!Msg->TryGetObjectField(TEXT("payload"), PayloadPtr) || !PayloadPtr) return;
	const TSharedPtr<FJsonObject> Payload = *PayloadPtr;

	if (Type == TEXT("player.frames"))
	{
		// Hot path: up to ~12 frames × 22 players per message during a play.
		FGridironFrameChunk Chunk;
		if (Convert(Payload, Chunk) || Chunk.Frames.Num()) OnFrames.Broadcast(Chunk);
	}
	else if (Type == TEXT("play.call"))
	{
		FGridironPlayCall Call;
		Convert(Payload, Call);
		if (Call.Roster.Num()) OnPlayCall.Broadcast(Call);
	}
	else if (Type == TEXT("physics.collision"))
	{
		FGridironCollision Collision;
		Convert(Payload, Collision);
		OnCollision.Broadcast(Collision);
	}
	else if (Type == TEXT("cinematic.trigger"))
	{
		FGridironCinematic Cinematic;
		Convert(Payload, Cinematic);
		OnCinematic.Broadcast(Cinematic);
	}
	else if (Type == TEXT("match.state"))
	{
		FGridironMatchState State;
		Convert(Payload, State);
		OnMatchState.Broadcast(State);
	}
	else if (Type == TEXT("play.execution"))
	{
		FGridironPlay Play;
		Convert(Payload, Play);
		if (Play.Frames.Num() > 0) OnPlay.Broadcast(Play);
	}
	else if (Type == TEXT("cutscene.trigger"))
	{
		FGridironCutscene Cutscene;
		Convert(Payload, Cutscene);
		OnCutscene.Broadcast(Cutscene);
	}
	else if (Type == TEXT("stadium.state"))
	{
		FGridironStadium Stadium;
		Convert(Payload, Stadium);
		OnStadium.Broadcast(Stadium);
	}
	else if (Type == TEXT("session.start"))
	{
		TeamColors.Reset();
		const TArray<TSharedPtr<FJsonValue>>* Colors = nullptr;
		if (Payload->TryGetArrayField(TEXT("colors"), Colors))
		{
			for (const TSharedPtr<FJsonValue>& C : *Colors) TeamColors.Add(GridironColor::FromHex(C->AsString()));
		}
	}
}
