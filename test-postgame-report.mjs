// Postgame report: scoreboard model, stat comparison (turnovers: fewer is better), key plays resolved
// from "Team N:" and "ABBR:" prefixes in game order without duplicates, and markup without raw prefixes.
import assert from "node:assert/strict";
import { postgameModel, postgameHTML, keyPlays, installPostgameReport } from "./dist/ui/postgame-report.mjs";

const CLUBS = { 14: { abbr: "LV", name: "Raiders" }, 16: { abbr: "DAL", name: "Cowboys" } };
const club = (t) => CLUBS[t] || { abbr: "X", name: "X" };
const match = {
  a: 16,
  b: 14,
  score: [16, 35],
  periodScores: [[0, 0], [3, 7], [6, 14], [7, 14]],
  stats: [
    { yards: 397, pass: 321, rush: 76, first: 24, turnovers: 1, plays: 85 },
    { yards: 427, pass: 327, rush: 100, first: 20, turnovers: 2, plays: 63 },
  ],
  plays: 148,
  // Newest first, like state.lastMatch.events.
  events: [
    { text: "Team 15: Ashton Jeanty runs for 3 yards. TOUCHDOWN! Extra point good.", time: "Q4 0:05", highlight: true },
    { text: "Team 17 Quick pass: incomplete.", time: "Q4 0:11", highlight: false },
    { text: "DAL: INTERCEPTED!", time: "Q3 4:10", highlight: true },
    { text: "DAL: INTERCEPTED!", time: "Q3 4:10", highlight: true },
    { text: "Team 17: Ryan Flournoy receives for 28 yards. TOUCHDOWN! Extra point good.", time: "Q2 1:00", highlight: true },
  ],
};

const md = postgameModel(match, { club, user: 16 });
assert.equal(md.home.abbr, "DAL");
assert.equal(md.away.name, "Raiders");
assert.equal(md.winner, 1, "the away side won 35-16");
assert.equal(md.result, "LOSS", "result is from the career club's side");
assert.equal(md.overtime, false);
assert.deepEqual(md.periods.map((p) => p.label), ["Q1", "Q2", "Q3", "Q4"]);
const to = md.compare.find((c) => c.key === "turnovers");
assert.equal(to.better, 0, "fewer turnovers is the better side");
assert.equal(md.compare.find((c) => c.key === "yards").better, 1);
assert.equal(md.compare.find((c) => c.key === "yards").awayPct, 100);

// Key plays: chronological, duplicates collapsed, prefixes resolved, shouting toned down.
assert.equal(md.plays.length, 3);
assert.deepEqual(md.plays.map((p) => p.abbr), ["DAL", "DAL", "LV"]);
assert.deepEqual(md.plays.map((p) => p.tag), ["TD", "INT", "TD"]);
assert.equal(md.plays[1].text, "Intercepted!");
assert.ok(!md.plays[0].text.includes("Extra point"), "extra point noise dropped");
assert.equal(keyPlays([], [md.home, md.away]).length, 0);
const fg = keyPlays([{ text: "Team 17: make a 49-yard field goal!", time: "Q3 6:08", highlight: true }], [md.home, md.away]);
assert.deepEqual([fg[0].abbr, fg[0].text, fg[0].tag], ["DAL", "49-yard field goal is good!", "FG"]);

// Overtime and tie labels; a neutral viewer gets no result chip.
const ot = postgameModel({ ...match, score: [20, 20], periodScores: [...match.periodScores, [0, 0]] }, { club, user: 3 });
assert.equal(ot.overtime, true);
assert.equal(ot.periods[4].label, "OT");
assert.equal(ot.winner, -1);
assert.equal(ot.result, null);
assert.equal(postgameModel({ ...match, score: [20, 20] }, { club, user: 14 }).result, "TIE");

// Markup: no raw engine prefixes, no undefined/NaN, actions kept.
const html = postgameHTML(md, { logo: (t) => `<img class="team-logo" data-t="${t}">`, actions: `<button onclick="closeModal()">Close report</button>` });
assert.ok(html.includes("pg-board") && html.includes("Close report") && html.includes('data-t="14"'));
assert.ok(!/Team 1[57]:|undefined|NaN/.test(html), "no raw prefixes or bad values");
assert.ok(html.includes('class="pg-result loss"'));
// Sparse matches (older saves) still render.
const sparse = postgameHTML(postgameModel({ a: 1, b: 2, score: [3, 0] }, {}));
assert.ok(sparse.includes("No scoring plays") && !/undefined|NaN/.test(sparse));

// Installer: falls back to the classic report when no match exists.
let classicCalls = 0;
const win = { postgameReport: () => classicCalls++, modal: () => assert.fail("no modal without a match") };
installPostgameReport(win);
win.postgameReport();
assert.equal(classicCalls, 1);

console.log("PASS: postgame report — scoreboard, stat comparison, key plays from engine prefixes, sparse and classic fallbacks");

// Halftime card: same model on the live match, first-half quarters only, state-of-play chip.
{
  const { postgameModel: model, postgameHTML: html } = await import("./dist/ui/postgame-report.mjs");
  const live = { a: 3, b: 7, score: [10, 7], periodScores: [[3, 0], [7, 7], [0, 0], [0, 0]], stats: [{ yards: 180 }, { yards: 150 }], events: [], plays: 60, halftime: true };
  const md = model({ ...live, periodScores: live.periodScores.slice(0, 2) }, { user: 7 });
  const out = html(md, { phase: "half" });
  if (!/Halftime report/.test(out) || !/TRAILING/.test(out) || !/>Half</.test(out) || /Q3/.test(out) || /Final/.test(out)) throw Error("halftime card markup: " + out.slice(0, 300));
  const lead = html(model({ ...live, periodScores: live.periodScores.slice(0, 2) }, { user: 3 }), { phase: "half" });
  if (!/LEADING/.test(lead)) throw Error("leading chip");
  console.log("PASS: halftime report card (first-half quarters, LEADING/TRAILING chip, no Final).");
}
