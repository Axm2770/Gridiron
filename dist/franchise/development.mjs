import { random, clamp } from "../engine/random.mjs";
import { identitySeed } from "./newgens.mjs";
import { ensurePlayerRatings, refreshPlayerRating } from "./ratings.mjs";
export const FOCUSES = {
  Balanced: ["awareness", "stamina"],
  Technique: ["throwAccuracyShort", "catching", "passBlock", "tackle"],
  Athleticism: ["speed", "acceleration", "agility"],
  DecisionMaking: ["awareness", "zoneCoverage", "shortRouteRunning"],
  PositionSpecific: [],
  Rehabilitation: ["stamina", "injury"],
};
export const LOADS = { Light: 0.55, Normal: 1, Intensive: 1.45 };
const round = (n) => Math.round(n * 1000) / 1000;
const peak = (p) =>
  ({
    QB: 29,
    RB: 25,
    WR: 27,
    TE: 28,
    OL: 29,
    DL: 28,
    LB: 27,
    CB: 26,
    S: 28,
    K: 32,
    P: 32,
  })[p.pos] || 28;
const relevant = (p) =>
  ({
    QB: ["throwAccuracyShort", "throwAccuracyMid", "awareness"],
    RB: ["carrying", "breakTackle", "agility"],
    WR: ["catching", "shortRouteRunning", "acceleration"],
    TE: ["catching", "runBlock", "awareness"],
    OL: ["passBlock", "runBlock", "strength"],
    DL: ["tackle", "strength", "acceleration"],
    LB: ["tackle", "awareness", "zoneCoverage"],
    CB: ["manCoverage", "zoneCoverage", "agility"],
    S: ["zoneCoverage", "tackle", "awareness"],
    K: ["kickAccuracy", "kickPower"],
    P: ["kickPower", "awareness"],
  })[p.pos] || ["awareness"];
export function ensureDevelopment(p, year = 2026) {
  if (!p.progression)
    p.progression = {
      version: 1,
      focus: "PositionSpecific",
      load: "Normal",
      mentorId: null,
      training: p.injury ? null : 6.5,
      form: null,
      formHistory: [],
      history: [],
      injuries: [],
      injuredWeeks: 0,
      rehab: 0,
      lastRound: null,
      lastStats: {},
      season: year,
      abilityStart: p.ovr,
    };
  p.progression.formHistory ??= [];
  p.progression.history ??= [];
  p.progression.injuries ??= [];
  p.progression.lastStats ??= {};
  return p.progression;
}
export function setDevelopmentPlan(s, id, plan) {
  if (
    !["Owner", "HC", "OC", "DC"].includes(s.franchise.role) &&
    !s.franchise.debug
  )
    throw Error(
      "Your role delegates individual training to the coaching staff.",
    );
  const p = s.roster.find((p) => p.id === id);
  if (!p) throw Error("Player is no longer at this club.");
  if (
    (s.franchise.role === "OC" &&
      !["QB", "RB", "WR", "TE", "OL"].includes(p.pos)) ||
    (s.franchise.role === "DC" && !["DL", "LB", "CB", "S"].includes(p.pos))
  )
    throw Error("Choose a player from your coaching unit.");
  const d = ensureDevelopment(p, s.year);
  if (!Object.hasOwn(FOCUSES, plan.focus) || !Object.hasOwn(LOADS, plan.load))
    throw Error("Choose an available focus and workload.");
  if (plan.mentorId) {
    const mentor = s.roster.find((q) => q.id === plan.mentorId);
    if (
      !mentor ||
      mentor.id === id ||
      mentor.age < p.age + 3 ||
      mentor.pos !== p.pos
    )
      throw Error(
        "Choose a teammate at the same position, at least three years older.",
      );
  }
  Object.assign(d, {
    focus: plan.focus,
    load: plan.load,
    mentorId: plan.mentorId || null,
  });
  return d;
}
function formGrade(p, delta) {
  let v = 6.5;
  if (p.pos === "QB" && (delta.attempts || 0) >= 5)
    v =
      6 +
      ((delta.completions || 0) / delta.attempts - 0.5) * 5 +
      ((delta.passTD || 0) - (delta.interceptions || 0) * 1.5) * 0.35;
  else if (["WR", "TE"].includes(p.pos) && (delta.receptions || 0) > 0)
    v =
      6 +
      ((delta.recYards || 0) / delta.receptions - 8) * 0.12 +
      (delta.recTD || 0) * 0.35;
  else if (p.pos === "RB" && (delta.rushAttempts || 0) > 0)
    v =
      6 +
      ((delta.rushYards || 0) / delta.rushAttempts - 3) * 0.35 +
      (delta.rushTD || 0) * 0.4;
  else if (["DL", "LB", "CB", "S"].includes(p.pos))
    v = 6 + (delta.tackles || 0) * 0.09 + (delta.sacks || 0) * 0.5;
  else if ((delta.snaps || 0) > 0) v = 6.3 + ((p.ovr || 70) - 70) * 0.015;
  return Math.round(clamp(v, 4, 9.8) * 10) / 10;
}
export function developWeek(
  p,
  {
    year,
    week,
    roundKey,
    teamRoster = [],
    coaching = 65,
    facilities = 1,
    medical = 1,
    intensity = 50,
    played = false,
    coachAttributes = {},
  },
) {
  const d = ensureDevelopment(p, year),
    r = ensurePlayerRatings(p),
    beforeAttributes = {...(r.attributeChanges || {})};
  if (d.lastRound === roundKey) return null;
  d.lastRound = roundKey;
  const rng = random(identitySeed(p.id) + year * 719 + week * 131),
    season = p.stats?.[year] || {},
    delta = {};
  if (d.season !== year) {
    d.lastStats = {};
    d.season = year;
  }
  for (const [k, v] of Object.entries(season))
    if (Number.isFinite(v)) delta[k] = Math.max(0, v - (d.lastStats[k] || 0));
  d.lastStats = { ...season };
  const used =
      played &&
      !p.holdout &&
      (delta.snaps > 0 ||
        Object.values(delta).some((v) => v > 0) ||
        (p.starter && !p.injury)),
    available = !p.injury && !p.holdout;
  if (used) {
    const grade = formGrade(p, delta);
    d.formHistory.push(grade);
    d.formHistory = d.formHistory.slice(-5);
    d.form =
      Math.round(
        (d.formHistory.reduce((a, b) => a + b, 0) / d.formHistory.length) * 10,
      ) / 10;
  }
  const wasInjured = !!p.injury,
    injuryPart = p.medical?.bodyPart || "body";
  if (wasInjured) {
    d.injuredWeeks++;
    if (!d.activeInjury) {
      d.activeInjury = {
        year,
        week,
        bodyPart: injuryPart,
        diagnosis: p.medical?.diagnosis || "Match injury",
        expectedWeeks: Math.max(p.injury, p.medical?.weeks || 0),
        weeksMissed: 0,
      };
      d.injuries.unshift(d.activeInjury);
      d.injuries = d.injuries.slice(0, 12);
    }
    d.activeInjury.weeksMissed++;
    const entry = d.injuries.findIndex(
      (i) => i.year === d.activeInjury.year && i.week === d.activeInjury.week,
    );
    if (entry >= 0) d.injuries[entry] = d.activeInjury;
    d.training = null;
  } else if (d.activeInjury) {
    d.activeInjury.returned = { year, week };
    const entry = d.injuries.findIndex(
      (i) => i.year === d.activeInjury.year && i.week === d.activeInjury.week,
    );
    if (entry >= 0) d.injuries[entry] = d.activeInjury;
    d.activeInjury = null;
    d.rehab = medical >= 3 ? 1 : 2;
  }
  const mentor = teamRoster.find(
      (q) =>
        q.id === d.mentorId &&
        q.pos === p.pos &&
        q.age >= p.age + 3 &&
        !q.injury,
    ),
    professionalism =
      0.5 +
      (p.persona?.loyalty || 0.5) * 0.25 +
      (p.persona?.ambition || 0.5) * 0.25;
  const fatigue = clamp((p.fitness ?? 100) / 100, 0.35, 1),
    load = LOADS[d.load] || 1,
    ageFactor =
      p.age <= 24
        ? 1.2
        : p.age <= peak(p)
          ? 0.75
          : p.age <= peak(p) + 3
            ? 0.25
            : 0;
  const quality =
    clamp(
      (coaching + (coachAttributes.development || 10) * 1.5) / 90,
      0.5,
      1.45,
    ) *
    (1 + (facilities - 1) * 0.07);
  if (!wasInjured)
    d.training =
      Math.round(
        clamp(
          5.1 +
            professionalism +
            quality * 0.7 +
            ((p.morale ?? 70) - 65) / 45 +
            (rng() - 0.5) * 1.5 +
            ((coachAttributes.motivation || 10) - 10) / 35 +
            ((coachAttributes.discipline || 10) - 10) / 60 -
            (load > 1 && fatigue < 0.7 ? 1.2 : 0),
          3,
          9.8,
        ) * 10,
      ) / 10;
  const training = available
    ? ((d.training || 0) / 7) *
      quality *
      Math.min(1.2, intensity / 65 + 0.35) *
      Math.min(1.15, load) *
      fatigue
    : 0;
  const growth =
    0.085 *
    ageFactor *
    training *
    (used ? 1.2 : 0.72) *
    (d.form ? clamp(d.form / 7, 0.7, 1.25) : 1) *
    (p.development === "Star" ? 1.35 : p.development === "Impact" ? 1.15 : 1) *
    (mentor ? 1.1 : 1) *
    (d.rehab ? 0.45 : 1);
  const aging = p.age > peak(p) + 3 ? (p.age - peak(p) - 3) * 0.009 : 0;
  const injuryLoss = wasInjured
    ? (d.activeInjury.expectedWeeks >= 6 ? 0.045 : 0.012) /
      (1 + (medical + (coachAttributes.medical || 10) / 10) * 0.12)
    : 0;
  const overload = available && load > 1 && fatigue < 0.6 ? 0.015 : 0;
  const gain = round(growth - aging - injuryLoss - overload),
    before = p.ovr;
  r.development = round(
    clamp((r.development || 0) + gain, 35 - r.base, (p.pot || 99) - r.base),
  );
  r.attributeChanges ??= {};
  let keys =
    d.focus === "PositionSpecific"
      ? relevant(p)
      : d.focus === "Technique"
        ? relevant(p).filter(
            (k) => !["speed", "acceleration", "strength"].includes(k),
          )
        : FOCUSES[d.focus];
  if (!keys?.length) keys = ["awareness"];
  if (!wasInjured && gain > 0)
    for (const key of keys)
      r.attributeChanges[key] = round(
        clamp((r.attributeChanges[key] || 0) + gain * 0.7, -20, 12),
      );
  if (wasInjured && d.activeInjury.expectedWeeks >= 6) {
    const physical = ["knee", "ankle"].includes(injuryPart)
      ? ["speed", "acceleration", "agility"]
      : injuryPart === "shoulder"
        ? ["throwPower", "strength"]
        : ["stamina"];
    for (const key of physical)
      r.attributeChanges[key] = round(
        clamp((r.attributeChanges[key] || 0) - injuryLoss * 3.2, -20, 12),
      );
  }
  if (aging > 0 && !wasInjured)
    for (const key of ["speed", "acceleration", "stamina"])
      r.attributeChanges[key] = round(clamp((r.attributeChanges[key] || 0) - aging * 0.8, -20, 12));
  if (mentor && gain > 0)
    r.attributeChanges.awareness = round(
      clamp((r.attributeChanges.awareness || 0) + 0.025, 0, 12),
    );
  refreshPlayerRating(p, year);
  const reasons = [
    wasInjured
      ? "Injury interrupts training"
      : d.rehab
        ? "Return-to-play workload"
        : used
          ? "Competitive snaps"
          : "Development through practice",
    mentor ? "Mentor support" : null,
    p.age > peak(p) + 3 ? "Age-related decline" : null,
    overload ? "Fatigue limits progress" : null,
  ].filter(Boolean);
  const report = {
    year,
    week,
    ovr: p.ovr,
    ability: round(r.base + r.development),
    delta: gain,
    training: d.training,
    form: d.form,
    used,
    injured: wasInjured,
    reasons,
    attributeDirections: Object.fromEntries(Object.entries(r.attributeChanges).map(([key,value]) => [key, round(value - (beforeAttributes[key] || 0))]).filter(([,value]) => value !== 0)),
  };
  d.history.push(report);
  d.history = d.history.slice(-26);
  d.lastReport = report;
  if (d.rehab && !wasInjured) d.rehab--;
  return report;
}
export function processDevelopment(s, results = []) {
  const f = s.franchise,
    key = `${s.year}:${s.phase}:${s.week}:${f.postseason?.round ?? 0}`;
  for (let team = 0; team < 32; team++) {
    const roster = team === s.team ? s.roster : f.clubs[team].players,
      staff = f.clubs[team].staff || [],
      coaching = staff.length
        ? staff.reduce((n, c) => n + c.rating, 0) / staff.length
        : 65,
      played = results.some((g) => g.a === team || g.b === team);
    for (const p of roster) {
      developWeek(p, {
        year: s.year,
        week: s.week,
        roundKey: key,
        teamRoster: roster,
        coaching,
        facilities: f.clubs[team].stadium.training,
        medical: f.clubs[team].stadium.medical,
        intensity: team === s.team ? f.preparation.intensity : 50,
        played,
        coachAttributes: team === s.team ? f.userCoach?.attributes || {} : {},
      });
      if (team !== s.team && p.injury) p.injury = Math.max(0, p.injury - 1);
    }
  }
}
export function offseasonDevelopment(p, year, coaching = 0) {
  const d = ensureDevelopment(p, year),
    r = ensurePlayerRatings(p);
  if (d.lastOffseason === year) return;
  d.lastOffseason = year;
  const gain = p.injury
    ? -0.1
    : p.age <= peak(p)
      ? 0.2 + coaching / 100
      : p.age > peak(p) + 3
        ? -0.18
        : 0;
  r.development = round(
    clamp((r.development || 0) + gain, 35 - r.base, p.pot - r.base),
  );
  refreshPlayerRating(p, year);
  d.lastStats = {};
}
