// Reusable view components (string templates, like the rest of the workspace). Every
// component escapes its text inputs; `body`/`html` arguments are trusted markup.
const e = (v) =>
  String(v ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
export { e as escapeHTML };

export const card = ({ title, action = "", body, span = 4, accent = false, scroll = false, cls = "" }) =>
  `<section class="gd-card gd-span-${span} ${accent ? "gd-accent" : ""} ${cls}">${title ? `<header class="gd-card-head"><h3>${e(title)}</h3>${action}</header>` : ""}<div class="gd-card-body ${scroll ? "gd-scroll" : ""}">${body}</div></section>`;

export const link = (label, onclick) => `<button class="gd-link" onclick="${e(onclick)}">${e(label)} →</button>`;

export const tabs = (items, active, onclick, { small = false, label = "Sections" } = {}) =>
  `<div class="gd-tabs ${small ? "gd-small" : ""}" role="tablist" aria-label="${e(label)}">${items
    .map(([id, text]) => `<button role="tab" aria-selected="${id === active}" onclick="${e(onclick.replace("$id", id))}">${e(text)}</button>`)
    .join("")}</div>`;

export const stat = (label, value, note = "", trend = 0) =>
  `<div class="gd-stat"><small>${e(label)}</small><b class="${trend > 0 ? "gd-up" : trend < 0 ? "gd-down" : ""}">${e(value)}</b>${note ? `<i>${e(note)}</i>` : ""}</div>`;

export const stats = (items) => `<div class="gd-stats">${items.map((x) => stat(...x)).join("")}</div>`;

export const meter = (label, value, { max = 100, color = null, suffix = "" } = {}) => {
  const pct = Math.max(0, Math.min(100, (value / max) * 100));
  return `<div class="gd-meter"><span>${e(label)}</span><div class="gd-meter-track"><i style="width:${pct.toFixed(1)}%${color ? `;--gd-meter:${color}` : ""}"></i></div><b>${e(Math.round(value))}${e(suffix)}</b></div>`;
};

export const tone = (v, good = 65, bad = 40) => (v >= good ? "var(--gd-good)" : v <= bad ? "var(--gd-bad)" : "var(--gd-warn)");

export const momentumBar = (value) => {
  const w = Math.min(50, Math.abs(value) / 2);
  return `<div class="gd-momentum" role="meter" aria-valuemin="-100" aria-valuemax="100" aria-valuenow="${value}" aria-label="Momentum"><i class="${value >= 0 ? "gd-pos" : "gd-neg"}" style="width:${w}%"></i></div>`;
};

export const chip = (text, kind = "") => `<span class="gd-chip ${kind ? "gd-" + kind : ""}">${e(text)}</span>`;

export function sparkline(values, { width = 160, height = 34 } = {}) {
  if (!values?.length || values.length < 2) return "";
  const lo = Math.min(...values),
    hi = Math.max(...values),
    span = hi - lo || 1,
    pts = values.map((v, i) => `${((i / (values.length - 1)) * width).toFixed(1)},${(height - 3 - ((v - lo) / span) * (height - 6)).toFixed(1)}`);
  return `<svg class="gd-spark" viewBox="0 0 ${width} ${height}" preserveAspectRatio="none" aria-hidden="true"><path d="M${pts.join(" L")}"/></svg>`;
}

export const row = ({ lead, title, sub = "", trail = "", onclick = null }) =>
  `<${onclick ? `button onclick="${e(onclick)}"` : "div"} class="gd-row"><span class="gd-pos">${e(lead)}</span><span><b>${e(title)}</b>${sub ? `<small>${e(sub)}</small>` : ""}</span><span>${trail}</span></${onclick ? "button" : "div"}>`;

export const empty = (text) => `<p class="gd-empty">${e(text)}</p>`;

export const initials = (name) =>
  String(name || "?")
    .replace(/[^A-Za-z ]/g, " ")
    .split(/\s+/)
    .filter(Boolean)
    .map((w) => w[0])
    .slice(0, 2)
    .join("")
    .toUpperCase() || "?";

export const compact = (n) => (n >= 1e6 ? (n / 1e6).toFixed(1) + "M" : n >= 1e3 ? (n / 1e3).toFixed(n < 1e4 ? 1 : 0) + "K" : String(Math.round(n)));

export const post = (p) =>
  `<article class="gd-post"><span class="gd-avatar gd-a-${e(p.archetype || "fan")}">${e(initials(p.name))}</span><div><div class="gd-post-head"><b>${e(p.name)}</b>${p.verified ? chip("✓", "team") : ""}<small>@${e(p.handle)} · ${e(p.voiceKind || "")}</small></div><p>${e(p.body)}</p><div class="gd-post-meta"><span>♥ ${compact(p.likes || 0)}</span>${p.reposts ? `<span>⟲ ${compact(p.reposts)}</span>` : ""}<span>💬 ${(p.comments || []).length}</span>${p.tone ? `<span>${e(p.tone)}</span>` : ""}</div></div></article>`;

export const hexToRgb = (hex) => {
  const m = /^#?([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(hex || "");
  return m ? m.slice(1).map((x) => parseInt(x, 16)).join(", ") : "59, 108, 200";
};
