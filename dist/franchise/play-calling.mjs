// Shared playcalling rules for live coaching and the fast simulation worker.
// Pure functions over the match object; no DOM, no state access.

export const SPECIAL_CALLS = ["Punt", "Field goal"];
export const DEFAULT_CALL = "Quick pass";

// A call picked from the sheet since the last snap. Older selections only repeat on downs 1-3.
export const callIsFresh = (m) =>
  Number.isInteger(m?.callSerial) && m.callSerial === (m.plays || 0);

// The user's manual call for this snap, or null when the staff must decide.
// "Repeat selected play" repeats scrimmage plays on early downs only: a punt or field goal is a
// one-snap special-teams call, and fourth down is always a fresh decision. Without this a
// selected Punt repeated on every down (0-104 in testing) and a selected run went for it on
// every fourth down from its own territory.
export function manualCall(m) {
  const call = m?.call;
  if (!call) return null;
  if (callIsFresh(m)) return call;
  if (SPECIAL_CALLS.includes(call)) return null;
  if (m.down === 4) return null;
  return call;
}

// Tempo is a sideline instruction for the user's own offense. The opponent's possessions run at
// a normal pace, so a trailing user's hurry-up (or a chewing lead) never speeds up the other side.
export function withPossessionTempo(m, own, apply) {
  const tempo = m.tempo;
  if (!own) m.tempo = "Normal";
  const next = apply(m);
  m.tempo = tempo;
  if (next && next !== m) next.tempo = tempo;
  return next;
}

// Saves from 0.28 and earlier could keep a special-teams call selected between snaps.
export function repairLiveCall(m) {
  if (!m || typeof m !== "object") return false;
  if (!m.call || (SPECIAL_CALLS.includes(m.call) && !callIsFresh(m))) {
    m.call = DEFAULT_CALL;
    return true;
  }
  return false;
}

// Deterministic per-snap roll, so a simulated game replays identically from its seed.
function roll(m) {
  let s = ((m.engine?.seed ?? 0) ^ Math.imul((m.plays || 0) + 1, 0x9e3779b1)) >>> 0;
  s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
  return s / 4294967296;
}
// Early-down mixes. The engine rewards deep shots and play action heavily, so a philosophy tilts
// the mix instead of replacing it: Balanced runs every third snap with a 12% shot rate (about 22
// points and 340 yards per team across a season, see test-user-team-scoring.mjs).
const STYLE_MIX = {
  Balanced: { runEvery: 3, deep: 0.06, action: 0.06 },
  "Run-first": { runEvery: 2, deep: 0.03, action: 0.12 },
  "Vertical offense": { runEvery: 4, deep: 0.12, action: 0.04 },
};
// The staff's call for a snap, shared by live coaching (staff or head-coach calling) and the
// fast simulation worker so both paths score alike.
export function staffDecision(m, { style = "Balanced", directives = {} } = {}) {
  if (m.down === 4) {
    const late = m.quarter >= 4 && m.clock < 180,
      losing = m.score[m.poss] < m.score[1 - m.poss];
    return late && losing && m.spot < 60 ? "Quick pass" : m.spot >= 60 ? "Field goal" : "Punt";
  }
  if (directives?.feedRB && m.plays % 3 !== 0) return "Inside run";
  if (directives?.protectQB) return "Quick pass";
  const mix = STYLE_MIX[style] || STYLE_MIX.Balanced,
    r = roll(m);
  if (m.plays % mix.runEvery === 0) return "Inside run";
  return r < mix.deep ? "Deep pass" : r < mix.deep + mix.action ? "Play action" : "Quick pass";
}

// In-game fatigue floor for live coaching (engine-bridge.mjs drains on-field players per snap).
export const LIVE_FITNESS_FLOOR = 60;
// Up to 0.28 live coaching drained every starter to 45% condition each game, and weekly recovery
// could not keep up, so the club played every later game (simulated ones included) exhausted.
// One-time, idempotent repair: lift the club's condition to a normal game-week level.
export function repairLiveFatigue(s) {
  const f = s?.franchise;
  if (!f || f.repairs?.liveFatigue) return false;
  for (const p of s.roster || [])
    if (Number.isFinite(p.fitness) && p.fitness < 85) p.fitness = 85;
  (f.repairs ??= {}).liveFatigue = true;
  return true;
}
