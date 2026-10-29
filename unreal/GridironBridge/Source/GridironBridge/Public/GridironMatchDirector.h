// Consumes the telemetry stream for the live match: buffers frames, runs a playback clock a
// fixed render delay behind the newest sample, drives the 22 athletes and the ball, fires
// collisions on time, and feeds the broadcast camera director. Blocking cinematics pause it.
#pragma once

#include "CoreMinimal.h"
#include "GameFramework/Actor.h"
#include "GridironTypes.h"
#include "GridironTelemetry.h"
#include "GridironMatchDirector.generated.h"

class AGridironAthlete;
class AGridironBroadcastDirector;

UCLASS(Blueprintable)
class GRIDIRONBRIDGE_API AGridironMatchDirector : public AActor
{
	GENERATED_BODY()

public:
	AGridironMatchDirector();
	virtual void BeginPlay() override;
	virtual void Tick(float DeltaSeconds) override;

	UPROPERTY(EditAnywhere, Category = "Gridiron") TSubclassOf<AGridironAthlete> AthleteClass;
	UPROPERTY(EditAnywhere, Category = "Gridiron") TObjectPtr<AActor> Ball;
	UPROPERTY(EditAnywhere, Category = "Gridiron") TObjectPtr<AGridironBroadcastDirector> Broadcast;
	// Midfield at ground level. Telemetry is relative to this transform.
	UPROPERTY(EditAnywhere, Category = "Gridiron") FTransform FieldOrigin;
	// Delay behind the newest sample. ~1 frame interval (100 ms) plus jitter margin.
	UPROPERTY(EditAnywhere, Category = "Gridiron") float RenderDelay = 0.12f;
	// Pre-snap hold before the first sample plays, so the camera can settle.
	UPROPERTY(EditAnywhere, Category = "Gridiron") float SnapLeadIn = 0.4f;

	UFUNCTION(BlueprintCallable, Category = "Gridiron") void SetHeld(bool bHeld);
	UFUNCTION(BlueprintPure, Category = "Gridiron") bool IsPlaying() const { return bPlaying; }
	UFUNCTION(BlueprintPure, Category = "Gridiron") float GetPlayTime() const { return PlaybackTime - RenderDelay; }
	UFUNCTION(BlueprintPure, Category = "Gridiron") AGridironAthlete* GetAthlete(int32 Index) const;
	UFUNCTION(BlueprintPure, Category = "Gridiron") const FGridironPlayCall& GetPlayCall() const { return PlayCall; }

	UFUNCTION(BlueprintImplementableEvent, Category = "Gridiron") void OnSnap(const FGridironPlayCall& Call);
	UFUNCTION(BlueprintImplementableEvent, Category = "Gridiron") void OnPlayFinished(const FGridironPlayCall& Call);

private:
	UFUNCTION() void HandlePlayCall(const FGridironPlayCall& Call);
	UFUNCTION() void HandleFrames(const FGridironFrameChunk& Chunk);
	UFUNCTION() void HandleCollision(const FGridironCollision& Collision);
	UFUNCTION() void HandleCinematic(const FGridironCinematic& Cinematic);

	FVector ToWorld(const FVector& Field) const { return FieldOrigin.TransformPosition(Field); }
	FVector ToWorldDir(const FVector& Field) const { return FieldOrigin.TransformVectorNoScale(Field); }
	float ToWorldYaw(float Yaw) const { return FieldOrigin.GetRotation().Rotator().Yaw + Yaw; }

	UPROPERTY() TArray<TObjectPtr<AGridironAthlete>> Athletes;
	FGridironTelemetryBuffer Buffer;
	FGridironPlayCall PlayCall;
	TArray<FGridironCollision> PendingCollisions;
	TArray<FGridironPlayerSample> Samples;
	float PlaybackTime = 0.f;
	bool bPlaying = false;
	bool bHeld = false;
	bool bFinishedNotified = false;
};
