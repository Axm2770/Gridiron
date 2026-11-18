// Pixel-art player faces for lists and cards: a 32×32 sprite bust (presentation/pixel-art.mjs)
// drawn from the same face data as the illustrated portrait (newgens.faceSVG), so a player looks
// like himself on every screen. Pure string markup: no canvas, no filters, no external assets,
// so it renders the same inside dialogs and works in Node tests. Sized inline; draft.css and
// market.css only frame it.
import { pixelPortrait, teamColors, shade } from "../presentation/pixel-art.mjs";
import { newgenIdentity, identitySeed } from "../franchise/newgens.mjs";

// College and unattached players wear one of a few muted practice colours, picked by college.
const NEUTRAL = ["#3b4a63", "#5a3b3b", "#2f5a4a", "#5a4f2f", "#45395f", "#2f4f5f"];
const cache = new Map();
const escAttr = (v) => String(v ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);

// pixelFace(p, { size = 48, team, label, cls }) → `<span class="gd-pixel-face px-face">…svg…</span>`.
// `team` picks the jersey colours (the player's own club if known; free agents and prospects wear neutral).
export function pixelFace(p, { size = 48, team = null, label = null, cls = "" } = {}) {
  if (!p) return "";
  const id = p.id || p.name || "player",
    face = p.face || newgenIdentity(id, 0).face,
    px = Math.max(12, Math.round(Number(size) || 48)),
    club = team ?? (Number.isInteger(p.team) && p.team >= 0 ? p.team : null),
    primary = NEUTRAL[identitySeed(p.college || id) % NEUTRAL.length],
    colors = club != null && club >= 0 ? teamColors(club) : { primary, secondary: "#f4efe2", dark: shade(primary, 0.62) },
    alt = label ?? (p.name ? `${p.name} portrait` : ""),
    key = `${id}|${colors.primary}|${colors.secondary}|${alt}`;
  let svg = cache.get(key);
  if (!svg) {
    svg = pixelPortrait(face, { seed: id, colors, label: alt }).replace("<svg ", '<svg width="100%" height="100%" ');
    if (cache.size > 800) cache.clear();
    cache.set(key, svg);
  }
  return `<span class="gd-pixel-face px-face ${escAttr(cls)}" style="--pf-size:${px}px;display:inline-block;flex:none;width:${px}px;height:${px}px;line-height:0;image-rendering:pixelated">${svg}</span>`;
}
