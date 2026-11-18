// Status visuals (ui/status-visual.mjs) replace plain grey value text with meters, chips, pips and
// cap bars. Checks the pure models (bounds, tones, target ticks, NaN safety, pre-season pace) and
// the Boardroom target model's mapping from each target to its visual.
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import * as SV from "./dist/ui/status-visual.mjs";
import * as S from "./dist/franchise/state.mjs";
import * as L from "./dist/franchise/lifecycle.mjs";
import * as B from "./dist/franchise/boardroom.mjs";
import * as BM from "./dist/franchise/board-meetings.mjs";
import { ensureCalendar } from "./dist/franchise/calendar-core.mjs";

const count = (html, re) => (html.match(re) || []).length;

// ---- meterModel / meter: bounds, target tick, pace marker, NaN safety
let m = SV.meterModel(0, 17, { cells: 17, target: 10 });
assert.deepEqual([m.lit, m.target, m.pace, m.reached], [0, 10, null, false]);
m = SV.meterModel(3, 17, { cells: 17, target: 10, pace: 8.5 });
assert.deepEqual([m.lit, m.target, m.pace], [3, 10, 9]);
assert.equal(SV.meterModel(40, 10).lit, 10, "values above max fill the meter, never overflow it");
assert.equal(SV.meterModel(-5, 10).lit, 0, "negative values light nothing");
assert.equal(SV.meterModel(0.1, 100).lit, 1, "any positive value shows one block");
for (const bad of [NaN, undefined, null, "x", Infinity]) {
  const x = SV.meterModel(bad, bad, { cells: bad, target: bad, pace: bad });
  assert.deepEqual([x.lit, x.target, x.pace, x.pct], [0, null, null, 0], `meterModel(${bad}) is safe`);
  assert.doesNotThrow(() => SV.meter(bad, bad, { target: bad }));
}
assert.equal(SV.meterModel(5, 10, { target: 0 }).target, 1, "a zero target still marks the first cell");
let html = SV.meter(65, 100, { target: 45, cells: 20, tone: "good" });
assert.equal(count(html, /<i[ >]/g), 20);
assert.equal(count(html, /class="on/g), 13, "65% of 20 cells");
assert.equal(count(html, / tgt/g), 1, "one target tick");
assert(/sv-meter good/.test(html) && /role="img"/.test(html) && /aria-label=/.test(html));
assert(/class="sv-meter neutral/.test(SV.meter(1, 2, { tone: "rainbow" })), "unknown tones fall back to neutral");
assert.equal(count(SV.meter(3, 17, { cells: 17, target: 10, pace: 9 }), / pace/g), 1, "pace marker");

// ---- tones
assert.equal(SV.toneFor(80), "good");
assert.equal(SV.toneFor(50), "warn");
assert.equal(SV.toneFor(10), "bad");
assert.equal(SV.toneFor(NaN), "neutral");
assert.equal(SV.toneFor(2, 3, 6, true), "good", "inverted scales (lower is better)");
assert.equal(SV.toneFor(9, 3, 6, true), "bad");

// ---- chips and glyphs
html = SV.chip("Outside the picture", "warn", "alert");
assert(/sv-chip warn/.test(html) && /<svg class="sv-glyph"/.test(html) && /Outside the picture/.test(html));
assert(!/<svg/.test(SV.chip("Plain")), "no icon, no glyph");
assert(/&lt;b&gt;/.test(SV.chip("<b>")), "chip text is escaped");
for (const name of SV.GLYPH_NAMES) assert(/d="M/.test(SV.glyph(name)), `glyph ${name} draws`);
for (const [state, tone] of [["done", "good"], ["on", "good"], ["risk", "warn"], ["missed", "bad"], ["pending", "pending"], ["???", "pending"]])
  assert(new RegExp(`sv-chip ${tone}`).test(SV.stateChip(state)), `${state} chip is ${tone}`);

// ---- pips
assert.deepEqual(SV.pipModel(2, 1), { have: 2, need: 1, shown: 2, extra: 0, met: true });
assert.deepEqual(SV.pipModel(0, 3), { have: 0, need: 3, shown: 3, extra: 0, met: false });
assert.deepEqual(SV.pipModel(30, 2, 12), { have: 30, need: 2, shown: 12, extra: 18, met: true }, "long counts are capped");
assert.deepEqual(SV.pipModel(NaN, undefined), { have: 0, need: 0, shown: 0, extra: 0, met: true });
html = SV.pips(4, 2);
assert(/sv-pips good/.test(html) && count(html, /class="on/g) === 4 && count(html, / need/g) === 1);
assert(/sv-pips warn/.test(SV.pips(1, 3)), "short of the need warns");
assert.equal(count(SV.pips(1, 3, { mark: false }), / need/g), 0);

// ---- money (values in millions)
assert.deepEqual(SV.moneyModel(224, 255), { used: 224, cap: 255, room: 31, pct: (224 / 255) * 100, over: false });
assert.equal(SV.moneyModel(270, 255).over, true);
assert.equal(SV.moneyModel(270, 255).pct, 100, "the bar never overflows");
assert.equal(SV.moneyModel(NaN, undefined).pct, 0);
assert(/sv-money bad/.test(SV.money(270, 255)) && /sv-money accent/.test(SV.money(100, 255)) && /sv-money warn/.test(SV.money(250, 255)));
assert.equal(SV.millions(31), "$31.0M");

// ---- pace: meaningless before games, noisy before PACE_READY_GAMES
assert.deepEqual(SV.paceStatus({ played: 0, pace: null, target: 10 }), { show: false, text: "Season starts week 1", tone: "pending", icon: "clock" });
const early = SV.paceStatus({ played: 1, pace: 0, target: 10, ready: 4 });
assert.equal(early.show, false, "one loss does not show 'on pace for 0.0'");
assert.equal(early.text, "Pace after 4 games");
assert(!/0\.0/.test(early.text));
assert.deepEqual(SV.paceStatus({ played: 6, pace: 11.3, target: 10, ready: 4 }), { show: true, text: "Pace 11.3", tone: "good", icon: "up" });
assert.equal(SV.paceStatus({ played: 6, pace: 9.4, target: 10 }).tone, "warn");
assert.equal(SV.paceStatus({ played: 6, pace: 5.7, target: 10 }).tone, "bad");
assert.equal(SV.paceStatus({ played: 17, pace: 9, target: 10, over: true }).text, "", "no pace once the season is over");
// The pre-season progress visual has no pace marker and says when the season starts.
html = SV.targetVisual({ kind: "progress", value: 0, target: 10, max: 17, pace: null, played: 0, over: false, ready: 4, unit: "wins" });
assert(/Season starts week 1/.test(html) && !/ pace"/.test(html) && !/on pace for/i.test(html));
assert.equal(count(html, / tgt/g), 1, "the target tick is drawn");
assert(/sv-num/.test(html), "the count is a bold number");
assert.equal(SV.targetVisual(null), "");
assert.equal(SV.targetVisual({ kind: "nope" }), "");
assert.doesNotThrow(() => ["progress", "status", "money", "ratio", "percent"].forEach((kind) => SV.targetVisual({ kind })));
assert(/MIN 45%|min 45%/.test(SV.targetVisual({ kind: "percent", value: 65, threshold: 45 })));
assert(/sv-num bad/.test(SV.targetVisual({ kind: "percent", value: 30, threshold: 45 })), "below the threshold reads bad");
assert(/over/.test(SV.targetVisual({ kind: "money", used: 260, cap: 255 })), "over the cap says so");

// ---- Boardroom target model
const ctx = { console, Math, Date, setTimeout() {}, localStorage: { getItem: () => null, setItem() {} }, document: { getElementById: () => ({ innerHTML: "", style: {} }), querySelectorAll: () => [], querySelector: () => ({}) } };
ctx.window = ctx;
ctx.addEventListener = () => {};
vm.createContext(ctx);
vm.runInContext(fs.readFileSync("dist/game.js", "utf8"), ctx);
vm.runInContext(fs.readFileSync("dist/match.js", "utf8"), ctx);
globalThis.clubs = JSON.parse(vm.runInContext("JSON.stringify(clubs)", ctx));
const fresh = () => {
  const s = JSON.parse(vm.runInContext("JSON.stringify(fresh())", ctx));
  s.coach = { name: "Status QA" };
  S.migrate(s);
  s.franchise.role = "HC";
  ensureCalendar(s);
  return s;
};
const play = (s, ours) => {
  const games = s.schedule[s.week];
  L.finishRound(
    s,
    games.map((g) => {
      const mine = g.a === s.team || g.b === s.team,
        homeWins = !mine || (g.a === s.team) === (ours === "W");
      return { ...g, score: homeWins ? [27, 13] : [13, 27] };
    }),
  );
};
let s = fresh();
s.teams[s.team].rating = 95; // a title contender: wins, playoffs, a playoff win, cap, youth, fans
let r = BM.expectationsReport(s);
const byKey = (rep) => Object.fromEntries(rep.items.map((x) => [x.key, x]));
let k = byKey(r);
assert.deepEqual(Object.keys(k).sort(), ["cap", "fans", "playoffWin", "playoffs", "wins", "youth"].sort());
for (const x of r.items) assert(x.visual && typeof x.visual.kind === "string", `${x.key} has a visual`);
assert.equal(k.wins.visual.kind, "progress");
assert.equal(k.wins.visual.target, r.minWins);
assert.equal(k.wins.visual.max, s.franchise.rules?.regularGames || 17);
assert.equal(k.wins.visual.played, 0);
assert(/season starts week 1/.test(k.wins.progress), "pre-season text: " + k.wins.progress);
assert.equal(k.playoffs.visual.kind, "status");
assert.deepEqual([k.playoffs.visual.text, k.playoffs.visual.tone, k.playoffs.visual.icon, k.playoffs.visual.pending], ["Season not started", "pending", "clock", true]);
assert.deepEqual([k.playoffWin.visual.tone, k.playoffWin.visual.icon, k.playoffWin.visual.pending], ["pending", "clock", true], "awaiting the postseason is pending, not a failure");
assert.equal(k.cap.visual.kind, "money");
const cap = S.capLedger(s);
assert.equal(k.cap.visual.used, cap.used / S.MILLION);
assert.equal(k.cap.visual.cap, cap.limit / S.MILLION);
assert.equal(k.youth.visual.kind, "ratio");
assert.equal(k.youth.visual.need >= 1, true);
assert.deepEqual([k.fans.visual.kind, k.fans.visual.threshold], ["percent", 45]);
assert.equal(k.fans.visual.value, r.pulse.fans);

// One loss: no "on pace for 0.0"; the playoff chip turns at-risk (warn + alert), wins still at risk.
play(s, "L");
r = BM.expectationsReport(s);
k = byKey(r);
assert.equal(r.pulse.played, 1);
assert(!/on pace for 0\.0/.test(k.wins.progress), k.wins.progress);
assert(new RegExp(`pace after ${B.PACE_READY_GAMES} games`).test(k.wins.progress));
assert.equal(k.wins.state, "risk", "the risk state itself is unchanged");
assert.deepEqual([k.playoffs.visual.text, k.playoffs.visual.tone, k.playoffs.visual.icon], ["Outside the picture", "warn", "alert"]);
assert(!/on pace for 0\.0/i.test(B.boardOverview(s).factors.find((f) => f.label === "Results vs target").value), "security factor waits for a real pace too");
html = SV.targetVisual({ ...k.wins.visual, state: k.wins.state });
assert(/Pace after 4 games/.test(html) && !/ pace"/.test(html));

// After enough games, the pace number and marker appear.
for (let i = 0; i < B.PACE_READY_GAMES; i++) play(s, "W");
r = BM.expectationsReport(s);
k = byKey(r);
assert(/on pace for \d+\.\d/.test(k.wins.progress), k.wins.progress);
html = SV.targetVisual({ ...k.wins.visual, state: k.wins.state });
assert(/Pace \d+\.\d/.test(html) && / pace"/.test(html), "pace marker shown once ready");

// statusVisual mapping on its own.
assert.deepEqual(BM.statusVisual({ progress: "Qualified", state: "done" }), { kind: "status", text: "Qualified", tone: "good", icon: "check", pending: false });
assert.deepEqual(BM.statusVisual({ progress: "Missed", state: "missed" }), { kind: "status", text: "Missed", tone: "bad", icon: "cross", pending: false });
assert.deepEqual(BM.statusVisual({ progress: "On course", state: "on" }), { kind: "status", text: "On course", tone: "good", icon: "dot", pending: false });
assert.equal(BM.statusVisual({ progress: "Awaiting the postseason", state: "on" }).pending, true);

console.log("PASS: status visuals (meters, chips, pips, cap bars, pace) and Boardroom target mapping");
