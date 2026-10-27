# Developer handoff — 0.18.1

The current game includes the earlier franchise expansion, news/inbox/social views, player development, scouting, staff compliance, board decisions, records, ranked awards and the procedural 3D touchline presentation. This update adds a date-driven calendar, staff delegation and an Electron desktop shell. It does not replace the match engine with a commercial animation engine.

## Start here

`npm ci`, `npm run serve`, then open http://localhost:4173. `npm test` runs all regression suites. `npm start` launches the desktop shell on a supported graphical host. No backend or API key is needed. The game bundles its JavaScript and Three.js locally; selected external portraits/logos may need internet access.

| Area | Entry points |
| --- | --- |
| Bootstrap / career / UI | `dist/game.js`, `dist/stadium.js`, `dist/franchise/ui.mjs`, `dist/franchise/career-manager.mjs` |
| Save migration / contracts / compliance | `state.mjs`, `contracts.mjs`, `compliance.mjs`, `staff.mjs` under `dist/franchise/` |
| Season / fixtures / fast match | `lifecycle.mjs`, `fast-worker.mjs`, `history.mjs` |
| Calendar / delegation | `calendar-core.mjs`, `calendar-operations.mjs`, `delegation.mjs`, `calendar-ui.mjs` |
| News / inbox / conversations | `newsroom.mjs`, `office-ui.mjs`, `career-scenes.mjs`, `world.mjs` |
| Ownership / reputation / awards | See `docs/upgrade-architecture.md` |
| Execution / officiating / rendering | `dist/engine/`, `dist/stadium.js`, `dist/match.js` |
| Native app | `desktop/main.cjs`, `desktop/protocol.cjs`, `scripts/package-desktop.mjs` |

Paths in the table without a directory are under `dist/franchise/`. Consult exports directly rather than assuming an unseen API. Older implementation notes in README describe historical releases; this file and the calendar guide describe the current date-based holiday path.

## Persisted additions

`franchise.calendarSim` holds `version`, `date`, `nextRoundDate`, idempotent `completed` round keys, dated `events`, the holiday `session`, and `offseasonDays`. A session records target, start, delegation mode, status, rounds and days. Reloading an interrupted session pauses it for explicit resumption.

`franchise.delegation` holds preferences, an optional preferred deputy ID, bounded action history and seen-operation keys. Existing careers receive available assistant-head-coach candidates; existing vacancies remain vacant. New careers seed an AHC. Staff `userControlled`, suspended, unavailable or expired entries cannot act as the deputy.

Calendar advancement increments the reputation/cooldown action clock once per elapsed day. Existing legacy weekly saves derive an initial date from their saved season/week; they do not recover an unavailable real-world fixture date. League dates are modeled for the generated schedule.

## Tests added

`test-calendar-delegation.mjs` covers exact dates, migration, deputy fallback, actual inbox responses/consequences, press conferences, absent staff, idempotency, round/date boundaries, offseason market timing, persistence and actual calendar rendering. `test-desktop.mjs` covers local protocol serving, MIME/CSP, path and symlink rejection, sandbox settings and packaging configuration. All 23 suites passed on Linux. A browser holiday reached the exact requested return date and completed its due game with a staff activity report.

## Remaining release work

The 0.18.1 Apple Silicon and Intel ZIPs replace the old cross-packaged 0.18.0 downloads. Native matching macOS runners apply ad-hoc signatures, verify codesign, and launch the app before and after ditto ZIP extraction. The launch test exercises the actual career workspace, module imports, database fetch, IndexedDB and a real one-play simulation worker. Both architectures passed in GitHub Actions run 40604561247. Desktop packaging now rejects non-Mac hosts. Startup errors are visible and logged. macOS 13 or newer is required. Developer ID signing/notarization and an automatic updater remain outstanding.

The public source repository is https://github.com/Axm2770/Gridiron. Coding models can clone it or read the files directly; begin with AGENTS.md. The source archive is also complete and can be imported with file access. Public visibility allows unauthenticated reading; writes still require the owner’s authorization. Repository visibility does not grant rights to third-party NFL branding or likenesses. GitHub Actions runs all regression suites on main-branch pushes and pull requests. The separate macOS desktop workflow is available from the Actions tab or a v* tag.
