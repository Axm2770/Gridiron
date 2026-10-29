<#
  Phase 0 setup for the Gridiron UE5 renderer (Windows).

  1. Finds an installed Unreal Engine 5.3+ and Visual Studio 2022 with the C++ workload.
  2. Links unreal/GridironBridge into unreal/GridironDemo/Plugins.
  3. Builds the plugin with RunUAT (catches compile errors without opening the editor).
  4. Builds the greybox level with the editor's Python (unreal/Tools/build_greybox.py).
  5. Optionally opens the editor.

  Usage (from the repository root):
    powershell -ExecutionPolicy Bypass -File unreal\Tools\setup.ps1            # everything
    powershell -ExecutionPolicy Bypass -File unreal\Tools\setup.ps1 -SkipBuild # link + greybox only
    powershell -ExecutionPolicy Bypass -File unreal\Tools\setup.ps1 -Open      # then open the editor
#>
param(
  [string]$EngineDir = "",
  [switch]$SkipBuild,
  [switch]$SkipGreybox,
  [switch]$Open
)
$ErrorActionPreference = "Stop"
$root = Resolve-Path (Join-Path $PSScriptRoot "..\..")
$plugin = Join-Path $root "unreal\GridironBridge"
$project = Join-Path $root "unreal\GridironDemo\GridironDemo.uproject"

function Step($text) { Write-Host "`n==> $text" -ForegroundColor Cyan }
function Fail($text) { Write-Host "`nSETUP STOPPED: $text" -ForegroundColor Red; exit 1 }

Step "Locating Unreal Engine 5.3+"
if (-not $EngineDir) {
  $candidates = @()
  # Epic Games Launcher installs are listed here.
  $launcher = "C:\ProgramData\Epic\UnrealEngineLauncher\LauncherInstalled.dat"
  if (Test-Path $launcher) {
    $candidates += (Get-Content $launcher -Raw | ConvertFrom-Json).InstallationList |
      Where-Object { $_.AppName -match '^UE_5\.(\d+)$' -and [int]$Matches[1] -ge 3 } |
      Sort-Object { [int]($_.AppName -replace 'UE_5\.', '') } -Descending |
      ForEach-Object { $_.InstallLocation }
  }
  foreach ($key in Get-ChildItem "HKLM:\SOFTWARE\EpicGames\Unreal Engine" -ErrorAction SilentlyContinue) {
    $dir = (Get-ItemProperty $key.PSPath -ErrorAction SilentlyContinue).InstalledDirectory
    if ($dir) { $candidates += $dir }
  }
  $EngineDir = $candidates | Where-Object { $_ -and (Test-Path (Join-Path $_ "Engine\Build\BatchFiles\RunUAT.bat")) } | Select-Object -First 1
}
if (-not $EngineDir) { Fail "No Unreal Engine 5.3+ found. Install UE 5.4 from the Epic Games Launcher (Unreal Engine > Library), or pass -EngineDir 'D:\Epic\UE_5.4'." }
$uat = Join-Path $EngineDir "Engine\Build\BatchFiles\RunUAT.bat"
$editor = Join-Path $EngineDir "Engine\Binaries\Win64\UnrealEditor.exe"
Write-Host "Engine: $EngineDir"

Step "Checking Visual Studio 2022 (Desktop development with C++)"
$vswhere = "${env:ProgramFiles(x86)}\Microsoft Visual Studio\Installer\vswhere.exe"
$vs = if (Test-Path $vswhere) { & $vswhere -latest -products * -requires Microsoft.VisualStudio.Component.VC.Tools.x86.x64 -property installationPath } else { $null }
if (-not $vs) { Fail "Visual Studio 2022 with 'Desktop development with C++' (and 'Game development with C++') is required to compile the plugin. Install it from https://visualstudio.microsoft.com/ and re-run." }
Write-Host "Visual Studio: $vs"

Step "Linking the plugin into the demo project"
$pluginsDir = Join-Path $root "unreal\GridironDemo\Plugins"
$link = Join-Path $pluginsDir "GridironBridge"
New-Item -ItemType Directory -Force $pluginsDir | Out-Null
if (-not (Test-Path $link)) {
  # A junction keeps a single copy of the plugin source in the repository.
  cmd /c mklink /J "`"$link`"" "`"$plugin`"" | Out-Null
}
Write-Host "Plugins\GridironBridge -> $plugin"

if (-not $SkipBuild) {
  Step "Compiling GridironBridge with RunUAT BuildPlugin (first run takes several minutes)"
  $out = Join-Path $env:TEMP "GridironBridge-build"
  & $uat BuildPlugin "-Plugin=$plugin\GridironBridge.uplugin" "-Package=$out" -TargetPlatforms=Win64 -Rocket
  if ($LASTEXITCODE -ne 0) { Fail "The plugin did not compile. The errors above name the file and line; paste them back to Claude to fix." }
  Write-Host "Plugin compiled." -ForegroundColor Green
}

if (-not $SkipGreybox) {
  Step "Building the greybox level with the editor's Python"
  $script = Join-Path $PSScriptRoot "build_greybox.py"
  # Level-editing APIs need the full editor: launch it, run the script, and let the script quit.
  Start-Process $editor -ArgumentList "`"$project`"", "-ExecutePythonScript=`"$script`"", "-GridironQuit", "-nosplash" -Wait
  $map = Join-Path $root "unreal\GridironDemo\Content\Gridiron\Maps\Greybox.umap"
  if (-not (Test-Path $map)) { Fail "The greybox level was not saved; see unreal\GridironDemo\Saved\Logs\GridironDemo.log." }
  Write-Host "Greybox level saved to /Game/Gridiron/Maps/Greybox." -ForegroundColor Green
}

Step "Done"
Write-Host "Next: start telemetry with 'npm run ue:replay' (no game needed) or run the game with GRIDIRON_UE=1, then press Play in the editor."
if ($Open) { Start-Process $editor -ArgumentList "`"$project`"" }
