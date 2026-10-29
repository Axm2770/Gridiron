#include "GridironWeather.h"
#include "GridironTypes.h"
#include "Camera/PlayerCameraManager.h"
#include "Components/HierarchicalInstancedStaticMeshComponent.h"
#include "Engine/StaticMesh.h"
#include "Kismet/GameplayStatics.h"
#include "Materials/MaterialInstanceDynamic.h"
#include "UObject/ConstructorHelpers.h"

AGridironWeather::AGridironWeather()
{
	PrimaryActorTick.bCanEverTick = true;
	PrimaryActorTick.TickGroup = TG_PostUpdateWork; // after cameras move
	Particles = CreateDefaultSubobject<UHierarchicalInstancedStaticMeshComponent>(TEXT("Particles"));
	RootComponent = Particles;
	Particles->SetMobility(EComponentMobility::Movable);
	Particles->SetCollisionEnabled(ECollisionEnabled::NoCollision);
	Particles->SetCastShadow(false);
	// Custom data 0-2 repeat each particle's resting position in the box, so the material knows where
	// an instance sits without per-instance position nodes. Instances stay at those positions (keeping
	// the bounds over the whole box); the material only offsets them.
	Particles->NumCustomDataFloats = 3;
	static ConstructorHelpers::FObjectFinder<UStaticMesh> Cube(TEXT("/Engine/BasicShapes/Cube.Cube"));
	if (Cube.Succeeded()) Particles->SetStaticMesh(Cube.Object);
	Particles->SetVisibility(false);
}

void AGridironWeather::BeginPlay()
{
	Super::BeginPlay();
	if (UMaterialInterface* Base = Material.LoadSynchronous())
	{
		Mid = UMaterialInstanceDynamic::Create(Base, this);
		Particles->SetMaterial(0, Mid);
		Mid->SetVectorParameterValue(TEXT("BoxSize"), FLinearColor(BoxSize.X, BoxSize.Y, BoxSize.Z));
	}
}

void AGridironWeather::Scatter(int32 Count, const FVector& ParticleScale)
{
	Particles->ClearInstances();
	FRandomStream Random(1906);
	TArray<FTransform> Transforms;
	TArray<FVector3f> Rest;
	Transforms.Reserve(Count);
	Rest.Reserve(Count);
	for (int32 i = 0; i < Count; ++i)
	{
		const FVector3f Box(BoxSize);
		const FVector3f At(Random.FRandRange(-0.5f, 0.5f) * Box.X, Random.FRandRange(-0.5f, 0.5f) * Box.Y, Random.FRandRange(0.f, 1.f) * Box.Z);
		Transforms.Add(FTransform(FQuat::Identity, FVector(At), ParticleScale));
		Rest.Add(At);
	}
	Particles->AddInstances(Transforms, false, false);
	for (int32 i = 0; i < Count; ++i) Particles->SetCustomData(i, MakeArrayView(&Rest[i].X, 3), false);
	Particles->MarkRenderStateDirty();
}

void AGridironWeather::SetWeather(const FString& Weather)
{
	if (Weather == Current) return;
	Current = Weather;
	const bool bRain = Weather == TEXT("Rain"), bSnow = Weather == TEXT("Snow");
	if (bRain) Scatter(RainCount, FVector(0.012f, 0.012f, 0.55f)); // 1.2 cm x 55 cm streaks (motion-blur length)
	else if (bSnow) Scatter(SnowCount, FVector(0.035f, 0.035f, 0.035f)); // 3.5 cm flakes
	else Particles->ClearInstances();
	if (Mid)
	{
		Mid->SetScalarParameterValue(TEXT("FallSpeed"), bSnow ? 120.f : 1400.f); // cm/s
		Mid->SetScalarParameterValue(TEXT("Drift"), bSnow ? 60.f : 8.f);
		Mid->SetScalarParameterValue(TEXT("Opacity"), bSnow ? 0.85f : 0.28f);
		Mid->SetVectorParameterValue(TEXT("Tint"), bSnow ? FLinearColor(0.95f, 0.97f, 1.f) : FLinearColor(0.62f, 0.68f, 0.75f));
	}
	Particles->SetVisibility(bRain || bSnow);
	UE_LOG(LogGridiron, Log, TEXT("Weather: %s (%d particles)"), *Weather, Particles->GetInstanceCount());
}

void AGridironWeather::Tick(float DeltaSeconds)
{
	Super::Tick(DeltaSeconds);
	if (!Particles->IsVisible()) return;
	// Keep the box just ahead of the view, where particles are close enough to read; the material
	// keeps them fixed in the world, so moving the box is invisible.
	if (APlayerCameraManager* Camera = UGameplayStatics::GetPlayerCameraManager(this, 0))
	{
		const FVector View = Camera->GetCameraLocation();
		const FVector Ahead = Camera->GetCameraRotation().Vector().GetSafeNormal2D() * BoxSize.X * 0.35f;
		SetActorLocation(FVector(View.X + Ahead.X, View.Y + Ahead.Y, View.Z - BoxSize.Z * 0.6f));
	}
}
