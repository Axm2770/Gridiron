import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import * as S from "./dist/franchise/state.mjs";
import * as L from "./dist/franchise/lifecycle.mjs";
import * as M from "./dist/franchise/matchups.mjs";
import * as H from "./dist/franchise/history.mjs";

const context = {
  console,
  Date,
  Math,
  setTimeout: () => {},
  localStorage: { getItem: () => null, setItem: () => {} },
  document: {
    getElementById: () => ({ innerHTML: "", style: {}, showModal() {}, close() {} }),
    querySelector: () => ({}),
    querySelectorAll: () => [],
  },
};
context.window = context;
context.addEventListener = () => {};
vm.createContext(context);
vm.runInContext(fs.readFileSync("dist/game.js", "utf8"), context);
vm.runInContext(fs.readFileSync("dist/match.js", "utf8"), context);
const teams = JSON.parse(vm.runInContext("JSON.stringify(clubs)", context));
function fresh() {
  const s = JSON.parse(vm.runInContext("JSON.stringify(fresh())", context));
  s.coach = { name: "Test coach", calling: "Manual" };
  S.migrate(s);
  return s;
}

// Head-to-head from a hand-built log: all-time, recent, playoffs, streak and newest-first order.
let s = fresh();
s.franchise.matchups = {
  version: 1,
  games: [
    { year: 2026, phase: "season", week: 2, a: 0, b: 1, score: [20, 10] },
    { year: 2026, phase: "season", week: 9, a: 1, b: 0, score: [17, 24] },
    { year: 2026, phase: "playoffs", week: 1, a: 0, b: 1, score: [13, 27] },
    { year: 2027, phase: "season", week: 4, a: 1, b: 0, score: [21, 21] },
    { year: 2027, phase: "season", week: 5, a: 0, b: 2, score: [3, 30] },
  ],
};
s.schedule = [];
s.playoffs = null;
let h = M.headToHead(s, 0, 1);
assert.deepEqual(h.allTime, { wins: 2, losses: 1, ties: 1, pf: 78, pa: 75 });
assert.deepEqual(h.playoffs, { wins: 0, losses: 1, ties: 0, pf: 13, pa: 27 });
assert.deepEqual(
  h.games.map((g) => [g.year, g.phase, g.result]),
  [
    [2027, "season", "T"],
    [2026, "playoffs", "L"],
    [2026, "season", "W"],
    [2026, "season", "W"],
  ],
);
assert.deepEqual(h.streak, { result: "T", count: 1 });
assert.equal(h.last.home, false);
// The mirror view swaps the record.
assert.deepEqual(M.headToHead(s, 1, 0).allTime, { wins: 1, losses: 2, ties: 1, pf: 75, pa: 78 });
assert.deepEqual(
  M.headToHeadTable(s, 0).map((r) => r.opp),
  [1, 2],
);
assert.equal(M.headToHead(s, 0, 3).games.length, 0);

// A full season through the real round settlement records every game once.
s = fresh();
s.schedule = L.newSchedule(17);
const expected = s.schedule.reduce((n, w) => n + w.length, 0);
for (const w of s.schedule)
  L.finishRound(s, w.map((g) => ({ ...g, score: [g.a < g.b ? 24 : 10, 17] })));
for (let r = 0; r < 4; r++) {
  const games = s.playoffs.rounds.at(-1);
  L.finishRound(s, games.map((g) => ({ ...g, score: [24, 17] })));
}
assert.equal(s.phase, "offseason");
const log = M.ensureMatchups(s).games;
assert.equal(log.length, expected + 6 + 4 + 2 + 1);
// Backfill from the live schedule is idempotent.
M.ensureMatchups(s);
assert.equal(M.ensureMatchups(s).games.length, log.length);
const final = log.filter((g) => g.final);
assert.equal(final.length, 1);
const champion = s.history.at(-1).champion;
assert(final[0].a === champion || final[0].b === champion);
// Season records match the standings that the same rounds produced.
for (let t = 0; t < 32; t++) {
  const season = M.ensureMatchups(s)
    .games.filter((g) => g.phase === "season" && (g.a === t || g.b === t))
    .map((g) => (g.a === t ? g.score[0] > g.score[1] : g.score[1] > g.score[0]));
  assert.equal(season.filter(Boolean).length, s.teams[t].w);
}

// Championship list: the career season carries runner-up and score; history fills earlier years.
s.franchise.history = structuredClone(H.historicChampions);
const list = M.championshipList(s, teams);
const top = list[0];
assert.equal(top.year, s.year);
assert.equal(top.kind, "career");
assert.equal(top.winner, champion);
assert.equal(top.runnerUp, final[0].a === champion ? final[0].b : final[0].a);
assert.deepEqual(top.score, [24, 17]);
assert.equal(new Set(list.map((c) => c.year)).size, list.length);
const y2023 = list.find((c) => c.year === 2023);
assert.equal(teams[y2023.winner][0], "KC");
assert.equal(y2023.mvp, "Patrick Mahomes");
assert(list.every((c, i) => i === 0 || list[i - 1].year > c.year));
// A career season replaces a historical entry for the same year.
s.franchise.history.push({ year: s.year, winner: "BUF", kind: "historical" });
assert.equal(M.championshipList(s, teams).filter((c) => c.year === s.year).length, 1);
assert.equal(M.championshipList(s, teams)[0].kind, "career");
assert(M.titleCounts(list)[0][1] >= 1);

// Saves without a log migrate additively.
s = fresh();
delete s.franchise.matchups;
s.schedule[0][0].score = [7, 3];
assert.equal(M.ensureMatchups(s).games.length, 1);
console.log("PASS: head-to-head records, game log migration and championship list.");
