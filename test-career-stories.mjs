import { buildActors } from "./dist/engine/execution.mjs";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import * as S from "./dist/franchise/state.mjs";
import * as L from "./dist/franchise/lifecycle.mjs";
import { applyRealRosters } from "./dist/franchise/real-rosters.mjs";
import {
  configureRatings,
  ensureCareerRatings,
  performanceAdjustment,
  refreshPlayerRating,
  developPlayer,
  baselineStatsFor,
  serializeCareer,
} from "./dist/franchise/ratings.mjs";
import {
  newgenIdentity,
  faceSVG,
  retireRecord,
  retirementAge,
} from "./dist/franchise/newgens.mjs";
import {
  createConversation,
  chooseResponse,
  conversationValid,
  reviewPromises,
} from "./dist/franchise/conversations.mjs";
const data = JSON.parse(fs.readFileSync("dist/data/nfl-rosters.json")),
  ratings = JSON.parse(fs.readFileSync("dist/data/madden-ratings.json")),
  stats = JSON.parse(fs.readFileSync("dist/data/player-production.json")),
  legends = JSON.parse(fs.readFileSync("dist/data/legends.json"));
const context = {
  console,
  Date,
  Math,
  setTimeout() {},
  localStorage: {
    getItem() {
      return null;
    },
    setItem() {},
  },
  document: {
    getElementById() {
      return { innerHTML: "", style: {}, showModal() {}, close() {} };
    },
  },
};
vm.createContext(context);
vm.runInContext(fs.readFileSync("dist/game.js", "utf8"), context);
let s = JSON.parse(vm.runInContext("JSON.stringify(state)", context));
s.coach = { name: "Test coach" };
S.migrate(s);
configureRatings(ratings, stats);
applyRealRosters(s, data);
ensureCareerRatings(s);
s.franchise.cinema = { active: null, history: [], promises: [] };
assert.equal(ratings.players.length, 1941);
assert.equal(
  new Set(
    ratings.players.map((p) => p.name + "-" + p.position.id + "-" + p.team.id),
  ).size,
  1941,
);
assert(stats.players.length > 1900);
assert.equal(legends.length, 13);
for (const p of legends) {
  assert(fs.statSync("dist/" + p.image).size > 1000);
  assert(
    p.stats &&
      p.achievements.length &&
      p.source.startsWith("https://www.profootballhof.com/"),
  );
}
assert(s.franchise.ratingsSource.matched > 1600);
const jefferson = S.roster(s, 23).find((p) => p.name === "Justin Jefferson");
assert(jefferson.ratings.base > 90, "WR must not receive same-name LB rating");
assert(baselineStatsFor(jefferson).recYards > 500);
const lamb = s.roster.find((p) => p.name === "CeeDee Lamb"),
  ea = ratings.players.find((p) => p.name === "CeeDee Lamb");
assert.equal(lamb.ratings.base, ea.ovr);
assert.equal(lamb.ratings.attributes.speed, ea.attributes.speed);
assert(baselineStatsFor(lamb).receptions > 0);
assert(Math.abs(lamb.ovr - ea.ovr) <= 3);
const size = Buffer.byteLength(serializeCareer(s));
assert(size < 4_500_000, `Initial career too large for local saving: ${size}`);
const compact = JSON.parse(serializeCareer(s));
ensureCareerRatings(compact);
assert.deepEqual(compact, s, "compact save restores all source attributes");
const original = JSON.stringify(s);
ensureCareerRatings(s);
assert.equal(JSON.stringify(s), original, "rating refresh is idempotent");
for (const p of s.roster) {
  assert(p.ovr <= 99 && p.ovr >= 1);
  assert(p.pot >= p.ratings.base);
}
assert.equal(
  performanceAdjustment(
    { pos: "QB" },
    { attempts: 1, completions: 1, passTD: 1 },
  ),
  0,
);
assert(
  performanceAdjustment(
    { pos: "QB" },
    { attempts: 500, completions: 450, passTD: 90 },
  ) <= 3,
);
const quick = {
  ...structuredClone(lamb),
  ovr: 80,
  fitness: 100,
  ratings: {
    base: 80,
    attributes: { speed: 98, catching: 95, shortRouteRunning: 95 },
  },
};
const slow = structuredClone(quick);
slow.ratings.attributes.speed = 60;
const tired = structuredClone(quick);
tired.fitness = 50;
const fastActor = buildActors(25, { WR: [quick] })[2];
assert(fastActor.maxSpeed > buildActors(25, { WR: [slow] })[2].maxSpeed);
assert(
  fastActor.maxSpeed > buildActors(25, { WR: [tired] })[2].maxSpeed,
  "source speed must still respect fatigue",
);
const unknown = S.makePlayer("test-unmatched", "OL", 1);
refreshPlayerRating(unknown, s.year);
assert(!unknown.ratings.edition);
assert.equal(performanceAdjustment(unknown, {}), 0);
const id = lamb.id,
  oldMorale = lamb.morale;
s.franchise.cinema.active = createConversation(s, "player", id);
assert(conversationValid(s, s.franchise.cinema.active));
chooseResponse(s, 0);
assert.equal(s.roster.find((p) => p.id === id).morale, oldMorale);
const halfway = JSON.parse(JSON.stringify(s));
let result = chooseResponse(halfway, 2);
assert(result.complete);
assert.equal(
  halfway.roster.find((p) => p.id === id).morale,
  Math.min(99, oldMorale + 4),
);
assert.equal(halfway.franchise.cinema.promises.length, 1);
assert.throws(() => chooseResponse(halfway, 2));
assert.throws(
  () => createConversation(halfway, "player", id),
  /already complete/,
);
assert.throws(() => createConversation(s, "player", "missing"), /no longer/);
assert.throws(() => chooseResponse(s, 4), /available/);
const stale = structuredClone(s);
stale.week++;
assert(!conversationValid(stale, stale.franchise.cinema.active));
assert.throws(() => chooseResponse(stale, 0), /expired/);
halfway.week++;
reviewPromises(halfway);
assert(halfway.franchise.cinema.promises[0].dueNow);
halfway.week += 2;
reviewPromises(halfway);
assert.equal(halfway.franchise.cinema.promises[0].outcome, "Review missed");
const staff = structuredClone(s);
staff.franchise.cinema.active = createConversation(staff, "staff");
chooseResponse(staff, 1);
chooseResponse(staff, 1);
assert(staff.franchise.directives.feedRB);
const team = structuredClone(s);
team.franchise.cinema.active = createConversation(team, "team");
chooseResponse(team, 0);
chooseResponse(team, 0);
assert.equal(team.morale, Math.min(99, s.morale + 3));
assert.deepEqual(
  newgenIdentity("draft-1", 123),
  newgenIdentity("draft-1", 123),
);
let faces = new Set(),
  names = new Set(),
  portraits = new Set();
for (let i = 0; i < 1000; i++) {
  let p = S.makePlayer("future-" + i, S.POS[i % 22], 2027 + i, true);
  faces.add(p.face.seed);
  portraits.add(faceSVG(p));
  names.add(p.name);
  assert(p.generated && p.age >= 21 && p.age <= 23 && p.pot >= p.ovr);
  assert(faceSVG(p).includes("<svg"));
}
assert.equal(faces.size, 1000);
assert(
  portraits.size > 950,
  "Generated face geometry should vary, not only an internal seed",
);
assert(names.size > 900);
const retirement = structuredClone(s);
const star = retirement.roster.find((p) => p.id === id);
star.age = retirementAge(star) - 1;
star.stats = { 2026: { recYards: 15000, recTD: 110, receptions: 950 } };
retirement.phase = "offseason";
const released = retirement.roster.find((p) => p.id !== id && p.age < 28);
released.age = 25;
retirement.franchise.contracts[released.id].years = 1;
retirement.franchise.contracts[released.id].prorate = 1;
for (const key of ["base", "roster", "workout", "guarantees"])
  retirement.franchise.contracts[released.id][key] =
    retirement.franchise.contracts[released.id][key].slice(0, 1);
retirement.franchise.contracts[released.id].start = retirement.year;
L.rollSeason(retirement);
assert(!retirement.roster.some((p) => p.id === id));
const archived = retirement.franchise.retired.find((p) => p.id === id);
assert.equal(archived.totals.recYards, 15000);
assert(retirement.franchise.hall.some((p) => p.id === id));
assert.equal(archived.year, 2032);
assert.equal(retirement.prospects.length, 260);
assert(
  retirement.prospects.every((p) => p.generated && p.face && p.development),
);
assert.equal(
  retirement.agents.find((p) => p.id === released.id)?.age,
  26,
  "new free agents must age only once",
);
for (let i = 0; i < 5; i++) {
  retirement.phase = "offseason";
  retirement.franchise.calendar.leagueYear = retirement.year + 1;
  L.rollSeason(retirement);
}
assert(retirement.franchise.hall.find((p) => p.id === id).inducted);
S.validate(retirement);
console.log(
  `PASS: EA/stat matching (${s.franchise.ratingsSource.matched} players), source grades and bounded performance, ${Math.round(size / 1024)}KB save size; branching/resumable dialogue, duplicate/stale/null guards, morale/trust/promises/directives; 1,000 deterministic newgen faces, retirement snapshots, 260-player classes and Hall induction after five seasons; 13 verified image assets.`,
);
