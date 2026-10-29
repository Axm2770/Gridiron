import assert from "node:assert/strict";
import { createRequire } from "node:module";
import net from "node:net";
import crypto from "node:crypto";
import fs from "node:fs";
const require = createRequire(import.meta.url),
  { createBridge, validate, encodeFrame, decodeFrames, PROTOCOL } = require("./desktop/ue-bridge.cjs");

const msg = (type, payload = {}) => ({ protocol: PROTOCOL, type, seq: 1, sentAt: 0, payload });
assert(validate(msg("play.execution"), false));
assert(!validate(msg("play.execution"), true), "renderer message types cannot arrive from Unreal");
assert(validate(msg("ue.ready"), true));
assert(validate(msg("ue.flow.state"), true), "Unreal reports its flow state");
for (const t of ["play.call", "player.frames", "physics.collision", "cinematic.trigger", "match.state"]) assert(validate(msg(t), false) && !validate(msg(t), true), t);
assert(!validate({ ...msg("ue.ready"), protocol: "x" }, true));
assert.equal(encodeFrame("hi")[0], 0x81);
const big = encodeFrame("x".repeat(70000));
assert.equal(big[1], 127, "64-bit length for large frames");

// Masked client frame round-trip; unmasked client frames are rejected.
const mask = Buffer.from([1, 2, 3, 4]),
  frameFrom = (text) => {
    const body = Buffer.from(text);
    return Buffer.concat([Buffer.from([0x81, 0x80 | body.length]), mask, Buffer.from(body.map((b, i) => b ^ mask[i & 3]))]);
  };
assert.equal(decodeFrames(frameFrom('{"hello":1}')).frames[0].payload.toString(), '{"hello":1}');
assert.throws(() => decodeFrames(Buffer.from([0x81, 2, 104, 105])), /masked/);

// End-to-end over loopback: an Unreal-like client connects, receives a broadcast and reports back.
const received = [];
const bridge = createBridge({ port: 47891, onUnrealMessage: (m) => received.push(m) });
await bridge.start();
const socket = net.connect(47891, "127.0.0.1");
await new Promise((r) => socket.once("connect", r));
const key = crypto.randomBytes(16).toString("base64");
socket.write(`GET / HTTP/1.1\r\nHost: 127.0.0.1\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Key: ${key}\r\nSec-WebSocket-Version: 13\r\n\r\n`);
const handshake = await new Promise((r) => socket.once("data", (d) => r(d.toString())));
assert.match(handshake, /101 Switching Protocols/);
const inbound = new Promise((r) => socket.once("data", r));
assert(bridge.broadcast(msg("stadium.state", { homeTeam: 0, weather: "Clear", crowd: 80 })));
assert(!bridge.broadcast(msg("ue.ready")), "Unreal-only types are never relayed to Unreal");
const data = await inbound;
assert.equal(JSON.parse(data.subarray(2).toString()).type, "stadium.state");
socket.write(frameFrom(JSON.stringify(msg("ue.cutscene.finished", { eventId: "evt-1" }))));
await new Promise((r) => setTimeout(r, 50));
assert.equal(received[0]?.payload.eventId, "evt-1");
assert.equal(bridge.status().clients, 1);
socket.destroy();
await bridge.stop();

const main = fs.readFileSync("desktop/main.cjs", "utf8"),
  preload = fs.readFileSync("desktop/preload.cjs", "utf8");
assert(main.includes("preload:path.join(__dirname,'preload.cjs')") && main.includes("sandbox:true"), "preload keeps the sandbox");
assert(main.includes("event.sender===mainWindow?.webContents"), "only the game window may relay");
assert(!/require\('node:/.test(preload), "preload exposes no Node APIs");
console.log("PASS: Unreal loopback relay validation, RFC 6455 framing, end-to-end broadcast/report and sandboxed preload.");

// The standalone replay tool emits a schema-valid play (call → frames → collisions) without the game.
const { execFileSync } = await import("node:child_process");
const replay = JSON.parse(execFileSync(process.execPath, ["scripts/ue-replay.mjs", "--once", "--seed", "7"], { encoding: "utf8" }));
assert.equal(replay[0].type, "play.call");
assert.equal(replay[0].payload.roster.length, 22);
assert(replay.some((m) => m.type === "player.frames" && m.payload.final), "final frame chunk present");
assert(replay.every((m) => validate(m, false)), "every replay message passes the relay's validation");
console.log("PASS: ue:replay streams schema-valid telemetry without the game.");

// The desktop app launches the packaged renderer directly: fixed arguments, no shell, only from
// the install folder or an explicit GRIDIRON_UE_EXE.
const mainSource = fs.readFileSync("desktop/main.cjs", "utf8");
assert.match(mainSource, /spawn\(exe,\['-windowed','-ResX=1600','-ResY=900'\],\{detached:true,stdio:'ignore',shell:false\}\)/);
assert.match(mainSource, /path\.join\(app\.getPath\('userData'\),'renderer','GridironDemo\.exe'\)/);
console.log("PASS: 3D match view launch is shell-free with fixed arguments.");
