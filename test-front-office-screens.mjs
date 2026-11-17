import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import * as S from "./dist/franchise/state.mjs";
import * as Staff from "./dist/franchise/staff.mjs";
import * as DateBook from "./dist/franchise/calendar-core.mjs";
import * as B from "./dist/franchise/boardroom.mjs";
import * as G from "./dist/franchise/game-plan.mjs";
import { lockerReport } from "./dist/franchise/locker-room.mjs";
import { applyMood } from "./dist/franchise/newsroom.mjs";
import { installFrontOfficeUI } from "./dist/franchise/front-office-ui.mjs";

const ctx = { console, Math, Date, setTimeout() {}, localStorage: { getItem() { return null; }, setItem() {} }, document: { getElementById() { return { innerHTML: "", style: {}, showModal() {}, close() {} }; }, querySelector() { return {}; }, querySelectorAll() { return []; } } };
ctx.window = ctx;
ctx.addEventListener = () => {};
vm.createContext(ctx);
vm.runInContext(fs.readFileSync("dist/game.js", "utf8"), ctx);
vm.runInContext(fs.readFileSync("dist/match.js", "utf8"), ctx);
function fresh() {
  const s = JSON.parse(vm.runInContext("JSON.stringify(fresh())", ctx));
  s.coach = { name: "Front Office QA", style: "Balanced", calling: "Manual", offense: "Shotgun spread", defense: "Nickel" };
  S.migrate(s);
  Staff.ensureStaff(s);
  DateBook.ensureCalendar(s);
  return s;
}

// Old saves carrying delegation and permit state still load, migrate and validate.
let s = fresh();
s.franchise.delegation = { version: 1, preferences: { inbox: true }, preferred: null, history: [{ key: "x" }], seen: ["x"] };
s.franchise.calendarSim.session = { id: "old", target: "2026-09-20", delegated: true, status: "paused", started: "2026-09-07", rounds: 0, days: 0, message: "" };
s.franchise.boardroom = { serial: 2, active: "board-2", requests: [{ id: "board-2", status: "meeting" }], permits: [] };
const reloaded = JSON.parse(JSON.stringify(s));
S.migrate(reloaded);
S.migrate(reloaded);
assert(S.validate(reloaded));
assert.equal(B.boardOverview(reloaded).mandate, "Compete");

// Boardroom: expectations, job security and budget are visible without any meeting flow.
s = fresh();
s.franchise.role = "Owner";
const o = B.boardOverview(s);
assert(o.security >= 0 && o.security <= 100);
assert(["Secure", "Stable", "Under pressure", "Hot seat"].includes(o.status));
assert(o.objectives.length >= 3 && o.factors.length === 3);
assert.equal(o.budget.staffBudget, s.franchise.clubs[s.team].staffBudget);

// A budget request resolves immediately and changes the budget by the reported amount.
const before = s.franchise.clubs[s.team].staffBudget;
const answer = B.requestStaffBudget(s);
assert.equal(s.franchise.clubs[s.team].staffBudget - before, answer.amount);
assert.equal(B.boardOverview(s).decisions.length, 1);
assert.throws(() => B.requestStaffBudget(s), /revisited/);
// Low security means ownership refuses.
const shaky = fresh();
shaky.franchise.role = "Owner";
shaky.franchise.clubs[shaky.team].owner.patience = 5;
shaky.franchise.clubs[shaky.team].fanApproval = 10;
assert.equal(B.requestStaffBudget(shaky).outcome, "Rejected");

// Facility investment spends cash and starts a real stadium project.
const cash = s.franchise.clubs[s.team].cash;
const project = B.investFacility(s, "training");
assert.equal(project.area, "training");
assert.equal(cash - s.franchise.clubs[s.team].cash, B.FACILITIES.training.cost);
assert.throws(() => B.investFacility(s, "medical"), /current construction/);
const gm = fresh();
gm.franchise.role = "GM";
assert.throws(() => B.investFacility(gm, "training"), /delegates|role/i);

// The mandate moves the win target once per season.
const target = B.boardOverview(s).target;
B.setMandate(s, "Contend");
assert.equal(B.boardOverview(s).target, Math.round((target + 1.5) * 10) / 10);
assert.throws(() => B.setMandate(s, "Rebuild"), /already agreed/);
assert(B.boardOverview(s).objectives.some((x) => /playoffs/.test(x.label)));

// Old permit gates are gone: staff appointments no longer need ownership meetings.
assert.equal(B.isBlockbuster(s, s.roster[0].id, 1, "x"), false);

// Game plan writes only existing match settings.
s = fresh();
s.franchise.role = "HC";
G.setGamePlan(s, "style", "Run-first");
G.setGamePlan(s, "formation", "I formation");
G.setGamePlan(s, "defense", "Dime");
G.setGamePlan(s, "feedRB", true);
assert.deepEqual([s.coach.style, s.coach.offense, s.coach.defense, s.franchise.directives.feedRB], ["Run-first", "I formation", "Dime", true]);
assert.throws(() => G.setGamePlan(s, "style", "Air raid"), /Choose/);
assert.throws(() => G.setGamePlan(s, "unknown", 1), /Unknown/);
const oc = fresh();
oc.franchise.role = "OC";
G.setGamePlan(oc, "style", "Vertical offense");
assert.throws(() => G.setGamePlan(oc, "defense", "Dime"), /cannot/);
s.live = { finished: false };
assert.throws(() => G.setGamePlan(s, "style", "Balanced"), /kickoff/);
delete s.live;

// Opponent analysis describes the actual next opponent and every counter maps to a setting.
const report = G.opponentReport(s);
const game = s.schedule[s.week].find((g) => g.a === s.team || g.b === s.team);
assert.equal(report.team, game.a === s.team ? game.b : game.a);
assert.equal(report.units.length, 7);
assert(report.keyPlayers.length > 0 && report.keyPlayers.every((p) => s.franchise.clubs[report.team].players.some((q) => q.id === p.id)));
assert.equal(report.tendencies.run + report.tendencies.pass, 100);
assert(report.counters.length >= 1);
for (const c of report.counters) {
  const copy = structuredClone(s);
  G.setGamePlan(copy, c.key, c.value);
  assert.equal(G.settingValue(copy, c.key), c.value);
}

// Locker room: morale, causes and the critical metrics come from real player state.
s = fresh();
const p = s.roster.find((p) => p.starter);
p.morale = 40;
p.tradeDemand = true;
applyMood(s, { playerId: p.id, delta: -5, reason: "Dropped from the starting lineup", spillover: false });
const room = lockerReport(s);
const row = room.players.find((x) => x.id === p.id);
assert.equal(room.players[0].morale, Math.min(...room.players.map((x) => x.morale)));
assert.equal(row.mood, "Unhappy");
assert(row.causes.some((c) => /trade/.test(c.text)));
assert(row.causes.some((c) => /starting lineup/.test(c.text)));
assert(room.unhappy.some((x) => x.id === p.id));
assert.equal(Object.values(room.counts).reduce((a, b) => a + b, 0), room.players.length);
assert(Number.isFinite(room.chemistry) && Number.isFinite(room.drama) && room.leaders.length === 5);

// The three screens render from real state and their buttons change it.
globalThis.window = globalThis;
globalThis.document = { querySelector: () => ({}), head: { insertAdjacentHTML() {} } };
globalThis.clubs = JSON.parse(vm.runInContext("JSON.stringify(clubs)", ctx));
globalThis.esc = (x) => String(x ?? "").replaceAll("&", "&amp;").replaceAll('"', "&quot;").replaceAll("<", "&lt;");
globalThis.logo = (t) => `<img src="assets/teams/${t}.png">`;
globalThis.state = fresh();
state.franchise.role = "Owner";
const toasts = [];
Object.assign(globalThis, { save() {}, render() {}, toast: (m) => toasts.push(m) });
const views = {};
installFrontOfficeUI({ views, isBusy: () => false });
for (const html of [views.Boardroom(), views["Locker room"](), window.plan()]) {
  assert(html.length > 1000);
  assert(!/undefined|NaN|\[object/.test(html), html.slice(0, 200));
}
assert(views.Boardroom().includes("Job security") && views.Boardroom().includes("FrontOffice.budget()"));
assert(window.plan().includes("OPPONENT ANALYSIS") && window.plan().includes("Suggested counters"));
assert(views["Locker room"]().includes("TEAM MORALE") && views["Locker room"]().includes("CHEMISTRY"));
const budget = state.franchise.clubs[state.team].staffBudget;
FrontOffice.budget();
assert(state.franchise.clubs[state.team].staffBudget >= budget && /Ownership/.test(toasts.at(-1)));
FrontOffice.plan("style", "Vertical offense");
assert.equal(state.coach.style, "Vertical offense");
FrontOffice.plan("feedRB", true);
FrontOffice.applyCounters();
assert(G.opponentReport(state).counters.every((c) => c.applied));
// Feed RB / Protect QB override the play style in simulated games, so applied counters never leave both active.
if (G.opponentReport(state).counters.some((c) => c.key === "style"))
  assert(!state.franchise.directives.feedRB && !state.franchise.directives.protectQB);
else assert(!(state.franchise.directives.feedRB && state.franchise.directives.protectQB));
FrontOffice.mandate("Rebuild");
assert.equal(B.boardOverview(state).mandate, "Rebuild");
FrontOffice.mandate("Contend");
assert.match(toasts.at(-1), /already agreed/);

console.log("PASS: delegation-free save migration, boardroom security/budget/facility/mandate results, game plan settings and role checks, opponent analysis counters and locker room morale causes.");
