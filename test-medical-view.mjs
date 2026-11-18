import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import * as S from "./dist/franchise/state.mjs";
import { ensureMedical, openCase, chooseTreatment, physioCandidates, TREATMENTS } from "./dist/franchise/medical.mjs";
import { TEMPLATES, ensureTraining, weekPlan, summarizeSchedule, nextLevels, processTrainingWeek } from "./dist/franchise/training.mjs";
import { playerStatus, returnWeek, roomEntries, filterRoom, roomCounts, squadHealth, practiceLoad, intensityBand, unitReadiness, medicalLog, WEAR_RISK } from "./dist/franchise/medical-view.mjs";

const ctx = { console, Math, Date, setTimeout() {}, localStorage: { getItem: () => null, setItem() {} }, document: { getElementById: () => ({ innerHTML: "", style: {} }), querySelectorAll: () => [], querySelector: () => ({}) } };
ctx.window = ctx;
ctx.addEventListener = () => {};
vm.createContext(ctx);
vm.runInContext(fs.readFileSync("dist/game.js", "utf8"), ctx);
vm.runInContext(fs.readFileSync("dist/match.js", "utf8"), ctx);
globalThis.clubs = JSON.parse(vm.runInContext("JSON.stringify(clubs)", ctx));
const fresh = () => {
  const s = JSON.parse(vm.runInContext("JSON.stringify(fresh())", ctx));
  s.coach = { name: "QA" };
  S.migrate(s);
  return s;
};

// Training previews are the same numbers the week will use.
let s = fresh();
for (const sched of Object.values(TEMPLATES)) {
  ensureTraining(s).schedule = [...sched];
  assert.deepEqual(summarizeSchedule(sched), weekPlan(s), "schedule preview matches the weekly plan");
}
const t = ensureTraining(s),
  projected = nextLevels(t, weekPlan(s));
processTrainingWeek(s, "r-view-1");
assert.equal(t.familiarity, projected.familiarity, "projected familiarity is what the week delivers");
assert.equal(t.readiness, projected.readiness, "projected readiness is what the week delivers");

// Practice load mirrors world.weekly: heavy weeks wear joints, light weeks recover them.
assert(practiceLoad(90, 1).wear > 0 && practiceLoad(30, 1).wear < 0);
assert(practiceLoad(30).condition > practiceLoad(90).condition);
assert.equal(practiceLoad(100).injuryChance, 2.5);
assert.equal(intensityBand(10), "Light");
assert.equal(intensityBand(80), "Brutal");

// Availability status and the treatment room.
s = fresh();
s.franchise.clubs[s.team].cash = 1e12;
ensureMedical(s);
const healthy = s.roster.filter((p) => !p.injury && p.status === "active");
const [a, b, c, d] = healthy;
a.injury = 3;
a.medical = { bodyPart: "knee" };
openCase(s, a);
assert.equal(playerStatus(a, ensureMedical(s).cases[a.id]).key, "decision");
chooseTreatment(s, a.id, "rehab");
assert.equal(playerStatus(a, ensureMedical(s).cases[a.id]).key, "out");
assert.equal(returnWeek(s, a).week, s.week + a.injury + 1, "return week is shown 1-based like the header");
b.injury = 2;
b.medical = { bodyPart: "ankle" };
const cb = openCase(s, b),
  play = cb.options.find((o) => TREATMENTS[o].playsNow);
if (play) {
  chooseTreatment(s, b.id, play);
  assert.equal(playerStatus(b, ensureMedical(s).cases[b.id]).key, "questionable");
}
c.wear.knee = WEAR_RISK + 10;
d.fitness = 50;
assert.equal(playerStatus(c).key, "risk");
assert.equal(playerStatus(d).key, "risk");
assert.equal(playerStatus(healthy[5]).key, "fit");

const entries = roomEntries(s, ensureMedical(s).cases),
  counts = roomCounts(entries);
assert(entries.every((x) => x.status.key !== "fit"), "healthy, fresh players stay out of the treatment room");
assert(filterRoom(entries, "risk").every((x) => x.status.key === "risk"));
assert(!filterRoom(entries, "hurt").some((x) => x.status.key === "risk"));
assert.equal(counts.risk, filterRoom(entries, "risk").length);
const byWeeks = filterRoom(entries, "out", "weeks");
for (let i = 1; i < byWeeks.length; i++) assert(byWeeks[i - 1].p.injury >= byWeeks[i].p.injury, "sorted by weeks out");

const h = squadHealth(s);
assert(h.available <= h.total && h.availability >= 0 && h.availability <= 100);
assert(h.hot.some((x) => x.p.id === c.id), "worn joints are flagged as hot spots");
assert.equal(unitReadiness(s).reduce((n, u) => n + u.total, 0), s.roster.filter((p) => p.status !== "practice" && ["QB", "RB", "WR", "TE", "OL", "DL", "LB", "CB", "S", "K", "P"].includes(p.pos)).length);
assert(medicalLog(s).some((x) => x.title === "Treatment decided"));

// Physio candidates have distinct names.
const names = physioCandidates(s).map((x) => x.name);
assert.equal(new Set(names).size, names.length, "no duplicate physio names in a pool");

// Both screens render in Node.
globalThis.state = s;
const { medicalView, trainingView, trainingPlayersView } = await import("./dist/franchise/medical-ui.mjs");
const med = medicalView();
assert(med.includes("Treatment room") && med.includes("Medical staff") && med.includes("mt-health"));
assert(!/<(header|footer)\b/.test(med), "no global header/footer elements inside cards");
const tr = trainingView();
assert(tr.includes("Practice week") && (tr.match(/class="link mt-day /g) || []).length === 6, "six editable practice days plus game day");
assert(trainingPlayersView().includes("Individual development"));
console.log("medical view helpers ok");
