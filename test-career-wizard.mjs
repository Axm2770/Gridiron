// New-career wizard helpers: the club outlook must match the world a new career actually starts
// with (team ratings and cap room after applyRealRosters), and the wizard presets must pass
// validateCoach.
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import * as S from "./dist/franchise/state.mjs";
import { applyRealRosters } from "./dist/franchise/real-rosters.mjs";
import { configureRatings } from "./dist/franchise/ratings.mjs";
import { clubOutlook, difficultyFor, EXPECTATION } from "./dist/franchise/club-outlook.mjs";
import {
  defaultCoach,
  validateCoach,
  BACKGROUNDS,
  APPEARANCE_SWATCHES,
  PHILOSOPHY,
  coachArchetype,
  autoSaveName,
} from "./dist/franchise/coach-profile.mjs";

const ctx = {
  console,
  Date,
  Math,
  setTimeout: () => {},
  localStorage: { getItem: () => null, setItem() {} },
  document: {
    getElementById: () => ({ innerHTML: "", style: {}, showModal() {}, close() {} }),
    querySelector: () => ({}),
    querySelectorAll: () => [],
  },
};
ctx.window = ctx;
ctx.addEventListener = () => {};
vm.createContext(ctx);
vm.runInContext(fs.readFileSync("dist/game.js", "utf8"), ctx);
vm.runInContext(fs.readFileSync("dist/match.js", "utf8"), ctx);
configureRatings(
  JSON.parse(fs.readFileSync("dist/data/madden-ratings.json", "utf8")),
  JSON.parse(fs.readFileSync("dist/data/player-production.json", "utf8")),
);
const snapshot = JSON.parse(fs.readFileSync("dist/data/nfl-rosters.json", "utf8"));

const outlook = clubOutlook(snapshot);
assert.equal(outlook.length, 32);

// The real start: fresh world + real rosters, as Career.begin() → startCareer does.
const s = JSON.parse(vm.runInContext("JSON.stringify(fresh(16))", ctx));
s.coach = { name: "Wizard Test" };
S.migrate(s);
applyRealRosters(s, structuredClone(snapshot));
for (let i = 0; i < 32; i++) {
  const o = outlook[i];
  assert.equal(o.team, i);
  assert.equal(o.rating, s.teams[i].rating, `opening rating for team ${i}`);
  const room = S.capLedger(s, i, s.year).room / S.MILLION;
  assert.ok(Math.abs(o.capRoom - room) < 0.2, `cap room for team ${i}: ${o.capRoom} vs ${room}`);
  assert.ok(o.rank >= 1 && o.rank <= 32);
  assert.ok(o.projected >= 3 && o.projected <= 14);
  assert.ok(Object.values(EXPECTATION).includes(o.expectation));
  assert.ok(o.star?.name && o.qb?.name, "star and starting QB named");
}
// Ranks follow ratings; the best club is a contender, the weakest a rebuild.
const best = outlook.reduce((a, b) => (b.rating > a.rating ? b : a)),
  worst = outlook.reduce((a, b) => (b.rating < a.rating ? b : a));
assert.equal(best.rank, 1);
assert.equal(best.expectation, "Contender");
assert.equal(worst.expectation, "Rebuild");
assert.ok(best.projected > worst.projected);
assert.equal(difficultyFor(1).label, "Easy");
assert.equal(difficultyFor(16).label, "Normal");
assert.equal(difficultyFor(17).label, "Hard");
assert.equal(difficultyFor(32).label, "Very hard");
assert.equal(clubOutlook(null), null);

// Swatches and philosophy presets stay inside what validateCoach accepts.
for (const key of ["skin", "hair", "jacket"])
  for (const hex of APPEARANCE_SWATCHES[key]) {
    const c = defaultCoach(3);
    c.appearance[key] = hex;
    assert.equal(validateCoach(c), true, key + " " + hex);
  }
for (const [key, values] of Object.entries(PHILOSOPHY))
  for (const value of Object.keys(values)) {
    const c = defaultCoach(3);
    c[key] = value;
    if (key === "background") c.attributes = { ...BACKGROUNDS[value] };
    assert.equal(validateCoach(c), true, key + " " + value);
  }
assert.deepEqual(Object.keys(PHILOSOPHY.background), Object.keys(BACKGROUNDS));
assert.equal(coachArchetype(BACKGROUNDS["College Innovator"]), "Development Wizard");
assert.equal(coachArchetype({ ...BACKGROUNDS["Former Player"], defense: 16 }), "Defensive Genius");
assert.equal(coachArchetype(BACKGROUNDS["Former Player"]), "Offensive Guru");
assert.equal(autoSaveName("Alex Morgan", "Cowboys"), "Alex Morgan · Cowboys");
assert.ok(autoSaveName("x".repeat(80), "Cowboys").length <= 60);
console.log("career wizard tests passed");
