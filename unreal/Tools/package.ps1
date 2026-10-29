<#
  Packages the Gridiron UE5 renderer (GridironDemo + GridironBridge) as a standalone Windows build.
  Run setup.ps1 first: the build cooks the greybox level, cinematics and mannequin it creates.

  Usage (from the repository root):
    powershell -ExecutionPolicy Bypass -File unreal\Tools\package.ps1             # Development build
    powershell -ExecutionPolicy Bypass -File unreal\Tools\package.ps1 -Shipping   # no console/logs
    powershell -ExecutionPolicy Bypass -File unreal\Tools\package.ps1 -Install    # also install for the desktop app

  Output: unreal\Build\Windows\GridironDemo.exe (gitignored). -Install copies it to
  %APPDATA%\Gridiron Director\renderer, where the desktop app's Game menu finds it.
#>
param(
  [string]$EngineDir = "",
  [switch]$Shipping,
  [switch]$Install,
  # Shader compiling during the cook saturates every core for a long time. Cap it (default: a
  # quarter of the logical processors, below-normal priority) so the machine stays usable.
  [int]$ShaderThreads = [Math]::Max(2, [int]([Environment]::ProcessorCount / 4))
)
$ErrorActionPreference = "Stop"
$root = Resolve-Path (Join-Path $PSScriptRoot "..\..")
$project = Join-Path $root "unreal\GridironDemo\GridironDemo.uproject"
$archive = Join-Path $root "unreal\Build"

function Fail($text) { Write-Host "`nPACKAGE STOPPED: $text" -ForegroundColor Red; exit 1 }

if (-not $EngineDir) {
  # Same engine the project is associated with (setup.ps1 sets it).
  $association = (Get-Content $project -Raw | ConvertFrom-Json).EngineAssociation
  $launcher = "C:\ProgramData\Epic\UnrealEngineLauncher\LauncherInstalled.dat"
  if (Test-Path $launcher) {
    $EngineDir = ((Get-Content $launcher -Raw | ConvertFrom-Json).InstallationList | Where-Object { $_.AppName -eq "UE_$association" } | Select-Object -First 1).InstallLocation
  }
  if (-not $EngineDir) { $EngineDir = "C:\Program Files\Epic Games\UE_$association" }
}
$uat = Join-Path $EngineDir "Engine\Build\BatchFiles\RunUAT.bat"
if (-not (Test-Path $uat)) { Fail "RunUAT not found under $EngineDir. Pass -EngineDir." }
if (-not (Test-Path (Join-Path $root "unreal\GridironDemo\Content\Gridiron\Maps\Greybox.umap"))) { Fail "Run unreal\Tools\setup.ps1 first (it builds the level and content this packages)." }

$config = if ($Shipping) { "Shipping" } else { "Development" }

# Packaging writes intermediates several folders deep, and Windows tools stop at 260 characters.
# Stage a clean copy of the project and plugin under a short path and package from there, so
# the build works wherever the repository is cloned.
$stage = Join-Path $env:LOCALAPPDATA "GridironUE"
Write-Host "==> Staging the project in $stage" -ForegroundColor Cyan
$skip = @("Saved", "Intermediate", "Binaries", "DerivedDataCache", "Plugins", "Build")
robocopy (Join-Path $root "unreal\GridironDemo") (Join-Path $stage "GridironDemo") /MIR /XD $skip /NFL /NDL /NJH /NJS /NP | Out-Null
if ($LASTEXITCODE -ge 8) { Fail "Could not stage the project (robocopy $LASTEXITCODE)." }
robocopy (Join-Path $root "unreal\GridironBridge") (Join-Path $stage "GridironDemo\Plugins\GridironBridge") /MIR /XD Binaries Intermediate /NFL /NDL /NJH /NJS /NP | Out-Null
if ($LASTEXITCODE -ge 8) { Fail "Could not stage the plugin (robocopy $LASTEXITCODE)." }
$project = Join-Path $stage "GridironDemo\GridironDemo.uproject"
# Throttle shader compile workers in the staged copy only (the editor project keeps its defaults).
$unused = [Math]::Max(0, [Environment]::ProcessorCount - $ShaderThreads)
Add-Content -Encoding utf8 (Join-Path $stage "GridironDemo\Config\DefaultEngine.ini") "`r`n[DevOptions.Shaders]`r`nNumUnusedShaderCompilingThreads=$unused`r`nNumUnusedShaderCompilingThreadsDuringGame=$unused`r`nWorkerProcessPriority=-1`r`n"
Write-Host "Shader compiling limited to $ShaderThreads of $([Environment]::ProcessorCount) threads (-ShaderThreads to change)"

Write-Host "==> Packaging GridironDemo ($config, Win64) with $EngineDir" -ForegroundColor Cyan
& $uat BuildCookRun "-project=$project" -noP4 -platform=Win64 "-clientconfig=$config" -build -cook -stage -pak -archive "-archivedirectory=$archive" "-map=/Game/Gridiron/Maps/Greybox" "-AdditionalCookerOptions=-corelimit=$ShaderThreads" -unattended -utf8output
if ($LASTEXITCODE -ne 0) { Fail "BuildCookRun failed; the errors above name the step." }
$exe = Join-Path $archive "Windows\GridironDemo.exe"
if (-not (Test-Path $exe)) { Fail "The build finished but $exe is missing." }
Write-Host "Packaged: $exe" -ForegroundColor Green

if ($Install) {
  $target = Join-Path $env:APPDATA "Gridiron Director\renderer"
  # A running renderer (GridironDemo.exe launches GridironDemo-Win64-*.exe) locks its files.
  $running = Get-Process -ErrorAction SilentlyContinue | Where-Object { $_.Path -and $_.Path.StartsWith($target, [StringComparison]::OrdinalIgnoreCase) }
  if ($running) {
    Write-Host "Closing the running 3D match view so it can be replaced"
    $running | Stop-Process -Force
    Start-Sleep -Seconds 2
  }
  if (Test-Path $target) {
    try { Remove-Item -Recurse -Force $target -ErrorAction Stop }
    catch { Fail "Could not replace $target ($($_.Exception.Message)). Close the 3D match view and run again." }
  }
  Copy-Item -Recurse (Join-Path $archive "Windows") $target
  Write-Host "Installed for the desktop app: $target (Game > Open 3D match view)" -ForegroundColor Green
}
