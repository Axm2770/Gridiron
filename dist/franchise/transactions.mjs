// League transaction log: signings, waiver claims, trades, draft picks, releases and retirements.
// Every roster path (your own moves, CPU clubs, the draft, settlement) changes where a player
// belongs, so the log diffs player locations between calls instead of hooking each action.
// The first call on a save records a baseline only, so older saves start an empty log.
import { capHit, financeYear } from "./state.mjs";

export const TRANSACTION_TYPES = {
  signed: "Signed",
  claimed: "Claimed off waivers",
  traded: "Traded",
  drafted: "Drafted",
  released: "Released",
  waived: "Waived",
  expired: "Contract expired",
  retired: "Retired",
};
const MAX_ENTRIES = 1500;

const clubList = (s, t) => (t === s.team ? s.roster : s.franchise.clubs[t]?.players) || [];

function locations(s) {
  const at = {};
  s.franchise.clubs.forEach((_, t) => {
    for (const p of clubList(s, t)) at[p.id] = t;
  });
  for (const p of s.agents || []) at[p.id] ??= "fa";
  for (const w of s.franchise.waivers || []) if (w.player) at[w.player.id] ??= "waivers";
  for (const p of s.prospects || []) at[p.id] ??= "draft";
  return at;
}

// The coach profile identifies the career, matching arrivals.mjs: a new career can reuse the
// boot world's franchise object and must not inherit its log.
const worldKey = (s) => `${s.franchise.userCoach?.saveName ?? ""}|${s.franchise.userCoach?.name ?? ""}`;

export function ensureTransactions(s) {
  const f = s?.franchise;
  if (!f?.clubs?.length) return null;
  const world = worldKey(s);
  if (f.transactionLog?.version !== 1 || f.transactionLog.world !== world)
    f.transactionLog = { version: 1, world, serial: 0, at: locations(s), entries: [] };
  const log = f.transactionLog;
  if (!Array.isArray(log.entries)) log.entries = [];
  if (!log.at || typeof log.at !== "object") log.at = locations(s);
  return log;
}

function contractTerms(s, id) {
  const c = s.franchise.contracts?.[id];
  if (!c || c.ended) return null;
  const year = financeYear(s),
    total = Array.from({ length: c.years }, (_, i) => capHit(c, c.start + i)).reduce((n, v) => n + v, 0);
  return { years: c.years, through: c.start + c.years - 1, capHit: capHit(c, year), total };
}

function classify(prev, now) {
  const team = (v) => Number.isInteger(v);
  if (team(now)) {
    if (prev === "fa") return "signed";
    if (prev === "waivers") return "claimed";
    if (prev === "draft") return "drafted";
    if (team(prev)) return "traded";
    return null;
  }
  if (!team(prev)) return null;
  if (now === "fa") return "released";
  if (now === "waivers") return "waived";
  if (now === undefined) return "retired";
  return null;
}

// Diffs player locations since the previous call and appends the moves. Returns the new entries.
export function recordTransactions(s, stampOverride = null) {
  const log = ensureTransactions(s);
  if (!log) return [];
  const now = locations(s),
    f = s.franchise,
    out = [],
    stamp = { year: s.year, week: s.week, phase: s.phase, date: f.calendarSim?.date, ...(stampOverride || {}) };
  const ids = new Set([...Object.keys(log.at), ...Object.keys(now)]);
  const trades = new Map();
  for (const id of ids) {
    const prev = log.at[id],
      next = now[id];
    if (prev === next) continue;
    let type = classify(prev, next);
    if (!type) continue;
    // A deal that ran its full term (processed at the new league year) expired; it was not a release.
    const deal = f.contracts?.[id];
    if (type === "released" && deal && deal.start + deal.years <= s.year) type = "expired";
    const team = Number.isInteger(next) ? next : prev,
      p = clubList(s, team).find((q) => q.id === id) ||
        (s.agents || []).find((q) => q.id === id) ||
        (f.waivers || []).find((w) => w.player?.id === id)?.player ||
        (f.retired || []).find((r) => r.id === id);
    if (!p) continue;
    const entry = {
      id: `tx-${++log.serial}`,
      ...stamp,
      type,
      playerId: id,
      name: p.name,
      pos: p.pos,
      ovr: Number.isFinite(p.ovr) ? p.ovr : undefined,
      age: Number.isFinite(p.age) ? p.age : undefined,
      from: Number.isInteger(prev) ? prev : null,
      to: Number.isInteger(next) ? next : null,
    };
    if (entry.to !== null) {
      const terms = contractTerms(s, id);
      if (terms) entry.contract = terms;
    }
    if (type === "drafted") {
      const pick = (f.draft?.picks || []).find((k) => k.player === id);
      if (pick) Object.assign(entry, { round: pick.round, overall: (f.draft.picks.indexOf(pick) ?? -1) + 1 });
    }
    // Players moving between the same two clubs in one step are one trade.
    if (type === "traded") {
      const key = [entry.from, entry.to].sort((a, b) => a - b).join("-");
      if (!trades.has(key)) trades.set(key, `trade-${log.serial}`);
      entry.group = trades.get(key);
    }
    out.push(entry);
  }
  log.at = now;
  if (out.length) {
    // Draft picks read in pick order; other moves lead with the best players.
    out.sort((a, b) => (a.overall ?? 1e9) - (b.overall ?? 1e9) || (b.ovr ?? 0) - (a.ovr ?? 0));
    log.entries = [...out, ...log.entries].slice(0, MAX_ENTRIES);
  }
  return out;
}

export function transactionsFor(s, { team = null, type = null, playerId = null, year = null } = {}) {
  const log = ensureTransactions(s);
  if (!log) return [];
  return log.entries.filter(
    (e) =>
      (team === null || e.from === team || e.to === team) &&
      (type === null || e.type === type) &&
      (playerId === null || e.playerId === playerId) &&
      (year === null || e.year === year),
  );
}

// One-line description from the point of view of `team` (or neutral when null).
export function describeTransaction(e, teamName, team = null) {
  const to = e.to !== null ? teamName(e.to) : "",
    from = e.from !== null ? teamName(e.from) : "";
  switch (e.type) {
    case "signed":
      return `${to} signed ${e.name} as a free agent`;
    case "claimed":
      return `${to} claimed ${e.name} off waivers${from ? ` from the ${from}` : ""}`;
    case "drafted":
      return `${to} drafted ${e.name}${e.round ? ` in round ${e.round}${e.overall ? ` (pick ${e.overall})` : ""}` : ""}`;
    case "traded":
      return team !== null && e.from === team ? `Traded ${e.name} to the ${to}` : `${to} acquired ${e.name} from the ${from}`;
    case "released":
      return `${from} released ${e.name}`;
    case "waived":
      return `${from} waived ${e.name}`;
    case "expired":
      return `${e.name}'s contract with the ${from} expired`;
    case "retired":
      return `${e.name} retired${from ? ` (${from})` : ""}`;
    default:
      return e.name;
  }
}
