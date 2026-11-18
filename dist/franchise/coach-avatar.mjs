// Small 2D coach avatars (sidebar, career card, career library) drawn as pixel-art SVG from the
// same appearance the 3D coach uses. Read-only; styles live in career.css.
import { pixelPortrait, shade } from "../presentation/pixel-art.mjs";
import { DEFAULT_APPEARANCE } from "./coach-profile.mjs";

const hex = (v, fallback) => (/^#[0-9a-f]{6}$/i.test(v || "") ? v : fallback);
const HAIR_STYLE = { Short: 0, Curly: 1, Bald: 4 };

// The career's coach appearance, falling back to the older career.avatar colours.
export function coachAppearance(s) {
  const a = s?.franchise?.userCoach?.appearance,
    avatar = s?.franchise?.career?.avatar;
  return {
    ...DEFAULT_APPEARANCE,
    ...(a || {}),
    skin: hex(a?.skin || avatar?.skin, DEFAULT_APPEARANCE.skin),
    jacket: hex(a?.jacket || avatar?.shirt, DEFAULT_APPEARANCE.jacket),
  };
}

// A 32×32 pixel bust. `appearance` may be partial or null (older saves).
export function coachPixelAvatar(appearance, { label = "", cls = "", seed = "coach" } = {}) {
  const a = { ...DEFAULT_APPEARANCE, ...(appearance || {}) },
    jacket = hex(a.jacket, DEFAULT_APPEARANCE.jacket),
    face = {
      skin: hex(a.skin, DEFAULT_APPEARANCE.skin),
      hair: hex(a.hair, DEFAULT_APPEARANCE.hair),
      style: HAIR_STYLE[a.hairStyle] ?? 0,
      beard: a.beard === "Full" || a.beard === "Stubble",
      seed,
    };
  return pixelPortrait(face, {
    seed,
    outfit: a.outfit === "Suit" ? "suit" : "jersey",
    colors: { primary: jacket, secondary: "#f4efe2", dark: shade(jacket, 0.6) },
    cls: "coach-pixel-avatar " + cls,
    label,
  });
}

// Sidebar/card avatar: the pixel bust in the pixel theme, initials in the classic theme.
// Both are rendered so toggling the theme needs no re-render.
export function coachBadge(name, appearance) {
  const initials = String(name || "Coach")
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((x) => x[0])
    .join("");
  return `<span class="coach-badge" aria-hidden="true">${coachPixelAvatar(appearance)}<span class="coach-badge-initials">${initials.replace(/[&<>"']/g, "")}</span></span>`;
}
