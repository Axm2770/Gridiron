// Read-only view helpers for the Market screen: filtering, sorting and paging the trade
// builder's asset lists and the free-agent board, and scaling the deal meter. No state
// changes and no valuation here: values come in already computed by market.mjs.

export const ASSET_PAGE = 7;
export const AGENT_PAGE = 10;

// One page of a list: { items, page, pages, from, to, total }, with page clamped into range.
export function pageOf(list, page = 0, size = 10) {
  const total = list.length,
    pages = Math.max(1, Math.ceil(total / size)),
    p = Math.max(0, Math.min(pages - 1, Number(page) || 0));
  return { items: list.slice(p * size, p * size + size), page: p, pages, from: total ? p * size + 1 : 0, to: Math.min(total, p * size + size), total };
}

const norm = (v) => String(v ?? "").toLowerCase().trim();

// Trade builder rows: { kind: "player" | "pick", id, p?, label } filtered by
// group (all | starters | reserves | picks), position and a name/label search.
export function filterAssets(rows, { group = "all", pos = "All", q = "" } = {}) {
  const needle = norm(q);
  return rows.filter((r) => {
    if (group === "picks" && r.kind !== "pick") return false;
    if ((group === "starters" || group === "reserves") && r.kind !== "player") return false;
    if (group === "starters" && !r.p.starter) return false;
    if (group === "reserves" && r.p.starter) return false;
    if (pos !== "All" && (r.kind !== "player" || r.p.pos !== pos)) return false;
    if (needle && !norm(r.kind === "player" ? `${r.p.name} ${r.p.pos}` : r.label).includes(needle)) return false;
    return true;
  });
}

export const AGE_BANDS = { all: [0, 99], young: [0, 25], prime: [26, 29], veteran: [30, 99] };

// Free agents filtered by position, age band, minimum (scouted) rating and maximum asking
// salary in $M, then sorted. Each entry: { p, ovr, pot, pull } (ovr/pot as the club sees them).
export function filterAgents(rows, { pos = "All", age = "all", minOvr = 0, maxAsk = 0, q = "" } = {}) {
  const [lo, hi] = AGE_BANDS[age] || AGE_BANDS.all,
    needle = norm(q);
  return rows.filter(
    (r) =>
      (pos === "All" || r.p.pos === pos) &&
      r.p.age >= lo &&
      r.p.age <= hi &&
      r.ovr >= (Number(minOvr) || 0) &&
      (!Number(maxAsk) || r.p.salary <= Number(maxAsk)) &&
      (!needle || norm(r.p.name).includes(needle)),
  );
}

const SORTS = {
  ovr: (r) => r.ovr,
  pot: (r) => r.pot,
  age: (r) => r.p.age,
  ask: (r) => r.p.salary,
  pull: (r) => r.pull,
};

// Sort by key; `dir` is "desc" (default for ratings and pull) or "asc". Ties fall back to OVR.
export function sortAgents(rows, key = "ovr", dir = "desc") {
  const f = SORTS[key] || SORTS.ovr,
    sign = dir === "asc" ? 1 : -1;
  return rows.slice().sort((a, b) => (f(a) - f(b)) * sign || b.ovr - a.ovr || String(a.p.name).localeCompare(String(b.p.name)));
}

// Deal meter geometry in percent of the track: the fill (what you send) and the band of
// what they want (low..high, with the estimate as a tick). The scale leaves headroom past both.
export function dealMeter(sending, ask) {
  const low = ask?.low ?? 0,
    high = ask?.high ?? low,
    est = ask?.estimate ?? Math.round((low + high) / 2),
    max = Math.max(1, high * 1.3, sending * 1.08),
    at = (v) => Math.round(Math.max(0, Math.min(100, (v / max) * 100)) * 10) / 10;
  return { fill: at(sending), low: at(low), high: at(high), est: at(est), max };
}
