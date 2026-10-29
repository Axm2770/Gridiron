// USTRUCT mirrors of the gridiron.ue/1 payloads (see dist/bridge/ue-schema.json).
// Field names match the JSON keys so FJsonObjectConverter maps them directly.
#pragma once

#include "CoreMinimal.h"

GRIDIRONBRIDGE_API DECLARE_LOG_CATEGORY_EXTERN(LogGridiron, Log, All);
#include "GridironTypes.generated.h"

USTRUCT(BlueprintType)
struct FGridironVec
{
	GENERATED_BODY()
	UPROPERTY(BlueprintReadOnly, Category = "Gridiron") int32 X = 0;
	UPROPERTY(BlueprintReadOnly, Category = "Gridiron") int32 Y = 0;
	UPROPERTY(BlueprintReadOnly, Category = "Gridiron") int32 Z = 0;
	FVector ToVector() const { return FVector(X, Y, Z); }
};

USTRUCT(BlueprintType)
struct FGridironActor
{
	GENERATED_BODY()
	UPROPERTY(BlueprintReadOnly, Category = "Gridiron") int32 Index = 0;
	UPROPERTY(BlueprintReadOnly, Category = "Gridiron") FString Id;
	UPROPERTY(BlueprintReadOnly, Category = "Gridiron") FString Name;
	UPROPERTY(BlueprintReadOnly, Category = "Gridiron") FString Role;
	UPROPERTY(BlueprintReadOnly, Category = "Gridiron") FString Side;
};

USTRUCT(BlueprintType)
struct FGridironFrame
{
	GENERATED_BODY()
	UPROPERTY(BlueprintReadOnly, Category = "Gridiron") float T = 0.f;
	// Flat [X, Y, YawDeg, SpeedCmS] per actor, stride 4.
	UPROPERTY(BlueprintReadOnly, Category = "Gridiron") TArray<int32> Actors;
	UPROPERTY(BlueprintReadOnly, Category = "Gridiron") FGridironVec Ball;
};

USTRUCT(BlueprintType)
struct FGridironTrigger
{
	GENERATED_BODY()
	UPROPERTY(BlueprintReadOnly, Category = "Gridiron") float T = 0.f;
	UPROPERTY(BlueprintReadOnly, Category = "Gridiron") FString Event;
	UPROPERTY(BlueprintReadOnly, Category = "Gridiron") FName Montage;
	UPROPERTY(BlueprintReadOnly, Category = "Gridiron") int32 Actor = INDEX_NONE;
	UPROPERTY(BlueprintReadOnly, Category = "Gridiron") int32 Partner = INDEX_NONE;
	UPROPERTY(BlueprintReadOnly, Category = "Gridiron") int32 LookAt = INDEX_NONE;
};

USTRUCT(BlueprintType)
struct FGridironShot
{
	GENERATED_BODY()
	UPROPERTY(BlueprintReadOnly, Category = "Gridiron") float At = 0.f;
	UPROPERTY(BlueprintReadOnly, Category = "Gridiron") FName Rig;
	UPROPERTY(BlueprintReadOnly, Category = "Gridiron") float Blend = 0.f;
	UPROPERTY(BlueprintReadOnly, Category = "Gridiron") FString Follow;
	UPROPERTY(BlueprintReadOnly, Category = "Gridiron") float SlowMo = 1.f;
};

USTRUCT(BlueprintType)
struct FGridironCamera
{
	GENERATED_BODY()
	UPROPERTY(BlueprintReadOnly, Category = "Gridiron") TArray<FGridironShot> Shots;
	UPROPERTY(BlueprintReadOnly, Category = "Gridiron") bool ReplayWorthy = false;
};

USTRUCT(BlueprintType)
struct FGridironResult
{
	GENERATED_BODY()
	UPROPERTY(BlueprintReadOnly, Category = "Gridiron") FString Kind;
	UPROPERTY(BlueprintReadOnly, Category = "Gridiron") float Yards = 0.f;
	UPROPERTY(BlueprintReadOnly, Category = "Gridiron") float Spot = 0.f;
	UPROPERTY(BlueprintReadOnly, Category = "Gridiron") int32 Carrier = 0;
	UPROPERTY(BlueprintReadOnly, Category = "Gridiron") bool Passing = false;
};

USTRUCT(BlueprintType)
struct FGridironPlay
{
	GENERATED_BODY()
	UPROPERTY(BlueprintReadOnly, Category = "Gridiron") FString PlayId;
	UPROPERTY(BlueprintReadOnly, Category = "Gridiron") float Duration = 0.f;
	UPROPERTY(BlueprintReadOnly, Category = "Gridiron") FString Call;
	UPROPERTY(BlueprintReadOnly, Category = "Gridiron") int32 OffenseTeam = INDEX_NONE;
	UPROPERTY(BlueprintReadOnly, Category = "Gridiron") int32 DefenseTeam = INDEX_NONE;
	UPROPERTY(BlueprintReadOnly, Category = "Gridiron") int32 Direction = 1;
	UPROPERTY(BlueprintReadOnly, Category = "Gridiron") int32 FrameStride = 4;
	UPROPERTY(BlueprintReadOnly, Category = "Gridiron") TArray<FGridironActor> Actors;
	UPROPERTY(BlueprintReadOnly, Category = "Gridiron") TArray<FGridironFrame> Frames;
	UPROPERTY(BlueprintReadOnly, Category = "Gridiron") TArray<FGridironTrigger> Triggers;
	UPROPERTY(BlueprintReadOnly, Category = "Gridiron") FGridironCamera Camera;
	UPROPERTY(BlueprintReadOnly, Category = "Gridiron") FGridironResult Result;
};

USTRUCT(BlueprintType)
struct FGridironCastMember
{
	GENERATED_BODY()
	UPROPERTY(BlueprintReadOnly, Category = "Gridiron") FName Slot;
	UPROPERTY(BlueprintReadOnly, Category = "Gridiron") FString PlayerId;
	UPROPERTY(BlueprintReadOnly, Category = "Gridiron") FString Name;
	UPROPERTY(BlueprintReadOnly, Category = "Gridiron") FString Pos;
};

USTRUCT(BlueprintType)
struct FGridironCutscene
{
	GENERATED_BODY()
	UPROPERTY(BlueprintReadOnly, Category = "Gridiron") FString EventId;
	UPROPERTY(BlueprintReadOnly, Category = "Gridiron") FString Kind;
	UPROPERTY(BlueprintReadOnly, Category = "Gridiron") FName Sequence;
	UPROPERTY(BlueprintReadOnly, Category = "Gridiron") int32 Priority = 0;
	UPROPERTY(BlueprintReadOnly, Category = "Gridiron") bool Skippable = true;
	UPROPERTY(BlueprintReadOnly, Category = "Gridiron") int32 Team = 0;
	UPROPERTY(BlueprintReadOnly, Category = "Gridiron") int32 Opponent = INDEX_NONE;
	UPROPERTY(BlueprintReadOnly, Category = "Gridiron") TArray<FGridironCastMember> Cast;
};

USTRUCT(BlueprintType)
struct FGridironStadiumColors
{
	GENERATED_BODY()
	UPROPERTY(BlueprintReadOnly, Category = "Gridiron") FString Home; // "#rrggbb"
	UPROPERTY(BlueprintReadOnly, Category = "Gridiron") FString Away;
};

USTRUCT(BlueprintType)
struct FGridironStadium
{
	GENERATED_BODY()
	UPROPERTY(BlueprintReadOnly, Category = "Gridiron") FGridironStadiumColors Colors;
	UPROPERTY(BlueprintReadOnly, Category = "Gridiron") int32 HomeTeam = 0;
	UPROPERTY(BlueprintReadOnly, Category = "Gridiron") int32 AwayTeam = INDEX_NONE;
	UPROPERTY(BlueprintReadOnly, Category = "Gridiron") FString Weather;
	UPROPERTY(BlueprintReadOnly, Category = "Gridiron") int32 Crowd = 70;
	UPROPERTY(BlueprintReadOnly, Category = "Gridiron") bool Hostile = false;
	UPROPERTY(BlueprintReadOnly, Category = "Gridiron") FString TimeOfDay;
};

/* ---------------------------------------------------------------- telemetry stream (play.call …) */

USTRUCT(BlueprintType)
struct FGridironOffenseCall
{
	GENERATED_BODY()
	UPROPERTY(BlueprintReadOnly, Category = "Gridiron") FString Call;
	UPROPERTY(BlueprintReadOnly, Category = "Gridiron") FString Formation;
	UPROPERTY(BlueprintReadOnly, Category = "Gridiron") FString Personnel;
	UPROPERTY(BlueprintReadOnly, Category = "Gridiron") FString Tempo;
};

USTRUCT(BlueprintType)
struct FGridironDefenseCall
{
	GENERATED_BODY()
	UPROPERTY(BlueprintReadOnly, Category = "Gridiron") FString Front;
	UPROPERTY(BlueprintReadOnly, Category = "Gridiron") FString Coverage;
	UPROPERTY(BlueprintReadOnly, Category = "Gridiron") FString Shell;
};

USTRUCT(BlueprintType)
struct FGridironRosterEntry
{
	GENERATED_BODY()
	UPROPERTY(BlueprintReadOnly, Category = "Gridiron") int32 Index = 0;
	UPROPERTY(BlueprintReadOnly, Category = "Gridiron") FString Id;
	UPROPERTY(BlueprintReadOnly, Category = "Gridiron") FString Name;
	UPROPERTY(BlueprintReadOnly, Category = "Gridiron") FString Role;
	UPROPERTY(BlueprintReadOnly, Category = "Gridiron") int32 Jersey = INDEX_NONE;
	UPROPERTY(BlueprintReadOnly, Category = "Gridiron") FString Side;
	UPROPERTY(BlueprintReadOnly, Category = "Gridiron") int32 Team = INDEX_NONE;
	UPROPERTY(BlueprintReadOnly, Category = "Gridiron") float HeightCm = 185.f;
	UPROPERTY(BlueprintReadOnly, Category = "Gridiron") float MassKg = 100.f;
};

// PlayCallData: everything known at the snap. Arrives before any frames for that play.
USTRUCT(BlueprintType)
struct FGridironPlayCall
{
	GENERATED_BODY()
	UPROPERTY(BlueprintReadOnly, Category = "Gridiron") FString PlayId;
	UPROPERTY(BlueprintReadOnly, Category = "Gridiron") int32 OffenseTeam = INDEX_NONE;
	UPROPERTY(BlueprintReadOnly, Category = "Gridiron") int32 DefenseTeam = INDEX_NONE;
	UPROPERTY(BlueprintReadOnly, Category = "Gridiron") int32 Direction = 1;
	UPROPERTY(BlueprintReadOnly, Category = "Gridiron") FGridironOffenseCall Offense;
	UPROPERTY(BlueprintReadOnly, Category = "Gridiron") FGridironDefenseCall Defense;
	UPROPERTY(BlueprintReadOnly, Category = "Gridiron") FString Weather;
	UPROPERTY(BlueprintReadOnly, Category = "Gridiron") float Duration = 0.f;
	UPROPERTY(BlueprintReadOnly, Category = "Gridiron") TArray<FGridironRosterEntry> Roster;
};

USTRUCT(BlueprintType)
struct FGridironPlayerSample
{
	GENERATED_BODY()
	UPROPERTY(BlueprintReadOnly, Category = "Gridiron") int32 Index = 0;
	UPROPERTY(BlueprintReadOnly, Category = "Gridiron") float X = 0.f;
	UPROPERTY(BlueprintReadOnly, Category = "Gridiron") float Y = 0.f;
	UPROPERTY(BlueprintReadOnly, Category = "Gridiron") float Z = 0.f;
	UPROPERTY(BlueprintReadOnly, Category = "Gridiron") float Yaw = 0.f;
	UPROPERTY(BlueprintReadOnly, Category = "Gridiron") float Vx = 0.f;
	UPROPERTY(BlueprintReadOnly, Category = "Gridiron") float Vy = 0.f;
	UPROPERTY(BlueprintReadOnly, Category = "Gridiron") float Speed = 0.f;
	FVector Location() const { return FVector(X, Y, Z); }
	FVector Velocity() const { return FVector(Vx, Vy, 0.f); }
};

USTRUCT(BlueprintType)
struct FGridironBallSample
{
	GENERATED_BODY()
	UPROPERTY(BlueprintReadOnly, Category = "Gridiron") float X = 0.f;
	UPROPERTY(BlueprintReadOnly, Category = "Gridiron") float Y = 0.f;
	UPROPERTY(BlueprintReadOnly, Category = "Gridiron") float Z = 0.f;
	UPROPERTY(BlueprintReadOnly, Category = "Gridiron") float Vx = 0.f;
	UPROPERTY(BlueprintReadOnly, Category = "Gridiron") float Vy = 0.f;
	UPROPERTY(BlueprintReadOnly, Category = "Gridiron") float Vz = 0.f;
	UPROPERTY(BlueprintReadOnly, Category = "Gridiron") int32 Carrier = 0;
	FVector Location() const { return FVector(X, Y, Z); }
	FVector Velocity() const { return FVector(Vx, Vy, Vz); }
};

// PlayerCoordinateFrame: one authoritative sample of all 22 players and the ball.
USTRUCT(BlueprintType)
struct FGridironCoordinateFrame
{
	GENERATED_BODY()
	UPROPERTY(BlueprintReadOnly, Category = "Gridiron") float T = 0.f;
	UPROPERTY(BlueprintReadOnly, Category = "Gridiron") TArray<FGridironPlayerSample> Players;
	UPROPERTY(BlueprintReadOnly, Category = "Gridiron") FGridironBallSample Ball;
};

USTRUCT(BlueprintType)
struct FGridironFrameChunk
{
	GENERATED_BODY()
	UPROPERTY(BlueprintReadOnly, Category = "Gridiron") FString PlayId;
	UPROPERTY(BlueprintReadOnly, Category = "Gridiron") int32 Chunk = 0;
	UPROPERTY(BlueprintReadOnly, Category = "Gridiron") bool Final = false;
	UPROPERTY(BlueprintReadOnly, Category = "Gridiron") TArray<FGridironCoordinateFrame> Frames;
};

// PhysicsCollisionEvent: a tackle, sack, block or broken tackle with its physical magnitude.
USTRUCT(BlueprintType)
struct FGridironCollision
{
	GENERATED_BODY()
	UPROPERTY(BlueprintReadOnly, Category = "Gridiron") FString PlayId;
	UPROPERTY(BlueprintReadOnly, Category = "Gridiron") float T = 0.f;
	UPROPERTY(BlueprintReadOnly, Category = "Gridiron") FString Kind;
	UPROPERTY(BlueprintReadOnly, Category = "Gridiron") int32 Instigator = INDEX_NONE;
	UPROPERTY(BlueprintReadOnly, Category = "Gridiron") int32 Target = INDEX_NONE;
	UPROPERTY(BlueprintReadOnly, Category = "Gridiron") FGridironVec Location;
	UPROPERTY(BlueprintReadOnly, Category = "Gridiron") FVector Normal = FVector::ForwardVector;
	UPROPERTY(BlueprintReadOnly, Category = "Gridiron") float ClosingSpeed = 0.f;
	UPROPERTY(BlueprintReadOnly, Category = "Gridiron") float Impulse = 0.f;
	UPROPERTY(BlueprintReadOnly, Category = "Gridiron") FString Severity;
	UPROPERTY(BlueprintReadOnly, Category = "Gridiron") FString BodyRegion;
	bool IsBig() const { return Severity == TEXT("big"); }
};

USTRUCT(BlueprintType)
struct FGridironUniform
{
	GENERATED_BODY()
	UPROPERTY(BlueprintReadOnly, Category = "Gridiron") FString Jersey;
	UPROPERTY(BlueprintReadOnly, Category = "Gridiron") FString Pants;
	UPROPERTY(BlueprintReadOnly, Category = "Gridiron") FString Helmet;
	UPROPERTY(BlueprintReadOnly, Category = "Gridiron") FString Set;
};

USTRUCT(BlueprintType)
struct FGridironTeamColors
{
	GENERATED_BODY()
	UPROPERTY(BlueprintReadOnly, Category = "Gridiron") FString Primary;
	UPROPERTY(BlueprintReadOnly, Category = "Gridiron") FString Secondary;
};

USTRUCT(BlueprintType)
struct FGridironTeamLook
{
	GENERATED_BODY()
	UPROPERTY(BlueprintReadOnly, Category = "Gridiron") int32 Id = INDEX_NONE;
	UPROPERTY(BlueprintReadOnly, Category = "Gridiron") FString Abbr;
	UPROPERTY(BlueprintReadOnly, Category = "Gridiron") FString Name;
	UPROPERTY(BlueprintReadOnly, Category = "Gridiron") FString City;
	UPROPERTY(BlueprintReadOnly, Category = "Gridiron") FGridironTeamColors Colors;
	UPROPERTY(BlueprintReadOnly, Category = "Gridiron") FGridironUniform Uniform;
	bool IsValid() const { return Id != INDEX_NONE; }
};

USTRUCT(BlueprintType)
struct FGridironTeams
{
	GENERATED_BODY()
	UPROPERTY(BlueprintReadOnly, Category = "Gridiron") FGridironTeamLook Home;
	UPROPERTY(BlueprintReadOnly, Category = "Gridiron") FGridironTeamLook Away;
};

USTRUCT(BlueprintType)
struct FGridironAppearance
{
	GENERATED_BODY()
	UPROPERTY(BlueprintReadOnly, Category = "Gridiron") FString Skin;
	UPROPERTY(BlueprintReadOnly, Category = "Gridiron") FString Hair;
	UPROPERTY(BlueprintReadOnly, Category = "Gridiron") FString Build;
	UPROPERTY(BlueprintReadOnly, Category = "Gridiron") float HeightCm = 185.f;
};

USTRUCT(BlueprintType)
struct FGridironPerformer
{
	GENERATED_BODY()
	UPROPERTY(BlueprintReadOnly, Category = "Gridiron") FName Slot;
	UPROPERTY(BlueprintReadOnly, Category = "Gridiron") FString PlayerId;
	UPROPERTY(BlueprintReadOnly, Category = "Gridiron") FString Name;
	UPROPERTY(BlueprintReadOnly, Category = "Gridiron") int32 Number = INDEX_NONE;
	UPROPERTY(BlueprintReadOnly, Category = "Gridiron") FString Pos;
	UPROPERTY(BlueprintReadOnly, Category = "Gridiron") int32 Team = INDEX_NONE;
	UPROPERTY(BlueprintReadOnly, Category = "Gridiron") FGridironAppearance Appearance;
};

USTRUCT(BlueprintType)
struct FGridironEnvironment
{
	GENERATED_BODY()
	UPROPERTY(BlueprintReadOnly, Category = "Gridiron") FString TimeOfDay;
	UPROPERTY(BlueprintReadOnly, Category = "Gridiron") FString Weather;
	UPROPERTY(BlueprintReadOnly, Category = "Gridiron") int32 Crowd = 70;
	UPROPERTY(BlueprintReadOnly, Category = "Gridiron") FString Stadium;
};

// CinematicTrigger: a template sequence plus everything needed to personalise it at runtime.
USTRUCT(BlueprintType)
struct FGridironCinematic
{
	GENERATED_BODY()
	UPROPERTY(BlueprintReadOnly, Category = "Gridiron") FString EventId;
	UPROPERTY(BlueprintReadOnly, Category = "Gridiron") FString Kind;
	UPROPERTY(BlueprintReadOnly, Category = "Gridiron") FName Template;
	UPROPERTY(BlueprintReadOnly, Category = "Gridiron") int32 Priority = 0;
	UPROPERTY(BlueprintReadOnly, Category = "Gridiron") bool Skippable = true;
	UPROPERTY(BlueprintReadOnly, Category = "Gridiron") bool Blocking = false;
	UPROPERTY(BlueprintReadOnly, Category = "Gridiron") FGridironTeams Teams;
	UPROPERTY(BlueprintReadOnly, Category = "Gridiron") TArray<FGridironPerformer> Cast;
	UPROPERTY(BlueprintReadOnly, Category = "Gridiron") FGridironEnvironment Environment;
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
	UPROPERTY(BlueprintReadOnly, Category = "Gridiron") FString State;
	UPROPERTY(BlueprintReadOnly, Category = "Gridiron") FString MatchId;
	UPROPERTY(BlueprintReadOnly, Category = "Gridiron") FGridironTeamLook Home;
	UPROPERTY(BlueprintReadOnly, Category = "Gridiron") FGridironTeamLook Away;
	UPROPERTY(BlueprintReadOnly, Category = "Gridiron") int32 Quarter = 0;
	UPROPERTY(BlueprintReadOnly, Category = "Gridiron") int32 Clock = 0;
	UPROPERTY(BlueprintReadOnly, Category = "Gridiron") FString Weather;
	UPROPERTY(BlueprintReadOnly, Category = "Gridiron") TArray<FString> Preload;
};

namespace GridironColor
{
	// "#rrggbb" → linear colour; falls back to white for missing values.
	inline FLinearColor FromHex(const FString& Hex)
	{
		return Hex.IsEmpty() ? FLinearColor::White : FLinearColor(FColor::FromHex(Hex));
	}
}
