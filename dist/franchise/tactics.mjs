// NFL-style game plan: scheme families, personnel, formations, concepts, coverages, situational
// packages and the fourth-down chart, with plain-English explanations and a scheme-fit read of
// the roster. Pure functions over state; the sim mapping lives in play-calling.mjs so the fast
// worker can use it without this module. Saves without a plan read as PLAN_DEFAULTS, which
// reproduce the original staff behaviour.
import {
  PLAN_DEFAULTS,
  PLAN_VALUES,
  FORMATION_ENGINE,
  ENGINE_FORMATION,
  normalizePlan,
  fourthDownDecision,
} from "./play-calling.mjs";
import { effectiveAttributes } from "./ratings.mjs";

// Every option: label shown on the button, a short sub-line and a plain-English tooltip.
const o = (value, sub, tip, label = value) => ({ value, label, sub, tip });
export const OPTIONS = {
  scheme: {
    label: "Scheme family",
    side: "offense",
    help: "The system your offense is built on. It decides which runs and passes your staff call, and which players thrive.",
    options: [
      o("Multiple", "A bit of everything", "No single system: the staff mix quick passes and inside runs with the odd shot. Nobody is out of place, nobody gets a boost."),
      o("West Coast", "Timing throws", "Bill Walsh's system: short, timed passes (slants, flats, crossers) used like runs to move the chains. Needs an accurate, smart quarterback and sure-handed receivers."),
      o("Air Raid", "Spread & throw", "Four or five receivers spread wide, lots of quick throws and some deep ones. Needs a strong-armed passer, route runners and a line that pass-protects."),
      o("Spread RPO", "Run-pass options", "Run-pass options: on a run call the quarterback reads the defense and may pull the ball to throw. A mobile quarterback makes it work."),
      o("Wide zone", "Shanahan style", "The Shanahan/McVay system: outside-zone runs stretch the defense sideways, then bootlegs and play action hit behind it. Needs an athletic line and a one-cut back."),
      o("Erhardt-Perkins", "Concept-based", "The Patriots' system: the same pass concepts from many formations, with tight ends doing both jobs. Rewards a smart quarterback and versatile tight ends."),
      o("Power gap", "Downhill runs", "Man-on-man blocking with pulling guards: power and counter runs straight at the defense, then play action. Needs a strong line and a powerful back."),
    ],
  },
  personnel: {
    label: "Base personnel",
    side: "offense",
    help: "Who is on the field. The first digit is running backs, the second tight ends; the rest are wide receivers.",
    options: [
      o("11", "1 RB · 1 TE · 3 WR", "The NFL's most common group (about 60% of snaps): three receivers keep the defense in nickel."),
      o("12", "1 RB · 2 TE · 2 WR", "Two tight ends: the defense must respect the run and usually answers with a base front."),
      o("21", "2 RB · 1 TE · 2 WR", "A fullback leads the way. Defenses load the box with a safety down."),
      o("13", "1 RB · 3 TE · 1 WR", "Three tight ends: a heavy, physical group for short yardage and power runs."),
      o("10", "1 RB · 0 TE · 4 WR", "Four receivers: spreads the field and pulls defenses into dime."),
    ],
  },
  formation: {
    label: "Base formation",
    side: "offense",
    help: "Where the quarterback and back line up on early downs. On obvious passing downs every team is in the shotgun.",
    options: [
      o("Shotgun", "QB 5 yds back", "The quarterback stands five yards deep with the back beside him: sees the field, gets the ball out fast."),
      o("Singleback", "One back", "One back behind the quarterback: balanced between run and pass."),
      o("Pistol", "Back behind QB", "A short shotgun with the back directly behind: downhill runs and read options from the gun."),
      o("I formation", "Fullback lead", "Quarterback under center, fullback and tailback stacked behind: a classic power-running set."),
      o("Under center", "Play-action base", "Quarterback takes the snap from the center: the best set for play-action fakes and wide-zone runs."),
      o("Empty", "No back", "Nobody in the backfield, five receivers out: every snap is a quick throw or a screen."),
    ],
  },
  runConcept: {
    label: "Run concept",
    side: "offense",
    help: "The main blocking scheme on run plays.",
    options: [
      o("Scheme", "From scheme", "Use the mix that comes with your scheme family.", "Scheme mix"),
      o("Inside zone", "Read the A/B gap", "Linemen block an area together; the back reads the defense and cuts inside or bounces."),
      o("Outside zone", "Stretch the edge", "Linemen move laterally and the back aims for the edge, cutting back when a crease opens."),
      o("Power", "Guard pulls", "Down blocks on the play side, the backside guard pulls to kick out or lead through the hole."),
      o("Counter", "Misdirection", "The back steps one way, then follows two pullers the other way. Needs a back behind the quarterback."),
      o("Duo", "Double teams", "Downhill run with double teams and no pullers: the back reads one linebacker and hits it hard."),
    ],
  },
  passConcept: {
    label: "Pass emphasis",
    side: "offense",
    help: "Which kind of throw your staff lean on.",
    options: [
      o("Scheme", "From scheme", "Use the pass mix that comes with your scheme family.", "Scheme mix"),
      o("Quick game", "3-step drops", "Slants, hitches and outs out in under two seconds: beats the pass rush, few big plays."),
      o("Dropback", "Intermediate", "Five-step drops to 10–15-yard routes: more yards per throw, more risk of interceptions."),
      o("Play action", "Fake the run", "Fake a handoff to freeze linebackers, then throw behind them. Big plays, needs a run game."),
      o("Screens", "Let them rush", "Let the rush come and dump it to a back or receiver with blockers in front."),
      o("RPO", "Read the box", "Pair runs with a quick throw: if the defense loads the box the quarterback throws."),
    ],
  },
  tempo: {
    label: "Tempo",
    side: "offense",
    help: "How fast your offense gets to the line between snaps.",
    options: [
      o("Normal", "Standard huddle", "Huddle up and use a normal amount of play clock."),
      o("Up-tempo", "No huddle", "No huddle all game: more snaps for both teams, a tired defense, a higher-scoring game."),
      o("Ball control", "Bleed the clock", "Use the whole play clock: fewer possessions for both sides and a shorter game."),
      o("Situational", "Fast when behind", "Hurry when trailing in the second half, bleed the clock when leading in the fourth."),
    ],
  },
  front: {
    label: "Base front",
    side: "defense",
    help: "How many linemen, linebackers and defensive backs start on early downs.",
    options: [
      o("4–3 base", "4 DL · 3 LB", "Four down linemen and three linebackers: built to stop the run."),
      o("3–4 base", "3 DL · 4 LB", "Three big linemen and four linebackers: disguises which linebacker rushes."),
      o("Nickel", "4-2-5", "A fifth defensive back replaces a linebacker: today's NFL base defense against three receivers."),
      o("Dime", "Six DBs", "Six defensive backs for obvious passing downs: fast, but light against the run."),
    ],
  },
  coverage: {
    label: "Coverage shell",
    side: "defense",
    help: "The main pass coverage. The number is roughly how many defenders split the deep field.",
    options: [
      o("Staff", "Staff mix", "Your defensive staff stay in their standard Cover 2 and follow your sideline calls.", "Staff mix"),
      o("Cover 0", "All-out man", "Man-to-man with nobody deep and extra rushers: maximum pressure, no safety net."),
      o("Cover 1", "Man + 1 deep", "Man-to-man with one free safety deep: tight coverage, a safety down near the box."),
      o("Cover 2", "2 deep halves", "Two safeties split the deep field, corners sit on short routes: limits big plays."),
      o("Cover 3", "3 deep thirds", "Three deep zones and four underneath: sound against the run and the deep ball."),
      o("Cover 4", "Quarters", "Four defenders split the deep field: stops explosive passes, gives up underneath."),
      o("Cover 6", "Quarter-half", "Quarters to one side, Cover 2 to the other: disguise against a strong side."),
      o("Tampa 2", "Deep middle LB", "Cover 2 with the middle linebacker running deep down the seam: needs a rangy linebacker."),
    ],
  },
  manZone: {
    label: "Man vs zone",
    side: "defense",
    help: "Your change-up coverage when you are not in the main shell.",
    options: [
      o("Zone-heavy", "Eyes on the QB", "Mostly zone: defenders watch the quarterback and rally to the ball."),
      o("Balanced", "Mix it up", "A mix of man and zone so the quarterback cannot read the coverage pre-snap."),
      o("Man-heavy", "Lock on", "Mostly man-to-man: tight coverage, but a beaten defender means a big play."),
    ],
  },
  blitz: {
    label: "Blitz rate",
    side: "defense",
    help: "How often you send extra rushers.",
    options: [
      o("Four-man", "Rush four", "Rush the four down linemen and drop seven into coverage."),
      o("Occasional", "~15% of snaps", "Send a linebacker or defensive back now and then to keep the offense guessing."),
      o("Aggressive", "~30% of snaps", "Blitz often: more sacks and hurried throws, but blitz beaters (deep shots) hit harder."),
    ],
  },
  runFit: {
    label: "Run fits",
    side: "defense",
    help: "How your front plays the run.",
    options: [
      o("Gap sound", "Hold your gap", "Every defender owns a gap and holds it: few big runs, few tackles for loss."),
      o("Attacking", "Shoot gaps", "Linemen penetrate and a safety rotates into the box on early downs: more stops behind the line, more risk deep."),
    ],
  },
  press: {
    label: "Corner technique",
    side: "defense",
    help: "Where cornerbacks line up against receivers.",
    options: [
      o("Off", "Cushion", "Corners play 7–8 yards off: keep everything in front, give up short throws."),
      o("Mixed", "Vary it", "Mix press and off alignments by down and distance."),
      o("Press", "Jam at the line", "Corners jam receivers at the line to wreck timing. Needs physical, fast corners."),
    ],
  },
  third: {
    label: "3rd down",
    side: "offense",
    help: "Your call sheet on third down.",
    options: [
      o("Default", "Base plan", "Keep calling the base plan: no special package here."),
      o("Move the chains", "Sticks routes", "Throw to the first-down marker: quick game when short, intermediate routes and screens when long."),
      o("Shot plays", "Go deep on long", "On 3rd and long take deep shots; on short yardage, quick throws and play action."),
      o("Run on short", "Power on 3rd & 1-2", "Run power on 3rd and two or less; otherwise the base plan."),
    ],
  },
  redZone: {
    label: "Red zone",
    side: "offense",
    help: "Inside the opponent's 20, where the field shrinks.",
    options: [
      o("Default", "Base plan", "Keep calling the base plan: no special package here."),
      o("Power run", "12 personnel", "Two tight ends and the I formation: pound the ball, play action off it."),
      o("Spread & quick", "Spread them out", "Spread the field with three receivers and throw quick slants and fades."),
      o("Play action", "Fake & throw", "Sell the run and throw behind the linebackers."),
    ],
  },
  goalLine: {
    label: "Goal line",
    side: "offense",
    help: "Inside the opponent's 5.",
    options: [
      o("Default", "Base plan", "Keep calling the base plan: no special package here."),
      o("Heavy run", "Jumbo set", "Three tight ends, fullback lead: run it in behind the big bodies."),
      o("Play action", "Jumbo fake", "Line up heavy, fake the run and throw to a leaking tight end."),
      o("Spread out", "Empty set", "Empty the backfield and throw quick before the rush arrives."),
    ],
  },
  twoMinute: {
    label: "Two-minute drill",
    side: "offense",
    help: "Last two minutes of the half, or of the game when tied or behind.",
    options: [
      o("Default", "Base plan", "Keep calling the base plan at the sideline's tempo."),
      o("Hurry-up", "No huddle", "No huddle, shotgun, sideline and middle-of-the-field throws to save time."),
    ],
  },
  fourth: {
    label: "4th-down aggressiveness",
    side: "offense",
    help: "When your head coach goes for it instead of punting or kicking.",
    options: [
      o("Conservative", "Kick it", "Old-school: punt or kick a field goal unless trailing late; field goals only from the 37 in."),
      o("Balanced", "Traditional", "Field goals from the opponent's 40 in, punts elsewhere; go for it only when trailing late."),
      o("Aggressive", "Analytics", "The analytics chart: go on 4th and short in plus territory and on 4th and medium around midfield."),
    ],
  },
  dThird: {
    label: "3rd & long",
    side: "defense",
    help: "Third down with 7 or more yards to go.",
    options: [
      o("Default", "Base plan", "Keep the base plan: no special call in this situation."),
      o("Dime zone", "Six DBs, deep zones", "Six defensive backs in Cover 3 or Quarters: keep everything in front of the sticks."),
      o("Pressure", "Blitz", "Nickel with a zone or man blitz to force a hurried throw."),
      o("Drop eight", "Eight in coverage", "Rush three, drop eight (Cover 2 / Tampa 2): take away every throwing lane."),
    ],
  },
  dRedZone: {
    label: "Red-zone defense",
    side: "defense",
    help: "Defending inside your own 20.",
    options: [
      o("Default", "Base plan", "Keep the base plan: no special call in this situation."),
      o("Tight man", "Man + blitz", "Tight man coverage (with the odd Cover 0 blitz) when the field is short."),
      o("Bend", "Don't break", "Bend, don't break: a bigger 4–3 front in Cover 2 / Tampa 2 gives up short gains, never the touchdown over the top."),
    ],
  },
  prevent: {
    label: "Prevent defense",
    side: "defense",
    help: "Final two minutes when you lead by one or two scores.",
    options: [
      o("Off", "Normal defense", "Keep playing your normal defense late."),
      o("On", "Protect the lead", "Dime personnel and deep zones: allow short completions, never the big play."),
    ],
  },
  fakes: {
    label: "Fake punts & kicks",
    side: "special",
    help: "Surprise fakes on short fourth downs.",
    options: [
      o("Never", "Off", "Your special teams never fake."),
      o("Rare", "Now and then", "On 4th and 3 or less, about one punt in ten (and one field goal in twelve) is a fake."),
    ],
  },
  onside: {
    label: "Onside kicks",
    side: "special",
    help: "Kicking short to try to get the ball back.",
    options: [
      o("Never", "Off", "Always kick deep and cover the return."),
      o("Trailing late", "Last 5 minutes", "After a score in the last five minutes that still leaves you behind: about one in eight is recovered; a miss gives a short field."),
    ],
  },
};
export const PLAN_KEYS = Object.keys(PLAN_DEFAULTS);
export const SECTIONS = {
  base: { offense: ["scheme", "personnel", "formation"], defense: ["front", "coverage", "blitz"] },
  situational: { offense: ["third", "redZone", "goalLine", "twoMinute"], defense: ["dThird", "dRedZone", "prevent"] },
  advanced: { offense: ["runConcept", "passConcept", "tempo"], defense: ["manZone", "press", "runFit"], special: ["fakes", "onside"] },
};
export const optionOf = (key, value) => OPTIONS[key]?.options.find((x) => x.value === value);

// The plan in effect: the stored plan merged over defaults, with the formation and front kept in
// step with the original coach fields (coach.offense / coach.defense).
export function planOf(s) {
  const raw = s.coach?.plan || {},
    p = normalizePlan(raw);
  if (!PLAN_VALUES.formation.includes(raw.formation)) p.formation = ENGINE_FORMATION[s.coach?.offense] || PLAN_DEFAULTS.formation;
  p.front = OPTIONS.front.options.some((x) => x.value === s.coach?.defense) ? s.coach.defense : "Nickel";
  return p;
}
export function setPlanValue(s, key, value) {
  if (key === "front") {
    if (!OPTIONS.front.options.some((x) => x.value === value)) throw Error("Choose a defensive front.");
    s.coach.defense = value;
    return value;
  }
  if (!PLAN_VALUES[key]?.includes(value)) throw Error("Choose a valid option.");
  s.coach.plan = { ...(s.coach.plan || {}), [key]: value };
  if (key === "formation") s.coach.offense = FORMATION_ENGINE[value];
  return value;
}

/* ------------------------------------------------------------------------- roster profile */
const available = (p) => !p.injury && !p.holdout && !["ir", "practice", "suspended"].includes(p.status || "active");
const attr = (p, key) => effectiveAttributes(p)?.[key] ?? p.ovr ?? 60;
const avg = (a) => (a.length ? a.reduce((n, x) => n + x, 0) / a.length : 60);
export function rosterProfile(players) {
  const list = (players || []).filter(available),
    top = (pos, n) => list.filter((p) => pos.includes(p.pos)).sort((a, b) => b.ovr - a.ovr).slice(0, n),
    g = (ps, keys) => Math.round(avg(ps.flatMap((p) => keys.map((k) => attr(p, k))))),
    qb = top(["QB"], 1),
    wr = top(["WR"], 3),
    te = top(["TE"], 1),
    rb = top(["RB"], 1),
    ol = top(["OL"], 5),
    dl = top(["DL"], 4),
    lb = top(["LB"], 3),
    cb = top(["CB"], 3),
    sf = top(["S"], 2);
  return {
    qbShort: g(qb, ["throwAccuracyShort", "awareness"]),
    qbArm: g(qb, ["throwPower", "throwAccuracyDeep"]),
    qbMobile: g(qb, ["speed", "agility"]),
    wrSpeed: g(wr, ["speed"]),
    wrRoutes: g(wr, ["shortRouteRunning", "catching"]),
    teBlock: g(te, ["runBlock"]),
    teCatch: g(te, ["catching"]),
    rbPower: g(rb, ["breakTackle", "carrying"]),
    rbSpeed: g(rb, ["speed", "agility"]),
    olRun: g(ol, ["runBlock", "strength"]),
    olPass: g(ol, ["passBlock"]),
    olMove: g(ol, ["runBlock", "agility"]),
    dlRush: g(dl, ["strength", "speed"]),
    dlRun: g(dl, ["strength", "tackle"]),
    lbSpeed: g(lb, ["speed", "zoneCoverage"]),
    lbRun: g(lb, ["tackle", "strength"]),
    cbMan: g(cb, ["manCoverage", "speed"]),
    cbZone: g(cb, ["zoneCoverage", "awareness"]),
    cbPress: g(cb, ["manCoverage", "strength", "speed"]),
    cbDepth: Math.round(avg(cb.map((p) => p.ovr))),
    sZone: g(sf, ["zoneCoverage", "speed"]),
  };
}
// Factors: [profile key, weight, scouting label].
const FIT = {
  Multiple: [["qbShort", 1, "QB accuracy"], ["wrRoutes", 1, "Receiver routes"], ["olPass", 1, "Pass protection"], ["olRun", 1, "Run blocking"], ["rbPower", 1, "Back"]],
  "West Coast": [["qbShort", 3, "QB short accuracy and reads"], ["wrRoutes", 3, "Receiver route running"], ["olPass", 2, "Pass protection"], ["rbSpeed", 1, "Back in space"]],
  "Air Raid": [["qbArm", 3, "QB arm"], ["wrRoutes", 2, "Receiver route running"], ["wrSpeed", 2, "Receiver speed"], ["olPass", 2, "Pass protection"]],
  "Spread RPO": [["qbMobile", 3, "QB mobility"], ["qbShort", 2, "QB quick reads"], ["rbSpeed", 2, "Back's burst"], ["wrRoutes", 1, "Receiver routes"], ["olRun", 1, "Run blocking"]],
  "Wide zone": [["olMove", 3, "Athletic offensive line"], ["rbSpeed", 2, "One-cut back"], ["qbArm", 1, "QB on bootlegs"], ["teBlock", 1, "Tight end blocking"], ["wrSpeed", 1, "Receivers after the catch"]],
  "Erhardt-Perkins": [["qbShort", 3, "QB processing"], ["teCatch", 2, "Tight end as a receiver"], ["teBlock", 1, "Tight end blocking"], ["wrRoutes", 2, "Receiver routes"], ["olPass", 1, "Pass protection"]],
  "Power gap": [["olRun", 3, "Line strength"], ["rbPower", 3, "Powerful back"], ["teBlock", 2, "Tight end blocking"], ["qbArm", 1, "Play-action passing"]],
  Man: [["cbMan", 3, "Corners in man coverage"], ["sZone", 1, "Deep safety range"], ["dlRush", 1, "Pass rush"]],
  Zone: [["cbZone", 2, "Corners in zone"], ["sZone", 2, "Safeties in zone"], ["lbSpeed", 2, "Linebackers in coverage"]],
  Press: [["cbPress", 3, "Physical, fast corners"], ["sZone", 1, "Deep help"]],
  "4–3 base": [["dlRun", 2, "Defensive line"], ["lbRun", 2, "Linebackers against the run"]],
  "3–4 base": [["lbSpeed", 2, "Linebackers rushing and dropping"], ["dlRun", 2, "Big two-gap linemen"]],
  Nickel: [["cbDepth", 2, "Three starting-quality corners"], ["dlRush", 2, "Four-man pass rush"]],
  Dime: [["cbDepth", 2, "Depth at corner"], ["sZone", 2, "Safety range"], ["dlRush", 1, "Pass rush"]],
};
const scale = (raw) => Math.max(0, Math.min(100, Math.round((raw - 55) * 2.5)));
export function fitScore(profile, family) {
  const factors = FIT[family].map(([key, w, label]) => ({ key, w, label, value: profile[key] }));
  const raw = factors.reduce((n, f) => n + f.value * f.w, 0) / factors.reduce((n, f) => n + f.w, 0),
    sorted = factors.slice().sort((a, b) => b.value - a.value),
    best = sorted[0],
    worst = sorted.at(-1);
  return {
    family,
    fit: scale(raw),
    best,
    worst,
    note: `${best.label} (${best.value}) ${best.value >= 80 ? "is a real weapon" : best.value >= 70 ? "carries it" : "is only average"}${worst !== best ? `; ${worst.label.toLowerCase()} (${worst.value}) ${worst.value < 65 ? "is a liability" : worst.value < 75 ? "is the weak spot" : "holds up"}` : ""}.`,
  };
}
const OFFENSE_FAMILIES = PLAN_VALUES.scheme;
export function schemeFit(s, team = s.team) {
  const players = team === s.team ? s.roster : s.franchise?.clubs?.[team]?.players,
    profile = rosterProfile(players);
  return {
    profile,
    offense: OFFENSE_FAMILIES.map((f) => fitScore(profile, f)),
    coverage: ["Man", "Zone", "Press"].map((f) => fitScore(profile, f)),
    fronts: ["4–3 base", "3–4 base", "Nickel", "Dime"].map((f) => fitScore(profile, f)),
  };
}
const coverageFamily = (c) => (["Cover 0", "Cover 1"].includes(c) ? "Man" : "Zone");
// Scheme fit in the sim: a small rating change (at most 1.5 overall points) for the players who
// run the chosen scheme, relative to the do-everything Multiple scheme and the staff coverage mix.
export function schemeBoost(s, plan = planOf(s)) {
  const fit = schemeFit(s),
    by = (list, f) => list.find((x) => x.family === f)?.fit ?? 50,
    clamp = (v) => Math.round(Math.max(-1.5, Math.min(1.5, v)) * 2) / 2,
    boost = {};
  if (plan.scheme !== "Multiple") {
    const d = clamp((by(fit.offense, plan.scheme) - by(fit.offense, "Multiple")) / 12);
    if (d) for (const pos of ["QB", "RB", "WR", "TE", "OL"]) boost[pos] = d;
  }
  if (plan.coverage !== "Staff") {
    const fam = coverageFamily(plan.coverage),
      d = clamp((by(fit.coverage, fam) - (by(fit.coverage, "Man") + by(fit.coverage, "Zone")) / 2) / 12);
    if (d) for (const pos of ["CB", "S", "LB"]) boost[pos] = d;
  }
  if (plan.press === "Press") boost.CB = clamp((boost.CB || 0) + (by(fit.coverage, "Press") - 55) / 20);
  for (const k of Object.keys(boost)) if (!boost[k]) delete boost[k];
  return boost;
}
// The fast-worker job's tactics: the original style plus the full plan and its fit boost.
export function jobTactics(s, extra = {}) {
  const plan = planOf(s),
    out = { style: s.coach?.style, ...extra };
  // An untouched plan sends nothing new, so old careers simulate exactly as before.
  if (!s.coach?.plan && plan.formation === "Shotgun" && plan.front === "Nickel") return out;
  return { ...out, plan, formation: FORMATION_ENGINE[plan.formation], front: plan.front, boost: schemeBoost(s, plan) };
}

/* ------------------------------------------------------------------- fourth-down chart */
export const CHART_ZONES = [
  { label: "Own 1–29", spot: 20 },
  { label: "Own 30–44", spot: 37 },
  { label: "Midfield", spot: 50 },
  { label: "Opp 44–41", spot: 57 },
  { label: "Opp 40–33", spot: 64 },
  { label: "Opp 32–11", spot: 78 },
  { label: "Opp 10–1", spot: 93 },
];
export const CHART_DISTANCES = [
  { label: "1", toGo: 1 },
  { label: "2", toGo: 2 },
  { label: "3–4", toGo: 4 },
  { label: "5–7", toGo: 6 },
  { label: "8+", toGo: 10 },
];
export function fourthChart(setting) {
  return CHART_DISTANCES.map((d) => ({
    ...d,
    cells: CHART_ZONES.map((z) => fourthDownDecision({ spot: z.spot, toGo: Math.min(d.toGo, 100 - z.spot) }, setting)),
  }));
}

/* ------------------------------------------------------------- opponent vs your plan */
// Scouting notes that set the opponent's tendencies against the user's plan and roster.
export function matchupNotes(s, report) {
  if (!report) return [];
  const plan = planOf(s),
    t = report.tendencies,
    mine = schemeFit(s).profile,
    theirs = schemeFit(s, report.team).profile,
    unit = (k) => report.units.find((u) => u.key === k),
    notes = [],
    add = (tone, text) => notes.push({ tone, text });
  const man = ["Cover 0", "Cover 1"].includes(plan.coverage) || plan.manZone === "Man-heavy" || plan.press === "Press";
  if (t.coverage === "Man coverage")
    add(mine.wrSpeed >= 85 ? "good" : "warn", `They play man coverage. ${mine.wrSpeed >= 85 ? `Your receivers' speed (${mine.wrSpeed}) wins those races: shots and play action are open.` : `Your receivers (speed ${mine.wrSpeed}) will need rub routes and quick game to get free.`}`);
  else if (t.coverage === "Blitz-heavy")
    add(plan.passConcept === "Quick game" || plan.passConcept === "Screens" || plan.scheme === "West Coast" ? "good" : "warn", `They blitz a lot. ${plan.passConcept === "Quick game" || plan.passConcept === "Screens" || plan.scheme === "West Coast" ? "Your quick game and screens are the right answer." : "Quick game or screens (Advanced → Pass emphasis) beat the pressure."}`);
  else add("", `They sit in zone. ${mine.qbShort >= 80 ? `Your quarterback's accuracy (${mine.qbShort}) can pick it apart underneath.` : "Patient, underneath throws and the run game beat zone."}`);
  if (t.lean === "Pass-heavy")
    add(["Nickel", "Dime"].includes(plan.front) ? "good" : "warn", `They throw ${t.pass}% of the time. ${["Nickel", "Dime"].includes(plan.front) ? `Your ${plan.front} keeps an extra defensive back on the field.` : `Your ${plan.front} leaves a linebacker in coverage; consider Nickel.`}`);
  else if (t.lean === "Run-heavy")
    add(["4–3 base", "3–4 base"].includes(plan.front) || plan.runFit === "Attacking" ? "good" : "warn", `They run ${t.run}% of the time. ${["4–3 base", "3–4 base"].includes(plan.front) || plan.runFit === "Attacking" ? "Your bigger front is built for it." : "A base front or attacking run fits would load the box."}`);
  if (man && theirs.qbArm >= 85) add("bad", `Your man-heavy plan invites deep shots, and their quarterback has the arm for it (${theirs.qbArm}). Expect play action.`);
  if (plan.blitz === "Aggressive" && theirs.qbShort >= 85) add("warn", `Their quarterback gets the ball out quickly (accuracy ${theirs.qbShort}); heavy blitzing may not get home.`);
  const dl = unit("DL")?.rating ?? 70;
  if (dl - mine.olPass >= 6) add("bad", `Their pass rush (DL ${dl}) out-matches your pass protection (${mine.olPass}). Quick game or screens protect the quarterback.`);
  if (["Power gap", "Wide zone"].includes(plan.scheme) && (unit("DL")?.rating ?? 70) + (unit("LB")?.rating ?? 70) / 2 < mine.olRun + 30)
    add("good", "Their front is beatable on the ground: your run scheme should find room.");
  return notes.slice(0, 4);
}
