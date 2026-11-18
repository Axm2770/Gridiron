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
// A game-plan tempo (snapTempo) applies to the user's own snap only while the sideline tempo is
// Normal, so a hurry-up or chew-clock instruction from the sideline or halftime always wins.
export function withPossessionTempo(m, own, apply, snapTempo) {
  const tempo = m.tempo;
  if (!own) m.tempo = "Normal";
  else if (snapTempo && (tempo || "Normal") === "Normal") m.tempo = snapTempo;
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
// A salt draws an independent number for the same snap (concept, package and coverage picks).
function roll(m, salt = 0) {
  let s = ((m.engine?.seed ?? 0) ^ Math.imul((m.plays || 0) + 1, 0x9e3779b1) ^ Math.imul(salt, 0x85ebca6b)) >>> 0;
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
// fast simulation worker so both paths score alike. With a game plan (tactics.mjs) the call also
// follows the scheme, the situational packages and the fourth-down chart; offenseSnap() returns
// the formation, personnel, run concept and tempo that go with it.
export function staffDecision(m, opts = {}) {
  return offenseSnap(m, opts).call;
}

/* ------------------------------------------------------------------ game plan → sim inputs */
// Every game-plan option resolves to inputs simulateExecution already understands: a call
// (Inside run, Outside run, Quick pass, Short pass, Screen, Deep pass, Play action, Punt, Field
// goal), a run scheme (Inside zone, Outside zone, Power, Counter), a formation, a personnel
// group, a coverage string, a front and a safety shell, plus the clock tempo used by rules.mjs.
// Default values reproduce the behaviour from before the game plan existed, call for call.
export const PLAN_DEFAULTS = {
  scheme: "Multiple",
  personnel: "11",
  formation: "Shotgun",
  runConcept: "Scheme",
  passConcept: "Scheme",
  tempo: "Normal",
  coverage: "Staff",
  manZone: "Balanced",
  blitz: "Four-man",
  runFit: "Gap sound",
  press: "Mixed",
  third: "Default",
  redZone: "Default",
  goalLine: "Default",
  twoMinute: "Default",
  fourth: "Balanced",
  dThird: "Default",
  dRedZone: "Default",
  prevent: "Off",
  fakes: "Never",
  onside: "Never",
};
export const PLAN_VALUES = {
  scheme: ["Multiple", "West Coast", "Air Raid", "Spread RPO", "Wide zone", "Erhardt-Perkins", "Power gap"],
  personnel: ["11", "12", "21", "13", "10"],
  formation: ["Shotgun", "Singleback", "Pistol", "I formation", "Under center", "Empty"],
  runConcept: ["Scheme", "Inside zone", "Outside zone", "Power", "Counter", "Duo"],
  passConcept: ["Scheme", "Quick game", "Dropback", "Play action", "Screens", "RPO"],
  tempo: ["Normal", "Up-tempo", "Ball control", "Situational"],
  coverage: ["Staff", "Cover 0", "Cover 1", "Cover 2", "Cover 3", "Cover 4", "Cover 6", "Tampa 2"],
  manZone: ["Zone-heavy", "Balanced", "Man-heavy"],
  blitz: ["Four-man", "Occasional", "Aggressive"],
  runFit: ["Gap sound", "Attacking"],
  press: ["Off", "Mixed", "Press"],
  third: ["Default", "Move the chains", "Shot plays", "Run on short"],
  redZone: ["Default", "Power run", "Spread & quick", "Play action"],
  goalLine: ["Default", "Heavy run", "Play action", "Spread out"],
  twoMinute: ["Default", "Hurry-up"],
  fourth: ["Conservative", "Balanced", "Aggressive"],
  dThird: ["Default", "Dime zone", "Pressure", "Drop eight"],
  dRedZone: ["Default", "Tight man", "Bend"],
  prevent: ["Off", "On"],
  fakes: ["Never", "Rare"],
  onside: ["Never", "Trailing late"],
};
export function normalizePlan(plan) {
  const out = { ...PLAN_DEFAULTS };
  for (const [k, list] of Object.entries(PLAN_VALUES))
    if (plan && list.includes(plan[k])) out[k] = plan[k];
  return out;
}
export const isDefaultPlan = (plan) =>
  !plan || Object.entries(normalizePlan(plan)).every(([k, v]) => PLAN_DEFAULTS[k] === v);

// Formations and personnel the user sees, mapped onto the engine's alignments. The engine knows
// Shotgun spread (offset back), Singleback (back straight behind a shotgun quarterback, i.e.
// pistol depth), I formation (quarterback under center, back deep) and Empty backfield; 13
// personnel (three tight ends) is the engine's Goal Line group.
export const FORMATION_ENGINE = {
  Shotgun: "Shotgun spread",
  Singleback: "Singleback",
  Pistol: "Singleback",
  "I formation": "I formation",
  "Under center": "I formation",
  Empty: "Empty backfield",
};
export const ENGINE_FORMATION = { "Shotgun spread": "Shotgun", Singleback: "Singleback", "I formation": "I formation", "Empty backfield": "Empty" };
export const PERSONNEL_ENGINE = { 11: "11", 12: "12", 21: "21", 13: "Goal Line", 10: "10" };
// Engine coverage strings: the engine plays man when the string contains "Man", sends two extra
// rushers when it contains "blitz", and sets zone depth for Cover 3, Quarters, Tampa 2 and Prevent.
export const COVERAGE_ENGINE = {
  "Cover 0": { coverage: "Man blitz", shell: "Zero", man: true },
  "Cover 1": { coverage: "Man coverage", shell: "Single-High", man: true },
  "Cover 2": { coverage: "Cover 2", shell: "2-High" },
  "Cover 3": { coverage: "Cover 3", shell: "Single-High" },
  "Cover 4": { coverage: "Quarters", shell: "2-High" },
  "Cover 6": { coverage: "Quarters", shell: "2-High", split: "Cover 2" },
  "Tampa 2": { coverage: "Tampa 2", shell: "2-High" },
};
export const ENGINE_COVERAGES = ["Man blitz", "Man coverage", "Cover 2", "Cover 3", "Quarters", "Tampa 2", "Zone blitz", "Prevent"];
export const ENGINE_CALLS = ["Inside run", "Outside run", "Quick pass", "Short pass", "Screen", "Deep pass", "Play action", "Punt", "Field goal"];
// Run concepts: Duo is a downhill double-team run with no puller, closest to the engine's inside zone.
const RUN_ENGINE = {
  "Inside zone": { call: "Inside run", scheme: "Inside zone" },
  "Outside zone": { call: "Outside run", scheme: "Outside zone" },
  Power: { call: "Inside run", scheme: "Power" },
  Counter: { call: "Inside run", scheme: "Counter" },
  Duo: { call: "Inside run", scheme: "Inside zone" },
};
const PASS_ENGINE = { quick: "Quick pass", short: "Short pass", deep: "Deep pass", action: "Play action", screen: "Screen" };
// Scheme families: how runs and passes are split among concepts, plus the share of run calls
// that are run-pass options (RPO). Multiple keeps the original staff mix exactly.
export const SCHEME_MIX = {
  Multiple: null,
  "West Coast": { runs: { "Inside zone": 4, Power: 3, Counter: 2, "Outside zone": 1 }, passes: { quick: 52, short: 24, screen: 12, action: 6, deep: 6 } },
  "Air Raid": { runs: { "Inside zone": 6, Duo: 2, "Outside zone": 2 }, passes: { quick: 44, short: 26, deep: 10, screen: 14, action: 6 } },
  "Spread RPO": { runs: { "Inside zone": 5, Counter: 2, "Outside zone": 2, Duo: 1 }, passes: { quick: 52, screen: 18, short: 16, action: 7, deep: 7 }, rpo: 0.45 },
  "Wide zone": { runs: { "Outside zone": 6, "Inside zone": 3, Counter: 1 }, passes: { action: 14, quick: 44, short: 22, screen: 12, deep: 8 } },
  "Erhardt-Perkins": { runs: { "Inside zone": 4, Power: 3, "Outside zone": 3 }, passes: { short: 30, quick: 46, action: 8, deep: 8, screen: 8 } },
  "Power gap": { runs: { Power: 3, Counter: 3, Duo: 4 }, passes: { action: 12, quick: 50, short: 18, deep: 8, screen: 12 } },
};
const PASS_EMPHASIS = { "Quick game": "quick", Dropback: "short", "Play action": "action", Screens: "screen" };
const pick = (weights, r) => {
  const entries = Object.entries(weights).filter(([, w]) => w > 0),
    total = entries.reduce((n, [, w]) => n + w, 0);
  let x = r * total;
  for (const [k, w] of entries) if ((x -= w) < 0) return k;
  return entries.at(-1)[0];
};
function runPlay(m, plan, mix) {
  const weights = { ...(mix?.runs || {}) };
  // Without a scheme family the emphasised concept is half the runs; the staff pick the rest.
  if (!mix && plan.runConcept !== "Scheme" && roll(m, 12) >= 0.5) return { call: "Inside run" };
  if (plan.runConcept !== "Scheme") {
    const base = Object.values(weights).reduce((n, w) => n + w, 0);
    weights[plan.runConcept] = (weights[plan.runConcept] || 0) + Math.max(base, 1);
  }
  if (!Object.keys(weights).length) return { call: "Inside run" };
  return { ...RUN_ENGINE[pick(weights, roll(m, 11))] };
}
function passPlay(plan, mix, style, r) {
  // The play style tilts the shot rate as it does without a scheme.
  const tilt = { Balanced: [1, 1], "Run-first": [0.5, 1.8], "Vertical offense": [1.8, 0.6] }[style] || [1, 1];
  const weights = { ...mix.passes };
  weights.deep = (weights.deep || 0) * tilt[0];
  weights.action = (weights.action || 0) * tilt[1];
  const emphasis = PASS_EMPHASIS[plan.passConcept];
  if (emphasis) weights[emphasis] = (weights[emphasis] || 0) * 1.4 + 3;
  // Even the most aggressive NFL offenses keep deep shots and play action to about a fifth of
  // their throws; stacking a vertical style, a play-action emphasis and a shot-heavy scheme
  // tops out there instead of turning every pass into a bomb.
  const shots = (weights.deep || 0) + (weights.action || 0),
    total = Object.values(weights).reduce((n, w) => n + w, 0);
  if (total && shots / total > 0.22) {
    const k = (0.22 * (total - shots)) / (0.78 * shots);
    weights.deep = (weights.deep || 0) * k;
    weights.action = (weights.action || 0) * k;
  }
  return { call: PASS_ENGINE[pick(weights, r)] };
}
// Box count for run-pass options: a base front leaves the perimeter light, so the quarterback
// throws the quick route; against nickel and dime he hands off.
const heavyBox = (front) => ["4–3 base", "3–4 base"].includes(front);

// Fourth down: Balanced is the original rule (field goal from the opponent's 40, punt elsewhere,
// go for it only when trailing late). Conservative kicks only from the 37 in. Aggressive follows
// the analytics chart: short yardage in plus territory and the no-man's-land around the 40.
export function fourthDownDecision({ spot, toGo, quarter = 1, clock = 900, diff = 0 }, setting = "Balanced") {
  const late = quarter >= 4 && clock < 180,
    losing = diff < 0;
  if (setting === "Aggressive") {
    if (late && losing && (spot < 60 || diff < -3)) return "Go";
    if (toGo <= 1 && spot >= 30) return "Go";
    if (toGo <= 2 && spot >= 45) return "Go";
    if (toGo <= 4 && spot >= 55 && spot < 68) return "Go";
    if (toGo <= 2 && spot >= 90) return "Go";
    return spot >= 60 ? "Field goal" : "Punt";
  }
  if (setting === "Conservative") {
    if (late && losing && spot < 63) return "Go";
    return spot >= 63 ? "Field goal" : "Punt";
  }
  if (late && losing && spot < 60) return "Go";
  return spot >= 60 ? "Field goal" : "Punt";
}
const goCall = (toGo) =>
  toGo <= 2 ? { call: "Inside run", scheme: "Power" } : toGo <= 5 ? { call: "Quick pass" } : { call: "Short pass" };

// Situations, from the offense's point of view.
export function situation(m) {
  const diff = (m.score?.[m.poss] ?? 0) - (m.score?.[1 - m.poss] ?? 0),
    late = (m.quarter === 2 || m.quarter >= 4) && m.clock <= 120;
  return {
    diff,
    goalLine: m.spot >= 95 && m.down < 4,
    redZone: m.spot >= 80 && m.down < 4,
    twoMinute: late && m.down < 4 && (m.quarter === 2 || diff <= 0),
    third: m.down === 3,
    thirdLong: m.down === 3 && m.toGo >= 7,
    // From the offense's side: the defense leads by one to two scores in the final two minutes.
    preventLate: m.quarter >= 4 && m.clock <= 120 && diff < 0 && diff >= -16,
  };
}

// The offense's whole snap: call, run scheme, formation, personnel, tempo and the package used.
export function offenseSnap(m, { style = "Balanced", directives = {}, plan: rawPlan = null, front = "Nickel" } = {}) {
  const plan = normalizePlan(rawPlan),
    base = { formation: FORMATION_ENGINE[plan.formation], personnel: PERSONNEL_ENGINE[plan.personnel] },
    snap = (x, pkg = null, extra = {}) => ({ ...base, ...x, ...extra, pkg, fixed: "formation" in extra });
  if (m.down === 4) {
    const diff = m.score[m.poss] - m.score[1 - m.poss],
      choice = fourthDownDecision({ spot: m.spot, toGo: m.toGo, quarter: m.quarter, clock: m.clock, diff }, plan.fourth);
    // A fake is a rare surprise on a short fourth down, never in the last minutes.
    if (plan.fakes === "Rare" && m.toGo <= 3 && !(m.quarter >= 4 && m.clock < 300)) {
      if (choice === "Punt" && m.spot >= 35 && m.spot <= 55 && roll(m, 7) < 0.1) return snap(goCall(m.toGo), "Fake punt");
      if (choice === "Field goal" && m.spot >= 75 && roll(m, 7) < 0.08) return snap(goCall(m.toGo), "Fake field goal");
    }
    if (choice === "Go") {
      const late = m.quarter >= 4 && m.clock < 180 && diff < 0;
      // The original late-game rule always threw the quick pass.
      return snap(late && plan.fourth === "Balanced" ? { call: "Quick pass" } : goCall(m.toGo), "4th-down attempt");
    }
    return snap({ call: choice });
  }
  const sit = situation(m),
    r2 = roll(m, 3);
  // The base formation is the most-used set, not the only one: about 60% of early downs, and
  // under-center sets never on obvious passing downs, where the offense is in the gun.
  if (base.formation !== "Shotgun spread" && base.formation !== "Empty backfield") {
    const passingDown = m.down === 3 || (m.down === 2 && m.toGo >= 8);
    if ((base.formation === "I formation" && passingDown) || roll(m, 4) >= 0.6) base.formation = "Shotgun spread";
  }
  if (sit.goalLine && plan.goalLine !== "Default") {
    const g = plan.goalLine,
      heavy = { formation: "I formation", personnel: "Goal Line" };
    if (g === "Heavy run")
      return snap(r2 < 0.75 ? { call: "Inside run", scheme: r2 < 0.5 ? "Power" : "Inside zone" } : { call: "Play action" }, "Goal line", heavy);
    if (g === "Play action") return snap(r2 < 0.5 ? { call: "Play action" } : { call: "Inside run", scheme: "Power" }, "Goal line", heavy);
    return snap(r2 < 0.8 ? { call: "Quick pass" } : { call: "Screen" }, "Goal line", { formation: "Empty backfield", personnel: "10" });
  }
  if (sit.twoMinute && plan.twoMinute === "Hurry-up")
    return snap(r2 < 0.5 ? { call: "Quick pass" } : r2 < 0.85 ? { call: "Short pass" } : { call: "Deep pass" }, "Two-minute", {
      formation: "Shotgun spread",
      personnel: "11",
      tempo: "Hurry-up",
    });
  if (sit.redZone && plan.redZone !== "Default") {
    const z = plan.redZone;
    if (z === "Power run")
      return snap(r2 < 0.6 ? { call: "Inside run", scheme: r2 < 0.35 ? "Power" : "Inside zone" } : { call: "Play action" }, "Red zone", { formation: "I formation", personnel: "12" });
    if (z === "Spread & quick")
      return snap(r2 < 0.25 ? { call: "Inside run", scheme: "Inside zone" } : r2 < 0.75 ? { call: "Quick pass" } : r2 < 0.9 ? { call: "Short pass" } : { call: "Screen" }, "Red zone", { formation: "Shotgun spread", personnel: "11" });
    return snap(r2 < 0.45 ? { call: "Play action" } : r2 < 0.8 ? { call: "Inside run", scheme: "Inside zone" } : { call: "Quick pass" }, "Red zone");
  }
  if (sit.third && plan.third !== "Default") {
    const t = plan.third,
      g = m.toGo;
    if (t === "Run on short" && g <= 2) return snap({ call: "Inside run", scheme: "Power" }, "3rd down");
    if (t === "Move the chains")
      return snap(
        g <= 2 ? (r2 < 0.5 ? { call: "Inside run", scheme: "Power" } : { call: "Quick pass" }) : g <= 6 ? (r2 < 0.75 ? { call: "Quick pass" } : { call: "Short pass" }) : r2 < 0.4 ? { call: "Short pass" } : r2 < 0.7 ? { call: "Quick pass" } : { call: "Screen" },
        "3rd down",
      );
    if (t === "Shot plays")
      return snap(g >= 7 ? (r2 < 0.3 ? { call: "Deep pass" } : r2 < 0.55 ? { call: "Short pass" } : { call: "Quick pass" }) : r2 < 0.8 ? { call: "Quick pass" } : { call: "Play action" }, "3rd down");
  }
  const tempo = baseTempo(m, plan, sit),
    t = tempo ? { tempo } : {};
  if (directives?.feedRB && m.plays % 3 !== 0) return snap({ call: "Inside run" }, null, t);
  if (directives?.protectQB) return snap({ call: "Quick pass" }, null, t);
  const styleMix = STYLE_MIX[style] || STYLE_MIX.Balanced,
    r = roll(m),
    mix = SCHEME_MIX[plan.scheme];
  if (m.plays % styleMix.runEvery === 0) {
    // Nobody stands in an empty backfield to take a handoff: those snaps are quick throws and screens.
    if (base.formation === "Empty backfield") return snap({ call: roll(m, 8) < 0.75 ? "Quick pass" : "Screen" }, null, t);
    // Run-pass option: the quarterback reads the box and pulls it for a quick throw.
    const rpo = (mix?.rpo || 0) + (plan.passConcept === "RPO" ? 0.4 : 0);
    if (rpo && roll(m, 5) < rpo && roll(m, 6) < (heavyBox(front) ? 0.7 : 0.3))
      return snap({ call: roll(m, 8) < 0.7 ? "Quick pass" : "Screen" }, "RPO", t);
    return snap(runPlay(m, plan, mix), null, t);
  }
  if (!mix && !PASS_EMPHASIS[plan.passConcept])
    return snap({ call: r < styleMix.deep ? "Deep pass" : r < styleMix.deep + styleMix.action ? "Play action" : "Quick pass" }, null, t);
  return snap(passPlay(plan, mix || { passes: { quick: 76, deep: 12, action: 12 } }, style, r), null, t);
}
function baseTempo(m, plan, sit) {
  // Tempo offenses go no-huddle in waves (after first downs and on early downs), not every snap.
  if (plan.tempo === "Up-tempo") return m.down === 1 && m.plays % 2 === 0 ? "Hurry-up" : undefined;
  if (plan.tempo === "Ball control") return "Chew clock";
  if (plan.tempo === "Situational") {
    if (m.quarter >= 3 && sit.diff < 0) return "Hurry-up";
    if (m.quarter >= 4 && sit.diff > 0) return "Chew clock";
  }
  return undefined;
}

// The defense's snap for a staff-called (or simulated) defense: coverage, front and shell.
// "Staff" coverage keeps the original behaviour: the sideline call (or Cover 2) from the base front.
export function defenseSnap(m, { plan: rawPlan = null, defCall, front = "Nickel", shell = "2-High" } = {}) {
  const plan = normalizePlan(rawPlan),
    sit = situation(m),
    out = (coverage, f = front, sh = shell, pkg = null) => ({ coverage, front: f, shell: sh, pkg }),
    r = roll(m, 21),
    r2 = roll(m, 22);
  if (plan.prevent === "On" && sit.preventLate) return out("Prevent", "Dime", "2-High", "Prevent");
  if (sit.redZone && plan.dRedZone !== "Default")
    return plan.dRedZone === "Tight man"
      ? r < 0.3
        ? out("Man blitz", "Nickel", "Zero", "Red zone")
        : out("Man coverage", "Nickel", "Single-High", "Red zone")
      : out(r < 0.5 ? "Tampa 2" : "Cover 2", "4–3 base", "2-High", "Red zone");
  if (sit.thirdLong && plan.dThird !== "Default") {
    if (plan.dThird === "Dime zone") return out(r < 0.5 ? "Quarters" : "Cover 3", "Dime", r < 0.5 ? "2-High" : "Single-High", "3rd & long");
    if (plan.dThird === "Pressure") return out(r < 0.5 ? "Zone blitz" : "Man blitz", "Nickel", r < 0.5 ? "Single-High" : "Zero", "3rd & long");
    return out(r < 0.5 ? "Tampa 2" : "Cover 2", "Dime", "2-High", "3rd & long");
  }
  const early = m.down <= 2,
    blitzRate = { "Four-man": 0, Occasional: 0.15, Aggressive: 0.3 }[plan.blitz] + (plan.runFit === "Attacking" && early ? 0.08 : 0);
  // Attacking run fits rotate a safety into the box on early downs: an eight-man front.
  const boxShell = (sh) => (plan.runFit === "Attacking" && early && sh === "2-High" ? "Single-High" : sh);
  if (plan.coverage === "Staff") {
    const base = defCall || "Cover 2";
    if (blitzRate && r2 < blitzRate && !/blitz/i.test(base)) return out(/Man/.test(base) ? "Man blitz" : "Zone blitz", front, boxShell(shell));
    return out(base, front, boxShell(shell));
  }
  // Primary coverage on most snaps; the man/zone lean and press technique pick the change-up.
  let call = plan.coverage;
  const manShare = { "Zone-heavy": 0.1, Balanced: 0.3, "Man-heavy": 0.55 }[plan.manZone] + (plan.press === "Press" ? 0.15 : plan.press === "Off" ? -0.1 : 0),
    primaryMan = !!COVERAGE_ENGINE[call].man;
  if (r >= 0.6) {
    const wantMan = (r - 0.6) / 0.4 < Math.max(0, manShare);
    if (wantMan && !primaryMan) call = "Cover 1";
    else if (!wantMan && primaryMan) call = "Cover 3";
    else if (!wantMan) call = call === "Cover 3" ? "Cover 4" : "Cover 3";
  }
  const c = COVERAGE_ENGINE[call];
  let coverage = c.split && r2 < 0.5 ? c.split : c.coverage;
  if (blitzRate && roll(m, 23) < blitzRate && !/blitz/.test(coverage)) coverage = c.man ? "Man blitz" : "Zone blitz";
  return out(coverage, front, boxShell(c.shell));
}

// Onside kick after a late score that still leaves the kicking team behind. A normal kickoff
// gives the receiver the touchback; an onside try is recovered about one time in eight, and a
// failed one hands the opponent a short field.
export function onsideKick(prev, next, side, setting, r) {
  if (setting !== "Trailing late" || !next || next.finished || next.halftime) return null;
  const scored = next.score[side] > prev.score[side] && next.poss !== side;
  if (!scored || next.quarter < 4 || next.clock > 300) return null;
  const diff = next.score[side] - next.score[1 - side];
  if (diff >= 0 || diff < -16) return null;
  if (r < 0.12) {
    next.poss = side;
    next.spot = 48;
    next.down = 1;
    next.toGo = 10;
    return "recovered";
  }
  next.spot = 55;
  return "failed";
}
export const snapRoll = roll;

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

// A staff defense matches the offense's personnel and formation, as NFL defenses do: base fronts
// with a safety in the box against heavy sets and the I formation, nickel against 11 personnel
// (the original default), dime against four or more receivers and empty.
export function matchPersonnel(formation, personnel) {
  if (personnel === "Goal Line" || personnel === "21" || formation === "I formation") return { front: "4–3 base", shell: "Single-High" };
  if (personnel === "12") return { front: "4–3 base", shell: "2-High" };
  if (personnel === "10" || formation === "Empty backfield") return { front: "Dime", shell: "2-High" };
  return { front: "Nickel", shell: "2-High" };
}

// The opponent's offensive coordinator studies the user's defensive plan on film and calls into
// its weakness: deep shots and play action against man coverage, pressure and loaded boxes;
// runs against light two-deep shells. The original Staff plan meets the original balanced mix.
export function counterStyle(rawPlan) {
  const p = normalizePlan(rawPlan);
  if (p.coverage === "Staff" && p.blitz === "Four-man" && p.runFit === "Gap sound" && p.press !== "Press") return "Balanced";
  const man = COVERAGE_ENGINE[p.coverage]?.man || p.manZone === "Man-heavy" || p.press === "Press";
  if (man || p.blitz === "Aggressive" || p.runFit === "Attacking") return "Vertical offense";
  if (["Cover 2", "Cover 4", "Cover 6", "Tampa 2"].includes(p.coverage) && p.manZone === "Zone-heavy") return "Run-first";
  return "Balanced";
}
