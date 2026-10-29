#include "GridironSequenceManager.h"
#include "GridironBridgeSubsystem.h"
#include "GridironFlowSubsystem.h"
#include "LevelSequence.h"
#include "LevelSequenceActor.h"
#include "LevelSequencePlayer.h"
#include "Engine/AssetManager.h"
#include "Engine/StreamableManager.h"
#include "Engine/DirectionalLight.h"
#include "Engine/SkyLight.h"
#include "Components/LightComponent.h"
#include "Components/SkyLightComponent.h"
#include "Materials/MaterialParameterCollection.h"
#include "Kismet/KismetMaterialLibrary.h"
#include "EngineUtils.h"

void UGridironSequenceManager::OnWorldBeginPlay(UWorld& InWorld)
{
	Super::OnWorldBeginPlay(InWorld);
	if (UGameInstance* GI = InWorld.GetGameInstance())
		if (UGridironBridgeSubsystem* Bridge = GI->GetSubsystem<UGridironBridgeSubsystem>())
			Bridge->OnCinematic.AddDynamic(this, &UGridironSequenceManager::HandleTrigger);
}

void UGridironSequenceManager::HandleTrigger(const FGridironCinematic& Cinematic)
{
	Play(Cinematic);
}

void UGridironSequenceManager::Play(const FGridironCinematic& Cinematic)
{
	if (bActive)
	{
		if (Cinematic.Priority <= Active.Priority)
		{
			Queue.Add(Cinematic);
			Queue.StableSort([](const FGridironCinematic& A, const FGridironCinematic& B) { return A.Priority > B.Priority; });
			return;
		}
		Finish(true, false); // a bigger moment interrupts (title beats a sideline reaction)
	}
	Active = Cinematic;
	bActive = true;
	Load();
}

void UGridironSequenceManager::Load()
{
	const FGridironCinematicTemplate* Template = Library ? Library->Templates.Find(Active.Template) : nullptr;
	if (!Template)
	{
		// Missing content must never stall the game's flow.
		Finish(true);
		return;
	}
	// Everything the sequence needs streams in asynchronously; nothing loads on the game thread.
	TArray<FSoftObjectPath> Paths = { Template->Sequence.ToSoftObjectPath() };
	if (!Template->DefaultPerformer.IsNull()) Paths.Add(Template->DefaultPerformer.ToSoftObjectPath());
	for (const TPair<FName, TSoftClassPtr<AActor>>& Pair : Template->PerformerClasses) Paths.Add(Pair.Value.ToSoftObjectPath());
	if (const TSoftClassPtr<AActor>* Weather = Library->Weather.Find(Active.Environment.Weather)) Paths.Add(Weather->ToSoftObjectPath());
	if (!Library->TeamParameters.IsNull()) Paths.Add(Library->TeamParameters.ToSoftObjectPath());
	LoadHandle = UAssetManager::GetStreamableManager().RequestAsyncLoad(Paths, FStreamableDelegate::CreateUObject(this, &UGridironSequenceManager::Stage));
}

void UGridironSequenceManager::ApplyEnvironment(const FGridironEnvironment& Environment, const FGridironTeams& Teams)
{
	UWorld* World = GetWorld();
	if (!World || !Library) return;
	if (const FGridironLightingPreset* Light = Library->Lighting.Find(Environment.TimeOfDay))
	{
		for (TActorIterator<ADirectionalLight> It(World); It; ++It)
		{
			if (!It->ActorHasTag(TEXT("GridironSun"))) continue;
			It->GetLightComponent()->SetIntensity(Light->SunIntensity);
			It->GetLightComponent()->SetLightColor(Light->SunColor);
			It->SetActorRotation(FRotator(Light->SunPitch, It->GetActorRotation().Yaw, 0.f));
		}
		for (TActorIterator<ASkyLight> It(World); It; ++It)
		{
			if (!It->ActorHasTag(TEXT("GridironSky"))) continue;
			It->GetLightComponent()->SetIntensity(Light->SkyIntensity);
			It->GetLightComponent()->RecaptureSky();
		}
	}
	if (UMaterialParameterCollection* Params = Library->TeamParameters.Get())
	{
		UKismetMaterialLibrary::SetVectorParameterValue(World, Params, TEXT("HomePrimary"), GridironColor::FromHex(Teams.Home.Colors.Primary));
		UKismetMaterialLibrary::SetVectorParameterValue(World, Params, TEXT("HomeSecondary"), GridironColor::FromHex(Teams.Home.Colors.Secondary));
		UKismetMaterialLibrary::SetVectorParameterValue(World, Params, TEXT("AwayPrimary"), GridironColor::FromHex(Teams.Away.Colors.Primary));
		UKismetMaterialLibrary::SetVectorParameterValue(World, Params, TEXT("AwaySecondary"), GridironColor::FromHex(Teams.Away.Colors.Secondary));
		UKismetMaterialLibrary::SetScalarParameterValue(World, Params, TEXT("CrowdDensity"), Environment.Crowd / 100.f);
	}
}

void UGridironSequenceManager::Stage()
{
	UWorld* World = GetWorld();
	const FGridironCinematicTemplate* Template = Library ? Library->Templates.Find(Active.Template) : nullptr;
	ULevelSequence* Sequence = Template ? Template->Sequence.Get() : nullptr;
	if (!World || !Sequence)
	{
		Finish(true);
		return;
	}

	ApplyEnvironment(Active.Environment, Active.Teams);
	if (const TSoftClassPtr<AActor>* WeatherClass = Library->Weather.Find(Active.Environment.Weather))
		if (UClass* Class = WeatherClass->Get()) Spawned.Add(World->SpawnActor<AActor>(Class, FTransform::Identity));

	FMovieSceneSequencePlaybackSettings Settings;
	Settings.bDisableMovementInput = true;
	Settings.bDisableLookAtInput = true;
	ALevelSequenceActor* OutActor = nullptr;
	Player = ULevelSequencePlayer::CreateLevelSequencePlayer(World, Sequence, Settings, OutActor);
	SequenceActor = OutActor;

	// Spawn each performer, give it its identity, and bind it to the sequence track tagged with
	// the slot name. Templates are authored once; every team and player reuses them.
	for (const FGridironPerformer& Performer : Active.Cast)
	{
		const TSoftClassPtr<AActor>* Soft = Template->PerformerClasses.Find(Performer.Slot);
		UClass* Class = Soft && Soft->Get() ? Soft->Get() : Template->DefaultPerformer.Get();
		if (!Class) continue;
		AActor* Actor = World->SpawnActor<AActor>(Class, FTransform::Identity);
		if (!Actor) continue;
		Spawned.Add(Actor);
		const FGridironTeamLook& Team = Performer.Team == Active.Teams.Away.Id ? Active.Teams.Away : Active.Teams.Home;
		if (Actor->GetClass()->ImplementsInterface(UGridironPerformerInterface::StaticClass()))
			IGridironPerformerInterface::Execute_ApplyPerformer(Actor, Performer, Team);
		SequenceActor->SetBindingByTag(Performer.Slot, { Actor });
	}

	Player->OnFinished.AddDynamic(this, &UGridironSequenceManager::HandleSequenceFinished);
	OnCinematicStarted.Broadcast(Active);
	Player->Play();
}

void UGridironSequenceManager::Skip()
{
	if (bActive && Active.Skippable) Finish(true);
}

void UGridironSequenceManager::HandleSequenceFinished()
{
	Finish(false);
}

void UGridironSequenceManager::Finish(bool bSkipped, bool bPlayNext)
{
	if (Player)
	{
		Player->OnFinished.RemoveAll(this);
		Player->Stop();
	}
	if (SequenceActor) SequenceActor->Destroy();
	for (AActor* Actor : Spawned) if (Actor) Actor->Destroy();
	Spawned.Reset();
	Player = nullptr;
	SequenceActor = nullptr;
	if (LoadHandle.IsValid()) LoadHandle->ReleaseHandle();
	LoadHandle.Reset();

	const FGridironCinematic Done = Active;
	bActive = false;
	if (UGameInstance* GI = GetWorld() ? GetWorld()->GetGameInstance() : nullptr)
	{
		if (UGridironBridgeSubsystem* Bridge = GI->GetSubsystem<UGridironBridgeSubsystem>()) Bridge->ReportCutsceneFinished(Done.EventId, bSkipped);
		if (UGridironFlowSubsystem* Flow = GI->GetSubsystem<UGridironFlowSubsystem>()) Flow->NotifyCinematicFinished(Done);
	}
	OnCinematicFinished.Broadcast(Done, bSkipped);
	if (bPlayNext) PlayNext();
}

void UGridironSequenceManager::PlayNext()
{
	if (bActive || Queue.Num() == 0) return;
	const FGridironCinematic Next = Queue[0];
	Queue.RemoveAt(0);
	Play(Next);
}
