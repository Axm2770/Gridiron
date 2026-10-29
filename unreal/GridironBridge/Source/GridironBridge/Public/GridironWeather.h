// Code-driven precipitation without Niagara assets: instanced streaks (rain) or flakes (snow)
// scattered through a box that follows the active camera. The material (M_Weather) makes them
// fall and wrap around the box with World Position Offset (resting positions in per-instance custom
// data), so there is no per-particle CPU work after a weather change. AGridironVenue switches it from stadium.state's weather.
#pragma once

#include "CoreMinimal.h"
#include "GameFramework/Actor.h"
#include "GridironWeather.generated.h"

class UHierarchicalInstancedStaticMeshComponent;
class UMaterialInterface;
class UMaterialInstanceDynamic;

UCLASS(Blueprintable)
class GRIDIRONBRIDGE_API AGridironWeather : public AActor
{
	GENERATED_BODY()

public:
	AGridironWeather();
	virtual void BeginPlay() override;
	virtual void Tick(float DeltaSeconds) override;

	UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "Gridiron") TObjectPtr<UHierarchicalInstancedStaticMeshComponent> Particles;
	UPROPERTY(EditAnywhere, Category = "Gridiron") TSoftObjectPtr<UMaterialInterface> Material = TSoftObjectPtr<UMaterialInterface>(FSoftObjectPath(TEXT("/Game/Gridiron/Materials/M_Weather.M_Weather")));
	// Size of the box in front of the camera (cm); the material wraps particles within it.
	UPROPERTY(EditAnywhere, Category = "Gridiron") FVector BoxSize = FVector(3000.f, 3000.f, 2000.f);
	UPROPERTY(EditAnywhere, Category = "Gridiron") int32 RainCount = 12000;
	UPROPERTY(EditAnywhere, Category = "Gridiron") int32 SnowCount = 9000;

	// "Rain", "Snow" or anything else (clear: hidden).
	UFUNCTION(BlueprintCallable, Category = "Gridiron") void SetWeather(const FString& Weather);
	UFUNCTION(BlueprintPure, Category = "Gridiron") FString GetWeather() const { return Current; }

private:
	void Scatter(int32 Count, const FVector& ParticleScale);
	UPROPERTY() TObjectPtr<UMaterialInstanceDynamic> Mid;
	FString Current;
};
