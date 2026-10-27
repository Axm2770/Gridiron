# Gridiron Director

**Project repository:** https://github.com/Axm2770/Gridiron

Start with [AGENTS.md](AGENTS.md) and [the developer handoff](docs/handoff.md) when continuing development with another coding model. Source, tests, assets and macOS packaging are included. GitHub Actions runs the regression suite on pushes and pull requests; the separate macOS workflow produces desktop builds on manual dispatch or version tags.

A buildless NFL-inspired management game with a 3D tactical match presentation and a playable, browser-local franchise loop. Serve `dist/` as static assets. No API key or backend account is required.

## Play

Open **Franchise** in the sidebar. The headquarters contains career roles, contract accounting, competitive free agency, roster designations, scouting, the draft, club finance, facilities, medical preparation, conversations, league decisions, archives, database tools, and developer controls. Existing browser saves migrate in place; a full career export is available in Database.

Use **Matchday** to call plays, adjust formations, shells and coverages, substitute, answer interviews, and watch the 3D execution. Commentary captions and optional browser speech are driven by execution events. Crowd audio is synthesized and requires Enable sound. Calendar holidays simulate to an exact selected date, using a module worker for games; they pause for invalid player availability or cap compliance. Directives influence play selection, younger-player usage, and halftime tempo. The worker and live engine share execution and match-state reduction; the live officiating adapter is not run in holiday games.

The initial legacy season retains its schedule. New seasons have 17 games over 18 weeks with a bye, or 18 over 19 following a passed rule vote. Four division winners and three wild cards per conference enter a 14-team bracket. Its top seeds receive byes; later rounds reseed. Offseason choices precede a seven-round draft and training camp. The assistant can complete unmade draft selections; active rosters must be trimmed before playing.

## Architecture and persisted data

Classic `game.js`, `match.js`, and `atmosphere.js` retain the original views. `stadium.js` imports `engine-bridge.mjs` and, after initialization, loads `franchise/ui.mjs`. Domain functions operate on explicit state, independently of the DOM. Transactions clone, mutate and validate before replacement, so rejected operations leave the save unchanged. Currency uses integer cents; UI salaries display millions.

| Module | Responsibility |
| --- | --- |
| `franchise/state.mjs` | Save migration, all 32 club rosters, role permissions, cap ledger, validation and atomic transactions |
| `franchise/contracts.mjs` | Offers, restructures, tags, releases, June accounting and CPU player-swap valuation |
| `franchise/personnel.mjs` | Active/IR/practice/elevated status, protection and claims, scouting reports, seven-round draft, trade-down and reserve recruitment |
| `franchise/world.mjs` | Bidding deadlines, tampering/open periods, waivers, conversations, facilities, relocation, owner traits, sanctions, rule votes and staff appointments |
| `franchise/lifecycle.mjs` | Weekly progression, byes, playoff seeding, championship, rollover, incentives, expiries, retirements, coaching carousel and new seasons |
| `franchise/history.mjs` | Historical champion seed, play-derived statistics, simulated awards, season archives and records |
| `franchise/database.mjs` | Validated JSON/CSV database packs and embedded image branding |
| `franchise/fast-worker.mjs` | Headless, seeded full-game execution and per-player statistical accumulation |
| `franchise/ui.mjs` | Franchise views, transaction forms, role-aware actions and legacy-view adapters |
| `engine/execution.mjs` | 20 Hz acceleration, routes, blocks, pursuit, reads, projectile flight, catches and contact |
| `engine/rules.mjs` | Pure score, clock, down/distance, possession, halftime and overtime reduction |
| `engine/commentary.mjs` | Event-driven captions/voice scheduling with replay and seek suppression |

The persisted root is the existing career object with `franchise.version = 1`. Own-team players remain in `state.roster`; other players live in `franchise.clubs[teamId].players`, avoiding duplicated records.

| Entity | Principal fields |
| --- | --- |
| Club | `id`, `players`, `owner {trait, age, patience}`, `cash`, `fanApproval`, `attendance`, `staff`, `stadium`, `rebrand` |
| Player | `id`, `name`, `pos`, `age`, `ovr`, `pot`, `salary`, `status`, `starter`, `injury`, `fitness`, `morale`, `persona`, `wear`, `stats[year]` |
| Staff | `id`, `name`, `role`, `rating`, `salary`, `scheme`, `years`, `compEligible` |
| Contract | `playerId`, `team`, `start`, `years`, `base[]`, `bonus`, `prorate`, `guarantees[]`, `roster[]`, `workout[]`, `incentives[]`, `voidYears`, `noTrade`, `restructureBonuses[]`, `ended` |
| Match | `a`, `b`, `score[]`, `quarter`, `clock`, `poss`, `spot`, `down`, `toGo`, `stats[]`, `events[]`, `settings`, `last.execution`, `finished` |
| Execution | `seed`, `playId`, `tickRate`, `actors[]`, `events[]`, `frames[]`, `duration`, `result` |

## Implemented financial and personnel rules

The cap ledger includes live commitments, bonus proration, retained dead money, rollover and incentive reconciliation. Contract forms expose base, signing/roster/workout bonuses, guarantees, void years, LTBE/NLTBE incentives and no-trade clauses. Restructures shift current base into future prorated charges. Release previews and post-June splits show retained charges. Offers settle against CPU competition after decision deadlines; they cannot bind during the tampering period. Trade acceptance checks valuation, clauses, deadline and both caps.

Roster controls implement 53 active players, up to two weekly elevations, 16 practice-squad places, four protections, three elevations per player and four-week IR absence. Weekly protection affects simulated poaching. Game entry checks cap, active limits and healthy positional minimums. Scouting points purchase confidence-building reports, combine testing, pro days, medical checks and up to 30 private visits. Draft sanctions remove actual picks; trade-downs and compensation add future capital. Staff and facility choices affect preparation, cost and recruitment.

Owner/GM/HC/OC/DC permissions gate transactions and tactical controls. Coordinator reputation can unlock an HC interview. Profile appearance colors, origins and archetypes persist; skill points affect development, match ratings or offer appeal. Interviews affect individual morale, fan approval, owner patience and opponent motivation. Holdouts and trade demands can be addressed through player meetings. Forced developer events include ownership sales and fictional sanctions.

## Presentation

Locally bundled Three.js r160.1 (MIT, see `dist/vendor/THREE-LICENSE.txt`) renders articulated procedural players, officials, crowd, field branding and stadium lighting. A Canvas software renderer projects the scene when WebGL is unavailable. Cameras include broadcast, end zone, player, tactical and orbit views. Playback supports pause, rate changes, seeking and replay; visual playback never changes the game result. The characters and animations are stylized procedural assets, without licensed motion capture or a commercial animation library.

## Database packs

JSON v1 supports `players`, `teams` and `history`. Player records require `id`, `teamId`, `name`, `pos`, `age`, `ovr`, `pot` and `salary`. CSV accepts the same player columns, including quoted fields. Team IDs follow the existing 0–31 order. Safe embedded PNG/JPEG/WebP logos appear in UI and field branding. Imports preview the number of replacements and validate IDs, positions, ranges, money and branding before application. A sparse imported roster must still satisfy match eligibility. Database packs rebuild basic contracts; they are not full-career restore files.

Historical champion identities for seasons 1966–2025 are seeded separately from simulated results. Source: NFL 2025 Minnesota Vikings Media Guide, All-Time Super Bowl Results; NFL Super Bowl LX results. Detailed real-world individual statistics and historical rosters require an imported database. Simulated statistics produce awards, All-Pro/Pro Bowl selections, records, biographies and a simplified retirement/Hall of Fame pipeline.

## Validation

Run:

```sh
node test.cjs
node test-match.cjs
node test-officials.cjs
node test-football-motion.mjs
node test-human-rig.mjs
node test-playback.mjs
node test-execution.mjs
node test-franchise.mjs
```

Franchise checks cover migration, integer-cent bonus distribution, cap rejection and rollback, role gates, bidding, release accounting, roster/IR/elevations, scouting, unsafe imports, seeded worker equality, defensive statistics, byes, 14-team brackets, sanctioned draft picks, expiry and a five-season roster/draft/retirement soak. Existing animation, commentary, officiating and live-match suites remain independent regression checks.

## Current simulation limits

This is a playable first implementation of the franchise modules, not a complete commercial NFL rules engine. Contract pricing, guarantees, tags, compensatory formulas, practice-squad agreements, council decisions, awards and Hall of Fame selection use disclosed simulation approximations. Exclusive/non-exclusive negotiation compensation, RFA matching/tenders, full CBA top-51 accounting, detailed realignment, complete historical individual records, advanced scouting regions/coaching trees, and cinematic avatar models are not fully implemented. The round-robin schedule does not reproduce the NFL scheduling formula. Contact uses proximity/attributes; quarterback/rushing balance and multi-year financial calibration need further tuning. There are automatic extra points, selected automatic penalties, no challenge system and simplified special teams/overtime. The holiday worker does not reproduce the live penalty adapter. Saves are browser-local and subject to browser storage limits; career exports provide a backup, while database imports are distinct from career restoration.

## Branding

Independent, unlicensed fan simulation. NFL and team names/logos remain their owners' marks. Existing logos were retrieved from ESPN's team-logo CDN. No NFL, ESPN, Madden, Football Manager or Sports Interactive license, endorsement or sponsorship is claimed. Importing a database or logo does not grant rights.

References:
- https://www.footballmanager.com/fm26/features/where-storytelling-evolves-fm26s-match-day-experience
- https://www.nfl.com/legal/terms/
- https://operations.nfl.com/calendar-events/nfl-free-agency/contract-language

## Workspace and real-roster update

The new presentation layer is `franchise/presentation.mjs` with `workspace.css`: grouped sidebar navigation, a decision-focused club dashboard, instant squad/unit/status filters, sortable/searchable management tables, player profile drawers, global league/player search (Cmd/Ctrl+K), compact density, mobile navigation and batched browser saves. Existing careers are retained; a new real-roster career is available with a backup action before replacement. New untouched careers default to the bundled real roster snapshot.

`dist/data/nfl-rosters.json` records the 2026 ESPN team-roster snapshot captured on October 25, 2026, with source URLs/timestamps for every team. `scripts/refresh-rosters.py` refreshes factual identities. The source snapshot contains 2,556 unique records; the playable import fits practice-squad records to the simulation's 16-player limit. Real names, positions, jersey numbers, colleges and portrait URLs are preserved. Ratings use the documented EA snapshot where a player can be matched by name, position and team, with bounded production/development adjustments; unmatched grades, potential, annual cap budgets, contracts, personality, injuries/recovery durations and subsequent events remain modeled game data. Free agents and future draft classes remain generated. No NFL/NFLPA licensing is claimed.

Commentary uses situational down/distance, named players and confirmed outcomes, with varied football phrasing. `engine/voice.mjs` ranks available English voices, offers voice/speed controls, finishes phrases instead of cancelling at every event, and coalesces queued outcomes. Caption-only operation remains supported. Voice quality depends on the user's browser/OS; no recorded professional commentator or voice imitation is included. Replay, scrubbing and background-page speech are suppressed.

`node test-presentation-upgrade.mjs` checks the complete roster schema, all-team game eligibility and cap compliance, real identities/jersey numbers, database metadata round-tripping, a full real-player game, contextual/kicking commentary, speech queue behavior, voice selection and replay/seek suppression. Browser QA covers desktop and a 390-pixel mobile viewport, squad filtering, profile actions, global search and real-player live-match commentary. The QA browser has no installed English voice list, so audible voice quality could not be assessed there.

## Matchday quick simulation

`franchise/matchday-sim.mjs` adds pregame simulation starts and an in-match target bar: one play, five plays, next possession change, quarter end, halftime, starts of Q2/Q3/Q4, and the final whistle. Skips pause at the requested boundary; users can resume live coaching, adjust tactics/substitutions, take the halftime team talk, or continue simulating. Targets past halftime delegate the break. The quick-sim playcaller can choose situational calls or repeat the selected play while retaining formations, coverage, fronts, personnel, weather and tempo. The final result remains uncommitted until Postgame report advances the round.

`engine/sim-targets.mjs` defines pure stopping predicates and continuation fingerprints. The module worker retains the engine seed and serial across segments and live play. Segment statistics are deltas; application rejects stale/duplicate continuations before adding player statistics. Controls are locked while a skip runs. Active animation is finished without resolving the snap twice; stale replay data is cleared after a skip. Recaps show elapsed periods, score changes and confirmed highlights. Worker failures leave the saved match intact.

`node test-matchday-sim.mjs` covers each target, halftime/OT edge cases, starting Q3 without an extra snap, full-versus-segmented deterministic scores and player/team statistics, duplicate/stale rejection, no input mutation and no premature league progression. The worker continues to use simplified officiating as described above.


## Gridiron Stories, legends and the next generation

- `franchise/conversations.mjs` is the deterministic two-turn dialogue state machine. Player conversations, weekly team talks and coordinator briefings persist across reloads, reject duplicate/stale/null references, and affect morale, coach trust, holdouts, trade demands and tactical directives. A promised role review is due next week; a missed review costs trust and morale. Pre/postgame and halftime scenes call the existing interview/halftime domain actions exactly once after the final response.
- `franchise/career-scenes.mjs` supplies animated **3D character scenes**, with establishing/reaction shots, office/locker room/film room/press theatre environments, keyboard choices (1–3), reduced-motion support, conversation history and resumable scenes. The shared `character-stage.mjs` supplies complete articulated characters, clothing, accessories, room geometry, lighting and camera cuts. These are original stylized 3D characters, not motion-captured or photoreal player likenesses. Factual player photos remain separate identity portraits in the dialogue UI. Real-player dialogue and all career controversies are explicitly fictional.
- Hall of Fame has 13 curated historical player/coach/founder profiles, locally bundled images, factual statistics, original summaries, achievements and links to the Pro Football Hall of Fame's individual biographies. It is searchable and filterable. Simulated retirees retain photos/faces, complete save statistics and awards; worthy candidates (120 legacy points, position-sensitive production plus awards) are inducted after a five-season wait. The game does not claim an official real-world induction for simulated candidates.
- `data/madden-ratings.json`: 1,941 unique EA player entries captured October 25, 2026 from **Madden NFL 27 Week 6**. Of the current playable ESPN identities, 1,901 match. Same-name ambiguity is resolved by position/team; ambiguous unmatched identities retain an original grade. The source snapshot retains raw numeric attributes. Runtime uses 23 grades, while browser saves pack their values and restore readable keys on load.
- `data/player-production.json`: 2,020 **2025 regular-season** player records from the nflverse `stats_player` release. Historical production stays separate from simulated statistics; it is used until the player records statistics in this save. Position-specific, sample-weighted production modifies overall by at most −3 to +3. Career OVR = EA/modeled base + age/coaching/development changes + production adjustment, bounded by 1–99 and potential. The formula is original, not EA's proprietary OVR formula. Source attributes affect movement speed, positional execution, passing error and kick accuracy; condition/morale still affect play.
- `franchise/newgens.mjs`: deterministic fictional identities, expanded name pool, colleges, unique persistent illustrated faces, archetypes, development traits and potential. Draft classes contain 260 prospects, continue annually, and enter CPU/user rosters through the existing draft and reserve market. Position-dependent retirement ages now also apply to kickers/punters and free agents. Contract expiry and retirement close contracts without double-aging newly released players. Older saves are enriched without replacing their real roster or career results.

Validation: `node test-career-stories.mjs` covers source matching (including same-name positions), production bounds, compact save round-trip, dialogue/reload/stale/duplicate guards, promises, morale and delegation, 1,000 deterministic identities, retirement snapshots, full new draft classes and five-season induction. Existing ten regression suites remain applicable.

Sources: [EA ratings](https://www.ea.com/games/madden-nfl/ratings), [nflverse production release](https://github.com/nflverse/nflverse-data/releases/tag/stats_player), [Pro Football Hall of Fame](https://www.profootballhof.com/players). Source attribution does not imply NFL, NFLPA, EA or Hall of Fame endorsement or licensing.


## Independent coach careers and Football Manager-inspired setup

`bootstrap.mjs` opens native IndexedDB career storage before the classic scripts run. The active career is validated before load. `save-store.mjs` atomically stores the world payload, coach metadata and active-slot pointer. Failed transactions roll back; separate IDs keep careers independent. Existing `gridiron-v1` browser saves are retained and migrated to an "Existing career" slot; the original legacy key is not removed. Career data stays on the current browser/origin. Export/import transfers an entire career between browsers; this is not cloud synchronization.

`career-manager.mjs` provides a startup career library, load/resume, explicit save, debounced autosave, rename, recoverable archive/restore, "Save as" branching, and validated JSON backup import/export. It flushes the previous career before switching; failed save/create operations preserve the previous world. Unchanged payloads skip redundant writes. Save status changes to "Saved" after IndexedDB confirms completion. The new career wizard proceeds through **franchise → identity → 3D appearance → coaching philosophy → review/start**. The 2026 real-player roster world is created only after the profile is validated. Coach names, roles, backgrounds, experience, personality, styles and appearance persist per save. Eight 1–20 coaching attributes share a 104-point budget; backgrounds provide presets. Custom appearance includes skin/hair/clothing color, hair, facial hair, outfit, build, height, glasses and headset. The coach model is reused in dialogue scenes and the coach profile view.

`character-stage.mjs` uses the bundled Three.js renderer and original geometry; a perspective CPU renderer is available when WebGL cannot initialize. Meshes share lighting and scene depth, replacing the previous portrait-on-body treatment. Avatar rotation, idle breathing, head movement, arm gestures, camera cuts, reduced motion, resize and lifecycle disposal are supported. No external character service, image-generation API or API key is required.

### Weekly development and medical effects

`development.mjs` runs once per completed league/playoff round for all franchises, including delegated games and bye-week training. A round fingerprint prevents duplicate growth. Actual actor participation is recorded as snaps in live/worker statistics. Recent match grades and training grades stay distinct from underlying ability. Fractional progress combines age curve, coaching quality, training facilities, workload, fitness/fatigue, morale, development trait, competitive exposure and recent form. Reserves can progress through practice; playing opportunities supplement training. Individual plans select a role/attribute focus and workload; compatible older teammates can mentor awareness and development habits.

Injury episodes record diagnosis/body part, expected absence, missed development weeks and return date. Injuries interrupt practice; long layoffs can reduce physical grades, with medical/coaching mitigation. Return-to-play ramps workload instead of immediately granting full growth. Older players can decline even with good training. Growth/attributes remain bounded by ability/potential limits. Offseason progress is idempotent and small, avoiding a second automatic annual boost on top of weekly development. The Development view offers grades, trends, individual focus/load/mentor controls, a recent ability chart and medical history. It links from the squad profile and integrates with existing team preparation.

These are original NFL formulas informed by published guidance, not Sports Interactive's proprietary simulation. References reviewed:
- [Starting Your First Save in FM26](https://www.footballmanager.com/the-dugout/starting-your-first-save-fm26)
- [Perfecting Your Manager in FM26](https://www.footballmanager.com/the-dugout/perfecting-your-manager-fm26)
- [FM26's Reimagined User Interface](https://www.footballmanager.com/fm26/features/fm26s-reimagined-user-interface)
- [Top Tips for Youth Development in FM26](https://www.footballmanager.com/the-dugout/top-tips-youth-development-fm26)
- [Sports Interactive player development manual](https://community.sports-interactive.com/sigames-manual/football-manager-2024/players-r4958/)

Validation additions: `node test-coach-development.mjs` covers setup budgets/validation, deterministic development, duplicate-round prevention, form, exposure, fatigue, age decline, injury loss, persisted injury history, rehabilitation, mentoring/role guards, potential ceilings, offseason idempotency, geometry and save formats. `test-career-storage.mjs` uses the test-only `fake-indexeddb` package to exercise independent slots, atomic failure rollback, active-slot persistence, branching, recoverable archives and database reopen. It is not a runtime dependency. To run without changing application dependencies:

```sh
npm install --prefix /tmp/gridiron-test-deps --no-audit --no-fund fake-indexeddb@6.2.4
FAKE_INDEXEDDB_MODULE=/tmp/gridiron-test-deps/node_modules/fake-indexeddb/build/esm/index.js node test-career-storage.mjs
```

Browser checks cover coach creation, attribute overspend rejection, two franchises, save switching/reload, separate branches, backup export/import, a completed simulated round, individual training changes, development reports, and the shared 3D conversation stage. Existing eleven regression suites remain applicable.


## Coaching office: inbox, news, analysis and settings

`newsroom.mjs` is the pure state module for per-career messages, generated stories, read/saved state, followed franchises, response deadlines and relationship effects. These are explicitly labelled **simulated career fiction**, not real-life NFL reporting. It ingests existing transaction, league, ownership and drama events; dispatches results, training standouts, medical reports, player leadership, role concerns, public frustration and recovery concerns; and links interviews and due role-review promises to the existing conversations system. Private player, staff and locker-room recaps remain internal; public press answers can become interview news.

Each completed league round has a deterministic dispatch key. Reading or starring content never changes morale. Each decision can resolve once, including after export/reload. Ignored decisions receive the first response through the assistant after two completed rounds; optional holiday pauses stop after a round with an urgent decision. A promised role review creates an existing conversation obligation rather than immediately granting a bigger role or a contract. Departed players close safely. Medical tracking emits one report per injury episode, with return-to-contention follow-up. Team messages change both team confidence and roster morale; influential players can affect a bounded group of teammates. Per-player logs and the dynamics analysis show the source, actual bounded morale change, and trust change. Message/story/history archives are bounded; pending decisions and saved items are retained within the archive limits. All of these records are included in independent coach saves and portable backups.

`analysis.mjs` computes scoped, sortable passing/rushing/receiving/defensive/workload views, current-season and career totals, per-100-snap counting stats, valid efficiency ratios, sample thresholds, team scoring benchmarks and regular-season result trends. Missing values/zero denominators appear as em dashes. It does not invent EPA, target share or defensive metrics that the engine does not record. Player production includes all recorded games; team scoring benchmarks use the regular-season table. Older saves can have incomplete player production. CSV exports include the complete filtered result and escape spreadsheet formulas.

`office-ui.mjs` provides a priority-sorted two-pane inbox, category/unread/action/saved filters, response outcomes, an editorial news feed (all, team, followed franchises, tracked players and saved stories), four squad table presets, portrait cards, tracked players, up-to-three player comparisons with position-relevant attributes, statistics, and Performance/Workload/Dynamics analysis. Settings stays visible in the sidebar and contains interface density, reduced scene motion, broadcast audio/voice preferences, news following and holiday interruption controls. Backups, database imports and the developer console are reached through Data & tools. Navigation resets the page to the top. In-match tactical/camera controls remain in the match view.

**Stat-attribution correction:** the worker's compact execution actors omit `side`. The old snap-stat loop inferred actor ownership from that missing property and initialized offensive records against the opposing franchise; those records were then discarded on commit. `fast-worker.mjs` now resolves ownership from the actual home/away roster IDs. New regression assertions verify every emitted player's franchise and committed passing output. This corrects future simulation output; missing historical individual totals are not fabricated.

Validation: `node test-newsroom-analysis.mjs` checks deterministic/idempotent dispatch, one-shot responses, save reload, morale/trust bounds, leader influence, team-wide effects, real-event ingestion without double penalties, injury episode deduplication/return reports, departed-player and live-match guards, assistant deadlines, review obligations, bounded archives, scope/sample filters, rate denominators, benchmarks, CSV safety, and end-to-end worker ownership and passing statistics. Existing thirteen suites also pass. Browser QA verifies generated weekly stories, response outcomes, save reload, player tracking/comparison, squad presets/cards, settings/following, and newly recorded passing production.

Design references: [FM26 interface](https://www.footballmanager.com/fm26/features/fm26s-reimagined-user-interface), [SI inbox and news manual](https://community.sports-interactive.com/sigames-manual/football-manager-2024/inbox-and-news-r4956/), [SI squad dynamics](https://community.sports-interactive.com/sigames-manual/football-manager-2023/your-squad-team-report-and-dynamics-r4727/), and [FM26 run-in guidance](https://www.footballmanager.com/the-dugout/mastering-end-season-run-fm26). This game's formulas and workflows are original NFL adaptations.


## Recruitment search, player previews and compact lists

Scouting now opens the entire current player database: 32 NFL rosters, free agents, and every prospect in the draft class. `player-catalog.mjs` provides combined name/team/college searches; position and specific-position matching; source/team/availability filters; age, ability, potential, condition, morale, form, size, cap/asking-base, sample and attribute thresholds; exclusions; recorded-award and expiring-contract filters; stable sorting with unknown values last; and bounded pagination. Unknown measurements never qualify for an active numeric filter. Prospects use scouted ability/potential estimates and masked individual attributes until fully known. Changing hidden true potential does not change an unscouted search result. NFL potential remains an original game estimate.

`recruitment-ui.mjs` offers five column views, removable filter chips, quick focuses, eight named searches per career, a persistent shortlist, 25/50/100-row pages, full filtered CSV export, and compact prospect reports that use the existing scouting-point/visit system. Criteria update immediately; invalid ranges show an explanation rather than silently changing the requested bounds. Search, shortlist and column preferences travel with the independent coach save. Scouting assignments retain existing career-role restrictions.

`player-ui.mjs` adds delayed pointer previews and focused-name previews, plus explicit preview buttons for touch/keyboard users. Cards show the current team, positions, portrait, ability/potential, size, experience, condition, morale, form and top recorded honor. The cards remain open while the pointer crosses into them, close on outside interaction/Escape, and offer profile/shortlist actions. Compact player profiles use Overview/Attributes/Production tabs. Player actions, contracts, development, medical history, comparisons and roster options remain available. Names in squad, statistics, search and legacy tables receive preview metadata. Outside-backdrop clicks close dialogs, and outside clicks dismiss action/filter menus; initial career selection stays protected until a career exists. A startup ordering fix initializes the classic match/franchise state before enhanced renderers run when creating a brand-new save.

`recruitment.css` uses semantic green/teal/amber/red grades with numeric labels and a legend; unit-colored position tags; gold recorded-honor badges; alternating rows; sticky table headers/identity columns; internal scrolling and pagination; a viewport-sized scouting table; and compact overlays. Squad gains a Bio & honors view, richer name details, and color-coded condition, morale and form. Display density preferences still apply.

Measurements come from the existing ESPN roster snapshot. Existing careers backfill missing real-player measurements by player ID; new real-roster careers and database packs preserve height/weight. Fictional players receive deterministic, position-based generated physiques. Missing imported measurements remain unknown. `data/player-honors.json` contains a **selected** set of factual 2023–2025 NFL Honors records with source links, combined with awards actually earned in the save. It is not a complete historical honors database; blank entries mean unrecorded. Historical and in-save awards are labelled separately.

Validation: `node test-player-catalog.mjs` covers all-player pools/deduplication, combined/range/exclusion/token searches, unknown values, prospect masking, stable sorting, pagination bounds, historical-versus-save honors, search/shortlist save round-trip, measurement backfill/export, deterministic generated physique, color thresholds, and actual paginated recruitment HTML. All fourteen existing suites pass. Browser QA covers a new Owner career, numeric/position/query filters, named-search restore, shortlist persistence, focus/click preview cards, tabbed profiles, outside dismissal, a draft report (points and confidence), squad bio view, and a completed round updating player form.

Research reference: [Sports Interactive's player-search and scouting manual](https://community.sports-interactive.com/sigames-manual/football-manager-2024/transfers-recruitment-and-scouting-r4962/). NFL honor source URLs are stored beside each reference record. The interface, filter implementation and NFL simulation rules are original adaptations.

## Front-office workspaces and fan network

`franchise/front-office.mjs` contains independent read models for roster needs, masked draft rankings, per-career pinned priority boards, fixture results/byes/playoff stages, combined historical/simulated championship collections, and deterministic fictional social discussions. `franchise/hub-ui.mjs` composes these into the existing workspace after player previews are installed. `hub.css` gives each department its own accent, compact toolbar, semantic status colors and contained collections.

- **Draft room:** full-class search, position and confidence/need/ability sorting, pin/unpin and priority ordering, report links, availability-aware depth needs, current pick/round, owned selections and recent CPU picks. Existing draft and trade-down domain actions remain authoritative. Prospect potential remains a scouted range until fully known; this is not an omniscient draft cheat sheet. The draft unlocks in the offseason.
- **Transfers & free agency:** available/bidding/trade tabs, name/position/ability filters and rating/age/cost/competition sorts. Bidder badges, decision days, your term/guarantees and pending first-year cap charges sit beside the live cap ledger. Pending offers are not reservations; existing roster/cap/role/deadline/no-trade checks still validate final actions. Original contract negotiation and trade forms remain connected.
- **Organization:** owner confidence, finances, attendance, staff payroll, infrastructure, active projects and roster priorities. Facilities retains existing pricing/project/relocation controls. Staff shows hired coaches and the existing hiring pool. The Career and League screens remain available for coach configuration/governance.
- **Schedule:** colorful fixture cards or a compact list; all/upcoming/results/home/away filters; wins/losses/ties, points and remaining fixtures. Matchup dialogs show the stored score, opponent current record, venue and head coach. Matchday opens only the current matchup, with tactics accessible for preparation. No invented real-world kickoff times or TV listings.
- **History:** franchise/decade/query and historical/save filters, paginated championship cards, loaded-title leaders, sourced season details, simulated award records, Hall of Fame and statistics links. Historical source coverage remains unchanged (1966–2025 champions, selected MVP identities); missing historical detail is explicitly unrecorded.
- **News & social:** category-accented news cards and a Fan network tab with event-linked reactions, reply threads, topic/team/search filters, likes and saved discussions. Comparisons use visible ratings and recorded current-season totals; unrecorded totals display a dash. All fan accounts, dialogue and engagement counts are generated fiction, with no external network or AI API. Private meeting stories are excluded. Likes and saves are local curation and grant no morale or development boosts; the existing newsroom event/decision system remains responsible for morale effects. Saved discussion snapshots survive calendar advances, including their original comparison numbers.

The existing upgrade/downgrade system was verified and preserved: `development.mjs` already incorporates form, training, exposure, age, injuries, rehabilitation, fatigue, mentoring and facilities. No second progression system was added.

Validation: all sixteen suites pass, including `node test-front-office.mjs` for uncertain draft talent, availability-aware needs, board order/persistence, home/away results/ties/byes/playoffs, historical/save distinctions, deterministic social generation, private-content exclusion, missing statistics, saved comparison snapshots, non-farmable reactions and actual view rendering with connected legacy controls. Browser QA checks the new workspaces and interactions against an existing career. The cloud browser's existing WebGL/voice limits are unchanged; this update does not modify the 3D engine or commentary.

## Contract meetings, reputation, social conversations and the touchline application

`negotiations.mjs` adds resumable, per-career agent discussions for free agents: opening pitch, editable proposal, indicative agent feedback, counter terms, revision and formal submission. `negotiation-ui.mjs` replaces the old free-agent offer modal with a private office cutscene using the shared articulated CharacterStage, animated establishing/reaction shots and a compact financial workspace. Live projections show total value, guaranteed money, first-year cap and remaining room. Advanced bonuses/incentives/void years/no-trade controls remain available. Original roster/cap/role checks validate the final bid; proposals enter the existing competitive market rather than granting an instant signing. Duplicate/stale submissions are rejected. Own-player contract meetings retain the cap-year ledger, genuine base-to-bonus restructuring and expiring-contract tags. This update does not implement a separate contract-extension system. Projected roster/workout bonuses now count toward player offer valuation as well as the accounting ledger.

`reputation.mjs` separates gradually changing **recognition** from current **esteem**. Initial recognition is an original model using visible ability, experience and recorded honors; weekly drift is bounded and idempotent. Recent form affects esteem without changing ability or erasing a famous player's recognition. History is retained for 26 reports. Scores and estimated audiences are simulated, not scraped real-world popularity or follower numbers. Profiles/hover previews show reputation; the social sidebar lists prominent names.

`social-network.mjs` produces career-fiction player posts, fan reactions, positional comparisons and polls. Players discuss preparation, accountability or their in-save recovery; responses discuss recorded production, efficiency where a denominator exists, workload/sample limits, age, fit and name recognition. Nested replies carry distinct perspectives. Reputation affects reach and engagement. No current-season production is fabricated to fill missing values. Poll choices persist, can be changed, and never grant morale or ability boosts. Existing likes/bookmarks and saved discussion snapshots remain compatible. Private conversations remain excluded. `social-ui.mjs` supplies player portraits, career-account indicators, audience/reputation context, comparison cards, poll results and reply threads. No real network or generative API is connected; player text is explicitly fictional.

`lineup.mjs` is the shared selection model for the visual team sheet and execution paths. The interactive field shows the selected offensive personnel, defensive front/shell or kicker/punter. Clicking a player reveals only available same-position replacements outside the current unit. Role restrictions, injuries, holdouts, roster status and finished-game checks apply. A saved per-position depth order is used by live execution, stadium identities and quick-sim workers, including extra TE/RB/CB slots. Assistant optimization clears custom ordering before rebuilding the depth chart. Kicking/return/coverage units beyond K/P remain delegated. Actor selection was corrected to consume unique eligible IDs by the actual personnel roles; changed groupings no longer reuse a player in multiple slots.

`touchline-ui.mjs` replaces the bare matchday layout with a fixture launchpad and a dedicated coaching workspace: prominent score/clock/possession/down/distance/timeouts, Live / Team lineup / Match centre tabs, play-route cards, formation/personnel/shell controls, tempo, playcaller, replacements, commentary and camera access. The compact skip rail retains play/five-play/possession/quarter/halftime/final targets, with explicit assistant-versus-selected-play delegation. A worker locks conflicting controls, while pausing an active autoplay queue remains possible during animation. Halftime/final banners keep the actual team-talk/result workflow connected. Quick simulation and replay retain their existing state-ownership rules. `immersive.css` supplies responsive department-specific presentation without adding external UI libraries.

Validation: all seventeen suites are used for this release. `test-immersive-career.mjs` covers negotiation state/counters/invalid terms/role checks/cap rollback/duplicate and stale guards/non-binding offers, correct value/guarantee summaries, reputation persistence/idempotency/bounded drift/form separation, generated player posts/nested debate/polls/snapshots, unique actors across every personnel/front combination, positional/availability/role-safe lineup replacements, persisted ordering and actual worker selection, and actual pregame/live/lineup/match-centre renderers. Browser QA exercises new-career startup, contract restructuring, under-market feedback/counter/revision/roster rejection/successful submission, formation-aware visual replacement, defensive playcalling, five-play continuation, live snap/animation and social interactions. Original stylized 3D geometry and device-dependent WebGL/software rendering remain; no photorealistic or Madden-equivalent likeness is claimed.

## Phase 1: staff, registration and compact development

The Coaching staff sidebar section now contains the department, candidate market, vacancy-specific interview records and league registration checks. Staff hire/fire actions use `franchise/staff.mjs`; the old immediate hire path delegates to the same checked appointment function. `franchise/compliance.mjs` gates market days, drafts, game rounds (including byes/holiday) and season transitions against cap, contracts and roster limits. Underlying contract validation is centralized in `state.validateContract`.

Development uses actual weekly attribute movement to display only current overall/status and directional attribute arrows; detailed numeric development/performance components are removed from player UI. Compact Plan / Report / Medical tabs and paginated rows replace the long individual-development page. Research and asset explanations have moved out of gameplay presentation; provenance and licensing information remain in this repository.

See [the eight-upgrade architecture, schema, phase plan and policy limits](docs/upgrade-architecture.md). Phase 2 (reputation/rifts/board/cooldowns) and Phase 3 (media/records/franchise legends/AP awards) are implemented; see the delivery details below. Hiring windows currently map conservatively to postseason rounds; cap accounting continues to use the game's existing complete ledger, without full CBA top-51 rules. Run `node test-staff-compliance.mjs` alongside the previous suites.


## Franchise expansion: Phases 2 and 3

Six new workspaces connect reputation, ownership decisions, world events, records, honors and franchise heritage to the existing game. Open **Career dossier**, **Boardroom**, **Around the league**, **Records & milestones**, **Awards watch** and **Hall of Fame** from the application sidebar. Contract meetings now include extensions; key staff changes, blockbuster trades and stadium/relocation proposals enter an ownership negotiation. Proposals have real compromise terms, single-use authority and calendar cooldowns. Dialogue affects personality-driven rifts, reputation and the social/news cycle.

The eight honors races use 50 ranked ballots frozen at the regular-season close, then announced after the championship. Playoff stats are excluded from new regular-season records and ballots. The gallery supports every franchise, 164 retired numbers and 37 selected legends with portraits and career details. Real-player career baselines through 2025 feed league record tracking. Existing careers migrate without overwriting prior results or award history. Complete module/schema, provenance, policy boundaries and migration limitations are in `docs/upgrade-architecture.md`.

The match engine also corrects receiver/defender assignments, deep-zone cushions, pursuit angles and out-of-bounds clock windows. A 16-game real-roster calibration guards against runaway scoring. Uniform approvals affect field jersey colors, and adopted league rules reach the next schedule/cap and live/fast match settings.

Run `node test-franchise-expansion.mjs` and `node test-match-calibration.mjs` with the existing suites. Developer mode adds reputation, action-clock and rumor controls, using the same persisted career state and marking the save modified.


## Calendar and macOS app — 0.18.0

Open **Calendar & holiday** for a month grid, dated fixtures, exact-date simulation, staff responsibilities and a dated activity report. The assistant head coach handles inbox decisions, conversations, interviews and operational issues; available senior staff take over when no assistant is present. Cap and roster checks remain enforced. See [calendar and desktop guide](docs/calendar-and-desktop.md).

Use Node 24 LTS:

```sh
npm ci
npm run serve
npm test
npm start
```

The browser preview runs at http://localhost:4173. `npm start` launches Electron on a graphical desktop. Build Mac ZIPs using `npm run package:mac:arm64` or `npm run package:mac:x64`; on macOS `npm run dist:mac` builds DMG installers too. Outputs are in `release/`. The included GitHub Actions workflow builds both architectures on macOS. Current downloadable ZIPs are unsigned and unnotarized; native launch requires Mac verification. Browser and desktop careers transfer through full career export/import.

For other coding models, begin with [AGENTS.md](AGENTS.md) and [developer handoff](docs/handoff.md). `npm run source:archive` creates a complete portable source ZIP without dependencies or compiled binaries. All 23 regression suites pass for this release.
