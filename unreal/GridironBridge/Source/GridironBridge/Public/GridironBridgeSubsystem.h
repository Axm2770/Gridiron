// Connects to Gridiron Director's loopback relay, parses gridiron.ue/1 messages and
// broadcasts typed Blueprint events. Lives for the whole game instance.
#pragma once

#include "CoreMinimal.h"
#include "Subsystems/GameInstanceSubsystem.h"
#include "GridironTypes.h"
#include "GridironBridgeSubsystem.generated.h"

class IWebSocket;

DECLARE_DYNAMIC_MULTICAST_DELEGATE_OneParam(FOnGridironPlay, const FGridironPlay&, Play);
DECLARE_DYNAMIC_MULTICAST_DELEGATE_OneParam(FOnGridironCutscene, const FGridironCutscene&, Cutscene);
DECLARE_DYNAMIC_MULTICAST_DELEGATE_OneParam(FOnGridironStadium, const FGridironStadium&, Stadium);
DECLARE_DYNAMIC_MULTICAST_DELEGATE_OneParam(FOnGridironConnection, bool, bConnected);

UCLASS(Config = Game)
class GRIDIRONBRIDGE_API UGridironBridgeSubsystem : public UGameInstanceSubsystem
{
	GENERATED_BODY()

public:
	virtual void Initialize(FSubsystemCollectionBase& Collection) override;
	virtual void Deinitialize() override;

	UFUNCTION(BlueprintCallable, Category = "Gridiron") void Connect();
	UFUNCTION(BlueprintCallable, Category = "Gridiron") void Disconnect();
	UFUNCTION(BlueprintPure, Category = "Gridiron") bool IsConnected() const;

	// Tell the game a cutscene finished (or was skipped) so it can resume its flow.
	UFUNCTION(BlueprintCallable, Category = "Gridiron") void ReportCutsceneFinished(const FString& EventId, bool bSkipped);

	UPROPERTY(BlueprintAssignable, Category = "Gridiron") FOnGridironPlay OnPlay;
	UPROPERTY(BlueprintAssignable, Category = "Gridiron") FOnGridironCutscene OnCutscene;
	UPROPERTY(BlueprintAssignable, Category = "Gridiron") FOnGridironStadium OnStadium;
	UPROPERTY(BlueprintAssignable, Category = "Gridiron") FOnGridironConnection OnConnectionChanged;

	UPROPERTY(Config, EditAnywhere, Category = "Gridiron") FString Url = TEXT("ws://127.0.0.1:47800");
	UPROPERTY(Config, EditAnywhere, Category = "Gridiron") float ReconnectSeconds = 3.f;

	// Team primary colours from session.start, indexed by team id.
	UPROPERTY(BlueprintReadOnly, Category = "Gridiron") TArray<FLinearColor> TeamColors;

private:
	void HandleMessage(const FString& Text);
	void Send(const FString& Type, const TSharedRef<class FJsonObject>& Payload);
	void ScheduleReconnect();

	TSharedPtr<IWebSocket> Socket;
	FTimerHandle ReconnectHandle;
	int32 Seq = 0;
	bool bWantConnection = false;
};
