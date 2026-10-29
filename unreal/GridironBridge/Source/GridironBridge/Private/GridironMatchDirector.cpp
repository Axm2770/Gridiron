#include "GridironMatchDirector.h"
#include "GridironAthlete.h"
#include "GridironBroadcastDirector.h"
#include "GridironBridgeSubsystem.h"
#include "Engine/GameInstance.h"
#include "Engine/World.h"

AGridironMatchDirector::AGridironMatchDirector()
{
	PrimaryActorTick.bCanEverTick = true;
	// Tick before athletes and cameras so they see this frame's samples.
	PrimaryActorTick.TickGroup = TG_PrePhysics;
}

void AGridironMatchDirector::BeginPlay()
{
	Super::BeginPlay();
	if (UGridironBridgeSubsystem* Bridge = GetGameInstance()->GetSubsystem<UGridironBridgeSubsystem>())
	{
		Bridge->OnPlayCall.AddDynamic(this, &AGridironMatchDirector::HandlePlayCall);
		Bridge->OnFrames.AddDynamic(this, &AGridironMatchDirector::HandleFrames);
		Bridge->OnCollision.AddDynamic(this, &AGridironMatchDirector::HandleCollision);
		Bridge->OnCinematic.AddDynamic(this, &AGridironMatchDirector::HandleCinematic);
	}
	// Pool all 22 athletes up front: no spawning (and no hitches) during live play.
	FActorSpawnParameters Params;
	Params.SpawnCollisionHandlingOverride = ESpawnActorCollisionHandlingMethod::AlwaysSpawn;
	for (int32 i = 0; i < 22 && AthleteClass; ++i)
	{
		AGridironAthlete* Athlete = GetWorld()->SpawnActor<AGridironAthlete>(AthleteClass, FieldOrigin, Params);
		Athlete->SetActorHiddenInGame(true);
		Athletes.Add(Athlete);
	}
}

AGridironAthlete* AGridironMatchDirector::GetAthlete(int32 Index) const
{
	return Athletes.IsValidIndex(Index) ? Athletes[Index].Get() : nullptr;
}

void AGridironMatchDirector::SetHeld(bool bInHeld)
{
	bHeld = bInHeld;
}

void AGridironMatchDirector::HandlePlayCall(const FGridironPlayCall& Call)
{
	PlayCall = Call;
	Buffer.Reset(Call.PlayId);
	PendingCollisions.Reset();
	PlaybackTime = -SnapLeadIn;
	bPlaying = false;
	bFinishedNotified = false;

	const UGridironBridgeSubsystem* Bridge = GetGameInstance()->GetSubsystem<UGridironBridgeSubsystem>();
	for (const FGridironRosterEntry& Entry : Call.Roster)
	{
		AGridironAthlete* Athlete = GetAthlete(Entry.Index);
		if (!Athlete) continue;
		const FLinearColor Color = Bridge && Bridge->TeamColors.IsValidIndex(Entry.Team) ? Bridge->TeamColors[Entry.Team] : FLinearColor::White;
		Athlete->Configure(Entry, Color);
		Athlete->SetActorHiddenInGame(false);
	}
	if (Broadcast) Broadcast->NotifySnap(Call);
	OnSnap(Call);
}

void AGridironMatchDirector::HandleFrames(const FGridironFrameChunk& Chunk)
{
	if (Chunk.PlayId != PlayCall.PlayId) return; // stale or out-of-order play
	Buffer.Push(Chunk);
	bPlaying = true;
}

void AGridironMatchDirector::HandleCollision(const FGridironCollision& Collision)
{
	if (Collision.PlayId != PlayCall.PlayId) return;
	const int32 At = PendingCollisions.IndexOfByPredicate([&](const FGridironCollision& C) { return C.T > Collision.T; });
	PendingCollisions.Insert(Collision, At == INDEX_NONE ? PendingCollisions.Num() : At);
}

void AGridironMatchDirector::HandleCinematic(const FGridironCinematic& Cinematic)
{
	// Blocking cinematics (title, draft night) freeze the field; the flow subsystem releases it.
	if (Cinematic.Blocking) SetHeld(true);
}

void AGridironMatchDirector::Tick(float DeltaSeconds)
{
	Super::Tick(DeltaSeconds);
	if (!bPlaying || bHeld || Buffer.IsEmpty()) return;

	PlaybackTime += DeltaSeconds;
	const float T = PlaybackTime - RenderDelay;
	if (T < 0.f) return;

	FGridironBallSample BallSample;
	if (!Buffer.Sample(T, Samples, BallSample)) return;

	for (const FGridironPlayerSample& S : Samples)
	{
		if (AGridironAthlete* Athlete = GetAthlete(S.Index))
			Athlete->ApplySample(ToWorld(S.Location()), ToWorldYaw(S.Yaw), ToWorldDir(S.Velocity()), S.Index == BallSample.Carrier, DeltaSeconds);
	}
	const FVector BallWorld = ToWorld(BallSample.Location());
	if (Ball) Ball->SetActorLocation(BallWorld);

	// Fire every collision whose time has come, on both participants.
	while (PendingCollisions.Num() && PendingCollisions[0].T <= T)
	{
		const FGridironCollision C = PendingCollisions[0];
		PendingCollisions.RemoveAt(0);
		const FVector Where = ToWorld(FVector(C.Location.X, C.Location.Y, C.Location.Z));
		const FVector Normal = ToWorldDir(C.Normal).GetSafeNormal();
		if (AGridironAthlete* Target = GetAthlete(C.Target)) Target->ReceiveCollision(C, Where, Normal, true);
		if (AGridironAthlete* By = GetAthlete(C.Instigator)) By->ReceiveCollision(C, Where, Normal, false);
		if (Broadcast) Broadcast->NotifyCollision(C, Where);
	}

	if (Broadcast)
	{
		const AGridironAthlete* Carrier = GetAthlete(BallSample.Carrier);
		Broadcast->UpdateFrame(T, BallWorld, ToWorldDir(BallSample.Velocity()), Carrier ? Carrier->GetActorLocation() : BallWorld, BallSample.Carrier);
	}

	if (!bFinishedNotified && Buffer.bFinal && T > FMath::Max(Buffer.NewestTime(), PlayCall.Duration) + 0.5f)
	{
		bFinishedNotified = true;
		bPlaying = false;
		if (Broadcast) Broadcast->NotifyPlayEnded();
		OnPlayFinished(PlayCall);
	}
}
