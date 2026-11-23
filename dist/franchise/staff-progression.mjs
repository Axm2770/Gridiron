// Staff progression: coaches age, improve, decline and retire once per season (at the season
// rollover, lifecycle.rollSeason). Age is a tendency, never a rule: every season's change is the
// sum of age, results against expectation, the development of the players a coach works with,
// scheme fit, continuity and a small seeded swing, so an older coach on a winning, improving unit
// can still get better. The user's own coach grows attributes from the same factors.
// Pure functions over the save (no DOM); deterministic for a given save and season.
import { log, roster, MILLION } from "./state.mjs";
import { hash } from "./career-systems.mjs";
import { postMessage, postStory } from "./newsroom.mjs";
import { COACH_ATTRIBUTES, coachRating, COACH_ATTRIBUTE_CAP } from "./coach-profile.mjs";

export const STAFF_PROGRESSION_VERSION = 1;
export const STAFF_RATING = { min: 40, max: 99, change: 4 };
export const STAFF_ROLE_NAMES = {
  HC: "Head coach",
  GM: "General manager",
  OC: "Offensive coordinator",
  DC: "Defensive coordinator",
  STC: "Special teams coordinator",
  QB: "Quarterbacks",
  RB: "Running backs",
  WR: "Receivers",
  TE: "Tight ends",
  OL: "Offensive line",
  DL: "Defensive line",
  LB: "Linebackers",
  DB: "Defensive backs",
  Medical: "Head of medical",
  Scout: "Head scout",
  AHC: "Assistant head coach",
};
const ROLES = Object.keys(STAFF_ROLE_NAMES);
const UNIT_POS = {
  all: null,
  offense: ["QB", "RB", "WR", "TE", "OL"],
  defense: ["DL", "LB", "CB", "S"],
  special: ["K", "P"],
  QB: ["QB"],
  RB: ["RB"],
  WR: ["WR"],
  TE: ["TE"],
  OL: ["OL"],
  DL: ["DL"],
  LB: ["LB"],
  DB: ["CB", "S"],
};
// Which players a role is judged on (null: no unit, e.g. medical and scouting).
export const ROLE_UNIT = { HC: "all", AHC: "all", GM: "all", OC: "offense", DC: "defense", STC: "special", QB: "QB", RB: "RB", WR: "WR", TE: "TE", OL: "OL", DL: "DL", LB: "LB", DB: "DB", Medical: null, Scout: null };
const UNIT_LABEL = { all: "Roster", offense: "Offense", defense: "Defense", special: "Specialists" };
// How strongly team results move each role (head coach most, support staff least).
const RESULT_WEIGHT = { HC: 1, OC: 0.8, DC: 0.8, AHC: 0.7, GM: 0.6, STC: 0.5, Medical: 0.3, Scout: 0.3 };
const DEV_WEIGHT = { HC: 0.8, AHC: 0.7, GM: 0.4, Medical: 0, Scout: 0 };
const AGE_BASE = { HC: [44, 20], GM: [42, 20], OC: [38, 20], DC: [38, 20], AHC: [40, 20], STC: [36, 20], Medical: [38, 22], Scout: [36, 22] };
const clamp = (n, a, b) => Math.max(a, Math.min(b, n));
const round1 = (n) => Math.round(n * 10) / 10;
const sign = (n, d = 1) => (n > 0 ? "+" : n < 0 ? "−" : "±") + Math.abs(n).toFixed(d);
// Seeded uniform in [0, 1). FNV alone barely changes its high bits when only the year differs,
// so the result goes through a murmur3 finalizer to decorrelate seasons.
const mix = (h) => {
  h ^= h >>> 16;
  h = Math.imul(h, 0x85ebca6b);
  h ^= h >>> 13;
  h = Math.imul(h, 0xc2b2ae35);
  h ^= h >>> 16;
  return h >>> 0;
};
const rand = (key) => mix(hash(key)) / 4294967296;
const seeded = (key) => mix(hash(key));

/* ------------------------------------------------------------ migration */
// A plausible, stable age for staff from saves made before ages existed.
export function deriveStaffAge(c) {
  const [base, range] = AGE_BASE[c?.role] || [32, 24],
    h = seeded(`age:${c?.id ?? c?.name ?? ""}`);
  return clamp(base + (h % range) + Math.round(((c?.rating ?? 72) - 75) * 0.15), 28, 70);
}
export function ensureStaffMember(c, year) {
  if (!c || typeof c !== "object") return c;
  if (!Number.isInteger(c.age)) c.age = deriveStaffAge(c);
  if (!Number.isInteger(c.experience)) c.experience = Math.max(1, c.age - 27 - (seeded(`exp:${c.id}`) % 6));
  if (!Array.isArray(c.history)) c.history = [];
  // A coach's natural level (−10..+12 around the league norm): established names keep their
  // standing, so ratings revert toward each coach's own level rather than one league average.
  if (!Number.isInteger(c.talent)) c.talent = clamp(Math.round(((c.rating ?? 72) - 74) * 0.8 + (seeded(`talent:${c.id}`) % 7) - 3), -10, 12);
  if (c.employer === null || c.employer === undefined) {
    if (!Number.isInteger(c.poolSince)) c.poolSince = year;
  } else delete c.poolSince;
  return c;
}
export function ensureStaffProgression(s) {
  const f = s?.franchise;
  if (!f?.clubs) return null;
  const p = (f.staffProgression ??= { version: STAFF_PROGRESSION_VERSION, seen: [], seasons: {}, retired: [], base: null, serial: 0 });
  p.seen ??= [];
  p.seasons ??= {};
  p.retired ??= [];
  p.serial ??= 0;
  for (const club of f.clubs) for (const c of club.staff || []) ensureStaffMember(c, s.year);
  for (const c of f.staffPool || []) ensureStaffMember(c, s.year);
  const own = f.clubs[s.team]?.staff?.find((c) => c.userControlled);
  if (own && Number.isInteger(Number(f.userCoach?.age))) own.age = Number(f.userCoach.age);
  if (!p.base) snapshotStaffBaseline(s);
  return p;
}
// Player overalls at the start of a season, so next rollover can measure each unit's growth.
export function snapshotStaffBaseline(s) {
  const f = s.franchise,
    p = (f.staffProgression ??= { version: STAFF_PROGRESSION_VERSION, seen: [], seasons: {}, retired: [], base: null, serial: 0 }),
    ovr = {};
  for (let t = 0; t < f.clubs.length; t++) for (const pl of roster(s, t) || []) if (Number.isFinite(pl?.ovr)) ovr[pl.id] = Math.round(pl.ovr * 10) / 10;
  p.base = { year: s.year, ovr };
  return p.base;
}

/* ------------------------------------------------------------ season context */
function teamSeason(s, t) {
  const f = s.franchise,
    team = s.teams?.[t] || {},
    games = (team.w || 0) + (team.l || 0) + (team.t || 0),
    exp = f.preseasonExpectations?.[s.year]?.teams?.[t]?.expectedWins,
    scale = games ? games / (f.rules?.regularGames || 17) : 1,
    expected = Number.isFinite(exp) ? exp * scale : games / 2,
    seeds = f.postseason?.legacy ? [] : f.postseason?.seeds || [],
    qualified = seeds.flat().includes(t),
    division = seeds.some((conf) => conf.slice(0, 4).includes(t)),
    playoffWins = (s.playoffs?.rounds || []).flat().filter((g) => g?.score && (g.a === t ? g.score[0] > g.score[1] : g.b === t ? g.score[1] > g.score[0] : false)).length,
    last = s.history?.at?.(-1),
    champion = last?.year === s.year && last?.champion === t;
  return { games, wins: team.w || 0, losses: team.l || 0, expected: round1(expected), qualified, division, playoffWins, champion };
}
function unitDevelopment(s, t, unit, base) {
  if (!unit || !base) return null;
  const pos = UNIT_POS[unit],
    list = (roster(s, t) || []).filter((p) => (!pos || pos.includes(p.pos)) && Number.isFinite(base.ovr[p.id]) && Number.isFinite(p.ovr));
  if (list.length < (pos?.length === 1 ? 1 : 3)) return null;
  return round1(list.reduce((n, p) => n + (p.ovr - base.ovr[p.id]), 0) / list.length);
}
function leagueDevelopment(s, base) {
  if (!base) return 0;
  let n = 0,
    sum = 0;
  for (let t = 0; t < s.franchise.clubs.length; t++)
    for (const p of roster(s, t) || [])
      if (Number.isFinite(base.ovr[p.id]) && Number.isFinite(p.ovr)) {
        n++;
        sum += p.ovr - base.ovr[p.id];
      }
  return n ? sum / n : 0;
}
// Scheme fit: does the roster suit what this coach wants to run?
const SCHEME_GROUP = { "Vertical offense": ["WR", "TE"], "Run-first": ["RB", "OL"], "Pressure defense": ["DL", "LB"], "Zone coverage": ["S", "LB"], "Man coverage": ["CB"] };
function schemeFit(s, t, scheme) {
  const group = SCHEME_GROUP[scheme];
  if (!group) return 0;
  const list = roster(s, t) || [],
    starters = list.filter((p) => p.status !== "practice"),
    avg = (arr) => (arr.length ? arr.reduce((n, p) => n + (p.ovr || 0), 0) / arr.length : 0),
    team = avg(starters),
    unit = avg(starters.filter((p) => group.includes(p.pos)));
  return team && unit ? clamp((unit - team) * 0.12, -0.6, 0.6) : 0;
}

/* ------------------------------------------------------------ the rating change */
function ageTendency(age) {
  return age <= 34 ? 1.3 : age <= 40 ? 0.8 : age <= 46 ? 0.25 : age <= 52 ? 0 : age <= 58 ? -0.2 : age <= 62 ? -0.6 : age <= 66 ? -1.1 : -1.6;
}
// Factors for one staff member. ctx: { season, dev, league, employed, fit }.
export function staffChangeFactors(c, ctx, year) {
  const r = c.rating ?? 70,
    age = c.age ?? 50,
    out = [],
    add = (key, label, value) => {
      if (Number.isFinite(value) && Math.abs(value) >= 0.05) out.push({ key, label, value: round1(value) });
    };
  const ageV = ageTendency(age);
  // Labelled with the age the coach turns this offseason (what the card shows next to the change).
  const shown = age + 1;
  add("age", age <= 40 ? `Still learning (age ${shown})` : age >= 59 ? `Age ${shown}` : `Prime years (age ${shown})`, ageV);
  const level = 71 + (c.talent ?? 0),
    rev = -(r - level) * 0.08;
  add("level", rev < 0 ? (r >= 85 ? "Elite level is hard to sustain" : "Playing above usual level") : r < 65 ? "Room to grow" : "Talent to climb higher", rev);
  if (ctx.employed && ctx.season) {
    const w = RESULT_WEIGHT[c.role] ?? 0.4,
      x = ctx.season,
      diff = x.wins - x.expected;
    if (x.games) add("results", diff >= 0 ? `Won ${x.wins} (expected ${x.expected.toFixed(1)})` : `Won ${x.wins}, expected ${x.expected.toFixed(1)}`, clamp(diff * 0.3, -1.8, 1.8) * w);
    if (x.champion) add("title", "Won the championship", 1.6 * w);
    else if (x.playoffWins) add("playoffs", `Playoff run: ${x.playoffWins} win${x.playoffWins === 1 ? "" : "s"}`, (0.4 + x.playoffWins * 0.4) * w);
    else if (x.qualified) add("playoffs", "Reached the playoffs", 0.4 * w);
    if (x.division) add("division", "Won the division", 0.3 * w);
  }
  if (ctx.employed && Number.isFinite(ctx.dev)) {
    const rel = ctx.dev - (ctx.league || 0),
      w = DEV_WEIGHT[c.role] ?? 1,
      unit = UNIT_LABEL[ROLE_UNIT[c.role]] || "Unit";
    if (w) add("development", `${unit} ${sign(rel)} OVR vs league`, clamp(rel * 0.8, -1.6, 1.6) * w);
  }
  if (ctx.employed && ctx.fit) add("fit", ctx.fit > 0 ? `${c.scheme} suits the roster` : `${c.scheme} clashes with the roster`, ctx.fit);
  if (ctx.employed) {
    const tenure = c.tenure ?? 0;
    if (tenure >= 6) add("continuity", `Continuity: ${tenure} years at the club`, 0.3);
    else if (tenure >= 3) add("continuity", `Continuity: ${tenure} years at the club`, 0.15);
    else if (tenure === 0) add("continuity", "New system to install", -0.2);
  } else {
    const out_ = year - (c.poolSince ?? year);
    add("idle", out_ >= 1 ? `Out of coaching for ${out_ + 1} seasons` : "Between jobs", out_ >= 1 ? -0.5 : -0.2);
  }
  if (c.pendingDismissal) add("dismissed", "Dismissed after a poor season", -1.2);
  const swing = (rand(`swing:${c.id}:${year}`) + rand(`swing2:${c.id}:${year}`) - 1) * (ctx.employed ? 1.5 : 1);
  add("form", swing >= 0 ? "Strong year in the building" : "An off year in the building", swing);
  return out;
}
export function staffRatingChange(c, factors) {
  let total = factors.reduce((n, x) => n + x.value, 0);
  const r = c.rating ?? 70;
  if (total > 0 && r >= 88) total *= r >= 94 ? 0.35 : 0.6;
  if (total < 0 && r <= 50) total *= 0.6;
  const delta = clamp(Math.round(total), -STAFF_RATING.change, STAFF_RATING.change);
  return clamp(r + delta, STAFF_RATING.min, STAFF_RATING.max) - r;
}
// The reasons shown to the player: the biggest movers, in the direction of the change first.
export function topReasons(factors, delta, n = 4) {
  const big = factors.filter((x) => Math.abs(x.value) >= 0.3).sort((a, b) => Math.abs(b.value) - Math.abs(a.value)),
    pick = (x) => ({ label: x.label, value: x.value });
  // A steady year shows what pulled each way: the biggest lift, then the biggest drag.
  if (!delta) {
    const up = big.find((x) => x.value > 0),
      down = big.find((x) => x.value < 0);
    return [up, down, ...big.filter((x) => x !== up && x !== down)].filter(Boolean).slice(0, n).map(pick);
  }
  const dir = Math.sign(delta);
  return big
    .sort((a, b) => (Math.sign(b.value) === dir) - (Math.sign(a.value) === dir) || Math.abs(b.value) - Math.abs(a.value))
    .slice(0, n)
    .map(pick);
}

/* ------------------------------------------------------------ retirement */
export function retirementChance(c, resultScore = 0) {
  const age = c.age ?? 50;
  if (c.userControlled) return 0;
  if (age >= 76) return 0.9;
  if (age < 55) return 0;
  let p = age < 58 ? 0.02 : age < 60 ? 0.04 : age < 62 ? 0.07 : 0.1 + (age - 62) * 0.035;
  if (resultScore <= -1) p *= 1.5;
  else if (resultScore >= 1) p *= 0.6;
  if (c.employer === null || c.employer === undefined) p *= 1.6;
  return clamp(p, 0, 0.85);
}

/* ------------------------------------------------------------ new candidates */
const FIRST = ["Jordan", "Marcus", "Elena", "Andre", "Cameron", "Darius", "Maya", "Julian", "Adrian", "Nolan", "Terry", "Isaiah", "Robin", "Devin", "Sam", "Malik", "Avery", "Quentin", "Rhea", "Tobias", "Kendra", "Luis", "Omar", "Priya", "Wes", "Corey", "Dana", "Hector", "Imani", "Graham", "Reggie", "Shawn"];
const LAST = ["Abbott", "Bennett", "Coleman", "Donovan", "Emerson", "Foster", "Gallagher", "Harris", "Ingram", "Jackson", "Kendall", "Lawson", "Mason", "Nash", "Ortega", "Palmer", "Quinn", "Ramsey", "Sawyer", "Turner", "Underwood", "Vaughn", "Walker", "Young", "Diaz", "Franklin", "Hughes", "Keller", "Morris", "Price", "Okafor", "Castillo", "Whitfield", "Brennan", "Lindqvist", "Ashby"];
const SCHEMES = (role, n) =>
  role === "Medical" ? "Rehabilitation" : role === "Scout" ? "Player projection" : role === "STC" ? "Field position" : ["DC", "DL", "LB", "DB"].includes(role) ? ["Pressure defense", "Zone coverage", "Man coverage"][n % 3] : ["Balanced", "Vertical offense", "Run-first"][n % 3];
const rank = (r) => (["HC", "GM"].includes(r) ? 3 : ["OC", "DC", "STC", "AHC"].includes(r) ? 2 : 1);
export function newStaffCandidate(s, role, key) {
  const h = seeded(`cand:${key}`),
    age = 29 + (h % 12),
    rating = 58 + (seeded(`candr:${key}`) % 21) + (rank(role) === 3 ? 4 : 0),
    pay = role === "Medical" ? 1.1 : rank(role) === 3 ? 3 + (rating - 55) * 0.06 : rank(role) === 2 ? 1.4 + (rating - 55) * 0.03 : 0.5 + (rating - 55) * 0.01;
  return {
    id: `staff-new-${key}`,
    name: `${FIRST[h % FIRST.length]} ${LAST[(h >>> 7) % LAST.length]}`,
    role,
    rating,
    salary: Math.round(pay * MILLION),
    scheme: SCHEMES(role, h >>> 3),
    years: 3,
    tenure: 0,
    minority: h % 3 !== 0,
    woman: h % 7 === 0,
    compEligible: false,
    employer: null,
    joinedYear: s.year,
    personality: ["Teacher", "Analyst", "Motivator"][(h >>> 5) % 3],
    specialty: STAFF_ROLE_NAMES[role],
    age,
    experience: Math.max(1, age - 27 - (h % 4)),
    history: [],
    talent: (seeded(`candt:${key}`) % 21) - 8,
    poolSince: s.year,
    rookie: true,
  };
}
const POOL_TARGET = (role) => (role === "HC" ? 5 : rank(role) === 2 ? 4 : 3);
const POOL_CAP = 90;
function refreshPool(s, year) {
  const f = s.franchise,
    p = f.staffProgression,
    added = [];
  f.staffPool ??= [];
  // Fill thin positions, then a fresh crop of young coaches every offseason.
  for (const role of ROLES)
    while (f.staffPool.filter((c) => c.role === role).length < POOL_TARGET(role)) {
      const c = newStaffCandidate(s, role, `${year}-${role}-${++p.serial}`);
      f.staffPool.push(c);
      added.push(c);
    }
  for (let i = 0; i < 6; i++) {
    const role = ROLES[seeded(`crop:${year}:${i}`) % ROLES.length],
      c = newStaffCandidate(s, role, `${year}-crop-${++p.serial}`);
    f.staffPool.push(c);
    added.push(c);
  }
  // Long-idle, low-rated candidates leave the profession; the pool stays a sensible size.
  f.staffPool = f.staffPool.filter((c) => !(c.rating < 58 && year - (c.poolSince ?? year) >= 3));
  if (f.staffPool.length > POOL_CAP)
    f.staffPool = f.staffPool
      .slice()
      .sort((a, b) => b.rating - a.rating || a.age - b.age)
      .filter((c, i, all) => i < POOL_CAP || all.filter((q) => q.role === c.role).indexOf(c) < 2);
  return added;
}

/* ------------------------------------------------------------ vacancies */
function fillVacancy(s, club, role, index, year) {
  const f = s.franchise,
    room = (club.staffBudget || Infinity) - club.staff.reduce((n, c) => n + (c.salary || 0), 0),
    eligible = (c) => c.role === role || (role === "HC" && ["OC", "DC", "AHC"].includes(c.role)),
    ranked = f.staffPool.filter(eligible).sort((a, b) => b.rating - a.rating || a.age - b.age),
    // The best candidate the club can afford; otherwise the cheapest qualified one.
    pick =
      ranked.find((c) => c.salary <= room) ||
      ranked.slice().sort((a, b) => a.salary - b.salary)[0] ||
      newStaffCandidate(s, role, `${year}-fill-${club.id}-${role}-${++f.staffProgression.serial}`);
  f.staffPool = f.staffPool.filter((c) => c.id !== pick.id);
  const hired = { ...pick, role, employer: club.id, years: 3, tenure: 0, joinedYear: year + 1, pendingDismissal: false };
  delete hired.poolSince;
  club.staff.splice(Math.min(index, club.staff.length), 0, hired);
  f.staffMovements?.unshift?.({ year, week: s.week, id: hired.id, name: hired.name, from: null, to: club.id, role, reason: "Retirement replacement" });
  return hired;
}

// After the carousel: CPU clubs whose coordinators were poached (or who lost staff) appoint from
// the market so no CPU club plays a season with an empty position.
export function fillCpuVacancies(s) {
  const f = s.franchise;
  if (!f?.clubs || !f.staffProgression) return 0;
  let n = 0;
  for (const club of f.clubs) {
    if (club.id === s.team) continue;
    // General managers are never auto-appointed (CPU front offices run without one).
    for (const role of ROLES.filter((r) => r !== "GM"))
      if (!club.staff.some((c) => c.role === role)) {
        fillVacancy(s, club, role, role === "HC" ? 0 : club.staff.length, s.year);
        n++;
      }
  }
  return n;
}

/* ------------------------------------------------------------ the season pass */
export function progressStaff(s) {
  const f = s.franchise,
    p = ensureStaffProgression(s),
    year = s.year;
  if (!p || p.seen.includes(year)) return null;
  p.seen.push(year);
  p.seen = p.seen.slice(-40);
  const base = p.base,
    league = leagueDevelopment(s, base),
    seasons = f.clubs.map((_, t) => teamSeason(s, t)),
    devCache = {},
    done = new Set(),
    summary = { year, changed: 0, up: 0, down: 0, retired: [], hotSeat: [], added: 0 };
  const dev = (t, unit) => (devCache[`${t}:${unit}`] ??= unitDevelopment(s, t, unit, base));
  const apply = (c, ctx) => {
    if (c.userControlled || done.has(c.id)) return null;
    done.add(c.id);
    const factors = staffChangeFactors(c, ctx, year),
      delta = staffRatingChange(c, factors),
      reasons = topReasons(factors, delta);
    c.rating += delta;
    // Only the latest entry keeps its reasons, so saves stay small.
    for (const h of c.history) delete h.why;
    c.history.push({ y: year, age: c.age, d: delta, r: c.rating, why: reasons.slice(0, 3) });
    c.history = c.history.slice(-5);
    c.pendingDismissal = false;
    summary.changed++;
    if (delta > 0) summary.up++;
    if (delta < 0) summary.down++;
    return { delta, factors };
  };
  const retire = (c, club, chance, ctx) => {
    if (rand(`retire:${c.id}:${year}`) >= chance) return false;
    const entry = { id: c.id, name: c.name, role: c.role, rating: c.rating, age: c.age, year, team: club ? club.id : null, tenure: c.tenure ?? 0, experience: c.experience };
    p.retired.unshift(entry);
    p.retired = p.retired.slice(0, 60);
    summary.retired.push(entry);
    announceRetirement(s, entry, ctx);
    return true;
  };
  // The market first, so a candidate hired later this offseason has had a review too.
  const stay = [];
  for (const c of f.staffPool || []) {
    if (done.has(c.id)) {
      stay.push(c);
      continue;
    }
    apply(c, { employed: false });
    if (!retire(c, null, retirementChance(c, 0), {})) stay.push(c);
  }
  f.staffPool = stay;
  for (const club of f.clubs) {
    const t = club.id,
      season = seasons[t];
    const resultScore = season.games ? (season.wins - season.expected) * 0.3 + (season.champion ? 1.5 : season.playoffWins * 0.4) : 0;
    const leaving = [];
    for (const c of club.staff) {
      if (c.userControlled) continue;
      const unit = ROLE_UNIT[c.role];
      apply(c, { employed: true, season, dev: unit ? dev(t, unit) : null, league, fit: schemeFit(s, t, c.scheme) });
      if (retire(c, club, retirementChance(c, resultScore), { club })) leaving.push(c);
      // CPU assistants also move on to college programmes and media jobs now and then.
      else if (t !== s.team && !["HC", "GM"].includes(c.role) && rand(`leave:${c.id}:${year}`) < 0.025) {
        leaving.push(c);
        summary.left = (summary.left || 0) + 1;
      }
    }
    for (const c of leaving) {
      const i = club.staff.indexOf(c);
      club.staff.splice(i, 1);
      // CPU clubs appoint straight away; your club keeps the vacancy, except an interim head coach.
      if (t !== s.team || c.role === "HC") {
        const hired = fillVacancy(s, club, c.role, i, year);
        if (t === s.team) notifyInterim(s, c, hired);
      }
    }
    // CPU clubs refresh their assistants: a struggling coach can lose the job to a clearly better
    // candidate on the market (who is often a younger riser).
    if (t !== s.team)
      for (const c of club.staff.slice()) {
        if (["HC", "GM"].includes(c.role) || c.userControlled || c.rating >= 76) continue;
        const better = f.staffPool.filter((q) => q.role === c.role && q.rating >= c.rating + 4).sort((a, b) => b.rating - a.rating)[0];
        if (!better || rand(`churn:${c.id}:${year}`) >= 0.3) continue;
        const i = club.staff.indexOf(c);
        club.staff.splice(i, 1);
        f.staffPool.push(markDismissed({ ...c, employer: null, tenure: 0, poolSince: year }));
        f.staffPool = f.staffPool.filter((q) => q.id !== better.id);
        const hired = { ...better, employer: t, years: 3, tenure: 0, joinedYear: year + 1, pendingDismissal: false };
        delete hired.poolSince;
        club.staff.splice(i, 0, hired);
        summary.churn = (summary.churn || 0) + 1;
      }
    // A CPU head coach who badly missed expectations goes onto the hot seat (the carousel replaces).
    const hc = club.staff.find((c) => c.role === "HC");
    if (t !== s.team && hc && !hc.userControlled && season.games && season.wins <= season.expected - 3.5 && season.wins / season.games <= 0.35 && hc.years > 1) {
      hc.years = 1;
      hc.hotSeat = year;
      summary.hotSeat.push(hc.id);
    }
  }
  // Everyone ages a year; the experience counter tracks seasons in coaching.
  for (const c of [...f.clubs.flatMap((club) => club.staff), ...f.staffPool]) {
    if (c.userControlled) continue;
    c.age = (c.age ?? deriveStaffAge(c)) + 1;
    c.experience = (c.experience ?? 1) + 1;
  }
  summary.added = refreshPool(s, year).length;
  const coach = progressUserCoach(s, { season: seasons[s.team], dev, league });
  p.seasons[year] = { ...staffDistribution(s), retirements: summary.retired.length, left: summary.left || 0, churn: summary.churn || 0, up: summary.up, down: summary.down, added: summary.added };
  const keys = Object.keys(p.seasons).sort();
  for (const k of keys.slice(0, -30)) delete p.seasons[k];
  return { ...summary, coach };
}
// Called by fireStaff/hireStaff: a coach let go after a bad year takes a small hit next review.
export function markDismissed(c) {
  if (c && typeof c === "object") c.pendingDismissal = true;
  return c;
}

/* ------------------------------------------------------------ messages */
function clubLabel(s, t) {
  const c = s.franchise.clubs[t];
  return c?.identity?.name || c?.name || (typeof clubs !== "undefined" ? clubs?.[t]?.[2] : null) || `Team ${t + 1}`;
}
function announceRetirement(s, e, { club } = {}) {
  const role = STAFF_ROLE_NAMES[e.role] || e.role,
    mine = e.team === s.team;
  if (mine)
    postMessage(s, `staff-retire-${e.year}-${e.id}`, {
      title: `${e.name} retires from coaching`,
      summary: `Your ${role.toLowerCase()} (age ${e.age}, rating ${e.rating}) has retired.${e.role === "HC" ? "" : " The position is vacant."}`,
      body: `${e.name} has told the club of a decision to retire after ${e.experience || "many"} seasons in coaching${e.tenure ? `, ${e.tenure} of them here` : ""}.${e.role === "HC" ? "" : ` The ${role.toLowerCase()} position is now vacant: open a search in Coaching staff.`}`,
      category: "Team",
      priority: "important",
      source: "Coaching staff",
      route: "Staff",
      data: {
        kind: "meeting",
        title: "Retirement",
        lead: `${e.name} has retired after ${e.experience || "many"} seasons in coaching.`,
        status: e.role === "HC" ? "Interim appointed" : "Vacancy",
        statusTone: e.role === "HC" ? "good" : "warn",
        facts: [
          { label: "Role", value: role },
          { label: "Age", value: String(e.age) },
          { label: "Rating", value: String(e.rating) },
          { label: "Years at the club", value: String(e.tenure || 0) },
        ],
      },
    });
  if (mine || e.rating >= 85) {
    log(s, "Coaching retirement", `${e.name} (${role}${e.team !== null ? `, ${clubLabel(s, e.team)}` : ""}) retires at ${e.age}.`, mine ? "club" : "league");
    if (e.rating >= 85)
      postStory(s, `staff-retire-${e.year}-${e.id}`, {
        title: `${e.name} calls time on a distinguished coaching career`,
        body: `${e.name}, ${e.team !== null ? `${role.toLowerCase()} of the ${clubLabel(s, e.team)}` : `one of the most respected ${role.toLowerCase()}s on the market`}, has retired at ${e.age}. A ${e.rating} rating in the final season caps ${e.experience || "many"} years in the game.`,
        category: mine ? "Team" : "League",
        source: "Gridiron Journal",
        team: e.team ?? s.team,
      });
  }
}
function notifyInterim(s, gone, hired) {
  postMessage(s, `staff-interim-${s.year}-${hired.id}`, {
    title: `${hired.name} named interim head coach`,
    summary: `${gone.name} retired. Ownership appointed ${hired.name} (rating ${hired.rating}) on an interim basis.`,
    body: `Following ${gone.name}'s retirement, ownership appointed ${hired.name} as interim head coach so preparation can continue. You can open a full search in Coaching staff.`,
    category: "Team",
    source: "Ownership",
    route: "Staff",
  });
}

/* ------------------------------------------------------------ the user's coach */
const ROLE_ATTR_WEIGHT = {
  HC: { offense: 1.5, defense: 1.5, tactics: 1.5, development: 1.2, motivation: 1.2, discipline: 0.8, medical: 0.4, adaptability: 0.8 },
  OC: { offense: 3.5, defense: 0.3, tactics: 1.6, development: 1.2, motivation: 0.8, discipline: 0.6, medical: 0.3, adaptability: 0.8 },
  DC: { offense: 0.3, defense: 3.5, tactics: 1.6, development: 1.2, motivation: 0.8, discipline: 0.9, medical: 0.3, adaptability: 0.8 },
};
export const COACH_GROWTH_MAX_PER_SEASON = 3;
// Award attribute points for a season. Exposed for tests; progressStaff calls it once a season.
export function progressUserCoach(s, { season = null, dev = () => null, league = 0 } = {}) {
  const f = s.franchise,
    profile = f.userCoach,
    year = s.year;
  if (!profile?.attributes) return null;
  const g = (f.coachGrowth ??= { seen: [], history: [] });
  if (g.seen.includes(year)) return null;
  g.seen.push(year);
  g.seen = g.seen.slice(-40);
  const role = ["OC", "DC"].includes(f.role) ? f.role : "HC",
    unit = role === "OC" ? "offense" : role === "DC" ? "defense" : "all",
    x = season || teamSeason(s, s.team),
    age = Number(profile.age) || 40,
    seasons = g.history.length + 1,
    reasons = [],
    diff = x.games ? x.wins - x.expected : 0,
    devRel = (() => {
      const d = dev(s.team, unit);
      return Number.isFinite(d) ? d - league : 0;
    })();
  const results = clamp(diff * 0.35, -2, 2) + (x.champion ? 2 : x.playoffWins * 0.5 + (x.qualified ? 0.4 : 0)),
    develop = clamp(devRel, -2, 2);
  let points = 0;
  if ((age <= 58 && results >= -0.5 && rand(`coach-exp:${year}:${profile.name}`) < (age <= 45 ? 0.75 : 0.5)) || results >= 0.6) {
    points++;
    reasons.push(age <= 45 ? "Another season of experience" : "Experience on the headset");
  }
  if (results >= 1) {
    points++;
    reasons.push(x.champion ? "Won the championship" : diff >= 1.5 ? `Beat expectations: ${x.wins} wins vs ${x.expected.toFixed(1)}` : x.playoffWins ? `Playoff run: ${x.playoffWins} win${x.playoffWins === 1 ? "" : "s"}` : "Reached the playoffs");
  }
  if (develop >= 0.8) {
    points++;
    reasons.push(`${UNIT_LABEL[unit] || "Unit"} developed ${sign(devRel)} OVR vs league`);
  }
  if (x.champion) points++;
  points = Math.min(COACH_GROWTH_MAX_PER_SEASON, points);
  const a = profile.attributes,
    changes = {};
  const weight = (k) => {
    let w = ROLE_ATTR_WEIGHT[role][k];
    if (k === "development") w *= develop >= 0.8 ? 2.2 : develop <= -0.8 ? 0.4 : 1;
    if (k === "tactics" && diff >= 1.5) w *= 1.8;
    if (k === "motivation" && (x.qualified || x.champion)) w *= 1.6;
    if (k === "adaptability" && (f.coachTenure?.team !== s.team || seasons <= 2)) w *= 1.4;
    const v = (a[k] || 0) + (changes[k] || 0);
    if (v >= COACH_ATTRIBUTE_CAP) return 0;
    return w * (v >= 18 ? 0.35 : v >= 16 ? 0.7 : 1);
  };
  for (let i = 0; i < points; i++) {
    const total = COACH_ATTRIBUTES.reduce((n, k) => n + weight(k), 0);
    if (!total) break;
    let roll = rand(`coach:${year}:${i}:${profile.name}`) * total,
      pick = COACH_ATTRIBUTES[0];
    for (const k of COACH_ATTRIBUTES) {
      roll -= weight(k);
      if (roll < 0) {
        pick = k;
        break;
      }
    }
    changes[pick] = (changes[pick] || 0) + 1;
  }
  // Rarely, a long career ends in decline after a bad year.
  if (age >= 60 && seasons >= 6 && results <= -1 && rand(`coach-decline:${year}:${profile.name}`) < 0.35) {
    const k = ["motivation", "adaptability", "discipline", "medical"].find((k) => (a[k] || 0) + (changes[k] || 0) > 5) || null;
    if (k) {
      changes[k] = (changes[k] || 0) - 1;
      reasons.push(`A hard season at ${age}: ${k} slips`);
    }
  }
  const before = coachRating(a);
  for (const [k, d] of Object.entries(changes)) a[k] = clamp((a[k] || 0) + d, 1, COACH_ATTRIBUTE_CAP);
  for (const k of Object.keys(changes)) if (!changes[k]) delete changes[k];
  const after = coachRating(a);
  profile.age = age + 1;
  // Your coach's staff entry carries the recomputed rating (head coach: mean attributes × 5).
  const own = f.clubs[s.team]?.staff?.find((c) => c.userControlled);
  if (own) {
    own.rating = role === "HC" ? after : clamp((own.rating || after) + (after - before), STAFF_RATING.min, STAFF_RATING.max);
    own.age = profile.age;
    own.history ??= [];
    for (const h of own.history) delete h.why;
    own.history.push({ y: year, age, d: after - before, r: own.rating, why: reasons.slice(0, 3).map((label) => ({ label, value: 1 })) });
    own.history = own.history.slice(-5);
  }
  f.coachTenure = { team: s.team };
  const entry = { year, age, role, changes, reasons, ratingBefore: before, ratingAfter: after, record: `${x.wins}–${x.losses}` };
  g.history.unshift(entry);
  g.history = g.history.slice(0, 40);
  const label = coachGrowthLabel(changes);
  postMessage(s, `coach-growth-${year}-${s.team}`, {
    title: `Season review: ${label}`,
    summary: `${year} ${entry.record}. Coach rating ${before} → ${after}.`,
    body: `Your coaching attributes after the ${year} season: ${label}.\n\n${reasons.map((r) => "• " + r).join("\n")}`,
    category: "Team",
    priority: "normal",
    source: "Coach career",
    route: "Career",
    data: {
      kind: "effects",
      lead: `How the ${year} season (${entry.record}) shaped you as a coach.`,
      groups: [{ name: "Coach attributes", rows: Object.entries(changes).map(([k, d]) => ({ label: niceAttr(k), delta: d, value: a[k] })).concat([{ label: "Coach rating", delta: after - before, value: after }]) }],
      note: reasons.join(" · "),
    },
  });
  return entry;
}
export const niceAttr = (k) => k[0].toUpperCase() + k.slice(1);
export function coachGrowthLabel(changes) {
  const parts = Object.entries(changes || {})
    .filter(([, d]) => d)
    .map(([k, d]) => `${niceAttr(k)} ${d > 0 ? "+" : "−"}${Math.abs(d)}`);
  return parts.length ? parts.join(", ") : "no change";
}

/* ------------------------------------------------------------ reporting */
const BANDS = [
  ["≤40", 0, 40],
  ["41–50", 41, 50],
  ["51–58", 51, 58],
  ["59–64", 59, 64],
  ["65+", 65, 200],
];
export function staffDistribution(s) {
  const f = s.franchise,
    employed = f.clubs.flatMap((c) => c.staff).filter((c) => !c.userControlled),
    all = [...employed, ...(f.staffPool || [])],
    stats = (list) => {
      const n = list.length,
        mean = n ? list.reduce((a, c) => a + c.rating, 0) / n : 0,
        sd = n ? Math.sqrt(list.reduce((a, c) => a + (c.rating - mean) ** 2, 0) / n) : 0;
      return { n, mean: round1(mean), sd: round1(sd) };
    };
  return {
    employed: stats(employed),
    pool: stats(f.staffPool || []),
    elite: all.filter((c) => c.rating >= 85).length,
    min: Math.min(...all.map((c) => c.rating)),
    max: Math.max(...all.map((c) => c.rating)),
    bands: Object.fromEntries(BANDS.map(([k, lo, hi]) => [k, stats(employed.filter((c) => c.age >= lo && c.age <= hi))])),
  };
}
// The last change for UI: { delta, year, reasons, age } or null.
export function staffTrend(c) {
  const h = Array.isArray(c?.history) ? c.history.at(-1) : null;
  return h ? { delta: h.d, year: h.y, reasons: h.why || [], age: h.age } : null;
}
