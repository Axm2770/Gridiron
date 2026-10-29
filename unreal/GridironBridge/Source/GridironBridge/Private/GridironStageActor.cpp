#include "GridironStageActor.h"
#include "Animation/AnimSequence.h"
#include "Components/SkeletalMeshComponent.h"
#include "Engine/SkeletalMesh.h"
#include "Materials/MaterialInstanceDynamic.h"

AGridironStageActor::AGridironStageActor()
{
	PrimaryActorTick.bCanEverTick = false;
	Mesh = CreateDefaultSubobject<USkeletalMeshComponent>(TEXT("Mesh"));
	RootComponent = Mesh;
	Mesh->SetCollisionEnabled(ECollisionEnabled::NoCollision);
}

void AGridironStageActor::BeginPlay()
{
	Super::BeginPlay();
	LoadArt();
}

void AGridironStageActor::LoadArt()
{
	if (Mesh->GetSkeletalMeshAsset()) return;
	if (USkeletalMesh* Body = BodyMesh.LoadSynchronous()) Mesh->SetSkeletalMesh(Body);
	if (UAnimSequence* Idle = IdleAnimation.LoadSynchronous()) Mesh->PlayAnimation(Idle, true);
}

void AGridironStageActor::ApplyPerformer_Implementation(const FGridironPerformer& Performer, const FGridironTeamLook& Team)
{
	// Spawned performers are dressed before BeginPlay runs, so make sure the art is there.
	LoadArt();
	// Staff slots wear neutral grey; everyone else (Star, Prospect, Captain, Subject) is a player.
	static const TSet<FName> Staff = { TEXT("HeadCoach"), TEXT("Owner"), TEXT("Commissioner"), TEXT("Trainer"), TEXT("GeneralManager") };
	const bool bPlayer = !Staff.Contains(Performer.Slot);
	const FLinearColor Tint = bPlayer && !Team.Colors.Primary.IsEmpty() ? GridironColor::FromHex(Team.Colors.Primary) : StaffColor;
	for (int32 Slot = 0; Slot < Mesh->GetNumMaterials(); ++Slot)
		if (UMaterialInstanceDynamic* Mat = Mesh->CreateDynamicMaterialInstance(Slot)) Mat->SetVectorParameterValue(TintParameter, Tint);
	const float Height = Performer.Appearance.HeightCm > 0.f ? Performer.Appearance.HeightCm / BodyMeshHeight : 1.f;
	Mesh->SetRelativeScale3D(FVector(1.f, 1.f, Height));
}
