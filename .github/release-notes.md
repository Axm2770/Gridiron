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

## Updates without re-downloading

The game now updates itself completely in-game, including releases that change the desktop app itself. When a new version is out, a bar appears in the corner. Choose **Download now**, then **Restart now** (or **When I quit**), and the game installs the new version and reopens. Your careers are untouched. Downloads are checked against the release's published checksums before anything is installed, and if an install fails the previous version is put back.

Game-content updates still download only the files that changed and only need a reload.

**One last manual download:** 0.23.0 and earlier can't install this kind of update yet, so download this version once from this page. From here on, updates arrive in-game.

If the game can't replace itself (for example a Mac copy still running from the Downloads folder, or a folder you don't have write access to), it links to this page instead. On macOS, move **Gridiron Director.app** into Applications to get in-game updates.

## Match day

- The 3D match view is sharp again.
- Field goals and punts line up with real kick units.
- Runs use real schemes with blocking.
- Defenders chase and make contact before tackling, instead of jumping onto the ball carrier.
- A skippable intro opens every matchday.
- **Sim options** let you turn instant replays on or off and set replay speed, game speed and commentary.

## Cutscenes and news

- Cutscenes and the news feed have a pixel-art style.
- New signings hold up their jersey in a signing scene, and a new head coach gets an arrival scene.
- The newsroom and fan debates have far more variety.

## Trades, free agency, scouting and the draft

- Trades work.
- Anything you can't do now tells you why, and suggests a fix where there is one.
- Free agency, trade and draft windows show their dates.
- Lesser-known players show predicted rating ranges until you scout them. Scouting reports arrive in your inbox and narrow the ranges.
- Scouting reports link straight to trade and contract offers.
- Next Generation has been folded into the Draft room.

## A simpler front office

- Delegation is gone; you make the calls.
- The Boardroom is simpler and every part of it works.
- Tactics is easier to read and adds an opponent analysis.
- The Locker room puts player morale front and centre.

## Easier to read and navigate

- Menus use a clear font, keeping the pixel frames.
- The sidebar is shorter, with working Back and breadcrumbs.
- Players open in one hub with their stats, contract and scouting.
- Calendar and Schedule are one screen, with head-to-head records against every opponent.
- Around the League is now a league snapshot.
- History, records and the Hall of Fame live in one Records & milestones screen, including a list of champions.
- Developer-only tools (the animation preview buttons, the match seed panel and the classic overview switch) are gone.
