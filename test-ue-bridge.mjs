import assert from "node:assert/strict";
import { simulateExecution } from "./dist/engine/execution.mjs";
import { playExecutionMessage, cutsceneMessage, toUnreal, toUnrealYaw, validateMessage, YARD_CM, PROTOCOL } from "./dist/bridge/ue-protocol.mjs";

// Coordinate mapping: midfield is the origin, yards → centimetres, mirrored for the away direction.
assert.deepEqual(toUnreal({ x: 50, z: 0, y: 0 }), { X: 0, Y: 0, Z: 0 });
assert.deepEqual(toUnreal({ x: 60, z: 10, y: 1 }), { X: Math.round(10 * YARD_CM), Y: Math.round(10 * YARD_CM), Z: Math.round(YARD_CM) });
assert.deepEqual(toUnreal({ x: 60, z: 10 }, -1), { X: -Math.round(10 * YARD_CM), Y: -Math.round(10 * YARD_CM), Z: 0 });
assert.equal(toUnrealYaw(Math.PI / 2), 0, "running downfield faces +X");
assert.equal(Math.abs(toUnrealYaw(Math.PI / 2, -1)), 180);

// Real engine output converts into a frame-accurate, schema-shaped payload.
const players = (pos, n, ovr = 75) => Array.from({ length: n }, (_, i) => ({ id: `${pos}${i}`, name: `${pos} ${i}`, pos, ovr }));
const offense = { QB: players("QB", 1, 85), RB: players("RB", 1), WR: players("WR", 3), TE: players("TE", 1), OL: players("OL", 5) };
const defense = { DL: players("DL", 4), LB: players("LB", 3), CB: players("CB", 2), S: players("S", 2) };
const execution = simulateExecution({ playId: "t-1", seed: 1234, spot: 30, call: "Deep pass", coverage: "Cover 3", formation: "Shotgun spread", front: "4-3", personnel: "11", shell: "2-High", weather: "Clear", offensePlayers: offense, defensePlayers: defense });
const msg = playExecutionMessage(execution, { direction: 1, offenseTeam: 0, defenseTeam: 1 });
assert.equal(validateMessage(msg), null);
assert.equal(msg.protocol, PROTOCOL);
assert.equal(msg.type, "play.execution");
const p = msg.payload;
assert.equal(p.actors.length, execution.actors.length);
assert.equal(p.frames.length, execution.frames.length);
assert(p.frames.every((f) => f.actors.length === p.actors.length * p.frameStride && f.actors.every(Number.isInteger)));
assert.equal(p.result.kind, execution.result.kind, "bridge mirrors, never alters, the result");
assert(p.triggers.some((t) => t.montage === "AM_Snap"));
assert(p.triggers.every((t) => Number.isInteger(t.actor) && t.actor >= -1 && t.actor < p.actors.length));
assert(p.camera.shots[0].rig === "CR_Broadcast_HighSideline");
assert(JSON.stringify(msg).length < 1024 * 1024, "a play fits comfortably inside one message");

// Narrative events map to Level Sequences with bound cast slots; minor events are filtered.
const state = { coach: { name: "Avery Coach" }, roster: [{ id: "q", name: "Star QB", pos: "QB", ovr: 90 }] };
const title = cutsceneMessage({ id: "evt-9", kind: "Championship", team: 0, opponent: 5, score: [31, 17], tags: ["champion"], year: 2026, week: 21 }, state);
assert.equal(title.payload.sequence, "LS_Championship_Celebration");
assert.equal(title.payload.skippable, false);
assert.equal(title.payload.cast.find((c) => c.slot === "Star").name, "Star QB");
assert.equal(cutsceneMessage({ id: "evt-1", kind: "Injury", severity: "minor", team: 0 }, state), null);
assert.equal(cutsceneMessage({ id: "evt-2", kind: "GameResult", team: 0 }, state), null);

assert.equal(validateMessage({ protocol: "other" }), "Unsupported protocol.");

console.log("PASS: Unreal bridge coordinate mapping, play.execution payloads from real engine output, cutscene mapping and validation.");
