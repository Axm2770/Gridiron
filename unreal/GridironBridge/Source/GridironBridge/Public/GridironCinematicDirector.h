// Plays narrative Level Sequences (draft night, pressers, celebrations) requested by
// cutscene.trigger messages. Higher priority interrupts lower; cast slots bind by tag.
#pragma once

#include "CoreMinimal.h"
#include "GameFramework/Actor.h"
#include "GridironTypes.h"
#include "GridironCinematicDirector.generated.h"

class ULevelSequence;
class ULevelSequencePlayer;
class ALevelSequenceActor;

UCLASS(Blueprintable)
class GRIDIRONBRIDGE_API AGridironCinematicDirector : public AActor
{
	GENERATED_BODY()
public:
	virtual void BeginPlay() override;

	// Sequence names from CUTSCENES in dist/bridge/ue-protocol.mjs → authored Level Sequences.
	UPROPERTY(EditAnywhere, Category = "Gridiron") TMap<FName, TSoftObjectPtr<ULevelSequence>> Sequences;

	UFUNCTION(BlueprintCallable, Category = "Gridiron") void PlayCutscene(const FGridironCutscene& Cutscene);
	UFUNCTION(BlueprintCallable, Category = "Gridiron") void Skip();

	// Return the actor to bind for a cast slot (spawn a MetaHuman, reuse a play pawn, ...).
	UFUNCTION(BlueprintNativeEvent, Category = "Gridiron") AActor* ResolveCast(const FGridironCastMember& Member, const FGridironCutscene& Cutscene);

private:
	UFUNCTION() void HandleCutscene(const FGridironCutscene& Cutscene);
	UFUNCTION() void HandleFinished();
	void Finish(bool bSkipped);

	UPROPERTY() TObjectPtr<ULevelSequencePlayer> Player;
	UPROPERTY() TObjectPtr<ALevelSequenceActor> SequenceActor;
	FGridironCutscene Active;
	TArray<FGridironCutscene> Queue;
};
