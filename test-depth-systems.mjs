import assert from "node:assert/strict";
import { deriveRoundEvents, ensureEventLog } from "./dist/franchise/event-bus.mjs";
import { processSocialRound, socialPulse, socialEnginePosts } from "./dist/franchise/social-engine.mjs";
import { maybeOpenDilemma, activeDilemma, resolveDilemma, pressConference, answerPress, unlockNode, treePoints, hasPerk, momentum, environment, halftimeDeck, playHalftimeCard, DILEMMAS } from "./dist/franchise/depth-systems.mjs";

globalThis.clubs ??= Array.from({ length: 32 }, (_, i) => [`T${i}`, `City ${i}`, `Club${i}`, `Division ${Math.floor(i / 4)}`]);

function career() {
  const player = (id, pos, ovr, age = 26) => ({ id, name: `${pos} Player ${id}`, pos, ovr, age, morale: 75, injury: 0, starter: true, stats: {} });
  return {
    year: 2026,
    week: 2,
    phase: "season",
    team: 0,
    morale: 75,
    coach: { name: "Avery Coach" },
    roster: [player("q1", "QB", 88), player("r1", "RB", 70, 21), player("v1", "LB", 77, 33)],
    teams: Array.from({ length: 32 }, () => ({ w: 1, l: 1, pf: 40, pa: 40 })),
    schedule: Array.from({ length: 17 }, () => [{ a: 0, b: 9, score: null }]),
    franchise: {
      career: { reputation: 55, xp: 0 },
      clubs: Array.from({ length: 32 }, (_, id) => ({ id, staff: [], fanApproval: 65, owner: { patience: 60 }, players: [] })),
      office: { stories: [], messages: [], seen: [], rounds: [], step: 0, moodHistory: [] },
    },
  };
}

// Dilemmas: deterministic per round, one at a time, consequences recorded.
let s = career();
processSocialRound(s, deriveRoundEvents(s, [{ a: 0, b: 9, score: [10, 24] }], "r1"));
let opened = null;
for (let i = 0; i < 40 && !opened; i++) opened = maybeOpenDilemma(s, `round-${i}`);
assert(opened, "a dilemma opens within a few rounds");
assert.equal(activeDilemma(s).id, opened.id);
assert.equal(maybeOpenDilemma(s, "round-999"), null, "only one open dilemma at a time");
const def = DILEMMAS.find((d) => d.id === opened.kind),
  choice = def.choices[0],
  historyBefore = socialPulse(s).trend.length,
  postsBefore = socialEnginePosts(s).length;
const resolved = resolveDilemma(s, opened.id, choice.id);
assert.equal(activeDilemma(s), null);
assert.equal(resolved.outcome, choice.label);
assert(socialPulse(s).trend.length > historyBefore || historyBefore === 8, "the pulse records the reaction");
assert(socialEnginePosts(s).length > postsBefore, "the public reacts to how the dilemma was handled");
assert.throws(() => resolveDilemma(s, opened.id, choice.id), /already/);

// Press conference: tied to the latest event, answered once, quote reaches the feed.
const presser = pressConference(s);
assert.match(presser.question, /loss|job/i);
const { quote } = answerPress(s, presser.id, "accountable");
assert.match(quote, /on me/i);
assert(socialEnginePosts(s).some((p) => p.body.includes(quote) || p.eventId === ensureEventLog(s).events[0].id));
assert.throws(() => answerPress(s, presser.id, "confident"), /ended/);

// Coaching tree: points from XP, prerequisites, no double unlock.
assert.equal(treePoints(s), 0);
assert.throws(() => unlockNode(s, "film-room"), /points/);
s.franchise.career.xp = 400;
assert.equal(treePoints(s), 4);
assert.throws(() => unlockNode(s, "halftime-whisperer"), /earlier/);
unlockNode(s, "film-room");
unlockNode(s, "halftime-whisperer");
assert(hasPerk(s, "halftime-whisperer"));
assert.equal(treePoints(s), 1);
assert.throws(() => unlockNode(s, "film-room"), /Already/);

// Game day: momentum reflects recent plays; environment advises; halftime cards use existing settings only.
const live = {
  a: 0,
  b: 9,
  halftime: true,
  weather: "Wind",
  score: [3, 17],
  stats: [{ pass: 40 }, { pass: 180 }],
  events: [{ text: "T9: TOUCHDOWN!" }, { text: "T0: quarterback sacked for 7 yards." }, { text: "T0: quarterback sacked for 4 yards." }, { text: "T9: First down." }],
};
assert(momentum(live, ["T0", "T9"]) < 0);
assert.equal(environment(s, live).windAdvice, "Favor short passing and the run");
s.live = live;
const deck = halftimeDeck(s, live);
assert(deck.some((c) => c.id === "max-protect"), "sacks surface the protection card");
assert(deck.length > 4, "Halftime Whisperer reveals the full deck");
playHalftimeCard(s, "max-protect");
assert.equal(s.live.personnel, "12");
assert.throws(() => playHalftimeCard(s, "tempo"), /already/);
s.live.halftime = false;
assert.throws(() => playHalftimeCard(s, "max-protect"), /halftime/);

console.log("PASS: locker-room dilemmas, press conferences, coaching tree, momentum, environment and halftime deck.");
