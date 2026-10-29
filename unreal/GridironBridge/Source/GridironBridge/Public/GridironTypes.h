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

/* ---------------------------------------------------------------- telemetry stream (play.call …) */

USTRUCT(BlueprintType)
struct FGridironOffenseCall
{
	GENERATED_BODY()
	UPROPERTY(BlueprintReadOnly) FString Call;
	UPROPERTY(BlueprintReadOnly) FString Formation;
	UPROPERTY(BlueprintReadOnly) FString Personnel;
	UPROPERTY(BlueprintReadOnly) FString Tempo;
};

USTRUCT(BlueprintType)
struct FGridironDefenseCall
{
	GENERATED_BODY()
	UPROPERTY(BlueprintReadOnly) FString Front;
	UPROPERTY(BlueprintReadOnly) FString Coverage;
	UPROPERTY(BlueprintReadOnly) FString Shell;
};

USTRUCT(BlueprintType)
struct FGridironRosterEntry
{
	GENERATED_BODY()
	UPROPERTY(BlueprintReadOnly) int32 Index = 0;
	UPROPERTY(BlueprintReadOnly) FString Id;
	UPROPERTY(BlueprintReadOnly) FString Name;
	UPROPERTY(BlueprintReadOnly) FString Role;
	UPROPERTY(BlueprintReadOnly) int32 Jersey = INDEX_NONE;
	UPROPERTY(BlueprintReadOnly) FString Side;
	UPROPERTY(BlueprintReadOnly) int32 Team = INDEX_NONE;
	UPROPERTY(BlueprintReadOnly) float HeightCm = 185.f;
	UPROPERTY(BlueprintReadOnly) float MassKg = 100.f;
};

// PlayCallData: everything known at the snap. Arrives before any frames for that play.
USTRUCT(BlueprintType)
struct FGridironPlayCall
{
	GENERATED_BODY()
	UPROPERTY(BlueprintReadOnly) FString PlayId;
	UPROPERTY(BlueprintReadOnly) int32 OffenseTeam = INDEX_NONE;
	UPROPERTY(BlueprintReadOnly) int32 DefenseTeam = INDEX_NONE;
	UPROPERTY(BlueprintReadOnly) int32 Direction = 1;
	UPROPERTY(BlueprintReadOnly) FGridironOffenseCall Offense;
	UPROPERTY(BlueprintReadOnly) FGridironDefenseCall Defense;
	UPROPERTY(BlueprintReadOnly) FString Weather;
	UPROPERTY(BlueprintReadOnly) float Duration = 0.f;
	UPROPERTY(BlueprintReadOnly) TArray<FGridironRosterEntry> Roster;
};

USTRUCT(BlueprintType)
struct FGridironPlayerSample
{
	GENERATED_BODY()
	UPROPERTY(BlueprintReadOnly) int32 Index = 0;
	UPROPERTY(BlueprintReadOnly) float X = 0.f;
	UPROPERTY(BlueprintReadOnly) float Y = 0.f;
	UPROPERTY(BlueprintReadOnly) float Z = 0.f;
	UPROPERTY(BlueprintReadOnly) float Yaw = 0.f;
	UPROPERTY(BlueprintReadOnly) float Vx = 0.f;
	UPROPERTY(BlueprintReadOnly) float Vy = 0.f;
	UPROPERTY(BlueprintReadOnly) float Speed = 0.f;
	FVector Location() const { return FVector(X, Y, Z); }
	FVector Velocity() const { return FVector(Vx, Vy, 0.f); }
};

USTRUCT(BlueprintType)
struct FGridironBallSample
{
	GENERATED_BODY()
	UPROPERTY(BlueprintReadOnly) float X = 0.f;
	UPROPERTY(BlueprintReadOnly) float Y = 0.f;
	UPROPERTY(BlueprintReadOnly) float Z = 0.f;
	UPROPERTY(BlueprintReadOnly) float Vx = 0.f;
	UPROPERTY(BlueprintReadOnly) float Vy = 0.f;
	UPROPERTY(BlueprintReadOnly) float Vz = 0.f;
	UPROPERTY(BlueprintReadOnly) int32 Carrier = 0;
	FVector Location() const { return FVector(X, Y, Z); }
	FVector Velocity() const { return FVector(Vx, Vy, Vz); }
};

// PlayerCoordinateFrame: one authoritative sample of all 22 players and the ball.
USTRUCT(BlueprintType)
struct FGridironCoordinateFrame
{
	GENERATED_BODY()
	UPROPERTY(BlueprintReadOnly) float T = 0.f;
	UPROPERTY(BlueprintReadOnly) TArray<FGridironPlayerSample> Players;
	UPROPERTY(BlueprintReadOnly) FGridironBallSample Ball;
};

USTRUCT(BlueprintType)
struct FGridironFrameChunk
{
	GENERATED_BODY()
	UPROPERTY(BlueprintReadOnly) FString PlayId;
	UPROPERTY(BlueprintReadOnly) int32 Chunk = 0;
	UPROPERTY(BlueprintReadOnly) bool Final = false;
	UPROPERTY(BlueprintReadOnly) TArray<FGridironCoordinateFrame> Frames;
};

// PhysicsCollisionEvent: a tackle, sack, block or broken tackle with its physical magnitude.
USTRUCT(BlueprintType)
struct FGridironCollision
{
	GENERATED_BODY()
	UPROPERTY(BlueprintReadOnly) FString PlayId;
	UPROPERTY(BlueprintReadOnly) float T = 0.f;
	UPROPERTY(BlueprintReadOnly) FString Kind;
	UPROPERTY(BlueprintReadOnly) int32 Instigator = INDEX_NONE;
	UPROPERTY(BlueprintReadOnly) int32 Target = INDEX_NONE;
	UPROPERTY(BlueprintReadOnly) FGridironVec Location;
	UPROPERTY(BlueprintReadOnly) FVector Normal = FVector::ForwardVector;
	UPROPERTY(BlueprintReadOnly) float ClosingSpeed = 0.f;
	UPROPERTY(BlueprintReadOnly) float Impulse = 0.f;
	UPROPERTY(BlueprintReadOnly) FString Severity;
	UPROPERTY(BlueprintReadOnly) FString BodyRegion;
	bool IsBig() const { return Severity == TEXT("big"); }
};

USTRUCT(BlueprintType)
struct FGridironUniform
{
	GENERATED_BODY()
	UPROPERTY(BlueprintReadOnly) FString Jersey;
	UPROPERTY(BlueprintReadOnly) FString Pants;
	UPROPERTY(BlueprintReadOnly) FString Helmet;
	UPROPERTY(BlueprintReadOnly) FString Set;
};

USTRUCT(BlueprintType)
struct FGridironTeamColors
{
	GENERATED_BODY()
	UPROPERTY(BlueprintReadOnly) FString Primary;
	UPROPERTY(BlueprintReadOnly) FString Secondary;
};

USTRUCT(BlueprintType)
struct FGridironTeamLook
{
	GENERATED_BODY()
	UPROPERTY(BlueprintReadOnly) int32 Id = INDEX_NONE;
	UPROPERTY(BlueprintReadOnly) FString Abbr;
	UPROPERTY(BlueprintReadOnly) FString Name;
	UPROPERTY(BlueprintReadOnly) FString City;
	UPROPERTY(BlueprintReadOnly) FGridironTeamColors Colors;
	UPROPERTY(BlueprintReadOnly) FGridironUniform Uniform;
	bool IsValid() const { return Id != INDEX_NONE; }
};

USTRUCT(BlueprintType)
struct FGridironTeams
{
	GENERATED_BODY()
	UPROPERTY(BlueprintReadOnly) FGridironTeamLook Home;
	UPROPERTY(BlueprintReadOnly) FGridironTeamLook Away;
};

USTRUCT(BlueprintType)
struct FGridironAppearance
{
	GENERATED_BODY()
	UPROPERTY(BlueprintReadOnly) FString Skin;
	UPROPERTY(BlueprintReadOnly) FString Hair;
	UPROPERTY(BlueprintReadOnly) FString Build;
	UPROPERTY(BlueprintReadOnly) float HeightCm = 185.f;
};

USTRUCT(BlueprintType)
struct FGridironPerformer
{
	GENERATED_BODY()
	UPROPERTY(BlueprintReadOnly) FName Slot;
	UPROPERTY(BlueprintReadOnly) FString PlayerId;
	UPROPERTY(BlueprintReadOnly) FString Name;
	UPROPERTY(BlueprintReadOnly) int32 Number = INDEX_NONE;
	UPROPERTY(BlueprintReadOnly) FString Pos;
	UPROPERTY(BlueprintReadOnly) int32 Team = INDEX_NONE;
	UPROPERTY(BlueprintReadOnly) FGridironAppearance Appearance;
};

USTRUCT(BlueprintType)
struct FGridironEnvironment
{
	GENERATED_BODY()
	UPROPERTY(BlueprintReadOnly) FString TimeOfDay;
	UPROPERTY(BlueprintReadOnly) FString Weather;
	UPROPERTY(BlueprintReadOnly) int32 Crowd = 70;
	UPROPERTY(BlueprintReadOnly) FString Stadium;
};

// CinematicTrigger: a template sequence plus everything needed to personalise it at runtime.
USTRUCT(BlueprintType)
struct FGridironCinematic
{
	GENERATED_BODY()
	UPROPERTY(BlueprintReadOnly) FString EventId;
	UPROPERTY(BlueprintReadOnly) FString Kind;
	UPROPERTY(BlueprintReadOnly) FName Template;
	UPROPERTY(BlueprintReadOnly) int32 Priority = 0;
	UPROPERTY(BlueprintReadOnly) bool Skippable = true;
	UPROPERTY(BlueprintReadOnly) bool Blocking = false;
	UPROPERTY(BlueprintReadOnly) FGridironTeams Teams;
	UPROPERTY(BlueprintReadOnly) TArray<FGridironPerformer> Cast;
	UPROPERTY(BlueprintReadOnly) FGridironEnvironment Environment;
};

UENUM(BlueprintType)
enum class EGridironFlowState : uint8
{
	Hub,
	LoadingMatch,
	PreGame,
	Live,
	Halftime,
	Celebration,
	PostGame,
	Returning
};

USTRUCT(BlueprintType)
struct FGridironMatchState
{
	GENERATED_BODY()
	UPROPERTY(BlueprintReadOnly) FString State;
	UPROPERTY(BlueprintReadOnly) FString MatchId;
	UPROPERTY(BlueprintReadOnly) FGridironTeamLook Home;
	UPROPERTY(BlueprintReadOnly) FGridironTeamLook Away;
	UPROPERTY(BlueprintReadOnly) int32 Quarter = 0;
	UPROPERTY(BlueprintReadOnly) int32 Clock = 0;
	UPROPERTY(BlueprintReadOnly) FString Weather;
	UPROPERTY(BlueprintReadOnly) TArray<FString> Preload;
};

namespace GridironColor
{
	// "#rrggbb" → linear colour; falls back to white for missing values.
	inline FLinearColor FromHex(const FString& Hex)
	{
		return Hex.IsEmpty() ? FLinearColor::White : FLinearColor(FColor::FromHex(Hex));
	}
}
