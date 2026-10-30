<#
  Publishes the packaged Unreal renderer for the in-game download (desktop/renderer-installer.cjs).
  Run package.ps1 first (it produces unreal\Build\Windows). This zips that folder, writes
  renderer-manifest.json (version, size, sha256, protocol) and, with the GitHub CLI signed in,
  uploads both to the release tagged "renderer". That release is a pre-release on purpose: the
  in-game updater reads releases/latest, which must keep pointing at real game versions.

  Usage (from the repository root):
    powershell -ExecutionPolicy Bypass -File unreal\Tools\publish-renderer.ps1 -Version 1.0.0
    powershell -ExecutionPolicy Bypass -File unreal\Tools\publish-renderer.ps1 -Version 1.0.0 -NoUpload
#>
param(
  [Parameter(Mandatory = $true)][ValidatePattern('^\d+\.\d+\.\d+$')][string]$Version,
  [switch]$NoUpload,
  [string]$Repo = "Axm2770/Gridiron",
  # Path to gh.exe when it is not on PATH (for example a portable copy).
  [string]$Gh = ""
)
$ErrorActionPreference = "Stop"
$root = Resolve-Path (Join-Path $PSScriptRoot "..\..")
$build = Join-Path $root "unreal\Build\Windows"
$out = Join-Path $root "unreal\Build\Publish"
function Fail($text) { Write-Host "`nPUBLISH STOPPED: $text" -ForegroundColor Red; exit 1 }
if (-not (Test-Path (Join-Path $build "GridironDemo.exe"))) { Fail "No packaged renderer in $build. Run unreal\Tools\package.ps1 first." }

New-Item -ItemType Directory -Force $out | Out-Null
$name = "GridironRenderer-$Version-Win64.zip"
$zip = Join-Path $out $name
if (Test-Path $zip) { Remove-Item -Force $zip }
Write-Host "==> Zipping $build" -ForegroundColor Cyan
# Windows' bsdtar writes zip when the archive name ends in .zip (-a); contents sit at the zip root.
# Debug symbols (.pdb, ~250 MB) stay out of the player download.
& "$env:SystemRoot\System32\tar.exe" -a -c -f $zip --exclude "*.pdb" -C $build *
if ($LASTEXITCODE -ne 0) { Fail "tar could not create $zip." }
$size = (Get-Item $zip).Length
if ($size -ge 2GB) { Fail ("$name is {0:N2} GB; GitHub release assets must be under 2 GB." -f ($size / 1GB)) }
$sha = (Get-FileHash $zip -Algorithm SHA256).Hash.ToLower()
$manifest = Join-Path $out "renderer-manifest.json"
$json = [ordered]@{ schema = 1; version = $Version; protocol = "gridiron.ue/1"; zip = [ordered]@{ name = $name; sha256 = $sha; size = $size } } | ConvertTo-Json -Depth 4
[IO.File]::WriteAllText($manifest, $json, (New-Object Text.UTF8Encoding $false))
Write-Host ("Renderer {0}: {1:N0} MB, sha256 {2}" -f $Version, ($size / 1MB), $sha.Substring(0, 12))

if ($NoUpload) { Write-Host "Not uploaded (-NoUpload). Files: $out"; exit 0 }
$gh = if ($Gh) { $Gh } else { (Get-Command gh -ErrorAction SilentlyContinue).Source }
if (-not $gh) { Fail "GitHub CLI (gh) not found. Install it (winget install GitHub.cli), run 'gh auth login', or upload $zip and $manifest to the 'renderer' release by hand." }
# gh reports "release not found" on stderr; under Stop, Windows PowerShell 5.1 would treat that
# as fatal. Rely on exit codes for the gh calls instead.
$ErrorActionPreference = "Continue"
& $gh release view renderer --repo $Repo *> $null
if ($LASTEXITCODE -ne 0) {
  & $gh release create renderer --repo $Repo --prerelease --latest=false --title "Unreal match view (renderer)" --notes "Optional 3D match view for Windows, downloaded from inside the game. Not a game release."
  if ($LASTEXITCODE -ne 0) { Fail "Could not create the 'renderer' release." }
}
# Replace the previous renderer files so the release only ever holds the current one.
$old = & $gh release view renderer --repo $Repo --json assets --jq '.assets[].name'
foreach ($asset in $old) { if ($asset -like "GridironRenderer-*-Win64.zip" -or $asset -eq "renderer-manifest.json") { & $gh release delete-asset renderer $asset --repo $Repo --yes } }
& $gh release upload renderer $zip $manifest --repo $Repo
if ($LASTEXITCODE -ne 0) { Fail "Upload failed." }
Write-Host "Published renderer $Version to the 'renderer' release." -ForegroundColor Green
