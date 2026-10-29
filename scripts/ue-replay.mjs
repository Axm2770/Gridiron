// Streams engine-simulated plays to an Unreal client without running the game, so the UE5
// renderer can be developed and tested on its own. Hosts the same loopback relay the desktop
// app uses (desktop/ue-bridge.cjs) and sends the real telemetry builders' output.
//
//   npm run ue:replay                 # one play every 8 s on ws://127.0.0.1:47800
//   npm run ue:replay -- --once       # print one play's messages as JSON and exit
//   npm run ue:replay -- --every 5 --port 47800 --seed 42
import { createRequire } from "node:module";
import { simulateExecution } from "../dist/engine/execution.mjs";
import { envelope, TEAM_COLORS } from "../dist/bridge/ue-protocol.mjs";
import { playCallMessage, playerFrameMessages, collisionEvents, matchStateMessage, cinematicTriggerMessage } from "../dist/bridge/ue-telemetry.mjs";

const require = createRequire(import.meta.url),
  { createBridge } = require("../desktop/ue-bridge.cjs"),
  arg = (name, fallback) => {
    const i = process.argv.indexOf(`--${name}`);
    return i > 0 ? process.argv[i + 1] : fallback;
  },
  port = Number(arg("port", 47800)),
  every = Number(arg("every", 8)) * 1000,
  once = process.argv.includes("--once");
let seed = Number(arg("seed", 1));

globalThis.clubs ??= Array.from({ length: 32 }, (_, i) => [`T${i}`, `City ${i}`, `Team ${i}`, `Division ${Math.floor(i / 4)}`]);
const HOME = 16,
  AWAY = 13,
  CALLS = ["Inside run", "Outside run", "Short pass", "Deep pass", "Play action", "Screen"],
  COVERAGES = ["Cover 2", "Cover 3", "Quarters", "Man coverage"];
const squad = (pos, n, ovr) => Array.from({ length: n }, (_, i) => ({ id: `${pos}${i}`, name: `${pos} ${i + 1}`, pos, ovr, jersey: 10 + i * 7 }));
const offense = { QB: squad("QB", 1, 86), RB: squad("RB", 1, 80), WR: squad("WR", 3, 82), TE: squad("TE", 1, 78), OL: squad("OL", 5, 79) };
const defense = { DL: squad("DL", 4, 80), LB: squad("LB", 3, 78), CB: squad("CB", 3, 79), S: squad("S", 2, 78) };
const live = { a: HOME, b: AWAY, plays: 1, quarter: 1, clock: 900, score: [0, 0], weather: "Clear", offense: "Shotgun spread", defense: "Nickel", personnel: "11", shell: "2-High" };
const fakeState = { year: 2026, week: 0, live, coach: { name: "Demo Coach" }, roster: [], franchise: { clubs: [] } };

function playMessages() {
  const call = CALLS[seed % CALLS.length],
    coverage = COVERAGES[seed % COVERAGES.length],
    spot = 20 + (seed * 7) % 60,
    execution = simulateExecution({ playId: `replay-${seed}`, seed, spot, call, coverage, formation: live.offense, front: live.defense, personnel: "11", shell: "2-High", weather: live.weather, offensePlayers: offense, defensePlayers: defense });
  execution.context = { down: 1 + (seed % 3), toGo: 10, spot, quarter: live.quarter, clock: live.clock, score: [...live.score], decision: { formation: live.offense } };
  const ctx = { direction: seed % 2 ? 1 : -1, offenseTeam: HOME, defenseTeam: AWAY, match: { ...live, defCall: coverage } };
  seed++;
  live.plays++;
  live.clock = Math.max(0, live.clock - 35);
  return { execution, messages: [playCallMessage(execution, ctx), ...playerFrameMessages(execution, ctx), ...collisionEvents(execution, ctx)] };
}

if (once) {
  console.log(JSON.stringify(playMessages().messages, null, 2));
  process.exit(0);
}

const bridge = createBridge({ port, log: (m) => console.log(`[relay] ${m}`), onUnrealMessage: (m) => console.log(`[unreal] ${m.type} ${JSON.stringify(m.payload)}`) });
await bridge.start();
console.log(`Gridiron replay: streaming a play every ${every / 1000}s on ws://127.0.0.1:${port}. Press Play in the GridironDemo editor. Ctrl+C to stop.`);

let introduced = false;
setInterval(() => {
  if (!bridge.status().clients) return;
  if (!introduced) {
    introduced = true;
    bridge.broadcast(envelope("session.start", { careerId: "replay", team: HOME, teamName: "Team 16", colors: TEAM_COLORS, coach: { name: "Demo Coach" } }));
    bridge.broadcast(matchStateMessage(fakeState));
  }
  const { execution, messages } = playMessages();
  for (const m of messages) bridge.broadcast(m);
  console.log(`[play] ${execution.call} → ${execution.result.kind} ${execution.result.yards} yd · ${messages.length} messages`);
  // Every sixth play, trigger a cinematic to exercise the sequence manager.
  if (seed % 6 === 0) {
    const cine = cinematicTriggerMessage({ id: `replay-cine-${seed}`, kind: "ClutchFinish", team: HOME, opponent: AWAY, score: [24, 21], year: 2026, week: 0 }, fakeState);
    if (cine) bridge.broadcast(cine);
  }
}, every);
