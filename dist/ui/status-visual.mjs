// Status visuals: small string-template pieces that replace plain grey "value text" in lists and
// table cells ("0 / 10 · on pace for 0.0", "$31.0M room", "2 / 1 starting", "65%") with something
// you can read at a glance. Pure markup (works in Node tests and inside dialogs); styles live in
// ui/status-visual.css, which uses design tokens only, so both themes work.
//
//   meter(value, max, { target, pace, tone, cells, label })   block meter with a target tick and pace marker
//   chip(text, tone, icon)                                     status chip with a pixel glyph
//   stateChip(state)                                           done | on | risk | missed | pending chip
//   pips(n, of, { tone, max })                                 one square per unit (2 / 1 starting)
//   money(used, cap, { room })                                 cap bar: used fill, room hatched, over-cap red
//   num(value, unit)                                           bold display-font number with a small label
//   metric(head, visual)                                       a value slot: headline row over a visual
//   targetVisual(v)                                            a Boardroom target row's value slot
//
// Pure models (tested in test-status-visuals.mjs): meterModel, pipModel, moneyModel, paceStatus,
// toneFor, STATE_CHIP.

const esc = (v) =>
  String(v ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
const fin = (v) => typeof v === "number" && Number.isFinite(v);
const num0 = (v) => (fin(v) ? v : 0);
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

export const TONES = ["good", "warn", "bad", "pending", "accent", "neutral"];
/** A known tone name, or "neutral". */
export const tone = (t) => (TONES.includes(t) ? t : "neutral");
/** good ≥ good, bad < bad, warn between (higher is better unless `invert`). Non-numbers are neutral. */
export function toneFor(v, good = 65, bad = 40, invert = false) {
  if (!fin(v)) return "neutral";
  if (invert) return v <= good ? "good" : v > bad ? "bad" : "warn";
  return v >= good ? "good" : v < bad ? "bad" : "warn";
}

// 7×7 glyphs ("#" = lit pixel), drawn as one crisp path.
const GLYPHS = {
  check: ["", "......#", ".....##", "#...##", "##.##", ".###", "..#"],
  cross: ["##...##", ".##.##", "..###", "..###", ".##.##", "##...##"],
  alert: ["...#", "..###", "..###", ".##.##", ".##.##", "#######", "###.###"],
  clock: [".#####", "##.#.##", "#..#..#", "#..##.#", "#.....#", "##...##", ".#####"],
  dot: ["", "..###", ".#####", ".#####", ".#####", "..###"],
  up: ["...#", "..###", ".#####", "#######", "..###", "..###", "..###"],
  down: ["..###", "..###", "..###", "#######", ".#####", "..###", "...#"],
  minus: ["", "", "", "#######", "#######"],
};
const pathCache = new Map();
function glyphPath(name) {
  if (pathCache.has(name)) return pathCache.get(name);
  let d = "";
  (GLYPHS[name] || []).forEach((row, y) => {
    for (let x = 0; x < row.length; ) {
      if (row[x] !== "#") {
        x++;
        continue;
      }
      let w = 0;
      while (row[x + w] === "#") w++;
      d += `M${x} ${y}h${w}v1h-${w}z`;
      x += w;
    }
  });
  pathCache.set(name, d);
  return d;
}
export const GLYPH_NAMES = Object.keys(GLYPHS);
export const glyph = (name) =>
  GLYPHS[name]
    ? `<svg class="sv-glyph" viewBox="0 0 7 7" width="9" height="9" fill="currentColor" shape-rendering="crispEdges" aria-hidden="true"><path d="${glyphPath(name)}"/></svg>`
    : "";

/** Cells lit for value on 0..max (any positive value lights one), plus target/pace cell positions.
 *  `target` and `pace` are reported as the 1-based cell they fall in (null when absent or invalid). */
export function meterModel(value, max, { cells = 10, target = null, pace = null } = {}) {
  const n = Math.max(1, Math.round(num0(cells)) || 10),
    m = num0(max),
    v = num0(value),
    at = (x) => (fin(x) && m > 0 ? clamp(Math.round((x / m) * n), 0, n) : null),
    lit = m > 0 && v > 0 ? clamp(Math.round((v / m) * n), 1, n) : 0,
    tgt = at(target),
    pc = at(pace);
  return {
    cells: n,
    lit,
    pct: m > 0 ? clamp((v / m) * 100, 0, 100) : 0,
    target: tgt === null ? null : Math.max(1, tgt),
    pace: pc === null ? null : Math.max(1, pc),
    reached: fin(target) ? v >= target : null,
  };
}

/** Block meter. A tick marks the target (after its cell); a small notch under a cell marks the pace. */
export function meter(value, max, { target = null, pace = null, tone: t = "accent", cells = 10, label = "", cls = "" } = {}) {
  const md = meterModel(value, max, { cells, target, pace }),
    aria = label || `${fin(value) ? value : 0} of ${fin(max) ? max : 0}${fin(target) ? `, target ${target}` : ""}`;
  return `<span class="sv-meter ${tone(t)} ${cls}" role="img" aria-label="${esc(aria)}" style="--sv-cells:${md.cells}">${Array.from(
    { length: md.cells },
    (_, i) => `<i class="${i < md.lit ? "on" : ""}${md.target === i + 1 ? " tgt" : ""}${md.pace === i + 1 ? " pace" : ""}"></i>`,
  ).join("")}</span>`;
}

/** Status chip. tone: good | warn | bad | pending | accent | neutral. icon: a GLYPH_NAMES entry. */
export const chip = (text, t = "neutral", icon = "") =>
  `<span class="sv-chip ${tone(t)}">${glyph(icon)}<span>${esc(text)}</span></span>`;

// Row states used by the Boardroom targets (and anything else with a pass/fail target).
export const STATE_CHIP = {
  done: { text: "Met", tone: "good", icon: "check" },
  on: { text: "On track", tone: "good", icon: "dot" },
  risk: { text: "At risk", tone: "warn", icon: "alert" },
  missed: { text: "Missed", tone: "bad", icon: "cross" },
  pending: { text: "Pending", tone: "pending", icon: "clock" },
};
export const stateChip = (state) => {
  const c = STATE_CHIP[state] || STATE_CHIP.pending;
  return chip(c.text, c.tone, c.icon);
};

/** Pip counts: `filled` of `of`, capped at `max` drawn pips (the rest is summarised as +n). */
export function pipModel(n, of, max = 12) {
  const have = Math.max(0, Math.round(num0(n))),
    need = Math.max(0, Math.round(num0(of))),
    total = Math.max(have, need),
    shown = Math.min(total, Math.max(1, max));
  return { have, need, shown, extra: total - shown, met: have >= need };
}
export function pips(n, of, { tone: t = "", max = 12, label = "", mark = true } = {}) {
  const md = pipModel(n, of, max),
    tn = t || (md.met ? "good" : "warn");
  return `<span class="sv-pips ${tone(tn)}" role="img" aria-label="${esc(label || `${md.have} of ${md.need}`)}">${Array.from(
    { length: md.shown },
    (_, i) => `<i class="${i < md.have ? "on" : ""}${i >= md.need ? " over" : ""}${mark && i === md.need - 1 && md.need < md.shown ? " need" : ""}"></i>`,
  ).join("")}${md.extra ? `<b>+${md.extra}</b>` : ""}</span>`;
}

/** Cap bar model: share used, room left (negative when over). */
export function moneyModel(used, cap) {
  const u = Math.max(0, num0(used)),
    c = Math.max(0, num0(cap));
  return { used: u, cap: c, room: c - u, pct: c > 0 ? clamp((u / c) * 100, 0, 100) : u > 0 ? 100 : 0, over: u > c };
}
/** Cap bar: used fill on a cap-wide track; room hatched; over the cap turns the bar red. */
export function money(used, cap, { label = "", tone: t = "" } = {}) {
  const md = moneyModel(used, cap),
    tn = t || (md.over ? "bad" : md.pct >= 95 ? "warn" : "accent");
  return `<span class="sv-money ${tone(tn)}" role="img" aria-label="${esc(label || `${Math.round(md.pct)}% of the cap used`)}"><i style="width:${md.pct.toFixed(1)}%"></i></span>`;
}
/** $X.XM from a value already in millions (callers divide by the state's MILLION). */
export const millions = (m, digits = 1) => `$${num0(m).toFixed(digits)}M`;

/** Bold display-font number with an optional small uppercase unit. */
export const num = (value, unit = "", t = "") =>
  `<span class="sv-num ${t ? tone(t) : ""}"><b>${esc(value)}</b>${unit ? `<small>${esc(unit)}</small>` : ""}</span>`;

/** A value slot: a headline row (number, chips) over a visual. */
export const metric = (head, visual = "", cls = "") => `<span class="sv-metric ${cls}"><span class="sv-metric-head">${head}</span>${visual}</span>`;

/** Pace readout for a win target. Before any game, and before `ready` games, pace says nothing yet. */
export function paceStatus({ played = 0, pace = null, target = null, over = false, ready = 4 } = {}) {
  const p = Math.max(0, Math.round(num0(played)));
  if (over) return { show: false, text: "", tone: "neutral", icon: "" };
  if (p === 0 || !fin(pace)) return { show: false, text: "Season starts week 1", tone: "pending", icon: "clock" };
  if (p < ready) return { show: false, text: `Pace after ${ready} games`, tone: "pending", icon: "clock" };
  const ahead = fin(target) ? pace >= target : true;
  return { show: true, text: `Pace ${pace.toFixed(1)}`, tone: ahead ? "good" : pace >= target - 1 ? "warn" : "bad", icon: ahead ? "up" : "down" };
}

/** The value slot of one Boardroom target row, from the item's `visual` model (board-meetings.mjs). */
export function targetVisual(v) {
  if (!v || typeof v !== "object") return "";
  switch (v.kind) {
    case "progress": {
      const ps = paceStatus(v),
        reached = num0(v.value) >= num0(v.target),
        tn = reached ? "good" : v.state === "missed" ? "bad" : v.state === "risk" ? "warn" : "accent";
      return metric(
        `${num(num0(v.value), `/ ${num0(v.target)} ${v.unit || ""}`.trim())}${ps.text ? chip(ps.text, ps.tone, ps.icon) : ""}`,
        meter(v.value, v.max || v.target, {
          target: v.target,
          pace: ps.show ? v.pace : null,
          cells: clamp(Math.round(num0(v.max || v.target)), 4, 20),
          tone: tn,
          label: `${num0(v.value)} of ${num0(v.target)} ${v.unit || ""}${ps.show ? `, ${ps.text}` : ""}`.trim(),
        }),
        "sv-progress",
      );
    }
    case "status":
      return metric(chip(v.text, v.tone, v.icon), "", "sv-status");
    case "money": {
      const md = moneyModel(v.used, v.cap);
      return metric(
        `${num(millions(Math.abs(md.room)), md.over ? "over" : "room", md.over ? "bad" : "")}<small class="sv-cap">${millions(md.used)} / ${millions(md.cap)}</small>`,
        money(v.used, v.cap),
        "sv-cap-slot",
      );
    }
    case "ratio":
      return metric(`${num(num0(v.value), `/ ${num0(v.need)} ${v.unit || ""}`.trim())}`, pips(v.value, v.need, { label: `${num0(v.value)} of ${num0(v.need)} ${v.unit || ""}`.trim() }), "sv-ratio");
    case "percent": {
      const t = num0(v.value) >= num0(v.threshold) ? "good" : "bad";
      return metric(`${num(`${Math.round(num0(v.value))}%`, `min ${num0(v.threshold)}%`, t)}`, meter(v.value, 100, { target: v.threshold, tone: t, cells: 20, label: `${Math.round(num0(v.value))}%, minimum ${num0(v.threshold)}%` }), "sv-percent");
    }
    default:
      return v.text ? metric(chip(v.text, v.tone || "neutral", v.icon || "")) : "";
  }
}

/** Load ui/status-visual.css once (browser only). */
export function ensureStatusStyles() {
  if (typeof document === "undefined" || typeof document.querySelector !== "function") return;
  if (!document.querySelector('link[href="ui/status-visual.css"]'))
    document.head?.insertAdjacentHTML?.("beforeend", '<link rel="stylesheet" href="ui/status-visual.css">');
}
