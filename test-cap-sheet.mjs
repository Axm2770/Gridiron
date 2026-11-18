// Cap sheet numbers behind the Contracts screen (franchise/cap-sheet.mjs): block meters, the cap
// split, multi-year commitments, contract timelines and release dead money (mirrors contracts.cut).
import assert from "node:assert/strict";
import * as Cap from "./dist/franchise/cap-sheet.mjs";
import { MILLION, capHit } from "./dist/franchise/state.mjs";

assert.equal(Cap.blockCount(0, 100, 10), 0);
assert.equal(Cap.blockCount(1, 100, 10), 1, "any positive value lights a block");
assert.equal(Cap.blockCount(55, 100, 10), 6);
assert.equal(Cap.blockCount(500, 100, 10), 10, "never more than the cell count");
assert.equal(Cap.blockCount(5, 0, 10), 0);

const split = Cap.capBreakdown({ limit: 200, live: 150, dead: 20, adjustments: 0 });
assert.equal(split.room, 30);
assert.equal(split.pct.live + split.pct.dead + split.pct.room, 100);
const over = Cap.capBreakdown({ limit: 100, live: 110, dead: 10, adjustments: 0 });
assert(over.over && over.room === -20 && over.pct.room === 0);
assert(over.pct.live + over.pct.dead <= 100.1, "over the cap the bar scales to total used");

const contract = (o) => ({ team: 0, start: 2026, years: 3, voidYears: 0, base: [10, 10, 10].map((v) => v * MILLION), roster: [0, 0, 0], workout: [0, 0, 0], bonus: 6 * MILLION, prorate: 3, guarantees: [4 * MILLION, 2 * MILLION, 0], incentives: [], restructureBonuses: [], ...o });
const c = contract();
assert.deepEqual(Cap.contractTimeline(c, 2027).map((t) => t.kind), ["past", "now", "future"]);
assert.deepEqual(Cap.contractTimeline(contract({ voidYears: 1 }), 2026).map((t) => t.kind), ["now", "future", "future", "void"]);
assert.equal(Cap.yearsLeft(c, 2026), 3);
assert.equal(Cap.yearsLeft(c, 2028), 1);
// Releasing in 2027: remaining bonus proration (2M + 2M) plus remaining guarantees (2M + 0).
assert.equal(Cap.deadIfReleased(c, 2027), 6 * MILLION);
assert.equal(Cap.deadIfReleased({ ...c, ended: true }, 2027), 0);
const st = Cap.contractStatus(c, 2028);
assert(st.finalYear && st.extendable && st.hit === capHit(c, 2028));
assert.equal(st.saving, st.hit - st.dead);
assert(!Cap.contractStatus(c, 2029).extendable);

const s = {
  team: 0,
  year: 2026,
  roster: [
    { id: "a", ovr: 80, status: "active" },
    { id: "b", ovr: 90, status: "active" },
    { id: "c", ovr: 95, status: "practice" },
  ],
  franchise: {
    calendar: { leagueYear: 2026 },
    rules: { cap: 100 * MILLION },
    rollover: {},
    capAdjustments: [],
    dead: [{ team: 0, year: 2027, amount: 5 * MILLION }],
    contracts: { a: contract({ years: 1, base: [10 * MILLION], prorate: 1, bonus: 0, guarantees: [0] }), b: contract(), c: contract() },
  },
};
const years = Cap.commitments(s, 2026, 3);
assert.deepEqual(years.map((y) => y.year), [2026, 2027, 2028]);
assert.equal(years[0].contracts, 3);
assert.equal(years[1].dead, 5 * MILLION);
assert.equal(years[1].contracts, 2, "the one-year deal frees its space");
assert.equal(years[1].room, years[1].limit - years[1].used);
const watch = Cap.extensionWatch(s, 2026, 5);
assert.deepEqual(watch.map((x) => x.p.id), ["a", "b"], "soonest expiry first; practice squad excluded");

console.log("PASS: cap sheet block meters, cap split, commitments, contract timelines, release dead money and the extension watch.");
