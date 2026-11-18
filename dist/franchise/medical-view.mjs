// Read-only view helpers for the Medical & training screen: player availability status, the
// treatment-room list (filter, sort), squad health, unit readiness and the weekly practice-load
// effects. No state changes and no new injury maths: values come from medical.mjs, training.mjs
// and the player record (p.injury, p.fitness, p.wear, p.status).

export const ROOM_PAGE = 6;
export const LOG_PAGE = 6;
export const JOINTS = ["shoulder", "back", "knee", "ankle"];
// Healthy players at or past either line are flagged "at risk" in the treatment room.
export const WEAR_RISK = 40;
export const CONDITION_RISK = 70;

const rostered = (s) => (s.roster || []).filter((p) => p.status !== "practice");
const mean = (xs) => (xs.length ? xs.reduce((n, x) => n + x, 0) / xs.length : 0);
const fit = (p) => Math.round(p.fitness ?? 100);
export const worstJoint = (p) => {
  const [part, v] = Object.entries(p.wear || {}).sort((a, b) => b[1] - a[1])[0] || ["", 0];
  return { part, wear: Math.round(v || 0) };
};

// Availability status for one player. `c` is his open medical case (if any).
// key: ir | decision | questionable | out | risk | fit
export function playerStatus(p, c = null) {
  if (p.status === "ir") return { key: "ir", label: "IR", tone: "bad" };
  if (c?.status === "decision") return { key: "decision", label: "Decision", tone: "warn" };
  if (c?.status === "playing-through" && !(p.injury > 0)) return { key: "questionable", label: "Questionable", tone: "warn" };
  if (p.injury > 0) return { key: "out", label: "Out", tone: "bad" };
  const j = worstJoint(p);
  if (j.wear >= WEAR_RISK || fit(p) < CONDITION_RISK) return { key: "risk", label: "At risk", tone: "warn" };
  return { key: "fit", label: "Fit", tone: "good" };
}

// Display week (1-based, like the header's "Week N") a player is expected back, or null if he is
// not out. Weeks past the regular season read as next season.
export function returnWeek(s, p) {
  if (!(p.injury > 0)) return null;
  const week = (s.week ?? 0) + p.injury + 1,
    irWeek = p.status === "ir" ? (p.irReturnWeek ?? 0) + 1 : 0,
    back = Math.max(week, irWeek),
    games = s.schedule?.length || 18;
  return { week: back, nextSeason: back > games, label: back > games ? "Next season" : `Week ${back}` };
}

// Treatment-room entries: everyone hurt, on IR or playing through an injury, plus healthy
// players whose wear or condition is past the risk lines. `cases` maps playerId → case.
export function roomEntries(s, cases = {}) {
  return rostered(s)
    .map((p) => {
      const c = cases[p.id] && cases[p.id].status !== "cleared" ? cases[p.id] : null;
      return { p, c, status: playerStatus(p, c), joint: worstJoint(p), condition: fit(p), back: returnWeek(s, p) };
    })
    .filter((x) => x.status.key !== "fit");
}

export const ROOM_FILTERS = [
  ["hurt", "Injured"],
  ["out", "Out"],
  ["questionable", "Playing hurt"],
  ["ir", "IR"],
  ["risk", "At risk"],
];
export const ROOM_SORTS = [
  ["weeks", "Weeks out"],
  ["ovr", "Overall"],
  ["pos", "Position"],
  ["risk", "Wear & fatigue"],
];

const riskScore = (x) => x.joint.wear + (100 - x.condition);
export function filterRoom(entries, filter = "hurt", sort = "weeks") {
  const keep =
    filter === "hurt" ? (x) => x.status.key !== "risk" : filter === "out" ? (x) => x.status.key === "out" || x.status.key === "decision" : (x) => x.status.key === filter;
  const by = {
    weeks: (a, b) => (b.p.injury || 0) - (a.p.injury || 0) || riskScore(b) - riskScore(a),
    ovr: (a, b) => b.p.ovr - a.p.ovr,
    pos: (a, b) => String(a.p.pos).localeCompare(String(b.p.pos)) || b.p.ovr - a.p.ovr,
    risk: (a, b) => riskScore(b) - riskScore(a),
  }[sort] || ((a, b) => 0);
  return entries.filter(keep).sort((a, b) => (a.status.key === "decision" ? -1 : 0) - (b.status.key === "decision" ? -1 : 0) || by(a, b));
}

export function roomCounts(entries) {
  const n = { hurt: 0, out: 0, questionable: 0, ir: 0, risk: 0, decision: 0 };
  for (const x of entries) {
    n[x.status.key] = (n[x.status.key] || 0) + 1;
    if (x.status.key !== "risk") n.hurt++;
  }
  n.out += n.decision;
  return n;
}

// Squad-wide health: availability, condition, fatigue and average joint wear on the 53.
export function squadHealth(s) {
  const squad = rostered(s),
    available = squad.filter((p) => !(p.injury > 0) && p.status !== "ir" && !p.holdout),
    wear = Object.fromEntries(JOINTS.map((j) => [j, Math.round(mean(squad.map((p) => p.wear?.[j] ?? 0)))])),
    hot = squad
      .filter((p) => !(p.injury > 0))
      .map((p) => ({ p, ...worstJoint(p) }))
      .filter((x) => x.wear >= WEAR_RISK)
      .sort((a, b) => b.wear - a.wear);
  return {
    total: squad.length,
    available: available.length,
    availability: squad.length ? Math.round((available.length / squad.length) * 100) : 100,
    condition: Math.round(mean(available.map(fit))) || 100,
    fatigued: available.filter((p) => fit(p) < CONDITION_RISK).length,
    wear,
    hotspot: JOINTS.reduce((a, b) => (wear[b] > wear[a] ? b : a), JOINTS[0]),
    hot,
  };
}

// Practice-load effects of an intensity (0–100) for one week, mirroring world.weekly(): joint
// wear change per joint, condition recovered, and the chance a healthy player picks up a
// practice injury (normal individual load). For display only.
export function practiceLoad(intensity, medicalLevel = 1) {
  const i = Math.max(0, Math.min(100, Number(intensity) || 0)) / 100;
  return {
    wear: Math.round((i * 5 - (1 - i) * 7 - Number(medicalLevel || 0)) * 10) / 10,
    condition: Math.round((20 - i * 15) * 10) / 10,
    injuryChance: Math.round(i * 0.025 * 1000) / 10,
  };
}

export const INTENSITY_BANDS = [
  [0, "Light"],
  [35, "Moderate"],
  [55, "Hard"],
  [75, "Brutal"],
];
export const intensityBand = (v) => INTENSITY_BANDS.reduce((band, [min, label]) => (v >= min ? label : band), "Light");

// Per-unit readiness for the training screen.
export const UNITS = [
  ["QB", ["QB"]],
  ["RB", ["RB"]],
  ["WR/TE", ["WR", "TE"]],
  ["OL", ["OL"]],
  ["DL", ["DL"]],
  ["LB", ["LB"]],
  ["DB", ["CB", "S"]],
  ["K/P", ["K", "P"]],
];
export function unitReadiness(s) {
  const squad = rostered(s);
  return UNITS.map(([unit, positions]) => {
    const group = squad.filter((p) => positions.includes(p.pos)),
      healthy = group.filter((p) => !(p.injury > 0) && p.status !== "ir");
    return {
      unit,
      total: group.length,
      healthy: healthy.length,
      injured: group.length - healthy.length,
      condition: Math.round(mean(healthy.map(fit))) || 0,
      fatigued: healthy.filter((p) => fit(p) < CONDITION_RISK).length,
      wear: Math.round(mean(healthy.map((p) => worstJoint(p).wear))),
    };
  });
}

// Recent medical entries from the club log.
export const MEDICAL_LOG_TITLES = ["Medical report", "Treatment decided", "Medical staff decision", "Cleared to return", "Injury aggravated", "Surgical complication", "Medical staff hire"];
export const medicalLog = (s) => (s.franchise?.events || []).filter((x) => MEDICAL_LOG_TITLES.includes(x.title) || (x.title === "Roster designation" && / moved to ir\.$/.test(x.body || "")));
