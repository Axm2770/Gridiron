// USTRUCT mirrors of the gridiron.ue/1 payloads (see dist/bridge/ue-schema.json).
// Field names match the JSON keys so FJsonObjectConverter maps them directly.
#pragma once

#include "CoreMinimal.h"
#include "GridironTypes.generated.h"

USTRUCT(BlueprintType)
struct FGridironVec
{
	GENERATED_BODY()
	UPROPERTY(BlueprintReadOnly) int32 X = 0;
	UPROPERTY(BlueprintReadOnly) int32 Y = 0;
	UPROPERTY(BlueprintReadOnly) int32 Z = 0;
	FVector ToVector() const { return FVector(X, Y, Z); }
};

USTRUCT(BlueprintType)
struct FGridironActor
{
	GENERATED_BODY()
	UPROPERTY(BlueprintReadOnly) int32 Index = 0;
	UPROPERTY(BlueprintReadOnly) FString Id;
	UPROPERTY(BlueprintReadOnly) FString Name;
	UPROPERTY(BlueprintReadOnly) FString Role;
	UPROPERTY(BlueprintReadOnly) FString Side;
};

USTRUCT(BlueprintType)
struct FGridironFrame
{
	GENERATED_BODY()
	UPROPERTY(BlueprintReadOnly) float T = 0.f;
	// Flat [X, Y, YawDeg, SpeedCmS] per actor, stride 4.
	UPROPERTY(BlueprintReadOnly) TArray<int32> Actors;
	UPROPERTY(BlueprintReadOnly) FGridironVec Ball;
};

USTRUCT(BlueprintType)
struct FGridironTrigger
{
	GENERATED_BODY()
	UPROPERTY(BlueprintReadOnly) float T = 0.f;
	UPROPERTY(BlueprintReadOnly) FString Event;
	UPROPERTY(BlueprintReadOnly) FName Montage;
	UPROPERTY(BlueprintReadOnly) int32 Actor = INDEX_NONE;
	UPROPERTY(BlueprintReadOnly) int32 Partner = INDEX_NONE;
	UPROPERTY(BlueprintReadOnly) int32 LookAt = INDEX_NONE;
};

USTRUCT(BlueprintType)
struct FGridironShot
{
	GENERATED_BODY()
	UPROPERTY(BlueprintReadOnly) float At = 0.f;
	UPROPERTY(BlueprintReadOnly) FName Rig;
	UPROPERTY(BlueprintReadOnly) float Blend = 0.f;
	UPROPERTY(BlueprintReadOnly) FString Follow;
	UPROPERTY(BlueprintReadOnly) float SlowMo = 1.f;
};

USTRUCT(BlueprintType)
struct FGridironCamera
{
	GENERATED_BODY()
	UPROPERTY(BlueprintReadOnly) TArray<FGridironShot> Shots;
	UPROPERTY(BlueprintReadOnly) bool ReplayWorthy = false;
};

USTRUCT(BlueprintType)
struct FGridironResult
{
	GENERATED_BODY()
	UPROPERTY(BlueprintReadOnly) FString Kind;
	UPROPERTY(BlueprintReadOnly) float Yards = 0.f;
	UPROPERTY(BlueprintReadOnly) float Spot = 0.f;
	UPROPERTY(BlueprintReadOnly) int32 Carrier = 0;
	UPROPERTY(BlueprintReadOnly) bool Passing = false;
};

USTRUCT(BlueprintType)
struct FGridironPlay
{
	GENERATED_BODY()
	UPROPERTY(BlueprintReadOnly) FString PlayId;
	UPROPERTY(BlueprintReadOnly) float Duration = 0.f;
	UPROPERTY(BlueprintReadOnly) FString Call;
	UPROPERTY(BlueprintReadOnly) int32 OffenseTeam = INDEX_NONE;
	UPROPERTY(BlueprintReadOnly) int32 DefenseTeam = INDEX_NONE;
	UPROPERTY(BlueprintReadOnly) int32 Direction = 1;
	UPROPERTY(BlueprintReadOnly) int32 FrameStride = 4;
	UPROPERTY(BlueprintReadOnly) TArray<FGridironActor> Actors;
	UPROPERTY(BlueprintReadOnly) TArray<FGridironFrame> Frames;
	UPROPERTY(BlueprintReadOnly) TArray<FGridironTrigger> Triggers;
	UPROPERTY(BlueprintReadOnly) FGridironCamera Camera;
	UPROPERTY(BlueprintReadOnly) FGridironResult Result;
};

USTRUCT(BlueprintType)
struct FGridironCastMember
{
	GENERATED_BODY()
	UPROPERTY(BlueprintReadOnly) FName Slot;
	UPROPERTY(BlueprintReadOnly) FString PlayerId;
	UPROPERTY(BlueprintReadOnly) FString Name;
	UPROPERTY(BlueprintReadOnly) FString Pos;
};

USTRUCT(BlueprintType)
struct FGridironCutscene
{
	GENERATED_BODY()
	UPROPERTY(BlueprintReadOnly) FString EventId;
	UPROPERTY(BlueprintReadOnly) FString Kind;
	UPROPERTY(BlueprintReadOnly) FName Sequence;
	UPROPERTY(BlueprintReadOnly) int32 Priority = 0;
	UPROPERTY(BlueprintReadOnly) bool Skippable = true;
	UPROPERTY(BlueprintReadOnly) int32 Team = 0;
	UPROPERTY(BlueprintReadOnly) int32 Opponent = INDEX_NONE;
	UPROPERTY(BlueprintReadOnly) TArray<FGridironCastMember> Cast;
};

USTRUCT(BlueprintType)
struct FGridironStadium
{
	GENERATED_BODY()
	UPROPERTY(BlueprintReadOnly) int32 HomeTeam = 0;
	UPROPERTY(BlueprintReadOnly) int32 AwayTeam = INDEX_NONE;
	UPROPERTY(BlueprintReadOnly) FString Weather;
	UPROPERTY(BlueprintReadOnly) int32 Crowd = 70;
	UPROPERTY(BlueprintReadOnly) bool Hostile = false;
	UPROPERTY(BlueprintReadOnly) FString TimeOfDay;
};
