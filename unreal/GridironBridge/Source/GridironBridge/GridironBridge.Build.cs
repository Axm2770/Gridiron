using UnrealBuildTool;

public class GridironBridge : ModuleRules
{
	public GridironBridge(ReadOnlyTargetRules Target) : base(Target)
	{
		PCHUsage = PCHUsageMode.UseExplicitOrSharedPCHs;
		PublicDependencyModuleNames.AddRange(new[]
		{
			"Core", "CoreUObject", "Engine", "WebSockets", "Json", "JsonUtilities",
			"LevelSequence", "MovieScene", "CinematicCamera"
		});
	}
}
