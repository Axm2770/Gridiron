// One on-field player. Telemetry drives the root (position/facing) and AnimBP locomotion
// variables; collisions blend the skeleton from animation into physics:
//   light/solid → partial physical-animation hit react below the spine or pelvis, blended back out
//   big (on the hit player) → full ragdoll, pose snapshot, then a get-up montage
#pragma once

#include "CoreMinimal.h"
#include "GameFramework/Pawn.h"
#include "GridironTypes.h"
#include "GridironAthlete.generated.h"

class USkeletalMeshComponent;
class UPhysicalAnimationComponent;
class UAnimMontage;
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

	// --- Tuning ---
	UPROPERTY(EditAnywhere, Category = "Gridiron|Physics") FName PelvisBone = TEXT("pelvis");
	UPROPERTY(EditAnywhere, Category = "Gridiron|Physics") FName SpineBone = TEXT("spine_01");
	UPROPERTY(EditAnywhere, Category = "Gridiron|Physics") FName HitReactProfile = TEXT("HitReact");
	UPROPERTY(EditAnywhere, Category = "Gridiron|Physics") float HitReactSeconds = 0.55f;
	UPROPERTY(EditAnywhere, Category = "Gridiron|Physics") float SolidBlendWeight = 0.75f;
	UPROPERTY(EditAnywhere, Category = "Gridiron|Physics") float LightBlendWeight = 0.4f;
	// Converts protocol impulse (N·s) to Unreal impulse units (kg·cm/s) with a gameplay scale.
	UPROPERTY(EditAnywhere, Category = "Gridiron|Physics") float ImpulseScale = 60.f;
	UPROPERTY(EditAnywhere, Category = "Gridiron|Physics") float RagdollSeconds = 1.2f;
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
