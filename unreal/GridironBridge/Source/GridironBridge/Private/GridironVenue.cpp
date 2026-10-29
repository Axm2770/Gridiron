#include "GridironVenue.h"
#include "GridironBridgeSubsystem.h"
#include "GridironWeather.h"
#include "Components/ExponentialHeightFogComponent.h"
#include "Components/LightComponent.h"
#include "Components/SkyLightComponent.h"
#include "Engine/DirectionalLight.h"
#include "Engine/ExponentialHeightFog.h"
#include "Engine/GameInstance.h"
#include "Engine/Light.h"
#include "Engine/SkyLight.h"
#include "Engine/World.h"
#include "EngineUtils.h"
#include "Kismet/KismetMaterialLibrary.h"
#include "Materials/MaterialParameterCollection.h"

static FGridironLightingPreset MakePreset(float SunIntensity, FLinearColor SunColor, float SunPitch, float SkyIntensity)
{
	FGridironLightingPreset Preset;
	Preset.SunIntensity = SunIntensity;
	Preset.SunColor = SunColor;
	Preset.SunPitch = SunPitch;
	Preset.SkyIntensity = SkyIntensity;
	return Preset;
}

AGridironVenue::AGridironVenue()
{
	PrimaryActorTick.bCanEverTick = false;
	RootComponent = CreateDefaultSubobject<USceneComponent>(TEXT("Root"));
	Lighting.Add(TEXT("Afternoon"), MakePreset(10.f, FLinearColor::White, -50.f, 1.f));
	Lighting.Add(TEXT("Dusk"), MakePreset(4.f, FLinearColor(1.f, 0.62f, 0.38f), -6.f, 0.6f));
	Lighting.Add(TEXT("Night"), MakePreset(0.08f, FLinearColor(0.55f, 0.65f, 1.f), -35.f, 0.15f));
	FogDensity.Add(TEXT("Clear"), 0.01f);
	FogDensity.Add(TEXT("Rain"), 0.05f);
	FogDensity.Add(TEXT("Snow"), 0.08f);
	FogDensity.Add(TEXT("Fog"), 0.2f);
}

void AGridironVenue::BeginPlay()
{
	Super::BeginPlay();
	if (UGameInstance* GI = GetGameInstance())
		if (UGridironBridgeSubsystem* Bridge = GI->GetSubsystem<UGridironBridgeSubsystem>())
			Bridge->OnStadium.AddDynamic(this, &AGridironVenue::HandleStadium);
}

void AGridironVenue::HandleStadium(const FGridironStadium& Stadium)
{
	ApplyStadium(Stadium);
}

void AGridironVenue::ApplyStadium(const FGridironStadium& Stadium)
{
	UWorld* World = GetWorld();
	if (!World) return;

	// Team colours: the message's own colours, else the session palette.
	const UGridironBridgeSubsystem* Bridge = GetGameInstance() ? GetGameInstance()->GetSubsystem<UGridironBridgeSubsystem>() : nullptr;
	auto TeamColor = [&](const FString& Hex, int32 Team)
	{
		if (!Hex.IsEmpty()) return GridironColor::FromHex(Hex);
		return Bridge && Bridge->TeamColors.IsValidIndex(Team) ? Bridge->TeamColors[Team] : FLinearColor(0.4f, 0.4f, 0.4f);
	};
	const FLinearColor Home = TeamColor(Stadium.Colors.Home, Stadium.HomeTeam);
	const FLinearColor Away = TeamColor(Stadium.Colors.Away, Stadium.AwayTeam);
	if (UMaterialParameterCollection* Params = TeamParameters.LoadSynchronous())
	{
		UKismetMaterialLibrary::SetVectorParameterValue(World, Params, TEXT("HomePrimary"), Home);
		UKismetMaterialLibrary::SetVectorParameterValue(World, Params, TEXT("AwayPrimary"), Away);
		UKismetMaterialLibrary::SetScalarParameterValue(World, Params, TEXT("CrowdDensity"), Stadium.Crowd / 100.f);
	}

	// Sun, sky and tower lights for the time of day.
	const FString Time = Stadium.TimeOfDay.IsEmpty() ? TEXT("Afternoon") : Stadium.TimeOfDay;
	if (const FGridironLightingPreset* Light = Lighting.Find(Time))
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
	const bool bTowers = Time != TEXT("Afternoon");
	int32 Towers = 0;
	for (TActorIterator<ALight> It(World); It; ++It)
	{
		if (!It->ActorHasTag(TEXT("GridironStadiumLight"))) continue;
		It->GetLightComponent()->SetIntensity(bTowers ? TowerLightIntensity : 0.f);
		++Towers;
	}

	// Weather: fog density, plus rain or snow from the precipitation actor.
	if (const float* Density = FogDensity.Find(Stadium.Weather))
		for (TActorIterator<AExponentialHeightFog> It(World); It; ++It) It->GetComponent()->SetFogDensity(*Density);
	for (TActorIterator<AGridironWeather> It(World); It; ++It) It->SetWeather(Stadium.Weather);

	UE_LOG(LogGridiron, Log, TEXT("Stadium: home %d, away %d, %s, %s, crowd %d%%, %d tower lights %s"),
		Stadium.HomeTeam, Stadium.AwayTeam, *Time, *Stadium.Weather, Stadium.Crowd, Towers, bTowers ? TEXT("on") : TEXT("off"));
	OnStadiumApplied(Stadium);
}
