// Pure helpers behind the club overview dashboard, inbox paging and newsroom (dist/franchise/hub-model.mjs).
import assert from "node:assert/strict";
import { winChance, oddsLabel, moneyline, litBlocks, recentForm, teamForm, divisionTable, ordinal, pageOf, pageContaining, daysBetween, shortDate, senderInitials, loadDeskStyles } from "./dist/franchise/hub-model.mjs";

// Win chance: even clubs at a neutral edge are close to 50, home field helps, always 5..95.
assert.equal(winChance(80, 80, true), 58);
assert.equal(winChance(80, 80, false), 42);
assert.ok(winChance(90, 70, true) > 90 && winChance(90, 70, true) <= 95);
assert.equal(winChance(40, 99, false), 5);
assert.equal(winChance(NaN, 80), 50);
assert.equal(oddsLabel(75), "Clear favourite");
assert.equal(oddsLabel(50), "Toss-up");
assert.equal(oddsLabel(20), "Long shot");
assert.equal(moneyline(60), "-150");
assert.equal(moneyline(40), "+150");
assert.equal(moneyline(50), "EVEN");

// Block meters light whole blocks only.
assert.equal(litBlocks(50, 100, 10), 5);
assert.equal(litBlocks(0, 100, 10), 0);
assert.equal(litBlocks(140, 100, 10), 10);
assert.equal(litBlocks(5, 0, 10), 0);

// Form from fixtures() rows and from raw schedule scores.
assert.deepEqual(recentForm([{ done: true, result: "W" }, { done: false }, { done: true, result: "L" }], 5), ["W", "L"]);
const schedule = [[{ a: 0, b: 1, score: [21, 14] }], [{ a: 2, b: 0, score: [30, 10] }], [{ a: 0, b: 3, score: [7, 7] }], [{ a: 0, b: 1 }]];
assert.deepEqual(teamForm(schedule, 0), ["W", "L", "T"]);
assert.deepEqual(teamForm(schedule, 0, 2), ["L", "T"]);

// Division table: wins, then losses, then point differential; marks your club.
const clubs = [["A", "", "", "East"], ["B", "", "", "East"], ["C", "", "", "West"], ["D", "", "", "East"]];
const teams = [{ w: 2, l: 1, pf: 50, pa: 40 }, { w: 2, l: 1, pf: 70, pa: 40 }, { w: 3, l: 0 }, { w: 0, l: 3, pf: 1, pa: 9 }];
const table = divisionTable(teams, clubs, 0);
assert.deepEqual(table.map((r) => r.team), [1, 0, 3]);
assert.equal(table.find((r) => r.me).rank, 2);
assert.deepEqual(divisionTable(teams, clubs, 9), []);
assert.deepEqual([1, 2, 3, 4, 11, 12, 13, 21, 22].map(ordinal), ["1st", "2nd", "3rd", "4th", "11th", "12th", "13th", "21st", "22nd"]);

// Paging clamps into range and finds the page holding an item.
const rows = Array.from({ length: 17 }, (_, i) => ({ id: "m" + i }));
const p = pageOf(rows, 2, 7);
assert.deepEqual([p.page, p.pages, p.from, p.to, p.rows.length], [2, 3, 15, 17, 3]);
assert.equal(pageOf(rows, 99, 7).page, 2);
assert.equal(pageOf(rows, -3, 7).page, 0);
assert.deepEqual([pageOf([], 0, 7).pages, pageOf([], 0, 7).from], [1, 0]);
assert.equal(pageContaining(rows, "m8", 7), 1);
assert.equal(pageContaining(rows, "missing", 7, 2), 2);

// Dates and monograms.
assert.equal(daysBetween("2026-09-07", "2026-09-13"), 6);
assert.equal(daysBetween(null, "2026-09-13"), null);
assert.equal(shortDate("2026-09-13"), "Sun, Sep 13");
assert.equal(shortDate(""), "");
assert.equal(senderInitials("Medical team"), "MT");
assert.equal(senderInitials("Ownership"), "O");
assert.equal(senderInitials(""), "?");
loadDeskStyles(); // no document in Node: a no-op, not a crash

console.log("PASS: hub model (win chance, odds, block meters, form, division table, paging, dates, monograms).");
