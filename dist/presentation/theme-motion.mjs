// Screen-wide theme and motion: derives a readable accent from the club colour, applies it to
// every view, animates view changes and counts up headline numbers.
import { TEAM_COLORS } from "./team-colors.mjs";

export function hexToHsl(hex) {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255),
    max = Math.max(r, g, b),
    min = Math.min(r, g, b),
    l = (max + min) / 2,
    d = max - min;
  if (!d) return [0, 0, l];
  const s = d / (1 - Math.abs(2 * l - 1)),
    h = max === r ? ((g - b) / d) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return [(h * 60 + 360) % 360, s, l];
}

export const hsl = ([h, s, l]) => `hsl(${Math.round(h)} ${Math.round(s * 100)}% ${Math.round(l * 100)}%)`;

// Club colours range from near-black navy to bright orange; lift lightness so the accent stays
// legible as text and as a button fill on the dark surfaces.
export function accentFor(hex) {
  const [h, s, l] = hexToHsl(hex);
  return hsl([h, Math.min(0.85, Math.max(0.45, s)), Math.max(0.62, Math.min(0.72, l + 0.25))]);
}

const rgb = (hex) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16)).join(", ");

export function applyTheme(team) {
  const color = TEAM_COLORS[team] ?? "#3b6cc8",
    body = document.body.style;
  body.setProperty("--team", color);
  body.setProperty("--team-rgb", rgb(color));
  body.setProperty("--gd-accent", accentFor(color));
}

// Animates a number from 0 (or its last value) to the target in place.
function countUp(el) {
  const text = el.textContent.trim(),
    m = /^([^\d-]*)(-?[\d,]+(?:\.\d+)?)(.*)$/.exec(text);
  if (!m || el.dataset.counted === text) return;
  el.dataset.counted = text;
  const target = Number(m[2].replace(/,/g, "")),
    decimals = (m[2].split(".")[1] || "").length,
    grouped = m[2].includes(",");
  if (!Number.isFinite(target) || Math.abs(target) > 1e7) return;
  const start = performance.now(),
    duration = 700;
  el.classList.add("gd-counting");
  const step = (now) => {
    const k = Math.min(1, (now - start) / duration),
      v = target * (1 - Math.pow(1 - k, 3)),
      shown = decimals ? v.toFixed(decimals) : Math.round(v);
    el.textContent = m[1] + (grouped ? Number(shown).toLocaleString("en-US") : shown) + m[3];
    if (k < 1) requestAnimationFrame(step);
    else el.textContent = text;
  };
  requestAnimationFrame(step);
}

export function installThemeMotion({ getSection = () => "" } = {}) {
  document.body.classList.add("gd-themed");
  const reduced = () => matchMedia("(prefers-reduced-motion: reduce)").matches;
  let lastView = null,
    lastTeam = null;
  const previous = render;
  render = function () {
    previous();
    if (typeof state === "undefined" || !state) return;
    if (state.team !== lastTeam) {
      lastTeam = state.team;
      applyTheme(state.team);
    }
    const app = document.getElementById("app"),
      key = `${typeof view !== "undefined" ? view : ""}:${getSection()}:${window.__gdHubTab ?? ""}`;
    if (!app || key === lastView) return;
    lastView = key;
    if (reduced()) return;
    app.classList.remove("gd-view-enter");
    void app.offsetWidth;
    app.classList.add("gd-view-enter");
    setTimeout(() => app.classList.remove("gd-view-enter"), 900);
    app.querySelectorAll(".gd-stat b, .stat b, .dash-metric b").forEach(countUp);
  };
}
