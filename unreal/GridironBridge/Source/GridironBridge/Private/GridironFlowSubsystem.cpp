#include "GridironFlowSubsystem.h"
#include "GridironBridgeSubsystem.h"
#include "GridironSequenceManager.h"
#include "GridironMatchDirector.h"
#include "Engine/AssetManager.h"
#include "Engine/StreamableManager.h"
#include "Engine/LevelStreamingDynamic.h"
#include "Engine/GameInstance.h"
#include "Engine/World.h"
#include "Camera/PlayerCameraManager.h"
#include "Kismet/GameplayStatics.h"
#include "EngineUtils.h"
#include "TimerManager.h"
#include "Engine/Engine.h"

void UGridironFlowSubsystem::Initialize(FSubsystemCollectionBase& Collection)
{
	Collection.InitializeDependency<UGridironBridgeSubsystem>();
	Super::Initialize(Collection);
	if (UGridironBridgeSubsystem* Bridge = GetGameInstance()->GetSubsystem<UGridironBridgeSubsystem>())
	{
		Bridge->OnMatchState.AddDynamic(this, &UGridironFlowSubsystem::HandleMatchState);
		Bridge->OnCinematic.AddDynamic(this, &UGridironFlowSubsystem::HandleCinematic);
	}
}

EGridironFlowState UGridironFlowSubsystem::Parse(const FString& Name)
{
	const int64 Value = StaticEnum<EGridironFlowState>()->GetValueByNameString(Name);
	return Value == INDEX_NONE ? EGridironFlowState::Hub : static_cast<EGridironFlowState>(Value);
}

EGridironFlowState UGridironFlowSubsystem::NextState(EGridironFlowState Current, EGridironFlowState Game, bool bAssetsReady)
{
	using S = EGridironFlowState;
	const bool bInMatch = Game == S::PreGame || Game == S::Live || Game == S::Halftime || Game == S::PostGame;
	switch (Current)
	{
	case S::Hub: return bInMatch ? S::LoadingMatch : S::Hub;
	case S::LoadingMatch: return Game == S::Hub ? S::Returning : bAssetsReady ? S::PreGame : S::LoadingMatch;
	case S::PreGame: return Game == S::Hub ? S::Returning : S::PreGame; // leaves when the intro finishes
	case S::Celebration: return S::Celebration;                        // leaves when the cinematic finishes
	case S::Live:
	case S::Halftime:
	case S::PostGame:
		if (Game == S::Hub) return S::Returning;
		return (Game == S::Live || Game == S::Halftime || Game == S::PostGame) ? Game : Current;
	case S::Returning: return S::Returning;
	default: return Current;
	}
}

void UGridironFlowSubsystem::SetState(EGridironFlowState NewState)
{
	if (NewState == State) return;
	const EGridironFlowState From = State;
	State = NewState;
	if (UGridironBridgeSubsystem* Bridge = GetGameInstance()->GetSubsystem<UGridironBridgeSubsystem>()) Bridge->ReportFlowState(NewState);
	OnFlowChanged.Broadcast(From, NewState);
}

void UGridironFlowSubsystem::HandleMatchState(const FGridironMatchState& InMatch)
{
	const EGridironFlowState Game = Parse(InMatch.State);
	if (Game != EGridironFlowState::Hub) Match = InMatch;
	Pending = Game;
	const EGridironFlowState Next = NextState(State, Game, false);
	if (Next == State) return;
	if (Next == EGridironFlowState::LoadingMatch) BeginLoading(InMatch);
	else if (Next == EGridironFlowState::Returning) BeginReturn();
	else SetState(Next);
}

void UGridironFlowSubsystem::BeginLoading(const FGridironMatchState& InMatch)
{
	SetState(EGridironFlowState::LoadingMatch);
	Fade(true);
	UWorld* World = GetGameInstance()->GetWorld();
	if (!World || !Config)
	{
		// No content configured: still advance so the bridge keeps working with placeholder art.
		bStadiumShown = true;
		PendingLoads = 0;
		TryEnterPreGame();
		return;
	}

	// 1) Stadium as a streamed level instance (async; OnLevelShown fires when visible).
	TSoftObjectPtr<UWorld> Stadium = Config->DefaultStadium;
	for (const FString& Key : InMatch.Preload)
		if (const TSoftObjectPtr<UWorld>* Found = Config->Stadiums.Find(Key)) Stadium = *Found;
	bStadiumShown = Stadium.IsNull();
	if (!Stadium.IsNull())
	{
		bool bOk = false;
		StadiumLevel = ULevelStreamingDynamic::LoadLevelInstanceBySoftObjectPtr(World, Stadium, FVector::ZeroVector, FRotator::ZeroRotator, bOk);
		if (bOk && StadiumLevel) StadiumLevel->OnLevelShown.AddDynamic(this, &UGridironFlowSubsystem::HandleStadiumShown);
		else bStadiumShown = true;
	}

	// 2) Uniform / performer sets named by the preload hints. Already-resident sets complete
	//    synchronously, so hold the PreGame check until every request has been issued.
	PendingLoads = 0;
	bIssuingLoads = true;
	for (const FString& Key : InMatch.Preload)
	{
		const FGridironPreloadSet* Set = Config->PreloadSets.Find(Key);
		if (!Set || Set->Assets.Num() == 0) continue;
		TArray<FSoftObjectPath> Paths;
		for (const TSoftObjectPtr<UObject>& Asset : Set->Assets) Paths.Add(Asset.ToSoftObjectPath());
		++PendingLoads;
		TWeakObjectPtr<UGridironFlowSubsystem> Weak(this);
		PreloadHandles.Add(UAssetManager::GetStreamableManager().RequestAsyncLoad(Paths, FStreamableDelegate::CreateLambda([Weak]()
		{
			if (!Weak.IsValid()) return;
			--Weak->PendingLoads;
			Weak->TryEnterPreGame();
		})));
	}
	bIssuingLoads = false;
	TryEnterPreGame();
}

void UGridironFlowSubsystem::HandleStadiumShown()
{
	bStadiumShown = true;
	TryEnterPreGame();
}

void UGridironFlowSubsystem::TryEnterPreGame()
{
	if (State != EGridironFlowState::LoadingMatch || bIssuingLoads || !bStadiumShown || PendingLoads > 0) return;
	SetState(EGridironFlowState::PreGame);
	Fade(false);
	// Intro walkout; when it ends NotifyCinematicFinished moves on to whatever the game reached.
	UWorld* World = GetGameInstance()->GetWorld();
	UGridironSequenceManager* Sequences = World ? World->GetSubsystem<UGridironSequenceManager>() : nullptr;
	if (!Sequences || !Config)
	{
		SetState(Pending == EGridironFlowState::PreGame ? EGridironFlowState::Live : Pending);
		return;
	}
	FGridironCinematic Intro;
	Intro.EventId = TEXT("intro-") + Match.MatchId;
	Intro.Kind = TEXT("Intro");
	Intro.Template = Config->IntroTemplate;
	Intro.Priority = 90;
	Intro.Skippable = true;
	Intro.Blocking = true;
	Intro.Teams.Home = Match.Home;
	Intro.Teams.Away = Match.Away;
	Intro.Environment.Weather = Match.Weather;
	Intro.Environment.TimeOfDay = TEXT("Afternoon");
	Sequences->Play(Intro);
}

void UGridironFlowSubsystem::HandleCinematic(const FGridironCinematic& Cinematic)
{
	if (!Cinematic.Blocking) return;
	if (State == EGridironFlowState::Live || State == EGridironFlowState::Halftime || State == EGridironFlowState::PostGame)
	{
		Pending = State;
		SetState(EGridironFlowState::Celebration);
	}
}

void UGridironFlowSubsystem::NotifyCinematicFinished(const FGridironCinematic& Cinematic)
{
	if (State != EGridironFlowState::PreGame && State != EGridironFlowState::Celebration) return;
	const EGridironFlowState Back = Pending == EGridironFlowState::PreGame || Pending == EGridironFlowState::Hub ? EGridironFlowState::Live : Pending;
	if (Pending == EGridironFlowState::Hub) BeginReturn();
	else SetState(Back);
	ReleaseHold();
}

void UGridironFlowSubsystem::ReleaseHold()
{
	if (UWorld* World = GetGameInstance()->GetWorld())
		for (TActorIterator<AGridironMatchDirector> It(World); It; ++It) It->SetHeld(false);
}

void UGridironFlowSubsystem::BeginReturn()
{
	SetState(EGridironFlowState::Returning);
	Fade(true);
	// Unload asynchronously under the fade, drop preload references, then collect garbage once
	// we are back in the hub (never mid-match).
	if (StadiumLevel) StadiumLevel->SetIsRequestingUnloadAndRemoval(true);
	StadiumLevel = nullptr;
	for (TSharedPtr<FStreamableHandle>& Handle : PreloadHandles) if (Handle.IsValid()) Handle->ReleaseHandle();
	PreloadHandles.Reset();
	PendingLoads = 0;
	if (UWorld* World = GetGameInstance()->GetWorld())
	{
		FTimerHandle Timer;
		const float Delay = Config ? Config->FadeSeconds : 0.6f;
		World->GetTimerManager().SetTimer(Timer, FTimerDelegate::CreateWeakLambda(this, [this]()
		{
			SetState(EGridironFlowState::Hub);
			Fade(false);
			GEngine->ForceGarbageCollection(true);
		}), Delay, false);
	}
	else SetState(EGridironFlowState::Hub);
}

void UGridironFlowSubsystem::Fade(bool bToBlack)
{
	const float Seconds = Config ? Config->FadeSeconds : 0.6f;
	if (APlayerController* PC = UGameplayStatics::GetPlayerController(GetGameInstance()->GetWorld(), 0))
		PC->PlayerCameraManager->StartCameraFade(bToBlack ? 0.f : 1.f, bToBlack ? 1.f : 0.f, Seconds, FLinearColor::Black, true, bToBlack);
}
