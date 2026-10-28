import assert from "node:assert/strict";
import { deriveRoundEvents, ensureEventLog, emitGameEvent } from "./dist/franchise/event-bus.mjs";
import { processSocialRound, expandTemplate, socialPulse, socialEnginePosts, eventSentiment, castFor, moraleModifier } from "./dist/franchise/social-engine.mjs";
import { random } from "./dist/engine/random.mjs";

globalThis.clubs ??= Array.from({ length: 32 }, (_, i) => [`T${i}`, `City ${i}`, `Club${i}`, `Division ${Math.floor(i / 4)}`]);

// Minimal career fixture with the fields the narrative systems touch.
function career() {
  const player = (id, pos, ovr, extra = {}) => ({ id, name: `${pos} Player ${id}`, pos, ovr, age: 26, morale: 75, injury: 0, starter: true, stats: {}, ...extra });
  return {
    year: 2026,
    week: 3,
    phase: "season",
    team: 0,
    morale: 75,
    coach: { name: "Avery Coach" },
    roster: [player("q1", "QB", 88), player("r1", "RB", 80), player("w1", "WR", 84, { persona: { leadership: 0.2 } }), player("d1", "DL", 79)],
    teams: Array.from({ length: 32 }, () => ({ w: 2, l: 1, pf: 60, pa: 50 })),
    schedule: Array.from({ length: 17 }, (_, w) => [{ a: 0, b: w % 2 ? 1 : 9, score: null }]),
    franchise: {
      career: { reputation: 55, xp: 0 },
      clubs: Array.from({ length: 32 }, (_, id) => ({ id, staff: [], fanApproval: 65, owner: { patience: 60 }, players: [{ id: `o${id}`, name: `Rival Star ${id}`, pos: "LB", ovr: 85, injury: 0 }] })),
      office: { stories: [], messages: [], seen: [], rounds: [], step: 0, moodHistory: [] },
    },
  };
}

// Grammar: choices, slots and conditionals.
const rng = random(7);
const text = expandTemplate("{team} {?clutch:clutch }{!clutch:routine }[win|victory] {score}.", { team: "Club0", score: "24–21", tags: ["clutch"] }, rng);
assert.match(text, /^Club0 clutch (win|victory) 24–21\.$/);
assert.equal(expandTemplate("{?blowout:Ouch. }Done.", { tags: [] }, rng), "Done.");

// Sentiment model ranks moments sensibly.
assert(eventSentiment({ kind: "GameResult", margin: 28, tags: ["blowout", "win"] }) > eventSentiment({ kind: "GameResult", margin: 3, tags: ["win"] }));
assert(eventSentiment({ kind: "GameResult", margin: -24, tags: ["blowout", "loss", "rivalry"] }) <= -0.9);
assert(castFor({ kind: "GameResult", tags: ["rivalry"], opponent: 1 }, -0.8).includes("rival"));
assert(castFor({ kind: "GameResult", tags: ["blowout"] }, -0.9).includes("hottake"));

// A blowout rivalry loss produces a varied multi-archetype reaction and moves the pulse.
let s = career();
const before = socialPulse(s);
const events = deriveRoundEvents(s, [{ a: 0, b: 1, score: [6, 34] }], "2026:season:3:0");
assert.deepEqual(events.map((e) => e.kind).sort(), ["Blowout", "GameResult", "RivalryGame"]);
const posts = processSocialRound(s, events);
const kinds = new Set(posts.map((p) => p.archetype));
for (const k of ["beat", "insider", "hottake", "team", "rival", "fan"]) assert(kinds.has(k), "missing archetype " + k);
assert.equal(new Set(posts.map((p) => p.body)).size, posts.length, "no duplicated post text");
assert(posts.every((p) => p.body && !/\{|\}|\[|\]/.test(p.body)), "templates fully expanded");
const after = socialPulse(s);
assert(after.fanScore < before.fanScore, "fan score falls after a blowout loss");
assert(after.drama > before.drama, "hot takes raise drama");
assert(s.franchise.clubs[0].fanApproval < 65, "fan approval consequence applied through fanReaction");

// Idempotent: re-settling the same round adds nothing.
assert.equal(deriveRoundEvents(s, [{ a: 0, b: 1, score: [6, 34] }], "2026:season:3:0").length, 0);
assert.equal(processSocialRound(s, events).length, 0);

// Streaks, clutch wins and template rotation across several rounds.
for (let w = 4; w < 8; w++) {
  s.week = w;
  processSocialRound(s, deriveRoundEvents(s, [{ a: 0, b: 9, score: [24, 21] }], `2026:season:${w}:0`));
}
assert.equal(ensureEventLog(s).streak, 4);
assert(ensureEventLog(s).events.some((e) => e.kind === "ClutchFinish"));
assert(ensureEventLog(s).events.find((e) => e.kind === "GameResult").tags.includes("win-streak"));
assert(ensureEventLog(s).events.some((e) => e.preview && e.tags.includes("rivalry")), "rivalry weeks get a preview");
const beatTexts = socialEnginePosts(s).filter((p) => p.archetype === "beat").map((p) => p.body);
assert(new Set(beatTexts).size >= 4, "beat writer does not repeat itself week to week");
assert(socialPulse(s).fanScore > after.fanScore, "winning streak repairs fan score");

// Injuries emit once per spell, and a return closes it.
s.roster[1].injury = 6;
let injury = deriveRoundEvents(s, [], "inj-1");
assert.equal(injury.length, 1);
assert.equal(injury[0].severity, "major");
assert.equal(deriveRoundEvents(s, [], "inj-2").length, 0);
s.roster[1].injury = 0;
assert.equal(deriveRoundEvents(s, [], "inj-3")[0].kind, "InjuryReturn");

// Pre-existing injuries (imported IR) are baseline, and a heavy injury week is capped in the feed.
const fresh = career();
fresh.roster[0].injury = 8;
assert.equal(deriveRoundEvents(fresh, [], "base-1").length, 0, "imported IR is not news");
fresh.roster.slice(1).forEach((p) => (p.injury = 3));
const wave = deriveRoundEvents(fresh, [], "base-2");
assert.equal(wave.length, 3);
const medicalPosts = processSocialRound(fresh, wave);
assert.equal(new Set(medicalPosts.filter((p) => wave.some((e) => e.id === p.eventId)).map((p) => p.eventId)).size, 2, "at most two injury stories per round");

// Morale modifier is bounded.
assert.equal(moraleModifier({ chemistry: 99, drama: 0 }), 3);
assert.equal(moraleModifier({ chemistry: 10, drama: 100 }), -3);

// Unknown kinds are rejected.
assert.throws(() => emitGameEvent(s, "x", { kind: "Nonsense" }));

console.log("PASS: social engine grammar, archetype casting, sentiment/drama/chemistry, idempotent rounds, streaks, injuries and template rotation.");
