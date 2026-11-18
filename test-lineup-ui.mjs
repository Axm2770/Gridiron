import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import * as S from "./dist/franchise/state.mjs";
import {
  lineupActors,
  lineupBoard,
  slotChoices,
  weakestSlot,
  changeLineup,
  canEditUnit,
  unavailableReason,
  sortForLineup,
} from "./dist/franchise/lineup.mjs";
import { SQUAD_SORTS, compareSquad, sortSquad, defaultDirection } from "./dist/franchise/squad-sort.mjs";
import { installLineupUI, slotPositions, viewMode } from "./dist/franchise/lineup-ui.mjs";

// A fresh career built the same way the browser builds one.
const ctx = {
  console,
  Math,
  Date,
  setTimeout() {},
  localStorage: { getItem: () => null, setItem() {} },
  document: {
    getElementById: () => ({ innerHTML: "", style: {}, showModal() {}, close() {} }),
    querySelectorAll: () => [],
    querySelector: () => ({}),
  },
};
ctx.window = ctx;
ctx.addEventListener = () => {};
vm.createContext(ctx);
vm.runInContext(fs.readFileSync("dist/game.js", "utf8"), ctx);
vm.runInContext(fs.readFileSync("dist/match.js", "utf8"), ctx);
const s = JSON.parse(vm.runInContext("JSON.stringify(fresh())", ctx));
s.coach = { name: "QA" };
S.migrate(s);
for (const pos of new Set(S.POS))
  for (let i = s.roster.filter((p) => p.pos === pos).length; i < 6; i++) {
    const q = S.makePlayer("lu-" + pos + "-" + i, pos, 900 + i);
    q.status = "active";
    s.roster.push(q);
    s.franchise.contracts[q.id] = S.basicContract(q, s.team, s.year);
  }
// Assistant-style depth chart: best healthy players start.
const TARGET = { QB: 1, RB: 1, WR: 3, TE: 1, OL: 5, DL: 4, LB: 3, CB: 3, S: 2, K: 1, P: 1 };
for (const p of s.roster) p.starter = false;
for (const [pos, n] of Object.entries(TARGET))
  s.roster
    .filter((p) => p.pos === pos && !p.injury && !p.holdout)
    .sort((a, b) => b.ovr - a.ovr)
    .slice(0, n)
    .forEach((p) => (p.starter = true));
const starters = (st) =>
  Object.fromEntries(Object.keys(TARGET).map((pos) => [pos, st.roster.filter((p) => p.pos === pos && p.starter).length]));
const baseline = starters(s);

// 1. Slot assignment for a formation from a roster.
s.coach.offense = "Shotgun spread";
s.coach.personnel = "11";
s.coach.defense = "Nickel";
let off = lineupActors(s, "Offense");
assert.equal(off.length, 11);
assert.deepEqual(
  off.map((a) => a.role).sort(),
  ["OL", "OL", "OL", "OL", "OL", "QB", "RB", "TE", "WR", "WR", "WR"],
  "11 personnel: 1 QB, 1 RB, 3 WR, 1 TE, 5 OL",
);
assert(off.every((a) => a.p && a.p.pos === a.role), "every slot is filled by a player of that position");
assert.equal(new Set(off.map((a) => a.id)).size, 11, "no player fills two slots");
assert(off.filter((a) => a.role === "WR").every((a) => a.p.starter), "starters take the slots first");
const def = lineupActors(s, "Defense");
assert.equal(def.filter((a) => a.role === "CB").length, 3, "Nickel puts a third CB on the field");
assert.equal(lineupActors(s, "Specialists").map((a) => a.role).join(), "K,P");
const board = lineupBoard(s, "Offense");
assert.equal(board.filled, 11);
const wr = board.positions.find((g) => g.pos === "WR");
assert.equal(wr.slots, 3);
assert.equal(wr.depth.filter((d) => d.slot !== null).length, 3, "depth list marks the three WRs on the field");
// Positions on the field stay inside the box for every formation.
for (const offense of ["Shotgun spread", "Singleback", "I formation", "Empty backfield"])
  for (const personnel of ["11", "12", "21", "10"]) {
    s.coach.offense = offense;
    s.coach.personnel = personnel;
    const pts = slotPositions(lineupActors(s, "Offense"), "Offense", { offense, personnel });
    assert(pts.every((a) => a.left >= 0 && a.left <= 100 && a.top >= 0 && a.top <= 100), offense + " " + personnel);
    assert.equal(new Set(pts.map((a) => a.left + "," + a.top)).size, 11, offense + " " + personnel + " slots must not overlap");
  }
for (const front of ["4–3 base", "3–4 base", "Nickel", "Dime"]) {
  s.coach.defense = front;
  const pts = slotPositions(lineupActors(s, "Defense"), "Defense", { defense: front, shell: "2-High" });
  assert.equal(new Set(pts.map((a) => a.left + "," + a.top)).size, 11, front + " slots must not overlap");
}
s.coach.offense = "Shotgun spread";
s.coach.personnel = "11";
s.coach.defense = "Nickel";

// 2. Swapping through the same function the UI calls keeps starter counts valid.
off = lineupActors(s, "Offense");
const qbSlot = off.find((a) => a.role === "QB");
const choices = slotChoices(s, "Offense", qbSlot.index);
assert(choices.eligible.length >= 1);
assert(choices.eligible.every((p, i, a) => !i || a[i - 1].ovr >= p.ovr), "picker lists the best first");
const backup = choices.eligible.at(-1);
changeLineup(s, "Offense", qbSlot.index, backup.id);
assert.equal(lineupActors(s, "Offense")[qbSlot.index].id, backup.id, "the chosen player takes the slot");
assert(backup.starter, "the new player is the starter");
assert(!s.roster.find((p) => p.id === qbSlot.id).starter, "the previous starter goes to the bench");
assert.deepEqual(starters(s), baseline, "starter counts per position are unchanged");
// Survives a save round-trip (the engine reads the same order).
assert.equal(lineupActors(JSON.parse(JSON.stringify(s)), "Offense")[qbSlot.index].id, backup.id);
assert.equal(sortForLineup(s.roster, s.team).find((p) => p.pos === "QB").id, backup.id);

// A starter who sits out this formation (third WR in 12 personnel) keeps the count valid.
s.coach.personnel = "12";
off = lineupActors(s, "Offense");
const benchStarter = s.roster.find((p) => p.pos === "WR" && p.starter && !off.some((a) => a.id === p.id));
assert(benchStarter, "12 personnel leaves one starting WR off the field");
changeLineup(s, "Offense", off.find((a) => a.role === "WR").index, benchStarter.id);
assert.deepEqual(starters(s), baseline, "swapping in an off-field starter keeps WR starters at 3");
s.coach.personnel = "11";

// Injured, holdout and practice-squad players are rejected with a reason.
off = lineupActors(s, "Offense");
const rbSlot = off.find((a) => a.role === "RB");
const hurt = slotChoices(s, "Offense", rbSlot.index).eligible[0];
hurt.injury = 3;
assert(!slotChoices(s, "Offense", rbSlot.index).eligible.some((p) => p.id === hurt.id));
assert.equal(slotChoices(s, "Offense", rbSlot.index).unavailable.find((x) => x.p.id === hurt.id).reason, "Injured · 3 weeks");
assert.throws(() => changeLineup(s, "Offense", rbSlot.index, hurt.id), /injured/);
hurt.injury = 0;
hurt.holdout = true;
assert.throws(() => changeLineup(s, "Offense", rbSlot.index, hurt.id), /holding out/);
hurt.holdout = false;
hurt.status = "practice";
assert.match(unavailableReason(hurt), /Practice squad/);
assert.throws(() => changeLineup(s, "Offense", rbSlot.index, hurt.id), /practice squad/);
hurt.status = "active";
assert.throws(() => changeLineup(s, "Offense", rbSlot.index, s.roster.find((p) => p.pos === "QB").id), /plays QB/);
assert.deepEqual(starters(s), baseline);
// A bench player opens the weakest slot at his position.
const wrSlots = lineupActors(s, "Offense").filter((a) => a.role === "WR");
const weakest = wrSlots.slice().sort((a, b) => a.p.ovr - b.p.ovr)[0].index;
const benchWr = lineupBoard(s, "Offense").positions.find((g) => g.pos === "WR").depth.find((d) => d.slot === null).p;
assert.equal(weakestSlot(s, "Offense", benchWr.id), weakest);

// Coordinators only edit their own unit.
const role = s.franchise.role;
s.franchise.role = "OC";
assert(canEditUnit(s, "Offense") && canEditUnit(s, "Specialists") && !canEditUnit(s, "Defense"));
const dl = lineupActors(s, "Defense")[0];
assert.throws(() => changeLineup(s, "Defense", dl.index, slotChoices(s, "Defense", dl.index).eligible[0].id), /delegated/);
s.franchise.role = "DC";
assert(canEditUnit(s, "Defense") && !canEditUnit(s, "Offense"));
s.franchise.role = role;

// 3. Squad sort comparator: every metric, nulls last in both directions, reverse.
const P = (id, o) => ({ id, name: "Player " + id, pos: "WR", ovr: 70, age: 25, ...o });
const ctxSort = {
  cap: (p) => p.capHit ?? null,
  contractEnd: (p) => p.until ?? null,
  stats: (p) => p.season || {},
  height: (p) => p.heightInches || null,
};
const fixtures = {
  ovr: [P("a", { ovr: 60 }), P("b", { ovr: 90 }), P("c", { ovr: 75 })],
  pot: [P("a", { pot: 70 }), P("b", { pot: 95 }), P("c", { pot: 80 })],
  name: [P("a", { name: "zed Young" }), P("b", { name: "Aaron Able" }), P("c", { name: "Mike Mid" })],
  pos: [P("a", { pos: "WR" }), P("b", { pos: "CB" }), P("c", { pos: "QB" })],
  age: [P("a", { age: 33 }), P("b", { age: 21 }), P("c", { age: 27 })],
  role: [P("a", { starter: false }), P("b", { starter: true })],
  condition: [P("a", { fitness: 50 }), P("b", { fitness: 99 }), P("c", { fitness: 75 })],
  morale: [P("a", { morale: 20 }), P("b", { morale: 95 }), P("c", { morale: 60 }), P("n", { morale: null })],
  form: [P("a", { progression: { form: 5.5 } }), P("b", { progression: { form: 8.1 } }), P("c", { progression: { form: 6.4 } }), P("n", { progression: { form: null } }), P("m", {})],
  growth: [P("a", { progression: { lastReport: { delta: -2 } } }), P("b", { progression: { lastReport: { delta: 3 } } }), P("c", { progression: { lastReport: { delta: 0 } } }), P("n", {})],
  training: [P("a", { progression: { training: 5 } }), P("b", { progression: { training: 9 } }), P("c", { progression: { training: 7 } }), P("n", {})],
  availability: [P("a", { injury: 4 }), P("b", { status: "active" }), P("c", { holdout: true })],
  cap: [P("a", { capHit: 100 }), P("b", { capHit: 2500000000 }), P("c", { capHit: 900000000 }), P("n", {})],
  contract: [P("a", { until: 2026 }), P("b", { until: 2031 }), P("c", { until: 2028 }), P("n", {})],
  trust: [P("a", { coachTrust: 10 }), P("b", { coachTrust: 90 }), P("c", {})],
  snaps: [P("a", { season: { snaps: 5 } }), P("b", { season: { snaps: 700 } }), P("c", { season: { snaps: 80 } })],
  passYards: [P("a", { season: { passYards: 1 } }), P("b", { season: { passYards: 4000 } }), P("c", { season: { passYards: 300 } })],
  rushYards: [P("a", { season: { rushYards: 1 } }), P("b", { season: { rushYards: 900 } }), P("c", { season: { rushYards: 20 } })],
  recYards: [P("a", { season: { recYards: 2 } }), P("b", { season: { recYards: 1200 } }), P("c", { season: { recYards: 100 } })],
  td: [P("a", { season: { rushTD: 1 } }), P("b", { season: { recTD: 9, rushTD: 2 } }), P("c", { season: { passTD: 4 } })],
  height: [P("a", { heightInches: 68 }), P("b", { heightInches: 79 }), P("c", { heightInches: 73 }), P("n", {})],
  weight: [P("a", { weight: 180 }), P("b", { weight: 330 }), P("c", { weight: 240 }), P("n", { weight: 0 })],
  college: [P("a", { college: "Yale" }), P("b", { college: "Alabama" }), P("c", { college: "Michigan" }), P("n", {})],
  experience: [P("a", { experience: 1 }), P("b", { experience: 12 }), P("c", { experience: 5 }), P("n", {})],
};
assert.deepEqual(Object.keys(fixtures).sort(), Object.keys(SQUAD_SORTS).sort(), "every sort metric is covered");
for (const [key, list] of Object.entries(fixtures)) {
  const natural = defaultDirection(key);
  const ids = (direction) => sortSquad(list, { sort: key, direction }, ctxSort).map((p) => p.id);
  const first = "b",
    nulls = list.filter((p) => !"abc".includes(p.id)).map((p) => p.id);
  // b is the "best" fixture: highest value, or first alphabetically/youngest/healthiest.
  assert.equal(ids(natural)[0], first, key + " natural order starts with the best value");
  const reversed = ids(-natural);
  assert.notEqual(reversed[0], first, key + " reverse flips the order");
  assert.deepEqual(reversed.filter((id) => "abc".includes(id)), ids(natural).filter((id) => "abc".includes(id)).reverse(), key + " reverse is an exact reversal");
  for (const direction of [1, -1])
    assert.deepEqual(ids(direction).slice(ids(direction).length - nulls.length).sort(), nulls.sort(), key + " unknown values sort last in both directions");
}
// Cap charges compare numerically (not as "$2.5M" strings), names case-insensitively.
assert.deepEqual(sortSquad(fixtures.cap, { sort: "cap", direction: -1 }, ctxSort).map((p) => p.id), ["b", "c", "a", "n"]);
assert.deepEqual(sortSquad(fixtures.name, { sort: "name", direction: 1 }, ctxSort).map((p) => p.id), ["b", "c", "a"]);
// Ties fall back to OVR then name, so the order is stable between renders.
const tie = [P("x", { age: 25, ovr: 70, name: "B" }), P("y", { age: 25, ovr: 80, name: "C" }), P("z", { age: 25, ovr: 70, name: "A" })];
assert.deepEqual(sortSquad(tie, { sort: "age", direction: 1 }).map((p) => p.id), ["y", "z", "x"]);
assert.deepEqual(sortSquad(tie, { sort: "age", direction: -1 }).map((p) => p.id), ["y", "z", "x"]);
assert.equal(compareSquad(tie[0], tie[0], { sort: "ovr" }), 0);
// The real roster sorts without throwing for every metric.
for (const key of Object.keys(SQUAD_SORTS)) sortSquad(s.roster, { sort: key, direction: -1 }, ctxSort);

// 4. The visual board renders a chip per slot plus the stacked list, and remembers its view.
Object.assign(globalThis, {
  state: s,
  esc: (v) => String(v ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]),
  clubs: JSON.parse(vm.runInContext("JSON.stringify(clubs)", ctx)),
  window: globalThis,
  toast() {},
  save() {},
});
globalThis.localStorage = { getItem: () => null, setItem() {} };
assert.equal(viewMode("squad"), "lineup", "lineup is the default without storage");
const ui = installLineupUI({ isBusy: () => false });
const html = ui.board("squad");
assert.equal((html.match(/class="lu-slot /g) || []).length, 11);
assert.equal((html.match(/class="lu-slot-row/g) || []).length, 11);
assert(html.includes("Shotgun spread"));
assert(/data-no-sort/.test(ui.depthTable()), "the depth table opts out of generic header sorting");
const store = {};
globalThis.localStorage = { getItem: (k) => store[k] ?? null, setItem: (k, v) => (store[k] = v) };
globalThis.render = () => {};
window.Lineup.view("tactics", "table");
assert.equal(viewMode("tactics"), "table");
assert.equal(viewMode("squad"), "lineup");
globalThis.localStorage = { getItem() { throw Error("blocked"); }, setItem() { throw Error("blocked"); } };
assert.equal(viewMode("tactics"), "lineup", "blocked storage falls back to the lineup");
window.Lineup.view("squad", "table");
console.log("PASS: lineup slots per formation, picker order, swaps keep starter counts, unavailable players rejected, role limits, squad sort metrics/nulls/reverse, board render and view memory");
