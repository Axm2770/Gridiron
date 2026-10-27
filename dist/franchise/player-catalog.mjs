import * as S from "./state.mjs";
import { effectiveAttributes, normalizeName } from "./ratings.mjs";
import { seasonStats } from "./analysis.mjs";
import { identitySeed, generatedPhysique } from "./newgens.mjs";
let bios = new Map(),
  honors = [];
const clean = (s) =>
  String(s ?? "")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
const awardName = (s) =>
  normalizeName(s).replace(/^patsurtain$/, "patricksurtain");
export function configureCatalog(snapshot, reference) {
  bios = new Map(
    (snapshot?.teams || [])
      .flatMap((t) => t.players || [])
      .map((p) => [p.id, p]),
  );
  honors = reference?.awards || [];
}
export function heightInches(p) {
  const explicit = Number(p.heightInches);
  if (Number.isFinite(explicit) && explicit >= 55 && explicit <= 95)
    return explicit;
  if (typeof p.height === "number")
    return p.height >= 55 && p.height <= 95 ? p.height : null;
  const m = String(p.height || "").match(/^(\d)\s*['′-]\s*(\d{1,2})/);
  return m && Number(m[2]) < 12 ? Number(m[1]) * 12 + Number(m[2]) : null;
}
export function heightLabel(p) {
  const n = heightInches(p);
  return n ? `${Math.floor(n / 12)}′ ${Math.round(n % 12)}″` : "—";
}
export function enrichPlayerBios(s) {
  const all = [
    ...s.roster,
    ...s.franchise.clubs
      .filter((t) => t.id !== s.team)
      .flatMap((t) => t.players || []),
    ...s.agents,
    ...s.prospects,
  ];
  for (const p of all) {
    const raw = p.realPlayer ? bios.get(p.id) : null;
    if (raw) {
      if (!heightInches(p)) p.height = raw.height;
      if (!Number.isFinite(p.weight) || p.weight <= 0) p.weight = raw.weight;
      p.physicalSource ??= "ESPN roster snapshot";
    } else if (!p.realPlayer && (p.generated || p.face)) {
      const b = generatedPhysique(p.id, p.pos);
      if (!heightInches(p)) p.height = b.height;
      if (!Number.isFinite(p.weight) || p.weight <= 0) p.weight = b.weight;
      p.physicalSource ??= "Generated physique";
    }
  }
}
export function playerAwards(s, p) {
  const rows = [
    ...(p.realPlayer
      ? honors
          .filter(
            (a) =>
              awardName(a.name) === awardName(p.name) &&
              a.pos === p.pos &&
              a.year < s.year,
          )
          .map((a) => ({ ...a, kind: "Historical" }))
      : []),
    ...(s.franchise.awards || [])
      .filter((a) => a.playerId === p.id)
      .map((a) => ({ ...a, kind: "This save" })),
  ];
  const rank = (a) =>
    /MVP|Most Valuable/i.test(a.award)
      ? 100
      : /Player of the Year/.test(a.award) && !/Comeback|Man/.test(a.award)
        ? 90
        : /All-Pro/.test(a.award)
          ? 80
          : /Rookie|Protector/.test(a.award)
            ? 75
            : /Man of the Year/.test(a.award)
              ? 70
              : /Comeback/.test(a.award)
                ? 65
                : /Pro Bowl/.test(a.award)
                  ? 60
                  : 50;
  return rows
    .filter(
      (a, i) =>
        rows.findIndex(
          (b) => b.year === a.year && b.award === a.award && b.kind === a.kind,
        ) === i,
    )
    .sort((a, b) => rank(b) - rank(a) || b.year - a.year);
}
export function talentView(s, p, team) {
  if (team !== -2)
    return {
      rating: p.ovr,
      potential: p.pot,
      ratingLabel: String(p.ovr),
      potentialLabel: String(p.pot),
      confidence: 100,
      known: true,
    };
  const r = s.franchise.reports[p.id],
    confidence = r?.confidence || 25,
    estimate = r?.estimate ?? p.ovr + (p.id.length % 9) - 4,
    spread = Math.ceil((100 - confidence) / 10),
    lo = Math.max(40, estimate - spread),
    hi = Math.min(99, estimate + spread),
    pot =
      confidence >= 100
        ? p.pot
        : Math.min(99, estimate + Math.max(3, (26 - p.age) * 2));
  return {
    rating: estimate,
    potential: pot,
    ratingLabel: confidence >= 100 ? String(p.ovr) : `${lo}–${hi}`,
    potentialLabel:
      confidence >= 100
        ? String(p.pot)
        : `${Math.max(lo, pot - spread)}–${Math.min(99, pot + spread)}`,
    confidence,
    known: confidence >= 100,
  };
}
export function catalogEntries(s) {
  const out = [],
    seen = new Set();
  const add = (p, team) => {
    if (seen.has(p.id)) return;
    seen.add(p.id);
    const c = s.franchise.contracts[p.id],
      talent = talentView(s, p, team),
      awards = playerAwards(s, p);
    out.push({
      p,
      team,
      key: `${team}:${p.id}`,
      pool: team === -1 ? "Free agents" : team === -2 ? "Draft" : "NFL",
      teamFullLabel:
        team < 0
          ? team === -1
            ? "Free agent"
            : "Draft prospect"
          : (s.franchise.clubs[team].rebrand?.city ||
              s.franchise.clubs[team].identity?.city ||
              "") +
            " " +
            (s.franchise.clubs[team].rebrand?.name ||
              s.franchise.clubs[team].identity?.name ||
              ""),
      teamLabel:
        team < 0
          ? team === -1
            ? "Free agent"
            : "Draft prospect"
          : s.franchise.clubs[team].rebrand?.name ||
            s.franchise.clubs[team].identity?.name ||
            "Team " + (team + 1),
      talent,
      awards,
      height: heightInches(p),
      weight: Number.isFinite(p.weight) && p.weight > 0 ? p.weight : null,
      stats: seasonStats(p, s.year),
      attributes: talent.known ? effectiveAttributes(p) || {} : {},
      cap:
        team === -2
          ? null
          : team === -1
            ? p.salary
            : S.capHit(c, S.financeYear(s)) / S.MILLION,
      expiry: c && !c.ended ? c.start + c.years - 1 : null,
    });
  };
  for (let t = 0; t < 32; t++) for (const p of S.roster(s, t)) add(p, t);
  for (const p of s.agents) add(p, -1);
  for (const p of s.prospects) add(p, -2);
  return out;
}
export const DEFAULT_SEARCH = {
  query: "",
  pool: "All players",
  position: "All positions",
  team: "All teams",
  availability: "Any availability",
  ageMin: "",
  ageMax: "",
  ovrMin: "",
  potMin: "",
  moraleMin: "",
  conditionMin: "",
  formMin: "",
  heightMin: "",
  heightMax: "",
  weightMin: "",
  weightMax: "",
  salaryMax: "",
  snapsMin: "",
  confidenceMin: "",
  attr: "speed",
  attrMin: "",
  attr2: "awareness",
  attr2Min: "",
  excludeOwn: false,
  excludeInjured: false,
  excludeHoldouts: false,
  expiring: false,
  awardWinner: false,
  shortlistOnly: false,
};
const numericRanges = {
  ageMin: [18, 55],
  ageMax: [18, 55],
  ovrMin: [1, 99],
  potMin: [1, 99],
  moraleMin: [0, 99],
  conditionMin: [0, 100],
  formMin: [0, 10],
  heightMin: [55, 95],
  heightMax: [55, 95],
  weightMin: [120, 450],
  weightMax: [120, 450],
  salaryMax: [0, 100],
  snapsMin: [0, 10000],
  confidenceMin: [0, 100],
  attrMin: [1, 99],
  attr2Min: [1, 99],
};
export function normalizeSearch(raw = {}) {
  const f = { ...DEFAULT_SEARCH };
  for (const k of Object.keys(f)) {
    if (typeof f[k] === "boolean") f[k] = raw[k] === true;
    else if (numericRanges[k]) {
      if (raw[k] !== "" && raw[k] != null) {
        const n = Number(raw[k]),
          [lo, hi] = numericRanges[k];
        if (!Number.isFinite(n) || n < lo || n > hi)
          throw Error(
            `${k.replace(/([A-Z])/g, " $1")} is outside ${lo}–${hi}.`,
          );
        f[k] = n;
      }
    } else if (typeof raw[k] === "string") f[k] = raw[k].slice(0, 100);
  }
  for (const [min, max, label] of [
    ["ageMin", "ageMax", "Age"],
    ["heightMin", "heightMax", "Height"],
    ["weightMin", "weightMax", "Weight"],
  ])
    if (f[min] !== "" && f[max] !== "" && f[min] > f[max])
      throw Error(`${label} minimum cannot exceed its maximum.`);
  return f;
}
export function filterCatalog(entries, raw, s) {
  const f = normalizeSearch(raw),
    tokens = f.query.split(/\s+/).map(clean).filter(Boolean),
    list = s.franchise.office?.scouting?.shortlist || [];
  const atLeast = (v, n) => n === "" || (Number.isFinite(v) && v >= n),
    atMost = (v, n) => n === "" || (Number.isFinite(v) && v <= n);
  return entries.filter((e) => {
    const p = e.p,
      text = clean(
        `${p.name} ${p.pos} ${p.realPosition || ""} ${e.teamLabel} ${e.teamFullLabel} ${p.college || ""}`,
      );
    return (
      tokens.every((q) => text.includes(q)) &&
      (f.pool === "All players" || f.pool === e.pool) &&
      (f.position === "All positions" ||
        f.position === p.pos ||
        f.position === (p.realPosition || "")) &&
      (f.team === "All teams" || Number(f.team) === e.team) &&
      (f.availability === "Any availability" ||
        (f.availability === "Healthy" && !p.injury && !p.holdout) ||
        (f.availability === "Injured" && !!p.injury) ||
        (f.availability === "Holdout" && !!p.holdout) ||
        (f.availability === "Practice squad" && p.status === "practice")) &&
      (!f.excludeOwn || e.team !== s.team) &&
      (!f.excludeInjured || !p.injury) &&
      (!f.excludeHoldouts || !p.holdout) &&
      (!f.expiring || e.expiry === S.financeYear(s)) &&
      (!f.awardWinner || e.awards.length > 0) &&
      (!f.shortlistOnly || list.includes(p.id)) &&
      atLeast(p.age, f.ageMin) &&
      atMost(p.age, f.ageMax) &&
      atLeast(e.talent.rating, f.ovrMin) &&
      atLeast(e.talent.potential, f.potMin) &&
      atLeast(p.morale, f.moraleMin) &&
      atLeast(p.fitness, f.conditionMin) &&
      atLeast(e.stats.form, f.formMin) &&
      atLeast(e.height, f.heightMin) &&
      atMost(e.height, f.heightMax) &&
      atLeast(e.weight, f.weightMin) &&
      atMost(e.weight, f.weightMax) &&
      atMost(e.cap, f.salaryMax) &&
      atLeast(e.stats.snaps, f.snapsMin) &&
      atLeast(e.talent.confidence, f.confidenceMin) &&
      atLeast(e.attributes[f.attr], f.attrMin) &&
      atLeast(e.attributes[f.attr2], f.attr2Min)
    );
  });
}
export function catalogMetric(e, key) {
  return (
    {
      name: e.p.name,
      team: e.teamLabel,
      position: e.p.realPosition || e.p.pos,
      age: e.p.age,
      rating: e.talent.rating,
      potential: e.talent.potential,
      morale: e.p.morale,
      condition: e.p.fitness,
      form: e.stats.form,
      height: e.height,
      weight: e.weight,
      cap: e.cap,
      expiry: e.expiry,
      awards: e.awards.length,
      confidence: e.talent.confidence,
      snaps: e.stats.snaps,
      passYards: e.stats.passYards,
      rushYards: e.stats.rushYards,
      recYards: e.stats.recYards,
      speed: e.attributes.speed,
      awareness: e.attributes.awareness,
      training: e.stats.training,
    }[key] ?? null
  );
}
export function sortCatalog(entries, key = "rating", direction = -1) {
  return entries.slice().sort((a, b) => {
    const av = catalogMetric(a, key),
      bv = catalogMetric(b, key);
    if (av === null && bv === null) return a.p.name.localeCompare(b.p.name);
    if (av === null) return 1;
    if (bv === null) return -1;
    return (
      direction * (typeof av === "string" ? av.localeCompare(bv) : av - bv) ||
      a.p.name.localeCompare(b.p.name)
    );
  });
}
export function paginate(entries, page = 1, size = 25) {
  const pages = Math.max(1, Math.ceil(entries.length / size)),
    current = Math.max(1, Math.min(pages, Math.floor(page) || 1));
  return {
    page: current,
    pages,
    rows: entries.slice((current - 1) * size, current * size),
    from: entries.length ? (current - 1) * size + 1 : 0,
    to: Math.min(entries.length, current * size),
    total: entries.length,
  };
}
export function metricTone(kind, n) {
  if (!Number.isFinite(n)) return "unknown";
  const ranges = {
    morale: [80, 65, 45],
    condition: [90, 75, 55],
    form: [7.5, 6.5, 5.8],
    training: [7.5, 6.5, 5.8],
    rating: [90, 80, 65],
    potential: [90, 80, 65],
    attribute: [90, 75, 60],
  };
  const [a, b, c] = ranges[kind] || ranges.rating;
  return n >= a ? "excellent" : n >= b ? "good" : n >= c ? "caution" : "poor";
}
