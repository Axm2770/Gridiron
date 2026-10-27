import { simulateGame } from "./dist/franchise/fast-worker.mjs";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import * as S from "./dist/franchise/state.mjs";
import {
  ensureOffice,
  syncOffice,
  postMessage,
  postStory,
  applyMood,
  respondMessage,
  processNewsRound,
  officeCounts,
} from "./dist/franchise/newsroom.mjs";
import {
  seasonStats,
  statValue,
  statRows,
  teamReport,
  leagueBenchmarks,
  csvText,
} from "./dist/franchise/analysis.mjs";
import * as W from "./dist/franchise/world.mjs";
const nodes = {},
  ctx = {
    console,
    Date,
    Math,
    setTimeout: () => {},
    localStorage: { getItem: () => null, setItem() {} },
    document: {
      getElementById: (id) =>
        (nodes[id] ??= {
          innerHTML: "",
          style: {},
          showModal() {},
          close() {},
        }),
      querySelector: () => ({}),
      querySelectorAll: () => [],
    },
  };
ctx.window = ctx;
ctx.addEventListener = () => {};
vm.createContext(ctx);
vm.runInContext(fs.readFileSync("dist/game.js", "utf8"), ctx);
vm.runInContext(fs.readFileSync("dist/match.js", "utf8"), ctx);
const fresh = () => {
  const s = JSON.parse(vm.runInContext("JSON.stringify(fresh())", ctx));
  s.coach = { name: "Test Coach", calling: "Manual" };
  S.migrate(s);
  return s;
};
let s = fresh();
syncOffice(s);
const original = JSON.stringify(s.franchise.office);
syncOffice(s);
assert.equal(
  JSON.stringify(s.franchise.office),
  original,
  "render synchronization cannot duplicate mail or effects",
);
let o = ensureOffice(s),
  m = o.messages.find((m) => m.decision === "expectations");
assert(m);
let before = s.morale;
const rosterMood = s.roster[0].morale;
respondMessage(s, m.id, "steady");
assert.equal(s.morale, before + 2);
assert.equal(m.status, "resolved");
assert.equal(s.roster[0].morale, Math.min(99, rosterMood + 2));
assert.throws(() => respondMessage(s, m.id, "steady"), /already/);
assert.equal(m.changes.find((c) => c.name === "Team morale").delta, 2);
// Reading / starring is cosmetic; it must not grant points.
before = s.morale;
m.read = true;
m.bookmarked = true;
syncOffice(s);
assert.equal(s.morale, before);
let p = s.roster[0];
p.persona.leadership = 0.9;
p.morale = 98;
p.coachTrust = 98;
const peers = s.roster.filter(
  (q) => q.id !== p.id && (q.pos === p.pos || (q.persona?.loyalty || 0) > 0.75),
);
applyMood(s, {
  playerId: p.id,
  delta: 9,
  trust: 8,
  reason: "Leadership",
  sourceId: "lead",
});
assert.equal(p.morale, 99);
assert.equal(p.coachTrust, 99);
assert(s.franchise.office.moodHistory[0].changes.length >= 1);
if (peers.length) assert(peers[0].moodLog?.length);
// Promised reviews remain obligations and cannot be replayed after a save reload.
m = postMessage(s, "review-test", {
  decision: "role",
  playerId: p.id,
  title: "Review",
  body: "Review",
});
respondMessage(s, m.id, "review");
assert(s.franchise.cinema.promises.some((x) => x.playerId === p.id && !x.done));
s = JSON.parse(JSON.stringify(s));
assert.throws(() => respondMessage(s, m.id, "review"), /already/);
S.validate(s);
// Removed player is closed without a null dereference or fake mood effect.
m = postMessage(s, "gone", {
  decision: "role",
  playerId: "gone",
  title: "Gone",
});
const mood = s.morale;
respondMessage(s, m.id, "clarity");
assert.equal(m.status, "closed");
assert.equal(s.morale, mood);
m = postMessage(s, "invalid", { decision: "role", title: "Invalid" });
assert.throws(() => respondMessage(s, m.id, "bogus"), /available/);
assert.equal(m.status, "pending");
s.live = {};
assert.throws(() => respondMessage(s, m.id, "clarity"), /current game/);
s.live = null;
// Two-round deadlines have exactly one delegated response.
let a = fresh();
syncOffice(a);
processNewsRound(a, [], "r0");
processNewsRound(a, [], "r1");
assert.equal(
  a.franchise.office.messages.find((x) => x.decision === "expectations").status,
  "delegated",
);
const snapshot = JSON.stringify(a);
assert.equal(processNewsRound(a, [], "r1"), false);
assert.equal(JSON.stringify(a), snapshot);
let b = fresh();
syncOffice(b);
processNewsRound(b, [], "r0");
processNewsRound(b, [], "r1");
assert.equal(
  JSON.stringify(a),
  JSON.stringify(b),
  "deterministic dispatch and morale",
);
// Real actions are translated to mail once, without applying their morale twice.
a = fresh();
W.forceEvent(a, "Holdout");
const held = a.roster.find((p) => p.holdout),
  heldMood = held.morale;
syncOffice(a);
assert.equal(held.morale, heldMood);
assert(
  a.franchise.office.messages.some(
    (m) => m.decision === "contract" && m.playerId === held.id,
  ),
);
const hold = a.franchise.office.messages.find((m) => m.decision === "contract");
respondMessage(a, hold.id, "clarity");
assert(held.holdout, "a friendly message is not a signed contract");
// One injury episode yields one report despite render/reload or a lower countdown.
let medical = fresh();
medical.roster[0].injury = 5;
syncOffice(medical);
let injuries = medical.franchise.office.messages.filter((m) =>
  m.title.startsWith("Medical update:"),
).length;
medical.week++;
medical.roster[0].injury = 4;
syncOffice(medical);
assert.equal(
  medical.franchise.office.messages.filter((m) =>
    m.title.startsWith("Medical update:"),
  ).length,
  injuries,
);
medical.roster[0].injury = 0;
syncOffice(medical);
assert(
  medical.franchise.office.messages.some((m) =>
    m.title.startsWith("Back in contention:"),
  ),
);
medical.roster[0].injury = 3;
syncOffice(medical);
assert.equal(
  medical.franchise.office.messages.filter((m) =>
    m.title.startsWith("Medical update:"),
  ).length,
  injuries + 1,
);
// Private conversation logs stay internal; public interview recaps can become news.
const privacy = fresh();
S.log(
  privacy,
  "Conversation: Behind closed doors",
  "A private role discussion.",
  "private",
);
S.log(
  privacy,
  "Conversation: At the final whistle",
  "A public press answer.",
  "media",
);
syncOffice(privacy);
assert(
  privacy.franchise.office.messages.some(
    (m) => m.title === "Conversation: Behind closed doors",
  ),
);
assert(
  !privacy.franchise.office.stories.some(
    (m) => m.title === "Conversation: Behind closed doors",
  ),
);
assert(
  privacy.franchise.office.stories.some(
    (m) =>
      m.title === "Conversation: At the final whistle" &&
      m.category === "Interviews",
  ),
);
// Long running worlds are bounded, while live tasks and bookmarks survive.
a = fresh();
for (let i = 0; i < 400; i++) {
  postMessage(a, "m" + i, { title: "Item " + i, body: "Body" });
  postStory(a, "s" + i, { title: "Story " + i, body: "Body" });
}
assert(a.franchise.office.messages.length <= 280);
assert(a.franchise.office.stories.length <= 240);
assert(a.franchise.office.seen.length <= 1800);
// Missing stats never produce invented ratios; scaling does not alter rate columns.
p = {
  id: "p",
  name: "A Test",
  pos: "QB",
  morale: 75,
  fitness: 90,
  stats: {
    2026: {
      attempts: 10,
      completions: 7,
      passYards: 100,
      passTD: 1,
      snaps: 20,
    },
    2027: { attempts: 20, completions: 10, passYards: 120, snaps: 30 },
  },
};
let st = seasonStats(p, 2026);
assert.equal(st.completionPct, 70);
assert.equal(st.yardsPerAttempt, 10);
assert.equal(statValue(st, "passYards", "Per 100 snaps"), 500);
assert.equal(statValue(st, "completionPct", "Per 100 snaps"), 70);
assert.equal(seasonStats(p, 2028).completionPct, null);
assert.equal(statValue({}, "passYards", "Per 100 snaps"), null);
assert.equal(seasonStats(p, "Career").passYards, 220);
a = fresh();
a.roster[0].stats[2026] = {
  passYards: 800,
  attempts: 100,
  completions: 60,
  snaps: 130,
};
const rows = statRows(a, {
  category: "Passing",
  scope: "My team",
  minimum: 100,
  year: 2026,
});
assert(rows.every((r) => r.team === a.team && r.stats.snaps >= 100));
assert.equal(rows[0].stats.passYards, 800);
assert.equal(teamReport(a).ppg, null);
assert.equal(leagueBenchmarks(a).ppg, null);
a.teams[a.team].w = 1;
a.teams[a.team].pf = 28;
a.teams[a.team].pa = 14;
assert.equal(teamReport(a).ppg, 28);
assert.equal(teamReport(a).allowed, 14);
assert(
  csvText(["Name"], [["=SUM(1)"], ["a,b"], ['a"b']]).includes('"\'=SUM(1)"'),
);
assert(csvText(["Name"], [['a"b']]).includes('a""b'));
// Worker output must credit offense and defense to their actual franchises.
const gameState = fresh(),
  awayTeam = 1,
  awayRoster = S.roster(gameState, awayTeam);
const simulation = simulateGame({
  a: gameState.team,
  b: awayTeam,
  home: gameState.roster,
  away: awayRoster,
  seed: 7301,
  userTeam: gameState.team,
  directives: {},
});
const ownership = new Map([
  ...gameState.roster.map((p) => [p.id, gameState.team]),
  ...awayRoster.map((p) => [p.id, awayTeam]),
]);
for (const record of simulation.stats) {
  assert.equal(record.team, ownership.get(record.id));
  const player = S.roster(gameState, record.team).find(
    (p) => p.id === record.id,
  );
  player.stats[gameState.year] = { ...record };
}
const passing = statRows(gameState, {
  category: "Passing",
  scope: "My team",
  minimum: 25,
  year: gameState.year,
});
assert(passing.length);
assert(passing[0].stats.attempts > 0);
assert(passing[0].stats.passYards > 0);
assert(officeCounts(a).pending >= 0);
console.log(
  "PASS: news/inbox idempotency, deterministic dispatch, morale/trust bounds and leader influence, one-shot responses, role-review obligations, departed player safety, live-game guard, deadlines/delegation, save reload, real-action ingestion, bounded archives, honest rate denominators, scope/sample filters, benchmarks and CSV safety.",
);
