// Buffered telemetry for one play. Frames arrive in chunks at ~10 Hz; the renderer samples at
// display rate a fixed delay behind the newest frame, interpolating with cubic Hermite curves
// (positions + velocities) and dead-reckoning briefly if the stream stalls.
#pragma once

#include "CoreMinimal.h"
#include "GridironTypes.h"

struct GRIDIRONBRIDGE_API FGridironTelemetryBuffer
{
	FString PlayId;
	TArray<FGridironCoordinateFrame> Frames;
	bool bFinal = false;
	// How far past the newest frame we will extrapolate before holding position (seconds).
	float MaxExtrapolation = 0.15f;

	void Reset(const FString& InPlayId);
	// Ignores chunks for other plays; keeps frames ordered and de-duplicated by time.
	void Push(const FGridironFrameChunk& Chunk);
	bool IsEmpty() const { return Frames.Num() == 0; }
	float NewestTime() const { return Frames.Num() ? Frames.Last().T : 0.f; }
	// Samples all players and the ball at play time T (seconds since the snap).
	bool Sample(float T, TArray<FGridironPlayerSample>& OutPlayers, FGridironBallSample& OutBall) const;

	static FVector Hermite(const FVector& P0, const FVector& V0, const FVector& P1, const FVector& V1, float Dt, float U);
};
