// League ceremonies: the Scouting Combine, NFL Honors (season awards) and the Hall of Fame
// (finalists, class election, summer enshrinement). Pure domain code over explicit state, no DOM.
// Every ceremony runs once per league year behind a dedupe key in franchise.ceremonies.done, from
// the calendar (calendar-core.advanceDate → runCeremonies) or, when the year moves on without the
// date being reached, from beginDraft (combine) and rollSeason (Hall of Fame).
// Results feed scouting (combine drills narrow athletic fog and move consensus draft stock), the
// news wire (articles carry `feature: { type, data }` for the pixel feature visuals), the inbox and
// the narrative event log (Combine / HallOfFame / Honors pixel scenes for your club).
import { identitySeed } from "./newgens.mjs";
import { ensurePlayerRatings } from "./ratings.mjs";
import { ensureCalendar, leagueDates } from "./calendar-core.mjs";
import { postStory, postMessage, ensureOffice } from "./newsroom.mjs";
import { emitGameEvent } from "./event-bus.mjs";
import { AWARD_NAMES, announceAwards } from "./awards.mjs";
import { roster, makePlayer, POS } from "./state.mjs";
import { HOF_HERITAGE, heritageAchievements } from "./hof-heritage.mjs";

/* -------------------------------------------------------------------- state */

export function ensureCeremonies(s) {
  const f = s.franchise;
  if (!f) return null;
  f.ceremonies ??= { version: 1, done: [], combine: {}, hof: {}, honors: {}, best: {} };
  const c = f.ceremonies;
  if (!Array.isArray(c.done)) c.done = [];
  for (const k of ["combine", "hof", "honors", "best"]) if (!c[k] || typeof c[k] !== "object") c[k] = {};
  return c;
}
const once = (s, key) => {
  const c = ensureCeremonies(s);
  if (c.done.includes(key)) return false;
  c.done.push(key);
  c.done = c.done.slice(-120);
  return true;
};
export const ceremonyDone = (s, key) => !!s.franchise?.ceremonies?.done?.includes(key);
const today = (s) => s.franchise.calendarSim?.date ?? null;
// A ceremony held when the clock jumped past its scheduled day keeps the scheduled date; one held
// early (championship week begins before Thursday) is dated on the night it is scheduled.
const stamp = (s, scheduled) => (today(s) && today(s) > scheduled ? today(s) : scheduled);
// The draft class (and the Hall of Fame class) belong to the league year after the season.
export const classYear = (s) => s.year + 1;
const clubName = (s, t) => s.franchise.clubs?.[t]?.identity?.name || globalThis.clubs?.[t]?.[2] || (t >= 0 ? `Team ${t + 1}` : "League");
const clubCity = (s, t) => s.franchise.clubs?.[t]?.identity?.city || globalThis.clubs?.[t]?.[1] || "";

// Small deterministic generator (mulberry32) seeded from a string.
function rngOf(key) {
  let a = identitySeed(String(key)) >>> 0 || 1;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const gauss = (rng) => Math.sqrt(-2 * Math.log(Math.max(1e-9, rng()))) * Math.cos(2 * Math.PI * rng());
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const round = (v, d) => Math.round(v * 10 ** d) / 10 ** d;

/* ------------------------------------------------------------------ combine */

export const DRILLS = [
  { id: "forty", label: "40-yard dash", short: "40", unit: "s", lower: true, digits: 2 },
  { id: "split", label: "10-yard split", short: "10-yd", unit: "s", lower: true, digits: 2 },
  { id: "bench", label: "Bench press", short: "Bench", unit: "reps", lower: false, digits: 0 },
  { id: "vertical", label: "Vertical jump", short: "Vert", unit: "in", lower: false, digits: 1 },
  { id: "broad", label: "Broad jump", short: "Broad", unit: "in", lower: false, digits: 0 },
  { id: "cone", label: "3-cone drill", short: "3-cone", unit: "s", lower: true, digits: 2 },
  { id: "shuttle", label: "20-yard shuttle", short: "Shuttle", unit: "s", lower: true, digits: 2 },
];
export const DRILL = Object.fromEntries(DRILLS.map((d) => [d.id, d]));
// Position means and spreads, close to modern combine averages.
const N = (forty, fsd, bench, vert, broad, cone, shuttle) => ({
  forty: [forty, fsd],
  split: [round(forty * 0.352, 3), round(fsd * 0.42, 3)],
  bench: [bench, 4],
  vertical: [vert, 3],
  broad: [broad, 6],
  cone: [cone, 0.18],
  shuttle: [shuttle, 0.12],
});
export const COMBINE_NORMS = {
  QB: N(4.8, 0.12, 15, 31, 112, 7.1, 4.3),
  RB: N(4.53, 0.08, 20, 35, 121, 7.05, 4.25),
  WR: N(4.49, 0.075, 14, 36, 124, 6.95, 4.2),
  TE: N(4.71, 0.09, 20, 33, 118, 7.15, 4.35),
  OL: N(5.2, 0.1, 26, 28, 104, 7.75, 4.7),
  DL: N(4.92, 0.13, 27, 31, 112, 7.45, 4.5),
  LB: N(4.68, 0.09, 22, 34, 118, 7.05, 4.28),
  CB: N(4.47, 0.065, 14, 37, 125, 6.95, 4.18),
  S: N(4.54, 0.075, 16, 36.5, 123, 6.98, 4.2),
  K: N(4.95, 0.15, 12, 29, 106, 7.3, 4.45),
  P: N(4.95, 0.15, 12, 29, 106, 7.3, 4.45),
};
COMBINE_NORMS.OL.cone[1] = 0.2;
COMBINE_NORMS.DL.cone[1] = 0.24;
COMBINE_NORMS.OL.shuttle[1] = 0.15;
COMBINE_NORMS.DL.shuttle[1] = 0.16;
// Which hidden attributes drive each drill (and which ones a drill result reveals to scouts).
const LINKS = {
  forty: { speed: 0.8, acceleration: 0.2 },
  split: { acceleration: 0.75, speed: 0.25 },
  bench: { strength: 1 },
  vertical: { acceleration: 0.45, agility: 0.25, strength: 0.3 },
  broad: { acceleration: 0.5, strength: 0.3, speed: 0.2 },
  cone: { agility: 0.55, changeOfDirection: 0.45 },
  shuttle: { changeOfDirection: 0.55, agility: 0.3, acceleration: 0.15 },
};
// Expected attribute for a prospect at the position (modeledAttributes centres on the rating).
const expectedAttr = (p, key) => 71 + (key === "speed" ? (["OL", "DL"].includes(p.pos) ? -18 : ["WR", "CB"].includes(p.pos) ? 7 : 0) : key === "strength" ? (["OL", "DL"].includes(p.pos) ? 10 : -5) : 0);
const STOCK_WEIGHT = { QB: 0.5, RB: 1, WR: 1, TE: 0.8, OL: 0.7, DL: 0.9, LB: 0.9, CB: 1.1, S: 1, K: 0, P: 0 };
const HAMSTRING = ["Pulled up with a hamstring tweak after his 40", "Felt his groin on the second 40 and shut it down", "Rolled an ankle in the position drills"];
const SKIP40 = ["Will run the 40 at his pro day", "Skipped the 40 to rest a sore hamstring"];

// Pure: one prospect's combine, decided by his hidden athletic attributes plus a little noise.
export function combineResult(p, year) {
  const pos = COMBINE_NORMS[p.pos] ? p.pos : "WR",
    norms = COMBINE_NORMS[pos],
    rng = rngOf(`${p.id}:combine:${year}`),
    attrs = ensurePlayerRatings(p).attributes || {},
    z = (key) => clamp(((Number.isFinite(attrs[key]) ? attrs[key] : expectedAttr(p, key)) - expectedAttr(p, key)) / 8, -2.6, 2.6);
  const r = [rng(), rng(), rng(), rng(), rng()],
    out = { year, pos, drills: {}, skipped: [], status: "full", note: "" };
  if (pos === "K" || pos === "P") {
    out.status = "specialist";
    out.note = "Specialists kick in front of scouts instead of testing.";
  } else if (r[0] < 0.03) {
    out.status = "medical";
    out.note = "Medical exclusion: did not test.";
  }
  const skip = new Set();
  if (out.status !== "full") DRILLS.forEach((d) => skip.add(d.id));
  else {
    if (pos === "QB") skip.add("bench");
    if (r[1] < 0.08) {
      skip.add("forty").add("split");
      out.note = SKIP40[Math.floor(r[1] * 100) % SKIP40.length];
    }
    if (r[2] < 0.06) skip.add("bench");
    if (r[3] < 0.04 && !skip.has("forty")) {
      ["vertical", "broad", "cone", "shuttle", "bench"].forEach((d) => skip.add(d));
      out.status = "injured";
      out.note = HAMSTRING[Math.floor(r[3] * 1000) % HAMSTRING.length];
    }
  }
  for (const d of DRILLS) {
    const noise = gauss(rng);
    if (skip.has(d.id)) {
      out.skipped.push(d.id);
      continue;
    }
    const [mean, sd] = norms[d.id],
      zc = Object.entries(LINKS[d.id]).reduce((n, [k, w]) => n + z(k) * w, 0),
      value = clamp(mean + (d.lower ? -1 : 1) * sd * (0.9 * zc + 0.35 * noise), mean - 2.6 * sd, mean + 2.6 * sd);
    out.drills[d.id] = d.id === "vertical" ? Math.round(value * 2) / 2 : round(value, d.digits);
  }
  // Quarterbacks never bench at the combine, so that alone is not a limited workout.
  if (out.status === "full" && out.skipped.some((id) => !(pos === "QB" && id === "bench"))) out.status = "limited";
  // Athletic index: mean z-score over the drills he ran (positive = better than the position).
  const zs = Object.entries(out.drills).map(([id, v]) => {
    const [mean, sd] = norms[id];
    return (DRILL[id].lower ? mean - v : v - mean) / sd;
  });
  out.index = zs.length ? round(zs.reduce((a, b) => a + b, 0) / zs.length, 2) : null;
  out.score = out.index === null ? null : round(clamp(5 + out.index * 2.2, 0, 10), 2);
  out.stock = round(clamp((out.index ?? 0) * 1.6 * (STOCK_WEIGHT[pos] ?? 1), -3.5, 3.5) + (out.status === "injured" ? -1 : 0) + (out.status === "medical" ? -1.5 : 0), 1);
  return out;
}

// Attributes the combine measured for this player (scouting narrows these ranges).
export function measuredAttributes(p) {
  const keys = new Set();
  for (const id of Object.keys(p?.combine?.drills || {})) for (const k of Object.keys(LINKS[id] || {})) keys.add(k);
  return keys;
}
export const drillValue = (v, id) => {
  if (!Number.isFinite(v)) return "—";
  const d = DRILL[id];
  if (id === "broad") return `${Math.floor(v / 12)}'${Math.round(v % 12)}"`;
  if (id === "vertical") return `${v.toFixed(1).replace(/\.0$/, "")}"`;
  return d.digits ? v.toFixed(d.digits) : String(v);
};
// Percentile (0–1) of a result against the position norm (1 = elite).
export function drillPercentile(v, id, pos) {
  const [mean, sd] = (COMBINE_NORMS[pos] || COMBINE_NORMS.WR)[id],
    zz = ((DRILL[id].lower ? mean - v : v - mean) / sd) * 0.7071;
  // erf approximation (Abramowitz–Stegun 7.1.26)
  const t = 1 / (1 + 0.3275911 * Math.abs(zz)),
    y = 1 - ((((1.061405429 * t - 1.453152027) * t + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t * Math.exp(-zz * zz);
  return clamp(0.5 * (1 + Math.sign(zz) * y), 0, 1);
}

// Prospects your club follows: the scouting shortlist, the draft-board pins and the pipeline.
export function followedIds(s) {
  const o = s.franchise.office || {},
    ids = new Set([...(o.scouting?.shortlist || []), ...(o.hub?.board || []), ...Object.keys(s.franchise.pipeline?.entries || {})]);
  return ids;
}
const brief = (p) => ({ id: p.id, name: p.name, pos: p.pos, college: p.college || "", face: p.face || null });
// Everyone tested at the most recent (or the given) combine: prospects, plus drafted rookies.
export function combinePool(s, year = latestCombineYear(s)) {
  if (!year) return [];
  const out = (s.prospects || []).filter((p) => p.combine?.year === year).map((p) => ({ p, team: -2 }));
  for (let t = 0; t < 32; t++) for (const p of roster(s, t) || []) if (p.combine?.year === year) out.push({ p, team: t });
  for (const p of s.agents || []) if (p.combine?.year === year) out.push({ p, team: -1 });
  return out;
}
export function latestCombineYear(s) {
  const years = Object.keys(s.franchise?.ceremonies?.combine || {}).map(Number);
  return years.length ? Math.max(...years) : null;
}
// Best results for a drill (optionally one position), best first.
export function drillLeaders(pool, id, { pos = "All", limit = 10 } = {}) {
  return pool
    .filter((x) => Number.isFinite(x.p.combine?.drills?.[id]) && (pos === "All" || x.p.pos === pos))
    .sort((a, b) => (DRILL[id].lower ? a.p.combine.drills[id] - b.p.combine.drills[id] : b.p.combine.drills[id] - a.p.combine.drills[id]) || a.p.id.localeCompare(b.p.id))
    .slice(0, limit);
}
// Elite marks worth a "record watch" story (all positions / big men).
const ELITE = { forty: 4.3, split: 1.48, bench: 38, vertical: 42, broad: 136, cone: 6.6, shuttle: 3.95 };
const BIG_FORTY = 4.9;

// Runs the combine for the current draft class once. Returns the summary (or null when not due).
export function holdCombine(s, { reason = "calendar" } = {}) {
  const f = s.franchise,
    year = classYear(s);
  if (!f || !Array.isArray(s.prospects) || s.phase !== "offseason") return null;
  if (f.draft?.year === s.year && f.draft.cursor > 0) return null; // the draft already started without it
  if (!once(s, `combine:${year}`)) return ensureCeremonies(s).combine[year] || null;
  const c = ensureCeremonies(s);
  // The whole class is invited: fill it out exactly as beginDraft would (same ids and seeds).
  while (s.prospects.length < 260) {
    const i = s.prospects.length;
    s.prospects.push(makePlayer(`prospect-${s.year}-${i}`, POS[i % 22], s.year * 967 + i, true));
  }
  for (const p of s.prospects) p.combine ??= combineResult(p, year);
  const pool = s.prospects.map((p) => ({ p, team: -2 })),
    tested = pool.filter((x) => x.p.combine.index !== null),
    mine = followedIds(s),
    ranked = tested.slice().sort((a, b) => b.p.combine.stock - a.p.combine.stock || a.p.id.localeCompare(b.p.id)),
    risers = ranked.filter((x) => x.p.combine.stock >= 1.5).slice(0, 8),
    fallers = ranked.filter((x) => x.p.combine.stock <= -1.5).reverse().slice(0, 8),
    leaders = Object.fromEntries(DRILLS.map((d) => [d.id, drillLeaders(pool, d.id, { limit: 5 }).map((x) => x.p.id)])),
    fastest = drillLeaders(pool, "forty", { limit: 1 })[0]?.p,
    yours = pool.filter((x) => mine.has(x.p.id)),
    featured = yours.filter((x) => Number.isFinite(x.p.combine.drills.forty)).sort((a, b) => a.p.combine.drills.forty - b.p.combine.drills.forty)[0]?.p || fastest;
  // Record watch: elite marks, plus the best mark seen in this career for each drill.
  const records = [];
  for (const d of DRILLS) {
    const best = drillLeaders(pool, d.id, { limit: 1 })[0]?.p;
    if (!best) continue;
    const v = best.combine.drills[d.id],
      prior = c.best[d.id],
      careerBest = !prior || (d.lower ? v < prior.value : v > prior.value),
      elite = d.lower ? v <= ELITE[d.id] : v >= ELITE[d.id];
    if (careerBest) c.best[d.id] = { value: v, name: best.name, pos: best.pos, year, id: best.id };
    if (elite || (careerBest && prior)) records.push({ drill: d.id, ...brief(best), value: v, careerBest: careerBest && !!prior, elite });
  }
  const bigMan = drillLeaders(pool.filter((x) => ["OL", "DL"].includes(x.p.pos)), "forty", { limit: 1 })[0]?.p;
  if (bigMan && bigMan.combine.drills.forty <= BIG_FORTY) records.push({ drill: "forty", ...brief(bigMan), value: bigMan.combine.drills.forty, bigMan: true, elite: true });
  const date = reason === "draft" ? today(s) : stamp(s, ceremonyDates(s).combine);
  const summary = (c.combine[year] = {
    year,
    date,
    reason,
    invited: s.prospects.length,
    tested: tested.length,
    leaders,
    risers: risers.map((x) => x.p.id),
    fallers: fallers.map((x) => x.p.id),
    featured: featured?.id || null,
    records: records.slice(0, 6),
  });
  const row = (p, id = "forty") => ({ ...brief(p), value: p.combine.drills[id] ?? null, stock: p.combine.stock, score: p.combine.score, mine: mine.has(p.id) });
  // News: fastest 40, risers and fallers, record watch, your watchlist.
  if (fastest)
    postStory(s, `combine-forty-${year}`, {
      title: `${fastest.name} blazes a ${drillValue(fastest.combine.drills.forty, "forty")} forty to top the combine`,
      body: `${fastest.name} (${fastest.pos}${fastest.college ? ", " + fastest.college : ""}) ran the fastest 40-yard dash of the ${year} Scouting Combine, with a ${drillValue(fastest.combine.drills.split, "split")} 10-yard split. ${drillLeaders(pool, "forty", { limit: 5 })
        .slice(1, 4)
        .map((x) => `${x.p.name} (${x.p.pos}) ${drillValue(x.p.combine.drills.forty, "forty")}`)
        .join(", ")} rounded out the top times. ${tested.length} of ${s.prospects.length} invited prospects tested.`,
      category: "Scouting",
      source: "Combine Wire",
      team: s.team,
      playerId: fastest.id,
      route: "Draft",
      feature: { type: "combine", data: { kind: "drill", year, drill: "forty", rows: drillLeaders(pool, "forty", { limit: 6 }).map((x) => row(x.p)) } },
    });
  if (risers.length || fallers.length)
    postStory(s, `combine-stock-${year}`, {
      title: risers[0] ? `Combine risers: ${risers[0].p.name} leads a group of big movers` : `Combine fallers: a tough week for ${fallers[0].p.name}`,
      body: `${risers.length ? `Rising: ${risers.slice(0, 4).map((x) => `${x.p.name} (${x.p.pos}, athletic score ${x.p.combine.score?.toFixed(1)})`).join(", ")}. ` : ""}${fallers.length ? `Falling: ${fallers.slice(0, 3).map((x) => `${x.p.name} (${x.p.pos}${x.p.combine.note ? ", " + x.p.combine.note.toLowerCase() : ""})`).join(", ")}.` : ""} Clubs re-stack their boards before the draft.`,
      category: "Scouting",
      source: "Combine Wire",
      team: s.team,
      route: "Draft",
      feature: { type: "combine", data: { kind: "stock", year, risers: risers.slice(0, 5).map((x) => row(x.p)), fallers: fallers.slice(0, 5).map((x) => row(x.p)) } },
    });
  if (summary.records.length) {
    const top = summary.records[0];
    postStory(s, `combine-records-${year}`, {
      title: top.bigMan ? `Big man, big speed: ${top.name} clocks ${drillValue(top.value, "forty")}` : `Record watch: ${top.name}'s ${drillValue(top.value, top.drill)} ${DRILL[top.drill].label.toLowerCase()}`,
      body: `${summary.records.map((r) => `${r.name} (${r.pos}) ${drillValue(r.value, r.drill)} in the ${DRILL[r.drill].label.toLowerCase()}${r.careerBest ? " — the best mark in years" : r.bigMan ? " — rare speed for a lineman" : ""}`).join("; ")}.`,
      category: "Scouting",
      source: "Combine Wire",
      team: s.team,
      playerId: top.id,
      route: "Draft",
      feature: { type: "combine", data: { kind: "records", year, rows: summary.records.map((r) => ({ ...r })) } },
    });
  }
  if (yours.length) {
    const up = yours.filter((x) => x.p.combine.stock >= 1).length,
      down = yours.filter((x) => x.p.combine.stock <= -1).length;
    postStory(s, `combine-yours-${year}`, {
      title: `Your watchlist at the combine: ${up} up, ${down} down`,
      body: yours
        .slice()
        .sort((a, b) => b.p.combine.stock - a.p.combine.stock)
        .slice(0, 6)
        .map((x) => `${x.p.name} (${x.p.pos}) ${x.p.combine.index === null ? x.p.combine.note || "did not test" : `${Number.isFinite(x.p.combine.drills.forty) ? drillValue(x.p.combine.drills.forty, "forty") + " forty, " : ""}athletic score ${x.p.combine.score.toFixed(1)}`}`)
        .join("; ") + ".",
      category: "Scouting",
      source: "Scouting department",
      team: s.team,
      route: "Draft",
      feature: { type: "combine", data: { kind: "watchlist", year, rows: yours.slice(0, 8).map((x) => row(x.p)) } },
    });
  }
  postMessage(s, `combine-${year}`, {
    title: `Scouting Combine results are in`,
    summary: `${tested.length} prospects tested. Fastest 40: ${fastest ? `${fastest.name} ${drillValue(fastest.combine.drills.forty, "forty")}` : "—"}.`,
    body: `The ${year} Scouting Combine is complete. Drill results now narrow your scouts' ranges on speed, acceleration, agility and strength, and the consensus board has moved: ${risers.length} risers and ${fallers.length} fallers.${yours.length ? ` ${yours.length} prospects on your watchlist tested.` : ""} Open Draft room → Combine for every result.`,
    category: "Scouting",
    source: "Scouting department",
    priority: yours.length ? "important" : "normal",
    route: "Draft",
  });
  if (featured)
    emitGameEvent(s, `combine:${year}`, {
      kind: "Combine",
      team: s.team,
      playerId: featured.id,
      playerName: featured.name,
      pos: featured.pos,
      college: featured.college || "",
      face: featured.face || null,
      mine: mine.has(featured.id),
      drills: { ...featured.combine.drills },
      score: featured.combine.score,
      classYear: year,
    });
  return summary;
}

/* ------------------------------------------------------------ Hall of Fame */

const LEGACY = (t = {}) => (t.passYards || 0) / 400 + (t.rushYards || 0) / 90 + (t.recYards || 0) / 100 + (t.sacks || 0) * 3 + (t.tackles || 0) / 12 + (t.defInterceptions || 0) * 4;
// Hall of Fame résumé: production, honours and longevity on one scale (150+ is a strong case).
export function hofScore(c) {
  const h = c.honors || {};
  return Math.round(LEGACY(c.totals) + (h.proBowls || 0) * 5 + (h.allPro || 0) * 15 + ((h.mvp || 0) + (h.opoy || 0) + (h.dpoy || 0)) * 35 + ((h.oroy || 0) + (h.droy || 0) + (h.other || 0)) * 5 + (h.rings || 0) * 6 + (h.sbMvp || 0) * 10 + (c.seasons || 0) * 2);
}
function honorsFromAwards(awards = []) {
  const h = {};
  for (const a of awards) {
    const k = a.award === "Pro Bowl" ? "proBowls" : a.award === "All-Pro" ? "allPro" : { MVP: "mvp", OPOY: "opoy", DPOY: "dpoy", OROY: "oroy", DROY: "droy" }[a.award] || "other";
    h[k] = (h[k] || 0) + 1;
  }
  return h;
}
// Clubs a simulated player appeared for, from the record book's season rows.
function teamsOf(s, r) {
  const set = new Set(Number.isInteger(r.team) && r.team >= 0 ? [r.team] : []),
    book = s.franchise.statBook?.regularTotals || {};
  for (const year of Object.keys(book)) {
    const row = book[year]?.[r.id];
    if (row && Number.isInteger(row.team) && row.team >= 0) set.add(row.team);
  }
  for (const t of r.teamIds || []) set.add(t);
  return [...set];
}
const activeNames = (s) => {
  const names = new Set();
  for (let t = 0; t < 32; t++) for (const p of roster(s, t) || []) names.add(p.name);
  for (const p of s.agents || []) names.add(p.name);
  return names;
};
// Every eligible, not-yet-enshrined candidate for a class (five full seasons retired).
export function hallCandidates(s, year = classYear(s)) {
  const f = s.franchise,
    c = ensureCeremonies(s),
    enshrined = new Set([...(f.hall || []).filter((h) => h.inducted).map((h) => h.id), ...Object.values(c.hof).flatMap((x) => (x.enshrined ? x.inductees.map((i) => i.id) : []))]),
    pending = new Set(Object.values(c.hof).filter((x) => x.classYear !== year && !x.enshrined).flatMap((x) => (x.inductees || []).map((i) => i.id))),
    seen = new Set(),
    out = [],
    active = activeNames(s);
  for (const r of [...(f.retired || []), ...(f.hall || [])]) {
    if (!r?.id || seen.has(r.id) || r.kind === "heritage") continue;
    seen.add(r.id);
    const seasons = Object.keys(r.stats || {}).length,
      honors = honorsFromAwards(r.awards || []),
      cand = { id: r.id, name: r.name, pos: r.pos, face: r.face || null, teams: teamsOf(s, r), retired: r.retired, eligible: r.year ?? (r.retired ?? year) + 5, seasons, totals: r.totals || {}, honors, kind: "simulated" };
    cand.score = hofScore(cand);
    out.push(cand);
  }
  for (const h of HOF_HERITAGE) {
    if (seen.has(h.id) || active.has(h.name)) continue;
    const cand = { id: h.id, name: h.name, pos: h.pos, face: null, teams: h.teamIds.slice(), retired: h.lastSeason + 1, eligible: h.lastSeason + 6, seasons: h.seasons, totals: { ...h.stats }, honors: { ...h.honors }, kind: "heritage", achievements: heritageAchievements(h) };
    cand.score = hofScore(cand);
    out.push(cand);
  }
  return out.filter((x) => !enshrined.has(x.id) && !pending.has(x.id) && x.eligible <= year && year - x.eligible <= 20);
}
// Ballot order: résumé plus a small deterministic voter mood per class.
const ballotValue = (x, year) => x.score + (rngOf(`hof:${year}:${x.id}`)() - 0.5) * 16;
export function selectHallClass(candidates, year) {
  const ranked = candidates
    .filter((x) => x.score >= 90)
    .map((x) => ({ ...x, ballot: ballotValue(x, year) }))
    .sort((a, b) => b.ballot - a.ballot || a.id.localeCompare(b.id));
  const finalists = ranked.slice(0, 15);
  let inductees = finalists.filter((x) => x.score >= 150).slice(0, 8);
  if (inductees.length < 4) inductees = [...inductees, ...finalists.filter((x) => !inductees.includes(x) && x.score >= 110)].slice(0, 4);
  const chosen = new Set(inductees.map((x) => x.id));
  // Vote share: 80% is the bar; the class clears it, the rest fall short.
  for (const x of finalists) {
    const pct = Math.round(clamp(60 + 40 * (1 - Math.exp(-(x.ballot - 90) / 120)), 18, 99));
    x.vote = chosen.has(x.id) ? Math.max(80, pct) : Math.min(79, pct);
    x.firstBallot = chosen.has(x.id) && year - x.eligible === 0;
  }
  return { finalists, inductees: finalists.filter((x) => chosen.has(x.id)) };
}
const plain = (x, s) => ({ id: x.id, name: x.name, pos: x.pos, face: x.face, teams: x.teams, score: x.score, vote: x.vote, firstBallot: !!x.firstBallot, kind: x.kind, seasons: x.seasons, totals: x.totals, honors: x.honors, achievements: x.achievements || null, connected: x.teams.includes(s.team) });
const listNames = (rows) => (rows.length <= 1 ? rows.map((r) => r.name).join("") : `${rows.slice(0, -1).map((r) => r.name).join(", ")} and ${rows.at(-1).name}`);

export function announceHallFinalists(s) {
  const year = classYear(s);
  if (!s.franchise || !once(s, `hof-finalists:${year}`)) return ensureCeremonies(s).hof[year] || null;
  const c = ensureCeremonies(s),
    { finalists } = selectHallClass(hallCandidates(s, year), year),
    entry = (c.hof[year] = { classYear: year, finalists: finalists.map((x) => plain(x, s)), inductees: [], finalistsDate: today(s), electedDate: null, enshrined: null });
  if (finalists.length)
    postStory(s, `hof-finalists-${year}`, {
      title: `${finalists.length} finalists named for the Hall of Fame Class of ${year}`,
      body: `The selection committee trimmed the ballot to ${finalists.length}: ${listNames(entry.finalists.slice(0, 8))}${finalists.length > 8 ? " and more" : ""}. The class is announced the week of the championship and enshrined in the summer.`,
      category: "League",
      source: "Hall of Fame",
      team: s.team,
      route: "Records",
      feature: { type: "hof", data: { kind: "finalists", classYear: year, rows: entry.finalists } },
    });
  return entry;
}

export function electHallClass(s) {
  const year = classYear(s);
  if (!s.franchise) return null;
  announceHallFinalists(s);
  if (!once(s, `hof-class:${year}`)) return ensureCeremonies(s).hof[year];
  const c = ensureCeremonies(s),
    entry = c.hof[year],
    { inductees } = selectHallClass(hallCandidates(s, year), year);
  entry.inductees = inductees.map((x) => plain(x, s));
  entry.electedDate = stamp(s, ceremonyDates(s).honors);
  if (!entry.inductees.length) return entry;
  const ours = entry.inductees.filter((x) => x.connected);
  postStory(s, `hof-class-${year}`, {
    title: `Hall of Fame Class of ${year}: ${listNames(entry.inductees.slice(0, 3))}${entry.inductees.length > 3 ? ` lead a ${entry.inductees.length}-member class` : " elected"}`,
    body: `${entry.inductees.map((x) => `${x.name} (${x.pos}, ${x.vote}%${x.firstBallot ? ", first ballot" : ""})`).join("; ")}. Enshrinement follows in the summer, before training camp.${ours.length ? ` ${listNames(ours)} ${ours.length > 1 ? "are" : "is"} part of ${clubName(s, s.team)} history.` : ""}`,
    category: "League",
    source: "Hall of Fame",
    team: s.team,
    route: "Records",
    feature: { type: "hof", data: { kind: "class", classYear: year, rows: entry.inductees } },
  });
  postMessage(s, `hof-class-${year}`, {
    title: `Hall of Fame Class of ${year} announced`,
    summary: `${entry.inductees.length} elected: ${listNames(entry.inductees.slice(0, 4))}.`,
    body: `The Hall of Fame selection committee elected ${entry.inductees.length} for the Class of ${year}.${ours.length ? ` ${listNames(ours)} played for the ${clubName(s, s.team)}; the club is invited to the enshrinement ceremony in the summer.` : ""} See Records → Hall of Fame.`,
    category: "League",
    source: "Hall of Fame",
    priority: ours.length ? "important" : "normal",
    route: "Records",
  });
  return entry;
}

// Summer enshrinement: plaques join the Hall, and the ceremony plays when one of yours goes in.
export function holdEnshrinement(s) {
  const year = classYear(s),
    f = s.franchise;
  if (!f) return null;
  electHallClass(s);
  if (!once(s, `hof-enshrine:${year}`)) return ensureCeremonies(s).hof[year];
  const entry = ensureCeremonies(s).hof[year];
  entry.enshrined = stamp(s, ceremonyDates(s).enshrinement);
  f.hall ??= [];
  for (const x of entry.inductees) {
    let h = f.hall.find((r) => r.id === x.id);
    if (!h) {
      const r = (f.retired || []).find((q) => q.id === x.id);
      h = r ? { ...structuredClone(r) } : { id: x.id, name: x.name, pos: x.pos, team: x.teams[0] ?? -1, retired: null, totals: { ...x.totals }, awards: [], careerYards: (x.totals.passYards || 0) + (x.totals.rushYards || 0) + (x.totals.recYards || 0), legacy: x.score, kind: "heritage" };
      f.hall.push(h);
    }
    Object.assign(h, { inducted: true, year, classYear: year, teamIds: x.teams, vote: x.vote, firstBallot: x.firstBallot, hofScore: x.score });
    if (x.achievements) h.achievements = x.achievements;
  }
  if (!entry.inductees.length) return entry;
  const ours = entry.inductees.filter((x) => x.connected).sort((a, b) => b.score - a.score),
    star = ours[0] || entry.inductees.slice().sort((a, b) => b.score - a.score)[0];
  postStory(s, `hof-enshrine-${year}`, {
    title: `${star.name} ${ours.length ? "brings " + clubName(s, s.team) + " history to" : "headlines the Class of " + year + " in"} the Hall of Fame`,
    body: `The Class of ${year} received their gold jackets and unveiled their busts: ${entry.inductees.map((x) => `${x.name} (${x.pos})`).join(", ")}. ${star.name}'s speech closed the night: "${speechLines(s, star, year)[2].replace(/^“|”$/g, "")}"`,
    category: "League",
    source: "Hall of Fame",
    team: ours.length ? s.team : star.teams[0] ?? s.team,
    route: "Records",
    feature: { type: "hof", data: { kind: "induction", classYear: year, inductee: star, rows: entry.inductees } },
  });
  if (ours.length)
    emitGameEvent(s, `hof:${year}`, {
      kind: "HallOfFame",
      team: s.team,
      classYear: year,
      playerId: star.id,
      playerName: star.name,
      pos: star.pos,
      face: star.face,
      teams: star.teams,
      vote: star.vote,
      firstBallot: star.firstBallot,
      classNames: entry.inductees.map((x) => x.name),
      lines: speechLines(s, star, year),
    });
  return entry;
}
export function speechLines(s, x, year) {
  const city = clubCity(s, x.teams.includes(s.team) ? s.team : x.teams[0]) || "this city",
    r = rngOf(`speech:${year}:${x.id}`),
    pick = (a) => a[Math.floor(r() * a.length)];
  return [
    `Class of ${year} · ${x.name} · ${x.pos}`,
    `“${pick(["I was never the biggest guy in the room. I just refused to be outworked.", "Every snap I took, I took for the guys next to me.", "They told me I was too small, too slow, too late. Look where we are."])}”`,
    `“${pick([`To everyone in ${city}: this jacket belongs to you too.`, `${city}, you made a kid feel like he belonged.`, `To my teammates and to ${city}: I carried you with me every Sunday.`])}”`,
    `“${pick(["To Mom and Dad, who drove me to every practice: this is yours.", "To my family: thank you for sharing me with this game.", "To the coaches who saw something before I did: thank you."])}”`,
  ];
}

/* -------------------------------------------------------------- NFL Honors */

const HONORS_ORDER = ["MVP", "OPOY", "DPOY", "OROY", "DROY", "CPOY", "COTY", "ACOTY"];
export function honorsSummary(s, year = s.year) {
  const f = s.franchise,
    ballot = f.awardBallots?.[year];
  if (!ballot) return null;
  const findFace = (id, team) => (team === s.team ? s.roster : f.clubs?.[team]?.players || []).find((p) => p.id === id)?.face || null;
  const awards = HONORS_ORDER.filter((a) => ballot.races[a]).map((award) => {
    const race = ballot.races[award],
      res = race.results || [],
      w = res.find((r) => r.winner) || null,
      you = (r) => !!r && r.team === s.team;
    const row = (r) => (r ? { id: r.playerId || r.coachId || r.id, playerId: r.playerId || null, coachId: r.coachId || null, name: r.name, team: r.team, pos: r.pos || null, points: r.points, firstVotes: r.firstVotes, face: r.face || (r.playerId ? findFace(r.playerId, r.team) : null), yours: you(r) } : null);
    return { award, label: AWARD_NAMES[award], winner: row(w), finalists: res.slice(0, 5).map(row), yours: res.slice(0, 5).some(you) };
  });
  const allPro = (f.awards || []).filter((a) => a.year === year && a.award === "All-Pro").map((a) => ({ playerId: a.playerId, name: a.name, team: a.team, pos: (roster(s, a.team) || []).find((p) => p.id === a.playerId)?.pos || ballot.snapshot?.players?.find((p) => p.id === a.playerId)?.pos || "", yours: a.team === s.team }));
  return { year, awards, allPro };
}

export function holdHonors(s) {
  const f = s.franchise,
    year = s.year;
  if (!f || !["playoffs", "offseason"].includes(s.phase)) return null;
  if (!f.awardBallots?.[year]) return null;
  if (!once(s, `honors:${year}`)) return ensureCeremonies(s).honors[year] || null;
  announceAwards(s);
  const sum = honorsSummary(s, year);
  ensureCeremonies(s).honors[year] = { ...sum, date: stamp(s, ceremonyDates(s).honors) };
  const mvp = sum.awards.find((a) => a.award === "MVP")?.winner,
    winners = sum.awards.filter((a) => a.winner && a.award !== "ACOTY");
  if (mvp)
    postStory(s, `honors-mvp-${year}`, {
      title: `${mvp.name} named ${year} Most Valuable Player`,
      body: `${mvp.name} (${mvp.pos || ""}, ${clubName(s, mvp.team)}) collected ${mvp.points} points and ${mvp.firstVotes} of 50 first-place votes at NFL Honors. ${sum.awards
        .find((a) => a.award === "MVP")
        .finalists.slice(1, 3)
        .filter(Boolean)
        .map((r) => `${r.name} (${r.points})`)
        .join(" and ")} finished next.`,
      category: "League",
      source: "NFL Honors",
      team: mvp.team,
      playerId: mvp.playerId,
      route: "Records",
      feature: { type: "awards", data: { kind: "award", year, award: "MVP", label: AWARD_NAMES.MVP, winner: mvp, finalists: sum.awards.find((a) => a.award === "MVP").finalists } },
    });
  if (winners.length)
    postStory(s, `honors-night-${year}`, {
      title: `NFL Honors ${year}: the full list of winners`,
      body: winners.map((a) => `${a.label}: ${a.winner.name} (${clubName(s, a.winner.team)})`).join(". ") + ".",
      category: "League",
      source: "NFL Honors",
      team: s.team,
      route: "Records",
      feature: { type: "awards", data: { kind: "night", year, winners: winners.map((a) => ({ award: a.award, label: a.label, winner: a.winner })) } },
    });
  if (sum.allPro.length) {
    const ours = sum.allPro.filter((x) => x.yours);
    postStory(s, `honors-allpro-${year}`, {
      title: ours.length ? `${ours.length} ${clubName(s, s.team)} named first-team All-Pro` : `${year} All-Pro team announced`,
      body: `First-team All-Pro: ${sum.allPro.map((x) => `${x.pos} ${x.name}`).join(", ")}.`,
      category: "League",
      source: "NFL Honors",
      team: s.team,
      route: "Records",
      feature: { type: "awards", data: { kind: "allpro", year, rows: sum.allPro } },
    });
  }
  // Your club's moment: the biggest award you won, else the biggest one you were a finalist for.
  const won = sum.awards.find((a) => a.winner?.yours),
    near = sum.awards.find((a) => a.yours && !a.winner?.yours),
    moment = won || near;
  if (moment) {
    const mine = won ? moment.winner : moment.finalists.find((r) => r?.yours),
      coach = moment.award === "COTY" && mine.team === s.team;
    if (won && moment.award !== "MVP")
      postStory(s, `honors-yours-${year}`, {
        title: `${coach ? "You are" : mine.name + " is"} the ${year} ${moment.label}`,
        body: `${coach ? `${s.coach?.name || "The head coach"}` : mine.name} took ${mine.points} points and ${mine.firstVotes} first-place votes at NFL Honors.`,
        category: "Team",
        source: "NFL Honors",
        team: s.team,
        playerId: mine.playerId || undefined,
        route: "Records",
        feature: { type: "awards", data: { kind: "award", year, award: moment.award, label: moment.label, winner: moment.winner, finalists: moment.finalists } },
      });
    postMessage(s, `honors-${year}`, {
      title: won ? `${moment.label}: ${coach ? "you won" : mine.name + " won"}` : `${mine.name} was a ${moment.label} finalist`,
      summary: won ? `${mine.points} points, ${mine.firstVotes} first-place votes.` : `${moment.winner?.name || "Another finalist"} won the award.`,
      body: `NFL Honors were held on ${today(s) || "awards night"}. ${sum.awards.filter((a) => a.winner?.yours).map((a) => `${a.label}: ${a.winner.name}`).join(". ") || "No award went to the club this year."} All results are in Records → Awards.`,
      category: "League",
      source: "NFL Honors",
      priority: "important",
      route: "Records",
    });
    emitGameEvent(s, `honors:${year}`, {
      kind: "Honors",
      team: s.team,
      award: moment.award,
      awardName: moment.label,
      won: !!won,
      coach,
      winnerName: moment.winner?.name || "",
      winnerTeam: moment.winner?.team ?? null,
      winnerPos: moment.winner?.pos || null,
      winnerFace: moment.winner?.face || null,
      winnerId: moment.winner?.id || null,
      points: moment.winner?.points ?? null,
      firstVotes: moment.winner?.firstVotes ?? null,
      finalistName: mine.name,
      finalistFace: mine.face || null,
      finalistId: mine.id,
      seasonYear: year,
    });
  }
  return ensureCeremonies(s).honors[year];
}

/* ---------------------------------------------------------------- calendar */

export function ceremonyDates(s) {
  const d = leagueDates(s.year, s.schedule?.length || 18);
  return { hofFinalists: d.hofFinalists, honors: d.honors, combine: d.combine, enshrinement: d.enshrinement };
}
// Called whenever the calendar moves (advanceDate). Everything due on or before today runs once.
export function runCeremonies(s) {
  const f = s.franchise;
  if (!f || s.phase === "season") return;
  const date = ensureCalendar(s).date,
    d = ceremonyDates(s);
  if (date >= d.hofFinalists) announceHallFinalists(s);
  // NFL Honors is the Thursday before the championship: due once championship week begins.
  if (date >= d.honors || (s.phase === "playoffs" && (f.postseason?.round ?? 0) >= 3)) {
    holdHonors(s);
    electHallClass(s);
  }
  if (s.phase !== "offseason") return;
  if (date >= d.combine) holdCombine(s);
  if (date >= d.enshrinement) holdEnshrinement(s);
}
// Training camp turns the league year: anything still owed this offseason happens first.
export function concludeOffseasonCeremonies(s) {
  if (!s.franchise || s.phase !== "offseason") return;
  holdHonors(s);
  holdEnshrinement(s);
}
