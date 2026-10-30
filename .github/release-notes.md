<!-- The release job fills the version marker in file names with the tag's version number. -->
## Download

| Your computer | File |
| --- | --- |
| Mac with Apple Silicon (M1 or newer) | `Gridiron-Director-<version>-macOS-arm64.zip` |
| Mac with Intel processor | `Gridiron-Director-<version>-macOS-x64.zip` |
| Windows 10/11 (64-bit) | `Gridiron-Director-<version>-Windows-x64.zip` |

Not sure which Mac you have? Apple menu → **About This Mac**: "Chip: Apple M…" means Apple Silicon.

## Install

**macOS (13 Ventura or newer)**

1. Unzip and drag **Gridiron Director.app** into Applications.
2. The app is ad-hoc signed, not notarized. The first time, right-click it and choose **Open**, then **Open** again. If macOS still blocks it, open **System Settings → Privacy & Security** and click **Open Anyway**.

**Windows**

1. Unzip the whole folder anywhere (for example Documents). Keep the files together.
2. Run **Gridiron Director.exe**. The app is not code-signed, so SmartScreen may show "Windows protected your PC": click **More info → Run anyway**.

Careers are saved locally on your computer, and each install keeps its own saves. To move a browser career into the app, use **Careers & saves → Export** in the browser and **Import a career** in the app.

Every file in this release was built by GitHub Actions from this tag, passed the full regression suite, and was launch-tested (the app opened, loaded the career workspace and ran a simulation) before and after zipping.

## Updates

From 0.21.0 onwards the desktop app updates itself in-game: it checks for new releases on launch, downloads only the changed game files, verifies them, and asks you to reload. You only need to download a ZIP again when a release changes the desktop app itself; the app tells you when that happens.

## Pixel theme

The whole game has a new retro pixel look: pixel fonts, square panels with hard shadows, a pixel-art 2D field with sprite players, and a pixelated 3D stadium. It is on by default; **Settings → Interface → Pixel theme** switches back to the classic look on this device.

## Every snap plays out differently

Play calls no longer resolve to the same result every time. Each snap now varies player effort, defender reactions and pursuit angles, receiver routes and the quarterback's read:
- outside runs attack either edge and turn upfield instead of losing two yards;
- play action can freeze linebackers;
- deep balls are thrown to where the receiver will be;
- short passes gain different yardage after the catch.

Full games still land in realistic ranges.

## Match view

The Windows-only Unreal match view and its download have been removed. Matchday now opens on the 2D field, which follows every snap, score and clock change; **Switch to 3D** above the field still shows the browser 3D stadium.

This release changes the desktop app itself, so existing installs need to download the ZIP once.
