// Connects to Gridiron Director's loopback relay, parses gridiron.ue/1 messages and
// broadcasts typed events. Lives for the whole game instance.
#pragma once

#include "CoreMinimal.h"
#include "Subsystems/GameInstanceSubsystem.h"
#include "Engine/TimerHandle.h"
#include "GridironTypes.h"
#include "GridironBridgeSubsystem.generated.h"

class IWebSocket;
class FJsonObject;

// v1 batch messages (kept for older content).
DECLARE_DYNAMIC_MULTICAST_DELEGATE_OneParam(FOnGridironPlay, const FGridironPlay&, Play);
DECLARE_DYNAMIC_MULTICAST_DELEGATE_OneParam(FOnGridironCutscene, const FGridironCutscene&, Cutscene);
DECLARE_DYNAMIC_MULTICAST_DELEGATE_OneParam(FOnGridironStadium, const FGridironStadium&, Stadium);
DECLARE_DYNAMIC_MULTICAST_DELEGATE_OneParam(FOnGridironConnection, bool, bConnected);
// Telemetry stream.
DECLARE_DYNAMIC_MULTICAST_DELEGATE_OneParam(FOnGridironPlayCall, const FGridironPlayCall&, PlayCall);
DECLARE_DYNAMIC_MULTICAST_DELEGATE_OneParam(FOnGridironFrames, const FGridironFrameChunk&, Chunk);
DECLARE_DYNAMIC_MULTICAST_DELEGATE_OneParam(FOnGridironCollision, const FGridironCollision&, Collision);
DECLARE_DYNAMIC_MULTICAST_DELEGATE_OneParam(FOnGridironCinematic, const FGridironCinematic&, Cinematic);
DECLARE_DYNAMIC_MULTICAST_DELEGATE_OneParam(FOnGridironMatchState, const FGridironMatchState&, MatchState);

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
	// Report Unreal's own flow state (it adds Celebration/Returning to the game's states).
	UFUNCTION(BlueprintCallable, Category = "Gridiron") void ReportFlowState(EGridironFlowState State);

	UPROPERTY(BlueprintAssignable, Category = "Gridiron") FOnGridironPlay OnPlay;
	UPROPERTY(BlueprintAssignable, Category = "Gridiron") FOnGridironCutscene OnCutscene;
	UPROPERTY(BlueprintAssignable, Category = "Gridiron") FOnGridironStadium OnStadium;
	UPROPERTY(BlueprintAssignable, Category = "Gridiron") FOnGridironConnection OnConnectionChanged;
	UPROPERTY(BlueprintAssignable, Category = "Gridiron") FOnGridironPlayCall OnPlayCall;
	UPROPERTY(BlueprintAssignable, Category = "Gridiron") FOnGridironFrames OnFrames;
	UPROPERTY(BlueprintAssignable, Category = "Gridiron") FOnGridironCollision OnCollision;
	UPROPERTY(BlueprintAssignable, Category = "Gridiron") FOnGridironCinematic OnCinematic;
	UPROPERTY(BlueprintAssignable, Category = "Gridiron") FOnGridironMatchState OnMatchState;

	UPROPERTY(Config, EditAnywhere, Category = "Gridiron") FString Url = TEXT("ws://127.0.0.1:47800");
	UPROPERTY(Config, EditAnywhere, Category = "Gridiron") float ReconnectSeconds = 3.f;

	// Team primary colours from session.start, indexed by team id.
	UPROPERTY(BlueprintReadOnly, Category = "Gridiron") TArray<FLinearColor> TeamColors;

private:
	void HandleMessage(const FString& Text);
	void Send(const FString& Type, const TSharedRef<FJsonObject>& Payload);
	void ScheduleReconnect();
	template <typename T> static bool Convert(const TSharedPtr<FJsonObject>& Payload, T& Out);

	TSharedPtr<IWebSocket> Socket;
	FTimerHandle ReconnectHandle;
	int32 Seq = 0;
	bool bWantConnection = false;
	bool bLoggedConnectionError = false;
};
