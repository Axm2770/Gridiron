// The NFL game plan (franchise/tactics.mjs + play-calling.mjs): every option maps to inputs the
// match engine understands, defaults reproduce the original staff calls, the fourth-down chart
// and situational packages trigger where they should, old saves load, the Tactics screen renders
// every tab, and extreme settings keep scores inside the calibrated range.
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import * as S from "./dist/franchise/state.mjs";
import * as PC from "./dist/franchise/play-calling.mjs";
import * as TX from "./dist/franchise/tactics.mjs";
import * as G from "./dist/franchise/game-plan.mjs";
import { RUN_SCHEMES, simulateExecution } from "./dist/engine/execution.mjs";
import { roundJob } from "./dist/franchise/matchday-sim.mjs";
import { simulateGame } from "./dist/franchise/fast-worker.mjs";
import { applyRealRosters } from "./dist/franchise/real-rosters.mjs";
import { configureRatings, ensureCareerRatings } from "./dist/franchise/ratings.mjs";
import { installFrontOfficeUI } from "./dist/franchise/front-office-ui.mjs";

const ctx = { console, Math, Date, setTimeout() {}, localStorage: { getItem: () => null, setItem() {} }, document: { getElementById: () => ({ innerHTML: "", style: {}, showModal() {}, close() {} }), querySelector: () => ({}), querySelectorAll: () => [] } };
ctx.window = ctx;
ctx.addEventListener = () => {};
vm.createContext(ctx);
vm.runInContext(fs.readFileSync("dist/game.js", "utf8"), ctx);
vm.runInContext(fs.readFileSync("dist/match.js", "utf8"), ctx);
configureRatings(JSON.parse(fs.readFileSync("dist/data/madden-ratings.json")), JSON.parse(fs.readFileSync("dist/data/player-production.json")));
const rosters = JSON.parse(fs.readFileSync("dist/data/nfl-rosters.json"));
function career(team = 12) {
  const s = JSON.parse(vm.runInContext(`JSON.stringify(fresh(${team}))`, ctx));
  s.coach = { name: "Tactics QA", calling: "Manual", style: "Balanced", offense: "Shotgun spread", defense: "Nickel" };
  S.migrate(s);
  applyRealRosters(s, rosters);
  ensureCareerRatings(s);
  s.franchise.role = "HC";
  return s;
}

// 1. Every option is described and maps to valid engine inputs in every situation.
const FORMATIONS = ["Shotgun spread", "Singleback", "I formation", "Empty backfield"],
  PERSONNEL = ["11", "12", "21", "10", "Goal Line"],
  FRONTS = ["4–3 base", "3–4 base", "Nickel", "Dime"],
  SHELLS = ["2-High", "Single-High", "Zero"];
for (const [key, list] of Object.entries(PC.PLAN_VALUES)) {
  assert.deepEqual(TX.OPTIONS[key].options.map((o) => o.value), list, `${key} options match the plan values`);
  assert(list.includes(PC.PLAN_DEFAULTS[key]), `${key} default is an option`);
  for (const o of TX.OPTIONS[key].options) assert(o.tip.length > 20 && o.tip.endsWith(".") && o.sub, `${key}/${o.value} has a plain-English explanation`);
}
const situations = [];
for (const down of [1, 2, 3, 4])
  for (const toGo of [1, 3, 8, 12])
    for (const spot of [10, 35, 50, 62, 72, 85, 97])
      for (const [quarter, clock] of [[1, 800], [2, 90], [4, 100], [4, 600]])
        for (const score of [[0, 0], [7, 14], [21, 10]])
          situations.push({ down, toGo: Math.min(toGo, 100 - spot), spot, quarter, clock, score, poss: 0, plays: down * 7 + spot, engine: { seed: spot * 31 + quarter } });
const checkSnap = (m, plan, label) => {
  const o = PC.offenseSnap(m, { plan, style: "Balanced", front: "4–3 base" });
  assert(PC.ENGINE_CALLS.includes(o.call), `${label}: call ${o.call}`);
  assert(o.scheme === undefined || RUN_SCHEMES.includes(o.scheme), `${label}: scheme ${o.scheme}`);
  assert(FORMATIONS.includes(o.formation) && PERSONNEL.includes(o.personnel), `${label}: ${o.formation} ${o.personnel}`);
  assert(o.tempo === undefined || ["Hurry-up", "Chew clock"].includes(o.tempo), `${label}: tempo ${o.tempo}`);
  const d = PC.defenseSnap(m, { plan, defCall: "Cover 2", front: plan.front || "Nickel", shell: "2-High" });
  assert(PC.ENGINE_COVERAGES.includes(d.coverage) && FRONTS.includes(d.front) && SHELLS.includes(d.shell), `${label}: ${JSON.stringify(d)}`);
  return { o, d };
};
for (const [key, list] of Object.entries(PC.PLAN_VALUES))
  for (const value of list) for (const m of situations) checkSnap(m, { [key]: value }, `${key}=${value}`);
// The engine runs every mapped input.
const s0 = career();
const groups = (team) => {
  const g = {};
  for (const p of S.roster(s0, team)) (g[p.pos] ??= []).push(p);
  return g;
};
let seed = 1;
for (const call of PC.ENGINE_CALLS)
  for (const [i, coverage] of PC.ENGINE_COVERAGES.entries()) {
    const ex = simulateExecution({ seed: seed++, playId: `t-${seed}`, spot: 40, call, coverage, formation: FORMATIONS[i % 4], personnel: PERSONNEL[i % 5], front: FRONTS[i % 4], shell: SHELLS[i % 3], scheme: call === "Inside run" ? RUN_SCHEMES[i % 4] : undefined, offensePlayers: groups(s0.team), defensePlayers: groups(1), capture: false });
    assert(ex.result && Number.isFinite(ex.result.yards), `${call} vs ${coverage}`);
  }

// 2. The default plan reproduces the original staff calls exactly.
function original(m, { style = "Balanced", directives = {} } = {}) {
  if (m.down === 4) {
    const late = m.quarter >= 4 && m.clock < 180,
      losing = m.score[m.poss] < m.score[1 - m.poss];
    return late && losing && m.spot < 60 ? "Quick pass" : m.spot >= 60 ? "Field goal" : "Punt";
  }
  if (directives?.feedRB && m.plays % 3 !== 0) return "Inside run";
  if (directives?.protectQB) return "Quick pass";
  const mix = { Balanced: { runEvery: 3, deep: 0.06, action: 0.06 }, "Run-first": { runEvery: 2, deep: 0.03, action: 0.12 }, "Vertical offense": { runEvery: 4, deep: 0.12, action: 0.04 } }[style];
  let x = ((m.engine?.seed ?? 0) ^ Math.imul((m.plays || 0) + 1, 0x9e3779b1)) >>> 0;
  x = (Math.imul(x, 1664525) + 1013904223) >>> 0;
  const r = x / 4294967296;
  if (m.plays % mix.runEvery === 0) return "Inside run";
  return r < mix.deep ? "Deep pass" : r < mix.deep + mix.action ? "Play action" : "Quick pass";
}
for (const m of situations)
  for (const style of ["Balanced", "Run-first", "Vertical offense"])
    for (const directives of [{}, { feedRB: true }, { protectQB: true }]) {
      assert.equal(PC.staffDecision(m, { style, directives }), original(m, { style, directives }));
      const o = PC.offenseSnap(m, { style, directives, plan: PC.PLAN_DEFAULTS });
      assert.equal(o.call, original(m, { style, directives }));
      assert(!o.scheme && !o.tempo && o.formation === "Shotgun spread" && o.personnel === "11");
      assert.deepEqual(PC.defenseSnap(m, { plan: PC.PLAN_DEFAULTS, defCall: "Man coverage", front: "Nickel", shell: "2-High" }), { coverage: "Man coverage", front: "Nickel", shell: "2-High", pkg: null });
    }
assert.equal(PC.counterStyle(PC.PLAN_DEFAULTS), "Balanced");
assert.deepEqual(PC.matchPersonnel("Shotgun spread", "11"), { front: "Nickel", shell: "2-High" }, "11 personnel meets the original nickel");

// 3. Fourth-down chart behaves by setting.
const decide = (setting, spot, toGo, extra = {}) => PC.fourthDownDecision({ spot, toGo, ...extra }, setting);
const goes = (setting) => TX.fourthChart(setting).flatMap((r) => r.cells).filter((c) => c === "Go").length;
assert.equal(goes("Conservative"), 0);
assert.equal(goes("Balanced"), 0);
assert(goes("Aggressive") >= 8, "the analytics chart goes for it on short yardage");
assert.equal(decide("Aggressive", 55, 1), "Go");
assert.equal(decide("Balanced", 55, 1), "Punt");
assert.equal(decide("Aggressive", 20, 1), "Punt", "nobody goes for it deep in his own end");
assert.equal(decide("Balanced", 61, 6), "Field goal");
assert.equal(decide("Conservative", 61, 6), "Punt", "conservative kicks only from the 37 in");
for (const setting of PC.PLAN_VALUES.fourth) assert.equal(decide(setting, 45, 6, { quarter: 4, clock: 90, diff: -5 }), "Go", `${setting} goes for it trailing late`);
assert.equal(PC.offenseSnap({ down: 4, toGo: 1, spot: 55, quarter: 1, clock: 600, score: [0, 0], poss: 0, plays: 3 }, { plan: { fourth: "Aggressive" } }).call, "Inside run");

// 4. Situational packages apply only in their situations.
const snapAt = (fields, plan) => PC.offenseSnap({ down: 1, toGo: 10, spot: 50, quarter: 1, clock: 600, score: [0, 0], poss: 0, plays: 4, engine: { seed: 9 }, ...fields }, { plan });
assert.equal(snapAt({ spot: 85 }, { redZone: "Power run" }).pkg, "Red zone");
assert.equal(snapAt({ spot: 85 }, { redZone: "Power run" }).personnel, "12");
assert.equal(snapAt({ spot: 50 }, { redZone: "Power run" }).pkg, null);
assert.equal(snapAt({ spot: 97, toGo: 3 }, { goalLine: "Heavy run" }).personnel, "Goal Line");
assert.equal(snapAt({ spot: 97, toGo: 3 }, { goalLine: "Heavy run", redZone: "Spread & quick" }).pkg, "Goal line", "goal line outranks red zone");
assert.equal(snapAt({ quarter: 4, clock: 100, score: [10, 17] }, { twoMinute: "Hurry-up" }).tempo, "Hurry-up");
assert.equal(snapAt({ quarter: 4, clock: 100, score: [17, 10] }, { twoMinute: "Hurry-up" }).pkg, null, "no two-minute drill when leading late");
assert.equal(snapAt({ quarter: 2, clock: 100, score: [17, 10] }, { twoMinute: "Hurry-up" }).pkg, "Two-minute", "every team hurries before halftime");
assert.equal(snapAt({ down: 3, toGo: 1 }, { third: "Run on short" }).scheme, "Power");
assert.equal(snapAt({ down: 3, toGo: 8 }, { third: "Run on short" }).pkg, null);
assert.equal(snapAt({ down: 2, toGo: 8 }, { third: "Shot plays" }).pkg, null);
const defAt = (fields, plan) => PC.defenseSnap({ down: 1, toGo: 10, spot: 50, quarter: 1, clock: 600, score: [0, 0], poss: 0, plays: 4, engine: { seed: 9 }, ...fields }, { plan, defCall: "Cover 2", front: "Nickel", shell: "2-High" });
assert.equal(defAt({ down: 3, toGo: 9 }, { dThird: "Dime zone" }).front, "Dime");
assert.equal(defAt({ down: 3, toGo: 4 }, { dThird: "Dime zone" }).pkg, null);
assert.equal(defAt({ quarter: 4, clock: 60, score: [10, 17] }, { prevent: "On" }).coverage, "Prevent", "prevent when the defense leads late");
assert.equal(defAt({ quarter: 4, clock: 60, score: [17, 10] }, { prevent: "On" }).pkg, null, "no prevent when trailing");
assert.equal(defAt({ spot: 88 }, { dRedZone: "Bend" }).front, "4–3 base");
// Blitz rates show up at roughly the advertised rate.
const blitzShare = (blitz) => situations.filter((m) => m.down < 3).filter((m) => /blitz/.test(PC.defenseSnap({ ...m, quarter: 1 }, { plan: { blitz, coverage: "Cover 3" } }).coverage)).length / situations.filter((m) => m.down < 3).length;
assert(blitzShare("Four-man") === 0 && blitzShare("Occasional") > 0.05 && blitzShare("Aggressive") > blitzShare("Occasional"));
// Onside kicks: only after a late score that still trails.
{
  const prev = { score: [10, 20], poss: 0, quarter: 4, clock: 200 },
    next = () => ({ score: [17, 20], poss: 1, quarter: 4, clock: 190, spot: 25 });
  const a = next();
  assert.equal(PC.onsideKick(prev, a, 0, "Trailing late", 0.05), "recovered");
  assert.equal(a.poss, 0);
  const b = next();
  assert.equal(PC.onsideKick(prev, b, 0, "Trailing late", 0.5), "failed");
  assert.equal(b.spot, 55);
  assert.equal(PC.onsideKick(prev, next(), 0, "Never", 0.05), null);
  assert.equal(PC.onsideKick({ ...prev, score: [14, 20] }, { ...next(), score: [21, 20] }, 0, "Trailing late", 0.05), null, "no onside kick with the lead");
}

// 5. Old saves load: no plan reads as defaults; the coach fields stay in step.
{
  const s = career();
  delete s.coach.plan;
  const reloaded = JSON.parse(JSON.stringify(s));
  S.migrate(reloaded);
  assert.equal(TX.planOf(reloaded).scheme, "Multiple");
  assert.deepEqual(TX.jobTactics(reloaded), { style: "Balanced" }, "an untouched plan sends the original job");
  assert.deepEqual(roundJob(reloaded, reloaded.schedule[0][0]).tactics, { style: "Balanced" });
  reloaded.coach.offense = "I formation";
  assert.equal(TX.planOf(reloaded).formation, "I formation", "an old formation choice carries over");
  G.setGamePlan(reloaded, "formation", "Under center");
  assert.equal(reloaded.coach.offense, "I formation");
  G.setGamePlan(reloaded, "scheme", "West Coast");
  G.setGamePlan(reloaded, "defense", "Dime");
  assert.equal(TX.planOf(reloaded).front, "Dime");
  assert.equal(TX.jobTactics(reloaded).plan.scheme, "West Coast");
  assert.throws(() => G.setGamePlan(reloaded, "coverage", "Cover 9"));
  reloaded.coach.plan.tempo = "Warp speed";
  assert.equal(TX.planOf(reloaded).tempo, "Normal", "unknown stored values fall back to defaults");
  reloaded.franchise.role = "DC";
  assert(!G.canEdit(reloaded, "scheme") && G.canEdit(reloaded, "coverage") && !G.canEdit(reloaded, "onside"));
  const boost = TX.schemeBoost(reloaded);
  assert(Object.values(boost).every((d) => Math.abs(d) <= 1.5), "scheme fit moves ratings by at most 1.5");
  const fit = TX.schemeFit(reloaded);
  assert.equal(fit.offense.length, 7);
  assert(fit.offense.every((f) => f.fit >= 0 && f.fit <= 100 && f.note.endsWith(".")));
}

// 6. The Tactics screen renders every tab from real state.
{
  globalThis.window = globalThis;
  globalThis.document = { querySelector: () => ({}), head: { insertAdjacentHTML() {} } };
  globalThis.clubs = JSON.parse(vm.runInContext("JSON.stringify(clubs)", ctx));
  globalThis.esc = (x) => String(x ?? "").replaceAll("&", "&amp;").replaceAll('"', "&quot;").replaceAll("<", "&lt;");
  globalThis.logo = (t) => `<img src="assets/teams/${t}.png">`;
  globalThis.state = career(3);
  Object.assign(globalThis, { save() {}, render() {}, toast() {} });
  installFrontOfficeUI({ views: {}, isBusy: () => false });
  FrontOffice.plan("coverage", "Cover 1");
  FrontOffice.plan("scheme", "Spread RPO");
  for (const [tab, marker] of [["base", "Scheme family"], ["situational", "Fourth down"], ["advanced", "Run concept"], ["fit", "How the scheme fits"]]) {
    FrontOffice.tacticsTab(tab);
    const html = window.plan();
    assert(html.includes(marker) && html.includes("OPPONENT ANALYSIS"), tab);
    assert(!/undefined|NaN|\[object/.test(html), `${tab} renders cleanly`);
  }
  assert.equal(state.coach.plan.coverage, "Cover 1");
  assert(TX.matchupNotes(state, G.opponentReport(state)).length >= 1);
}

// 7. Extreme settings keep scores inside the calibrated range.
{
  const teams = [12, 3, 20],
    careers = teams.map((t) => career(t)),
    mean = (x) => x.reduce((a, b) => a + b, 0) / x.length;
  const run = (plan, style = "Balanced") => {
    const pf = [],
      pa = [];
    for (const s of careers) {
      s.coach.plan = plan;
      s.coach.style = style;
      for (let w = 0; w < 12; w++) {
        const g = s.schedule[w].find((x) => x.a === s.team || x.b === s.team);
        if (!g) continue;
        const r = simulateGame(roundJob(s, g)),
          k = g.a === s.team ? 0 : 1;
        pf.push(r.score[k]);
        pa.push(r.score[1 - k]);
      }
    }
    return [mean(pf), mean(pa)];
  };
  const single = [
    ...PC.PLAN_VALUES.scheme.map((scheme) => ({ scheme })),
    { formation: "I formation" },
    { formation: "Empty" },
    { personnel: "13" },
    { tempo: "Up-tempo" },
    { tempo: "Ball control" },
    { passConcept: "Play action" },
    { runConcept: "Power" },
    { fourth: "Aggressive" },
    { coverage: "Cover 0" },
    { coverage: "Cover 1" },
    { coverage: "Cover 4" },
    { blitz: "Aggressive" },
  ];
  const rows = [];
  for (const plan of single) {
    const [pf, pa] = run(plan);
    rows.push(`${Object.values(plan)[0]} ${pf.toFixed(1)}-${pa.toFixed(1)}`);
    assert(pf >= 16 && pf <= 31 && pa >= 16 && pa <= 31, `${JSON.stringify(plan)}: ${pf.toFixed(1)} for, ${pa.toFixed(1)} against`);
  }
  const maxOff = run({ scheme: "Power gap", formation: "I formation", personnel: "21", passConcept: "Play action", runConcept: "Power", tempo: "Up-tempo", fourth: "Aggressive", third: "Shot plays" }, "Vertical offense"),
    maxDef = run({ coverage: "Cover 1", manZone: "Man-heavy", press: "Press", blitz: "Aggressive", runFit: "Attacking", dThird: "Pressure", dRedZone: "Tight man" }),
    minOff = run({ scheme: "Spread RPO", formation: "Empty", personnel: "10", tempo: "Ball control", fourth: "Conservative" }, "Run-first");
  for (const [label, [pf, pa]] of [["max offense", maxOff], ["max defense", maxDef], ["min offense", minOff]])
    assert(pf >= 14 && pf <= 36 && pa >= 14 && pa <= 36, `${label}: ${pf.toFixed(1)}-${pa.toFixed(1)}`);
  console.log(`PASS: ${Object.values(PC.PLAN_VALUES).flat().length} game-plan options map to engine inputs in ${situations.length} situations; defaults match the original staff calls; fourth-down chart, packages, blitz rates and onside kicks trigger correctly; old saves load; all Tactics tabs render. Scores (for-against): ${rows.join(", ")}; stacked max offense ${maxOff.map((x) => x.toFixed(1)).join("-")}, max defense ${maxDef.map((x) => x.toFixed(1)).join("-")}, min offense ${minOff.map((x) => x.toFixed(1)).join("-")}.`);
}
