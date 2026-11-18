// Shared pixel pieces for the front-office screens (Contracts, Coaching staff, Boardroom,
// Organization hub, Coach career and Career dossier): chunky panels with header bars, block
// meters, a signal-bar gauge, stacked cap bars, pagers and pixel staff busts. Pure string
// markup (works in Node tests); styles live in fo-pixel.css, loaded on first use.
import { pixelPortrait, teamColors, shade } from "../presentation/pixel-art.mjs";
import { newgenIdentity, identitySeed } from "./newgens.mjs";
import { coachPixelAvatar } from "./coach-avatar.mjs";
import { blockCount } from "./cap-sheet.mjs";

const h = (v) => String(v ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);

export function ensureFrontDeskStyles() {
  if (typeof document === "undefined" || typeof document.querySelector !== "function") return;
  if (!document.querySelector('link[href="fo-pixel.css"]'))
    document.head?.insertAdjacentHTML?.("beforeend", '<link rel="stylesheet" href="fo-pixel.css">');
}

// Whole squares, never a smooth fill. tone: "" (accent) | good | warn | bad.
export const blocks = (value, max, cells = 10, tone = "", label = "") =>
  `<span class="fp-blocks ${tone}" ${label ? `role="img" aria-label="${h(label)}"` : 'aria-hidden="true"'}>${Array.from({ length: cells }, (_, i) => `<i${i < blockCount(value, max, cells) ? ' class="on"' : ""}></i>`).join("")}</span>`;

// Signal-bar gauge (rising columns) for 0–100 values such as job security.
export function gauge(value, { cells = 16, label = "" } = {}) {
  const lit = blockCount(value, 100, cells),
    tone = (i) => (i < cells * 0.4 ? "bad" : i < cells * 0.6 ? "warn" : "good");
  return `<span class="fp-gauge" role="img" aria-label="${h(label || value + " of 100")}">${Array.from({ length: cells }, (_, i) => `<i class="${tone(i)}${i < lit ? " on" : ""}" style="height:${Math.round(28 + (72 * (i + 1)) / cells)}%"></i>`).join("")}</span>`;
}

// Horizontal stacked bar. parts: [{ pct, tone, label }]; tone "room" draws the hatched space.
export const stackBar = (parts, cls = "") =>
  `<div class="fp-stack ${cls}">${parts
    .filter((x) => x.pct > 0)
    .map((x) => `<i class="${x.tone || ""}" style="width:${Math.min(100, x.pct)}%" title="${h(x.label || "")}"></i>`)
    .join("")}</div>`;

export const chip = (text, tone = "") => `<span class="fp-chip ${tone}">${h(text)}</span>`;

// A chunky panel: header bar (title + optional kicker and extras) over a padded body.
export const panel = ({ title, body, extra = "", kicker = "", cls = "", flush = false }) =>
  `<section class="fp-panel ${cls}"><div class="fp-head"><div>${kicker ? `<span class="fp-kicker">${kicker}</span>` : ""}<h2>${title}</h2></div>${extra ? `<div class="fp-head-extra">${extra}</div>` : ""}</div><div class="fp-body${flush ? " flush" : ""}">${body}</div></section>`;

// Stat tile: label, headline number, optional block meter and caption.
export const tile = (label, value, sub = "", { tone = "", meter = "" } = {}) =>
  `<div class="fp-tile ${tone}"><small>${label}</small><b>${value}</b>${meter}${sub ? `<span>${sub}</span>` : ""}</div>`;

export const pager = ({ label, page, pages, prev, next }) =>
  `<div class="fp-pager"><span>${label}</span><div><button class="secondary small" onclick="${prev}" ${page <= 0 ? "disabled" : ""}>◀ Prev</button><b>${page + 1} / ${Math.max(1, pages)}</b><button class="secondary small" onclick="${next}" ${page >= pages - 1 ? "disabled" : ""}>Next ▶</button></div></div>`;

const NEUTRAL = ["#3b4a63", "#5a3b3b", "#2f5a4a", "#5a4f2f", "#45395f", "#2f4f5f"];
const SUITS = new Set(["GM", "Scout"]);
const cache = new Map();
// Pixel bust for a staff member or candidate. Coaches wear club colours and a cap; executives
// wear a suit; the user's own coach is drawn from the career appearance.
export function staffBust(c, { size = 48, team = null, appearance = null, cls = "" } = {}) {
  if (!c) return "";
  const club = team ?? (Number.isInteger(c.employer) ? c.employer : null),
    key = `${c.id}|${club}|${size}|${appearance ? JSON.stringify(appearance) : ""}`;
  let svg = cache.get(key);
  if (!svg) {
    if (appearance) svg = coachPixelAvatar(appearance, { label: `${c.name} portrait`, seed: String(c.id || c.name) });
    else {
      const primary = NEUTRAL[identitySeed(String(c.id || c.name)) % NEUTRAL.length],
        colors = club != null && club >= 0 ? teamColors(club) : { primary, secondary: "#f4efe2", dark: shade(primary, 0.62) },
        suit = SUITS.has(c.role) || c.role === "Owner";
      svg = pixelPortrait(newgenIdentity(String(c.id || c.name), 0).face, {
        seed: String(c.id || c.name),
        outfit: suit ? "suit" : "jersey",
        colors,
        cap: !suit && c.role !== "Medical",
        label: `${c.name} portrait`,
      });
    }
    svg = svg.replace("<svg ", '<svg width="100%" height="100%" ');
    if (cache.size > 400) cache.clear();
    cache.set(key, svg);
  }
  return `<span class="gd-pixel-face fp-bust ${cls}" style="--pf-size:${size}px;width:${size}px;height:${size}px">${svg}</span>`;
}
