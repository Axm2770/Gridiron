// Weekly training planner: a six-day schedule of practice blocks, unit drill emphases,
// individual attribute targets and position changes. The schedule sets the existing practice
// intensity (which already drives fatigue, wear and injury risk in world.weekly); this module
// adds scheme familiarity, readiness and targeted attribute growth scaled by the coordinators.
import { random, clamp } from "../engine/random.mjs";
import { identitySeed } from "./newgens.mjs";
import { applyMood } from "./newsroom.mjs";
import { ensurePlayerRatings, refreshPlayerRating } from "./ratings.mjs";
import { ensureDevelopment } from "./development.mjs";
import { log } from "./state.mjs";

export const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

// Per block: intensity contribution (0–100 scale), fatigue, injury-risk weight, scheme
// familiarity, readiness and development effect.
export const BLOCKS = {
  Off: { label: "Day off", intensity: 0, fatigue: -12, risk: 0, familiarity: 0, readiness: 0, development: 0, morale: 1 },
  Recovery: { label: "Recovery & treatment", intensity: 10, fatigue: -9, risk: 0, familiarity: 0, readiness: 1, development: 0, morale: 0.5 },
  Film: { label: "Film study", intensity: 15, fatigue: -2, risk: 0, familiarity: 4, readiness: 4, development: 0.3, morale: 0 },
  Walkthrough: { label: "Walkthrough", intensity: 30, fatigue: 1, risk: 0.1, familiarity: 3, readiness: 3, development: 0.3, morale: 0 },
  Install: { label: "Game-plan install", intensity: 45, fatigue: 3, risk: 0.3, familiarity: 6, readiness: 5, development: 0.5, morale: 0 },
  Padded: { label: "Padded practice", intensity: 85, fatigue: 9, risk: 1, familiarity: 3, readiness: 3, development: 1.2, morale: -0.5 },
  Conditioning: { label: "Conditioning", intensity: 70, fatigue: 7, risk: 0.6, familiarity: 0, readiness: 1, development: 0.8, morale: -1 },
};

export const TEMPLATES = {
  Balanced: ["Recovery", "Off", "Install", "Padded", "Walkthrough", "Film"],
  "Game-plan heavy": ["Film", "Off", "Install", "Install", "Walkthrough", "Film"],
  Physical: ["Recovery", "Off", "Padded", "Padded", "Conditioning", "Walkthrough"],
  "Recovery week": ["Recovery", "Off", "Film", "Walkthrough", "Off", "Walkthrough"],
};

// Unit emphases map to the attributes the existing rating model already tracks.
export const DRILLS = {
  offense: {
    "Pass protection": { positions: ["OL", "TE", "RB"], attrs: ["passBlock", "awareness"] },
    "Route timing": { positions: ["WR", "TE", "QB"], attrs: ["shortRouteRunning", "catching", "throwAccuracyShort"] },
    "Run game": { positions: ["OL", "RB", "TE"], attrs: ["runBlock", "carrying", "breakTackle"] },
    "Pocket under pressure": { positions: ["QB"], attrs: ["throwAccuracyMid", "awareness"] },
    "Red zone": { positions: ["WR", "TE", "QB", "RB"], attrs: ["catching", "throwAccuracyShort", "carrying"] },
  },
  defense: {
    "Pass rush": { positions: ["DL", "LB"], attrs: ["strength", "acceleration"] },
    Coverage: { positions: ["CB", "S", "LB"], attrs: ["manCoverage", "zoneCoverage"] },
    "Run fits": { positions: ["DL", "LB", "S"], attrs: ["tackle", "strength"] },
    Tackling: { positions: ["LB", "S", "CB"], attrs: ["tackle", "awareness"] },
    Disguise: { positions: ["S", "CB"], attrs: ["zoneCoverage", "awareness"] },
  },
};

// Position changes the coaching staff will consider, with the familiarity penalty.
export const POSITION_MOVES = { CB: ["S"], S: ["CB", "LB"], LB: ["S", "DL"], DL: ["LB"], WR: ["TE", "RB"], TE: ["WR"], RB: ["WR"], OL: [], QB: [], K: ["P"], P: ["K"] };

export function ensureTraining(s) {
  const f = s.franchise;
  if (!f) return null;
  f.training ??= { version: 1, schedule: [...TEMPLATES.Balanced], drills: { offense: "Route timing", defense: "Tackling" }, familiarity: f.preparation?.familiarity ?? 50, readiness: 60, history: [], seen: [] };
  const t = f.training;
  for (const k of ["history", "seen"]) if (!Array.isArray(t[k])) t[k] = [];
  return t;
}

function coordinator(s, side) {
  const club = s.franchise.clubs[s.team],
    staff = club?.staff || [],
    c = staff.find((x) => x.role === (side === "offense" ? "OC" : "DC")) || staff.find((x) => x.role === "HC");
  return { name: c?.name ?? "Head coach", rating: c?.rating ?? 60, scheme: c?.scheme ?? s.coach?.style ?? null };
}

// Training efficiency: coordinator quality, facilities, and how well a player fits the scheme.
export function efficiency(s, p) {
  const side = ["QB", "RB", "WR", "TE", "OL"].includes(p.pos) ? "offense" : "defense",
    c = coordinator(s, side),
    facilities = Number(s.franchise.clubs[s.team]?.stadium?.training ?? 1),
    fit = !p.preferredScheme || !c.scheme ? 1 : p.preferredScheme === c.scheme ? 1.15 : 0.9;
  return Math.round((0.6 + c.rating / 200 + facilities * 0.04) * fit * 100) / 100;
}

// Summary of the planned week. Intensity is the mean of non-off days, mapped to 0–100.
export function weekPlan(s) {
  const t = ensureTraining(s),
    blocks = t.schedule.map((b) => BLOCKS[b] ?? BLOCKS.Off),
    working = blocks.filter((b) => b.intensity > 0),
    sum = (k) => blocks.reduce((n, b) => n + b[k], 0);
  return {
    intensity: Math.round(working.length ? working.reduce((n, b) => n + b.intensity, 0) / working.length : 0),
    fatigue: Math.round(sum("fatigue")),
    risk: Math.round(sum("risk") * 10) / 10,
    familiarity: Math.round(sum("familiarity")),
    readiness: Math.round(sum("readiness")),
    development: Math.round(sum("development") * 10) / 10,
    morale: Math.round(sum("morale") * 10) / 10,
    restDays: blocks.filter((b) => b.intensity <= 10).length,
  };
}

export function setSchedule(s, schedule) {
  if (!Array.isArray(schedule) || schedule.length !== DAYS.length || !schedule.every((b) => Object.hasOwn(BLOCKS, b))) throw Error("Choose a block for each day.");
  const t = ensureTraining(s),
    plan = (t.schedule = [...schedule], weekPlan(s));
  if (plan.restDays === 0) throw Error("Players need at least one recovery or off day each week.");
  // Feed the existing intensity knob: world.weekly already turns it into fatigue, wear and injury risk.
  s.franchise.preparation.intensity = plan.intensity;
  return plan;
}

export function applyTemplate(s, name) {
  if (!TEMPLATES[name]) throw Error("Unknown training template.");
  return setSchedule(s, TEMPLATES[name]);
}

export function setDrill(s, side, drill) {
  if (!DRILLS[side]?.[drill]) throw Error("Choose an available drill.");
  ensureTraining(s).drills[side] = drill;
}

export function setIndividualTarget(s, playerId, attribute) {
  const p = s.roster.find((x) => x.id === playerId);
  if (!p) throw Error("Player is no longer at this club.");
  const r = ensurePlayerRatings(p);
  if (attribute && r.attributes && !(attribute in r.attributes)) throw Error("Choose an attribute this player has.");
  ensureDevelopment(p, s.year).target = attribute || null;
  return p;
}

export function changePosition(s, playerId, to) {
  const p = s.roster.find((x) => x.id === playerId);
  if (!p) throw Error("Player is no longer at this club.");
  if (!(POSITION_MOVES[p.pos] || []).includes(to)) throw Error(`The staff won't move a ${p.pos} to ${to}.`);
  if (s.live) throw Error("Position changes wait until after the game.");
  const r = ensurePlayerRatings(p),
    penalty = 6;
  // Learning a new position costs rating now and is earned back through practice reps.
  p.positionChange = { from: p.pos, to, year: s.year, week: s.week, familiarity: 30, penalty };
  r.development = (r.development || 0) - penalty;
  p.pos = to;
  p.starter = false;
  refreshPlayerRating(p, s.year);
  const ambitious = (p.persona?.ambition ?? 0.5) > 0.6;
  applyMood(s, { playerId, delta: ambitious ? 2 : -3, trust: ambitious ? 2 : -3, reason: `Moved from ${p.positionChange.from} to ${to}`, sourceId: `pos:${p.id}:${s.year}:${s.week}`, spillover: false });
  log(s, "Position change", `${p.name} moves from ${p.positionChange.from} to ${to}. Expect a learning curve.`);
  return p;
}

const gain = (rng, base) => Math.round(base * (0.6 + rng() * 0.8) * 1000) / 1000;

// Once per settled round: familiarity/readiness, drill and individual attribute growth,
// position-change learning and morale from the week's load. Idempotent by round key.
export function processTrainingWeek(s, roundKey) {
  const t = ensureTraining(s);
  if (!t || t.seen.includes(roundKey)) return null;
  t.seen.push(roundKey);
  t.seen = t.seen.slice(-200);
  const plan = weekPlan(s);
  t.familiarity = clamp(Math.round(t.familiarity * 0.92 + plan.familiarity), 20, 100);
  t.readiness = clamp(Math.round(40 + plan.readiness * 2 + (t.familiarity - 50) * 0.3 - Math.max(0, plan.fatigue) * 0.6), 10, 100);
  s.franchise.preparation.familiarity = t.familiarity;
  const grew = [];
  for (const p of s.roster) {
    if (p.injury || p.status === "ir") continue;
    const rng = random(identitySeed(`${p.id}:${roundKey}:train`)),
      r = ensurePlayerRatings(p),
      d = ensureDevelopment(p, s.year),
      eff = efficiency(s, p),
      youth = p.age <= 25 ? 1.25 : p.age >= 31 ? 0.6 : 1,
      headroom = Math.max(0, (p.pot ?? 99) - p.ovr) / 10,
      scale = 0.05 * plan.development * eff * youth * Math.min(1, headroom);
    if (scale <= 0) continue;
    r.attributeChanges ??= {};
    const side = ["QB", "RB", "WR", "TE", "OL"].includes(p.pos) ? "offense" : "defense",
      drill = DRILLS[side][t.drills[side]],
      targets = [...(drill?.positions.includes(p.pos) ? drill.attrs : []), ...(d.target ? [d.target, d.target] : [])];
    for (const attr of targets) {
      if (r.attributes && !(attr in r.attributes)) continue;
      r.attributeChanges[attr] = Math.round(((r.attributeChanges[attr] || 0) + gain(rng, scale)) * 1000) / 1000;
    }
    if (targets.length) {
      r.development = Math.round(((r.development || 0) + gain(rng, scale * 0.25)) * 1000) / 1000;
      grew.push(p.id);
    }
    if (p.positionChange && p.positionChange.familiarity < 100) {
      const step = Math.min(100 - p.positionChange.familiarity, Math.round(10 + plan.familiarity * 0.8));
      p.positionChange.familiarity += step;
      // Earn back the learning penalty in proportion to familiarity gained.
      const regain = (p.positionChange.penalty * step) / 70;
      r.development = (r.development || 0) + regain;
    }
    refreshPlayerRating(p, s.year);
  }
  if (Math.abs(plan.morale) >= 1) {
    const delta = Math.max(-2, Math.min(2, Math.round(plan.morale)));
    applyMood(s, { teamDelta: delta, reason: delta > 0 ? "A well-balanced training week" : "A gruelling training week", sourceId: `training:${roundKey}`, spillover: false });
  }
  t.history.unshift({ key: roundKey, year: s.year, week: s.week, ...plan, familiarity: t.familiarity, readiness: t.readiness, improved: grew.length });
  t.history = t.history.slice(0, 20);
  return t.history[0];
}
