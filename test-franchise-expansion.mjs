import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import * as S from "./dist/franchise/state.mjs";
import * as Staff from "./dist/franchise/staff.mjs";
import * as K from "./dist/franchise/career-systems.mjs";
import * as B from "./dist/franchise/boardroom.mjs";
import * as C from "./dist/franchise/contracts.mjs";
import * as E from "./dist/franchise/world-events.mjs";
import * as R from "./dist/franchise/records.mjs";
import * as A from "./dist/franchise/awards.mjs";
import * as Jobs from "./dist/franchise/career-jobs.mjs";
import * as L from "./dist/franchise/lifecycle.mjs";
import * as W from "./dist/franchise/world.mjs";
import { simulateGame } from "./dist/franchise/fast-worker.mjs";
const context = {
  console,
  Math,
  Date,
  setTimeout() {},
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
    querySelector() {
      return {};
    },
    querySelectorAll() {
      return [];
    },
  },
};
context.window = context;
context.addEventListener = () => {};
vm.createContext(context);
vm.runInContext(fs.readFileSync("dist/game.js", "utf8"), context);
vm.runInContext(fs.readFileSync("dist/match.js", "utf8"), context);
function fresh() {
  const s = JSON.parse(vm.runInContext("JSON.stringify(fresh())", context));
  s.coach = { name: "Expansion QA", style: "Balanced", calling: "Manual" };
  S.migrate(s);
  Staff.ensureStaff(s);
  return s;
}
function approve(s, kind, payload) {
  const r = B.beginBoardRequest(s, kind, payload);
  B.answerBoard(s, r.id, 0, 1);
  B.answerBoard(s, r.id, 1, 0);
  assert.notEqual(r.outcome, "Rejected");
  return r;
}
let s = fresh();
const migrated = JSON.stringify(s);
S.migrate(s);
assert.equal(JSON.stringify(s), migrated, "migration must be idempotent");
assert.equal(
  K.changeCoachReputation(s, "title", 8, "Championship", "Results"),
  8,
);
assert.equal(
  K.changeCoachReputation(s, "title", 8, "Championship", "Results"),
  0,
);
assert.equal(K.coachReputation(s), 58);
assert.equal(s.franchise.career.reputation, 58);
K.changeCoachReputation(s, "bad", -100, "Leadership mistake");
assert.equal(K.coachReputation(s), 53, "event impact is bounded");
const loyal = {
  id: "loyal",
  name: "Loyal veteran",
  persona: { loyalty: 0.9, ambition: 0.2 },
  coachTrust: 75,
};
const fit = K.dialogueFit(loyal, "Challenge");
assert(fit < 0);
K.dialogueConsequences(s, {
  key: "meeting",
  person: loyal,
  tone: "Challenge",
  delta: fit,
});
assert(s.franchise.relationshipRifts[0].active);
const value = K.coachReputation(s);
K.dialogueConsequences(s, {
  key: "meeting",
  person: loyal,
  tone: "Challenge",
  delta: fit,
});
assert.equal(K.coachReputation(s), value);
K.dialogueConsequences(s, {
  key: "repair",
  person: loyal,
  tone: "Trust",
  delta: 4,
});
assert(s.franchise.relationshipRifts[0].severity < 2);
K.advanceCareerTime(s, 7, "week1");
K.advanceCareerTime(s, 7, "week1");
assert.equal(s.franchise.clock.day, 7);
K.setCooldown(s, "Test", "club", 14);
assert.throws(() => K.checkCooldown(s, "Test"), /14 football/);
K.advanceCareerTime(s, 14, "week3");
K.checkCooldown(s, "Test");
// Board permits bind the exact proposal, are single-use, persist and expire.
s = fresh();
s.franchise.coachReputation.value = 95;
s.franchise.clubs[s.team].owner.patience = 99;
const cash = s.franchise.clubs[s.team].cash,
  payload = { area: "training", funding: "Private" };
assert.throws(() => W.stadiumProject(s, "training", "Private"), /Ownership/);
let r = approve(s, "Stadium", payload);
assert(B.hasBoardPermit(s, "Stadium", payload));
assert(!B.hasBoardPermit(s, "Stadium", { ...payload, area: "medical" }));
const saved = JSON.parse(JSON.stringify(s));
assert(B.hasBoardPermit(saved, "Stadium", payload));
W.stadiumProject(saved, "training", "Private");
assert(!B.hasBoardPermit(saved, "Stadium", payload));
assert(saved.franchise.clubs[s.team].cash < cash);
assert.throws(
  () => W.stadiumProject(saved, "medical", "Private"),
  /construction/,
);
assert.throws(
  () =>
    B.beginBoardRequest(s, "Stadium", { area: "medical", funding: "Private" }),
  /football calendar/,
);
assert.throws(() => B.answerBoard(s, r.id, 1, 0), /no longer/);
let expired = JSON.parse(JSON.stringify(s));
K.advanceCareerTime(expired, 31, "expire");
assert(!B.hasBoardPermit(expired, "Stadium", payload));
assert.throws(
  () => W.stadiumProject(expired, "training", "Private"),
  /Ownership/,
);
const outcomes = new Set();
for (let i = 0; i < 24; i++) {
  const q = fresh();
  q.franchise.clubs[q.team].owner.patience = 20 + i * 3;
  q.franchise.coachReputation.value = 10 + i * 3;
  const z = B.beginBoardRequest(q, "Budget", { amount: 5 });
  B.answerBoard(q, z.id, 0, i % 3);
  B.answerBoard(q, z.id, 1, i % 3);
  outcomes.add(z.outcome);
}
assert(
  outcomes.has("Rejected") &&
    outcomes.has("Compromise") &&
    outcomes.has("Approved"),
);
// A contract extension retains original signing-bonus obligations and rolls back impossible cap terms.
s = fresh();
let p = s.roster.find((p) => s.franchise.contracts[p.id].years >= 2),
  c = s.franchise.contracts[p.id];
const beforeBonus = c.bonus,
  beforeYears = c.years,
  terms = {
    annual: Math.max(0.8, p.salary),
    years: 2,
    bonus: 1,
    guaranteed: 0.8,
  };
s = S.transact(s, (q) => C.extendContract(q, p.id, terms));
c = s.franchise.contracts[p.id];
assert.equal(c.bonus, beforeBonus);
assert.equal(c.years, beforeYears + 2);
assert(c.restructureBonuses.length);
assert.equal(K.cooldownRemaining(s, "Contract review", p.id), 45);
assert.throws(() => C.extendContract(s, p.id, terms), /45 football/);
K.advanceCareerTime(s, 45, "contract-review");
const snapshot = JSON.stringify(s);
assert.throws(
  () =>
    S.transact(s, (q) =>
      C.extendContract(q, p.id, { ...terms, annual: 500, bonus: 500 }),
    ),
  /salary cap/,
);
assert.equal(JSON.stringify(s), snapshot);
// Only regular-season stats enter the award snapshot; a playoff explosion cannot change a ballot.
s = fresh();
const qb = s.roster.find((p) => p.pos === "QB");
qb.experience = 0;
qb.draftYear = s.year;
qb.stats[s.year] = {
  passYards: 6000,
  passTD: 60,
  attempts: 650,
  completions: 470,
  interceptions: 3,
  snaps: 1000,
};
R.recordRound(s, [{ a: s.team, b: 0, score: [42, 10] }], {
  key: "regular1",
  phase: "season",
  week: 0,
  round: 0,
});
assert.equal(
  s.franchise.statBook.regularTotals[s.year][qb.id].stats.passYards,
  6000,
);
assert(
  s.franchise.statBook.alerts.some((a) => a.metric === "passYards" && a.broken),
);
const alertCount = s.franchise.statBook.alerts.length;
R.recordRound(s, [{ a: s.team, b: 0, score: [42, 10] }], {
  key: "regular1",
  phase: "season",
  week: 0,
  round: 0,
});
assert.equal(s.franchise.statBook.alerts.length, alertCount);
s.teams[s.team].w = 14;
s.teams[s.team].l = 3;
K.capturePreseason(s, true);
const ballot = A.freezeAwards(s);
const sealed = JSON.stringify(ballot);
qb.stats[s.year].passYards += 2000;
qb.stats[s.year].passTD += 30;
R.recordRound(s, [{ a: s.team, b: 0, score: [80, 10] }], {
  key: "post",
  phase: "playoffs",
  week: 18,
  round: 0,
});
A.freezeAwards(s);
assert.equal(JSON.stringify(s.franchise.awardBallots[s.year]), sealed);
assert.equal(
  s.franchise.statBook.regularTotals[s.year][qb.id].stats.passYards,
  6000,
);
A.announceAwards(s);
const count = s.franchise.awards.length;
A.announceAwards(s);
assert.equal(s.franchise.awards.length, count);
assert(
  s.franchise.awards.some((a) => a.award === "MVP" && a.playerId === qb.id),
);
assert(
  s.franchise.awards.some((a) => a.award === "OROY" && a.playerId === qb.id),
);
const field = Array.from({ length: 10 }, (_, i) => ({
  id: "c" + i,
  name: "Candidate " + i,
  team: i,
  score: {
    production: 50 - i,
    team: 5,
    narrative: i * 0.1,
    total: 55 - i * 0.9,
  },
}));
const race = A.rankedVote(field, 2026, "MVP");
assert.equal(race.ballots.length, 50);
assert.deepEqual(race.points, [10, 5, 3, 2, 1]);
assert.equal(
  race.results.reduce((n, r) => n + r.points, 0),
  1050,
);
for (const b of race.ballots) assert.equal(new Set(b.ranked).size, 5);
assert.deepEqual(A.rankedVote(field, 2026, "MVP"), race);
const greatQB = {
  pos: "QB",
  stats: {
    passYards: 4800,
    passTD: 42,
    attempts: 600,
    completions: 420,
    interceptions: 5,
  },
  teamRecord: { w: 14, l: 3 },
  seed: 1,
};
const solidRB = {
  pos: "RB",
  stats: { rushYards: 1500, rushTD: 12, recYards: 350, receptions: 40 },
  teamRecord: { w: 9, l: 8 },
  seed: 8,
};
assert(
  A.playerAwardScore(greatQB, "MVP").total >
    A.playerAwardScore(solidRB, "MVP").total,
);
assert(
  A.coachAwardScore({
    wins: 11,
    expectedWins: 5,
    priorWins: 4,
    seed: 3,
    reputation: 60,
    lateForm: 7,
  }).total >
    A.coachAwardScore({
      wins: 13,
      expectedWins: 12,
      priorWins: 12,
      seed: 1,
      reputation: 90,
      lateForm: 7,
    }).total,
);
// Rule decisions have a next-season effective date; duplicate voting is rejected.
s = fresh();
s.phase = "offseason";
const cap = s.franchise.rules.cap,
  agenda = E.ensureCommittee(s);
const proposed = agenda.proposals.find((p) => p.kind === "cap");
E.voteCommittee(s, proposed.id, "Yes");
assert.equal(s.franchise.rules.cap, cap);
assert.throws(() => E.voteCommittee(s, proposed.id, "No"), /already/);
E.applyCommitteeRules(s);
assert.equal(
  s.franchise.rules.cap,
  proposed.status === "Adopted" ? proposed.target : cap,
);
const once = s.franchise.rules.cap;
E.applyCommitteeRules(s);
assert.equal(s.franchise.rules.cap, once);
// Rumor lifecycle resolves missing subjects safely, and fan/social events deduplicate.
s = fresh();
s.franchise.world.rumors.push({
  id: "missing",
  team: s.team,
  playerId: "gone",
  kind: "Trade buzz",
  status: "Developing",
  deadline: 0,
});
E.processRumors(s, "r1");
assert.equal(s.franchise.world.rumors[0].status, "Resolved");
const fan = s.franchise.clubs[s.team].fanApproval;
K.fanReaction(s, "trade", 2, "A meaningful trade", { topic: "Trades" });
K.fanReaction(s, "trade", 2, "A meaningful trade");
assert.equal(s.franchise.clubs[s.team].fanApproval, fan + 2);
assert(E.expandedSocialPosts(s).some((p) => p.voiceKind === "National pundit"));
// Career interviews produce an actual registered, compliant employer transfer.
s = fresh();
s.phase = "offseason";
s.franchise.role = "OC";
s.franchise.userCoach = { name: "Career QA", role: "OC", appearance: {} };
s.franchise.coachReputation.value = 95;
Staff.ensureStaff(s);
K.generateJobOffers(s);
const job = s.franchise.coachReputation.jobOffers[0],
  oldTeam = s.team,
  oldPlayerIds = s.roster.map((p) => p.id),
  newPlayerIds = S.roster(s, job.team).map((p) => p.id);
Jobs.beginJobInterview(s, job.id);
Jobs.answerJobInterview(s, job.id, 0, 1);
assert.throws(() => Jobs.answerJobInterview(s, job.id, 0, 0), /current/);
Jobs.answerJobInterview(s, job.id, 1, 0);
assert.equal(job.status, "offered");
s = S.transact(s, (q) => Jobs.acceptJob(q, job.id));
assert.equal(s.team, job.team);
assert.equal(s.franchise.role, "HC");
assert.deepEqual(
  s.roster.map((p) => p.id),
  newPlayerIds,
);
assert.deepEqual(
  s.franchise.clubs[oldTeam].players.map((p) => p.id),
  oldPlayerIds,
);
assert(
  s.franchise.clubs[s.team].staff.some(
    (c) => c.name === "Career QA" && c.role === "HC",
  ),
);
assert(S.validate(s));
assert(
  Staff.searchCompliance(s, "HC").ok ||
    s.franchise.staffSearches[`${s.team}:HC`]?.status === "appointed",
);
const heritage = JSON.parse(
  fs.readFileSync("dist/data/franchise-heritage.json"),
);
assert.equal(heritage.teams.length, 32);
const clubOrder = JSON.parse(vm.runInContext("JSON.stringify(clubs)", context));
for (const team of heritage.teams)
  assert.equal(
    team.abbr,
    clubOrder[team.id][0],
    "Historical franchise IDs must match the game database",
  );
assert(heritage.teams.every((t) => t.legendIds.length));
assert.equal(
  heritage.legends.find((p) => p.name === "Jim Kelly").classYear,
  2002,
);
assert.equal(
  heritage.legends.find((p) => p.name === "Vince Lombardi").classYear,
  1971,
);
assert.equal(
  heritage.teams[7].retiredNumbers.find((p) => p.name === "Joe Greene").number,
  75,
);
assert(
  heritage.legends.every((p) => p.classYear >= 1963 && p.classYear <= 2026),
);
R.configureCareerHistory(
  JSON.parse(fs.readFileSync("dist/data/player-careers.json")),
);
assert.equal(
  R.historicalCareerFor({
    name: "Patrick Mahomes",
    pos: "QB",
    realPlayer: true,
  }).stats.passYards,
  35939,
);
console.log(
  "PASS: persisted expansion migration, reputation idempotency, personality rifts, calendar cooldowns, board outcomes/permits/expiry, contract extensions/cap rollback, regular-season records and milestones, pre-playoff frozen awards, 50 ranked ballots, QB/turnaround biases, deferred rule changes, rumor lifecycle, social voices, actual coaching career transfers, and 32-team factual heritage.",
);
