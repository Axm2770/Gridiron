# Franchise upgrade architecture and delivery phases

Phase 1 replaces the old instant staff appointment path and numeric development UI while preserving the existing match engine, player identities, career slots, statistics, roster ownership and transaction conventions. Future systems extend explicit domain state rather than adding behavior to view templates.

| Upgrade                                | Integration boundary                                                                                                                                            | Phase                                  |
| -------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------- |
| 1. UI and immersion                    | `staff-ui`, `development-ui`, `progression-view`, `immersion`; shared responsive `staff.css`, existing player/news/match presentation                           | 1 implemented; ongoing view refinement |
| 2. Staff and compliance                | `staff`, `compliance`, `state.validateContract`; guarded `world`, `personnel`, `lifecycle` entry points                                                         | 1 implemented                          |
| 3. Coach reputation and dialogue rifts | Replace automatic reputation gains in `lifecycle`; explicit reputation event ledger; extend `conversations`/`newsroom`; read by offer and staff scoring         | 2 implemented                          |
| 4. Board meetings and cooldowns        | Board proposal state machine and calendar-keyed action ledger; use shared character stage; call existing stadium/staff/trade domain actions only after approval | 2 implemented                          |
| 5. Media, rumors and rule changes      | Extend `newsroom` public story events and `social-network` voices; persistent rumor lifecycle, fan-pulse ledger and rule effective dates                        | 3 implemented                          |
| 6. Records and franchise legends       | Extend `history`, per-player/coaching stat indexes and event thresholds; structured team legends/retired-number database, archive filters                       | 3 implemented                          |
| 7. AP awards                           | Replace current `history.seasonAwards`; freeze regular-season ballots before playoff results; ranked voter ballots with expectation/narrative factors           | 3 implemented                          |
| 8. Refactoring                         | Replace weak implementations at their domain boundary, retain save migration and regression checks                                                              | Every phase                            |

## Phase 1 module boundaries

- `staff.mjs`: migration, canonical candidate lookup, explicit candidate eligibility, role permissions, searches, two-step interviews, legal contact windows, appointments, dismissal/severance, actual employer transfers and staff-development compensation.
- `staff-ui.mjs`: Team / Recruitment / Search records / Compliance views, position and unit segments, candidate search, six-card pages, interview and appointment modals. No hiring rules live exclusively in the UI.
- `compliance.mjs`: one structured league-registration report and an advancement assertion. The report has stable codes, areas and corrective destinations. Game entry adds positional availability checks. Offseason/camp entry uses 90; regular-season advancement requires 53 plus no more than two elevations and 16 practice players.
- `state.mjs`: reusable contract structure validator and atomic copy/mutate/validate transactions. Enforces nonnegative safe-integer cents, complete schedules, guarantees bounded by base, incentive types/years, bonus/restructure proration, and valid dead-money/rollover/adjustment entries.
- `world`, `personnel`, `lifecycle`, `ui`: registration gates before market days, draft opening/selections, round resolution, holiday/byes, season transition; post-transition camp validation in the transaction. A debug flag does not bypass advancement. The existing explicit cap-limit editor still changes the actual cap limit.
- `development.mjs`: records actual attribute movement with each weekly report, including injury and age-related physical decline. The existing deterministic growth, form, fatigue, training and rehabilitation model remains in use.
- `progression-view.mjs`: translates recent reports into Improving / Stable / Declining and named attribute arrows. Internal fractional deltas remain available to mechanics and tests, but development/profile views never display them.
- `immersion.mjs`: migrates known old generated editorial notes; UI templates no longer contain research citations, asset explanations or simulation disclaimers. Source provenance remains in data metadata and documentation.

## Persisted additions

| Entity             | New fields                                                                                                                                                 |
| ------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Franchise          | `staffHubVersion`, `staffProfileVersion`, `staffSerial`, `staffSearches`, `staffSearchArchive`, `staffCompensations`, `staffMovements`, `immersionVersion` |
| Staff              | `employer`, `minority`, `woman`, `tenure`, `joinedYear`, `personality`, `specialty` plus existing role/rating/scheme/salary/years                          |
| Search             | `id`, `team`, `role`, `year`, `incumbent`, `status`, `interviews`, `drafts`, `appointed`                                                                   |
| Interview          | Candidate/employer snapshot, format, completed answer sequence, external/eligibility flags, assessment, search ID and season/week                          |
| Compensation       | Departure identity and cohort; special third-round future picks linked to the cohort                                                                       |
| Development report | `attributeDirections`: actual per-attribute change recorded by the weekly calculation                                                                      |

Candidate diversity data is explicit generated/imported metadata. Names, portraits, skin tones and coaching ability are never used to infer eligibility. All new staff candidates are generated game characters. Interviews belong to a particular vacancy/search, only count on completion, cannot be counted twice, and cannot carry into a replacement search. Human HC profiles are not overwritten by an owner's staff appointment. Search drafts and records survive JSON/IndexedDB saves.

## Hiring policy implementation and scope

The researched policy requires two distinct external diverse interviewees for HC, GM and coordinator searches, and one for QB coaches. HC/GM qualifying interviews must be in person. A contracted external assistant cannot make a lateral move in this implementation; a genuine promotion is checked against role hierarchy. Free candidates can interview during the season. Under-contract HC candidates can enter virtual postseason windows; external in-person HC interviews wait until after the divisional round. Candidates still coaching postseason games cannot finalize appointments. The calendar resolves rounds rather than civil dates, so exact weekday/hour windows and Super Bowl bye-week interview exceptions are conservatively deferred to the offseason.

JC-2A requires an actual direct employer-to-employer qualifying HC/primary executive move, explicit minority eligibility and at least two years of uninterrupted club service. Awards are idempotent, one special third-round pick in each of two consecutive drafts; paired coach/executive departures use three drafts. Compensation after the draft order has opened starts with the next unopened draft. Releasing a coach first removes direct-departure eligibility. CPU carousel appointments complete recorded searches and transfer real staff records; retained CPU staff can renew without creating a new vacancy.

The salary-cap gate uses this game's complete existing cap ledger (including dead charges, rollover and incentive adjustments), not a complete CBA top-51/offseason-accounting implementation. Current rule abstractions such as practice-squad eligibility, tags, roster exemptions and exact payroll thresholds remain documented in README. This phase does not claim a complete NFL legal/CBA rules engine.

Research:

- NFL Football Operations, Inclusive Hiring Policy: https://nfl-ops-prod-umbraco-author.azurewebsites.net/programs-initiatives/league-initiatives/diversity-inclusion/inclusive-hiring-policy-rooney-rule/
- NFL, QB coaching interview expansion: https://www.nfl.com/news/nfl-owners-approve-rooney-rule-applying-to-vacant-qb-coach-positions
- NFL, in-person HC interview window: https://www.nfl.com/news/nfl-owners-approve-proposal-to-move-in-person-head-coaching-interviews-to-after-
- NFL, staff-development compensation: https://www.nfl.com/news/niners-lead-way-in-comp-picks-for-diverse-rewards-policy

## Validation

`node test-staff-compliance.mjs` covers pre-franchise initialization, repeat migrations, integer staff salaries, vacancy-specific completed/partial/duplicate/stale interviews, persistence, correct counts/formats, role/live/budget/availability guards, severance, actual replacements, legacy entry points, postseason/lateral/promotion windows, direct compensation/tenure/cohorts/frozen drafts, real CPU transfers, strict calendar rollback, roster limits, invalid contracts and directional training/injury reports. Existing expiry fixtures now create structurally valid one-year contracts, and repeated offseason tests explicitly enter offseason before advancing.

The existing 17 suites continue to cover financial/roster operations, five-season progression, player data, newsroom, match execution, all presentation paths, negotiations, worker continuations and independent IndexedDB saves. Browser QA verifies new career creation, staff searches/interviews/appointment, compliance, development and reload behavior. Calendar rules use the documented round-level abstraction above.

## Phases 2 and 3 delivered

The remaining phases are now implemented as domain modules, connected to the live and worker match paths, calendar transitions, contracts, staff appointments, news/social generation and existing career-slot storage.

| Module                               | Persisted state and responsibility                                                                                                                                                                                                                                                       |
| ------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `career-systems.mjs`                 | Canonical `coachReputation` value/event ledger; idempotent event keys; recruitment and contract/staff leverage; personality rifts; club fan-pulse events; football-day clock/cooldowns; preseason expectations; actual playcalling and draft-development evidence                        |
| `boardroom.mjs`                      | Two-response ownership meetings; approval/compromise/rejection; exact-proposal, expiring, single-use permits; real financial/operational compromise terms for facilities, relocation, key staff, major trades, staff budgets and uniforms                                                |
| `career-jobs.mjs`                    | Offseason invitations, resumable interviews, conditional offers and actual employer/team/roster transfers; destination committee completes external interviews through the existing staff engine                                                                                         |
| `world-events.mjs`                   | Developing/addressed/confirmed/denied/resolved rumors; consequential club responses; contextual pundit, insider, former-player and legends-panel posts; actual decision fan reactions; evidence-based style comparisons; annual owner votes with next-season effective dates             |
| `records.mjs`                        | Regular-season delta accounting, league and franchise game/season/career marks, coach season/career indexes, approaching/broken milestone alerts, pre-career player baselines and historical league benchmarks                                                                           |
| `awards.mjs`                         | Frozen regular-season snapshot and eight award races; 50 deterministic media ballots, five distinct ranked choices, 10–5–3–2–1 points; MVP quarterback/team bias; COTY expectation/turnaround bias; bounded reputation/form/narrative influences; postseason-independent announcement    |
| `expansion-ui.mjs` / `expansion.css` | Career dossier, Boardroom, League desk, Records, Awards and franchise-filtered Hall of Fame; integrated 3D ownership/job/extension meetings; compact pages, filters, segments, portrait galleries and records; existing Staff/Organization/Contracts controls route into guarded actions |

The original automatic reputation increase and post-championship awards formula have been removed. Reputation now comes from recorded achievements and leadership consequences. New salaries are appended in an extension without reprorating the original signing bonus. Extension bonuses have their own bounded proration schedule; current and future cap projections are validated atomically. Contract review, trade contacts and board agenda cooldowns advance with football time, not wall-clock waiting. Rejected trade contacts and withdrawn/rejected board requests retain their cooldowns.

### Transactions and persistence

All user mutations use `state.transact`: clone, mutate, validate and commit. A failed proposal, changed roster, hiring-window closure or unaffordable commitment leaves the previous state intact. Authority to execute a board proposal is scoped to its exact fields and team, expires after 30 football days and cannot be reused. Server/browser calls do not authorize unrestricted appointments. CPU boards delegate their own decisions only while managing a different team; the human club still needs a permit.

Regular-season records are distinct from the legacy all-games stat ledger. Team-specific records count only production recorded for that franchise, including when a player changes clubs. Historical real-player regular-season baselines run through the completed 2025 season. Hall retirement snapshots preserve the existing all-recorded-games ledger and carry a separate regular-season total; no prior save statistics are discarded. Older saves entering mid-postseason retain their existing history and begin the new tracking at the upgrade boundary; missing regular-season ballots are not fabricated. Existing old awards are preserved. Benchmarks are a selected factual record set, and franchise marks begin from tracked career seasons rather than claiming a complete historical team record database.

Career moves preserve the old club roster, load the new club roster and carry the human coach/profile/standing into the new role. An under-contract coordinator moves as a promotion; an HC must be conditionally released for an external lateral move. Explicit generated staff diversity metadata governs compensation. A human-created identity does not inherit the replaced generated coach's demographic eligibility, and portraits/appearance never infer it.

### Heritage and award research

- Official **2026 NFL Record & Fact Book**, retired uniform numbers (printed page 320) and league records: https://static.clubs.nfl.com/image/upload/saints/v7osb9amhz2za6ggkxkz.pdf (linked from https://www.neworleanssaints.com/media/stats).
- Club correction: Joe Greene's official retired number is 75: https://www.steelers.com/history/retired-numbers/ . The printed book's 79 is corrected in structured provenance.
- Per-person biographies, Hall classes, portraits and career tables: official Pro Football Hall of Fame profiles, linked in `data/franchise-heritage.json`. Coverage: all 32 franchises, 164 retired numbers and 37 selected player/coaching legends. This is a curated gallery, not every Hall inductee or every franchise great.
- Completed 1999–2025 regular-season career baselines for 1,939 matching current-database player identities: https://github.com/nflverse/nflverse-data/releases/tag/stats_player . Matching uses normalized name and position family; this is not a complete historical player database.
- AP's January 2026 explanation confirms 50 voters, pre-playoff voting and five ranked choices for all eight awards, 10–5–3–2–1: https://apnews.com/article/nfl-awards-voting-286a68c377dbc0c41437cb930c95ce12 . This replaces the older 2022 top-three format for non-MVP awards. The simulation uses generated voter preferences, not identities or copied ballots of actual journalists. Positional All-Pro/Pro Bowl selections remain separate approximations.

Sources remain in data provenance and documentation; gameplay screens and dialogue contain no research footnotes. Real logos and player portraits already present in the project remain data assets; this update does not obtain or imply a commercial NFL/Madden/Football Manager license.

### Match-engine correction and verification

Browser QA exposed excessive scoring caused by linebacker/corner coverage being paired with the wrong receivers. Assignments now match linebackers to backs/inside receivers and corners to outside receivers; deep-zone defenders maintain a cushion as routes progress, and pursuit uses a lead angle instead of trailing the ball carrier. Out-of-bounds clock runoff now respects the final-two-minute first-half and final-five-minute second-half windows. Adopted touchback placement is consumed by live/worker scoring, kickoffs and halftime restart paths. Player attributes, ball trajectories and actual spatial tackles still determine outcomes; scores are not overwritten or capped.

`test-franchise-expansion.mjs` covers reputation/migration persistence and duplicate effects, personality rifts and repair, all board outcomes, altered/expired/reused permits, contract append/proration and future-cap rollback, regular/postseason record separation, frozen awards and duplicate announcement, all 50 ballots, award biases, deferred/idempotent rule votes, null rumor subjects and social voices, actual compliant coaching job transfer, and the 32-franchise factual mappings. Existing staff tests use explicit board-permit fixtures to isolate hiring law; a separate expansion test verifies that unapproved direct actions fail.

The implementation continues to use documented football and financial abstractions. It does not claim a complete CBA engine, commercial motion-capture presentation, a full historical franchise database, a real AP prediction model or reproduction of proprietary Madden/FM assets. Those limitations are documented here rather than displayed as out-of-character gameplay text.

Browser verification also covers the compact eight-row contract ledger and nine-card newsroom pagination, a signed extension with a 45-day review cooldown, persisted ownership execution, actual public-criticism rifts, the awards watch after results, and franchise filters/biographies. `test-expansion-ui.mjs` exercises all seven new/replaced views, legacy trade routing, exact team identities, extension entry and the 50-row ballot explorer. All 21 suites pass.
