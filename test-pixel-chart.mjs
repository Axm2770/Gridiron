// Pixel chart helpers (ui/pixel-chart.mjs) and the read-only analytics behind Data & analysis.
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import * as C from "./dist/ui/pixel-chart.mjs";
import * as S from "./dist/franchise/state.mjs";
import * as A from "./dist/franchise/analysis.mjs";

// --- pure chart maths -------------------------------------------------------------------------
assert.equal(C.tone("good"), "var(--gd-good)");
assert.equal(C.tone("nope"), "var(--gd-accent)");
assert.equal(C.tone("var(--team)"), "var(--team)");
assert.equal(C.tone("red; background:url(x)"), "var(--gd-accent)", "only tokens pass through");
assert.equal(C.snap(5), 4);
assert.equal(C.snap(6), 8);
assert.equal(C.snap(7, 2), 8);
assert.equal(C.niceMax(63), 80);
assert.equal(C.niceMax(100), 100);
assert.equal(C.niceMax(407), 500);
assert.equal(C.niceMax(0), 1);
assert.equal(C.niceMax(NaN), 1);
assert.equal(C.blocks(0, 10), 0);
assert.equal(C.blocks(0.01, 10), 1, "any positive value shows one block");
assert.equal(C.blocks(5, 10), 5);
assert.equal(C.blocks(50, 10), 10, "never more than the segment count");
assert.equal(C.blocks(null, 10), 0);
assert.equal(C.scaleTo(1, 100, 120), 4, "tiny values still get one cell");
assert.equal(C.scaleTo(100, 100, 120), 120);
assert.equal(C.scaleTo(0, 100, 120), 0);
for (const px of [C.scaleTo(33, 100, 120), C.scaleTo(77, 100, 120)]) assert.equal(px % 4, 0, "lengths snap to the grid");

const rects = C.stepRects([10, 20, null, 5], { w: 160, h: 40, cell: 4, max: 20 });
assert(rects.every((r) => r.x % 4 === 0 && r.y % 4 === 0 && r.w > 0 && r.h > 0), "every rect is on the pixel grid");
const runs = rects.filter((r) => r.h === 4 && r.w >= 40);
assert.equal(runs.length, 3, "one horizontal run per recorded value; null leaves a gap");
assert.equal(runs[1].y, 0, "the maximum sits on the top row");
assert(runs[0].y > runs[1].y, "smaller values sit lower");
assert.equal(rects.length, 4, "a riser joins the first two values but not across the gap");
assert.deepEqual(C.stepRects([], {}), []);

// --- markup ------------------------------------------------------------------------------------
const bars = C.barChart([{ label: "W1", values: [24, 17] }, { label: "W2", values: [0, 31] }], { series: [{ label: "Scored" }, { label: "Allowed", tone: "bad" }] });
assert(bars.includes('shape-rendering="crispEdges"'));
assert(bars.includes("var(--gd-bad)") && bars.includes("W2"));
assert(!/#[0-9a-f]{3,6}\b/i.test(bars), "charts use tokens, not hex colours");
assert.equal(C.barChart([]), "");
const step = C.stepChart([{ label: "Yards", values: [300, 410, 280] }], { avg: 350, labels: ["W1", "W2", "W3"] });
assert(step.includes("League avg 350") && step.includes("W3"));
assert.equal(C.sparkline([5]), "", "a sparkline needs two points");
assert(C.sparkline([1, 3, 2]).startsWith("<svg"));
assert(C.hbar(5, 10, { avg: 4 }).includes("var(--gd-text)"), "reference tick drawn");
assert.equal((C.meter(3, 10).match(/<i /g) || []).length, 10);
assert(C.meter(1, 1, { title: '"><img>' }).includes("&quot;&gt;&lt;img&gt;"), "labels are escaped");

// --- analytics from recorded data -----------------------------------------------------------------
const ctx = { console, Date, Math, setTimeout: () => {}, localStorage: { getItem: () => null, setItem() {} }, document: { getElementById: () => ({ style: {} }), querySelector: () => ({}), querySelectorAll: () => [] } };
ctx.window = ctx;
ctx.addEventListener = () => {};
vm.createContext(ctx);
vm.runInContext(fs.readFileSync("dist/game.js", "utf8"), ctx);
vm.runInContext(fs.readFileSync("dist/match.js", "utf8"), ctx);
const s = JSON.parse(vm.runInContext("JSON.stringify(fresh())", ctx));
s.coach = { name: "Test Coach", calling: "Manual" };
S.migrate(s);
assert.equal(A.teamProfile(s).ppg, null, "no games, no rates");
assert.equal(A.leagueRanks(s).metrics.find((m) => m.key === "ppg").rank, null);
assert.deepEqual(A.weeklyTrend(s), []);
assert.equal(A.playMix(s).plays, 0);
assert.equal(A.rankOf(5, [9, 5, 1], true), 2);
assert.equal(A.rankOf(5, [9, 5, 1], false), 2);
assert.equal(A.rankOf(9, [9, 9, 1], true), 1, "ties share the better rank");
assert.equal(A.rankOf(null, [1]), null);
// Two settled games for the user's club and one elsewhere.
const opp = (s.team + 1) % 32;
s.schedule[0].push({ a: s.team, b: opp, score: [28, 14] });
s.schedule[1].push({ a: opp, b: s.team, score: [21, 10] });
const t = s.teams[s.team];
Object.assign(t, { w: 1, l: 1, pf: 38, pa: 35 });
Object.assign(s.teams[opp], { w: 1, l: 1, pf: 35, pa: 38 });
s.franchise.statBook = { games: [
  { id: "q", team: s.team, year: s.year, week: 0, key: `${s.year}:season:0:0`, stats: { passYards: 250, rushYards: 90, interceptions: 1 } },
  { id: "d", team: s.team, year: s.year, week: 0, key: `${s.year}:season:0:0`, stats: { sacks: 2, defInterceptions: 1 } },
  { id: "q", team: s.team, year: s.year, week: 0, key: `${s.year}:playoffs:0:1`, stats: { passYards: 999 } },
], teamTotals: { [s.year]: { [s.team]: { q: { stats: { passYards: 400, rushYards: 160, attempts: 50, completions: 30, interceptions: 2 } } } } } };
const trend = A.weeklyTrend(s).filter((g) => g.opponent === opp);
assert.equal(trend.length, 2);
assert.deepEqual([trend[0].for, trend[0].against, trend[0].result], [28, 14, "W"]);
assert.deepEqual([trend[1].for, trend[1].against, trend[1].result], [10, 21, "L"], "score is read from the club's side");
assert.equal(trend[0].yards, 340, "regular-season lines only; playoff lines excluded");
assert.equal(trend[0].sacks, 2);
assert.equal(trend[1].yards, null, "no recorded lines → no yards, not zero");
const prof = A.teamProfile(s);
assert.equal(prof.ppg, 19);
assert.equal(prof.yards, 280);
assert.equal(prof.completionPct, 60);
assert.equal(prof.giveaways, 1);
const ranks = A.leagueRanks(s);
assert.equal(ranks.teams, 2);
assert.equal(ranks.metrics.find((m) => m.key === "ppg").rank, 1);
assert.equal(ranks.metrics.find((m) => m.key === "allowed").rank, 1, "lower is better for points allowed");
assert.equal(A.leagueRanks(s, opp).metrics.find((m) => m.key === "allowed").rank, 2, "the other club concedes more");
s.franchise.decisionLedger = {
  [`${s.year}:season:0:0`]: { calls: { "Inside run": 20, "Quick pass": 25, "Deep pass": 5, Punt: 4, "Field goal": 1 }, fourths: [{ good: true }, { good: false }] },
  [`${s.year - 1}:season:5:0`]: { calls: { "Inside run": 99 }, fourths: [] },
};
const mix = A.playMix(s);
assert.deepEqual([mix.run, mix.pass, mix.kick, mix.games], [20, 30, 5, 1], "only this season; kicks counted apart");
assert.equal(mix.runPct, 40);
assert.deepEqual([mix.fourthTries, mix.fourthMade], [2, 1]);
const units = A.unitComparison(s);
assert.equal(units.length, A.UNITS.length);
assert(units.every((u) => u.value === null || (u.rank >= 1 && u.rank <= 32)));
s.roster[0].stats[s.year] = { ...(s.roster[0].stats[s.year] || {}), tackles: 77 };
assert.equal(A.leaders(s, "tackles", { n: 3 })[0].value, 77);
assert(A.leaders(s, "tackles", { n: 50 }).every((r) => r.value > 0), "leaderboards skip empty values");
assert(A.STAT_VIEWS.Defense.some(([k]) => k === "defInterceptions"), "recorded interceptions are listed");
// Reading never writes.
const snapshot = JSON.stringify(s);
A.leagueRanks(s);
A.weeklyTrend(s);
A.playMix(s);
A.unitComparison(s);
A.leaders(s, "passYards");
assert.equal(JSON.stringify(s), snapshot, "analytics are read-only");
console.log("PASS: pixel chart grid maths and token-only markup; recorded-data analytics (ranks, weekly trend, play mix, units, leaders) honest about missing samples.");
