// Read-only numbers behind the Contracts cap sheet (expansion-ui.mjs contractsView): the cap
// split, multi-season commitments, each contract's season timeline and what a release would
// cost. Pure functions over explicit state; nothing here changes a contract.
import { capHit, capLedger, bonusCharge, financeYear } from "./state.mjs";

// Whole blocks lit for a block meter: never more than `cells`, and at least one for any
// positive value so small numbers stay visible.
export function blockCount(value, max, cells = 10) {
  const v = Number(value) || 0,
    m = Number(max) || 0;
  if (v <= 0 || m <= 0 || cells <= 0) return 0;
  return Math.max(1, Math.min(cells, Math.round((v / m) * cells)));
}

// Cap split as shares of the limit (or of the total used when over the cap).
export function capBreakdown(cap) {
  const live = Math.max(0, cap.live || 0),
    dead = Math.max(0, cap.dead || 0),
    adjustments = cap.adjustments || 0,
    limit = Math.max(0, cap.limit || 0),
    used = live + dead + adjustments,
    room = limit - used,
    scale = Math.max(limit, used, 1),
    pct = (n) => Math.max(0, Math.round((n / scale) * 1000) / 10);
  return {
    limit,
    live,
    dead,
    adjustments,
    used,
    room,
    over: room < 0,
    pct: { live: pct(live), dead: pct(dead), adjustments: pct(Math.max(0, adjustments)), room: pct(Math.max(0, room)) },
  };
}

// Cap position for `count` league years starting at `from`.
export function commitments(s, from = financeYear(s), count = 5, team = s.team) {
  return Array.from({ length: count }, (_, i) => {
    const year = from + i,
      l = capLedger(s, team, year),
      contracts = Object.values(s.franchise.contracts).filter((c) => c.team === team && capHit(c, year) > 0).length;
    return { year, live: l.live, dead: l.dead, adjustments: l.adjustments, used: l.used, limit: l.limit, room: l.room, contracts };
  });
}

// One entry per contract season (plus void years): past, current, future or void.
export function contractTimeline(c, year) {
  const total = (c.years || 0) + (c.voidYears || 0);
  return Array.from({ length: total }, (_, i) => {
    const y = c.start + i;
    return { year: y, kind: i >= c.years ? "void" : y < year ? "past" : y === year ? "now" : "future" };
  });
}

export const yearsLeft = (c, year) => Math.max(0, c.start + c.years - Math.max(year, c.start));

// Dead money accelerated by a standard (pre-June) release this league year: the remaining
// prorated bonus charges plus the remaining guaranteed base. Mirrors contracts.cut().
export function deadIfReleased(c, year) {
  if (!c || c.ended) return 0;
  let remaining = 0;
  for (const b of [{ amount: c.bonus || 0, year: c.start, term: c.prorate || 1 }, ...(c.restructureBonuses || [])])
    for (let y = Math.max(year, b.year); y < b.year + b.term; y++) remaining += bonusCharge(b.amount, b.term, y - b.year);
  const guarantee = (c.guarantees || []).slice(Math.max(0, year - c.start)).reduce((n, v) => n + v, 0);
  return remaining + guarantee;
}

// Status for one ledger row: final season, extension window and the cost of a release.
export function contractStatus(c, year) {
  const left = yearsLeft(c, year),
    inDeal = year >= c.start && year < c.start + c.years,
    dead = deadIfReleased(c, year),
    hit = capHit(c, year);
  return { left, finalYear: inDeal && left === 1, extendable: inDeal, dead, hit, saving: hit - dead };
}

// The extension shortlist: soonest-expiring deals first, best players first within a season.
export function extensionWatch(s, year = financeYear(s), limit = 6) {
  return s.roster
    .map((p) => ({ p, c: s.franchise.contracts[p.id] }))
    .filter(({ p, c }) => c && !c.ended && p.status !== "practice" && yearsLeft(c, year) >= 1)
    .sort((a, b) => yearsLeft(a.c, year) - yearsLeft(b.c, year) || b.p.ovr - a.p.ovr)
    .slice(0, limit);
}
