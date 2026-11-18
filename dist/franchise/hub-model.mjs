// Pure numbers behind the club overview, inbox and newsroom screens (no DOM, no globals), so the
// dashboard's odds, standings and paging are testable in Node (test-hub-model.mjs).

const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

// Pre-game win chance from the two clubs' strength ratings (same scale as game.js strength()).
// Home field is worth about two rating points; the curve keeps any game between 5% and 95%.
export function winChance(us, them, home = true) {
  const a = Number(us),
    b = Number(them);
  if (!Number.isFinite(a) || !Number.isFinite(b)) return 50;
  const edge = a - b + (home ? 2 : -2);
  return clamp(Math.round(100 / (1 + Math.exp(-edge / 6))), 5, 95);
}

// Bookmaker-style label for a win chance.
export function oddsLabel(pct) {
  if (pct >= 70) return "Clear favourite";
  if (pct >= 56) return "Favourite";
  if (pct > 44) return "Toss-up";
  if (pct > 30) return "Underdog";
  return "Long shot";
}

// American moneyline for a win chance, e.g. 60% → "-150", 40% → "+150".
export function moneyline(pct) {
  const p = clamp(Number(pct) || 50, 1, 99) / 100;
  if (Math.abs(p - 0.5) < 1e-9) return "EVEN";
  return p > 0.5 ? `-${Math.round((p / (1 - p)) * 100)}` : `+${Math.round(((1 - p) / p) * 100)}`;
}

// How many of `cells` blocks a block meter lights for value/max (whole blocks, never partial).
export function litBlocks(value, max = 100, cells = 10) {
  const v = Number(value),
    m = Number(max);
  if (!Number.isFinite(v) || !Number.isFinite(m) || m <= 0 || cells <= 0) return 0;
  return clamp(Math.round((v / m) * cells), 0, cells);
}

// The last `n` results (oldest first) from fixtures() rows: ["W","L","T",…].
export function recentForm(rows, n = 5) {
  return (rows || [])
    .filter((r) => r && r.done && r.result)
    .map((r) => r.result)
    .slice(-n);
}

// Results for any club from the schedule (score arrays on played games), oldest first.
export function teamForm(schedule, team, n = 5) {
  const out = [];
  for (const week of schedule || [])
    for (const g of week || []) {
      if (!Array.isArray(g.score) || (g.a !== team && g.b !== team)) continue;
      const k = g.a === team ? 0 : 1,
        us = g.score[k],
        them = g.score[1 - k];
      out.push(us > them ? "W" : us < them ? "L" : "T");
    }
  return out.slice(-n);
}

// Division table: clubs sharing `team`'s division, best first (wins, then point differential).
export function divisionTable(teams, clubs, team) {
  const div = clubs?.[team]?.[3];
  if (div == null) return [];
  return clubs
    .map((c, i) => ({ i, c }))
    .filter(({ c }) => c[3] === div)
    .map(({ i }) => {
      const t = teams?.[i] || {};
      return { team: i, w: t.w || 0, l: t.l || 0, t: t.t || 0, pf: t.pf || 0, pa: t.pa || 0, diff: (t.pf || 0) - (t.pa || 0), me: i === team };
    })
    .sort((a, b) => b.w - a.w || a.l - b.l || b.diff - a.diff || a.team - b.team)
    .map((r, k) => ({ ...r, rank: k + 1 }));
}

export const ordinal = (n) => {
  const v = Math.abs(Math.trunc(n)),
    s = v % 100 >= 11 && v % 100 <= 13 ? "th" : ["th", "st", "nd", "rd"][v % 10] || "th";
  return `${n}${s}`;
};

// One page of a list. Pages are 0-based; the page is clamped into range.
export function pageOf(rows, page = 0, size = 8) {
  const list = rows || [],
    pages = Math.max(1, Math.ceil(list.length / size)),
    p = clamp(Math.trunc(Number(page) || 0), 0, pages - 1);
  return { rows: list.slice(p * size, p * size + size), page: p, pages, total: list.length, from: list.length ? p * size + 1 : 0, to: Math.min(list.length, p * size + size) };
}

// Page that holds the item with this id (so a selected message stays visible), or `fallback`.
export function pageContaining(rows, id, size = 8, fallback = 0) {
  const i = (rows || []).findIndex((r) => r && r.id === id);
  return i < 0 ? fallback : Math.floor(i / size);
}

// Days between two YYYY-MM-DD dates (b - a), or null when either is missing.
export function daysBetween(a, b) {
  if (!a || !b) return null;
  const t = (d) => Date.parse(String(d).slice(0, 10) + "T00:00:00Z");
  const x = t(a),
    y = t(b);
  return Number.isFinite(x) && Number.isFinite(y) ? Math.round((y - x) / 864e5) : null;
}

// Short label for a calendar date: "Sun, Sep 13".
export function shortDate(d) {
  if (!d) return "";
  const t = new Date(String(d).slice(0, 10) + "T00:00:00Z");
  return Number.isFinite(t.getTime()) ? t.toLocaleDateString("en-US", { timeZone: "UTC", weekday: "short", month: "short", day: "numeric" }) : "";
}

// Initials for a sender or club desk: "Medical team" → "MT".
export function senderInitials(name) {
  return (
    String(name || "?")
      .replace(/[^A-Za-z ]/g, " ")
      .split(/\s+/)
      .filter(Boolean)
      .map((w) => w[0])
      .slice(0, 2)
      .join("")
      .toUpperCase() || "?"
  );
}

// The one DOM helper here: desk.css (dashboard, inbox and newsroom styles) loads once, after
// the pixel theme. A no-op in Node.
export function loadDeskStyles() {
  if (typeof document !== "undefined" && typeof document.querySelector === "function" && !document.querySelector('link[href="desk.css"]')) document.head?.insertAdjacentHTML?.("beforeend", '<link rel="stylesheet" href="desk.css">');
}
