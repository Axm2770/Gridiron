#include "GridironAthlete.h"
#include "Animation/AnimInstance.h"
#include "Animation/AnimMontage.h"
#include "Components/SkeletalMeshComponent.h"
#include "PhysicsEngine/PhysicalAnimationComponent.h"
#include "Components/StaticMeshComponent.h"
#include "Engine/StaticMesh.h"
#include "Materials/MaterialInstanceDynamic.h"
#include "UObject/ConstructorHelpers.h"

AGridironAthlete::AGridironAthlete()
{
	PrimaryActorTick.bCanEverTick = true;
	Root = CreateDefaultSubobject<USceneComponent>(TEXT("Root"));
	RootComponent = Root;
	Mesh = CreateDefaultSubobject<USkeletalMeshComponent>(TEXT("Mesh"));
	Mesh->SetupAttachment(Root);
	Mesh->SetCollisionProfileName(TEXT("Ragdoll"));
	// Telemetry is authoritative for where players are, so the mesh never pushes others around.
	Mesh->SetGenerateOverlapEvents(false);
	PhysicalAnimation = CreateDefaultSubobject<UPhysicalAnimationComponent>(TEXT("PhysicalAnimation"));

	// Engine-content capsule so a greybox level shows players before any character art exists.
	Proxy = CreateDefaultSubobject<UStaticMeshComponent>(TEXT("Proxy"));
	Proxy->SetupAttachment(Root);
	Proxy->SetCollisionEnabled(ECollisionEnabled::NoCollision);
	static ConstructorHelpers::FObjectFinder<UStaticMesh> Cylinder(TEXT("/Engine/BasicShapes/Cylinder.Cylinder"));
	if (Cylinder.Succeeded()) Proxy->SetStaticMesh(Cylinder.Object);
	// Cylinder is 100 cm wide/tall: scale to a ~55 cm wide, 185 cm tall player, origin at the feet.
	Proxy->SetRelativeScale3D(FVector(0.55f, 0.55f, 1.85f));
	Proxy->SetRelativeLocation(FVector(0.f, 0.f, 92.5f));
}

void AGridironAthlete::ApplyLook_Implementation(const FGridironRosterEntry& Entry, FLinearColor TeamColor)
{
	const bool bHasArt = Mesh->GetSkeletalMeshAsset() != nullptr;
	Proxy->SetVisibility(!bHasArt);
	if (bHasArt) return;
	Proxy->SetRelativeScale3D(FVector(Entry.MassKg / 180.f, Entry.MassKg / 180.f, Entry.HeightCm / 100.f));
	Proxy->SetRelativeLocation(FVector(0.f, 0.f, Entry.HeightCm * 0.5f));
	if (UMaterialInstanceDynamic* Mat = Proxy->CreateDynamicMaterialInstance(0))
		Mat->SetVectorParameterValue(TEXT("Color"), Entry.Side == TEXT("offense") ? TeamColor : TeamColor * 0.55f);
}

void AGridironAthlete::Configure(const FGridironRosterEntry& Entry, FLinearColor TeamColor)
{
	Identity = Entry;
	if (BodyState != EGridironBodyState::Animated) StopPhysics();
	MeshRelativeLocation = Mesh->GetRelativeLocation();
	MeshRelativeRotation = Mesh->GetRelativeRotation();
	PhysicalAnimation->SetSkeletalMeshComponent(Mesh);
	ApplyLook(Entry, TeamColor);
}

void AGridironAthlete::ApplySample(const FVector& WorldLocation, float WorldYaw, const FVector& WorldVelocity, bool bCarrier, float DeltaSeconds)
{
	bHasBall = bCarrier;
	// While ragdolled the body is physics-owned: moving the root would drag the simulated bones.
	// Remember the authoritative spot and snap to it when the get-up begins.
	if (BodyState == EGridironBodyState::Ragdoll)
	{
		PendingLocation = WorldLocation;
		PendingYaw = WorldYaw;
		bHasPending = true;
		return;
	}
	SetActorLocationAndRotation(WorldLocation, FRotator(0.f, WorldYaw, 0.f));
	const FVector Planar(WorldVelocity.X, WorldVelocity.Y, 0.f);
	Speed = Planar.Size();
	Direction = Speed > 10.f ? FMath::FindDeltaAngleDegrees(WorldYaw, Planar.Rotation().Yaw) : 0.f;
	const float YawRate = DeltaSeconds > 0.f ? FMath::FindDeltaAngleDegrees(LastYaw, WorldYaw) / DeltaSeconds : 0.f;
	LeanAngle = FMath::FInterpTo(LeanAngle, FMath::Clamp(YawRate * Speed * 0.0004f, -18.f, 18.f), DeltaSeconds, 6.f);
	LastYaw = WorldYaw;
}

void AGridironAthlete::ReceiveCollision(const FGridironCollision& Collision, const FVector& WorldLocation, const FVector& WorldNormal, bool bIsTarget)
{
	OnHit(Collision, bIsTarget);
	if (BodyState == EGridironBodyState::Ragdoll || BodyState == EGridironBodyState::Recovering) return;

	// Targets are pushed along the normal (instigator → target); instigators recoil slightly.
	const FVector Impulse = WorldNormal * Collision.Impulse * ImpulseScale * (bIsTarget ? 1.f : -0.35f);
	const bool bTackleLike = Collision.Kind == TEXT("Tackle") || Collision.Kind == TEXT("Sack");

	if (bIsTarget && bTackleLike && Collision.IsBig())
	{
		BeginRagdoll(Impulse, WorldLocation);
		return;
	}
	const FName BodyRoot = Collision.BodyRegion == TEXT("lower") ? PelvisBone : SpineBone;
	const float Weight = Collision.Severity == TEXT("light") || !bIsTarget ? LightBlendWeight : SolidBlendWeight;
	BeginHitReact(BodyRoot, Weight, Impulse, WorldLocation);
}

void AGridironAthlete::BeginHitReact(FName BodyRoot, float Weight, const FVector& Impulse, const FVector& At)
{
	// Physical animation motors keep the simulated bones tracking the animated pose, so the hit
	// reads as a stagger rather than a collapse.
	PhysicalAnimation->ApplyPhysicalAnimationProfileBelow(BodyRoot, HitReactProfile, true);
	Mesh->SetAllBodiesBelowSimulatePhysics(BodyRoot, true, true);
	Mesh->SetAllBodiesBelowPhysicsBlendWeight(BodyRoot, Weight, false, true);
	Mesh->AddImpulseAtLocation(Impulse, At, BodyRoot);
	ReactRoot = BodyRoot;
	ReactWeight = Weight;
	ReactElapsed = 0.f;
	BodyState = EGridironBodyState::HitReact;
}

void AGridironAthlete::BeginRagdoll(const FVector& Impulse, const FVector& At)
{
	Mesh->SetAllBodiesSimulatePhysics(true);
	Mesh->SetAllBodiesPhysicsBlendWeight(1.f);
	Mesh->WakeAllRigidBodies();
	Mesh->AddImpulseAtLocation(Impulse, At, PelvisBone);
	RagdollElapsed = 0.f;
	BodyState = EGridironBodyState::Ragdoll;
}

void AGridironAthlete::EndRagdoll()
{
	// Freeze the physics pose so the AnimBP can blend from it (Pose Snapshot node) into the get-up.
	const FVector PelvisUp = Mesh->GetSocketRotation(PelvisBone).Quaternion().GetAxisZ();
	if (UAnimInstance* Anim = Mesh->GetAnimInstance()) Anim->SavePoseSnapshot(PoseSnapshotName);
	StopPhysics();
	if (bHasPending) SetActorLocationAndRotation(PendingLocation, FRotator(0.f, PendingYaw, 0.f));
	bHasPending = false;
	UAnimMontage* GetUp = FVector::DotProduct(PelvisUp, FVector::UpVector) >= 0.f ? GetUpFaceUp : GetUpFaceDown;
	UAnimInstance* Anim = Mesh->GetAnimInstance();
	if (Anim && GetUp)
	{
		Anim->Montage_Play(GetUp);
		BodyState = EGridironBodyState::Recovering;
	}
	else BodyState = EGridironBodyState::Animated;
}

void AGridironAthlete::StopPhysics()
{
	Mesh->SetAllBodiesSimulatePhysics(false);
	Mesh->SetAllBodiesPhysicsBlendWeight(0.f);
	// Full ragdoll can detach the mesh visually from the root; snap it back.
	Mesh->AttachToComponent(Root, FAttachmentTransformRules::SnapToTargetNotIncludingScale);
	Mesh->SetRelativeLocationAndRotation(MeshRelativeLocation, MeshRelativeRotation);
	BodyState = EGridironBodyState::Animated;
}

void AGridironAthlete::Tick(float DeltaSeconds)
{
	Super::Tick(DeltaSeconds);
	switch (BodyState)
	{
	case EGridironBodyState::HitReact:
	{
		ReactElapsed += DeltaSeconds;
		const float Alpha = 1.f - FMath::Clamp(ReactElapsed / HitReactSeconds, 0.f, 1.f);
		Mesh->SetAllBodiesBelowPhysicsBlendWeight(ReactRoot, ReactWeight * Alpha * Alpha, false, true);
		if (Alpha <= 0.f) StopPhysics();
		break;
	}
	case EGridironBodyState::Ragdoll:
		RagdollElapsed += DeltaSeconds;
		if (RagdollElapsed >= RagdollSeconds) EndRagdoll();
		break;
	case EGridironBodyState::Recovering:
	{
		const UAnimInstance* Anim = Mesh->GetAnimInstance();
		if (!Anim || !Anim->IsAnyMontagePlaying()) BodyState = EGridironBodyState::Animated;
		break;
	}
	default:
		break;
	}
}
