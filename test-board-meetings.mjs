// Ownership expectations scale with franchise strength; underperformance triggers one board
// meeting and one team meeting (urgent decisions with options, cooldowns respected); the agreed
// plan sets a checkpoint whose result moves job security; the season ends with a review.
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import * as S from "./dist/franchise/state.mjs";
import * as L from "./dist/franchise/lifecycle.mjs";
import * as B from "./dist/franchise/boardroom.mjs";
import * as BM from "./dist/franchise/board-meetings.mjs";
import { ensureCalendar } from "./dist/franchise/calendar-core.mjs";
import { syncOffice, ensureOffice, decisionOptions, respondMessage, officeCounts } from "./dist/franchise/newsroom.mjs";

const ctx = { console, Math, Date, setTimeout() {}, localStorage: { getItem: () => null, setItem() {} }, document: { getElementById: () => ({ innerHTML: "", style: {} }), querySelectorAll: () => [], querySelector: () => ({}) } };
ctx.window = ctx;
ctx.addEventListener = () => {};
vm.createContext(ctx);
vm.runInContext(fs.readFileSync("dist/game.js", "utf8"), ctx);
vm.runInContext(fs.readFileSync("dist/match.js", "utf8"), ctx);
globalThis.clubs = JSON.parse(vm.runInContext("JSON.stringify(clubs)", ctx));
const fresh = () => {
  const s = JSON.parse(vm.runInContext("JSON.stringify(fresh())", ctx));
  s.coach = { name: "Board QA" };
  S.migrate(s);
  s.franchise.role = "HC";
  ensureCalendar(s);
  return s;
};
// Play one round. `ours` is "W" or "L" for our game; other games go to the home side.
const play = (s, ours) => {
  const games = s.phase === "season" ? s.schedule[s.week] : s.playoffs.rounds.at(-1);
  L.finishRound(
    s,
    games.map((g) => {
      const mine = g.a === s.team || g.b === s.team,
        homeWins = !mine || (g.a === s.team) === (ours === "W");
      return { ...g, score: homeWins ? [27, 13] : [13, 27] };
    }),
  );
};
const meetings = (s, decision) => ensureOffice(s).messages.filter((m) => m.decision === decision && m.team === s.team);
const rate = (s, rating) => {
  s.teams[s.team].rating = rating;
  delete s.franchise.preseasonExpectations[s.year];
  delete s.franchise.expectations;
};

// Expectations scale with franchise strength.
let s = fresh();
rate(s, 95);
const strong = BM.expectationsReport(s);
rate(s, 62);
const weak = BM.expectationsReport(s);
assert.equal(strong.tier, "Title contender");
assert.equal(weak.tier, "Rebuilding");
assert(strong.minWins > weak.minWins + 2, `strong ${strong.minWins} vs weak ${weak.minWins}`);
assert(strong.items.some((x) => x.key === "playoffs" && x.required) && strong.items.some((x) => x.key === "playoffWin"), "strong clubs must reach and win in the playoffs");
assert(!weak.items.some((x) => x.key === "playoffs" && x.required), "weak clubs are not asked for the playoffs");
assert(weak.items.find((x) => x.key === "youth").required, "weak clubs must develop young starters");
assert.equal(strong.bands.length, 3);
assert.match(strong.headline, /^Owner's expectations for \d{4}: at least \d+ wins, a playoff win/);
// The mandate moves the target.
s = fresh();
const compete = BM.expectationsReport(s).target;
B.setMandate(s, "Contend");
assert.equal(BM.expectationsReport(s).target, Math.round((compete + 1.5) * 10) / 10);
assert(BM.expectationsReport(s).items.some((x) => x.key === "playoffs" && x.required), "Contend demands the playoffs");

// The preseason brief is an important inbox message, posted once.
s = fresh();
syncOffice(s);
syncOffice(s);
const brief = ensureOffice(s).messages.filter((m) => m.key === `expectations-${s.year}-${s.team}`);
assert.equal(brief.length, 1);
assert.equal(brief[0].priority, "important");
assert.match(brief[0].body, /Consequences:/);

// Three wins: no meetings. Four straight losses: exactly one board and one team meeting.
s = fresh();
syncOffice(s);
for (let i = 0; i < 3; i++) play(s, "L");
assert.equal(meetings(s, "boardMeeting").length, 0, "no board meeting before four games");
play(s, "L");
let board = meetings(s, "boardMeeting"),
  team = meetings(s, "teamMeeting");
assert.equal(board.length, 1, "one board meeting after an 0-4 start");
assert.equal(team.length, 1, "one team meeting after an 0-4 start");
for (const m of [...board, ...team]) {
  assert.equal(m.priority, "urgent");
  assert.equal(m.status, "pending");
  assert.equal(decisionOptions(m).length, 3);
}
assert(officeCounts(s).urgent >= 2, "meetings pause calendar simulation");
assert.deepEqual(decisionOptions(board[0]).map((o) => o.id), ["commit", "youth", "resources"]);
assert.match(decisionOptions(board[0])[0].text, /win 3 of the next 5/);
assert.deepEqual(decisionOptions(team[0]).map((o) => o.id), ["accountable", "back", "gameplan"]);
const leaders = team[0].leaders.map((id) => s.roster.find((p) => p.id === id).name);
assert(leaders.length >= 2 && leaders.every((n) => team[0].summary.includes(n)), "the team meeting names real leaders");
assert.match(board[0].summary, /0–4 against a target/);

// Answering: the board plan sets a checkpoint; backing the group lifts chemistry.
const chemistry = s.franchise.socialEngine.pulse.chemistry,
  patienceBefore = s.franchise.clubs[s.team].owner.patience;
respondMessage(s, board[0].id, "commit");
assert.equal(s.franchise.clubs[s.team].owner.patience, Math.min(100, patienceBefore + 3), "committing buys a little patience now");
respondMessage(s, team[0].id, "back");
let plan = s.franchise.expectations.plan;
assert.equal(plan.status, "active");
assert.equal(plan.games, 5);
assert.equal(plan.need, 3);
assert.equal(plan.checkpointWeek, s.week + 5);
assert(s.franchise.socialEngine.pulse.chemistry > chemistry, "backing the group lifts chemistry");
assert.equal(BM.expectationsReport(s).plan.left, 5);
// Cooldowns: two more losses bring no new meetings.
play(s, "L");
play(s, "L");
assert.equal(meetings(s, "boardMeeting").length, 1, "board meetings respect the active plan and cooldown");
assert.equal(meetings(s, "teamMeeting").length, 1, "team meetings respect the three-week cooldown");
// Missing the checkpoint drops security sharply.
play(s, "L");
play(s, "L");
let securityBefore = B.boardOverview(s).security,
  ownerBefore = s.franchise.clubs[s.team].owner.patience;
play(s, "W");
plan = s.franchise.expectations.plan;
assert.equal(plan.status, "missed");
assert(s.franchise.clubs[s.team].owner.patience <= ownerBefore - 15, "a missed checkpoint costs owner patience");
assert(B.boardOverview(s).security <= securityBefore - 5, `security falls (${securityBefore} → ${B.boardOverview(s).security})`);
assert(ensureOffice(s).messages.some((m) => /Checkpoint missed/.test(m.title)));
assert(s.franchise.expectations.meetings.some((m) => m.kind === "Checkpoint" && m.outcome === "Missed"));
if (B.boardOverview(s).security < BM.MEETING_RULES.finalWarning)
  assert(ensureOffice(s).messages.some((m) => /Final warning/.test(m.title)), "very low security brings a final warning");

// Meeting the checkpoint lifts patience and security.
s = fresh();
syncOffice(s);
for (let i = 0; i < 4; i++) play(s, "L");
respondMessage(s, meetings(s, "boardMeeting")[0].id, "commit");
respondMessage(s, meetings(s, "teamMeeting")[0].id, "accountable");
play(s, "W");
play(s, "W");
play(s, "L");
play(s, "L");
securityBefore = B.boardOverview(s).security;
ownerBefore = s.franchise.clubs[s.team].owner.patience;
play(s, "W");
assert.equal(s.franchise.expectations.plan.status, "met");
assert(s.franchise.clubs[s.team].owner.patience >= ownerBefore + 8, "a met checkpoint earns patience");
assert(B.boardOverview(s).security > securityBefore, "a met checkpoint lifts job security");

// The youth plan lowers the target and measures young starters; resources raise it.
s = fresh();
syncOffice(s);
for (let i = 0; i < 4; i++) play(s, "L");
let target = B.boardOverview(s).target;
respondMessage(s, meetings(s, "boardMeeting")[0].id, "youth");
assert.equal(B.boardOverview(s).target, Math.round((target - 1.5) * 10) / 10);
assert.equal(s.franchise.expectations.plan.metric, "youngStarters");
s = fresh();
syncOffice(s);
for (let i = 0; i < 4; i++) play(s, "L");
target = B.boardOverview(s).target;
const budget = s.franchise.clubs[s.team].staffBudget;
respondMessage(s, meetings(s, "boardMeeting")[0].id, "resources");
assert(B.boardOverview(s).target > target && s.franchise.clubs[s.team].staffBudget > budget);

// Unanswered meetings are agreed with the first option at the deadline; no meetings after wins.
s = fresh();
syncOffice(s);
for (let i = 0; i < 4; i++) play(s, "W");
assert.equal(meetings(s, "boardMeeting").length + meetings(s, "teamMeeting").length, 0, "winning teams are left alone");

// End-of-season review compares the season with the expectations and sets next year's tone.
s = fresh();
syncOffice(s);
for (let guard = 0; guard < 40 && s.phase !== "offseason"; guard++) {
  for (const m of ensureOffice(s).messages.filter((m) => m.status === "pending" && BM.BOARD_DECISIONS.includes(m.decision))) respondMessage(s, m.id, decisionOptions(m)[0].id);
  play(s, "L");
}
assert.equal(s.phase, "offseason");
const review = meetings(s, "seasonReview");
assert.equal(review.length, 1);
assert.equal(review[0].priority, "important", "the review never pauses offseason simulation");
assert.match(review[0].title, /expectations missed/);
assert.equal(s.franchise.expectations.seasons[s.year].outcome, "Missed");
assert.equal(meetings(s, "boardMeeting").filter((m) => m.phase === "offseason").length, 0, "no in-season meetings in the offseason");
respondMessage(s, review[0].id, "push");
assert.deepEqual(s.franchise.expectations.nextTone, { year: s.year + 1, shift: 1 });
// Saves stay serialisable and validate.
const saved = JSON.parse(JSON.stringify(s));
S.migrate(saved);
assert(S.validate(saved));
console.log("PASS: expectations scale with strength, one board + one team meeting on underperformance, cooldowns, checkpoints move security, season review.");
