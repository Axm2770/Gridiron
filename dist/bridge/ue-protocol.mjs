// Gridiron → Unreal Engine 5 protocol ("gridiron.ue/1"). Pure functions that turn
// deterministic engine output and narrative events into render instructions. The bridge is
// output-only: Unreal never decides a result, it only visualises one that already happened.

export const PROTOCOL = "gridiron.ue/1";
export const YARD_CM = 91.44;
// v1 batch types (play.execution, cutscene.trigger) remain for older Unreal builds; the telemetry
// stream (play.call, player.frames, physics.collision, cinematic.trigger, match.state) supersedes them.
export const MESSAGE_TYPES = ["session.start", "play.execution", "cutscene.trigger", "stadium.state", "play.call", "player.frames", "physics.collision", "cinematic.trigger", "match.state", "ue.ready", "ue.cutscene.finished", "ue.flow.state", "ue.error"];
export const MAX_MESSAGE_BYTES = 4 * 1024 * 1024;

// Team palette mirrors stadium.js so 3D uniforms match the 2D/Three.js presentation.
export const TEAM_COLORS = ["#14388c", "#058e91", "#17315d", "#125f3a", "#4b2581", "#ee631d", "#7e4125", "#dbb92a", "#193f56", "#1c55a0", "#008a91", "#489ab9", "#e76d24", "#cd2434", "#484f59", "#62b8dc", "#29588a", "#1855a0", "#126566", "#8b253b", "#d36323", "#388cc9", "#235e43", "#743caa", "#bf293b", "#249dcc", "#b69a60", "#b93231", "#b62f45", "#3b6cc8", "#b92b3c", "#245785"];

let sequence = 0;
export function envelope(type, payload, { now = Date.now } = {}) {
  if (!MESSAGE_TYPES.includes(type)) throw Error("Unknown bridge message type: " + type);
  return { protocol: PROTOCOL, type, seq: ++sequence, sentAt: now(), payload };
}

/* ------------------------------------------------------------------ space */

// Engine space: x = yards from the offense's own goal line (0..110, 100 = end zone),
// z = lateral yards from the middle (-26.65..26.65), y = height in yards.
// Unreal space: centimetres from midfield. +X toward the home end zone, +Y to the home sideline, +Z up.
export function toUnreal({ x, z, y = 0 }, direction = 1) {
  return {
    X: Math.round((x - 50) * YARD_CM * direction),
    Y: Math.round(z * YARD_CM * direction),
    Z: Math.round(y * YARD_CM),
  };
}

// Engine yaw is atan2(vx, vz) in the offense frame; Unreal yaw is degrees around Z.
export const toUnrealYaw = (yaw, direction = 1) => {
  const deg = 90 - (yaw * 180) / Math.PI + (direction < 0 ? 180 : 0);
  return Math.round((((deg % 360) + 540) % 360) - 180);
};

/* ------------------------------------------------------- play visualisation */

// Map engine events to animation montages/notifies the Unreal AnimBlueprints understand.
export const ANIMATION_TRIGGERS = {
  Snap: { montage: "AM_Snap", target: "actorId" },
  PassReleased: { montage: "AM_Throw", target: "actorId", look: "targetId" },
  CatchCompleted: { montage: "AM_Catch", target: "actorId" },
  PassIncomplete: { montage: "AM_Incomplete", target: null },
  BrokenTackle: { montage: "AM_Juke", target: "actorId" },
  Tackle: { montage: "AM_Tackle", target: "tacklerId", partner: "actorId" },
  Sack: { montage: "AM_Sack", target: "tacklerId" },
  Interception: { montage: "AM_Interception", target: "actorId" },
  Touchdown: { montage: "AM_Celebrate", target: "actorId" },
  Kick: { montage: "AM_Kick", target: null },
  FieldGoalGood: { montage: "AM_Celebrate_Small", target: null },
  OutOfBounds: { montage: "AM_StepOut", target: null },
};

export function cameraPlan(execution) {
  const r = execution.result,
    deep = ["Deep pass", "Play action"].includes(execution.call),
    shots = [{ at: 0, rig: "CR_Broadcast_HighSideline", blend: 0 }];
  const release = execution.events.find((e) => e.type === "PassReleased");
  if (deep && release) shots.push({ at: release.time, rig: "CR_SkyCam_Follow", blend: 0.35, follow: "ball" });
  if (r.kind === "touchdown") shots.push({ at: execution.duration - 1.2, rig: "CR_EndZone_Hero", blend: 0.25, follow: "carrier", slowMo: 0.4 });
  else if (r.kind === "sack") shots.push({ at: Math.max(0, execution.events.find((e) => e.type === "Sack")?.time - 0.4), rig: "CR_Pocket_Low", blend: 0.15, follow: "carrier", slowMo: 0.5 });
  else if (r.kind === "interception") shots.push({ at: execution.events.find((e) => e.type === "Interception")?.time ?? 0, rig: "CR_Field_Reverse", blend: 0.2, follow: "carrier" });
  else if (Math.abs(r.yards) >= 20) shots.push({ at: Math.max(0, execution.duration - 2.5), rig: "CR_Ground_Track", blend: 0.3, follow: "carrier" });
  return { shots, replayWorthy: r.kind === "touchdown" || r.kind === "interception" || r.kind === "sack" || Math.abs(r.yards) >= 25 };
}

// Converts an engine execution into a compact, frame-accurate payload. Frames are stored as
// flat Int32 arrays [X cm, Y cm, yaw degrees, speed cm/s] per actor so a 10 Hz play stays small.
export function playExecutionMessage(execution, ctx = {}) {
  if (!execution?.frames?.length || !execution.actors?.length) throw Error("Execution has no frames.");
  const direction = ctx.direction ?? 1;
  const frames = execution.frames.map((f) => ({
    t: f.time,
    actors: f.actors.flatMap((a) => {
      const p = toUnreal(a, direction);
      return [p.X, p.Y, toUnrealYaw(a.yaw, direction), Math.round((a.speed || 0) * YARD_CM)];
    }),
    ball: toUnreal(f.ball, direction),
  }));
  const index = new Map(execution.actors.map((a, i) => [a.id, i]));
  const triggers = execution.events
    .filter((e) => ANIMATION_TRIGGERS[e.type])
    .map((e) => {
      // -1 (not null) marks "no actor" so Unreal's int32 struct fields deserialize cleanly.
      const map = ANIMATION_TRIGGERS[e.type],
        at = (key) => (key && e[key] != null ? index.get(e[key]) ?? -1 : -1);
      return { t: e.time, event: e.type, montage: map.montage, actor: at(map.target), partner: at(map.partner), lookAt: at(map.look) };
    });
  return envelope("play.execution", {
    playId: execution.playId,
    seed: execution.seed,
    tickRate: execution.tickRate,
    sampleHz: 10,
    duration: execution.duration,
    call: execution.call,
    offenseTeam: ctx.offenseTeam ?? -1,
    defenseTeam: ctx.defenseTeam ?? -1,
    direction,
    situation: execution.context
      ? { down: execution.context.down, toGo: execution.context.toGo, spot: execution.context.spot, quarter: execution.context.quarter, clock: execution.context.clock, score: execution.context.score }
      : null,
    actors: execution.actors.map((a, i) => ({
      index: i,
      id: a.id,
      name: a.name,
      role: a.role,
      jersey: a.jersey ?? null,
      side: i < 11 ? "offense" : "defense",
    })),
    frameStride: 4,
    frames,
    triggers,
    camera: cameraPlan(execution),
    result: { ...execution.result },
  });
}

/* ------------------------------------------------------------- cutscenes */

// Narrative event → Level Sequence. Cast slots are bound to spawnable skeletal meshes in UE.
export const CUTSCENES = {
  Championship: { sequence: "LS_Championship_Celebration", priority: 100, cast: ["HeadCoach", "Star", "Owner"], skippable: false },
  PlayoffElimination: { sequence: "LS_Locker_Somber", priority: 70, cast: ["HeadCoach", "Captain"], skippable: true },
  ClutchFinish: { sequence: "LS_Walkoff_Mob", priority: 60, cast: ["Star", "HeadCoach"], skippable: true },
  Blowout: { sequence: "LS_Sideline_Reaction", priority: 30, cast: ["HeadCoach"], skippable: true },
  DraftPick: { sequence: "LS_DraftNight_Stage", priority: 80, cast: ["Prospect", "Commissioner"], skippable: true },
  PressConference: { sequence: "LS_PressConference_Podium", priority: 40, cast: ["HeadCoach"], skippable: true },
  LockerRoomDilemma: { sequence: "LS_Locker_Confrontation", priority: 50, cast: ["HeadCoach", "Subject"], skippable: true },
  Injury: { sequence: "LS_Injury_Cart", priority: 45, cast: ["Subject", "Trainer"], skippable: true, when: (e) => e.severity === "major" },
  Trade: { sequence: "LS_Office_Phone", priority: 35, cast: ["GeneralManager"], skippable: true },
};

export function cutsceneMessage(event, s) {
  const def = CUTSCENES[event.kind];
  if (!def || (def.when && !def.when(event))) return null;
  const roster = s?.roster || [],
    star = roster.filter((p) => !p.injury).sort((a, b) => (b.ovr ?? 0) - (a.ovr ?? 0))[0],
    captain = roster.find((p) => p.captain) || star,
    subject = roster.find((p) => p.id === event.playerId);
  const castMap = {
    HeadCoach: s?.coach ? { name: s.coach.name, appearance: s.coach.appearance ?? null } : null,
    Star: star && { playerId: star.id, name: star.name, pos: star.pos, jersey: star.jersey ?? null },
    Captain: captain && { playerId: captain.id, name: captain.name, pos: captain.pos, jersey: captain.jersey ?? null },
    Subject: subject && { playerId: subject.id, name: subject.name, pos: subject.pos, jersey: subject.jersey ?? null },
    Prospect: event.playerName ? { playerId: event.playerId ?? null, name: event.playerName } : null,
  };
  return envelope("cutscene.trigger", {
    eventId: event.id,
    kind: event.kind,
    sequence: def.sequence,
    priority: def.priority,
    skippable: def.skippable,
    team: event.team,
    opponent: event.opponent ?? -1,
    colors: { home: TEAM_COLORS[event.team] ?? "#ffffff", away: TEAM_COLORS[event.opponent] ?? "#888888" },
    cast: def.cast.map((slot) => ({ slot, ...(castMap[slot] || {}) })),
    params: {
      score: event.score ?? null,
      headline: event.headline ?? null,
      quote: event.quote ?? null,
      tags: event.tags ?? [],
      year: event.year,
      week: event.week,
    },
  });
}

export function stadiumMessage(s, live, env) {
  return envelope("stadium.state", {
    homeTeam: live?.a ?? s.team,
    awayTeam: live?.b ?? null,
    colors: { home: TEAM_COLORS[live?.a ?? s.team], away: TEAM_COLORS[live?.b] ?? null },
    weather: env?.weather ?? live?.weather ?? "Clear",
    crowd: env?.crowd ?? 70,
    hostile: !!env?.hostile,
    quarter: live?.quarter ?? null,
    clock: live?.clock ?? null,
    score: live?.score ?? null,
    timeOfDay: live && live.quarter >= 3 ? "Dusk" : "Afternoon",
  });
}

// Shallow structural validation used on both sides of the IPC boundary.
export function validateMessage(msg) {
  if (!msg || typeof msg !== "object") return "Message must be an object.";
  if (msg.protocol !== PROTOCOL) return "Unsupported protocol.";
  if (!MESSAGE_TYPES.includes(msg.type)) return "Unknown message type.";
  if (!Number.isSafeInteger(msg.seq)) return "Missing sequence number.";
  if (!msg.payload || typeof msg.payload !== "object") return "Missing payload.";
  return null;
}
