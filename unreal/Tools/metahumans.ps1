<#
Builds the MetaHuman football players (unreal/Tools/build_metahumans.py) in GridironDemo.

  powershell -ExecutionPolicy Bypass -File unreal\Tools\metahumans.ps1 -EngineDir "C:\Program Files\Epic Games\UE_5.8"
  ... -Only SkillA,BigC     # rebuild a subset
  ... -UniformsOnly         # only redo the painted uniforms on the built bodies

The first run opens Epic's sign-in page in your browser (the MetaHuman cloud service rigs and
textures each character). MetaHuman assembly writes texture paths over Windows' 260-character
limit when the project sits in a deep folder, so the project is opened through a short junction
(%LOCALAPPDATA%\GD -> unreal\). Each character takes one to two minutes. Run it from a normal
terminal: sandboxed shells redirect writes under %LOCALAPPDATA%, so the built assets never reach
the project.
#>
param(
  [string]$EngineDir = "C:\Program Files\Epic Games\UE_5.8",
  [string[]]$Only = @(),
  [switch]$UniformsOnly
)
$ErrorActionPreference = "Stop"
$unreal = Resolve-Path (Join-Path $PSScriptRoot "..")
$editor = Join-Path $EngineDir "Engine\Binaries\Win64\UnrealEditor.exe"
if (-not (Test-Path $editor)) { throw "UnrealEditor.exe not found under $EngineDir" }

# Skin tones and clothing come from MetaHuman Creator's optional content; without it the editor
# asserts while committing skin settings.
$optional = Join-Path $EngineDir "Engine\Plugins\MetaHuman\MetaHumanCharacter\Content\Optional"
if (-not (Test-Path $optional)) {
  throw "MetaHuman Creator optional content is missing. In the Epic Games Launcher: Library > Unreal Engine 5.8 > Options > tick `"MetaHuman Creator Core Data`" > Apply, then run this again."
}

$short = Join-Path $env:LOCALAPPDATA "GD"
if (Test-Path $short) {
  $target = (Get-Item $short).Target
  if ($target -and ((Resolve-Path $target).Path -ne $unreal.Path)) { throw "$short already points at $target" }
} else {
  New-Item -ItemType Junction -Path $short -Target $unreal | Out-Null
}

$project = Join-Path $short "GridironDemo\GridironDemo.uproject"
$script = Join-Path $short "Tools\build_metahumans.py"
$arguments = @("`"$project`"", "-ExecutePythonScript=`"$script`"", "-GridironQuit", "-nosplash")
if ($Only.Count) { $arguments += "-GridironOnly=$($Only -join ',')" }
if ($UniformsOnly) { $arguments += "-GridironUniformsOnly" }
Write-Host "==> Building MetaHumans (sign in to Epic in the browser if asked)"
Start-Process $editor -ArgumentList $arguments -Wait

$log = Join-Path $short "GridironDemo\Saved\Logs\GridironDemo.log"
Select-String $log -Pattern "Gridiron MetaHumans:" | ForEach-Object { $_.Line -replace '^\[[^]]*\]\[[^]]*\]', '' }
