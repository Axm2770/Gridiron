// Replays a deterministic play from Gridiron Director: interpolates 10 Hz frames onto 22
// player pawns and the ball, fires animation montages at event times and cuts cameras.
#pragma once

#include "CoreMinimal.h"
#include "GameFramework/Actor.h"
#include "Engine/DataAsset.h"
#include "GridironTypes.h"
#include "GridironPlayDirector.generated.h"

class UAnimMontage;
class USkeletalMeshComponent;

UCLASS(BlueprintType)
class GRIDIRONBRIDGE_API UGridironAnimSet : public UDataAsset
{
	GENERATED_BODY()
public:
	// Keys match ANIMATION_TRIGGERS montage names in dist/bridge/ue-protocol.mjs (AM_Throw, AM_Tackle, ...).
	UPROPERTY(EditAnywhere, BlueprintReadOnly, Category = "Gridiron") TMap<FName, TObjectPtr<UAnimMontage>> Montages;
};

UCLASS(Blueprintable)
class GRIDIRONBRIDGE_API AGridironPlayerPawn : public AActor
{
	GENERATED_BODY()
public:
	AGridironPlayerPawn();
	UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "Gridiron") TObjectPtr<USkeletalMeshComponent> Mesh;
	// Read by the AnimBlueprint locomotion blend space (cm/s).
	UPROPERTY(BlueprintReadOnly, Category = "Gridiron") float Speed = 0.f;
	UPROPERTY(BlueprintReadOnly, Category = "Gridiron") FGridironActor Identity;
	// Implement in Blueprint to apply jersey number, name plate and team material.
	UFUNCTION(BlueprintImplementableEvent, Category = "Gridiron") void ApplyIdentity(const FGridironActor& Actor, FLinearColor TeamColor);
};

UCLASS(Blueprintable)
class GRIDIRONBRIDGE_API AGridironPlayDirector : public AActor
{
	GENERATED_BODY()
public:
	AGridironPlayDirector();
	virtual void BeginPlay() override;
	virtual void Tick(float DeltaSeconds) override;

	UPROPERTY(EditAnywhere, Category = "Gridiron") TSubclassOf<AGridironPlayerPawn> PlayerClass;
	UPROPERTY(EditAnywhere, Category = "Gridiron") TObjectPtr<AActor> Ball;
	UPROPERTY(EditAnywhere, Category = "Gridiron") TObjectPtr<UGridironAnimSet> AnimSet;
	// Field origin (midfield, ground level). Engine coordinates are relative to this transform.
	UPROPERTY(EditAnywhere, Category = "Gridiron") FTransform FieldOrigin;
	UPROPERTY(EditAnywhere, Category = "Gridiron") bool bAutoReplayBigPlays = true;

	UFUNCTION(BlueprintCallable, Category = "Gridiron") void PlayExecution(const FGridironPlay& Play);
	UFUNCTION(BlueprintCallable, Category = "Gridiron") void Replay();
	UFUNCTION(BlueprintImplementableEvent, Category = "Gridiron") void OnPlayFinished(const FGridironResult& Result);
	// Override in Blueprint to route camera rigs to CineCameraActors tagged with the rig name.
	UFUNCTION(BlueprintNativeEvent, Category = "Gridiron") void CutToShot(const FGridironShot& Shot, AActor* FollowTarget);

private:
	UFUNCTION() void HandlePlay(const FGridironPlay& Play);
	void ApplyTime(float T);
	void FireTriggers(float From, float To);

	UPROPERTY() TArray<TObjectPtr<AGridironPlayerPawn>> Pawns;
	FGridironPlay Current;
	float Time = -1.f;
	int32 NextShot = 0;
	bool bReplaying = false;
};
