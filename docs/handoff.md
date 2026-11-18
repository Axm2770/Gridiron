# Developer handoff — 0.18.1

The current game includes the earlier franchise expansion, news/inbox/social views, player development, scouting, staff compliance, board decisions, records, ranked awards and the procedural 3D touchline presentation. This update adds a date-driven calendar, staff delegation and an Electron desktop shell. It does not replace the match engine with a commercial animation engine.

## Start here

`npm ci`, `npm run serve`, then open http://localhost:4173. `npm test` runs all regression suites. `npm start` launches the desktop shell on a supported graphical host. No backend or API key is needed. The game bundles its JavaScript and Three.js locally; selected external portraits/logos may need internet access.

| Area | Entry points |
| --- | --- |
| Bootstrap / career / UI | `dist/game.js`, `dist/stadium.js`, `dist/franchise/ui.mjs`, `dist/franchise/career-manager.mjs` |
| Save migration / contracts / compliance | `state.mjs`, `contracts.mjs`, `compliance.mjs`, `staff.mjs` under `dist/franchise/` |
| Season / fixtures / fast match | `lifecycle.mjs`, `fast-worker.mjs`, `history.mjs` |
| Calendar | `calendar-core.mjs`, `calendar-operations.mjs`, `calendar-ui.mjs` |
| Boardroom / Tactics / Locker room | `boardroom.mjs`, `game-plan.mjs`, `locker-room.mjs`, `front-office-ui.mjs`, `dist/front-office.css` |
| News / inbox / conversations | `newsroom.mjs`, `office-ui.mjs`, `career-scenes.mjs`, `world.mjs` |
| Ownership / reputation / awards | See `docs/upgrade-architecture.md` |
| Execution / officiating / rendering | `dist/engine/`, `dist/stadium.js`, `dist/match.js` |
| Native app | `desktop/main.cjs`, `desktop/protocol.cjs`, `scripts/package-desktop.mjs` |
| Event log / social engine / depth systems / Hub UI | `event-bus.mjs`, `social-engine.mjs`, `depth-systems.mjs`, `dashboard-ui.mjs`, `dist/ui/` — see `docs/overhaul-architecture.md` |
| Arrivals, pixel-art cutscenes and news cards | `arrivals.mjs` diffs rosters and head coaches against `franchise.arrivals` (keyed to the career's coach profile) and emits own-club `Signing` / `CoachingMove` events plus newsroom `card` stories; `presentation/pixel-art.mjs` draws the sprites, cards and 2D scenes; styles in `dist/ui/pixel-art.css` |

Paths in the table without a directory are under `dist/franchise/`. Consult exports directly rather than assuming an unseen API. Older implementation notes in README describe historical releases; this file and the calendar guide describe the current date-based holiday path.

## Persisted additions

`franchise.calendarSim` holds `version`, `date`, `nextRoundDate`, idempotent `completed` round keys, dated `events`, the holiday `session`, and `offseasonDays`. A session records target, start, status, rounds and days. Reloading an interrupted session pauses it for explicit resumption.

`franchise.delegation` is no longer read; saves that carry it load unchanged. `franchise.boardroom` keeps any old `requests`/`permits` untouched and adds `mandate`, `mandateYear` and a bounded `decisions` list. Ownership no longer issues permits: trades, staff changes and facility projects run directly under the usual role, cash and compliance checks.

Calendar advancement increments the reputation/cooldown action clock once per elapsed day. Existing legacy weekly saves derive an initial date from their saved season/week; they do not recover an unavailable real-world fixture date. League dates are modeled for the generated schedule.

`franchise.matchups` (`matchups.mjs`) holds `version` and `games`: every settled league game as `{year, phase, week, a, b, score, final?}`, appended by `finishRound` and backfilled idempotently from the live schedule and bracket for saves that predate it. Schedules are replaced each season, so this log is the only cross-season score history; it feeds head-to-head records (Schedule & calendar) and the Super Bowl list (Records & milestones). Historical seasons before the career have champion and game MVP only.

## Navigation

The sidebar groups live in `presentation.mjs` (`NAV_GROUPS`). Retired routes (Schedule, Archives, Hall of Fame, Awards) are `ROUTE_ALIASES` that open the absorbing screen on a tab; `navigation-ui.mjs` owns those tabs (`window.Nav`), the League snapshot and the Records hub. `W.open(route, tab)` accepts an optional tab; `W.back()` follows the in-app trail (also Alt+Left and the mouse back button). `RELATED` lists the quick jumps shown under each title.

## Match simulator

`engine/execution.mjs` lines up real special-teams units for `Punt` and `Field goal` (`buildActors` kick branch: kicker/punter, holder or personal protector, long snapper, wings or gunners, returner) and choreographs the snap, hold or punt, protection and punt coverage without drawing random numbers, so kick outcomes are the same as before. Runs carry a `scheme` (inside zone, outside zone, power, counter; counter only with the back behind the quarterback). Blockers take assignments from the front, pull, engage and drive defenders; engaged defenders move with the block. Defenders pursue on intercept angles and the tackle is a `Contact` event followed by `Tackle` 0.28–0.45 s later from the same `tacklerIndex`; the 3D rig animates that defender. Run, pass and kick yardage stays inside the calibration ranges.

Playcalling is shared by live coaching (`engine-bridge.mjs`) and the fast worker through `franchise/play-calling.mjs`: `staffDecision` (fourth-down rules, directives, a style-tilted early-down mix; Balanced runs every third snap with a 12% shot rate), `manualCall` (a selected call repeats on downs 1–3 only; punts, field goals and fourth downs need a pick made since the last snap, tracked as `live.callSerial`), and `withPossessionTempo` (hurry-up/chew clock apply to the user's possessions only). The halftime directive applies only to the user's game. Live fatigue drains on-field players 0.3 per snap to a 60 floor. `test-user-team-scoring.mjs` checks the user club in HC/OC/DC careers and a full season's distribution (about 22 points per team, max under 70, margins over 35 under 3%, shutouts under 3%). Saves get two idempotent repairs in `migrate`: a stuck Punt/Field goal live call, and (once, `franchise.repairs.liveFatigue`) condition below 85 from the old drain.

Simulator options (`presentation/sim-options.mjs`, localStorage `gridiron-sim-options`): instant replays of big plays, replay speed, game speed, matchday intro, spoken commentary and caption verbosity. They are per device and never touch saves or results. `presentation/match-intro.mjs` plays the skippable pre-kickoff open once per fixture (a static card under reduced motion). The 3D canvas renders at full device resolution in the pixel theme.

## Tests added

`test-match-motion.mjs` covers kick units and coverage, the four run schemes (blocks and pulls), pursuit angles, contact before every tackle, and a speed bound that catches teleporting players. `test-sim-options.mjs` covers option persistence and validation, caption verbosity, instant-replay selection and the intro card.

`test-calendar.mjs` covers exact dates, migration, pausing for urgent decisions, no automatic training camp, idempotency, round/date boundaries, offseason market timing, persistence and actual calendar rendering. `test-desktop.mjs` covers local protocol serving, MIME/CSP, path and symlink rejection, sandbox settings and packaging configuration. All 23 suites passed on Linux. A browser holiday reached the exact requested return date and completed its due game with a staff activity report.

`test-matchups.mjs` covers head-to-head tallies, streaks and ordering, a full season through `finishRound`, backfill idempotency, the final-game flag and the championship list.

## Remaining release work

The 0.18.1 Apple Silicon and Intel ZIPs replace the old cross-packaged 0.18.0 downloads. Native matching macOS runners apply ad-hoc signatures, verify codesign, and launch the app before and after ditto ZIP extraction. The launch test exercises the actual career workspace, module imports, database fetch, IndexedDB and a real one-play simulation worker. Both architectures passed in GitHub Actions run 40604561247. Desktop packaging now rejects non-Mac hosts. Startup errors are visible and logged. macOS 13 or newer is required. Developer ID signing/notarization and an automatic updater remain outstanding.

The public source repository is https://github.com/Axm2770/Gridiron. Coding models can clone it or read the files directly; begin with AGENTS.md. The source archive is also complete and can be imported with file access. Public visibility allows unauthenticated reading; writes still require the owner’s authorization. Repository visibility does not grant rights to third-party NFL branding or likenesses. GitHub Actions runs all regression suites on main-branch pushes and pull requests. The separate macOS desktop workflow is available from the Actions tab or a v* tag.

## Trades, free agency and scouting (roster-trades)

- `market.mjs` owns `marketWindows(s)` (trade, free-agency and draft windows with exact dates from `calendar-core.mjs`), `tradeBlockers` (role, window, cooldown, no-trade, cap, roster; each `{ reason, fix }`), `evaluateTrade`, `estimatedAsk` and `suggestPackage`. Trades involving 88+ players are no longer gated by a boardroom permit; value, cap and roster checks decide.
- `blockers.mjs` holds the shared wording and fixes (cap shortfall names a release or restructure). `contracts.offerBlockers` explains free-agent offers before the meeting.
- `scouting.mjs` is the fog of war. Own players, starters and 80+ veterans are exact; other players and every prospect show ranges that always contain the truth and narrow as confidence rises. Prospect confidence stays in `franchise.reports`. New persisted state: `franchise.scoutDesk = { version, knowledge: { [playerId]: { confidence, reports, last } }, requests: [], delivered: [] }`, created on first use. Requests are due `REPORT_DAYS` after the calendar date; `calendar-core.advanceDate` delivers them to the Inbox (category Scouting).
- In season, `world.settleMarketRound` runs two market days per settled round (idempotent per round key in `market.settled`), so free-agent offers and waiver claims resolve without manual clicks. "Next market day" moves the calendar one day and shows a digest of what happened.
- The scouting card (`scout-card-ui.mjs`, `Scout.open(id)`) is the single place to judge a player and trade for him, offer a contract or draft him.
- Market realism (`test-market-realism.mjs`). A player's value is `core × (1 + Σ factor %) − salary cost`, where `tradeFactors(s, p, club)` lists readable factors: age against the position's peak (`PEAK_AGE`), what the club's mode wants (rebuilders: youth and picks; contenders: proven players, deadline push), current injury, joint wear and recent injuries, overpaid or expiring deals, positional need ("They need a CB", "Stacked at QB: he'd be their 4th") and character (troublemakers discounted, leaders liked). Selling clubs add `sellFactors`: fan favourite +12%, franchise icon +30%, captain +8%, a legend is untouchable unless the club is rebuilding or he is 33+, a trade demand −15%, a troublemaker −12%, dead money, contenders not selling starters mid-season. `evaluateTrade` returns `factors` (`{ text, points, pct, tone, side }`, signed from the user's side), `untouchable`, `gap` and a pick-or-reserve `counter` (one or two assets). Standing, injury and conduct live in `market-profile.mjs`; tenure reads the optional `player.joined = { team, year }` (written by trades and free-agent signings), then the transaction log, then an estimate from experience and loyalty, so older saves need no migration. `player.controversy` (0–1) and `player.injuryHistory` are honoured when present but never required.
- Free agents (`signingFactors`) weigh role by ambition and age (young players want to start), contention by age (veterans chase rings), coach prestige, scheme fit and a return to a former club; money-first players discount the rest. Its `reasons` are shown in the Free agents table and the contract meeting, and a lost bid names what swung it (`signingEdge`). CPU clubs no longer bid for players they would bury on the depth chart.
- The player profile's "Trade for <name>" calls `Ops.tradeFor(id, team)` → `applyTradeFor` (ops-ui): partner selected, player ticked in You receive, suggested package in You send. The trade builder shows the partner's reasoning live; styles are in `dist/market.css`.
- Next Generation was removed (view, navigation entry, styles). It stored no state of its own, so saves need no migration.
