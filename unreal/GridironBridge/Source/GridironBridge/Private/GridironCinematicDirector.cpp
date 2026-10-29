#include "GridironCinematicDirector.h"
#include "GridironBridgeSubsystem.h"
#include "Engine/GameInstance.h"
#include "LevelSequence.h"
#include "LevelSequenceActor.h"
#include "LevelSequencePlayer.h"
#include "Engine/World.h"

void AGridironCinematicDirector::BeginPlay()
{
	Super::BeginPlay();
	if (UGridironBridgeSubsystem* Bridge = GetGameInstance()->GetSubsystem<UGridironBridgeSubsystem>())
		Bridge->OnCutscene.AddDynamic(this, &AGridironCinematicDirector::HandleCutscene);
}

void AGridironCinematicDirector::HandleCutscene(const FGridironCutscene& Cutscene)
{
	if (Player && Player->IsPlaying())
	{
		if (Cutscene.Priority <= Active.Priority)
		{
			Queue.Add(Cutscene);
			Queue.StableSort([](const FGridironCutscene& A, const FGridironCutscene& B) { return A.Priority > B.Priority; });
			return;
		}
		Finish(true);
	}
	PlayCutscene(Cutscene);
}

AActor* AGridironCinematicDirector::ResolveCast_Implementation(const FGridironCastMember& Member, const FGridironCutscene& Cutscene)
{
	return nullptr; // Blueprint override spawns or finds the performer.
}

void AGridironCinematicDirector::PlayCutscene(const FGridironCutscene& Cutscene)
{
	const TSoftObjectPtr<ULevelSequence>* Soft = Sequences.Find(Cutscene.Sequence);
	ULevelSequence* Sequence = Soft ? Soft->LoadSynchronous() : nullptr;
	if (!Sequence)
	{
		// Unknown sequence: acknowledge immediately so the game never waits on missing content.
		if (UGridironBridgeSubsystem* Bridge = GetGameInstance()->GetSubsystem<UGridironBridgeSubsystem>())
			Bridge->ReportCutsceneFinished(Cutscene.EventId, true);
		return;
	}
	Active = Cutscene;
	FMovieSceneSequencePlaybackSettings Settings;
	Settings.bDisableMovementInput = true;
	Settings.bDisableLookAtInput = true;
	ALevelSequenceActor* OutActor = nullptr;
	Player = ULevelSequencePlayer::CreateLevelSequencePlayer(GetWorld(), Sequence, Settings, OutActor);
	SequenceActor = OutActor;
	for (const FGridironCastMember& Member : Cutscene.Cast)
	{
		if (AActor* Performer = ResolveCast(Member, Cutscene))
			SequenceActor->SetBindingByTag(Member.Slot, { Performer });
	}
	Player->OnFinished.AddDynamic(this, &AGridironCinematicDirector::HandleFinished);
	Player->Play();
}

void AGridironCinematicDirector::Skip()
{
	if (Player && Player->IsPlaying() && Active.Skippable) Finish(true);
}

void AGridironCinematicDirector::HandleFinished()
{
	Finish(false);
}

void AGridironCinematicDirector::Finish(bool bSkipped)
{
	if (Player)
	{
		Player->OnFinished.RemoveAll(this);
		Player->Stop();
	}
	if (SequenceActor) SequenceActor->Destroy();
	Player = nullptr;
	SequenceActor = nullptr;
	if (UGridironBridgeSubsystem* Bridge = GetGameInstance()->GetSubsystem<UGridironBridgeSubsystem>())
		Bridge->ReportCutsceneFinished(Active.EventId, bSkipped);
	if (Queue.Num())
	{
		const FGridironCutscene Next = Queue[0];
		Queue.RemoveAt(0);
		PlayCutscene(Next);
	}
}
