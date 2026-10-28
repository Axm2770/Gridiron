// Renderer side of the Unreal bridge. Observes executions and the narrative event log and
// forwards render instructions. Never mutates game state; a missing transport is a no-op.
import { envelope, playExecutionMessage, cutsceneMessage, stadiumMessage, TEAM_COLORS, validateMessage } from "./ue-protocol.mjs";
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
    lastStadium = "";
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
      const d = execution.context?.decision;
      send(
        playExecutionMessage(execution, {
          direction: d && team === d.b ? -1 : 1,
          offenseTeam: team,
          defenseTeam: d ? (team === d.a ? d.b : d.a) : null,
        }),
      );
    } catch (e) {
      window.UnrealBridge.lastError = e.message;
    }
  };
  link.onMessage?.((msg) => {
    if (msg.type === "ue.error") window.UnrealBridge.lastError = msg.payload?.message ?? "Unreal reported an error.";
    if (msg.type === "ue.cutscene.finished") document.dispatchEvent(new CustomEvent("gridiron:cutscene-finished", { detail: msg.payload }));
  });
  const previous = render;
  render = function () {
    previous();
    if (!state.franchise) return;
    for (const e of eventsSince(state, cursor)) {
      const msg = cutsceneMessage(e, state);
      if (msg) send(msg);
    }
    cursor = Number(state.franchise.eventLog?.serial ?? cursor);
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
