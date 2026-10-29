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
# Point the demo project at the installed engine version so the editor doesn't offer a conversion.
$build = Get-Content (Join-Path $EngineDir "Engine\Build\Build.version") -Raw | ConvertFrom-Json
$association = "$($build.MajorVersion).$($build.MinorVersion)"
$text = [IO.File]::ReadAllText($project)
$updated = $text -replace '"EngineAssociation":\s*"[^"]*"', "`"EngineAssociation`": `"$association`""
if ($updated -ne $text) {
  # Plain text edit keeps the file's formatting and writes it without a byte-order mark.
  [IO.File]::WriteAllText($project, $updated, (New-Object Text.UTF8Encoding $false))
  Write-Host "GridironDemo.uproject now targets UE $association"
}

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
  # The demo project has no C++ module of its own, so the editor can't rebuild the plugin itself:
  # copy the compiled editor binaries next to the plugin source (gitignored).
  $binaries = Join-Path $plugin "Binaries"
  if (Test-Path $binaries) { Remove-Item -Recurse -Force $binaries }
  Copy-Item -Recurse (Join-Path $out "Binaries") $binaries
  Write-Host "Plugin compiled; binaries in $binaries" -ForegroundColor Green
}

Step "Copying the engine's mannequin character into the demo project"
# Epic's Third Person template content (Manny/Quinn mesh, physics asset, locomotion and hit-react
# animations) ships with every engine install; it lands at /Game/Characters (gitignored).
$mannequin = Join-Path $EngineDir "Templates\TemplateResources\High\Characters\Content"
$characters = Join-Path $root "unreal\GridironDemo\Content\Characters"
if (-not (Test-Path $mannequin)) {
  Write-Host "Mannequin content not found in this engine install; athletes fall back to greybox capsules." -ForegroundColor Yellow
} elseif (-not (Test-Path (Join-Path $characters "Mannequins\Meshes\SKM_Manny_Simple.uasset"))) {
  New-Item -ItemType Directory -Force $characters | Out-Null
  Copy-Item -Recurse -Force (Join-Path $mannequin "*") $characters
  Write-Host "Mannequin copied to /Game/Characters/Mannequins"
} else { Write-Host "Mannequin already present" }

if (-not $SkipGreybox) {
  Step "Building the greybox level with the editor's Python"
  $script = Join-Path $PSScriptRoot "build_greybox.py"
  $map = Join-Path $root "unreal\GridironDemo\Content\Gridiron\Maps\Greybox.umap"
  # Remove the previous level so a script error can't pass for success.
  if (Test-Path $map) { Remove-Item -Force $map }
  # Level-editing APIs need the full editor: launch it, run the script, and let the script quit.
  Start-Process $editor -ArgumentList "`"$project`"", "-ExecutePythonScript=`"$script`"", "-GridironQuit", "-nosplash" -Wait
  # The script logs this line only after everything is built and saved.
  $editorLog = Join-Path $root "unreal\GridironDemo\Saved\Logs\GridironDemo.log"
  $built = (Test-Path $editorLog) -and (Select-String -Path $editorLog -SimpleMatch "Gridiron greybox level built" -Quiet)
  if (-not (Test-Path $map) -or -not $built) { Fail "The greybox script did not finish; see the LogPython errors in $editorLog." }
  Write-Host "Greybox level saved to /Game/Gridiron/Maps/Greybox." -ForegroundColor Green
}

Step "Done"
Write-Host "Next: start telemetry with 'npm run ue:replay' (no game needed) or run the game with GRIDIRON_UE=1, then press Play in the editor."
if ($Open) { Start-Process $editor -ArgumentList "`"$project`"" }
