// Match flow state machine for the Unreal renderer:
//   Hub → LoadingMatch → PreGame (intro cinematic) → Live ⇄ Halftime
//        Live/Halftime/PostGame → Celebration (blocking cinematic) → back
//        PostGame → Returning → Hub
// Every transition that touches content is asynchronous: the stadium streams in as a level
// instance, uniform/performer sets preload through the StreamableManager, and a camera fade
// covers the swap, so nothing loads on the game thread during play.
#pragma once

#include "CoreMinimal.h"
#include "Subsystems/GameInstanceSubsystem.h"
#include "Engine/DataAsset.h"
#include "GridironTypes.h"
#include "GridironFlowSubsystem.generated.h"

class ULevelStreamingDynamic;
struct FStreamableHandle;

USTRUCT(BlueprintType)
struct FGridironPreloadSet
{
	GENERATED_BODY()
	UPROPERTY(EditAnywhere, BlueprintReadOnly, Category = "Gridiron") TArray<TSoftObjectPtr<UObject>> Assets;
};

UCLASS(BlueprintType)
class GRIDIRONBRIDGE_API UGridironFlowConfig : public UPrimaryDataAsset
{
	GENERATED_BODY()
public:
	// Keyed by the protocol's preload hint, e.g. "Stadium_DAL".
	UPROPERTY(EditAnywhere, BlueprintReadOnly, Category = "Gridiron") TMap<FString, TSoftObjectPtr<UWorld>> Stadiums;
	UPROPERTY(EditAnywhere, BlueprintReadOnly, Category = "Gridiron") TSoftObjectPtr<UWorld> DefaultStadium;
	// Keyed by preload hint, e.g. "Uniform_DAL" → jersey materials, helmet meshes, logos.
	UPROPERTY(EditAnywhere, BlueprintReadOnly, Category = "Gridiron") TMap<FString, FGridironPreloadSet> PreloadSets;
	UPROPERTY(EditAnywhere, BlueprintReadOnly, Category = "Gridiron") FName IntroTemplate = TEXT("LS_Pregame_Walkout");
	UPROPERTY(EditAnywhere, BlueprintReadOnly, Category = "Gridiron") float FadeSeconds = 0.6f;
};

DECLARE_DYNAMIC_MULTICAST_DELEGATE_TwoParams(FOnGridironFlowChanged, EGridironFlowState, From, EGridironFlowState, To);

UCLASS()
class GRIDIRONBRIDGE_API UGridironFlowSubsystem : public UGameInstanceSubsystem
{
	GENERATED_BODY()

public:
	virtual void Initialize(FSubsystemCollectionBase& Collection) override;

	UFUNCTION(BlueprintCallable, Category = "Gridiron") void SetConfig(UGridironFlowConfig* InConfig) { Config = InConfig; }
	UFUNCTION(BlueprintPure, Category = "Gridiron") EGridironFlowState GetState() const { return State; }
	UPROPERTY(BlueprintAssignable, Category = "Gridiron") FOnGridironFlowChanged OnFlowChanged;

	// Called by the sequence manager when any cinematic ends.
	void NotifyCinematicFinished(const FGridironCinematic& Cinematic);

	// Pure transition rule (exposed for tests and tooling): where to go when the game reports
	// GameState while Unreal is in Current. Returns Current when no transition applies.
	static EGridironFlowState NextState(EGridironFlowState Current, EGridironFlowState GameState, bool bAssetsReady);

private:
	UFUNCTION() void HandleMatchState(const FGridironMatchState& Match);
	UFUNCTION() void HandleCinematic(const FGridironCinematic& Cinematic);
	UFUNCTION() void HandleStadiumShown();

	void SetState(EGridironFlowState NewState);
	void BeginLoading(const FGridironMatchState& Match);
	void TryEnterPreGame();
	void BeginReturn();
	void Fade(bool bToBlack);
	void ReleaseHold();
	static EGridironFlowState Parse(const FString& Name);

	UPROPERTY() TObjectPtr<UGridironFlowConfig> Config;
	UPROPERTY() TObjectPtr<ULevelStreamingDynamic> StadiumLevel;
	TArray<TSharedPtr<FStreamableHandle>> PreloadHandles;
	FGridironMatchState Match;
	EGridironFlowState State = EGridironFlowState::Hub;
	// The game's latest state while Unreal is busy (loading, intro, celebration).
	EGridironFlowState Pending = EGridironFlowState::Live;
	int32 PendingLoads = 0;
	bool bStadiumShown = false;
	bool bIssuingLoads = false;
};
