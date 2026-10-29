#include "GridironBroadcastDirector.h"
#include "CineCameraActor.h"
#include "CineCameraComponent.h"
#include "Camera/CameraShakeBase.h"
#include "Camera/PlayerCameraManager.h"
#include "Kismet/GameplayStatics.h"
#include "Engine/World.h"
#include "EngineUtils.h"
#include "HAL/IConsoleManager.h"

// Console: Gridiron.Camera <Director|All22|OffenseFocus|DefenseFocus|Sideline|CableCam>
static FAutoConsoleCommandWithWorldAndArgs GGridironCameraCommand(
	TEXT("Gridiron.Camera"),
	TEXT("Switch the broadcast camera mode: Director, All22, OffenseFocus, DefenseFocus, Sideline or CableCam."),
	FConsoleCommandWithWorldAndArgsDelegate::CreateLambda([](const TArray<FString>& Args, UWorld* World)
	{
		const int64 Value = Args.Num() ? StaticEnum<EGridironCameraMode>()->GetValueByNameString(Args[0]) : INDEX_NONE;
		if (!World || Value == INDEX_NONE)
		{
			UE_LOG(LogGridiron, Warning, TEXT("Usage: Gridiron.Camera Director|All22|OffenseFocus|DefenseFocus|Sideline|CableCam"));
			return;
		}
		for (TActorIterator<AGridironBroadcastDirector> It(World); It; ++It) It->SetMode(static_cast<EGridironCameraMode>(Value));
		UE_LOG(LogGridiron, Log, TEXT("Camera mode %s"), *Args[0]);
	}));

static FGridironLens MakeLens(float FocalLength, float Aperture, float MoveSpeed)
{
	FGridironLens Lens;
	Lens.FocalLength = FocalLength;
	Lens.Aperture = Aperture;
	Lens.MoveSpeed = MoveSpeed;
	return Lens;
}

AGridironBroadcastDirector::AGridironBroadcastDirector()
{
	PrimaryActorTick.bCanEverTick = true;
	// After the match director has moved players and the ball.
	PrimaryActorTick.TickGroup = TG_PostUpdateWork;
	// Wide shots keep everything sharp; tight shots isolate the subject with shallow focus.
	Lenses.Add(EGridironShot::All22, MakeLens(24.f, 11.f, 2.5f));
	Lenses.Add(EGridironShot::OffenseFocus, MakeLens(28.f, 5.6f, 5.f));
	Lenses.Add(EGridironShot::DefenseFocus, MakeLens(35.f, 5.6f, 5.f));
	Lenses.Add(EGridironShot::SidelineWide, MakeLens(35.f, 8.f, 3.f));
	Lenses.Add(EGridironShot::SidelineTight, MakeLens(85.f, 2.8f, 6.f));
	Lenses.Add(EGridironShot::CableCam, MakeLens(30.f, 4.f, 7.f));
	Lenses.Add(EGridironShot::Impact, MakeLens(135.f, 2.0f, 9.f));
}

void AGridironBroadcastDirector::BeginPlay()
{
	Super::BeginPlay();
	for (const TPair<EGridironShot, FGridironLens>& Lens : Lenses)
	{
		ACineCameraActor* Cam = GetWorld()->SpawnActor<ACineCameraActor>(ACineCameraActor::StaticClass(), FieldOrigin);
		UCineCameraComponent* C = Cam->GetCineCameraComponent();
		C->FocusSettings.FocusMethod = ECameraFocusMethod::Manual;
		C->FocusSettings.bSmoothFocusChanges = true;
		C->FocusSettings.FocusSmoothingInterpSpeed = 6.f;
		C->CurrentFocalLength = Lens.Value.FocalLength;
		C->CurrentAperture = Lens.Value.Aperture;
		Rigs.Add(Lens.Key, Cam);
	}
	CutTo(EGridironShot::SidelineWide, true);
}

void AGridironBroadcastDirector::SetMode(EGridironCameraMode NewMode)
{
	Mode = NewMode;
	CutTo(ChooseShot(), false);
}

void AGridironBroadcastDirector::NotifySnap(const FGridironPlayCall& Call)
{
	Direction = Call.Direction >= 0 ? 1 : -1;
	PlayTime = -1.f;
	bLive = true;
	bHaveLos = false;
	ImpactUntil = -1.f;
}

void AGridironBroadcastDirector::UpdateFrame(float InPlayTime, const FVector& BallWorld, const FVector& BallVelocityWorld, const FVector& CarrierWorld, int32 InCarrier)
{
	PlayTime = InPlayTime;
	Ball = Local(BallWorld);
	BallVelocity = FieldOrigin.InverseTransformVectorNoScale(BallVelocityWorld);
	Carrier = Local(CarrierWorld);
	CarrierIndex = InCarrier;
	if (!bHaveLos)
	{
		// The quarterback holds the ball at the first sample; the line sits ~5 yd in front.
		LineOfScrimmage = FVector(Carrier.X + Direction * 457.f, 0.f, 0.f);
		bHaveLos = true;
	}
}

void AGridironBroadcastDirector::NotifyCollision(const FGridironCollision& Collision, const FVector& WorldLocation)
{
	if (!Collision.IsBig()) return;
	ImpactUntil = Clock + FMath::Max(ImpactHoldSeconds, MinShotSeconds);
	ShakeUntil = Clock + ImpactShakeSeconds;
	ShakeAmplitude = ImpactShakeCm * FMath::Clamp(Collision.Impulse / 500.f, 0.6f, 1.5f);
	if (ImpactShake)
		if (APlayerController* PC = UGameplayStatics::GetPlayerController(this, 0))
			PC->PlayerCameraManager->StartCameraShake(ImpactShake, FMath::Clamp(Collision.Impulse / 800.f, 0.4f, 1.5f));
}

void AGridironBroadcastDirector::NotifyPlayEnded()
{
	bLive = false;
}

EGridironShot AGridironBroadcastDirector::ChooseShot() const
{
	switch (Mode)
	{
	case EGridironCameraMode::All22: return EGridironShot::All22;
	case EGridironCameraMode::OffenseFocus: return EGridironShot::OffenseFocus;
	case EGridironCameraMode::DefenseFocus: return EGridironShot::DefenseFocus;
	case EGridironCameraMode::Sideline: return EGridironShot::SidelineWide;
	case EGridironCameraMode::CableCam: return EGridironShot::CableCam;
	default: break;
	}
	// Director: establish wide, chase the ball in the air, isolate the runner, punch in on impact.
	if (!bLive || PlayTime < 0.f) return EGridironShot::SidelineWide;
	if (Clock < ImpactUntil) return EGridironShot::Impact;
	const bool bInAir = CarrierIndex == 0 && Ball.Z > 230.f && PlayTime > 0.5f;
	if (bInAir) return EGridironShot::CableCam;
	if (PlayTime < 0.6f) return EGridironShot::OffenseFocus;
	if (CarrierIndex != 0) return EGridironShot::SidelineTight;
	return EGridironShot::SidelineWide;
}

void AGridironBroadcastDirector::ComputeRig(EGridironShot Which, FVector& Loc, FVector& Look) const
{
	const float D = Direction;
	const FVector Subject = CarrierIndex == 0 && Ball.Z > 230.f ? Ball : Carrier;
	switch (Which)
	{
	case EGridironShot::All22:
		Loc = FVector(LineOfScrimmage.X - D * 2600.f, 0.f, 2800.f);
		Look = FVector(LineOfScrimmage.X + D * 900.f, 0.f, 0.f);
		break;
	case EGridironShot::OffenseFocus:
		Loc = FVector(Carrier.X - D * 950.f, Carrier.Y * 0.3f, 330.f);
		Look = FVector(LineOfScrimmage.X + D * 1200.f, Carrier.Y * 0.5f, 120.f);
		break;
	case EGridironShot::DefenseFocus:
		Loc = FVector(LineOfScrimmage.X + D * 2300.f, 0.f, 650.f);
		Look = FVector(LineOfScrimmage.X, 0.f, 100.f);
		break;
	case EGridironShot::SidelineWide:
		Loc = FVector(Subject.X, -4300.f, 1500.f);
		Look = FVector(Subject.X + D * 300.f, Subject.Y * 0.4f, 0.f);
		break;
	case EGridironShot::SidelineTight:
	case EGridironShot::Impact:
		Loc = FVector(Subject.X - D * 150.f, -3600.f, 700.f);
		Look = FVector(Subject.X, Subject.Y, 110.f);
		break;
	case EGridironShot::CableCam:
	default:
		// Trail the ball and look where it is going.
		Loc = Ball - FVector(D * 1300.f, 0.f, 0.f) + FVector(0.f, 0.f, 950.f);
		Look = Ball + BallVelocity * 0.35f;
		break;
	}
}

void AGridironBroadcastDirector::CutTo(EGridironShot NewShot, bool bHardCut)
{
	ACineCameraActor* Cam = Rigs.FindRef(NewShot);
	if (!Cam) return;
	// Place the incoming rig on its mark before showing it, so a cut never reveals it travelling.
	FVector Loc, Look;
	ComputeRig(NewShot, Loc, Look);
	Cam->SetActorLocationAndRotation(World(Loc), (World(Look) - World(Loc)).Rotation());
	if (APlayerController* PC = UGameplayStatics::GetPlayerController(this, 0))
		PC->SetViewTargetWithBlend(Cam, bHardCut ? 0.f : CutBlendSeconds, VTBlend_EaseInOut, 2.f);
	UE_LOG(LogGridiron, Verbose, TEXT("Camera cut to %s at %.2f s"), *StaticEnum<EGridironShot>()->GetNameStringByValue(static_cast<int64>(NewShot)), Clock);
	Shot = NewShot;
	ShotAge = 0.f;
	OnShotChanged(NewShot);
}

void AGridironBroadcastDirector::Tick(float DeltaSeconds)
{
	Super::Tick(DeltaSeconds);
	Clock += DeltaSeconds;
	ShotAge += DeltaSeconds;

	const EGridironShot Want = ChooseShot();
	// Every Director cut obeys the minimum hold, impacts included: a late punch-in still shows the
	// player on the ground, and the rule keeps the edit from ever cutting twice inside a second.
	if (Want != Shot && (ShotAge >= MinShotSeconds || Mode != EGridironCameraMode::Director))
		CutTo(Want, Want == EGridironShot::Impact);

	ACineCameraActor* Cam = Rigs.FindRef(Shot);
	if (!Cam) return;
	const FGridironLens Lens = Lenses.FindRef(Shot);
	FVector Loc, Look;
	ComputeRig(Shot, Loc, Look);
	const FVector NewLoc = FMath::VInterpTo(Cam->GetActorLocation(), World(Loc), DeltaSeconds, Lens.MoveSpeed);
	const FRotator NewRot = FMath::RInterpTo(Cam->GetActorRotation(), (World(Look) - NewLoc).Rotation(), DeltaSeconds, Lens.MoveSpeed * 1.5f);
	Cam->SetActorLocationAndRotation(NewLoc, NewRot);

	// Procedural depth of field: keep the subject at the focal plane as distance changes.
	UCineCameraComponent* C = Cam->GetCineCameraComponent();
	C->FocusSettings.ManualFocusDistance = FVector::Dist(NewLoc, World(Look));
	C->CurrentFocalLength = FMath::FInterpTo(C->CurrentFocalLength, Lens.FocalLength, DeltaSeconds, 5.f);
	C->CurrentAperture = Lens.Aperture;
	// Impact shake on the camera component, so it never feeds back into the rig's smoothing.
	const float Shake = Clock < ShakeUntil ? ShakeAmplitude * (ShakeUntil - Clock) / ImpactShakeSeconds : 0.f;
	C->SetRelativeLocation(Shake > 0.f ? FMath::VRand() * Shake : FVector::ZeroVector);
}
