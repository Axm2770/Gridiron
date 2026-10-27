import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import * as S from "./dist/franchise/state.mjs";
import * as C from "./dist/franchise/contracts.mjs";
import * as P from "./dist/franchise/personnel.mjs";
import * as W from "./dist/franchise/world.mjs";
import * as L from "./dist/franchise/lifecycle.mjs";
import * as DB from "./dist/franchise/database.mjs";
import * as H from "./dist/franchise/history.mjs";
import { simulateGame } from "./dist/franchise/fast-worker.mjs";
const nodes = {},
  context = {
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
      querySelectorAll: () => [],
    },
  };
context.window = context;
context.addEventListener = () => {};
vm.createContext(context);
vm.runInContext(fs.readFileSync("dist/game.js", "utf8"), context);
vm.runInContext(fs.readFileSync("dist/match.js", "utf8"), context);
function fresh() {
  let s = JSON.parse(vm.runInContext("JSON.stringify(fresh())", context));
  s.coach = { name: "Test coach", calling: "Manual" };
  S.migrate(s);
  return s;
}
let s = fresh();
assert.equal(s.roster.length, 53);
assert.equal(S.validate(s), true);
assert.deepEqual(S.gameEligibility(s), []);
assert.equal(
  new Set(
    Array.from({ length: 32 }, (_, t) => S.roster(s, t))
      .flat()
      .map((p) => p.id),
  ).size,
  32 * 53,
);
// Contract arithmetic must distribute every cent and roll back rejected mutations.
assert.equal(
  [0, 1, 2].reduce((n, i) => n + S.bonusCharge(100, 3, i), 0),
  100,
);
s.roster.at(-1).status = "practice";
let p = s.roster.find((p) => p.salary > 2),
  before = S.capLedger(s).room;
let re = S.transact(s, (x) => C.restructure(x, p.id, 1));
assert(S.capLedger(re).room > before);
assert.equal(s.franchise.contracts[p.id].restructureBonuses, undefined);
assert.throws(
  () =>
    S.transact(s, (x) =>
      C.offer(x, x.agents[0].id, {
        annual: -1,
        bonus: 0,
        years: 3,
        guaranteed: 0,
      }),
    ),
  /Invalid/,
);
let tooHigh = { annual: 500, bonus: 0, years: 1, guaranteed: 0 };
assert.throws(
  () => S.transact(s, (x) => C.offer(x, x.agents[0].id, tooHigh)),
  /cap/,
);
s.franchise.role = "HC";
assert.throws(() => C.cut(s, s.roster[0].id), /delegates/);
s.franchise.role = "Owner";
let released = S.transact(s, (x) => C.cut(x, p.id, true));
assert(!released.roster.some((q) => q.id === p.id));
assert(released.franchise.dead.some((d) => d.year === s.year + 1));
assert(released.franchise.contracts[p.id].ended);
let free = s.agents[0];
C.offer(s, free.id, {
  annual: free.salary,
  bonus: 1,
  years: 3,
  guaranteed: 2,
  voidYears: 2,
});
assert(s.franchise.market.offers.length);
W.marketDay(s);
W.marketDay(s);
assert(s.franchise.market.offers.every((o) => o.playerId !== free.id));
assert(S.validate(s));
// Roster designations and IR absence checks.
let reserve = s.roster.find((p) => !p.starter);
P.movePlayer(s, reserve.id, "practice");
P.protect(s, reserve.id);
P.movePlayer(s, reserve.id, "elevated");
W.weekly(s);
assert.equal(reserve.status, "practice");
reserve.injury = 5;
P.movePlayer(s, reserve.id, "ir");
assert.throws(() => P.movePlayer(s, reserve.id, "active"), /absence/);
s.week += 4;
P.movePlayer(s, reserve.id, "active");
let prospect = s.prospects[0];
P.scout(s, prospect.id, "Combine");
assert(s.franchise.reports[prospect.id].notes[0].includes("40-yard"));
// Schema/import boundaries: CSV quoting, duplicate IDs, unsafe logos, atomic replacement.
let pack = DB.parseCSV(
  'id,teamId,name,pos,age,ovr,pot,salary\ncustom,16,"Last, First",QB,24,80,85,3',
);
assert.equal(pack.players[0].name, "Last, First");
assert.equal(DB.validatePack(pack).players, 1);
assert.throws(
  () =>
    DB.validatePack({ ...pack, players: [pack.players[0], pack.players[0]] }),
  /unique/,
);
assert.throws(
  () =>
    DB.validatePack({
      ...pack,
      teams: [{ id: 1, city: "X", name: "Y", logo: "javascript:alert(1)" }],
    }),
  /Logo/,
);
let imported = S.transact(s, (x) => DB.importPack(x, pack));
assert.equal(imported.roster.length, 1);
assert(S.gameEligibility(imported).some((x) => x.includes("RB")));
assert.equal(H.historicChampions.length, 60);
assert.equal(H.historicChampions.at(-1).year, 2025);
// Genuine 22-actor worker simulation, seeded equality, player and defensive statistics.
s = fresh();
let job = {
  a: 0,
  b: 1,
  home: S.roster(s, 0),
  away: S.roster(s, 1),
  seed: 713,
  userTeam: 0,
  directives: { protectQB: true, halftime: true },
  settings: { otMode: "Both teams receive a possession" },
};
let a = simulateGame(job),
  b = simulateGame(job);
assert.deepEqual(a.score, b.score);
assert(a.match.finished && a.plays > 50 && a.plays < 500);
assert(a.stats.some((x) => x.attempts > 0));
assert(a.stats.some((x) => x.tackles > 0));
// Calendar, byes, standings, 14-team bracket, full draft, sanctions and next-year roster.
s = fresh();
s.schedule = L.newSchedule(17);
assert.equal(s.schedule.length, 18);
for (let t = 0; t < 32; t++)
  assert.equal(
    s.schedule.filter((w) => w.some((g) => g.a === t || g.b === t)).length,
    17,
  );
for (let w of s.schedule) {
  assert.equal(new Set(w.flatMap((g) => [g.a, g.b])).size, w.length * 2);
  L.finishRound(
    s,
    w.map((g) => ({ ...g, score: [24, 17] })),
  );
}
assert.equal(s.phase, "playoffs");
assert.equal(s.playoffs.rounds[0].length, 6);
assert(s.teams.every((t) => t.w + t.l === 17));
for (let r = 0; r < 4; r++) {
  let games = s.playoffs.rounds.at(-1);
  assert(games.every((g) => g.a !== g.b));
  L.finishRound(
    s,
    games.map((g) => ({ ...g, score: [24, 17] })),
  );
}
assert.equal(s.phase, "offseason");
assert.equal(s.history.length, 1);
assert.deepEqual(
  s.playoffs.rounds.map((g) => g.length),
  [6, 4, 2, 1],
);
assert.equal(S.financeYear(s), 2027);
s.franchise.futurePicks = [
  { year: 2027, team: s.team, round: 3, forfeited: true, source: "Sanction" },
];
P.beginDraft(s);
assert.equal(s.franchise.draft.picks.length, 223);
assert(
  !s.franchise.draft.picks.some((p) => p.round === 3 && p.original === s.team),
);
let guards = 0;
while (s.franchise.draft.cursor < s.franchise.draft.picks.length) {
  P.draftPick(s, s.prospects[0].id);
  assert(++guards <= 7);
}
assert.equal(s.franchise.draft.log.length, 223);
L.rollSeason(s);
assert.equal(s.year, 2027);
assert.equal(s.schedule.length, 18);
P.trimRoster(s);
assert.equal(S.active(s).filter((p) => p.status === "active").length, 53);
assert(S.validate(s));
// Legal tampering cannot bind before open. Expiries expose free agents at the league-year switch.
s = fresh();
s.phase = "offseason";
s.franchise.calendar.leagueYear = 2027;
s.franchise.market = {
  day: 0,
  phase: "Tampering",
  offers: [],
  gains: [],
  losses: [],
};
let exp = s.roster[0],
  contract = s.franchise.contracts[exp.id];
contract.years = 1;
contract.prorate = 1;
for (const key of ["base", "roster", "workout", "guarantees"])
  contract[key] = contract[key].slice(0, 1);
W.marketDay(s);
W.marketDay(s);
assert(s.roster.includes(exp));
W.marketDay(s);
assert(!s.roster.includes(exp));
assert(
  s.agents.includes(exp) ||
    s.franchise.clubs.some((t) => t.players.includes(exp)),
);
console.log(
  "PASS: franchise migration, cap cents, transaction rollback, contracts, bidding, roles, roster/IR/elevations, scouting, imports, worker determinism/statistics, 18-week calendar, 14-team playoffs, 223-pick sanctioned draft, rollover, and contract expiry.",
);

// Multi-year rollover must keep CPU player IDs unique and practice squads bounded.
s = fresh();
for (let year = 0; year < 5; year++) {
  s.phase = "offseason";
  s.franchise.calendar.leagueYear = s.year + 1;
  s.franchise.draft = null;
  P.beginDraft(s);
  let guard = 0;
  while (s.franchise.draft.cursor < s.franchise.draft.picks.length) {
    P.draftPick(s, s.prospects[0].id);
    assert(++guard < 30);
  }
  L.rollSeason(s);
  P.trimRoster(s);
  P.recruitDepth(s);
  assert(S.validate(s));
  for (let t = 0; t < 32; t++)
    assert.equal(
      S.active(s, t).filter((p) => p.status === "active").length,
      53,
    );
}
console.log(
  "PASS: five-season roster, draft, expiry, retirement, reserve recruitment and CPU depth soak.",
);
