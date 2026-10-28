// Renderer side of the Unreal bridge. Observes executions and the narrative event log and
// forwards render instructions. Never mutates game state; a missing transport is a no-op.
import { envelope, stadiumMessage, TEAM_COLORS, validateMessage } from "./ue-protocol.mjs";
import { playCallMessage, playerFrameMessages, collisionEvents, cinematicTriggerMessage, matchStateMessage } from "./ue-telemetry.mjs";
import { timeOfDay } from "../presentation/stadium-pro.mjs";
import { eventsSince } from "../franchise/event-bus.mjs";
import { environment } from "../franchise/depth-systems.mjs";

// Desktop: preload exposes window.gridironUE over IPC (the renderer CSP blocks ws://).
// Browser dev: opt in with localStorage "gridiron-ue" = "ws://127.0.0.1:47800".
function transport() {
  if (window.gridironUE?.send) return window.gridironUE;
  let url = null;
  try {
    url = localStorage.getItem("gridiron-ue");
  } catch {}
  if (!url || !/^ws:\/\/(127\.0\.0\.1|localhost)(:\d+)?\/?$/.test(url)) return null;
  let socket = null,
    queue = [];
  const listeners = new Set();
  const open = () => {
    socket = new WebSocket(url);
    socket.onopen = () => queue.splice(0).forEach((m) => socket.send(m));
    socket.onmessage = (e) => {
      try {
        const msg = JSON.parse(e.data);
        if (!validateMessage(msg)) listeners.forEach((fn) => fn(msg));
      } catch {}
    };
    socket.onclose = () => setTimeout(open, 3000);
  };
  open();
  return {
    send: (msg) => {
      const text = JSON.stringify(msg);
      socket?.readyState === 1 ? socket.send(text) : queue.push(text) && queue.splice(0, queue.length - 20);
    },
    onMessage: (fn) => listeners.add(fn),
    status: () => ({ connected: socket?.readyState === 1, clients: socket?.readyState === 1 ? 1 : 0 }),
  };
}

export function installUnrealBridge() {
  const link = transport();
  window.UnrealBridge = { enabled: !!link, status: () => link?.status?.() ?? { connected: false, clients: 0 }, lastError: null };
  if (!link) return;
  const send = (msg) => {
    try {
      link.send(msg);
    } catch (e) {
      window.UnrealBridge.lastError = e.message;
    }
  };
  let cursor = Number(state.franchise?.eventLog?.serial ?? 0),
    lastStadium = "",
    lastFlow = "";
  send(
    envelope("session.start", {
      careerId: window.__gridironCareerId ?? null,
      team: state.team,
      teamName: clubs[state.team]?.[2],
      colors: TEAM_COLORS,
      coach: state.coach ? { name: state.coach.name, style: state.coach.style ?? null } : null,
    }),
  );
  const record = window.franchiseRecordExecution;
  window.franchiseRecordExecution = (execution, team) => {
    record?.(execution, team);
    try {
      // One snap = PlayCallData, then PlayerCoordinateFrame chunks, then timed collision events.
      const d = execution.context?.decision,
        ctx = { direction: d && team === d.b ? -1 : 1, offenseTeam: team, defenseTeam: d ? (team === d.a ? d.b : d.a) : -1, match: state.live || {} };
      send(playCallMessage(execution, ctx));
      for (const msg of playerFrameMessages(execution, ctx)) send(msg);
      for (const msg of collisionEvents(execution, ctx)) send(msg);
    } catch (e) {
      window.UnrealBridge.lastError = e.message;
    }
  };
  link.onMessage?.((msg) => {
    if (msg.type === "ue.error") window.UnrealBridge.lastError = msg.payload?.message ?? "Unreal reported an error.";
    if (msg.type === "ue.cutscene.finished") document.dispatchEvent(new CustomEvent("gridiron:cutscene-finished", { detail: msg.payload }));
    if (msg.type === "ue.flow.state") window.UnrealBridge.flowState = msg.payload?.state ?? null;
  });
  const previous = render;
  render = function () {
    previous();
    if (!state.franchise) return;
    for (const e of eventsSince(state, cursor)) {
      const msg = cinematicTriggerMessage(e, state, { environment: { timeOfDay: timeOfDay(state.live), weather: state.live?.weather } });
      if (msg) send(msg);
    }
    cursor = Number(state.franchise.eventLog?.serial ?? cursor);
    // Flow transitions (Hub → PreGame → Live → Halftime → PostGame) let Unreal stream assets ahead.
    const flow = matchStateMessage(state),
      flowKey = JSON.stringify([flow.payload.state, flow.payload.matchId]);
    if (flowKey !== lastFlow) {
      lastFlow = flowKey;
      send(flow);
    }
    if (state.live) {
      const msg = stadiumMessage(state, state.live, environment(state, state.live)),
        key = JSON.stringify([msg.payload.quarter, msg.payload.score, msg.payload.weather, msg.payload.crowd]);
      if (key !== lastStadium) {
        lastStadium = key;
        send(msg);
      }
    }
  };
}
