// One on-field player. Telemetry drives the root (position/facing) and locomotion; collisions
// blend the skeleton from animation into physics:
//   light/solid → partial physical-animation hit react below the spine or pelvis, blended back out
//   big (on the hit player) → full ragdoll, then a get-up montage if one is assigned, otherwise
//   the physics blend weight eases back to the animated pose on the telemetry path.
// With no art assigned it loads the engine mannequin and drives its idle/walk/run blend space
// straight from telemetry speed (no Animation Blueprint needed); without that content it shows
// a team-coloured capsule.
#pragma once

#include "CoreMinimal.h"
#include "GameFramework/Pawn.h"
#include "GridironTypes.h"
#include "GridironAthlete.generated.h"

class USkeletalMeshComponent;
class UPhysicalAnimationComponent;
class UAnimMontage;
class UBlendSpace;
class USkeletalMesh;
class UStaticMeshComponent;

UENUM(BlueprintType)
enum class EGridironBodyState : uint8
{
	Animated,   // fully driven by telemetry + AnimBP
	HitReact,   // partial physics blend on part of the body
	Ragdoll,    // full physics; telemetry only moves the root
	Recovering  // get-up montage from the ragdoll pose snapshot
};

UCLASS(Blueprintable)
class GRIDIRONBRIDGE_API AGridironAthlete : public APawn
{
	GENERATED_BODY()

public:
	AGridironAthlete();
	virtual void BeginPlay() override;
	virtual void Tick(float DeltaSeconds) override;

	UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "Gridiron") TObjectPtr<USceneComponent> Root;
	UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "Gridiron") TObjectPtr<USkeletalMeshComponent> Mesh;
	UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "Gridiron") TObjectPtr<UPhysicalAnimationComponent> PhysicalAnimation;
	// Greybox stand-in shown until a skeletal mesh is assigned, tinted with the team colour.
	UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "Gridiron") TObjectPtr<UStaticMeshComponent> Proxy;

	// --- AnimBP inputs (read with TryGetPawnOwner → Cast) ---
	UPROPERTY(BlueprintReadOnly, Category = "Gridiron|Locomotion") float Speed = 0.f;       // cm/s
	UPROPERTY(BlueprintReadOnly, Category = "Gridiron|Locomotion") float Direction = 0.f;   // deg, velocity relative to facing
	UPROPERTY(BlueprintReadOnly, Category = "Gridiron|Locomotion") float LeanAngle = 0.f;   // deg, from yaw rate
	UPROPERTY(BlueprintReadOnly, Category = "Gridiron|Locomotion") bool bHasBall = false;
	UPROPERTY(BlueprintReadOnly, Category = "Gridiron") EGridironBodyState BodyState = EGridironBodyState::Animated;
	UPROPERTY(BlueprintReadOnly, Category = "Gridiron") FGridironRosterEntry Identity;

	// --- Default art: the engine mannequin (copied into /Game/Characters by setup.ps1) ---
	// Used when no skeletal mesh is set on the Mesh component. Clear BodyMesh to keep capsules.
	UPROPERTY(EditAnywhere, Category = "Gridiron|Art") TSoftObjectPtr<USkeletalMesh> BodyMesh = TSoftObjectPtr<USkeletalMesh>(FSoftObjectPath(TEXT("/Game/Characters/Mannequins/Meshes/SKM_Manny_Simple.SKM_Manny_Simple")));
	UPROPERTY(EditAnywhere, Category = "Gridiron|Art") TSoftObjectPtr<UBlendSpace> Locomotion = TSoftObjectPtr<UBlendSpace>(FSoftObjectPath(TEXT("/Game/Characters/Mannequins/Anims/Unarmed/BS_Idle_Walk_Run.BS_Idle_Walk_Run")));
	// Vector parameter on the body materials that takes the team colour.
	UPROPERTY(EditAnywhere, Category = "Gridiron|Art") FName TintParameter = TEXT("Paint Tint");
	// Height of the default mesh (cm); players are scaled from it.
	UPROPERTY(EditAnywhere, Category = "Gridiron|Art") float BodyMeshHeight = 180.f;

	// --- Tuning ---
	UPROPERTY(EditAnywhere, Category = "Gridiron|Physics") FName PelvisBone = TEXT("pelvis");
	UPROPERTY(EditAnywhere, Category = "Gridiron|Physics") FName SpineBone = TEXT("spine_01");
	// Physical-animation motors for hit reacts: how hard simulated bones chase the animated pose.
	UPROPERTY(EditAnywhere, Category = "Gridiron|Physics") float MotorStrength = 1500.f;
	UPROPERTY(EditAnywhere, Category = "Gridiron|Physics") float MotorDamping = 150.f;
	UPROPERTY(EditAnywhere, Category = "Gridiron|Physics") float HitReactSeconds = 0.55f;
	UPROPERTY(EditAnywhere, Category = "Gridiron|Physics") float SolidBlendWeight = 0.75f;
	UPROPERTY(EditAnywhere, Category = "Gridiron|Physics") float LightBlendWeight = 0.4f;
	// Converts protocol impulse (N·s) to Unreal impulse units (kg·cm/s) with a gameplay scale.
	UPROPERTY(EditAnywhere, Category = "Gridiron|Physics") float ImpulseScale = 60.f;
	UPROPERTY(EditAnywhere, Category = "Gridiron|Physics") float RagdollSeconds = 1.2f;
	// Without a get-up montage the ragdoll eases back into the animated pose over this time.
	UPROPERTY(EditAnywhere, Category = "Gridiron|Physics") float RecoverSeconds = 0.8f;
	UPROPERTY(EditAnywhere, Category = "Gridiron|Physics") FName PoseSnapshotName = TEXT("GetUpPose");
	UPROPERTY(EditAnywhere, Category = "Gridiron|Physics") TObjectPtr<UAnimMontage> GetUpFaceUp;
	UPROPERTY(EditAnywhere, Category = "Gridiron|Physics") TObjectPtr<UAnimMontage> GetUpFaceDown;

	// Called once per play when the roster arrives.
	UFUNCTION(BlueprintCallable, Category = "Gridiron") void Configure(const FGridironRosterEntry& Entry, FLinearColor TeamColor);
	// Jersey number, name plate, team materials, body scale from height/mass. The default
	// implementation tints and scales the greybox proxy; override in Blueprint for real art.
	UFUNCTION(BlueprintNativeEvent, Category = "Gridiron") void ApplyLook(const FGridironRosterEntry& Entry, FLinearColor TeamColor);

	// World-space sample from the match director (already transformed by the field origin).
	void ApplySample(const FVector& WorldLocation, float WorldYaw, const FVector& WorldVelocity, bool bCarrier, float DeltaSeconds);
	// bIsTarget: this player received the hit (vs. delivering it).
	void ReceiveCollision(const FGridironCollision& Collision, const FVector& WorldLocation, const FVector& WorldNormal, bool bIsTarget);

	UFUNCTION(BlueprintImplementableEvent, Category = "Gridiron") void OnHit(const FGridironCollision& Collision, bool bIsTarget);

private:
	void BeginHitReact(FName BodyRoot, float Weight, const FVector& Impulse, const FVector& At);
	void BeginRagdoll(const FVector& Impulse, const FVector& At);
	void EndRagdoll();
	void StopPhysics();
	void LoadDefaultArt();
	void UpdateLocomotion();

	// Top of the locomotion blend space's speed axis; faster players play it faster.
	float LocomotionMaxSpeed = 0.f;
	int32 SpeedAxis = 0;
	float RecoverElapsed = 0.f;
	FName ReactRoot;
	float ReactWeight = 0.f;
	float ReactElapsed = 0.f;
	float RagdollElapsed = 0.f;
	float LastYaw = 0.f;
	FVector PendingLocation = FVector::ZeroVector;
	float PendingYaw = 0.f;
	bool bHasPending = false;
	FVector MeshRelativeLocation = FVector::ZeroVector;
	FRotator MeshRelativeRotation = FRotator::ZeroRotator;
};
