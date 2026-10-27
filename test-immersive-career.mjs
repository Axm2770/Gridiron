import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import * as S from "./dist/franchise/state.mjs";
import {
  beginNegotiation,
  discussPitch,
  evaluateNegotiation,
  submitNegotiation,
  useCounter,
  contractSummary,
} from "./dist/franchise/negotiations.mjs";
import {
  reputationView,
  syncReputation,
} from "./dist/franchise/reputation.mjs";
import {
  socialFeed,
  hubPreferences,
  toggleStored,
} from "./dist/franchise/front-office.mjs";
import { castSocialVote } from "./dist/franchise/social-network.mjs";
import {
  lineupActors,
  lineupCandidates,
  changeLineup,
  sortForLineup,
} from "./dist/franchise/lineup.mjs";
import { buildActors } from "./dist/engine/execution.mjs";
import { simulateGame } from "./dist/franchise/fast-worker.mjs";
import {
  installTouchlineUI,
  lineupCoordinates,
} from "./dist/franchise/touchline-ui.mjs";
const ctx = {
  console,
  Math,
  Date,
  setTimeout() {},
  addEventListener() {},
  localStorage: {
    getItem() {
      return null;
    },
    setItem() {},
  },
  document: {
    getElementById() {
      return { innerHTML: "", style: {}, showModal() {}, close() {} };
    },
    querySelectorAll() {
      return [];
    },
    querySelector() {
      return {};
    },
  },
};
ctx.window = ctx;
vm.createContext(ctx);
vm.runInContext(fs.readFileSync("dist/game.js", "utf8"), ctx);
vm.runInContext(fs.readFileSync("dist/match.js", "utf8"), ctx);
let s = JSON.parse(vm.runInContext("JSON.stringify(fresh())", ctx));
s.coach = {
  name: "QA",
  offense: "Shotgun spread",
  defense: "Nickel",
  calling: "Manual",
};
S.migrate(s);
s.phase = "offseason";
const clubs = JSON.parse(vm.runInContext("JSON.stringify(clubs)", ctx));
const p = s.agents[0],
  n = beginNegotiation(s, p.id),
  balance = JSON.stringify(s.franchise.contracts);
assert.equal(n.step, "Introduction");
discussPitch(s, p.id, "Security");
assert.equal(n.step, "Proposal");
assert.throws(() => discussPitch(s, p.id, "bad"));
const terms = { ...n.terms };
const v = evaluateNegotiation(s, p.id, terms);
assert(v.cap > 0);
assert.equal(
  JSON.stringify(s.franchise.contracts),
  balance,
  "agent feedback must not commit a contract",
);
assert.equal(s.franchise.market.offers.length, 0);
assert(n.counter);
useCounter(s, p.id);
assert.equal(n.step, "Proposal");
assert.throws(
  () => evaluateNegotiation(s, p.id, { ...terms, roster: -1 }),
  /non-negative/,
);
assert.throws(
  () => evaluateNegotiation(s, p.id, { ...terms, years: 6 }),
  /Invalid/,
);
let rejected = structuredClone(s);
rejected.franchise.role = "HC";
assert.throws(
  () => evaluateNegotiation(rejected, p.id, terms),
  /role|delegat|permi/i,
);
const committed = S.transact(s, (d) => submitNegotiation(d, p.id));
assert.equal(committed.franchise.market.offers.length, 1);
assert.equal(committed.franchise.negotiations[p.id].status, "submitted");
assert(
  !committed.roster.some((q) => q.id === p.id),
  "submitted bid is not a signing",
);
assert.throws(() => submitNegotiation(committed, p.id), /already/);
let costly = structuredClone(s);
costly.franchise.negotiations[p.id].terms = { ...terms, annual: 1000 };
const rollback = JSON.stringify(costly);
assert.throws(
  () => S.transact(costly, (d) => submitNegotiation(d, p.id)),
  /cap/,
);
assert.equal(JSON.stringify(costly), rollback);
let live = structuredClone(s);
live.live = {};
assert.throws(() => submitNegotiation(live, p.id), /live/);
let stale = structuredClone(s);
stale.agents = stale.agents.filter((q) => q.id !== p.id);
assert.throws(() => submitNegotiation(stale, p.id), /current/);
// Sums include recurring bonuses; guarantees are not counted twice in total value.
const c = {
  years: 2,
  base: [100 * S.MILLION, 100 * S.MILLION],
  bonus: 10 * S.MILLION,
  guarantees: [20 * S.MILLION, 0],
  roster: [2 * S.MILLION, 2 * S.MILLION],
  workout: [S.MILLION, S.MILLION],
  incentives: [],
  start: S.financeYear(s),
  prorate: 2,
  voidYears: 0,
};
const cs = contractSummary(s, c);
assert.equal(cs.total, 216 * S.MILLION);
assert.equal(cs.guaranteed, 30 * S.MILLION);
// Recognition is persistent and slow-moving; poor current form is distinct from ability and audience.
syncReputation(s);
const star = s.roster[0];
star.ovr = 95;
star.reputation.recognition = 92;
const rep = structuredClone(star.reputation),
  overall = star.ovr;
star.progression = { form: 4 };
assert.equal(reputationView(s, star).recognition, 92);
assert(reputationView(s, star).esteem < 95);
syncReputation(s);
assert.deepEqual(star.reputation, rep);
assert.equal(star.ovr, overall);
s.week++;
syncReputation(s);
assert(Math.abs(star.reputation.recognition - 92) <= 1);
const historySize = star.reputation.history.length;
syncReputation(s);
assert.equal(star.reputation.history.length, historySize);
const feed = socialFeed(s, clubs);
assert(feed.some((p) => p.authorPlayer));
const poll = feed.find((p) => p.poll);
assert(poll);
assert(poll.comments.some((c) => c.replyTo));
assert(
  poll.comments.some((c) =>
    /attempt|carry|catch|workload|efficien/i.test(c.text),
  ),
);
assert.equal(
  poll.poll.shares.reduce((a, b) => a + b, 0),
  100,
);
assert.deepEqual(feed, socialFeed(s, clubs));
castSocialVote(s, feed, poll.id, 0);
castSocialVote(s, feed, poll.id, 1);
assert.equal(hubPreferences(s).socialVotes[poll.id], 1);
assert.throws(() => castSocialVote(s, feed, poll.id, 9));
assert.throws(() => castSocialVote(s, feed, "stale", 0));
toggleStored(s, "socialSaved", poll.id, poll);
s.week++;
assert(socialFeed(s, clubs).some((p) => p.id === poll.id));
// Provide sufficient depth for all supported personnel/front combinations.
for (const pos of new Set(S.POS))
  for (let i = s.roster.filter((p) => p.pos === pos).length; i < 5; i++) {
    const q = S.makePlayer("lineup-" + pos + "-" + i, pos, 700 + i);
    s.roster.push(q);
    s.franchise.contracts[q.id] = S.basicContract(q, s.team, s.year);
  }
const group = {};
for (const q of sortForLineup(s.roster, s.team)) (group[q.pos] ??= []).push(q);
for (const personnel of ["11", "12", "21", "10", "Goal Line"])
  for (const front of ["4–3 base", "3–4 base", "Nickel", "Dime"]) {
    const actors = buildActors(
      50,
      group,
      group,
      "Shotgun spread",
      personnel,
      front,
      "2-High",
    );
    for (const side of [0, 1]) {
      const ids = actors.filter((a) => a.side === side).map((a) => a.id);
      assert.equal(
        new Set(ids).size,
        11,
        personnel + " / " + front + " must not duplicate a player",
      );
    }
  }
let actors = lineupActors(s, "Offense"),
  qb = actors.find((a) => a.role === "QB"),
  replacement = lineupCandidates(s, "Offense", qb.index)[0];
assert(replacement);
const prior = qb.id;
changeLineup(s, "Offense", qb.index, replacement.id);
assert.equal(
  lineupActors(s, "Offense").find((a) => a.role === "QB").id,
  replacement.id,
);
assert.equal(
  lineupActors(JSON.parse(JSON.stringify(s)), "Offense").find(
    (a) => a.role === "QB",
  ).id,
  replacement.id,
);
assert.throws(
  () => changeLineup(s, "Offense", qb.index, replacement.id),
  /already/,
);
replacement.injury = 2;
assert(!lineupActors(s, "Offense").some((a) => a.id === replacement.id));
assert.throws(
  () => changeLineup(s, "Offense", qb.index, replacement.id),
  /available/,
);
replacement.injury = 0;
const roleSave = s.franchise.role;
s.franchise.role = "OC";
const dc = lineupActors(s, "Defense")[0],
  reserve = lineupCandidates(s, "Defense", dc.index)[0];
assert.throws(
  () => changeLineup(s, "Defense", dc.index, reserve.id),
  /delegat/,
);
s.franchise.role = roleSave;
const m = {
  a: s.team,
  b: 0,
  spot: 25,
  poss: 0,
  quarter: 1,
  clock: 900,
  score: [0, 0],
  down: 1,
  toGo: 10,
  plays: 0,
  periodScores: [
    [0, 0],
    [0, 0],
    [0, 0],
    [0, 0],
  ],
  tempo: "Normal",
  offense: "Shotgun spread",
  defense: "Nickel",
  call: "Quick pass",
  defCall: "Cover 2",
  personnel: "11",
  shell: "2-High",
  events: [],
  timeouts: [3, 3],
  stats: [
    { yards: 0, pass: 0, rush: 0, first: 0, turnovers: 0, plays: 0 },
    { yards: 0, pass: 0, rush: 0, first: 0, turnovers: 0, plays: 0 },
  ],
};
const worker = simulateGame({
  a: m.a,
  b: m.b,
  home: s.roster,
  away: s.franchise.clubs[0].players,
  live: m,
  seed: 73,
  target: "five",
  userTeam: s.team,
  tactics: { calling: "Manual" },
  directives: {},
  labels: ["DAL", "BUF"],
});
assert(
  worker.stats.some((p) => p.id === replacement.id && p.snaps > 0),
  "quick simulation must use the chosen QB",
);
assert(
  !worker.stats.some((p) => p.id === prior && p.snaps > 0),
  "replaced QB must not appear on the next snaps",
);
Object.assign(globalThis, {
  state: s,
  clubs,
  window: globalThis,
  esc: (v) =>
    String(v)
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll('"', "&quot;"),
  logo: (t) => `<img class="team-logo" alt="${clubs[t]?.[0] || t}">`,
  cname: (t) => clubs[t].slice(1, 3).join(" "),
  matchScreen: () => "",
  showSubs() {},
  beginLive() {},
  modal() {},
  closeModal() {},
  render() {},
  save() {},
  pauseAuto() {},
  toast() {},
  animating: false,
  autoTimer: null,
  view: "Matchday",
  F: {},
  document: {
    getElementById() {
      return { classList: { remove() {}, add() {} }, addEventListener() {} };
    },
    querySelector() {
      return null;
    },
    body: { classList: { toggle() {} } },
  },
  game: () => s.schedule[0][0],
  phaseName: () => "Week 1",
  offenses: ["Shotgun spread", "Singleback", "I formation", "Empty backfield"],
  defenses: ["4–3 base", "3–4 base", "Nickel", "Dime"],
  offCalls: [["Quick pass", "Short routes"]],
  defCalls: [["Cover 2", "Deep zones"]],
  liveField: () => '<div id="stadium-host"></div>',
  teamIndex: () => 0,
  onOffense: () => true,
  clockText: () => "15:00",
  fieldPosition: () => "DAL 25",
  advice: () => "Watch the matchup.",
  postgameCard: () => "",
  broadcast: { director: { enabled: false } },
});
installTouchlineUI({ isBusy: () => false });
assert(matchScreen().includes("Interactive lineup"));
s.live = m;
const html = matchScreen();
assert(html.includes("Snap ball"));
assert(html.includes("Simulation stopping point"));
assert(html.includes("touch-play-grid"));
Touch.tab("Team lineup");
const board = matchScreen();
assert(board.includes("Select " + replacement.name));
assert(board.includes("Available replacements"));
assert(!board.includes("NaN"));
const points = lineupCoordinates(lineupActors(s, "Offense"), "Offense", m);
assert(
  points.every(
    (p) => p.left >= 0 && p.left <= 100 && p.top >= 0 && p.top <= 100,
  ),
);
Touch.tab("Match centre");
assert(matchScreen().includes("Match statistics"));
console.log(
  "PASS: cinematic negotiation state/counters/validation/rollback/duplicate and stale guards, non-binding bids, monetary summaries; reputation persistence/idempotency/slow change/form separation; player posts/data-driven nested debates/polls/saved snapshots; unique personnel actors, positional/availability/role-safe lineup swaps, saved depth ordering and worker use; pregame/live/lineup/match-centre renderers.",
);
