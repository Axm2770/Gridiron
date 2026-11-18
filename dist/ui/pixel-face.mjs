// A player's face as a crisp pixel-art bust (32×32 sprite from presentation/pixel-art.mjs),
// sized for lists and cards. Pure string markup: no canvas, no filters, no external assets,
// so it renders the same inside dialogs and works in Node tests.
import { pixelPortrait, teamColors } from "../presentation/pixel-art.mjs";

const cache = new Map();
const FREE_AGENT = { primary: "#5d6577", secondary: "#f4efe2", dark: "#3a3f4a" };

// pixelFace(p, { size = 32, team, label, cls }) → `<span class="px-face">…svg…</span>`.
// `team` picks the jersey colours (omit for the player's own club colours unknown → neutral).
export function pixelFace(p, { size = 32, team = null, label = "", cls = "" } = {}) {
  if (!p) return "";
  const colors = team == null || team < 0 ? FREE_AGENT : teamColors(team),
    key = `${p.id ?? p.name}|${colors.primary}|${colors.secondary}`;
  let svg = cache.get(key);
  if (!svg) {
    svg = pixelPortrait(p.face, { seed: p.id || p.name || "", colors }).replace("<svg ", '<svg width="100%" height="100%" ');
    if (cache.size > 600) cache.clear();
    cache.set(key, svg);
  }
  const s = Math.max(12, Math.round(Number(size) || 32));
  return `<span class="px-face ${cls}" style="display:inline-block;flex:none;width:${s}px;height:${s}px;line-height:0;image-rendering:pixelated"${label ? ` title="${String(label).replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`)}"` : ""}>${svg}</span>`;
}
