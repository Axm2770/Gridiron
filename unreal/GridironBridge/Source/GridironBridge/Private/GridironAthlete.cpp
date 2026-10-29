#include "GridironAthlete.h"
#include "Animation/AnimInstance.h"
#include "Animation/AnimMontage.h"
#include "Animation/AnimSingleNodeInstance.h"
#include "Animation/BlendSpace.h"
#include "Engine/SkeletalMesh.h"
#include "Components/SkeletalMeshComponent.h"
#include "PhysicsEngine/PhysicalAnimationComponent.h"
#include "Components/StaticMeshComponent.h"
#include "Engine/StaticMesh.h"
#include "Materials/MaterialInstanceDynamic.h"
#include "Materials/MaterialInterface.h"
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
	// The engine cylinder's own material has no colour parameter; BasicShapeMaterial exposes "Color" for team tints.
	static ConstructorHelpers::FObjectFinder<UMaterialInterface> BasicShape(TEXT("/Engine/BasicShapes/BasicShapeMaterial.BasicShapeMaterial"));
	if (BasicShape.Succeeded()) Proxy->SetMaterial(0, BasicShape.Object);
	// Cylinder is 100 cm wide/tall: scale to a ~55 cm wide, 185 cm tall player, origin at the feet.
	Proxy->SetRelativeScale3D(FVector(0.55f, 0.55f, 1.85f));
	Proxy->SetRelativeLocation(FVector(0.f, 0.f, 92.5f));
}

void AGridironAthlete::BeginPlay()
{
	Super::BeginPlay();
	LoadDefaultArt();
}

void AGridironAthlete::LoadDefaultArt()
{
	// Art assigned in a Blueprint subclass wins; otherwise use the engine mannequin if installed.
	if (!Mesh->GetSkeletalMeshAsset() && !BodyMesh.IsNull())
	{
		if (USkeletalMesh* Body = BodyMesh.LoadSynchronous())
		{
			Mesh->SetSkeletalMesh(Body);
			// The mannequin faces +Y; actors face +X.
			Mesh->SetRelativeRotation(FRotator(0.f, -90.f, 0.f));
		}
	}
	if (!Mesh->GetSkeletalMeshAsset()) return;
	Mesh->bEnableUpdateRateOptimizations = true;
	MeshRelativeLocation = Mesh->GetRelativeLocation();
	MeshRelativeRotation = Mesh->GetRelativeRotation();
	PhysicalAnimation->SetSkeletalMeshComponent(Mesh);

	// No AnimBP set: drive the locomotion blend space directly from telemetry speed.
	if (!Mesh->GetAnimInstance() || Mesh->GetAnimationMode() == EAnimationMode::AnimationSingleNode)
	{
		if (UBlendSpace* Blend = Locomotion.LoadSynchronous())
		{
			Mesh->SetAnimationMode(EAnimationMode::AnimationSingleNode);
			Mesh->SetAnimation(Blend);
			Mesh->Play(true);
			// Find the speed axis by name: the mannequin's blend space is (Direction, Speed).
			SpeedAxis = Blend->GetBlendParameter(1).DisplayName.Contains(TEXT("Speed")) ? 1 : 0;
			LocomotionMaxSpeed = Blend->GetBlendParameter(SpeedAxis).Max;
		}
	}
}

void AGridironAthlete::UpdateLocomotion()
{
	UAnimSingleNodeInstance* Single = LocomotionMaxSpeed > 0.f ? Mesh->GetSingleNodeInstance() : nullptr;
	if (!Single) return;
	// Within the blend space's range the samples match speed; beyond it (sprinting), play the top
	// sample faster so feet keep up with the ground instead of sliding.
	FVector Position(Direction, Direction, 0.f);
	Position[SpeedAxis] = FMath::Min(Speed, LocomotionMaxSpeed);
	Single->SetBlendSpacePosition(Position);
	Single->SetPlayRate(Speed > LocomotionMaxSpeed ? Speed / LocomotionMaxSpeed : 1.f);
}

void AGridironAthlete::ApplyLook_Implementation(const FGridironRosterEntry& Entry, FLinearColor TeamColor)
{
	const bool bHasArt = Mesh->GetSkeletalMeshAsset() != nullptr;
	Proxy->SetVisibility(!bHasArt);
	const FLinearColor Tint = Entry.Side == TEXT("offense") ? TeamColor : TeamColor * 0.55f;
	if (bHasArt)
	{
		// Height from the roster; heavier players are a little broader.
		const float Height = Entry.HeightCm > 0.f ? Entry.HeightCm / BodyMeshHeight : 1.f;
		const float Breadth = FMath::GetMappedRangeValueClamped(FVector2f(80.f, 160.f), FVector2f(0.95f, 1.25f), Entry.MassKg);
		Mesh->SetRelativeScale3D(FVector(Breadth, Breadth, Height));
		for (int32 Slot = 0; Slot < Mesh->GetNumMaterials(); ++Slot)
			if (UMaterialInstanceDynamic* Mat = Mesh->CreateDynamicMaterialInstance(Slot)) Mat->SetVectorParameterValue(TintParameter, Tint);
		return;
	}
	// Shoulder width grows with mass (receivers ~45 cm, linemen ~62 cm); bodies are shallower than wide.
	const float Width = FMath::GetMappedRangeValueClamped(FVector2f(80.f, 160.f), FVector2f(0.45f, 0.62f), Entry.MassKg);
	Proxy->SetRelativeScale3D(FVector(Width * 0.6f, Width, Entry.HeightCm / 100.f));
	Proxy->SetRelativeLocation(FVector(0.f, 0.f, Entry.HeightCm * 0.5f));
	if (UMaterialInstanceDynamic* Mat = Proxy->CreateDynamicMaterialInstance(0)) Mat->SetVectorParameterValue(TEXT("Color"), Tint);
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
	UpdateLocomotion();
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
	FPhysicalAnimationData Motors;
	Motors.bIsLocalSimulation = false;
	Motors.OrientationStrength = MotorStrength;
	Motors.PositionStrength = MotorStrength;
	Motors.AngularVelocityStrength = MotorDamping;
	Motors.VelocityStrength = MotorDamping;
	PhysicalAnimation->ApplyPhysicalAnimationSettingsBelow(BodyRoot, Motors, true);
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
	UE_LOG(LogGridiron, Log, TEXT("Athlete %d (%s) goes down"), Identity.Index, *Identity.Role);
}

void AGridironAthlete::EndRagdoll()
{
	const FVector PelvisUp = Mesh->GetSocketRotation(PelvisBone).Quaternion().GetAxisZ();
	UAnimMontage* GetUp = FVector::DotProduct(PelvisUp, FVector::UpVector) >= 0.f ? GetUpFaceUp : GetUpFaceDown;
	UAnimInstance* Anim = Mesh->GetAnimInstance();
	const bool bMontage = Anim && GetUp && Mesh->GetAnimationMode() == EAnimationMode::AnimationBlueprint;
	if (bMontage)
	{
		// Freeze the physics pose so the AnimBP can blend from it (Pose Snapshot node) into the get-up.
		Anim->SavePoseSnapshot(PoseSnapshotName);
		StopPhysics();
	}
	// Back on the telemetry path. Without a montage the bodies keep simulating while the physics
	// weight eases to zero (Tick), which reads as the player picking himself up.
	if (bHasPending) SetActorLocationAndRotation(PendingLocation, FRotator(0.f, PendingYaw, 0.f));
	bHasPending = false;
	if (bMontage) Anim->Montage_Play(GetUp);
	RecoverElapsed = 0.f;
	BodyState = EGridironBodyState::Recovering;
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
		if (Mesh->IsSimulatingPhysics(PelvisBone))
		{
			RecoverElapsed += DeltaSeconds;
			const float Alpha = 1.f - FMath::Clamp(RecoverElapsed / RecoverSeconds, 0.f, 1.f);
			Mesh->SetAllBodiesPhysicsBlendWeight(Alpha * Alpha);
			if (Alpha <= 0.f) StopPhysics();
			break;
		}
		const UAnimInstance* Anim = Mesh->GetAnimInstance();
		if (!Anim || !Anim->IsAnyMontagePlaying()) BodyState = EGridironBodyState::Animated;
		break;
	}
	default:
		break;
	}
}
