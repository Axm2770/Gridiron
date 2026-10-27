# Calendar, staff holidays and desktop application

## Calendar workflow

Open **Calendar & holiday**. Select a day in the month grid or enter a return date, enable staff handling, and choose **Simulate to date**. Shortcuts advance one day, one week or four weeks. Scheduled games due on the target date finish before the holiday returns. The simulation never skips a pending fixture to reach the target.

**Stop simulation** pauses at a safe day/game boundary; **Resume** retains the target. Closing and reopening a career pauses an unfinished holiday. A 730-day limit bounds a single request. A partially played live match must finish before a new calendar holiday can begin.

**Staff responsibilities** controls inbox decisions, press conferences, meetings, rumor responses, roster registration, offseason progression and presentation of existing board proposals. An available assistant head coach is first in line, followed by head coach, coordinators and senior staff. The user-controlled coach is excluded. A preferred deputy can override the usual order. With no eligible staff, delegation cannot start.

Staff use the same underlying actions as manual play: correspondence replies change morale, conversations record responses, press conferences affect club confidence, and roster actions incur actual contractual consequences. The holiday report records who acted and when. No automatic action spends an approved ownership proposal's final financial commitment; that remains in the board record. Strict cap/roster failures pause rather than overriding registration. Disable delegation to pause for urgent correspondence instead.

The generated calendar models offseason windows, draft, camp and postseason timing; it is not the published NFL fixture calendar. It supports the game's own regular/postseason schedules and passed league-rule changes.

## Mac application

The release ZIP contains **Gridiron Director.app**. Choose arm64 for Apple Silicon or x64 for Intel. Extract the ZIP and move the app to Applications. These development builds are unsigned/unnotarized; macOS may require a developer-signed release under its normal security policy. Native launch has not been verified on this Linux build host.

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

ZIP outputs are under `release/`. On a Mac, `npm run dist:mac` also creates DMG installers. Signing/notarization need an Apple Developer identity and a configured macOS release pipeline. The current workflow deliberately does not claim those credentials.

Run the **macOS desktop builds** GitHub Actions workflow after pushing the source, or push a `v*` tag. It uploads ZIP/DMG artifacts for 30 days. It does not publish a GitHub Release automatically. Keep the pinned lockfile; production web hosting continues to serve `dist/` independently of Electron.

To prepare a portable source handoff, run `npm run source:archive`. The ZIP excludes dependencies, compiled apps, Git internals, local environment files and its own output. It includes the lockfile, tests, documentation, workflows and `AGENTS.md`.
