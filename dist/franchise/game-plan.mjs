import { allowed } from "./state.mjs";

// Game plan settings are the existing match settings. The engine decides results;
// this module only reads opponents and writes those settings.
export const STYLES = {
  Balanced: "A mix of runs and passes.",
  "Run-first": "Runs on early downs, then play action.",
  "Vertical offense": "Deep shots. More big plays, more incompletions.",
};
export const FORMATIONS = [
  "Shotgun spread",
  "Singleback",
  "I formation",
  "Empty backfield",
];
export const FRONTS = ["4–3 base", "3–4 base", "Nickel", "Dime"];
export const DIRECTIVES = {
  protectQB: "Protect the quarterback with quick passes",
  feedRB: "Feed the lead running back",
  rookies: "Play young players in late blowouts",
  halftime: "Speed up when trailing at halftime",
};
export const CALLING = {
  Manual: "You call every snap",
  "Head coach": "Your assistant calls plays",
};
const UNITS = {
  QB: { label: "Quarterback", side: "offense", pos: ["QB"], n: 1 },
  REC: { label: "Receivers", side: "offense", pos: ["WR", "TE"], n: 4 },
  RB: { label: "Running backs", side: "offense", pos: ["RB"], n: 1 },
  OL: { label: "Offensive line", side: "offense", pos: ["OL"], n: 5 },
  DL: { label: "Defensive line", side: "defense", pos: ["DL"], n: 4 },
  LB: { label: "Linebackers", side: "defense", pos: ["LB"], n: 3 },
  DB: { label: "Secondary", side: "defense", pos: ["CB", "S"], n: 5 },
};
const roster = (s, t) =>
  (t === s.team ? s.roster : s.franchise.clubs[t]?.players) || [];
const available = (p) => !p.injury && (p.status || "active") !== "ir";
const avg = (a) => (a.length ? a.reduce((n, x) => n + x, 0) / a.length : 0);

export function unitRatings(s, team) {
  const list = roster(s, team).filter(available);
  return Object.fromEntries(
    Object.entries(UNITS).map(([key, u]) => [
      key,
      Math.round(
        avg(
          list
            .filter((p) => u.pos.includes(p.pos))
            .map((p) => p.ovr)
            .sort((a, b) => b - a)
            .slice(0, u.n),
        ),
      ),
    ]),
  );
}
export function nextOpponent(s) {
  const g = (s.schedule?.[s.week] || []).find(
    (g) => g.a === s.team || g.b === s.team,
  );
  return g && !g.score ? { team: g.a === s.team ? g.b : g.a, home: g.a === s.team } : null;
}

function tendencies(s, team, units) {
  const staff = s.franchise.clubs[team]?.staff || [],
    oc = staff.find((c) => c.role === "OC")?.scheme,
    dc = staff.find((c) => c.role === "DC")?.scheme,
    stats = roster(s, team).map((p) => p.stats?.[s.year] || {}),
    passes = stats.reduce((n, x) => n + (x.attempts || 0), 0),
    runs = stats.reduce((n, x) => n + (x.rushAttempts || 0), 0);
  let pass;
  if (passes + runs >= 40) pass = Math.round((passes / (passes + runs)) * 100);
  else
    pass = Math.round(
      Math.max(
        40,
        Math.min(
          70,
          55 +
            (oc === "Vertical offense" ? 7 : oc === "Run-first" ? -9 : 0) +
            (units.QB + units.REC / 2 - units.RB - units.OL / 2) * 0.4,
        ),
      ),
    );
  const coverage =
    dc === "Man coverage" || (!dc && units.DB >= 80)
      ? "Man coverage"
      : dc === "Pressure defense"
        ? "Blitz-heavy"
        : "Zone coverage";
  return {
    pass,
    run: 100 - pass,
    lean: pass >= 58 ? "Pass-heavy" : pass <= 47 ? "Run-heavy" : "Balanced",
    coverage,
    source: passes + runs >= 40 ? "This season's play-by-play" : "Coordinator scheme and personnel",
    oc: oc || "Unknown",
    dc: dc || "Unknown",
  };
}

// Counters only ever point at settings that already exist on the game plan.
function counters(s, opp, ours, theirs, t) {
  const out = [],
    add = (key, value, reason) =>
      out.some((c) => c.key === key) || out.push({ key, value, reason });
  const runEdge = ours.RB + ours.OL - theirs.DL - theirs.LB;
  // In simulated games "Feed the RB" overrides "Protect the QB", and both override the play style,
  // so the plan suggests one offensive lever and switches off any that would cancel it.
  const directives = s.franchise.directives || {};
  if (t.coverage === "Blitz-heavy" || theirs.DL - ours.OL >= 5) {
    add("protectQB", true, `Their pass rush (DL ${theirs.DL}) out-rates your line (OL ${ours.OL}). Get the ball out quickly.`);
    if (directives.feedRB) add("feedRB", false, "Feeding the running back would cancel the quick passing game.");
  } else {
    if (theirs.DB - ours.REC >= 4 && runEdge >= -5)
      add("style", "Run-first", `Their secondary (${theirs.DB}) is stronger than your receivers (${ours.REC}). Lean on the run.`);
    else if (ours.RB >= 80 && theirs.DL + theirs.LB / 2 < ours.OL + ours.RB / 2 - 3)
      add("style", "Run-first", `Their front (DL ${theirs.DL}, LB ${theirs.LB}) is soft against your run game.`);
    else if (ours.REC - theirs.DB >= 4)
      add("style", "Vertical offense", `Your receivers (${ours.REC}) beat their secondary (${theirs.DB}). Take deep shots.`);
    else if (t.coverage === "Zone coverage" && ours.QB >= 80)
      add("style", "Vertical offense", `They sit in zone. Your quarterback (${ours.QB}) can attack the gaps downfield.`);
    if (out.length && directives.feedRB) add("feedRB", false, "Feeding the running back overrides your play style in simulated games.");
    if (out.length && directives.protectQB) add("protectQB", false, "Quick passing overrides your play style in simulated games.");
  }
  if (t.lean === "Pass-heavy")
    add("defense", theirs.REC >= 82 ? "Dime" : "Nickel", `They throw ${t.pass}% of the time. Add defensive backs.`);
  else if (t.lean === "Run-heavy")
    add("defense", "4–3 base", `They run ${t.run}% of the time. Keep a bigger front on the field.`);
  if (ours.QB < 72 && !out.some((c) => c.key === "protectQB"))
    add("formation", "Singleback", "Your quarterback is the weak link. A tight-end set adds protection.");
  if (!out.length)
    add("style", "Balanced", "No clear mismatch. Stay balanced and avoid predictable calls.");
  return out.slice(0, 4).map((c) => ({ ...c, applied: settingValue(s, c.key) === c.value }));
}

export function opponentReport(s) {
  const next = nextOpponent(s);
  if (!next) return null;
  const opp = next.team,
    ours = unitRatings(s, s.team),
    theirs = unitRatings(s, opp),
    league = Object.fromEntries(Object.keys(UNITS).map((k) => [k, 0]));
  for (let t = 0; t < (s.franchise.clubs?.length || 0); t++) {
    const r = t === opp ? theirs : t === s.team ? ours : unitRatings(s, t);
    for (const k of Object.keys(UNITS)) league[k] += r[k] / s.franchise.clubs.length;
  }
  const units = Object.entries(UNITS).map(([key, u]) => ({
    key,
    label: u.label,
    side: u.side,
    rating: theirs[key],
    ours: ours[key],
    vsLeague: Math.round(theirs[key] - league[key]),
  }));
  const ranked = units.slice().sort((a, b) => b.vsLeague - a.vsLeague),
    t = tendencies(s, opp, theirs),
    key = roster(s, opp)
      .filter(available)
      .sort((a, b) => b.ovr - a.ovr)
      .slice(0, 4)
      .map((p) => ({ id: p.id, name: p.name, pos: p.pos, ovr: p.ovr, age: p.age }));
  return {
    team: opp,
    home: next.home,
    record: s.teams[opp],
    units,
    strengths: ranked.filter((u) => u.vsLeague > 0).slice(0, 2),
    weaknesses: ranked.filter((u) => u.vsLeague < 0).slice(-2).reverse(),
    tendencies: t,
    keyPlayers: key,
    counters: counters(s, opp, ours, theirs, t),
  };
}

export function settingValue(s, key) {
  if (key === "style") return s.coach.style;
  if (key === "formation") return s.coach.offense;
  if (key === "defense") return s.coach.defense;
  if (key === "calling") return s.coach.calling;
  if (key in DIRECTIVES) return !!s.franchise.directives[key];
  return undefined;
}
export function canEdit(s, key) {
  if (allowed(s, "coach")) return true;
  if (["style", "formation", "protectQB", "feedRB"].includes(key))
    return allowed(s, "offense");
  if (key === "defense") return allowed(s, "defense");
  return false;
}
export function setGamePlan(s, key, value) {
  if (!canEdit(s, key))
    throw Error(`${s.franchise.role} cannot change this part of the game plan.`);
  if (s.live && !s.live.finished)
    throw Error("Change the game plan before kickoff or from the sideline.");
  if (key === "style") {
    if (!STYLES[value]) throw Error("Choose an offensive style.");
    s.coach.style = value;
  } else if (key === "formation") {
    if (!FORMATIONS.includes(value)) throw Error("Choose a formation.");
    s.coach.offense = value;
  } else if (key === "defense") {
    if (!FRONTS.includes(value)) throw Error("Choose a defensive front.");
    s.coach.defense = value;
  } else if (key === "calling") {
    if (!CALLING[value]) throw Error("Choose who calls plays.");
    s.coach.calling = value;
  } else if (key in DIRECTIVES) s.franchise.directives[key] = !!value;
  else throw Error("Unknown game plan setting.");
  return settingValue(s, key);
}
