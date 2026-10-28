// gridiron.ue/1 telemetry stream for the UE5 match renderer: PlayCallData, PlayerCoordinateFrame
// batches, PhysicsCollisionEvent, CinematicTrigger and MatchState. Everything is derived from
// the deterministic execution the rules engine already applied; Unreal never decides outcomes.
import { envelope, toUnreal, toUnrealYaw, YARD_CM, TEAM_COLORS, CUTSCENES } from "./ue-protocol.mjs";

// Representative body masses (kg) drive impulse magnitudes for hit reactions.
export const ROLE_MASS = { QB: 102, RB: 97, WR: 90, TE: 113, OL: 141, DL: 132, LB: 109, CB: 87, S: 93, K: 86, P: 90 };
export const ROLE_HEIGHT = { QB: 191, RB: 180, WR: 185, TE: 196, OL: 196, DL: 193, LB: 188, CB: 180, S: 183, K: 183, P: 185 };
const OL = [5, 6, 7, 8, 9],
  DL = [11, 12, 13, 14];

const teamName = (s, t) => s?.franchise?.clubs?.[t]?.identity?.name || globalThis.clubs?.[t]?.[2] || `Team ${t + 1}`;

/* ------------------------------------------------------------- PlayCallData */

export function playCallMessage(execution, { match = {}, offenseTeam = -1, defenseTeam = -1, direction = 1, coverage = null } = {}) {
  const c = execution.context || {};
  return envelope("play.call", {
    playId: execution.playId,
    seed: execution.seed,
    offenseTeam,
    defenseTeam,
    direction,
    offense: { call: execution.call, formation: c.decision?.formation ?? match.offense ?? null, personnel: match.personnel ?? "11", tempo: match.tempo ?? "Normal" },
    defense: { front: match.defense ?? null, coverage: coverage ?? match.defCall ?? null, shell: match.shell ?? "2-High" },
    situation: { down: c.down ?? null, toGo: c.toGo ?? null, spot: c.spot ?? null, quarter: c.quarter ?? null, clock: c.clock ?? null, score: c.score ?? null },
    weather: match.weather ?? "Clear",
    duration: execution.duration,
    tickRate: execution.tickRate,
    roster: execution.actors.map((a, i) => ({
      index: i,
      id: a.id,
      name: a.name,
      role: a.role,
      jersey: a.jersey ?? -1,
      side: i < 11 ? "offense" : "defense",
      team: i < 11 ? offenseTeam : defenseTeam,
      heightCm: ROLE_HEIGHT[a.role] ?? 185,
      massKg: ROLE_MASS[a.role] ?? 100,
    })),
  });
}

/* --------------------------------------------------- PlayerCoordinateFrame */

// Velocities come from central differences of the authoritative positions, so Unreal can do
// Hermite interpolation and short dead-reckoning without inventing motion.
export function coordinateFrames(execution, direction = 1) {
  // Passes change hands at the catch/interception event; runs at the handoff (~0.4 s, where the
  // engine moves the ball to the runner — it emits no separate handoff event).
  const f = execution.frames,
    exchange = execution.result.passing ? (execution.events.find((e) => e.type === "CatchCompleted" || e.type === "Interception")?.time ?? Infinity) : 0.4,
    carrierAt = (t) => (t >= exchange ? execution.result.carrier : 0);
  return f.map((frame, k) => {
    const prev = f[Math.max(0, k - 1)],
      next = f[Math.min(f.length - 1, k + 1)],
      dt = Math.max(1e-3, next.time - prev.time);
    const players = frame.actors.map((a, i) => {
      const p = toUnreal({ x: a.x, z: a.z, y: 0 }, direction),
        vx = ((next.actors[i].x - prev.actors[i].x) / dt) * YARD_CM * direction,
        vy = ((next.actors[i].z - prev.actors[i].z) / dt) * YARD_CM * direction;
      return { index: i, x: p.X, y: p.Y, z: 0, yaw: toUnrealYaw(a.yaw, direction), vx: Math.round(vx), vy: Math.round(vy), speed: Math.round((a.speed || 0) * YARD_CM) };
    });
    const b = toUnreal(frame.ball, direction),
      pb = toUnreal(prev.ball, direction),
      nb = toUnreal(next.ball, direction);
    return {
      t: Math.round(frame.time * 1000) / 1000,
      players,
      ball: { x: b.X, y: b.Y, z: b.Z, vx: Math.round((nb.X - pb.X) / dt), vy: Math.round((nb.Y - pb.Y) / dt), vz: Math.round((nb.Z - pb.Z) / dt), carrier: carrierAt(frame.time) },
    };
  });
}

// Frames are chunked so the renderer can start interpolating before the whole play arrives.
export function playerFrameMessages(execution, { direction = 1, chunk = 12 } = {}) {
  const frames = coordinateFrames(execution, direction),
    out = [];
  for (let i = 0; i < frames.length; i += chunk)
    out.push(envelope("player.frames", { playId: execution.playId, chunk: out.length, final: i + chunk >= frames.length, frames: frames.slice(i, i + chunk) }));
  return out;
}

/* -------------------------------------------------- PhysicsCollisionEvent */

const severityOf = (impulse) => (impulse >= 780 ? "big" : impulse >= 420 ? "solid" : "light");

function frameAt(execution, t) {
  const f = execution.frames;
  let k = 0;
  while (k < f.length - 1 && f[k + 1].time <= t) k++;
  return k;
}

function contact(execution, t, a, b, direction, kind) {
  const f = execution.frames,
    k = frameAt(execution, t),
    k0 = Math.max(0, k - 1),
    dt = Math.max(1e-3, f[k].time - f[k0].time || 0.1),
    pa = f[k].actors[a],
    pb = f[k].actors[b],
    va = { x: (pa.x - f[k0].actors[a].x) / dt, z: (pa.z - f[k0].actors[a].z) / dt },
    vb = { x: (pb.x - f[k0].actors[b].x) / dt, z: (pb.z - f[k0].actors[b].z) / dt },
    rel = Math.hypot(va.x - vb.x, va.z - vb.z) * YARD_CM,
    ma = ROLE_MASS[execution.actors[a].role] ?? 100,
    mb = ROLE_MASS[execution.actors[b].role] ?? 100,
    reduced = (ma * mb) / (ma + mb),
    nx = pb.x - pa.x,
    nz = pb.z - pa.z,
    len = Math.hypot(nx, nz) || 1,
    mid = toUnreal({ x: (pa.x + pb.x) / 2, z: (pa.z + pb.z) / 2, y: kind === "Block" ? 1.2 : 1 }, direction);
  // Impulse in N·s from the reduced mass and closing speed (m/s).
  const impulse = Math.round(reduced * (rel / 100));
  return {
    t: Math.round(f[k].time * 1000) / 1000,
    kind,
    instigator: a,
    target: b,
    location: mid,
    normal: { x: Math.round((nx / len) * direction * 1000) / 1000, y: Math.round((nz / len) * direction * 1000) / 1000, z: 0 },
    closingSpeed: Math.round(rel),
    impulse,
    severity: kind === "Block" ? (impulse >= 420 ? "solid" : "light") : severityOf(impulse),
    bodyRegion: kind === "Block" ? "upper" : kind === "Sack" ? "upper" : rel > 600 ? "upper" : "lower",
  };
}

export function collisionEvents(execution, { direction = 1 } = {}) {
  const index = new Map(execution.actors.map((a, i) => [a.id, i])),
    out = [];
  for (const e of execution.events) {
    if (e.type === "Tackle" && e.tacklerId != null) out.push(contact(execution, e.time, index.get(e.tacklerId) ?? 18, index.get(e.actorId) ?? execution.result.carrier, direction, "Tackle"));
    if (e.type === "Sack" && e.tacklerId != null) out.push(contact(execution, e.time, index.get(e.tacklerId) ?? 11, 0, direction, "Sack"));
    if (e.type === "BrokenTackle") {
      const carrier = execution.result.carrier,
        k = frameAt(execution, e.time),
        pos = execution.frames[k].actors,
        defender = pos
          .map((p, i) => ({ i, d: i >= 11 ? Math.hypot(p.x - pos[carrier].x, p.z - pos[carrier].z) : Infinity }))
          .sort((x, y) => x.d - y.d)[0].i;
      out.push({ ...contact(execution, e.time, defender, carrier, direction, "BrokenTackle"), severity: "light" });
    }
  }
  // Line engagement: the first time each lineman closes within 1.1 yd of a defensive lineman.
  const engaged = new Set();
  for (const frame of execution.frames) {
    if (frame.time > 2.5) break;
    for (const o of OL)
      for (const d of DL) {
        const key = `${o}:${d}`;
        if (engaged.has(o) || engaged.has(key)) continue;
        if (Math.hypot(frame.actors[o].x - frame.actors[d].x, frame.actors[o].z - frame.actors[d].z) < 1.1) {
          engaged.add(o);
          engaged.add(key);
          out.push(contact(execution, frame.time, o, d, direction, "Block"));
        }
      }
  }
  return out.sort((a, b) => a.t - b.t).map((c) => envelope("physics.collision", { playId: execution.playId, ...c }));
}

/* -------------------------------------------------------- CinematicTrigger */

function teamLook(s, t) {
  if (t == null || t < 0) return null;
  const club = s?.franchise?.clubs?.[t],
    primary = club?.uniform?.primary || TEAM_COLORS[t] || "#3b6cc8";
  return {
    id: t,
    abbr: globalThis.clubs?.[t]?.[0] ?? `T${t}`,
    name: teamName(s, t),
    city: club?.identity?.city || globalThis.clubs?.[t]?.[1] || "",
    colors: { primary, secondary: club?.uniform?.secondary || "#f0f2ee" },
    uniform: { jersey: primary, pants: club?.uniform?.pants || "#c9ced3", helmet: club?.uniform?.helmet || primary, set: club?.uniform?.alternateOnly ? "Alternate" : "Home" },
  };
}

function castMember(slot, p, team) {
  if (!p) return { slot, playerId: null, name: null, number: -1, pos: null, team, appearance: null };
  return {
    slot,
    playerId: p.id ?? null,
    name: p.name ?? null,
    number: p.jersey ?? -1,
    pos: p.pos ?? null,
    team,
    appearance: { skin: p.face?.skin ?? p.appearance?.skin ?? null, hair: p.face?.hair ?? p.appearance?.hair ?? null, build: p.appearance?.build ?? null, heightCm: p.appearance?.height ?? ROLE_HEIGHT[p.pos] ?? 185 },
  };
}

export function cinematicTriggerMessage(event, s, { environment = {} } = {}) {
  const def = CUTSCENES[event.kind];
  if (!def || (def.when && !def.when(event))) return null;
  const roster = s?.roster || [],
    star = roster.filter((p) => !p.injury).sort((a, b) => (b.ovr ?? 0) - (a.ovr ?? 0))[0],
    subject = roster.find((p) => p.id === event.playerId),
    coach = s?.coach ? { id: "coach", name: s.coach.name, pos: "HC", appearance: s.coach.appearance } : null;
  const slots = { HeadCoach: coach, Star: star, Captain: roster.find((p) => p.captain) || star, Subject: subject, Prospect: event.playerName ? { id: event.playerId, name: event.playerName } : null };
  return envelope("cinematic.trigger", {
    eventId: event.id,
    kind: event.kind,
    template: def.sequence,
    priority: def.priority,
    skippable: def.skippable,
    // Blocking cinematics hold the live-sim telemetry until they finish (title, draft night).
    blocking: def.priority >= 80,
    teams: { home: teamLook(s, event.team), away: teamLook(s, event.opponent) },
    cast: def.cast.map((slot) => castMember(slot, slots[slot], event.team)),
    environment: { timeOfDay: environment.timeOfDay ?? "Night", weather: environment.weather ?? "Clear", crowd: environment.crowd ?? 85, stadium: environment.stadium ?? (globalThis.clubs?.[event.team]?.[0] ?? "HOME") },
    text: { headline: event.headline ?? null, quote: event.quote ?? null, score: event.score ?? null, year: event.year ?? null, week: event.week ?? null },
  });
}

/* --------------------------------------------------------------- MatchState */

export const FLOW_STATES = ["Hub", "LoadingMatch", "PreGame", "Live", "Halftime", "PostGame"];

export function matchFlowState(s) {
  const m = s?.live;
  if (!m) return "Hub";
  if (m.finished) return "PostGame";
  if (m.halftime) return "Halftime";
  if (!m.plays) return "PreGame";
  return "Live";
}

export function matchStateMessage(s) {
  const m = s?.live,
    state = matchFlowState(s);
  return envelope("match.state", {
    state,
    matchId: m ? `${s.year}-${s.week}-${m.a}-${m.b}` : null,
    home: m ? teamLook(s, m.a) : null,
    away: m ? teamLook(s, m.b) : null,
    quarter: m?.quarter ?? null,
    clock: m?.clock ?? null,
    score: m?.score ?? null,
    weather: m?.weather ?? null,
    // Asset hints let Unreal stream the stadium and both uniform sets before kickoff.
    preload: m ? [`Stadium_${globalThis.clubs?.[m.a]?.[0] ?? m.a}`, `Uniform_${globalThis.clubs?.[m.a]?.[0] ?? m.a}`, `Uniform_${globalThis.clubs?.[m.b]?.[0] ?? m.b}`, "LS_Pregame_Walkout"] : [],
  });
}
