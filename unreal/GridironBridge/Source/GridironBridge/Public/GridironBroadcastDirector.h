// TV-style multi-camera system. Spawns one CineCameraActor per rig and either locks to a rig
// (All-22, Offense, Defense, Sideline, Cable cam) or, in Director mode, cuts between them by
// play phase. Focus distance tracks the subject every frame (procedural depth of field).
#pragma once

#include "CoreMinimal.h"
#include "GameFramework/Actor.h"
#include "GridironTypes.h"
#include "GridironBroadcastDirector.generated.h"

class ACineCameraActor;
class UCameraShakeBase;

UENUM(BlueprintType)
enum class EGridironCameraMode : uint8
{
	Director,     // automatic broadcast cutting
	All22,        // high end-zone coaching view, all 22 in frame
	OffenseFocus, // low behind the quarterback
	DefenseFocus, // behind the deep safeties, facing the offense
	Sideline,     // 50-yard-line press-box camera
	CableCam      // suspended camera chasing the ball
};

UENUM(BlueprintType)
enum class EGridironShot : uint8
{
	All22,
	OffenseFocus,
	DefenseFocus,
	SidelineWide,
	SidelineTight,
	CableCam,
	Impact
};

USTRUCT(BlueprintType)
struct FGridironLens
{
	GENERATED_BODY()
	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Gridiron") float FocalLength = 35.f; // mm
	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Gridiron") float Aperture = 8.f;     // f-stop; lower = shallower DOF
	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Gridiron") float MoveSpeed = 4.f;    // interp speed for position
};

UCLASS(Blueprintable)
class GRIDIRONBRIDGE_API AGridironBroadcastDirector : public AActor
{
	GENERATED_BODY()

public:
	AGridironBroadcastDirector();
	virtual void BeginPlay() override;
	virtual void Tick(float DeltaSeconds) override;

	UPROPERTY(EditAnywhere, Category = "Gridiron") FTransform FieldOrigin;
	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Gridiron") EGridironCameraMode Mode = EGridironCameraMode::Director;
	UPROPERTY(EditAnywhere, Category = "Gridiron") TMap<EGridironShot, FGridironLens> Lenses;
	UPROPERTY(EditAnywhere, Category = "Gridiron") TSubclassOf<UCameraShakeBase> ImpactShake;
	// Seconds a Director shot must hold before another cut (impact punch-ins are exempt).
	UPROPERTY(EditAnywhere, Category = "Gridiron") float MinShotSeconds = 1.0f;
	UPROPERTY(EditAnywhere, Category = "Gridiron") float CutBlendSeconds = 0.25f;

	UFUNCTION(BlueprintCallable, Category = "Gridiron") void SetMode(EGridironCameraMode NewMode);
	UFUNCTION(BlueprintPure, Category = "Gridiron") EGridironShot GetShot() const { return Shot; }
	UFUNCTION(BlueprintImplementableEvent, Category = "Gridiron") void OnShotChanged(EGridironShot NewShot);

	// Fed by the match director.
	void NotifySnap(const FGridironPlayCall& Call);
	void UpdateFrame(float PlayTime, const FVector& BallWorld, const FVector& BallVelocityWorld, const FVector& CarrierWorld, int32 CarrierIndex);
	void NotifyCollision(const FGridironCollision& Collision, const FVector& WorldLocation);
	void NotifyPlayEnded();

private:
	EGridironShot ChooseShot() const;
	void CutTo(EGridironShot NewShot, bool bHardCut);
	void ComputeRig(EGridironShot Which, FVector& OutLocation, FVector& OutLookAt) const;
	FVector Local(const FVector& World) const { return FieldOrigin.InverseTransformPosition(World); }
	FVector World(const FVector& Local) const { return FieldOrigin.TransformPosition(Local); }

	UPROPERTY() TMap<EGridironShot, TObjectPtr<ACineCameraActor>> Rigs;
	EGridironShot Shot = EGridironShot::SidelineWide;
	float ShotAge = 0.f;
	float ImpactUntil = -1.f;
	float Clock = 0.f;

	// Field-local play state (cm, +X toward the offense's goal when Direction = 1).
	int32 Direction = 1;
	float PlayTime = -1.f;
	FVector Ball = FVector::ZeroVector;
	FVector BallVelocity = FVector::ZeroVector;
	FVector Carrier = FVector::ZeroVector;
	FVector LineOfScrimmage = FVector::ZeroVector;
	int32 CarrierIndex = 0;
	bool bLive = false;
	bool bHaveLos = false;
};
