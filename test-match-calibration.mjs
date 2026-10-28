import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import { fileURLToPath } from "node:url";
const root = new URL(".", import.meta.url).pathname;
// fs needs a native path; the URL pathname (/D:/...) breaks on Windows.
const dir = fileURLToPath(new URL(".", import.meta.url));
const S = await import(root + "/dist/franchise/state.mjs");
const { applyRealRosters } = await import(
  root + "/dist/franchise/real-rosters.mjs"
);
const { configureRatings, ensureCareerRatings } = await import(
  root + "/dist/franchise/ratings.mjs"
);
const { simulateGame } = await import(root + "/dist/franchise/fast-worker.mjs");
const c = {
  console,
  Math,
  Date,
  setTimeout() {},
  localStorage: {
    getItem() {
      return null;
    },
    setItem() {},
  },
  document: {
    getElementById() {
      return { innerHTML: "", style: {} };
    },
    querySelector() {
      return {};
    },
    querySelectorAll() {
      return [];
    },
  },
};
c.window = c;
c.addEventListener = () => {};
vm.createContext(c);
vm.runInContext(fs.readFileSync(dir + "/dist/game.js", "utf8"), c);
const s = JSON.parse(vm.runInContext("JSON.stringify(fresh())", c));
S.migrate(s);
applyRealRosters(
  s,
  JSON.parse(fs.readFileSync(dir + "/dist/data/nfl-rosters.json")),
);
configureRatings(
  JSON.parse(fs.readFileSync(dir + "/dist/data/madden-ratings.json")),
  JSON.parse(fs.readFileSync(dir + "/dist/data/player-production.json")),
);
ensureCareerRatings(s);
let rows = [];
for (let i = 0; i < 16; i++) {
  const a = i,
    b = 31 - i;
  const r = simulateGame({
    a,
    b,
    home: S.roster(s, a),
    away: S.roster(s, b),
    seed: (2026 * 19009 + a * 79 + b * 31) >>> 0,
    userTeam: -1,
    settings: {},
  });
  rows.push({
    a,
    b,
    score: r.score,
    plays: r.plays,
    yards: r.match.stats.map((t) => t.yards),
    attempts: r.stats.reduce((n, p) => n + p.attempts, 0),
    completions: r.stats.reduce((n, p) => n + p.completions, 0),
    turnovers: r.match.stats.map((t) => t.turnovers),
  });
}
const avg = (f) => rows.reduce((n, r) => n + f(r), 0) / rows.length;
const points = avg((r) => r.score[0] + r.score[1]) / 2,
  yards = avg((r) => r.yards[0] + r.yards[1]) / 2,
  plays = avg((r) => r.plays);
assert(
  points >= 12 && points <= 35,
  `Points per team outside the regression range: ${points}`,
);
assert(
  yards >= 210 && yards <= 450,
  `Offensive yards outside the regression range: ${yards}`,
);
assert(
  plays >= 105 && plays <= 165,
  `Play count outside the regression range: ${plays}`,
);
assert(
  Math.max(...rows.flatMap((r) => r.score)) < 70,
  "The calibrated opening round should not produce runaway scoring.",
);
console.log(
  `PASS: 16 complete real-roster games: ${points.toFixed(1)} points and ${yards.toFixed(1)} yards per team, ${plays.toFixed(1)} plays per game; spatial coverage/pursuit and clock regression.`,
);

// The clock restarts on the ready signal after out-of-bounds plays outside the late-half windows.
const { applyExecution } = await import(root + "/dist/engine/rules.mjs");
function boundary(quarter, clock) {
  return {
    poss: 0,
    spot: 25,
    down: 1,
    toGo: 10,
    quarter,
    clock,
    plays: 0,
    score: [0, 0],
    periodScores: Array.from({ length: 4 }, () => [0, 0]),
    stats: Array.from({ length: 2 }, () => ({
      plays: 0,
      yards: 0,
      rush: 0,
      pass: 0,
      first: 0,
      turnovers: 0,
    })),
    events: [],
    settings: { touchback: 35 },
  };
}
const play = () => ({
  duration: 5,
  call: "Quick pass",
  playId: "boundary",
  actors: [{ name: "Receiver" }],
  events: [],
  result: { kind: "outOfBounds", yards: 5, carrier: 0, passing: true },
});
for (const [q, clock, runoff] of [
  [1, 100, 33],
  [2, 121, 33],
  [2, 119, 0],
  [3, 100, 33],
  [4, 301, 33],
  [4, 299, 0],
]) {
  const result = applyExecution(boundary(q, clock), play(), "Offense");
  assert.equal(result.clock, clock - 5 - runoff, "Out-of-bounds clock window");
}
const kick = play();
kick.result = { kind: "fieldGoal", yards: 0, carrier: 0 };
assert.equal(
  applyExecution(boundary(1, 500), kick, "Offense").spot,
  35,
  "Adopted touchback position reaches the rules engine",
);
console.log(
  "PASS: late-half out-of-bounds clock windows and adopted kickoff touchback placement.",
);
