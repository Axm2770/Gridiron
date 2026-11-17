// Drafted rookies get the same playing defaults as signings, so a rookie's first game in his
// second league year records stats instead of crashing the round (0.24.1 regression).
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import * as S from "./dist/franchise/state.mjs";
import { draftOne } from "./dist/franchise/personnel.mjs";

const ctx = { console, Math, Date, setTimeout() {}, localStorage: { getItem: () => null, setItem() {} }, document: { getElementById: () => ({ innerHTML: "", style: {} }), querySelectorAll: () => [], querySelector: () => null, addEventListener() {}, body: { classList: { add() {}, remove() {}, toggle() {} }, dataset: {} } } };
ctx.window = ctx;
ctx.addEventListener = () => {};
vm.createContext(ctx);
vm.runInContext(fs.readFileSync("dist/game.js", "utf8"), ctx);
globalThis.clubs = JSON.parse(vm.runInContext("JSON.stringify(clubs)", ctx));
const s = JSON.parse(vm.runInContext("JSON.stringify(fresh())", ctx));
s.coach = { name: "QA" };
S.migrate(s);
s.franchise.draft = { log: [], picks: [], cursor: 0 };
const team = (s.team + 3) % 32;
const prospect = { ...s.prospects[0] };
delete prospect.stats;
delete prospect.wear;
delete prospect.fitness;
s.prospects[0] = prospect;
draftOne(s, { team, round: 2 }, prospect);
const rookie = S.roster(s, team).find((p) => p.id === prospect.id);
assert.ok(rookie, "the pick joins the club");
assert.deepEqual(rookie.stats, {}, "rookies start with an empty stats record");
assert.equal(rookie.fitness, 100);
assert.deepEqual(Object.keys(rookie.wear).sort(), ["ankle", "back", "knee", "shoulder"]);
console.log("rookie defaults ok");
