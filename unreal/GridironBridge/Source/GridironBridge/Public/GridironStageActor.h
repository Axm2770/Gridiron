// Default cinematic performer: the engine mannequin in an idle loop, dressed from the cast data.
// Player slots wear their team's primary colour; staff slots (coach, owner, commissioner, trainer,
// general manager) wear neutral grey. Replace with MetaHuman Blueprints per slot in the
// cinematic library for final art.
#pragma once

#include "CoreMinimal.h"
#include "GameFramework/Actor.h"
#include "GridironSequenceManager.h"
#include "GridironStageActor.generated.h"

class USkeletalMesh;
class USkeletalMeshComponent;
class UAnimSequence;

UCLASS(Blueprintable)
class GRIDIRONBRIDGE_API AGridironStageActor : public AActor, public IGridironPerformerInterface
{
	GENERATED_BODY()

public:
	AGridironStageActor();
	virtual void BeginPlay() override;
	virtual void ApplyPerformer_Implementation(const FGridironPerformer& Performer, const FGridironTeamLook& Team) override;

	UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "Gridiron") TObjectPtr<USkeletalMeshComponent> Mesh;
	UPROPERTY(EditAnywhere, Category = "Gridiron") TSoftObjectPtr<USkeletalMesh> BodyMesh = TSoftObjectPtr<USkeletalMesh>(FSoftObjectPath(TEXT("/Game/Characters/Mannequins/Meshes/SKM_Manny_Simple.SKM_Manny_Simple")));
	UPROPERTY(EditAnywhere, Category = "Gridiron") TSoftObjectPtr<UAnimSequence> IdleAnimation = TSoftObjectPtr<UAnimSequence>(FSoftObjectPath(TEXT("/Game/Characters/Mannequins/Anims/Unarmed/MM_Idle.MM_Idle")));
	UPROPERTY(EditAnywhere, Category = "Gridiron") FName TintParameter = TEXT("Paint Tint");
	UPROPERTY(EditAnywhere, Category = "Gridiron") float BodyMeshHeight = 180.f;
	UPROPERTY(EditAnywhere, Category = "Gridiron") FLinearColor StaffColor = FLinearColor(0.18f, 0.18f, 0.2f);

private:
	void LoadArt();
};
