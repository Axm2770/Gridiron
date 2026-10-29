# Front-office systems

Four management systems added on top of the existing franchise state. Each one owns a slice of `s.franchise`, ticks once per settled round from `lifecycle.finishRound` (idempotent by `newsRoundKey`), and is mutated only through `state.transact` from the UI. Money is integer cents throughout (`S.MILLION = 1e8`).

| Module | State | Weekly tick | Hub tab |
| --- | --- | --- | --- |
| `franchise/medical.mjs` | `f.medical` (cases, physio, history, seen) | `processMedicalWeek` | Medical |
| `franchise/training.mjs` | `f.training` (schedule, drills, familiarity, readiness) | `processTrainingWeek` | Training (inside Medical & training) |
| `franchise/market.mjs` | `f.picks`, `f.tradeDesk`, `f.market.history` | `processMarketWeek` | Market |
| `franchise/draft-room.mjs` | `f.scouting`, `f.draft.live` / `ticker` | `processScoutingWeek` | Draft |

Views live in `franchise/ops-ui.mjs` and are mounted by `dashboard-ui.mjs`. Every view is built from sub-tabs and bento cards so it fits a 1440×900 screen without long scrolling.

## Medical and injury management

- **Cases.** A new injury opens a case. The injury type comes from the body part (`INJURIES` catalogue: hamstring through ACL and Achilles). The case stores the true timeline and the doctor's estimate range, which gets narrower as the doctor's diagnosis rating improves. Injuries that already existed when a save is first loaded become plain "treating" cases, so old saves aren't flooded with decisions.
- **Decision tree.** Each injury type lists its valid `TREATMENTS`: rest/rehab, IR, Toradol injection, brace, tightrope, meniscus trim or repair, pin-and-cast, surgery, and concussion protocol. Each option sets weeks out, aggravation risk if the player plays through, re-injury risk, cost, and possible long-term rating effects. `treatmentOutlook` shows these numbers in the UI. If you don't decide before the next game, the staff applies `recommendedTreatment`.
- **Staff.** The doctor is the existing "Medical" staff member (diagnosis and surgery ratings). The physio is a separate hire who raises recovery and prevention. Facilities come from `stadium.medical`.
- **Player trust.** Every player has a preference: play, be patient, or have surgery. It's based on ambition, contract year, age and loyalty. Respecting it raises trust. Overruling it lowers trust and morale through `applyMood`. Forcing a player who wanted patience to play hurt adds `medicalGrievances`, which lowers `signingFactors` at the negotiating table.

## Training and development

- **Schedule.** Six days, each set to a block (Off, Recovery, Film, Walkthrough, Install, Padded or Conditioning). At least one rest day is required. The week's mean intensity is written to the existing `preparation.intensity`, which already drives fatigue, wear and injury risk in `world.weekly`. Film, walkthrough and install raise scheme familiarity, which is written to `preparation.familiarity`.
- **Growth.** The unit drill emphasis and an individual target each add to `attributeChanges`. Gains scale with coordinator rating, training facilities, scheme fit, age and remaining headroom below potential.
- **Position changes.** Only allowed between related positions (`POSITION_MOVES`). A move costs 6 development points up front, and the player earns them back as position familiarity rises through practice.

## Contracts, negotiation and trades

- **Contract structure.** The existing contract proposal already covers signing bonus, guarantees, void years and LTBE/NLTBE incentives. This update adds `signingFactors` (expected playing time, contender status, prestige, scheme fit and medical trust). It multiplies `offerScore` by 0.75–1.3, so the negotiation screen and CPU free agency weigh the same things.
- **Trades.** The pick ledger covers two drafts, with picks keyed `pk-year-round-team`. Pick value uses the slot chart (`1000·e^(−0.0315(slot−1)) + 8`) and is discounted for future years. Player value combines talent, position, age (weighted by whether the club is contending or rebuilding), years of contract control, deadline urgency and cap hit. `evaluateTrade` reports whether the other side accepts, the value each side gives up, the cap position after the deal, the reasons for a refusal, and the cheapest pick that would balance the trade. `executeTrade` runs inside a transaction: it accelerates dead money, enforces cap and roster limits, and records fan and press reactions.
- **Deadline.** In the three weeks before the deadline, contending AI clubs offer pick packages for your good players (the Offers tab).

## Scouting and draft

- **Fog of war.** `prospectProfile` is deterministic per prospect: region, combine numbers, film grade, medical flag, personality, consensus rank, and sleeper and bust odds. `scoutedView` only reveals each field once your scouting confidence passes a threshold (40/55/70/85).
- **Scouts.** Up to five, each assigned a region and a position focus. Every week each scout adds to the confidence of the existing `f.reports` entries for prospects they cover.
- **Live draft.** `startLiveDraft` sets the draft to live. The CPU picks one at a time from the consensus board, adjusted for team need and a little randomness, and every pick gets an analyst grade in the ticker. When you're on the clock you can pick, take a trade-down offer, or trade up by paying with later picks worth at least 110% of the target slot on the chart.

## Tests

`test-ops-systems.mjs` covers:
- medical: baselining existing injuries, estimate ranges, treatment validation, idempotent weekly tick;
- training: the rest-day rule, the intensity link, attribute growth, the position-change cost;
- market: signing-factor bounds, pick ownership, trade valuation;
- scouting and draft: fog thresholds, the live draft through to your own pick.
