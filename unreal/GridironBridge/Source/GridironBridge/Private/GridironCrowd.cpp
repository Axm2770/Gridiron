#include "GridironCrowd.h"
#include "Components/HierarchicalInstancedStaticMeshComponent.h"
#include "Engine/StaticMesh.h"
#include "UObject/ConstructorHelpers.h"

AGridironCrowd::AGridironCrowd()
{
	PrimaryActorTick.bCanEverTick = false;
	Seats = CreateDefaultSubobject<UHierarchicalInstancedStaticMeshComponent>(TEXT("Seats"));
	RootComponent = Seats;
	Seats->SetMobility(EComponentMobility::Static);
	Seats->SetCollisionEnabled(ECollisionEnabled::NoCollision);
	Seats->NumCustomDataFloats = 1;
	Seats->SetCastShadow(false); // thousands of tiny shadows cost more than they add
	static ConstructorHelpers::FObjectFinder<UStaticMesh> Cylinder(TEXT("/Engine/BasicShapes/Cylinder.Cylinder"));
	if (Cylinder.Succeeded()) Seats->SetStaticMesh(Cylinder.Object);
}

void AGridironCrowd::OnConstruction(const FTransform& Transform)
{
	Super::OnConstruction(Transform);
	Rebuild();
}

void AGridironCrowd::Rebuild()
{
	Seats->ClearInstances();
	const FVector Scale = SpectatorSize / 100.f; // engine cylinder is 100 cm, pivot at its centre
	TArray<FTransform> Transforms;
	TArray<float> Teams;
	for (const FGridironCrowdSection& Section : Sections)
	{
		const FVector Lo = Section.Min.ComponentMin(Section.Max), Hi = Section.Min.ComponentMax(Section.Max);
		// Rows run along the longer side of the section.
		const bool bAlongX = (Hi.X - Lo.X) >= (Hi.Y - Lo.Y);
		const float Length = bAlongX ? Hi.X - Lo.X : Hi.Y - Lo.Y, Depth = bAlongX ? Hi.Y - Lo.Y : Hi.X - Lo.X;
		const int32 PerRow = FMath::Max(1, FMath::FloorToInt(Length / SeatSpacing)), Rows = FMath::Max(1, FMath::FloorToInt(Depth / RowSpacing));
		for (int32 Row = 0; Row < Rows; ++Row)
			for (int32 Seat = 0; Seat < PerRow; ++Seat)
			{
				const float A = (Seat + 0.5f) * Length / PerRow, B = (Row + 0.5f) * Depth / Rows;
				const FVector World = bAlongX ? FVector(Lo.X + A, Lo.Y + B, Hi.Z) : FVector(Lo.X + B, Lo.Y + A, Hi.Z);
				Transforms.Add(FTransform(FQuat::Identity, GetActorTransform().InverseTransformPosition(World + FVector(0.f, 0.f, SpectatorSize.Z * 0.5f)), Scale));
				Teams.Add(Section.Team);
			}
	}
	Seats->AddInstances(Transforms, false, false);
	for (int32 i = 0; i < Teams.Num(); ++i) Seats->SetCustomDataValue(i, 0, Teams[i], false);
	Seats->MarkRenderStateDirty();
}
