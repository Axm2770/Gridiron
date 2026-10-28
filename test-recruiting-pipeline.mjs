import assert from "node:assert/strict";
import { scout } from "./dist/franchise/personnel.mjs";
import { ensureEventLog } from "./dist/franchise/event-bus.mjs";
import { socialEnginePosts } from "./dist/franchise/social-engine.mjs";
import { addToWatchlist, removeFromPipeline, moveStage, rankOnBoard, syncPipeline, processPipelineRound, pipelineView, talentRange, positionalNeed, nextAction, ensurePipeline } from "./dist/franchise/recruiting-pipeline.mjs";

globalThis.clubs ??= Array.from({ length: 32 }, (_, i) => [`T${i}`, `City ${i}`, `Club${i}`, `Division ${Math.floor(i / 4)}`]);

function career() {
  const prospect = (id, pos, ovr) => ({ id, name: `Prospect ${id}`, pos, ovr, age: 21, injury: 0, stats: {} });
  return {
    year: 2026,
    week: 0,
    phase: "offseason",
    team: 0,
    morale: 75,
    coach: { name: "Avery Coach" },
    roster: [{ id: "qb1", name: "Vet QB", pos: "QB", ovr: 85, age: 30, injury: 0, status: "active", stats: {} }],
    prospects: [prospect("p-qb", "QB", 74), prospect("p-wr", "WR", 70), prospect("p-cb", "CB", 66), prospect("p-ol", "OL", 62)],
    teams: Array.from({ length: 32 }, () => ({ w: 8, l: 9, pf: 300, pa: 310 })),
    schedule: [],
    franchise: {
      role: "GM",
      scoutPoints: 20,
      visits: [],
      reports: {},
      events: [],
      draftDevelopment: {},
      career: { reputation: 55, xp: 0 },
      clubs: Array.from({ length: 32 }, (_, id) => ({ id, staff: [], fanApproval: 65, owner: { patience: 60 }, players: [] })),
      office: { stories: [], messages: [], seen: [], rounds: [], step: 0, moodHistory: [] },
    },
  };
}

const s = career();

// Watchlist entry and the range narrowing as evidence accumulates.
addToWatchlist(s, "p-qb");
assert.throws(() => addToWatchlist(s, "p-qb"), /Already/);
assert.throws(() => addToWatchlist(s, "missing"), /unavailable/);
const before = talentRange(s, s.prospects[0]);
assert.equal(ensurePipeline(s).entries["p-qb"].stage, "watchlist");

// Gates: evidence is required before moving forward.
assert.throws(() => moveStage(s, "p-qb", "scouted"), /confidence/);
assert.throws(() => moveStage(s, "p-qb", "board"), /scouted/);
assert.throws(() => moveStage(s, "p-qb", "drafted"), /selected/);
assert.equal(nextAction(s, ensurePipeline(s).entries["p-qb"]).kind, "Regional report");

// Real scouting spends real points; sync auto-advances the earned stage.
scout(s, "p-qb", "Regional report");
syncPipeline(s);
assert.equal(s.franchise.scoutPoints, 19);
assert.equal(ensurePipeline(s).entries["p-qb"].stage, "scouted");
const after = talentRange(s, s.prospects[0]);
assert(after.high - after.low < before.high - before.low, "the talent range narrows with confidence");
assert.throws(() => moveStage(s, "p-qb", "interviewed"), /private visit/);
scout(s, "p-qb", "Private visit");
syncPipeline(s);
assert.equal(ensurePipeline(s).entries["p-qb"].stage, "interviewed");
assert.equal(s.franchise.scoutPoints, 16);

// Big Board ranking, and sync never pulls a prospect off the board.
addToWatchlist(s, "p-wr");
scout(s, "p-wr", "Regional report");
moveStage(s, "p-qb", "board");
moveStage(s, "p-wr", "board");
assert.deepEqual(ensurePipeline(s).board, ["p-qb", "p-wr"]);
rankOnBoard(s, "p-wr", -1);
assert.deepEqual(ensurePipeline(s).board, ["p-wr", "p-qb"]);
syncPipeline(s);
assert.equal(ensurePipeline(s).entries["p-qb"].stage, "board");
assert.deepEqual(pipelineView(s).columns.board.map((c) => c.id), ["p-wr", "p-qb"]);

// Positional need reflects the actual roster.
assert.equal(positionalNeed(s, "QB").need, "High", "one QB against a depth target of three");
assert.equal(positionalNeed(s, "K").need, "Moderate");
s.roster.push(...["k1", "k2"].map((id) => ({ id, name: id, pos: "K", ovr: 70, age: 28, injury: 0, status: "active", stats: {} })));
assert.equal(positionalNeed(s, "K").need, "Depth");

// Removal and lost targets.
addToWatchlist(s, "p-cb");
removeFromPipeline(s, "p-cb");
assert.equal(ensurePipeline(s).entries["p-cb"], undefined);
addToWatchlist(s, "p-ol");
const taken = s.prospects.find((p) => p.id === "p-ol");
s.prospects = s.prospects.filter((p) => p.id !== "p-ol");
s.franchise.clubs[7].players.push(taken);
syncPipeline(s);
assert.equal(ensurePipeline(s).lost[0].team, 7, "a target taken by another club is recorded");

// Our pick: moves to Drafted and the public reacts once.
const pick = s.prospects.find((p) => p.id === "p-qb");
s.prospects = s.prospects.filter((p) => p.id !== "p-qb");
s.roster.push({ ...pick, status: "active" });
s.franchise.draftDevelopment["p-qb"] = { playerId: "p-qb", name: pick.name, year: 2027, round: 1, startAbility: 74, scouted: true, credited: false };
const reactions = syncPipeline(s);
assert.equal(ensurePipeline(s).entries["p-qb"].stage, "drafted");
assert(reactions.length >= 3, "a first-round pick draws reactions");
assert(ensureEventLog(s).events.some((e) => e.kind === "DraftPick" && e.tags.includes("on-our-board")));
assert.equal(syncPipeline(s).length, 0, "the pick is announced only once");
assert.throws(() => removeFromPipeline(s, "p-qb"), /cannot/);

// A stalled premium pick becomes a bust after two seasons, exactly once.
s.year = 2027;
s.phase = "season";
assert.equal(processPipelineRound(s).length, 0, "one season is too early to judge");
s.year = 2028;
assert.equal(processPipelineRound(s).length, 0, "mid-way through the second season is still too early");
s.phase = "offseason";
const busts = processPipelineRound(s);
assert.equal(busts.length, 1);
assert.equal(busts[0].kind, "DraftBust");
assert.equal(processPipelineRound(s).length, 0);
assert(socialEnginePosts(s).some((p) => p.archetype === "hottake" && /DraftPick|draft/i.test(p.topic + p.body)));

console.log("PASS: recruiting pipeline stages, evidence gates, real scouting costs, range narrowing, board ranking, needs, lost targets, draft reactions and bust detection.");
