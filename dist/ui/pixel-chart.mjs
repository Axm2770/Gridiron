// Pixel charts: tiny string-template helpers that draw crisp, blocky charts as inline SVG/HTML.
// No chart library, no canvas, no external CSS needed (colours come from design tokens through
// inline `style="fill:var(--…)"`), so the output works in any screen, inside dialogs and in Node tests.
//
// Every shape is a <rect> snapped to a pixel grid (`cell`, default 4px) and drawn with
// shape-rendering="crispEdges". SVGs stretch to their container's width (preserveAspectRatio="none")
// but keep a fixed pixel height, so blocks stay square-edged and text is never inside the SVG
// (labels are HTML next to it, which keeps them readable at any width).
//
//   barChart(groups, opts)     grouped vertical bars, e.g. points scored vs allowed per week
//   stepChart(series, opts)    one or more step lines (8-bit "staircase" trend) with an optional average
//   sparkline(values, opts)    small step line for a stat tile
//   hbar(value, max, opts)     one horizontal bar with an optional league-average tick
//   meter(value, max, opts)    HTML block meter (■■■■□□) like the draft room / market meters
//
// Pure helpers (tested in test-pixel-chart.mjs): tone, snap, niceMax, blocks, scaleTo, stepRects.
// Tones: "accent" | "good" | "warn" | "bad" | "team" | "muted" | "line" | "text" | "text2", or any var(--…).

const TONES = {
  accent: "var(--gd-accent)",
  good: "var(--gd-good)",
  warn: "var(--gd-warn)",
  bad: "var(--gd-bad)",
  team: "var(--team, var(--gd-accent))",
  muted: "var(--gd-text-3)",
  line: "var(--gd-border)",
  strong: "var(--gd-border-strong)",
  text: "var(--gd-text)",
  text2: "var(--gd-text-2)",
};
const esc = (v) =>
  String(v ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
// Top-edge highlight on bars: a lighter strip of the text colour, so it works in both themes.
const SHINE = "color-mix(in srgb, var(--gd-text) 22%, transparent)";
const finite = (v) =>typeof v === "number" && Number.isFinite(v);

/** A colour token for a tone name; unknown names fall back to the accent. */
export function tone(t) {
  if (typeof t === "string" && /^var\(--[\w-]+(,.*)?\)$/.test(t)) return t;
  return TONES[t] || TONES.accent;
}
/** Round to the nearest multiple of `cell`. */
export function snap(v, cell = 4) {
  return Math.round((Number(v) || 0) / cell) * cell;
}
/** A friendly axis maximum ≥ n: 1, 1.2, 1.5, 2, 2.5, 3, 4, 5, 6, 8 × 10^k (keeps bars tall). */
export function niceMax(n) {
  if (!finite(n) || n <= 0) return 1;
  const p = 10 ** Math.floor(Math.log10(n));
  for (const m of [1, 1.2, 1.5, 2, 2.5, 3, 4, 5, 6, 8, 10]) if (n <= m * p) return m * p;
  return 10 * p;
}
/** Filled blocks out of `segments`; any positive value shows at least one block. */
export function blocks(value, max, segments = 10) {
  if (!finite(value) || !finite(max) || max <= 0 || value <= 0) return 0;
  return Math.max(1, Math.min(segments, Math.round((value / max) * segments)));
}
/** Pixel length for value on a 0..max scale of `px`, snapped to `cell` (positive values get ≥ 1 cell). */
export function scaleTo(value, max, px, cell = 4) {
  if (!finite(value) || !finite(max) || max <= 0 || value <= 0) return 0;
  return Math.max(cell, Math.min(px, snap((value / max) * px, cell)));
}
/**
 * Rectangles for a step line through `values` (nulls leave gaps) across a w×h box.
 * Each value is a horizontal run of width w/n; neighbours are joined by a vertical riser.
 * Returns [{x, y, w, h}] in box units, all snapped to `cell`.
 */
export function stepRects(values, { w = 240, h = 80, cell = 4, max, min = 0 } = {}) {
  const n = values.length;
  if (!n) return [];
  const top = finite(max) ? max : niceMax(Math.max(...values.filter(finite), 0));
  const span = Math.max(1e-9, top - min);
  const col = w / n;
  const yOf = (v) => {
    const t = Math.max(0, Math.min(1, (v - min) / span));
    return Math.max(0, Math.min(h - cell, snap((1 - t) * (h - cell), cell)));
  };
  const out = [];
  let prev = null;
  values.forEach((v, i) => {
    if (!finite(v)) {
      prev = null;
      return;
    }
    const x0 = snap(i * col, cell),
      x1 = Math.max(x0 + cell, snap((i + 1) * col, cell)),
      y = yOf(v);
    out.push({ x: x0, y, w: x1 - x0, h: cell });
    if (prev && prev.y !== y) {
      const a = Math.min(prev.y, y),
        b = Math.max(prev.y, y);
      out.push({ x: x0, y: a, w: cell, h: b - a + cell });
    }
    prev = { y };
  });
  return out;
}
const rect = (r, fill, extra = "") =>
  `<rect x="${r.x}" y="${r.y}" width="${r.w}" height="${r.h}" style="fill:${fill}"${extra}/>`;
const svgOpen = (w, h, label, cls = "") =>
  `<svg class="pc-svg ${esc(cls)}" viewBox="0 0 ${w} ${h}" width="100%" height="${h}" preserveAspectRatio="none" shape-rendering="crispEdges" role="img" aria-label="${esc(label)}" style="display:block;overflow:visible">`;
// Dotted horizontal guides every quarter of the height, drawn as 1-cell dashes.
function guides(w, h, cell) {
  let s = "";
  for (const f of [0.25, 0.5, 0.75]) {
    const y = snap(h * f, cell);
    for (let x = 0; x < w; x += cell * 4) s += rect({ x, y, w: cell, h: 1 }, TONES.line);
  }
  return s + rect({ x: 0, y: h - 2, w, h: 2 }, TONES.strong);
}

/**
 * Grouped vertical bars. groups: [{ label, values: [n, n…], title? }]; series: [{ label, tone }].
 * opts: { h = 120, cell = 4, max, gap = 1 (cells between bars), note } → `<figure class="pc-chart">`.
 */
export function barChart(groups, { series = [], h = 120, cell = 4, max, title = "Bar chart" } = {}) {
  const n = groups.length;
  if (!n) return "";
  const k = Math.max(1, ...groups.map((g) => g.values.length));
  const top = finite(max) ? max : niceMax(Math.max(0, ...groups.flatMap((g) => g.values.filter(finite))));
  const barW = cell * 3,
    groupW = k * barW + (k - 1) * cell + cell * 4,
    w = groupW * n;
  let body = guides(w, h, cell);
  groups.forEach((g, i) => {
    g.values.forEach((v, j) => {
      const len = scaleTo(v, top, h - cell, cell);
      if (!len) return;
      const x = i * groupW + cell * 2 + j * (barW + cell);
      body += `<g><title>${esc(g.title || g.label)}: ${esc(series[j]?.label || "")} ${esc(v)}</title>${rect({ x, y: h - 2 - len, w: barW, h: len }, tone(series[j]?.tone || (j ? "muted" : "accent")))}${rect({ x, y: h - 2 - len, w: barW, h: cell }, SHINE)}</g>`;
    });
  });
  const labels = `<div class="pc-x" style="display:grid;grid-template-columns:repeat(${n},minmax(0,1fr))">${groups.map((g) => `<span>${esc(g.label)}</span>`).join("")}</div>`;
  return `<figure class="pc-chart" style="margin:0"><div class="pc-plot"><span class="pc-y">${esc(fmt(top))}</span>${svgOpen(w, h, title)}${body}</svg></div>${labels}</figure>`;
}

/**
 * Step lines. series: [{ label, values: [n|null…], tone }]; opts: { h = 96, cell = 4, max, min = 0,
 * avg (number: dashed reference line), avgLabel, labels: [x-axis strings], title }.
 */
export function stepChart(series, { h = 96, cell = 4, max, min = 0, avg, labels = [], title = "Trend" } = {}) {
  const n = Math.max(0, ...series.map((s) => s.values.length));
  if (!n) return "";
  const all = series.flatMap((s) => s.values.filter(finite)).concat(finite(avg) ? [avg] : []);
  const top = finite(max) ? max : niceMax(Math.max(0, ...all));
  const w = n * cell * 8;
  let body = guides(w, h, cell);
  if (finite(avg)) {
    const y = stepRects([avg], { w: cell, h, cell, max: top, min })[0].y;
    for (let x = 0; x < w; x += cell * 3) body += rect({ x, y: y + 1, w: cell * 2, h: 2 }, TONES.text2);
  }
  series.forEach((s) => {
    const fill = tone(s.tone);
    body += stepRects(s.values, { w, h, cell, max: top, min }).map((r) => rect(r, fill)).join("");
  });
  const legend = series.length > 1 || finite(avg)
    ? `<div class="pc-legend">${series.map((s) => `<span><i style="background:${tone(s.tone)}"></i>${esc(s.label)}</span>`).join("")}${finite(avg) ? `<span><i class="pc-dash" style="background:${TONES.text2}"></i>League avg ${esc(fmt(avg))}</span>` : ""}</div>`
    : "";
  const x = labels.length
    ? `<div class="pc-x" style="display:grid;grid-template-columns:repeat(${n},minmax(0,1fr))">${labels.map((l) => `<span>${esc(l)}</span>`).join("")}</div>`
    : "";
  return `<figure class="pc-chart" style="margin:0"><div class="pc-plot"><span class="pc-y">${esc(fmt(top))}</span>${svgOpen(w, h, title)}${body}</svg></div>${x}${legend}</figure>`;
}

/** A small step sparkline (fixed width, default 72×20). */
export function sparkline(values, { w = 72, h = 20, cell = 2, tone: t = "accent", max, min, title = "Trend" } = {}) {
  const vals = values.filter(finite);
  if (vals.length < 2) return "";
  const lo = finite(min) ? min : Math.min(...vals),
    hi = finite(max) ? max : Math.max(...vals);
  const rects = stepRects(values, { w, h, cell, max: hi === lo ? lo + 1 : hi, min: lo });
  return `<svg class="pc-spark" viewBox="0 0 ${w} ${h}" width="${w}" height="${h}" shape-rendering="crispEdges" role="img" aria-label="${esc(title)}" style="display:block;flex:none">${rects.map((r) => rect(r, tone(t))).join("")}</svg>`;
}

/** One horizontal bar (0..max) with an optional reference tick (e.g. league average). */
export function hbar(value, max, { avg, tone: t = "accent", h = 12, cell = 4, title = "" } = {}) {
  const w = 160,
    len = scaleTo(value, max, w, cell);
  let s = rect({ x: 0, y: 0, w, h }, "var(--gd-bg-2)");
  for (let x = cell * 2; x < w; x += cell * 4) s += rect({ x, y: h - 2, w: 1, h: 2 }, TONES.line);
  if (len) s += rect({ x: 0, y: 2, w: len, h: h - 4 }, tone(t)) + rect({ x: 0, y: 2, w: len, h: 2 }, SHINE);
  if (finite(avg) && finite(max) && max > 0) {
    const x = Math.min(w - 2, snap((avg / max) * w, 2));
    s += rect({ x, y: 0, w: 2, h }, TONES.text);
  }
  return `<svg class="pc-hbar" viewBox="0 0 ${w} ${h}" width="100%" height="${h}" preserveAspectRatio="none" shape-rendering="crispEdges" role="img" aria-label="${esc(title)}" style="display:block">${s}</svg>`;
}

/** HTML block meter: `segments` squares, `blocks(value,max)` of them filled in the tone. */
export function meter(value, max, { segments = 10, tone: t = "accent", size = 8, title = "" } = {}) {
  const on = blocks(value, max, segments);
  const sq = (fill) =>
    `<i style="display:block;width:${size}px;height:${size}px;background:${fill};box-shadow:inset -1px -1px 0 color-mix(in srgb, var(--gd-bg) 55%, transparent)"></i>`;
  return `<span class="pc-meter" role="img" aria-label="${esc(title || `${on} of ${segments}`)}" style="display:inline-flex;gap:2px;vertical-align:middle">${Array.from({ length: segments }, (_, i) => sq(i < on ? tone(t) : "var(--gd-bg-2)")).join("")}</span>`;
}

function fmt(v) {
  if (!finite(v)) return "—";
  return Math.abs(v) >= 100 ? String(Math.round(v)) : String(Math.round(v * 10) / 10);
}
