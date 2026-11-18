// Pixel-art player faces for lists and cards: a 32×32 sprite bust (presentation/pixel-art.mjs)
// drawn from the same face data as the illustrated portrait (newgens.faceSVG), so a player looks
// like himself on every screen. Pure markup; sizing and framing live in ui/pixel-art.css.
import { pixelPortrait, teamColors, shade } from "../presentation/pixel-art.mjs";
import { newgenIdentity, identitySeed } from "../franchise/newgens.mjs";

// College / unattached players wear one of a few muted practice colours, picked by college.
const NEUTRAL = ["#3b4a63", "#5a3b3b", "#2f5a4a", "#5a4f2f", "#45395f", "#2f4f5f"];

const escAttr = (v) => String(v ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);

export function pixelFace(p, { size = 48, team = null, label = null, cls = "" } = {}) {
  const id = p?.id || p?.name || "player",
    face = p?.face || newgenIdentity(id, 0).face,
    px = Math.max(16, Math.round(Number(size) || 48)),
    club = team ?? (Number.isInteger(p?.team) && p.team >= 0 ? p.team : null),
    primary = NEUTRAL[identitySeed(p?.college || id) % NEUTRAL.length],
    colors = club != null ? teamColors(club) : { primary, secondary: "#f4efe2", dark: shade(primary, 0.62) };
  return `<span class="gd-pixel-face ${escAttr(cls)}" style="--pf-size:${px}px">${pixelPortrait(face, { seed: id, colors, label: label ?? (p?.name ? `${p.name} portrait` : "") })}</span>`;
}
