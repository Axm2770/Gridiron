import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import { simulateGame } from "./dist/franchise/fast-worker.mjs";
import { simTargetPlan, matchFingerprint } from "./dist/engine/sim-targets.mjs";
import {
  applyMatchSegment,
  periodLabel,
} from "./dist/franchise/matchday-sim.mjs";
import * as S from "./dist/franchise/state.mjs";
const nodes = {},
  ctx = {
    console,
    Date,
    Math,
    setTimeout: () => {},
    localStorage: { getItem: () => null, setItem: () => {} },
    document: {
      getElementById: (id) =>
        (nodes[id] ??= {
          innerHTML: "",
          style: {},
          showModal() {},
          close() {},
        }),
      querySelector: () => ({}),
    },
  };
vm.createContext(ctx);
vm.runInContext(fs.readFileSync("dist/game.js", "utf8"), ctx);
let s = JSON.parse(vm.runInContext("JSON.stringify(state)", ctx));
S.migrate(s);
const a = s.team,
  b = 13;
const fresh = () => ({
  a,
  b,
  spot: 25,
  poss: 0,
  quarter: 1,
  clock: 900,
  score: [0, 0],
  down: 1,
  toGo: 10,
  plays: 0,
  periodScores: [
    [0, 0],
    [0, 0],
    [0, 0],
    [0, 0],
  ],
  tempo: "Normal",
  stats: [
    { yards: 0, pass: 0, rush: 0, first: 0, turnovers: 0, plays: 0 },
    { yards: 0, pass: 0, rush: 0, first: 0, turnovers: 0, plays: 0 },
  ],
  events: [],
  timeouts: [3, 3],
  offense: "Shotgun spread",
  defense: "Nickel",
  call: "Quick pass",
  defCall: "Cover 2",
  engine: { seed: 729, serial: 0, version: 1 },
});
const job = (live, target) => ({
  a,
  b,
  live,
  home: S.roster(s, a),
  away: S.roster(s, b),
  seed: 729,
  target,
  userTeam: a,
  directives: { halftime: true },
  labels: ["DAL", "KC"],
});
let source = fresh(),
  fingerprint = matchFingerprint(source);
const one = simulateGame(job(source, "play"));
assert.equal(one.plays, 1);
assert.equal(one.match.plays, 1);
assert.equal(
  matchFingerprint(source),
  fingerprint,
  "worker preserves supplied live state",
);
assert(one.stats.length);
const five = simulateGame(job(source, "five"));
assert.equal(five.plays, 5);
const q1 = simulateGame(job(source, "quarter"));
assert.equal(q1.match.quarter, 2);
assert.equal(q1.match.clock, 900);
assert(!q1.match.finished);
const half = simulateGame(job(q1.match, "halftime"));
assert(half.match.halftime);
assert.equal(half.match.clock, 0);
assert.equal(half.match.quarter, 2);
const q3 = simulateGame(job(half.match, "q3"));
assert.equal(q3.plays, 0);
assert.equal(q3.match.quarter, 3);
assert.equal(q3.match.clock, 900);
assert.deepEqual(q3.match.timeouts, [3, 3]);
assert(!q3.match.halftime);
const q4 = simulateGame(job(source, "q4"));
assert.equal(q4.match.quarter, 4);
assert.equal(q4.match.clock, 900);
assert(!q4.match.finished);
const endQ3 = simulateGame(job(half.match, "quarter"));
assert.equal(endQ3.match.quarter, 4);
assert.equal(endQ3.match.clock, 900);
const drive = simulateGame(job(source, "drive"));
assert(
  drive.match.poss !== source.poss ||
    drive.match.halftime ||
    drive.match.finished,
);
assert(drive.plays > 0);
// Segment boundaries must not restart seeds, calls or statistical accumulation.
let m = source,
  segments = [],
  guard = 0;
while (!m.finished) {
  let r = simulateGame(job(m, "quarter"));
  segments.push(r);
  m = r.match;
  assert(++guard < 20);
}
const whole = simulateGame(job(source, "final"));
assert.deepEqual(m.score, whole.match.score);
assert.equal(m.plays, whole.match.plays);
assert.deepEqual(m.stats, whole.match.stats);
assert.deepEqual(m.periodScores, whole.match.periodScores);
let merged = {};
for (let segment of segments)
  for (let record of segment.stats) {
    let row = (merged[record.id] ??= { id: record.id, team: record.team });
    for (let [key, value] of Object.entries(record))
      if (!["id", "team"].includes(key)) row[key] = (row[key] || 0) + value;
  }
assert.deepEqual(
  Object.values(merged).sort((a, b) => a.id.localeCompare(b.id)),
  whole.stats.sort((a, b) => a.id.localeCompare(b.id)),
);
s.live = fresh();
applyMatchSegment(s, one);
let stat = s.roster.find((p) => one.stats.some((row) => row.id === p.id));
let before = structuredClone(stat.stats);
assert.throws(() => applyMatchSegment(s, one), /changed/);
assert.deepEqual(
  stat.stats,
  before,
  "a duplicate segment cannot add player stats again",
);
assert.equal(s.week, 0, "quarter simulation never commits a league round");
assert(!s.live.replay);
assert(!s.live.last.execution);
assert(s.live.quickSimRecap.plays === 1);
assert(s.live.commentary.length > 0);
assert.equal(periodLabel(half.match), "Halftime");
const afterFinal = simulateGame(job(whole.match, "final"));
assert.equal(afterFinal.plays, 0);
assert(afterFinal.match.finished);
assert.throws(() => simulateGame(job(source, "missing")), /Unknown/);
let edge = fresh();
edge.quarter = 4;
edge.clock = 1;
edge.score = [0, 30];
edge.down = 4;
edge.spot = 5;
let finalQuarter = simulateGame(job(edge, "quarter"));
assert(finalQuarter.match.finished);
let overtime = fresh();
overtime.quarter = 5;
overtime.clock = 600;
overtime.periodScores.push([0, 0]);
let extra = simulateGame(job(overtime, "quarter"));
assert(extra.match.finished || extra.match.quarter > 5);
let longClock = fresh();
longClock.clock = 1;
let crossing = simulateGame(job(longClock, "five"));
assert.equal(crossing.plays, 5);
assert(crossing.match.quarter >= 2);
let atBreak = simulateGame(job(half.match, "halftime"));
assert.equal(atBreak.plays, 0);
assert(atBreak.match.halftime);
assert(simTargetPlan(q4.match, "halftime").reached(q4.match, 0));
console.log(
  "PASS: play/5 plays/possession/quarter/halftime/quarter jumps/final targets; halftime and OT boundaries; full-vs-segmented deterministic scores/statistics; resumable seeds; stale/duplicate rejection; live state preservation; no premature season advancement.",
);
