import assert from "node:assert/strict";
import { createRequire } from "node:module";
import fs from "node:fs";
const require = createRequire(import.meta.url);
const { createSignalling } = require("./desktop/pixel-stream.cjs");

// The relay follows Epic's signalling protocol end to end with a fake Unreal streamer.
const toPlayer = [];
const signalling = createSignalling({ port: 47911, onPlayerMessage: (m) => toPlayer.push(m) });
await signalling.start();
const fromRelay = [];
const streamer = new WebSocket(signalling.url());
streamer.onmessage = (e) => fromRelay.push(JSON.parse(e.data));
await new Promise((r, j) => { streamer.onopen = r; streamer.onerror = j; });
const until = async (check, label) => { for (let i = 0; i < 100 && !check(); i++) await new Promise((r) => setTimeout(r, 10)); assert(check(), label); };

await until(() => fromRelay.length >= 2, "streamer receives config and identify");
assert.deepEqual(fromRelay.map((m) => m.type), ["config", "identify"]);
streamer.send(JSON.stringify({ type: "endpointId", id: "GridironDemo" }));
await until(() => signalling.status().streamerId === "GridironDemo", "streamer id recorded");

// Messages before the page opens a view are rejected.
assert.equal(signalling.playerMessage({ type: "subscribe" }), false);
signalling.openPlayer();
assert.equal(toPlayer.at(-1).type, "config", "player receives config on open");
signalling.playerMessage({ type: "listStreamers" });
assert.deepEqual(toPlayer.at(-1), { type: "streamerList", ids: ["GridironDemo"] });
assert.equal(signalling.playerMessage({ type: "subscribe", streamerId: "GridironDemo" }), true);
await until(() => fromRelay.some((m) => m.type === "playerConnected"), "streamer told about the player");
assert.deepEqual(fromRelay.find((m) => m.type === "playerConnected"), { type: "playerConnected", playerId: "1", dataChannel: true, sfu: false, sendOffer: true });

// Offer from Unreal reaches the page without playerId; the answer goes back with it.
streamer.send(JSON.stringify({ type: "offer", playerId: "1", sdp: "v=0 offer" }));
await until(() => toPlayer.some((m) => m.type === "offer"), "offer relayed to the page");
assert.deepEqual(toPlayer.find((m) => m.type === "offer"), { type: "offer", sdp: "v=0 offer" });
signalling.playerMessage({ type: "answer", sdp: "v=0 answer" });
signalling.playerMessage({ type: "iceCandidate", candidate: { candidate: "candidate:1", sdpMid: "0", sdpMLineIndex: 0 } });
await until(() => fromRelay.some((m) => m.type === "iceCandidate"), "answer and ICE relayed to Unreal");
assert.deepEqual(fromRelay.find((m) => m.type === "answer"), { type: "answer", sdp: "v=0 answer", playerId: "1" });

// Ping/pong both sides; messages for other players and unknown page types are dropped.
streamer.send(JSON.stringify({ type: "ping", time: 1 }));
await until(() => fromRelay.some((m) => m.type === "pong"), "streamer ping answered");
const before = toPlayer.length;
streamer.send(JSON.stringify({ type: "iceCandidate", playerId: "7", candidate: {} }));
assert.equal(signalling.playerMessage({ type: "loadFile", path: "C:/secret" }), false);
await new Promise((r) => setTimeout(r, 50));
assert.equal(toPlayer.length, before, "nothing leaks across players or from unknown types");

// Closing the view tells Unreal; a dropped streamer tells the page.
signalling.closePlayer();
await until(() => fromRelay.some((m) => m.type === "playerDisconnected"), "streamer told the player left");
signalling.openPlayer();
signalling.playerMessage({ type: "subscribe" });
streamer.close();
await until(() => toPlayer.at(-1)?.type === "playerDisconnected" && !signalling.status().streamer, "page told the streamer left");
await signalling.stop();

// Unreal ignores a playerConnected sent before it has identified (endpointId), so a page that
// subscribes first must wait; found with the real renderer, where it meant no video at all.
const early = [];
const relay2 = createSignalling({ port: 47912, onPlayerMessage: () => {} });
await relay2.start();
relay2.openPlayer();
assert.equal(relay2.playerMessage({ type: "subscribe" }), true, "early subscribe is accepted");
const streamer2 = new WebSocket(relay2.url());
streamer2.onmessage = (e) => early.push(JSON.parse(e.data).type);
await new Promise((r) => (streamer2.onopen = r));
await until(() => early.includes("identify"), "second streamer identified");
await new Promise((r) => setTimeout(r, 50));
assert(!early.includes("playerConnected"), "no playerConnected before endpointId");
streamer2.send(JSON.stringify({ type: "endpointId", id: "DefaultStreamer" }));
await until(() => early.includes("playerConnected"), "pending subscribe sent once identified");
streamer2.close();
await relay2.stop();

// Desktop wiring: the page reaches the relay only through the preload, and the renderer starts
// off-screen pointed at the loopback signalling URL.
const main = fs.readFileSync("desktop/main.cjs", "utf8"), preload = fs.readFileSync("desktop/preload.cjs", "utf8");
assert.match(preload, /stream:\s*\{/);
assert.match(main, /ipcMain\.on\('stream:send'/);
assert.match(main, /-RenderOffScreen/);
assert.match(main, /-PixelStreamingConnectionURL=/);
console.log("PASS: Pixel Streaming signalling relay (config/identify, subscribe, offer/answer/ICE, ping, isolation) and desktop wiring.");
