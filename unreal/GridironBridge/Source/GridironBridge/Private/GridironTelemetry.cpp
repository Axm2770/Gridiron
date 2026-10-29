#include "GridironTelemetry.h"

void FGridironTelemetryBuffer::Reset(const FString& InPlayId)
{
	PlayId = InPlayId;
	Frames.Reset();
	bFinal = false;
}

void FGridironTelemetryBuffer::Push(const FGridironFrameChunk& Chunk)
{
	if (!PlayId.IsEmpty() && Chunk.PlayId != PlayId) return;
	if (PlayId.IsEmpty()) PlayId = Chunk.PlayId;
	for (const FGridironCoordinateFrame& Frame : Chunk.Frames)
	{
		// Chunks normally arrive in order; insertion keeps late or duplicate packets harmless.
		int32 At = Frames.Num();
		while (At > 0 && Frames[At - 1].T > Frame.T) --At;
		if (At > 0 && FMath::IsNearlyEqual(Frames[At - 1].T, Frame.T)) Frames[At - 1] = Frame;
		else Frames.Insert(Frame, At);
	}
	bFinal |= Chunk.Final;
}

FVector FGridironTelemetryBuffer::Hermite(const FVector& P0, const FVector& V0, const FVector& P1, const FVector& V1, float Dt, float U)
{
	const float U2 = U * U, U3 = U2 * U;
	const float H00 = 2 * U3 - 3 * U2 + 1, H10 = U3 - 2 * U2 + U, H01 = -2 * U3 + 3 * U2, H11 = U3 - U2;
	return H00 * P0 + H10 * Dt * V0 + H01 * P1 + H11 * Dt * V1;
}

bool FGridironTelemetryBuffer::Sample(float T, TArray<FGridironPlayerSample>& OutPlayers, FGridironBallSample& OutBall) const
{
	if (Frames.Num() == 0) return false;

	// Past the newest frame: dead-reckon from its velocities for a short window, then hold.
	if (T >= Frames.Last().T)
	{
		const FGridironCoordinateFrame& Last = Frames.Last();
		const float Ahead = bFinal ? 0.f : FMath::Min(T - Last.T, MaxExtrapolation);
		OutPlayers = Last.Players;
		for (FGridironPlayerSample& P : OutPlayers)
		{
			P.X += P.Vx * Ahead;
			P.Y += P.Vy * Ahead;
		}
		OutBall = Last.Ball;
		const FVector B = Last.Ball.Location() + Last.Ball.Velocity() * Ahead;
		OutBall.X = B.X; OutBall.Y = B.Y; OutBall.Z = FMath::Max(0.f, B.Z);
		return true;
	}
	if (T <= Frames[0].T)
	{
		OutPlayers = Frames[0].Players;
		OutBall = Frames[0].Ball;
		return true;
	}

	int32 Hi = 1;
	while (Hi < Frames.Num() - 1 && Frames[Hi].T < T) ++Hi;
	const FGridironCoordinateFrame& A = Frames[Hi - 1];
	const FGridironCoordinateFrame& B = Frames[Hi];
	const float Dt = FMath::Max(KINDA_SMALL_NUMBER, B.T - A.T);
	const float U = FMath::Clamp((T - A.T) / Dt, 0.f, 1.f);

	OutPlayers.SetNum(A.Players.Num());
	for (int32 i = 0; i < A.Players.Num() && i < B.Players.Num(); ++i)
	{
		const FGridironPlayerSample& PA = A.Players[i];
		const FGridironPlayerSample& PB = B.Players[i];
		const FVector P = Hermite(PA.Location(), PA.Velocity(), PB.Location(), PB.Velocity(), Dt, U);
		FGridironPlayerSample& Out = OutPlayers[i];
		Out = PA;
		Out.X = P.X; Out.Y = P.Y; Out.Z = P.Z;
		Out.Vx = FMath::Lerp(PA.Vx, PB.Vx, U);
		Out.Vy = FMath::Lerp(PA.Vy, PB.Vy, U);
		Out.Speed = FMath::Lerp(PA.Speed, PB.Speed, U);
		// Shortest-arc yaw blend so players never spin the long way round.
		Out.Yaw = PA.Yaw + FMath::FindDeltaAngleDegrees(PA.Yaw, PB.Yaw) * U;
	}

	const FVector Ball = Hermite(A.Ball.Location(), A.Ball.Velocity(), B.Ball.Location(), B.Ball.Velocity(), Dt, U);
	OutBall = U < 0.5f ? A.Ball : B.Ball;
	OutBall.X = Ball.X; OutBall.Y = Ball.Y; OutBall.Z = FMath::Max(0.f, Ball.Z);
	return true;
}
