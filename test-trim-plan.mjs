// Trim to 53: the confirmation lists exactly the players the trim then moves or releases.
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import * as S from "./dist/franchise/state.mjs";
import { trimPlan, trimRoster } from "./dist/franchise/personnel.mjs";

const ctx = { console, Math, Date, setTimeout() {}, localStorage: { getItem: () => null, setItem() {} }, document: { getElementById: () => ({ innerHTML: "", style: {} }), querySelectorAll: () => [], querySelector: () => null, addEventListener() {}, body: { classList: { add() {}, remove() {}, toggle() {} }, dataset: {} } } };
ctx.window = ctx;
ctx.addEventListener = () => {};
vm.createContext(ctx);
vm.runInContext(fs.readFileSync("dist/game.js", "utf8"), ctx);
globalThis.clubs = JSON.parse(vm.runInContext("JSON.stringify(clubs)", ctx));
const s = JSON.parse(vm.runInContext("JSON.stringify(fresh())", ctx));
s.coach = { name: "QA" };
S.migrate(s);
s.franchise.role = "HC";
const active = () => s.roster.filter((p) => p.status === "active");
// Put everyone on the active roster so the trim has work to do.
for (const p of s.roster) if (p.status === "practice") p.status = "active";
while (active().length < 72 && s.agents.length) s.roster.push({ ...s.agents.shift(), status: "active", stats: {} });
const over = active().length - 53;
assert.ok(over > 0, "the roster starts over the limit");
const plan = trimPlan(s);
assert.equal(plan.practice.length + plan.release.length, over, "the plan removes exactly the overflow");
assert.ok(plan.practice.length <= 16, "the practice squad never exceeds 16");
const moved = new Set(plan.practice.map((p) => p.id)),
  released = new Set(plan.release.map((p) => p.id));
trimRoster(s);
assert.equal(active().length, 53);
for (const id of moved) assert.equal(s.roster.find((p) => p.id === id)?.status, "practice", "previewed practice moves happen");
for (const id of released) assert.ok(!s.roster.some((p) => p.id === id), "previewed releases happen");
assert.deepEqual(trimPlan(s), { practice: [], release: [] }, "nothing left to trim");
console.log("trim plan ok");
