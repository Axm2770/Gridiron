#include "GridironPlayDirector.h"
#include "GridironBridgeSubsystem.h"
#include "Animation/AnimInstance.h"
#include "Animation/AnimMontage.h"
#include "Components/SkeletalMeshComponent.h"
#include "Camera/CameraActor.h"
#include "EngineUtils.h"
#include "Kismet/GameplayStatics.h"

AGridironPlayerPawn::AGridironPlayerPawn()
{
	Mesh = CreateDefaultSubobject<USkeletalMeshComponent>(TEXT("Mesh"));
	RootComponent = Mesh;
}

AGridironPlayDirector::AGridironPlayDirector()
{
	PrimaryActorTick.bCanEverTick = true;
}

void AGridironPlayDirector::BeginPlay()
{
	Super::BeginPlay();
	if (UGridironBridgeSubsystem* Bridge = GetGameInstance()->GetSubsystem<UGridironBridgeSubsystem>())
		Bridge->OnPlay.AddDynamic(this, &AGridironPlayDirector::HandlePlay);
	// Pool of 22 pawns reused for every snap.
	for (int32 i = 0; i < 22 && PlayerClass; ++i)
	{
		Pawns.Add(GetWorld()->SpawnActor<AGridironPlayerPawn>(PlayerClass, FieldOrigin));
		Pawns.Last()->SetActorHiddenInGame(true);
	}
}

void AGridironPlayDirector::HandlePlay(const FGridironPlay& Play)
{
	PlayExecution(Play);
}

void AGridironPlayDirector::PlayExecution(const FGridironPlay& Play)
{
	Current = Play;
	Time = 0.f;
	NextShot = 0;
	bReplaying = false;
	const UGridironBridgeSubsystem* Bridge = GetGameInstance()->GetSubsystem<UGridironBridgeSubsystem>();
	for (int32 i = 0; i < Pawns.Num(); ++i)
	{
		const bool bUsed = Current.Actors.IsValidIndex(i);
		Pawns[i]->SetActorHiddenInGame(!bUsed);
		if (!bUsed) continue;
		Pawns[i]->Identity = Current.Actors[i];
		const int32 Team = Current.Actors[i].Side == TEXT("offense") ? Current.OffenseTeam : Current.DefenseTeam;
		const FLinearColor Color = Bridge && Bridge->TeamColors.IsValidIndex(Team) ? Bridge->TeamColors[Team] : FLinearColor::White;
		Pawns[i]->ApplyIdentity(Current.Actors[i], Color);
	}
	ApplyTime(0.f);
}

void AGridironPlayDirector::Replay()
{
	if (Current.Frames.Num() == 0) return;
	Time = 0.f;
	NextShot = 0;
	bReplaying = true;
}

void AGridironPlayDirector::Tick(float DeltaSeconds)
{
	Super::Tick(DeltaSeconds);
	if (Time < 0.f || Current.Frames.Num() == 0) return;
	const float Prev = Time;
	Time = FMath::Min(Time + DeltaSeconds, Current.Duration);
	ApplyTime(Time);
	FireTriggers(Prev, Time);

	while (Current.Camera.Shots.IsValidIndex(NextShot) && Current.Camera.Shots[NextShot].At <= Time)
	{
		const FGridironShot& Shot = Current.Camera.Shots[NextShot++];
		AActor* Follow = Shot.Follow == TEXT("ball") ? Ball.Get() : (Pawns.IsValidIndex(Current.Result.Carrier) ? Pawns[Current.Result.Carrier].Get() : nullptr);
		// Slow motion is a replay-only treatment so live pacing matches the game's clock.
		UGameplayStatics::SetGlobalTimeDilation(this, bReplaying && Shot.SlowMo > 0.f ? Shot.SlowMo : 1.f);
		CutToShot(Shot, Follow);
	}

	if (Time >= Current.Duration)
	{
		UGameplayStatics::SetGlobalTimeDilation(this, 1.f);
		Time = -1.f;
		if (!bReplaying && bAutoReplayBigPlays && Current.Camera.ReplayWorthy) { Replay(); return; }
		OnPlayFinished(Current.Result);
	}
}

void AGridironPlayDirector::ApplyTime(float T)
{
	const TArray<FGridironFrame>& F = Current.Frames;
	int32 Hi = 0;
	while (Hi < F.Num() - 1 && F[Hi].T < T) ++Hi;
	const int32 Lo = FMath::Max(0, Hi - 1);
	const float Span = FMath::Max(KINDA_SMALL_NUMBER, F[Hi].T - F[Lo].T);
	const float A = FMath::Clamp((T - F[Lo].T) / Span, 0.f, 1.f);
	const int32 Stride = FMath::Max(1, Current.FrameStride);

	for (int32 i = 0; i < Current.Actors.Num() && Pawns.IsValidIndex(i); ++i)
	{
		const int32 o = i * Stride;
		if (!F[Lo].Actors.IsValidIndex(o + 3) || !F[Hi].Actors.IsValidIndex(o + 3)) continue;
		const FVector P0(F[Lo].Actors[o], F[Lo].Actors[o + 1], 0.f), P1(F[Hi].Actors[o], F[Hi].Actors[o + 1], 0.f);
		// Slerp avoids the ±180° wrap a plain yaw lerp would spin through.
		const FQuat Q = FQuat::Slerp(FRotator(0.f, F[Lo].Actors[o + 2], 0.f).Quaternion(), FRotator(0.f, F[Hi].Actors[o + 2], 0.f).Quaternion(), A);
		Pawns[i]->SetActorLocationAndRotation(FieldOrigin.TransformPosition(FMath::Lerp(P0, P1, A)), FieldOrigin.TransformRotation(Q));
		Pawns[i]->Speed = FMath::Lerp((float)F[Lo].Actors[o + 3], (float)F[Hi].Actors[o + 3], A);
	}
	if (Ball)
		Ball->SetActorLocation(FieldOrigin.TransformPosition(FMath::Lerp(F[Lo].Ball.ToVector(), F[Hi].Ball.ToVector(), A)));
}

void AGridironPlayDirector::FireTriggers(float From, float To)
{
	if (!AnimSet) return;
	for (const FGridironTrigger& Trig : Current.Triggers)
	{
		if (Trig.T <= From || Trig.T > To || !Pawns.IsValidIndex(Trig.Actor)) continue;
		if (const TObjectPtr<UAnimMontage>* Montage = AnimSet->Montages.Find(Trig.Montage))
		{
			if (UAnimInstance* Anim = Pawns[Trig.Actor]->Mesh->GetAnimInstance()) Anim->Montage_Play(*Montage);
		}
		if (Pawns.IsValidIndex(Trig.Partner))
		{
			// Tackle pairs: the ball carrier plays the matching "_Recv" reaction if authored.
			const FName Recv(*(Trig.Montage.ToString() + TEXT("_Recv")));
			if (const TObjectPtr<UAnimMontage>* Reaction = AnimSet->Montages.Find(Recv))
				if (UAnimInstance* Anim = Pawns[Trig.Partner]->Mesh->GetAnimInstance()) Anim->Montage_Play(*Reaction);
		}
	}
}

void AGridironPlayDirector::CutToShot_Implementation(const FGridironShot& Shot, AActor* FollowTarget)
{
	// Default routing: a CameraActor in the level tagged with the rig name (e.g. CR_SkyCam_Follow).
	APlayerController* PC = UGameplayStatics::GetPlayerController(this, 0);
	if (!PC) return;
	for (TActorIterator<ACameraActor> It(GetWorld()); It; ++It)
	{
		if (!It->ActorHasTag(Shot.Rig)) continue;
		PC->SetViewTargetWithBlend(*It, Shot.Blend);
		return;
	}
}
