// Match-day stadium state. Listens for stadium.state and dresses the venue: team colours into a
// material parameter collection (end zones, stand trim and anything else that reads it), sun and
// sky from a time-of-day preset, tower lights at dusk and night, and fog density from weather.
#pragma once

#include "CoreMinimal.h"
#include "GameFramework/Actor.h"
#include "GridironTypes.h"
#include "GridironSequenceManager.h"
#include "GridironVenue.generated.h"

class UMaterialParameterCollection;

UCLASS(Blueprintable)
class GRIDIRONBRIDGE_API AGridironVenue : public AActor
{
	GENERATED_BODY()

public:
	AGridironVenue();
	virtual void BeginPlay() override;

	// Vector parameters HomePrimary/AwayPrimary and scalar CrowdDensity are written here.
	UPROPERTY(EditAnywhere, Category = "Gridiron") TSoftObjectPtr<UMaterialParameterCollection> TeamParameters = TSoftObjectPtr<UMaterialParameterCollection>(FSoftObjectPath(TEXT("/Game/Gridiron/Materials/MPC_Gridiron.MPC_Gridiron")));
	// Keyed by the protocol's timeOfDay (Afternoon, Dusk, Night).
	UPROPERTY(EditAnywhere, Category = "Gridiron") TMap<FString, FGridironLightingPreset> Lighting;
	// Lights tagged GridironStadiumLight switch on at this intensity (candela) for dusk and night.
	UPROPERTY(EditAnywhere, Category = "Gridiron") float TowerLightIntensity = 200000.f;
	// Fog density by weather; unlisted weather keeps the level's fog.
	UPROPERTY(EditAnywhere, Category = "Gridiron") TMap<FString, float> FogDensity;

	UFUNCTION(BlueprintCallable, Category = "Gridiron") void ApplyStadium(const FGridironStadium& Stadium);
	UFUNCTION(BlueprintImplementableEvent, Category = "Gridiron") void OnStadiumApplied(const FGridironStadium& Stadium);

private:
	UFUNCTION() void HandleStadium(const FGridironStadium& Stadium);
};
