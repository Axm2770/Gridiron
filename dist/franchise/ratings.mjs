import { identitySeed } from "./newgens.mjs";
const clamp = (v, min = 1, max = 99) =>
  Math.max(min, Math.min(max, Math.round(v)));
export const normalizeName = (s) =>
  String(s)
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "")
    .replace(/(jr|sr|iii|ii)$/, "");
const attributeKeys = [
  "speed",
  "acceleration",
  "agility",
  "changeOfDirection",
  "strength",
  "awareness",
  "stamina",
  "injury",
  "throwPower",
  "throwAccuracyShort",
  "throwAccuracyMid",
  "throwAccuracyDeep",
  "catching",
  "shortRouteRunning",
  "carrying",
  "breakTackle",
  "passBlock",
  "runBlock",
  "tackle",
  "manCoverage",
  "zoneCoverage",
  "kickPower",
  "kickAccuracy",
];
const teams = {
  BUF: "Buffalo Bills",
  MIA: "Miami Dolphins",
  NE: "New England Patriots",
  NYJ: "New York Jets",
  BAL: "Baltimore Ravens",
  CIN: "Cincinnati Bengals",
  CLE: "Cleveland Browns",
  PIT: "Pittsburgh Steelers",
  HOU: "Houston Texans",
  IND: "Indianapolis Colts",
  JAX: "Jacksonville Jaguars",
  TEN: "Tennessee Titans",
  DEN: "Denver Broncos",
  KC: "Kansas City Chiefs",
  LV: "Las Vegas Raiders",
  LAC: "Los Angeles Chargers",
  DAL: "Dallas Cowboys",
  NYG: "New York Giants",
  PHI: "Philadelphia Eagles",
  WAS: "Washington Commanders",
  CHI: "Chicago Bears",
  DET: "Detroit Lions",
  GB: "Green Bay Packers",
  MIN: "Minnesota Vikings",
  ATL: "Atlanta Falcons",
  CAR: "Carolina Panthers",
  NO: "New Orleans Saints",
  TB: "Tampa Bay Buccaneers",
  ARI: "Arizona Cardinals",
  LAR: "Los Angeles Rams",
  SF: "San Francisco 49ers",
  SEA: "Seattle Seahawks",
};
const posFamily = (x) =>
  ({
    HB: "RB",
    FB: "RB",
    LT: "OL",
    LG: "OL",
    C: "OL",
    RG: "OL",
    RT: "OL",
    G: "OL",
    OT: "OL",
    LS: "OL",
    LEDG: "DE",
    REDG: "DE",
    LE: "DE",
    RE: "DE",
    MIKE: "LB",
    SAM: "LB",
    WILL: "LB",
    MLB: "LB",
    OLB: "LB",
    ILB: "LB",
    FS: "S",
    SS: "S",
  })[x] || x;
function matchReference(map, p) {
  const refs = map.get(normalizeName(p.name)) || [];
  const positioned = refs.filter(
    (r) =>
      posFamily(r.position?.id || r.position) ===
      posFamily(p.realPosition || p.pos),
  );
  const candidates = positioned.length ? positioned : refs;
  return candidates.length === 1
    ? candidates[0]
    : candidates.find(
        (r) =>
          (r.team?.label || r.team) === (teams[p.sourceTeam] || p.sourceTeam),
      ) || null;
}
const grouped = (players) => {
  const map = new Map();
  for (const p of players) {
    const k = normalizeName(p.name);
    if (!map.has(k)) map.set(k, []);
    map.get(k).push(p);
  }
  return map;
};
export const baselineStatsFor = (p) =>
  matchReference(statsIndex, p)?.stats || null;
let snapshot = null,
  statsSnapshot = null,
  index = new Map(),
  statsIndex = new Map();
export function configureRatings(data, stats) {
  snapshot = data;
  statsSnapshot = stats;
  index = grouped(data?.players || []);
  statsIndex = grouped(stats?.players || []);
}
export function modeledAttributes(p) {
  const o = p.ovr || 65,
    h = identitySeed(p.id),
    r = (i) => ((h >>> i % 24) % 13) - 6,
    high = (key, i, offset = 0) => [key, clamp(o + r(i) + offset)];
  return Object.fromEntries([
    high(
      "speed",
      2,
      ["OL", "DL"].includes(p.pos) ? -18 : ["WR", "CB"].includes(p.pos) ? 7 : 0,
    ),
    high("acceleration", 3),
    high("agility", 4),
    high("changeOfDirection", 5),
    high("strength", 6, ["OL", "DL"].includes(p.pos) ? 10 : -5),
    high("awareness", 7),
    high("stamina", 8, 5),
    high("injury", 9, 5),
    high("throwPower", 10),
    high("throwAccuracyShort", 11),
    high("throwAccuracyMid", 12),
    high("throwAccuracyDeep", 13, -3),
    high("catching", 14),
    high("shortRouteRunning", 15),
    high("carrying", 16),
    high("breakTackle", 17),
    high("passBlock", 18),
    high("runBlock", 19),
    high("tackle", 20),
    high("manCoverage", 21),
    high("zoneCoverage", 22),
    high("kickPower", 23),
    high("kickAccuracy", 24),
  ]);
}
export function performanceAdjustment(p, stats = {}) {
  let volume = 0,
    quality = 0;
  if (p.pos === "QB") {
    volume = stats.attempts || 0;
    quality =
      ((stats.completions || 0) / Math.max(1, volume) - 0.62) * 12 +
      (((stats.passTD || 0) - (stats.interceptions || 0) * 1.5) /
        Math.max(1, volume)) *
        22;
  } else if (p.pos === "RB") {
    volume = stats.rushAttempts || 0;
    quality =
      ((stats.rushYards || 0) / Math.max(1, volume) - 4) / 1.5 +
      ((stats.rushTD || 0) / Math.max(1, volume)) * 8;
  } else if (["WR", "TE"].includes(p.pos)) {
    volume = stats.receptions || 0;
    quality =
      ((stats.recYards || 0) / Math.max(1, volume) - 10) / 5 +
      ((stats.recTD || 0) / Math.max(1, volume)) * 8;
  } else if (["DL", "LB", "CB", "S"].includes(p.pos)) {
    volume = stats.tackles || 0;
    quality =
      ((stats.sacks || 0) / Math.max(1, volume)) * 12 +
      (stats.defInterceptions || 0) * 0.3 -
      0.3;
  }
  return Math.round(
    Math.max(-3, Math.min(3, quality)) *
      Math.min(1, volume / (p.pos === "QB" ? 150 : 50)),
  );
}
export function ensurePlayerRatings(p) {
  if (
    !p.ratings ||
    p.ratings.version !== 2 ||
    (p.realPlayer && snapshot && !p.ratings.checkedEA)
  ) {
    const ref = p.realPlayer ? matchReference(index, p) : null,
      prior = p.realPlayer ? matchReference(statsIndex, p) : null;
    p.ratings = {
      version: 2,
      base: ref?.ovr ?? p.ovr,
      development: 0,
      source: ref
        ? "EA SPORTS " + snapshot.edition
        : "Original positional model",
      edition: ref ? snapshot.edition : null,
      iteration: ref?.iteration || null,
      checkedEA: !!snapshot,
      attributes: ref
        ? Object.fromEntries(
            attributeKeys
              .filter((k) => Number.isFinite(ref.attributes[k]))
              .map((k) => [k, ref.attributes[k]]),
          )
        : modeledAttributes(p),
      baselineSeason: prior ? statsSnapshot.season : null,
      performance: 0,
    };
    p.pot = Math.min(
      99,
      Math.max(
        p.pot || p.ovr,
        p.ratings.base + (ref ? (p.age < 26 ? 5 : 1) : 0),
      ),
    );
    if (ref) p.ovr = ref.ovr;
  }
  if (!p.ratings.attributes) {
    p.ratings.attributes = p.ratings.packed
      ? Object.fromEntries(
          attributeKeys
            .map((k, i) => [k, p.ratings.packed[i]])
            .filter(([, v]) => Number.isFinite(v)),
        )
      : modeledAttributes(p);
    delete p.ratings.packed;
  }
  if (p.ratings.baselineStats) delete p.ratings.baselineStats;
  if (Object.keys(p.ratings.attributes).some((k) => !attributeKeys.includes(k)))
    p.ratings.attributes = Object.fromEntries(
      Object.entries(p.ratings.attributes).filter(([k]) =>
        attributeKeys.includes(k),
      ),
    );
  return p.ratings;
}
export function refreshPlayerRating(p, year) {
  const r = ensurePlayerRatings(p);
  const current = p.stats?.[year];
  r.performance = performanceAdjustment(
    p,
    current || baselineStatsFor(p) || {},
  );
  p.ovr = clamp(Math.min(p.pot || 99, r.base + r.development + r.performance));
  return p.ovr;
}
export function ensureCareerRatings(s) {
  for (const p of [
    ...s.roster,
    ...s.franchise.clubs
      .filter((c) => c.id !== s.team)
      .flatMap((c) => c.players),
    ...s.agents,
    ...s.prospects,
  ]) {
    ensurePlayerRatings(p);
    if (!s.franchise.debug) refreshPlayerRating(p, s.year);
  }
  s.franchise.ratingsSource = {
    edition: snapshot?.edition || "Original positional model",
    capturedAt: snapshot?.capturedAt,
    matched: [
      ...s.roster,
      ...s.franchise.clubs
        .filter((c) => c.id !== s.team)
        .flatMap((c) => c.players),
    ].filter((p) => p.ratings?.edition).length,
  };
}
export function developPlayer(p, year, coach = 0) {
  const r = ensurePlayerRatings(p),
    peak =
      {
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
      }[p.pos] || 27;
  const talent =
    p.development === "Star" ? 2 : p.development === "Impact" ? 1 : 0;
  const delta =
    p.age <= peak
      ? 1 + talent + Math.floor(coach / 3)
      : p.age > peak + 3
        ? -2
        : p.development === "Late bloomer" && p.age < 31
          ? 1
          : 0;
  r.development = Math.max(
    45 - r.base,
    Math.min((p.pot || 99) - r.base, r.development + delta),
  );
  refreshPlayerRating(p, year);
}

// Positional source grades are packed in browser saves; runtime and exported databases retain readable names.
export function serializeCareer(s) {
  return JSON.stringify(s, (key, value) =>
    key === "ratings" && value?.attributes
      ? {
          ...value,
          attributes: undefined,
          packed: attributeKeys.map((k) => value.attributes[k] ?? null),
        }
      : value,
  );
}

export function effectiveAttributes(p) {
  if (!p?.ratings?.attributes) return null;
  return Object.fromEntries(
    Object.entries(p.ratings.attributes).map(([key, value]) => [
      key,
      Math.max(
        1,
        Math.min(
          99,
          Math.round(value + (p.ratings.attributeChanges?.[key] || 0)),
        ),
      ),
    ]),
  );
}
