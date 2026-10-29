// Runtime cinematic manager. A cinematic.trigger names a template Level Sequence; this subsystem
// async-loads it and its performers, personalises them (uniforms, names, numbers, faces), sets
// stadium lighting and weather, binds performers to the sequence by tag, and plays it. Higher
// priority interrupts lower; equal or lower priority queues.
#pragma once

#include "CoreMinimal.h"
#include "Subsystems/WorldSubsystem.h"
#include "Engine/DataAsset.h"
#include "UObject/Interface.h"
#include "GridironTypes.h"
#include "GridironSequenceManager.generated.h"

class ULevelSequence;
class ULevelSequencePlayer;
class ALevelSequenceActor;
class UMaterialParameterCollection;
struct FStreamableHandle;

// Implement on performer actors (MetaHuman BPs, player BPs) to receive their runtime identity.
UINTERFACE(BlueprintType)
class GRIDIRONBRIDGE_API UGridironPerformerInterface : public UInterface
{
	GENERATED_BODY()
};

class GRIDIRONBRIDGE_API IGridironPerformerInterface
{
	GENERATED_BODY()
public:
	// Apply jersey colours/number, name plate, skin/hair/build and height for this cast slot.
	UFUNCTION(BlueprintNativeEvent, Category = "Gridiron") void ApplyPerformer(const FGridironPerformer& Performer, const FGridironTeamLook& Team);
};

USTRUCT(BlueprintType)
struct FGridironCinematicTemplate
{
	GENERATED_BODY()
	UPROPERTY(EditAnywhere, BlueprintReadOnly, Category = "Gridiron") TSoftObjectPtr<ULevelSequence> Sequence;
	// Performer class per cast slot (HeadCoach, Star, Prospect, …); falls back to DefaultPerformer.
	UPROPERTY(EditAnywhere, BlueprintReadOnly, Category = "Gridiron") TMap<FName, TSoftClassPtr<AActor>> PerformerClasses;
	UPROPERTY(EditAnywhere, BlueprintReadOnly, Category = "Gridiron") TSoftClassPtr<AActor> DefaultPerformer;
};

USTRUCT(BlueprintType)
struct FGridironLightingPreset
{
	GENERATED_BODY()
	UPROPERTY(EditAnywhere, BlueprintReadOnly, Category = "Gridiron") float SunIntensity = 8.f;   // lux
	UPROPERTY(EditAnywhere, BlueprintReadOnly, Category = "Gridiron") FLinearColor SunColor = FLinearColor::White;
	UPROPERTY(EditAnywhere, BlueprintReadOnly, Category = "Gridiron") float SunPitch = -45.f;
	UPROPERTY(EditAnywhere, BlueprintReadOnly, Category = "Gridiron") float SkyIntensity = 1.f;
};

UCLASS(BlueprintType)
class GRIDIRONBRIDGE_API UGridironCinematicLibrary : public UPrimaryDataAsset
{
	GENERATED_BODY()
public:
	// Keyed by template name from the protocol (LS_Championship_Celebration, LS_DraftNight_Stage…).
	UPROPERTY(EditAnywhere, BlueprintReadOnly, Category = "Gridiron") TMap<FName, FGridironCinematicTemplate> Templates;
	// Keyed by timeOfDay (Afternoon, Dusk, Night).
	UPROPERTY(EditAnywhere, BlueprintReadOnly, Category = "Gridiron") TMap<FString, FGridironLightingPreset> Lighting;
	// Keyed by weather (Rain, Snow, Wind) → an actor with the Niagara/audio for it.
	UPROPERTY(EditAnywhere, BlueprintReadOnly, Category = "Gridiron") TMap<FString, TSoftClassPtr<AActor>> Weather;
	// Stadium dressing (banners, end zones, boards) reads HomePrimary/AwayPrimary etc. from this.
	UPROPERTY(EditAnywhere, BlueprintReadOnly, Category = "Gridiron") TSoftObjectPtr<UMaterialParameterCollection> TeamParameters;
	// Where performers stand (world space) and which way they face; cast slots line up side by
	// side. Template cameras are authored around this mark.
	UPROPERTY(EditAnywhere, BlueprintReadOnly, Category = "Gridiron") FVector StageLocation = FVector(5000.f, 0.f, 0.f);
	UPROPERTY(EditAnywhere, BlueprintReadOnly, Category = "Gridiron") float StageYaw = 90.f;
	UPROPERTY(EditAnywhere, BlueprintReadOnly, Category = "Gridiron") float StageSpacing = 130.f;
};

DECLARE_DYNAMIC_MULTICAST_DELEGATE_OneParam(FOnGridironCinematicStarted, const FGridironCinematic&, Cinematic);
DECLARE_DYNAMIC_MULTICAST_DELEGATE_TwoParams(FOnGridironCinematicFinished, const FGridironCinematic&, Cinematic, bool, bSkipped);

UCLASS()
class GRIDIRONBRIDGE_API UGridironSequenceManager : public UWorldSubsystem
{
	GENERATED_BODY()

public:
	virtual void OnWorldBeginPlay(UWorld& InWorld) override;

	// Used when nothing calls SetLibrary (the greybox builds this asset).
	static constexpr const TCHAR* DefaultLibraryPath = TEXT("/Game/Gridiron/Cinematics/DA_GridironCinematics.DA_GridironCinematics");

	UFUNCTION(BlueprintCallable, Category = "Gridiron") void SetLibrary(UGridironCinematicLibrary* InLibrary) { Library = InLibrary; }
	UFUNCTION(BlueprintCallable, Category = "Gridiron") void Play(const FGridironCinematic& Cinematic);
	UFUNCTION(BlueprintCallable, Category = "Gridiron") void Skip();
	UFUNCTION(BlueprintPure, Category = "Gridiron") bool IsPlaying() const { return bActive; }
	// Lighting/weather/team colours can also be applied outside cinematics (e.g. on kickoff).
	UFUNCTION(BlueprintCallable, Category = "Gridiron") void ApplyEnvironment(const FGridironEnvironment& Environment, const FGridironTeams& Teams);

	UPROPERTY(BlueprintAssignable, Category = "Gridiron") FOnGridironCinematicStarted OnCinematicStarted;
	UPROPERTY(BlueprintAssignable, Category = "Gridiron") FOnGridironCinematicFinished OnCinematicFinished;

private:
	UFUNCTION() void HandleTrigger(const FGridironCinematic& Cinematic);
	UFUNCTION() void HandleSequenceFinished();
	void Load();
	void Stage();
	void Finish(bool bSkipped, bool bPlayNext = true);
	void PlayNext();

	UPROPERTY() TObjectPtr<UGridironCinematicLibrary> Library;
	UPROPERTY() TObjectPtr<ULevelSequencePlayer> Player;
	UPROPERTY() TObjectPtr<ALevelSequenceActor> SequenceActor;
	UPROPERTY() TArray<TObjectPtr<AActor>> Spawned;
	TSharedPtr<FStreamableHandle> LoadHandle;
	FGridironCinematic Active;
	TArray<FGridironCinematic> Queue;
	bool bActive = false;
};
