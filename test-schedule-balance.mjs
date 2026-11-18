// Every club gets a fair share of home games: `a` is the home side, and the round-robin flips
// home and away each week (a fixed orientation gave some clubs 17 home games and others one).
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import { newSchedule } from "./dist/franchise/lifecycle.mjs";

const count = (weeks) => {
  const home = Array(32).fill(0), games = Array(32).fill(0);
  for (const w of weeks) for (const g of w) { home[g.a]++; games[g.a]++; games[g.b]++; }
  return { home, games };
};
const later = count(newSchedule(17));
assert.ok(Math.min(...later.home) >= 7 && Math.max(...later.home) <= 9, "later seasons: 7–9 home games each");
assert.ok(later.games.every((n) => n === 17), "everyone plays 17");

const ctx = { console, Math, Date, setTimeout() {}, localStorage: { getItem: () => null, setItem() {} }, document: { getElementById: () => ({ innerHTML: "", style: {} }), querySelectorAll: () => [], querySelector: () => null, addEventListener() {}, body: { classList: { add() {}, remove() {}, toggle() {} }, dataset: {} } } };
ctx.window = ctx;
ctx.addEventListener = () => {};
vm.createContext(ctx);
vm.runInContext(fs.readFileSync("dist/game.js", "utf8"), ctx);
const first = count(JSON.parse(vm.runInContext("JSON.stringify(schedule())", ctx)));
assert.ok(Math.min(...first.home) >= 7 && Math.max(...first.home) <= 10, "the first season is balanced too");
console.log("schedule balance ok");
