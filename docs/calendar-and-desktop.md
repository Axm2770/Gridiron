# Calendar, staff holidays and desktop application

## Calendar workflow

Open **Calendar & holiday**. Select a day in the month grid or enter a return date, and choose **Simulate to date**. Shortcuts advance one day, one week or four weeks. Scheduled games due on the target date finish before the holiday returns. The simulation never skips a pending fixture to reach the target.

**Stop simulation** pauses at a safe day/game boundary; **Resume** retains the target. Closing and reopening a career pauses an unfinished holiday. A 730-day limit bounds a single request. A partially played live match must finish before a new calendar holiday can begin.

There is no staff delegation. The calendar pauses whenever an urgent inbox decision, press conference, conversation or roster problem needs you, and the offseason stops before training camp until you complete the draft and start the new season yourself. Older saves may still contain `franchise.delegation`; it is ignored.

The generated calendar models offseason windows, draft, camp and postseason timing; it is not the published NFL fixture calendar. It supports the game's own regular/postseason schedules and passed league-rule changes.

## Mac application

The release ZIP contains **Gridiron Director.app**. Choose arm64 for Apple Silicon or x64 for Intel. Extract the ZIP and move the app to Applications. Version 0.18.1 replaces the old Linux-packaged ZIPs with native macOS builds. Each app receives an ad-hoc signature and is launch-tested on the matching processor before and after ZIP extraction. A test run loads the real career workspace, database, IndexedDB and simulation worker. Builds still lack Apple Developer ID notarization, so macOS may request approval under its normal security policy. macOS 13 or newer is required by the bundled Electron version.

The desktop shell loads bundled game assets through a restricted local protocol with IndexedDB, module-worker and save support. Native menu options include reload, window controls and the local save-data folder. Browser careers and desktop careers are separate; use the game's full career export/import to transfer them. A database pack is not a full-career backup.

## Build from source

Use Node 24 LTS and npm:

```sh
npm ci
npm test
npm start
npm run package:mac:arm64
npm run package:mac:x64
```

ZIP outputs are under `release/`. Mac release packaging is intentionally blocked on non-Mac hosts. On a Mac, `npm run dist:mac` also creates DMG installers; the release workflow uses the ZIP pipeline with its native launch checks. Signing/notarization need an Apple Developer identity and a configured macOS release pipeline. The current workflow deliberately does not claim those credentials.

Run the **macOS desktop builds** GitHub Actions workflow after pushing the source, or push a `v*` tag. It uploads separately tested Apple Silicon and Intel ZIP artifacts for 30 days. Changes to the desktop shell or packaging on main also trigger it. It does not publish a GitHub Release automatically. Keep the pinned lockfile; production web hosting continues to serve `dist/` independently of Electron.

To prepare a portable source handoff, run `npm run source:archive`. The ZIP excludes dependencies, compiled apps, Git internals, local environment files and its own output. It includes the lockfile, tests, documentation, workflows and `AGENTS.md`.


## Launch troubleshooting

The previous 0.18.0 ZIPs were cross-packaged without a native launch test and should be replaced with 0.18.1. Startup failures now produce a visible error and a launch log instead of leaving a hidden window. Open **Game → Open launch log** from the running app; the file is also under `~/Library/Logs/Gridiron Director/desktop-launch.log`. Normal saves continue in the existing Application Support folder; native smoke tests use isolated temporary data.
