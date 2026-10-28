// Recruiting & scouting pipeline: Watchlist → Scouted → Interviewed → Big Board → Drafted.
// Stage gates read the existing scouting reports (personnel.scout) and draft records
// (career-systems.recordDraftDevelopment); this module never spends points or drafts itself.
import { reactTo } from "./social-engine.mjs";
import { emitGameEvent } from "./event-bus.mjs";

export const STAGES = [
  ["watchlist", "Watchlist"],
  ["scouted", "Scouted"],
  ["interviewed", "Interviewed"],
  ["board", "Big Board"],
  ["drafted", "Drafted"],
];
const ORDER = Object.fromEntries(STAGES.map(([id], i) => [id, i]));
export const SCOUTED_CONFIDENCE = 40;
export const SCOUT_COSTS = { "Regional report": 1, Combine: 2, "Pro day": 2, "Medical check": 2, "Private visit": 3 };
// Healthy depth per position; fewer active players than this is a need.
const DEPTH = { QB: 3, RB: 4, WR: 6, TE: 3, OL: 9, DL: 8, LB: 6, CB: 6, S: 4, K: 1, P: 1 };

export function ensurePipeline(s) {
  const f = s.franchise;
  if (!f) return null;
  f.pipeline ??= { version: 1, entries: {}, board: [], lost: [], seen: [] };
  const p = f.pipeline;
  p.entries ??= {};
  for (const k of ["board", "lost", "seen"]) if (!Array.isArray(p[k])) p[k] = [];
  return p;
}

const prospect = (s, id) => s.prospects?.find((p) => p.id === id);

// Talent range from the report; narrows as confidence rises (matches the classic scouting view).
export function talentRange(s, p) {
  const r = s.franchise.reports?.[p.id],
    estimate = r?.estimate ?? p.ovr + (p.id.length % 9) - 4,
    spread = Math.ceil((100 - (r?.confidence || 25)) / 10);
  return { low: Math.max(40, estimate - spread), high: Math.min(99, estimate + spread), estimate, confidence: r?.confidence || 25, notes: r?.notes ?? [], visits: r?.visits ?? [] };
}

export function positionalNeed(s, pos) {
  const have = (s.roster || []).filter((p) => p.pos === pos && (!p.status || ["active", "elevated"].includes(p.status)) && !p.injury).length,
    want = DEPTH[pos] ?? 3;
  return { have, want, need: have < want ? (have <= want - 2 ? "High" : "Moderate") : "Depth" };
}

// The stage a prospect has earned from evidence, independent of where the user placed it.
export function earnedStage(s, id) {
  const r = s.franchise.reports?.[id];
  if (r?.visits?.includes("Private visit")) return "interviewed";
  if ((r?.confidence ?? 0) >= SCOUTED_CONFIDENCE) return "scouted";
  return "watchlist";
}

export function nextAction(s, entry) {
  const r = s.franchise.reports?.[entry.id];
  if (entry.stage === "watchlist") return (r?.confidence ?? 25) + 15 >= SCOUTED_CONFIDENCE ? { kind: "Regional report", label: "Regional report" } : { kind: "Combine", label: "Combine testing" };
  if (entry.stage === "scouted") return r?.visits?.includes("Medical check") ? { kind: "Private visit", label: "Private visit" } : { kind: "Medical check", label: "Medical check" };
  if (entry.stage === "interviewed") return { kind: null, label: "Promote to Big Board" };
  if (entry.stage === "board") return { kind: null, label: "Draft when on the clock" };
  return null;
}

export function addToWatchlist(s, id) {
  const pl = ensurePipeline(s);
  if (!prospect(s, id)) throw Error("Prospect unavailable.");
  if (pl.entries[id]) throw Error("Already in your pipeline.");
  pl.entries[id] = { id, stage: earnedStage(s, id), added: `${s.year}:${s.week}` };
  return pl.entries[id];
}

export function removeFromPipeline(s, id) {
  const pl = ensurePipeline(s);
  if (!pl.entries[id] || pl.entries[id].stage === "drafted") throw Error("This prospect cannot be removed.");
  delete pl.entries[id];
  pl.board = pl.board.filter((x) => x !== id);
}

// Manual moves are gated by evidence: you cannot interview someone you have not visited.
export function moveStage(s, id, target) {
  const pl = ensurePipeline(s),
    e = pl.entries[id];
  if (!e) throw Error("Add the prospect to your watchlist first.");
  if (!(target in ORDER) || target === "drafted") throw Error("Prospects reach Drafted by being selected.");
  const earned = ORDER[earnedStage(s, id)];
  if (target === "scouted" && earned < ORDER.scouted) throw Error(`Reach ${SCOUTED_CONFIDENCE}% scouting confidence first.`);
  if (target === "interviewed" && earned < ORDER.interviewed) throw Error("Use a private visit to interview this prospect.");
  if (target === "board" && earned < ORDER.scouted) throw Error("Only scouted prospects can join the Big Board.");
  e.stage = target;
  pl.board = pl.board.filter((x) => x !== id);
  if (target === "board") pl.board.push(id);
  return e;
}

export function rankOnBoard(s, id, delta) {
  const pl = ensurePipeline(s),
    i = pl.board.indexOf(id),
    j = i + delta;
  if (i < 0) throw Error("Only Big Board prospects can be ranked.");
  if (j < 0 || j >= pl.board.length) return;
  [pl.board[i], pl.board[j]] = [pl.board[j], pl.board[i]];
}

// Reconciles the pipeline with the league: auto-advances earned stages (never demotes or skips
// the Big Board), records our picks and prospects taken elsewhere, and emits DraftPick events.
export function syncPipeline(s) {
  const pl = ensurePipeline(s),
    dev = s.franchise.draftDevelopment || {},
    created = [];
  for (const e of Object.values(pl.entries)) {
    if (e.stage === "drafted") continue;
    if (dev[e.id]) {
      e.stage = "drafted";
      e.round = dev[e.id].round;
      pl.board = pl.board.filter((x) => x !== e.id);
      continue;
    }
    if (!prospect(s, e.id)) {
      const owner = s.franchise.clubs?.find((c) => c.players?.some((p) => p.id === e.id));
      pl.lost.unshift({ id: e.id, team: owner?.id ?? null, year: s.year, stage: e.stage });
      pl.lost = pl.lost.slice(0, 40);
      delete pl.entries[e.id];
      pl.board = pl.board.filter((x) => x !== e.id);
      continue;
    }
    const earned = earnedStage(s, e.id);
    if (e.stage !== "board" && ORDER[earned] > ORDER[e.stage]) e.stage = earned;
  }
  // Every one of our picks becomes a public DraftPick moment, pipeline or not.
  for (const d of Object.values(dev)) {
    const key = `draftpick:${d.playerId}`;
    if (pl.seen.includes(key)) continue;
    pl.seen.push(key);
    const tracked = pl.entries[d.playerId];
    created.push(...reactTo(s, key, { kind: "DraftPick", playerId: d.playerId, playerName: d.name, round: d.round, headline: `${d.name} (round ${d.round})`, tags: [d.round <= 1 ? "first-round" : "day-two-or-later", tracked ? "on-our-board" : "surprise-pick", d.scouted ? "scouted" : "unscouted"] }));
  }
  pl.seen = pl.seen.slice(-600);
  return created;
}

// Premium picks (rounds 1–2) whose ability has not moved after two seasons are publicly
// labelled busts once; that narrative then flows through the social engine.
export function processPipelineRound(s) {
  syncPipeline(s);
  const pl = ensurePipeline(s),
    out = [];
  for (const d of Object.values(s.franchise.draftDevelopment || {})) {
    if (d.round > 2 || pl.seen.includes(`bust:${d.playerId}`)) continue;
    const p = s.roster?.find((x) => x.id === d.playerId);
    if (!p) continue;
    const seasons = s.year - d.year + (s.phase === "offseason" ? 1 : 0);
    if (seasons < 2 || p.ovr >= d.startAbility + 2) continue;
    pl.seen.push(`bust:${d.playerId}`);
    const e = emitGameEvent(s, `bust:${d.playerId}`, { kind: "DraftBust", playerId: p.id, playerName: p.name, pos: p.pos, round: d.round, tags: ["bust", d.round === 1 ? "first-round" : "second-round"] });
    if (e) out.push(e);
  }
  return out;
}

export function pipelineView(s) {
  const pl = ensurePipeline(s),
    columns = Object.fromEntries(STAGES.map(([id]) => [id, []]));
  for (const e of Object.values(pl.entries)) {
    const p = prospect(s, e.id) || s.roster?.find((x) => x.id === e.id);
    if (!p) continue;
    columns[e.stage].push({ ...e, p, range: talentRange(s, p), need: positionalNeed(s, p.pos), next: nextAction(s, e) });
  }
  columns.board.sort((a, b) => pl.board.indexOf(a.id) - pl.board.indexOf(b.id));
  for (const id of ["watchlist", "scouted", "interviewed"]) columns[id].sort((a, b) => b.range.estimate - a.range.estimate);
  return { columns, lost: pl.lost, points: s.franchise.scoutPoints ?? 0, visits: s.franchise.visits?.length ?? 0, draft: s.franchise.draft ?? null };
}
