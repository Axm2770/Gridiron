<#
  Plays replays in the packaged Development renderer (package.ps1 without -Shipping) to measure
  smoothness, or to record the PSO cache that packaged builds bundle.

  Usage (from the repository root):
    powershell -ExecutionPolicy Bypass -File unreal\Tools\perf.ps1              # smoothness report
    powershell -ExecutionPolicy Bypass -File unreal\Tools\perf.ps1 -RecordPSO   # record the PSO cache

  Each run plays every venue scenario (clear afternoon, rainy night, snowy dusk, foggy night) for
  -Seconds through the replay relay, so plays, collisions, cinematics, crowd and weather all draw.

  Smoothness: the CSV profiler captures every frame; the report gives frame-time percentiles and
  hitches (frames over 33 ms and 50 ms) for the first 30 seconds (startup, where a missing PSO
  cache shows) and for the rest. Uncapped (t.MaxFPS 0, no vsync) so the numbers show headroom.

  -RecordPSO (D3D12 only; on D3D11 nothing is recorded): runs with -logPSO, then turns the recorded pipelines plus the cook's shader stable
  keys into unreal\GridironDemo\Build\Windows\PipelineCaches\GridironDemo_<format>.spc. Commit it
  and package again: the cook bundles it and the renderer compiles those pipelines at startup.
#>
param(
  [int]$Seconds = 120,
  [switch]$RecordPSO,
  # Summarize existing CSV captures instead of running (e.g. Saved\Profiling\CSV\*.csv).
  [string[]]$Csv = @(),
  [string]$EngineDir = "C:\Program Files\Epic Games\UE_5.8"
)
$ErrorActionPreference = "Stop"
$root = Resolve-Path (Join-Path $PSScriptRoot "..\..")
$build = Join-Path $root "unreal\Build\Windows"
$exe = Join-Path $build "GridironDemo\Binaries\Win64\GridironDemo.exe"
$saved = Join-Path $build "GridironDemo\Saved"
$node = Join-Path $env:ProgramFiles "nodejs\node.exe"

function Fail($text) { Write-Host "`nPERF STOPPED: $text" -ForegroundColor Red; exit 1 }
if (-not (Test-Path $exe)) { Fail "No Development build at $exe. Run unreal\Tools\package.ps1 (without -Shipping) first." }
if (-not (Test-Path $node)) { Fail "Node.js is needed for the replay relay ($node)." }

$scenarios = @(
  @{ Time = "Afternoon"; Weather = "Clear"; Seed = 42 },
  @{ Time = "Night"; Weather = "Rain"; Seed = 43 },
  @{ Time = "Dusk"; Weather = "Snow"; Seed = 44 },
  @{ Time = "Night"; Weather = "Fog"; Seed = 45 }
)

if ($RecordPSO) { Remove-Item -Recurse -Force (Join-Path $saved "CollectedPSOs") -ErrorAction SilentlyContinue }
$csvDir = Join-Path $saved "Profiling\CSV"

function Summarize($file, $label) {
  # Read the columns by hand: CSV profiler headers repeat some stat names, which Import-Csv rejects.
  $lines = Get-Content $file
  $header = $lines[0].Split(",")
  $frameCol = [Array]::IndexOf($header, "FrameTime")
  $gpuCol = [Array]::IndexOf($header, "GPUTime")
  if ($frameCol -lt 0) { Write-Host "  ${label}: no FrameTime column"; return }
  $elapsed = 0.0
  $frames = 0
  $startup = New-Object System.Collections.Generic.List[double]
  $steady = New-Object System.Collections.Generic.List[double]
  $gpu = 0.0
  foreach ($line in $lines | Select-Object -Skip 1) {
    $cells = $line.Split(",")
    $ms = $cells[$frameCol] -as [double]
    if ($null -eq $ms) { continue }  # trailing metadata rows
    if ($elapsed -lt 30000) { $startup.Add($ms) } else { $steady.Add($ms) }
    $elapsed += $ms
    $frames++
    if ($gpuCol -ge 0 -and ($cells[$gpuCol] -as [double])) { $gpu += [double]$cells[$gpuCol] }
  }
  if ($frames -eq 0) { Write-Host "  ${label}: no frames captured"; return }
  $describe = {
    param($name, $list)
    if ($list.Count -eq 0) { return }
    $sorted = $list.ToArray(); [Array]::Sort($sorted)
    $pct = { param($p) $sorted[[Math]::Min($sorted.Count - 1, [int]($sorted.Count * $p))] }
    $avg = ($list | Measure-Object -Average).Average
    $over33 = ($list | Where-Object { $_ -gt 33.3 }).Count
    $over50 = ($list | Where-Object { $_ -gt 50 }).Count
    "  {0,-8} {1,6} frames  avg {2,5:N1} ms ({3,4:N0} fps)  p50 {4,5:N1}  p95 {5,5:N1}  p99 {6,5:N1}  max {7,6:N1}  >33ms {8,3}  >50ms {9,3}" -f $name, $list.Count, $avg, (1000 / $avg), (& $pct 0.5), (& $pct 0.95), (& $pct 0.99), $sorted[-1], $over33, $over50
  }
  Write-Host "  $label (GPU avg $([Math]::Round($gpu / $frames, 1)) ms)"
  Write-Host (& $describe "startup" $startup)
  Write-Host (& $describe "steady" $steady)
}

if ($Csv.Count) {
  foreach ($f in (Get-ChildItem $Csv)) { Summarize $f.FullName $f.Name }
  exit 0
}

foreach ($s in $scenarios) {
  $label = "$($s.Time) $($s.Weather)"
  Write-Host "==> $label ($Seconds s)" -ForegroundColor Cyan
  $relay = Start-Process $node -ArgumentList "scripts/ue-replay.mjs", "--every", "6", "--seed", "$($s.Seed)", "--time", $s.Time, "--weather", $s.Weather -WorkingDirectory $root -WindowStyle Hidden -PassThru
  Start-Sleep 2
  $before = @(Get-ChildItem $csvDir -Filter *.csv -ErrorAction SilentlyContinue | ForEach-Object FullName)
  $arguments = @("-windowed", "-ResX=1600", "-ResY=900", "-NoSound", "-log", "-ExecCmds=`"t.MaxFPS 0, r.VSync 0, DisableAllScreenMessages`"")
  if ($RecordPSO) { $arguments += "-logPSO" } else { $arguments += "-csvCaptureFrames=1000000" }
  $game = Start-Process $exe -ArgumentList $arguments -PassThru
  Start-Sleep $Seconds
  # A clean exit writes the PSO log and the CSV capture.
  $game.CloseMainWindow() | Out-Null
  if (-not $game.WaitForExit(30000)) { $game.Kill(); Write-Host "  (renderer did not exit cleanly)" -ForegroundColor Yellow }
  Stop-Process -Id $relay.Id -Force -ErrorAction SilentlyContinue
  if (-not $RecordPSO) {
    $new = Get-ChildItem $csvDir -Filter *.csv -ErrorAction SilentlyContinue | Where-Object { $before -notcontains $_.FullName } | Sort-Object LastWriteTime | Select-Object -Last 1
    if ($new) { Summarize $new.FullName $label } else { Write-Host "  no CSV capture written" -ForegroundColor Yellow }
  }
}

$log = Join-Path $saved "Logs\GridironDemo.log"
$cacheLines = Select-String $log -Pattern "PipelineCache|ShaderPipelineCache" -ErrorAction SilentlyContinue | Select-Object -Last 4
if ($cacheLines) { Write-Host "Pipeline cache (last run):"; $cacheLines | ForEach-Object { "  " + ($_.Line -replace '^\[[^]]*\]\[[^]]*\]', '') } }
if (-not $RecordPSO) { exit 0 }

# --- Turn the recording into the bundled cache ---
$records = @(Get-ChildItem (Join-Path $saved "CollectedPSOs") -Filter *.rec.upipelinecache -Recurse -ErrorAction SilentlyContinue)
if (-not $records) {
  if (Select-String $log -Pattern "falling back|fall back to RHI D3D11" -Quiet) { Fail "The renderer ran on D3D11 (D3D12 device creation failed), which has no PSOs to record." }
  Fail "No PSOs were recorded under $saved\CollectedPSOs."
}
$stage = Join-Path $env:LOCALAPPDATA "GridironUE\GridironDemo"
$keys = @(Get-ChildItem (Join-Path $stage "Saved\Cooked") -Include *.shk, *.scl.csv -Recurse -ErrorAction SilentlyContinue | Where-Object { $_.Name -like '*-GridironDemo-*' })
if (-not $keys) { Fail "No shader stable keys (ShaderStableInfo-GridironDemo-*.shk) under $stage\Saved. Package again so the cook writes them (NeedsShaderStableKeys)." }
$out = Join-Path $root "unreal\GridironDemo\Build\Windows\PipelineCaches"
New-Item -ItemType Directory -Force $out | Out-Null
$editor = Join-Path $EngineDir "Engine\Binaries\Win64\UnrealEditor-Cmd.exe"
# One cache per shader format the cook produced (ShaderStableInfo-<Project>-<Format>.shk).
foreach ($group in ($keys | Group-Object { ($_.BaseName -replace '\.scl$', '') -replace '^.*-GridironDemo-', '' })) {
  $format = $group.Name
  $spc = Join-Path $out "GridironDemo_$format.spc"
  Write-Host "==> Building $spc from $($records.Count) recording(s)" -ForegroundColor Cyan
  $toolArgs = @("`"$(Join-Path $stage 'GridironDemo.uproject')`"", "-run=ShaderPipelineCacheTools", "expand") + ($records | ForEach-Object { "`"$($_.FullName)`"" }) + ($group.Group | ForEach-Object { "`"$($_.FullName)`"" }) + @("`"$spc`"", "-unattended", "-nullrhi")
  $tool = Start-Process $editor -ArgumentList $toolArgs -Wait -PassThru -NoNewWindow
  if ($tool.ExitCode -ne 0 -or -not (Test-Path $spc)) { Fail "ShaderPipelineCacheTools failed for $format (exit $($tool.ExitCode))." }
  Write-Host "  $([Math]::Round((Get-Item $spc).Length / 1KB)) KB" -ForegroundColor Green
}
Write-Host "Recorded. Package again (package.ps1) to bundle the cache, then run perf.ps1 to compare." -ForegroundColor Green
