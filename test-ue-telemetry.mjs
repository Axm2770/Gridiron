import assert from "node:assert/strict";
import fs from "node:fs";
import { simulateExecution } from "./dist/engine/execution.mjs";
import { validateMessage, YARD_CM, MESSAGE_TYPES } from "./dist/bridge/ue-protocol.mjs";
import { playCallMessage, coordinateFrames, playerFrameMessages, collisionEvents, cinematicTriggerMessage, matchStateMessage, matchFlowState, ROLE_MASS } from "./dist/bridge/ue-telemetry.mjs";

globalThis.clubs ??= Array.from({ length: 32 }, (_, i) => [`T${i}`, `City ${i}`, `Club${i}`, `Division ${Math.floor(i / 4)}`]);

const players = (pos, n, ovr = 75) => Array.from({ length: n }, (_, i) => ({ id: `${pos}${i}`, name: `${pos} ${i}`, pos, ovr, jersey: 10 + i }));
const offense = { QB: players("QB", 1, 85), RB: players("RB", 1), WR: players("WR", 3), TE: players("TE", 1), OL: players("OL", 5) };
const defense = { DL: players("DL", 4, 80), LB: players("LB", 3, 80), CB: players("CB", 3), S: players("S", 2) };
const play = (seed, call) => simulateExecution({ playId: `t-${seed}`, seed, spot: 30, call, coverage: "Cover 3", formation: "Shotgun spread", front: "4-3", personnel: "11", shell: "2-High", weather: "Clear", offensePlayers: offense, defensePlayers: defense });
const schema = JSON.parse(fs.readFileSync("dist/bridge/ue-schema.json", "utf8"));
const requireFields = (obj, def) => def.required.forEach((k) => assert(k in obj, `missing ${k}`));

// The schema and protocol agree on the message vocabulary.
for (const t of ["play.call", "player.frames", "physics.collision", "cinematic.trigger", "match.state", "ue.flow.state"]) {
  assert(MESSAGE_TYPES.includes(t), t);
  assert(schema.properties.type.enum.includes(t), t);
}

// PlayCallData: full roster with physical profile, schema-complete.
const pass = play(1234, "Deep pass");
const call = playCallMessage(pass, { offenseTeam: 16, defenseTeam: 13, direction: 1, match: { offense: "Shotgun spread", defense: "4-3", defCall: "Cover 3", personnel: "11", shell: "2-High", weather: "Clear" } });
assert.equal(validateMessage(call), null);
requireFields(call.payload, schema.$defs.PlayCallData);
assert.equal(call.payload.roster.length, 22);
assert(call.payload.roster.every((r, i) => r.index === i && r.massKg > 0 && r.heightCm > 0 && (i < 11 ? r.team === 16 : r.team === 13)));
assert.equal(call.payload.offense.call, "Deep pass");

// PlayerCoordinateFrame: one per engine frame, chunked, last chunk final, velocities consistent.
const frames = coordinateFrames(pass, 1);
assert.equal(frames.length, pass.frames.length);
const chunks = playerFrameMessages(pass, { direction: 1, chunk: 12 });
assert.equal(chunks.reduce((n, c) => n + c.payload.frames.length, 0), frames.length);
assert(chunks.at(-1).payload.final && chunks.slice(0, -1).every((c) => !c.payload.final));
chunks.forEach((c, i) => assert.equal(c.payload.chunk, i));
requireFields(frames[3], schema.$defs.PlayerCoordinateFrame);
requireFields(frames[3].players[0], schema.$defs.PlayerCoordinateFrame.properties.players.items);
const k = Math.floor(frames.length / 2),
  wr = 2,
  dt = frames[k + 1].t - frames[k - 1].t,
  expectVx = (frames[k + 1].players[wr].x - frames[k - 1].players[wr].x) / dt;
assert(Math.abs(frames[k].players[wr].vx - expectVx) <= Math.abs(expectVx) * 0.02 + 2, "velocity is the central difference of positions");
// Away possession mirrors space so both teams attack the correct end zone.
const mirrored = coordinateFrames(pass, -1);
assert.equal(mirrored[k].players[wr].x, -frames[k].players[wr].x);
assert.equal(mirrored[k].players[wr].vx, -frames[k].players[wr].vx);
assert.equal(frames[0].players[0].x, Math.round((pass.frames[0].actors[0].x - 50) * YARD_CM));
// Ball carrier: the passer until the catch/interception, then the receiver.
const caught = pass.events.find((e) => e.type === "CatchCompleted" || e.type === "Interception");
if (caught) {
  assert.equal(frames.find((f) => f.t < caught.time).ball.carrier, 0);
  assert.equal(frames.at(-1).ball.carrier, pass.result.carrier);
}

// PhysicsCollisionEvent: derived from engine events and line contact, physically sensible.
let tackleSeen = false,
  blockSeen = false;
for (let seed = 1; seed < 40 && !(tackleSeen && blockSeen); seed++) {
  const ex = play(seed, seed % 2 ? "Inside run" : "Short pass");
  const hits = collisionEvents(ex, { direction: 1 });
  for (const h of hits) {
    const c = h.payload;
    assert.equal(validateMessage(h), null);
    requireFields(c, schema.$defs.PhysicsCollisionEvent);
    assert(["Tackle", "Sack", "Block", "BrokenTackle"].includes(c.kind));
    assert(["light", "solid", "big"].includes(c.severity));
    assert(c.impulse >= 0 && Number.isInteger(c.impulse));
    assert(Math.abs(Math.hypot(c.normal.x, c.normal.y) - 1) < 0.01 || (c.normal.x === 0 && c.normal.y === 0), "unit normal");
    assert(c.instigator >= 0 && c.instigator < 22 && c.target >= 0 && c.target < 22 && c.instigator !== c.target);
    if (c.kind === "Tackle") {
      tackleSeen = true;
      assert(c.instigator >= 11, "defender makes the tackle");
      assert.equal(c.target, ex.result.carrier);
    }
    if (c.kind === "Block") {
      blockSeen = true;
      assert(c.instigator >= 5 && c.instigator <= 9 && c.target >= 11 && c.target <= 14, "offensive lineman engages a defensive lineman");
      assert(c.t <= 2.5);
    }
  }
  assert(hits.every((h, i) => i === 0 || hits[i - 1].payload.t <= h.payload.t), "collisions are time-ordered");
}
assert(tackleSeen && blockSeen, "tackles and blocks are produced across plays");
assert(ROLE_MASS.OL > ROLE_MASS.CB, "linemen carry more mass into contact");

// CinematicTrigger: template + personalisation block.
const s = { coach: { name: "Coach", appearance: { skin: "#b77b51" } }, roster: [{ id: "w1", name: "Star WR", pos: "WR", ovr: 92, jersey: 88 }], franchise: { clubs: Array.from({ length: 32 }, (_, id) => ({ id, uniform: id === 16 ? { primary: "#29588a" } : undefined })) } };
const title = cinematicTriggerMessage({ id: "evt-1", kind: "Championship", team: 16, opponent: 13, score: [31, 24], year: 2026, week: 21 }, s, { environment: { timeOfDay: "Night", weather: "Clear" } });
assert.equal(validateMessage(title), null);
requireFields(title.payload, schema.$defs.CinematicTrigger);
assert.equal(title.payload.template, "LS_Championship_Celebration");
assert.equal(title.payload.blocking, true);
assert.equal(title.payload.teams.home.uniform.jersey, "#29588a");
assert.equal(title.payload.cast.find((c) => c.slot === "Star").number, 88);
assert.equal(title.payload.environment.timeOfDay, "Night");
assert.equal(cinematicTriggerMessage({ id: "e2", kind: "PressConference", team: 16 }, s).payload.blocking, false);
assert.equal(cinematicTriggerMessage({ id: "e3", kind: "GameResult", team: 16 }, s), null);

// MatchState: flow derivation and preload hints.
assert.equal(matchFlowState({}), "Hub");
const live = { year: 2026, week: 3, live: { a: 16, b: 13, plays: 0, quarter: 1, clock: 900, score: [0, 0] }, franchise: s.franchise };
assert.equal(matchFlowState(live), "PreGame");
assert.equal(matchFlowState({ live: { ...live.live, plays: 12 } }), "Live");
assert.equal(matchFlowState({ live: { ...live.live, plays: 60, halftime: true } }), "Halftime");
assert.equal(matchFlowState({ live: { ...live.live, plays: 130, finished: true } }), "PostGame");
const ms = matchStateMessage(live);
assert.equal(validateMessage(ms), null);
assert.equal(ms.payload.matchId, "2026-3-16-13");
assert(ms.payload.preload.includes("Stadium_T16") && ms.payload.preload.includes("Uniform_T13"));

// Whole plays stay well inside the relay's 4 MB limit.
assert(JSON.stringify([call, ...chunks, ...collisionEvents(pass)]).length < 400 * 1024);

console.log("PASS: UE5 telemetry — PlayCallData, chunked PlayerCoordinateFrames with consistent velocities and mirroring, physics collisions (tackles, blocks), cinematic personalisation and match flow states.");
