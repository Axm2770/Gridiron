// Stadium crowd: thousands of instanced spectators laid out over seating sections. Colour, density
// and motion are all in the material (M_Crowd): per-instance custom data 0 picks the home or away
// palette from MPC_Gridiron, PerInstanceRandom against CrowdDensity hides seats for a thinner crowd,
// and a small World Position Offset bob keeps it alive. No per-frame CPU work.
#pragma once

#include "CoreMinimal.h"
#include "GameFramework/Actor.h"
#include "GridironCrowd.generated.h"

class UHierarchicalInstancedStaticMeshComponent;

USTRUCT(BlueprintType)
struct FGridironCrowdSection
{
	GENERATED_BODY()
	// Seat area in world space: X/Y span the rows; Z is the seat surface height.
	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Gridiron") FVector Min = FVector::ZeroVector;
	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Gridiron") FVector Max = FVector::ZeroVector;
	// 0 = home fans, 1 = away fans; the material blends between the two team colours.
	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Gridiron") float Team = 0.f;
};

UCLASS(Blueprintable)
class GRIDIRONBRIDGE_API AGridironCrowd : public AActor
{
	GENERATED_BODY()

public:
	AGridironCrowd();
	virtual void OnConstruction(const FTransform& Transform) override;

	UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "Gridiron") TObjectPtr<UHierarchicalInstancedStaticMeshComponent> Seats;
	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Gridiron") TArray<FGridironCrowdSection> Sections;
	// Spacing between spectators along a row and between rows (cm).
	UPROPERTY(EditAnywhere, Category = "Gridiron") float SeatSpacing = 65.f;
	UPROPERTY(EditAnywhere, Category = "Gridiron") float RowSpacing = 95.f;
	// Seated spectator size (cm) for the default cylinder proxy.
	UPROPERTY(EditAnywhere, Category = "Gridiron") FVector SpectatorSize = FVector(42.f, 42.f, 120.f);

	UFUNCTION(BlueprintCallable, Category = "Gridiron") void Rebuild();
};
