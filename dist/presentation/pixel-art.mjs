// Pixel-art presentation for cutscenes and news: sprite portraits, jerseys and full-screen
// pixel scenes (signing day, head coach arrival). Everything is drawn on small pixel grids and
// emitted as crisp SVG, so it works in HTML strings, scales without blur and needs no assets.
// Read-only over state; styles live in ui/pixel-art.css.
import { TEAM_COLORS } from "./team-colors.mjs";

/* ------------------------------------------------------------------ colour */

const hex = (c) => (/^#[0-9a-f]{6}$/i.test(c || "") ? c.toLowerCase() : null);
const rgb = (c) => [1, 3, 5].map((i) => parseInt(c.slice(i, i + 2), 16));
const toHex = (a) => "#" + a.map((v) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, "0")).join("");
export const shade = (c, f) => toHex(rgb(c).map((v) => v * f));
export const mix = (a, b, t) => toHex(rgb(a).map((v, i) => v + (rgb(b)[i] - v) * t));
const luma = (c) => {
  const [r, g, b] = rgb(c);
  return (0.299 * r + 0.587 * g + 0.114 * b) / 255;
};
const OUTLINE = "#0b0d12";
// The app keeps `state` and `clubs` as classic-script globals (script scope, not window
// properties); tests may set them on globalThis instead.
const gameState = () => (typeof state !== "undefined" ? state : globalThis.state);
const clubTable = () => (typeof clubs !== "undefined" ? clubs : globalThis.clubs);

// Uniform colours: an approved (non-alternate) uniform wins, then the club's primary colour.
export function teamColors(team, s = gameState()) {
  const club = s?.franchise?.clubs?.[team],
    u = club?.uniform && !club.uniform.alternateOnly ? club.uniform : null,
    primary = hex(u?.primary) || TEAM_COLORS[team] || "#3b6cc8",
    secondary = hex(u?.secondary) || (luma(primary) > 0.55 ? "#14181f" : "#f4efe2");
  // A trim colour too close to the body colour would make the number unreadable.
  const trim = Math.abs(luma(primary) - luma(secondary)) < 0.25 ? (luma(primary) > 0.5 ? "#14181f" : "#f4efe2") : secondary;
  return { primary, secondary: trim, dark: shade(primary, 0.62) };
}

export function teamLabel(team, s = gameState()) {
  const id = s?.franchise?.clubs?.[team]?.identity,
    c = clubTable()?.[team];
  return {
    abbr: id?.abbr || c?.[0] || "GD",
    city: id?.city || c?.[1] || "",
    name: id?.name || c?.[2] || `Team ${Number(team) + 1}`,
  };
}

/* -------------------------------------------------------------------- grid */

export class PixelGrid {
  constructor(w, h) {
    this.w = w;
    this.h = h;
    this.px = new Array(w * h).fill(null);
  }
  set(x, y, c) {
    x = Math.floor(x);
    y = Math.floor(y);
    if (c && x >= 0 && y >= 0 && x < this.w && y < this.h) this.px[y * this.w + x] = c;
  }
  get(x, y) {
    return x >= 0 && y >= 0 && x < this.w && y < this.h ? this.px[y * this.w + x] : null;
  }
  rect(x, y, w, h, c) {
    for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) this.set(x + i, y + j, c);
    return this;
  }
  // Calls paint(nx, ny) for every pixel inside the ellipse; nx/ny are normalised to [-1, 1].
  ellipse(cx, cy, rx, ry, paint) {
    for (let y = Math.floor(cy - ry); y < cy + ry; y++)
      for (let x = Math.floor(cx - rx); x < cx + rx; x++) {
        const nx = (x + 0.5 - cx) / rx,
          ny = (y + 0.5 - cy) / ry;
        if (nx * nx + ny * ny <= 1) {
          const c = typeof paint === "function" ? paint(nx, ny, x, y) : paint;
          if (c) this.set(x, y, c);
        }
      }
    return this;
  }
  // Classic sprite outline: every empty pixel touching a filled one.
  outline(c = OUTLINE) {
    const edge = [];
    for (let y = 0; y < this.h; y++)
      for (let x = 0; x < this.w; x++)
        if (!this.get(x, y) && (this.get(x - 1, y) || this.get(x + 1, y) || this.get(x, y - 1) || this.get(x, y + 1))) edge.push([x, y]);
    for (const [x, y] of edge) this.set(x, y, c);
    return this;
  }
  draw(other, ox = 0, oy = 0) {
    for (let y = 0; y < other.h; y++) for (let x = 0; x < other.w; x++) this.set(x + ox, y + oy, other.get(x, y));
    return this;
  }
  text(str, x, y, c, scale = 1) {
    let cx = x;
    for (const ch of glyphText(str)) {
      const g = FONT[ch] || FONT[" "];
      g.forEach((row, j) => [...row].forEach((bit, i) => bit === "1" && this.rect(cx + i * scale, y + j * scale, scale, scale, c)));
      cx += 4 * scale;
    }
    return this;
  }
  // Horizontal runs keep the SVG small: one rect per same-coloured span.
  rects() {
    let out = "";
    for (let y = 0; y < this.h; y++)
      for (let x = 0; x < this.w; ) {
        const c = this.px[y * this.w + x];
        let n = 1;
        while (x + n < this.w && this.px[y * this.w + x + n] === c) n++;
        if (c) out += `<rect x="${x}" y="${y}" width="${n}" height="1" fill="${c}"/>`;
        x += n;
      }
    return out;
  }
  svg({ cls = "", label = "" } = {}) {
    return `<svg class="px-sprite ${cls}" viewBox="0 0 ${this.w} ${this.h}" shape-rendering="crispEdges" ${label ? `role="img" aria-label="${escAttr(label)}"` : 'aria-hidden="true"'}>${this.rects()}</svg>`;
  }
}

const escAttr = (v) => String(v ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);

/* ------------------------------------------------------------- 3×5 font */

const FONT = Object.fromEntries(
  Object.entries({
    0: "111101101101111", 1: "010110010010111", 2: "111001111100111", 3: "111001111001111", 4: "101101111001001",
    5: "111100111001111", 6: "111100111101111", 7: "111001001010010", 8: "111101111101111", 9: "111101111001111",
    A: "010101111101101", B: "110101110101110", C: "011100100100011", D: "110101101101110", E: "111100110100111",
    F: "111100110100100", G: "011100101101011", H: "101101111101101", I: "111010010010111", J: "001001001101010",
    K: "101101110101101", L: "100100100100111", M: "101111111101101", N: "110101101101101", O: "010101101101010",
    P: "110101110100100", Q: "010101101110011", R: "110101110101101", S: "011100010001110", T: "111010010010010",
    U: "101101101101111", V: "101101101101010", W: "101101111111101", X: "101101010101101", Y: "101101010010010",
    Z: "111001010100111", "-": "000000111000000", ".": "000000000000010", "'": "010010000000000", " ": "000000000000000",
  }).map(([k, v]) => [k, v.match(/.{3}/g)]),
);
// Accents fold to their base letter; anything else becomes a space.
export const glyphText = (str) =>
  String(str ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toUpperCase()
    .replace(/[^A-Z0-9\-.' ]/g, " ");
export const textWidth = (str, scale = 1) => Math.max(0, glyphText(str).length * 4 - 1) * scale;
export const fontCovers = (ch) => !!FONT[ch];

/* ---------------------------------------------------------------- figures */

const seedOf = (v) => {
  let h = 2166136261;
  for (const c of String(v ?? "")) h = Math.imul(h ^ c.charCodeAt(0), 16777619);
  return h >>> 0;
};
const SKINS = ["#f1c5a5", "#dba27b", "#b77b51", "#895737", "#623d2b"],
  HAIRS = ["#1e1713", "#34251e", "#15191c", "#5b3924", "#2a1d17"];

// Normalises a newgen face (or a bare seed) into the sprite's look.
export function spriteLook(face, seed = "") {
  const n = seedOf(face?.seed ?? seed);
  return {
    skin: hex(face?.skin) || SKINS[n % SKINS.length],
    hair: hex(face?.hair) || HAIRS[(n >>> 3) % HAIRS.length],
    style: Number.isInteger(face?.style) ? face.style % 5 : (n >>> 6) % 5,
    beard: face?.beard ?? ((n >>> 9) % 3 === 0),
  };
}

// Head is 14×16 centred on (cx, cy); neck hangs below it.
function drawHead(g, cx, cy, look, { cap = null, capMark = null } = {}) {
  const { skin, hair, style, beard } = look,
    shadow = shade(skin, 0.82);
  g.rect(cx - 3, cy + 7, 6, 4, shadow);
  g.rect(cx - 8, cy - 1, 1, 3, skin).rect(cx + 7, cy - 1, 1, 3, skin);
  g.ellipse(cx, cy, 7, 8, (nx, ny) => {
    if (cap && ny < -0.32) return cap;
    const hairy =
      style === 0 ? ny < -0.38 || (Math.abs(nx) > 0.86 && ny < 0.1)
      : style === 1 ? ny < -0.3
      : style === 2 ? ny < -0.58
      : style === 3 ? ny < -0.38 || (Math.abs(nx) > 0.78 && ny < 0.55)
      : ny < -0.62 && Math.abs(nx) > 0.28;
    if (!cap && hairy) return hair;
    if (beard && (ny > 0.32 || (Math.abs(nx) > 0.62 && ny > 0.02))) return shade(hair, 1.15);
    return nx > 0.72 ? shadow : skin;
  });
  if (!cap && style === 1) g.rect(cx - 6, cy - 11, 12, 4, hair);
  if (!cap && style === 3) g.rect(cx - 8, cy - 3, 1, 8, hair).rect(cx + 7, cy - 3, 1, 8, hair);
  if (cap) {
    g.rect(cx - 8, cy - 3, 16, 1, shade(cap, 0.7));
    if (capMark) g.rect(cx - 1, cy - 6, 2, 2, capMark);
  }
  g.rect(cx - 5, cy - 2, 3, 1, cap ? shade(hair, 1) : hair).rect(cx + 2, cy - 2, 3, 1, cap ? shade(hair, 1) : hair);
  g.set(cx - 4, cy, "#f4f1ea");
  g.set(cx - 3, cy, "#1a1412");
  g.set(cx + 2, cy, "#1a1412");
  g.set(cx + 3, cy, "#f4f1ea");
  g.rect(cx - 1, cy + 2, 2, 1, shadow);
  g.rect(cx - 2, cy + 5, 4, 1, "#7a3b33");
  return g;
}

function drawSuit(g, x, y, w, h, tie) {
  const suit = "#1f2531";
  g.rect(x + 2, y, w - 4, 1, suit).rect(x, y + 1, w, h - 1, suit);
  const mid = x + Math.floor(w / 2);
  g.rect(mid - 3, y, 6, 3, "#eef0f2").rect(mid - 2, y + 3, 4, 1, "#eef0f2");
  g.rect(mid - 1, y + 1, 2, Math.min(h - 2, 10), tie);
  g.rect(x + 3, y + 3, 1, h - 4, shade(suit, 1.5));
  return g;
}

// 32×32 bust: a player in team colours, or a coach in a suit (optionally with a team cap).
export function portraitGrid(face, { seed = "", outfit = "jersey", colors = teamColors(0, null), cap = false } = {}) {
  const g = new PixelGrid(32, 32),
    look = spriteLook(face, seed);
  if (outfit === "suit") drawSuit(g, 4, 24, 24, 8, colors.primary);
  else {
    g.rect(5, 24, 22, 1, colors.primary).rect(3, 25, 26, 7, colors.primary);
    g.rect(3, 27, 4, 1, colors.secondary).rect(25, 27, 4, 1, colors.secondary);
    g.rect(13, 24, 6, 1, colors.secondary).rect(14, 25, 4, 1, colors.secondary);
    g.rect(27, 25, 2, 7, colors.dark);
  }
  drawHead(g, 16, 13, look, cap ? { cap: colors.primary, capMark: colors.secondary } : {});
  return g.outline();
}

export const pixelPortrait = (face, opts = {}) => portraitGrid(face, opts).svg({ cls: "px-portrait " + (opts.cls || ""), label: opts.label || "" });

// Jersey back with name bar and number, drawn into g at (x, y) with body width w.
function drawJersey(g, x, y, w, h, { colors, name, number, numberScale }) {
  const { primary, secondary, dark } = colors,
    sleeve = Math.round(w * 0.26),
    sleeveH = Math.round(h * 0.34);
  g.rect(x, y, w, h, primary);
  g.rect(x - sleeve, y, sleeve, sleeveH, primary).rect(x + w, y, sleeve, sleeveH, primary);
  g.rect(x - sleeve, y + sleeveH - 2, sleeve, 2, secondary).rect(x + w, y + sleeveH - 2, sleeve, 2, secondary);
  g.rect(x + Math.round(w * 0.3), y, Math.round(w * 0.4), 1, secondary);
  g.rect(x + w - 1, y + 2, 1, h - 2, dark);
  g.rect(x, y + h - 2, w, 1, secondary);
  let label = glyphText(name).trim();
  const fit = Math.floor((w - 2 + 1) / 4);
  if (label.length > fit) label = label.slice(0, fit);
  g.text(label, x + Math.floor((w - textWidth(label)) / 2), y + 3, secondary);
  const num = String(number ?? "").replace(/\D/g, "").slice(0, 2) || "0",
    nw = textWidth(num, numberScale),
    nx = x + Math.floor((w - nw) / 2),
    ny = y + 10;
  g.text(num, nx + 1, ny + 1, dark, numberScale);
  g.text(num, nx, ny, secondary, numberScale);
  return { sleeve, sleeveH };
}

export function jerseyGrid({ colors, name, number }) {
  const g = new PixelGrid(40, 34);
  drawJersey(g, 10, 3, 20, 28, { colors, name, number, numberScale: 2 });
  return g.outline();
}
export const pixelJersey = (opts) => jerseyGrid(opts).svg({ cls: "px-jersey", label: `${opts.name} jersey number ${opts.number}` });

/* ----------------------------------------------------------------- scenes */
// A scene is 160×90 and split into layers so CSS can animate them independently.

function pressWall(g, colors, abbr) {
  g.rect(0, 0, 160, 64, "#18202c").rect(0, 0, 160, 2, "#283244");
  const tile = mix(colors.primary, "#18202c", 0.45),
    mark = mix(colors.secondary, "#18202c", 0.35);
  for (let r = 0; r < 5; r++)
    for (let c = -1; c < 9; c++) {
      const x = 4 + c * 20 + (r % 2) * 10,
        y = 4 + r * 12;
      g.rect(x, y, 12, 7, tile).text(abbr.slice(0, 2), x + 2, y + 1, mark);
    }
  return g;
}

function crowdLayer(seed) {
  const g = new PixelGrid(160, 90),
    flashes = [];
  for (let i = 0; i < 7; i++) {
    const cx = 8 + i * 24 + ((seed >>> (i * 3)) % 9),
      cy = 86 + ((seed >>> (i * 2)) % 3);
    g.ellipse(cx, cy, 7, 6, "#07090d");
    g.rect(cx - 4, cy - 9, 8, 5, "#0e1117").rect(cx - 1, cy - 8, 3, 3, "#2b3240");
    flashes.push([cx, cy - 10]);
  }
  return { g, flashes };
}

function flashSVG(points, seed) {
  return points
    .map(([x, y], i) => {
      const delay = ((seed >>> (i * 4)) % 23) / 10;
      return `<g class="px-flash" style="animation-delay:${delay}s"><rect x="${x - 3}" y="${y}" width="7" height="1" fill="#fff"/><rect x="${x}" y="${y - 3}" width="1" height="7" fill="#fff"/><rect x="${x - 1}" y="${y - 1}" width="3" height="3" fill="#fffbe0"/></g>`;
    })
    .join("");
}

const layer = (g, cls) => `<g class="${cls}">${g.rects()}</g>`;
const sceneSVG = (label, body) =>
  `<svg class="px-scene-art" viewBox="0 0 160 90" shape-rendering="crispEdges" preserveAspectRatio="xMidYMid meet" role="img" aria-label="${escAttr(label)}">${body}</svg>`;

export function signingSceneSVG(d) {
  const colors = d.colors,
    seed = seedOf(d.playerId || d.name),
    wall = pressWall(new PixelGrid(160, 90), colors, d.abbr || "GD");
  wall.rect(0, 64, 160, 3, "#5b4636").rect(0, 67, 160, 23, "#3a2c22").rect(0, 72, 160, 3, colors.primary).rect(0, 75, 160, 1, colors.secondary);
  const body = new PixelGrid(160, 90),
    look = spriteLook(d.face, d.playerId || d.name);
  drawSuit(body, 66, 31, 28, 33, colors.primary);
  drawHead(body, 80, 20, look);
  body.outline();
  const lift = new PixelGrid(160, 90),
    { sleeve } = drawJersey(lift, 64, 33, 32, 30, { colors, name: lastName(d.name), number: d.number, numberScale: 3 });
  lift.rect(64 - sleeve - 1, 30, 4, 4, look.skin).rect(96 + sleeve - 3, 30, 4, 4, look.skin);
  lift.outline();
  const mics = new PixelGrid(160, 90);
  for (const x of [72, 88]) mics.rect(x, 57, 1, 8, "#2a2f38").rect(x - 1, 55, 3, 3, "#454c58");
  const crowd = crowdLayer(seed);
  return sceneSVG(
    `${d.name} holds up his new ${d.teamName} jersey, number ${d.number}`,
    layer(wall, "px-l-wall") + layer(body, "px-l-body") + layer(lift, "px-l-lift") + layer(mics, "px-l-props") + layer(crowd.g, "px-l-crowd") + flashSVG(crowd.flashes, seed),
  );
}

export function coachSceneSVG(d) {
  const colors = d.colors,
    seed = seedOf(d.coachId || d.name),
    wall = pressWall(new PixelGrid(160, 90), colors, d.abbr || "GD");
  wall.rect(46, 5, 68, 17, colors.primary).rect(46, 21, 68, 1, colors.dark).outline();
  const head = "HEAD COACH";
  wall.text(head, 80 - Math.floor(textWidth(head) / 2), 7, colors.secondary);
  wall.text(d.abbr || "", 80 - Math.floor(textWidth(d.abbr || "") / 2), 14, colors.secondary);
  const owner = new PixelGrid(160, 90);
  drawSuit(owner, 28, 50, 22, 26, "#7d8696");
  drawHead(owner, 39, 41, spriteLook(null, "owner-" + d.team));
  owner.outline();
  const coach = new PixelGrid(160, 90),
    look = spriteLook(d.face, d.coachId || d.name);
  drawSuit(coach, 66, 44, 28, 16, colors.primary);
  drawHead(coach, 80, 33, look, { cap: colors.primary, capMark: colors.secondary });
  coach.outline();
  const podium = new PixelGrid(160, 90);
  podium.rect(66, 58, 28, 32, "#2a3240").rect(64, 56, 32, 3, "#3a4456").rect(70, 62, 20, 13, colors.primary);
  podium.text(d.abbr || "", 80 - Math.floor(textWidth(d.abbr || "") / 2), 66, colors.secondary);
  podium.rect(79, 50, 1, 6, "#2a2f38").rect(78, 48, 3, 3, "#454c58");
  podium.outline();
  const suit = "#1f2531",
    rest = new PixelGrid(160, 90),
    wave = new PixelGrid(160, 90),
    clapA = new PixelGrid(160, 90),
    clapB = new PixelGrid(160, 90);
  rest.rect(63, 47, 4, 9, suit).rect(93, 47, 4, 9, suit).rect(63, 54, 4, 3, look.skin).rect(93, 54, 4, 3, look.skin).outline();
  wave.rect(63, 47, 4, 9, suit).rect(63, 54, 4, 3, look.skin).rect(93, 40, 4, 8, suit).rect(96, 30, 4, 11, suit).rect(96, 26, 4, 4, look.skin).outline();
  clapA.rect(32, 56, 4, 6, "#7d8696").rect(43, 56, 4, 6, "#7d8696").rect(35, 54, 3, 3, "#d8a47f").rect(42, 54, 3, 3, "#d8a47f").outline();
  clapB.rect(34, 56, 4, 6, "#7d8696").rect(41, 56, 4, 6, "#7d8696").rect(38, 53, 3, 4, "#d8a47f").outline();
  const crowd = crowdLayer(seed);
  return sceneSVG(
    `${d.name} at the podium as the new ${d.teamName} head coach`,
    layer(wall, "px-l-wall") +
      layer(owner, "px-l-owner") +
      layer(clapA, "px-l-clap-a") +
      layer(clapB, "px-l-clap-b") +
      layer(coach, "px-l-body") +
      layer(rest, "px-l-rest") +
      layer(wave, "px-l-wave") +
      layer(podium, "px-l-props") +
      layer(crowd.g, "px-l-crowd") +
      flashSVG(crowd.flashes, seed),
  );
}

const lastName = (name) => {
  const parts = String(name || "").trim().split(/\s+/);
  return parts.length > 1 && /^(jr\.?|sr\.?|ii|iii|iv|v)$/i.test(parts.at(-1)) ? parts.at(-2) : parts.at(-1) || "";
};

/* ------------------------------------------------------- story scenes */
// Pixel versions of the story cinematics (title, draft night, press podium, playoff exit,
// walk-off, locker-room talk) and the conversation stages. Same 160×90 grid and layer classes.

const rnd = (seed) => {
  let x = seed >>> 0 || 1;
  return () => ((x = Math.imul(x ^ (x >>> 15), 2246822519) ^ Math.imul(x ^ (x >>> 13), 3266489917)), ((x ^= x >>> 16) >>> 0) / 4294967296);
};
const GOLD = "#ffd34d",
  PANTS = "#e6e1d3",
  SILVER = "#dfe5ea";

function nightSky(g, h, top = "#05070d", bottom = "#18233a") {
  for (let y = 0; y < h; y++) g.rect(0, y, g.w, 1, mix(top, bottom, Math.floor((y / h) * 5) / 4));
  return g;
}
// Stadium bowl: light banks on poles and a crowd of coloured dots.
function stadium(g, colors, seed, { top = 8, bottom = 46, lights = true } = {}) {
  const r = rnd(seed),
    palette = [mix(colors.primary, "#0b0d12", 0.45), mix(colors.secondary, "#0b0d12", 0.5), "#3a4252", "#2a303c", mix(colors.primary, "#0b0d12", 0.2)];
  g.rect(0, top, g.w, bottom - top, "#141923");
  for (let y = top + 1; y < bottom - 1; y += 2) for (let x = (y % 4) / 2; x < g.w; x += 2) if (r() < 0.82) g.set(x, y, palette[(r() * palette.length) | 0]);
  g.rect(0, bottom - 2, g.w, 2, "#0d1118");
  g.rect(0, bottom, g.w, 1, colors.primary);
  if (lights)
    for (const x of [10, 52, 100, 142]) {
      g.rect(x, 1, 10, 4, "#fff6d2").rect(x + 1, 2, 8, 2, "#ffffff").rect(x + 4, 5, 2, top - 4, "#2a303c");
    }
  return g;
}
function turf(g, y0, line = true) {
  for (let y = y0; y < g.h; y++) g.rect(0, y, g.w, 1, Math.floor((y - y0) / 4) % 2 ? "#2c7a3a" : "#33873f");
  if (line) for (let x = 6; x < g.w; x += 30) g.rect(x, y0, 1, g.h - y0, "#d9e6cf");
  return g;
}
// Front-facing player: head, jersey with number, white pants. arms: down | up | one | cross.
function drawPlayer(g, cx, top, look, colors, { number = "", arms = "down", towel = false, seated = false } = {}) {
  const x = cx - 8,
    y = top + 16,
    { primary, secondary, dark } = colors;
  drawHead(g, cx, top + 8, look);
  if (towel) g.ellipse(cx, top + 6, 8, 7, (nx, ny) => (ny < 0.1 ? "#e6e2d6" : null)).rect(cx - 8, top + 4, 2, 9, "#d4cfc2").rect(cx + 6, top + 4, 2, 9, "#d4cfc2");
  g.rect(x + 1, y, 14, 1, primary).rect(x, y + 1, 16, 12, primary).rect(x + 14, y + 1, 2, 12, dark);
  g.rect(cx - 3, y, 6, 2, secondary).rect(x, y + 4, 16, 1, secondary);
  const num = String(number ?? "").replace(/\D/g, "").slice(0, 2);
  if (num) g.text(num, cx - Math.floor(textWidth(num) / 2), arms === "cross" ? y + 5 : y + 6, secondary);
  const sleeve = (sx, up) =>
    up ? g.rect(sx, y - 9, 3, 10, primary).rect(sx, y - 12, 3, 3, look.skin) : g.rect(sx, y + 1, 3, 9, primary).rect(sx, y + 10, 3, 3, look.skin);
  if (arms === "cross") g.rect(x - 2, y + 1, 3, 10, primary).rect(x + 15, y + 1, 3, 10, primary).rect(x + 1, y + 10, 14, 3, dark).rect(x + 3, y + 10, 3, 2, look.skin).rect(x + 10, y + 10, 3, 2, look.skin);
  else {
    sleeve(x - 3, arms === "up");
    sleeve(x + 16, arms === "up" || arms === "one");
  }
  if (seated) g.rect(x, y + 13, 16, 4, PANTS).rect(x + 1, y + 17, 5, 5, PANTS).rect(x + 10, y + 17, 5, 5, PANTS).rect(x + 1, y + 22, 5, 2, "#15191f").rect(x + 10, y + 22, 5, 2, "#15191f");
  else g.rect(x + 1, y + 13, 6, 9, PANTS).rect(x + 9, y + 13, 6, 9, PANTS).rect(x + 1, y + 22, 6, 2, primary).rect(x + 9, y + 22, 6, 2, primary).rect(x + 1, y + 24, 6, 2, "#15191f").rect(x + 9, y + 24, 6, 2, "#15191f");
  return g;
}
// Suit figure (coach, commissioner, owner). arm: down | up | point.
function drawSuited(g, cx, top, look, { tie = "#3b6cc8", cap = null, capMark = null, arm = "down", suit = "#1f2531", legs = true } = {}) {
  drawHead(g, cx, top + 8, look, cap ? { cap, capMark } : {});
  drawSuit(g, cx - 10, top + 16, 20, 16, tie);
  g.rect(cx - 13, top + 17, 3, 11, suit).rect(cx - 13, top + 28, 3, 3, look.skin);
  if (arm === "up") g.rect(cx + 10, top + 7, 3, 11, suit).rect(cx + 10, top + 4, 3, 3, look.skin);
  else if (arm === "point") g.rect(cx + 10, top + 17, 8, 3, suit).rect(cx + 18, top + 17, 3, 3, look.skin);
  else g.rect(cx + 10, top + 17, 3, 11, suit).rect(cx + 10, top + 28, 3, 3, look.skin);
  if (legs) g.rect(cx - 8, top + 32, 7, 9, "#171b24").rect(cx + 1, top + 32, 7, 9, "#171b24").rect(cx - 9, top + 41, 8, 2, "#0b0d12").rect(cx + 1, top + 41, 8, 2, "#0b0d12");
  return g;
}
function drawTrophy(g, cx, top) {
  g.ellipse(cx, top + 4, 5, 3.5, (nx, ny) => (nx + ny < -0.6 ? "#ffffff" : nx > 0.4 ? "#9aa5af" : SILVER));
  g.rect(cx - 1, top + 3, 3, 1, "#9aa5af");
  g.rect(cx - 1, top + 8, 2, 7, SILVER).rect(cx, top + 8, 1, 7, "#aeb7bf").rect(cx - 2, top + 15, 4, 2, SILVER).rect(cx - 3, top + 17, 6, 3, "#1a1d22");
  return g;
}
function confettiLayer(seed, colors, n = 70) {
  const g = new PixelGrid(160, 90),
    r = rnd(seed),
    cols = [colors.primary, colors.secondary, GOLD, "#ffffff"];
  for (let i = 0; i < n; i++) {
    const x = (r() * 160) | 0,
      y = (r() * 78) | 0,
      c = cols[i % cols.length];
    g.set(x, y, c);
    if (i % 3 === 0) g.set(x, y + 1, shade(c, 0.8));
  }
  return g;
}
function fireworkLayer(seed, colors, at) {
  const g = new PixelGrid(160, 90),
    cols = [GOLD, colors.primary, "#ffffff"];
  at.forEach(([cx, cy], k) => {
    const c = cols[(seed + k) % cols.length];
    g.set(cx, cy, "#ffffff");
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [-1, -1], [1, -1], [-1, 1]]) for (let s = 2; s <= 4; s++) g.set(cx + dx * s, cy + dy * s, s === 4 ? shade(c, 0.7) : c);
  });
  return g;
}
const starOf = (s) => (s?.roster || []).filter((p) => !p.injury).sort((a, b) => b.ovr - a.ovr)[0];
// The career coach's sprite from the creator appearance (same mapping as coach-avatar.mjs).
export function coachLook(s, team) {
  const a = s?.franchise?.userCoach?.appearance || {},
    av = s?.franchise?.career?.avatar || {};
  return spriteLook({ skin: a.skin || av.skin, hair: a.hair, style: { Short: 0, Curly: 1, Bald: 4 }[a.hairStyle], beard: a.beard ? a.beard === "Full" || a.beard === "Stubble" : undefined }, "coach-" + team);
}

export function championshipSceneSVG(d) {
  const { colors } = d,
    seed = seedOf("champ-" + d.team + (d.playerId || "")),
    back = nightSky(new PixelGrid(160, 90), 40);
  stadium(back, colors, seed, { top: 10, bottom: 50 });
  turf(back, 51);
  back.rect(34, 66, 92, 6, mix(colors.primary, "#0b0d12", 0.15)).rect(34, 66, 92, 1, colors.secondary).rect(30, 72, 100, 18, "#141923").rect(30, 72, 100, 2, colors.primary);
  const cast = new PixelGrid(160, 90);
  drawPlayer(cast, 42, 34, spriteLook(null, "mate-a" + seed), colors, { number: 21, arms: "up" });
  drawPlayer(cast, 118, 34, spriteLook(null, "mate-b" + seed), colors, { number: 54, arms: "up" });
  cast.outline();
  const heroes = new PixelGrid(160, 90);
  drawSuited(heroes, 70, 25, d.coachLook, { tie: colors.primary, cap: colors.primary, capMark: colors.secondary, arm: "up" });
  drawPlayer(heroes, 92, 25, d.look, colors, { number: d.number, arms: "up" });
  heroes.outline();
  const cup = drawTrophy(new PixelGrid(160, 90), 82, 10).outline();
  return sceneSVG(
    `${d.teamName} lift the championship trophy`,
    layer(back, "px-l-wall") + layer(fireworkLayer(seed, colors, [[24, 12], [136, 8]]), "px-l-blink-a") + layer(fireworkLayer(seed + 1, colors, [[60, 6], [110, 16]]), "px-l-blink-b") + layer(cast, "px-l-bob-b") + layer(heroes, "px-l-body") + layer(cup, "px-l-lift") + layer(confettiLayer(seed, colors), "px-l-fall-a") + layer(confettiLayer(seed + 7, colors), "px-l-fall-b"),
  );
}

export function draftSceneSVG(d) {
  const { colors } = d,
    seed = seedOf("draft-" + d.name),
    back = new PixelGrid(160, 90);
  back.rect(0, 0, 160, 64, "#0b0f17");
  for (let x = 0; x < 160; x += 16) back.rect(x, 0, 8, 64, "#0e131d");
  // Draft board: team colour screen with the round and the name.
  back.rect(28, 2, 104, 30, "#05070b").rect(30, 4, 100, 26, colors.primary).rect(30, 4, 100, 7, colors.dark);
  const round = `ROUND ${d.round ?? 1}`,
    nm = glyphText(lastName(d.name)).trim(),
    scale = textWidth(nm, 2) <= 94 ? 2 : 1,
    team = glyphText(d.teamName).trim().slice(0, 24);
  back.text(round, 80 - Math.floor(textWidth(round) / 2), 5, colors.secondary);
  back.text(nm, 80 - Math.floor(textWidth(nm, scale) / 2), scale === 2 ? 13 : 16, "#ffffff", scale);
  back.text(team, 80 - Math.floor(textWidth(team) / 2), 24, colors.secondary);
  back.rect(0, 64, 160, 26, "#1a2130").rect(0, 64, 160, 2, "#2a3446").rect(0, 70, 160, 1, colors.primary);
  // Light cones on the stage.
  for (const cx of [60, 98]) for (let y = 40; y < 70; y++) back.rect(cx - 4 - ((y - 40) >> 2), y, 8 + ((y - 40) >> 1), 1, mix(back.get(cx, y) || "#0b0f17", "#fff6d2", 0.12));
  const host = new PixelGrid(160, 90);
  drawSuited(host, 60, 33, spriteLook(null, "commissioner"), { tie: "#9aa5af", suit: "#2b2f36" });
  host.outline();
  const prospect = new PixelGrid(160, 90);
  drawSuited(prospect, 98, 33, d.look, { tie: colors.primary, cap: colors.primary, capMark: colors.secondary });
  prospect.outline();
  const wave = new PixelGrid(160, 90);
  drawSuited(wave, 98, 33, d.look, { tie: colors.primary, cap: colors.primary, capMark: colors.secondary, arm: "up" });
  wave.outline();
  const crowd = crowdLayer(seed);
  return sceneSVG(
    `${d.name} is drafted by the ${d.teamName}`,
    layer(back, "px-l-wall") + layer(host, "px-l-owner") + layer(prospect, "px-l-rest") + layer(wave, "px-l-wave") + layer(crowd.g, "px-l-crowd") + flashSVG(crowd.flashes, seed),
  );
}

export function podiumSceneSVG(d) {
  const { colors } = d,
    seed = seedOf("press-" + d.team + d.week),
    wall = pressWall(new PixelGrid(160, 90), colors, d.abbr || "GD");
  wall.rect(0, 64, 160, 26, "#2a2018").rect(0, 64, 160, 2, "#3a2c22");
  const coach = new PixelGrid(160, 90);
  drawSuited(coach, 80, 20, d.coachLook, { tie: colors.primary, legs: false });
  coach.outline();
  const point = new PixelGrid(160, 90);
  point.rect(90, 37, 8, 3, "#1f2531").rect(98, 37, 3, 3, d.coachLook.skin).outline();
  const podium = new PixelGrid(160, 90);
  podium.rect(64, 50, 32, 40, "#2a3240").rect(62, 48, 36, 3, "#3a4456").rect(69, 55, 22, 14, colors.primary);
  podium.text(d.abbr || "", 80 - Math.floor(textWidth(d.abbr || "") / 2), 59, colors.secondary);
  for (const [x, h] of [[74, 8], [80, 10], [86, 8]]) podium.rect(x, 48 - h, 1, h, "#2a2f38").rect(x - 1, 46 - h, 3, 3, ["#c43b3b", "#454c58", "#3b6cc8"][x % 3]);
  podium.outline();
  const crowd = crowdLayer(seed);
  return sceneSVG(
    `${d.name} speaks at the podium`,
    layer(wall, "px-l-wall") + layer(coach, "px-l-body") + layer(point, "px-l-blink-a") + layer(podium, "px-l-props") + layer(crowd.g, "px-l-crowd") + flashSVG(crowd.flashes, seed),
  );
}

function lockerWall(g, colors, dim = 0) {
  const tone = (c) => (dim ? mix(c, "#05070b", dim) : c);
  g.rect(0, 0, 160, 66, tone("#232a35"));
  for (let i = 0; i < 10; i++) {
    const x = 2 + i * 16;
    g.rect(x, 6, 14, 52, tone(shade(colors.primary, 0.8))).rect(x + 1, 7, 12, 50, tone(colors.primary)).rect(x + 1, 22, 12, 1, tone(colors.dark));
    for (let v = 10; v < 20; v += 3) g.rect(x + 4, v, 6, 1, tone(colors.dark));
    g.rect(x + 2, 30, 10, 1, tone("#0b0d12")).rect(x + 3, 26, 8, 4, tone(i % 3 ? colors.secondary : PANTS));
  }
  g.rect(0, 0, 160, 5, tone("#141923")).rect(0, 58, 160, 8, tone("#3a2c22")).rect(0, 58, 160, 1, tone("#5b4636"));
  g.rect(0, 66, 160, 24, tone("#1b1f26"));
  for (let x = 0; x < 160; x += 10) g.rect(x, 66, 1, 24, tone("#232830"));
  return g;
}

export function lockerSceneSVG(d, { somber = false } = {}) {
  const { colors } = d,
    seed = seedOf("locker-" + d.team + (somber ? "s" : "")),
    dim = somber ? 0.55 : 0,
    wall = lockerWall(new PixelGrid(160, 90), colors, dim);
  const team = new PixelGrid(160, 90),
    players = (d.cast || []).slice(0, 4);
  players.forEach((p, i) => drawPlayer(team, 22 + i * 26, somber ? 40 : 30, p.look, colors, { number: p.number, seated: somber, towel: somber && i % 2 === 0, arms: "down" }));
  team.outline();
  const coach = new PixelGrid(160, 90);
  drawSuited(coach, 134, 26, d.coachLook, { tie: colors.primary, cap: somber ? null : colors.primary, capMark: colors.secondary, arm: somber ? "down" : "point" });
  coach.outline();
  return sceneSVG(
    somber ? `The ${d.teamName} locker room after a playoff exit` : `${d.name} addresses the ${d.teamName} locker room`,
    layer(wall, "px-l-wall") + layer(team, somber ? "px-l-still" : "px-l-bob-b") + layer(coach, somber ? "px-l-still" : "px-l-body"),
  );
}

export function walkOffSceneSVG(d) {
  const { colors } = d,
    seed = seedOf("walkoff-" + d.team + (d.playerId || "")),
    back = nightSky(new PixelGrid(160, 90), 36);
  stadium(back, colors, seed, { top: 8, bottom: 44 });
  turf(back, 45);
  const mobA = new PixelGrid(160, 90),
    mobB = new PixelGrid(160, 90);
  [[22, 40], [50, 44], [110, 44], [138, 40]].forEach(([x, y], i) => drawPlayer(i % 2 ? mobB : mobA, x, y, spriteLook(null, "mob" + i + seed), colors, { number: [12, 81, 27, 95][i], arms: "up" }));
  mobA.outline();
  mobB.outline();
  const hero = new PixelGrid(160, 90);
  drawPlayer(hero, 80, 34, d.look, colors, { number: d.number, arms: "up" });
  hero.outline();
  return sceneSVG(
    `${d.name} celebrates a walk-off win`,
    layer(back, "px-l-wall") + layer(fireworkLayer(seed, colors, [[30, 10], [128, 6]]), "px-l-blink-a") + layer(fireworkLayer(seed + 3, colors, [[78, 4], [150, 18]]), "px-l-blink-b") + layer(mobA, "px-l-jump-a") + layer(mobB, "px-l-jump-b") + layer(hero, "px-l-body") + layer(confettiLayer(seed, colors, 40), "px-l-fall-a"),
  );
}

/* ------------------------------------------------- conversation stages */
// 240×80 strip used behind the dialogue in conversations and press conferences.
export function conversationStageSVG(d) {
  const { colors, setting = "office" } = d,
    W = 240,
    H = 80,
    back = new PixelGrid(W, H),
    seed = seedOf(setting + d.team + (d.playerId || ""));
  if (setting === "press") {
    back.rect(0, 0, W, 58, "#18202c");
    const tile = mix(colors.primary, "#18202c", 0.45),
      mark = mix(colors.secondary, "#18202c", 0.35);
    for (let r = 0; r < 5; r++) for (let c = -1; c < 13; c++) back.rect(4 + c * 20 + (r % 2) * 10, 3 + r * 11, 12, 7, tile).text((d.abbr || "GD").slice(0, 2), 6 + c * 20 + (r % 2) * 10, 4 + r * 11, mark);
    back.rect(0, 58, W, 22, "#2a2018").rect(0, 58, W, 2, "#3a2c22");
  } else if (setting === "locker") {
    back.rect(0, 0, W, 58, "#232a35");
    for (let i = 0; i < 15; i++) {
      const x = 2 + i * 16;
      back.rect(x, 4, 14, 48, shade(colors.primary, 0.8)).rect(x + 1, 5, 12, 46, colors.primary).rect(x + 1, 20, 12, 1, colors.dark).rect(x + 3, 24, 8, 4, i % 3 ? colors.secondary : PANTS);
      for (let v = 8; v < 18; v += 3) back.rect(x + 4, v, 6, 1, colors.dark);
    }
    back.rect(0, 52, W, 6, "#3a2c22").rect(0, 52, W, 1, "#5b4636").rect(0, 58, W, 22, "#1b1f26");
  } else if (setting === "film") {
    back.rect(0, 0, W, 80, "#0b0f17");
    back.rect(70, 4, 100, 42, "#05070b").rect(72, 6, 96, 38, "#1f5b35");
    for (let x = 80; x < 168; x += 12) back.rect(x, 6, 1, 38, "#2f7a4a");
    for (const [x, y] of [[96, 20], [104, 26], [112, 20], [120, 26], [128, 20]]) back.rect(x, y, 3, 3, "#f4efe2");
    for (const [x, y] of [[100, 12], [116, 12], [132, 14]]) back.rect(x, y, 1, 3, "#ffd34d").rect(x - 1, y + 1, 3, 1, "#ffd34d");
    back.rect(118, 30, 1, 10, "#ffd34d").rect(118, 30, 14, 1, "#ffd34d");
    for (let y = 46; y < 58; y++) back.rect(110 - ((y - 46) * 3), y, 20 + (y - 46) * 6, 1, "#121a28");
    back.rect(0, 58, W, 22, "#141923");
  } else {
    back.rect(0, 0, W, 58, "#2b2a33");
    back.rect(16, 6, 46, 30, "#3d4656").rect(18, 8, 42, 26, "#7fa8d8").rect(18, 26, 42, 8, "#5f8a5a").rect(38, 8, 2, 26, "#3d4656").rect(18, 20, 42, 1, "#3d4656");
    back.rect(180, 4, 50, 48, "#3a2c22");
    for (let r = 0; r < 4; r++) {
      back.rect(182, 14 + r * 11, 46, 2, "#5b4636");
      for (let b = 0; b < 9; b++) back.rect(184 + b * 5, 6 + r * 11, 4, 8, [colors.primary, "#c9b78f", "#5b6b84", colors.dark, "#8a3b33"][(b + r) % 5]);
    }
    back.rect(100, 8, 40, 24, "#3d4656").rect(102, 10, 36, 20, colors.primary).text(d.abbr || "", 120 - Math.floor(textWidth(d.abbr || "", 2) / 2), 15, colors.secondary, 2);
    back.rect(0, 58, W, 22, "#3a2c22");
    for (let x = 0; x < W; x += 12) back.rect(x, 58, 1, 22, "#33271e");
  }
  const people = new PixelGrid(W, H),
    tie = colors.primary;
  if (setting === "press") {
    drawSuited(people, 120, 12, d.coachLook, { tie, legs: false });
    people.rect(102, 42, 36, 38, "#2a3240").rect(100, 40, 40, 3, "#3a4456").rect(108, 47, 24, 12, colors.primary);
    people.text(d.abbr || "", 120 - Math.floor(textWidth(d.abbr || "") / 2), 51, colors.secondary);
    for (const x of [114, 120, 126]) people.rect(x, 33, 1, 7, "#2a2f38").rect(x - 1, 31, 3, 3, "#454c58");
    people.outline();
    const crowd = new PixelGrid(W, H),
      r = rnd(seed);
    for (let i = 0; i < 11; i++) {
      const cx = 8 + i * 22 + ((r() * 6) | 0);
      crowd.ellipse(cx, 76, 8, 7, "#07090d").rect(cx - 4, 66, 8, 5, "#0e1117").rect(cx - 1, 67, 3, 3, "#2b3240");
    }
    return `<svg class="px-conv-art" viewBox="0 0 ${W} ${H}" shape-rendering="crispEdges" preserveAspectRatio="xMidYMid slice" role="img" aria-label="Press conference room">${layer(back, "px-l-wall")}${layer(people, "px-l-body")}${layer(crowd, "px-l-crowd")}${flashSVG([[40, 64], [92, 63], [150, 64], [200, 63]], seed)}</svg>`;
  }
  const seated = setting === "office" || setting === "film";
  if (setting === "office") people.rect(84, 50, 72, 6, "#5b4636").rect(84, 50, 72, 1, "#7a5f48").rect(88, 56, 4, 16, "#3a2c22").rect(148, 56, 4, 16, "#3a2c22").rect(110, 46, 12, 4, "#e6e1d3").rect(126, 47, 6, 3, "#2a2f38");
  (d.extras || []).slice(0, 2).forEach((p, i) => drawPlayer(people, 30 + i * 180, 30, p.look, colors, { number: p.number, seated: true, arms: "cross" }));
  drawSuited(people, 92, 14, d.coachLook, { tie, cap: setting === "locker" ? colors.primary : null, capMark: colors.secondary, arm: d.shot ? "down" : "point", legs: !seated });
  if (d.staff) drawSuited(people, 150, 14, d.look, { tie: "#9aa5af", suit: "#2b2f36", legs: !seated });
  else drawPlayer(people, 150, 16, d.look, colors, { number: d.number, seated, arms: d.shot ? "down" : "cross" });
  if (setting === "office") people.rect(84, 50, 72, 6, "#5b4636").rect(84, 50, 72, 1, "#7a5f48");
  people.outline();
  return `<svg class="px-conv-art" viewBox="0 0 ${W} ${H}" shape-rendering="crispEdges" preserveAspectRatio="xMidYMid slice" role="img" aria-label="${escAttr(setting)} conversation">${layer(back, "px-l-wall")}${layer(people, "px-l-body")}</svg>`;
}

// Other modules add scene kinds here (presentation/ceremony-scenes.mjs: combine, Hall of Fame, honors).
// A builder returns { kind, name, kicker, headline, sub, svg(), lines? } like the ones below.
export const SCENE_BUILDERS = {};
// Drawing helpers shared with those scene modules.
export { drawHead, drawSuit, drawSuited, drawPlayer, drawTrophy, nightSky, stadium, turf, crowdLayer, flashSVG, confettiLayer, fireworkLayer, layer, sceneSVG, lastName, seedOf, rnd, GOLD };

/* ---------------------------------------------------------- scene copy */

// Converts an arrival event (or a news card, which carries the same fields) into scene data.
export function sceneData(e, s = gameState()) {
  const team = Number(e.team),
    label = teamLabel(team, s),
    colors = teamColors(team, s),
    from = Number.isInteger(e.from) ? teamLabel(e.from, s) : null,
    base = { team, colors, abbr: label.abbr, teamName: label.name, city: label.city };
  const story = storyScene(e, s, base, label);
  if (story) return story;
  if (SCENE_BUILDERS[e.kind]) return { ...base, ...SCENE_BUILDERS[e.kind](e, s, base, label) };
  if (e.kind === "CoachingMove" || e.type === "coach") {
    const name = e.coachName || e.name || "The new head coach";
    return {
      ...base,
      kind: "coach",
      name,
      coachId: e.coachId,
      face: e.face,
      kicker: e.user ? "Your new job" : "New head coach",
      headline: name.toUpperCase(),
      sub: e.user
        ? `The ${label.city} ${label.name} hand you the headset. The rebuild of the room starts today.`
        : `The ${label.city} ${label.name} introduce ${name}${from ? `, arriving from the ${from.name}` : ""}${e.scheme ? ` · ${e.scheme}` : ""}.`,
      svg: () => coachSceneSVG({ ...base, name, coachId: e.coachId, face: e.face }),
    };
  }
  const name = e.playerName || e.name || "The new signing",
    number = e.number ?? e.jersey ?? 0,
    via = e.via || "free-agency";
  return {
    ...base,
    kind: "signing",
    name,
    number,
    playerId: e.playerId,
    face: e.face,
    kicker: via === "trade" ? "Trade arrival" : via === "waivers" ? "Waiver claim" : "Signing day",
    headline: name.toUpperCase(),
    sub: `#${number} · ${e.pos || "Player"}${e.ovr ? ` · ${e.ovr} OVR` : ""} — ${via === "trade" && from ? `acquired from the ${from.name}` : via === "waivers" ? "claimed off waivers" : "signed in free agency"}. Welcome to ${label.city}.`,
    svg: () => signingSceneSVG({ ...base, name, number, playerId: e.playerId, face: e.face }),
  };
}

// Story cinematics in pixel art: the same copy as the 3D versions.
export const PIXEL_STORY_KINDS = ["Championship", "DraftPick", "PressConference", "PlayoffElimination", "LockerRoomDilemma", "ClutchFinish"];
function storyScene(e, s, base, label) {
  if (!PIXEL_STORY_KINDS.includes(e.kind)) return null;
  const team = base.team,
    star = starOf(s) || {},
    look = spriteLook(star.face, star.id || "star"),
    cl = coachLook(s, team),
    coachName = s?.coach?.name || "Head coach",
    score = Array.isArray(e.score) ? ` · ${e.score[0]}–${e.score[1]}` : "",
    cast = (s?.roster || []).slice(0, 4).map((p) => ({ look: spriteLook(p.face, p.id), number: p.jersey ?? p.number ?? "" })),
    common = { ...base, look, coachLook: cl, number: star.jersey ?? star.number ?? 1, playerId: star.id, cast, week: s?.week ?? 0 };
  const kinds = {
    Championship: () => ({ kind: "championship", name: label.name, kicker: `${s?.year ?? ""} season`.trim(), headline: "CHAMPIONS", sub: `${label.city} ${label.name}${score}`, svg: () => championshipSceneSVG({ ...common }) }),
    DraftPick: () => {
      const name = e.playerName || "The pick is in";
      return { kind: "draft", name, kicker: "Draft night", headline: String(name).toUpperCase(), sub: `Round ${e.round ?? 1} · ${label.name}`, svg: () => draftSceneSVG({ ...common, name, round: e.round ?? 1, look: spriteLook(e.face, e.playerId || name) }) };
    },
    PressConference: () => ({ kind: "press", name: coachName, kicker: "Press conference", headline: `“${e.quote || "We move forward."}”`, sub: coachName, svg: () => podiumSceneSVG({ ...common, name: coachName }) }),
    PlayoffElimination: () => ({ kind: "elimination", name: label.name, kicker: "Season over", headline: "THE LONG WALK", sub: `${label.name} fall ${Array.isArray(e.score) ? `${e.score[0]}–${e.score[1]}` : "in the playoffs"}`, svg: () => lockerSceneSVG({ ...common, name: coachName }, { somber: true }) }),
    LockerRoomDilemma: () => ({ kind: "locker", name: coachName, kicker: "Locker room", headline: String(e.headline || "A word with the team").toUpperCase(), sub: coachName, svg: () => lockerSceneSVG({ ...common, name: coachName }) }),
    ClutchFinish: () => ({ kind: "walkoff", name: star.name || label.name, kicker: "Final", headline: "WALK-OFF", sub: `${label.name}${score}`, svg: () => walkOffSceneSVG({ ...common, name: star.name || label.name }) }),
  };
  return { ...base, ...kinds[e.kind]() };
}

/* ------------------------------------------------------------ news cards */

const esc = (v) => escAttr(v);

// Compact pixel card for a news story: jersey or coach card when the story carries one, else a
// pixel portrait of the player it is about. Returns "" when there is nothing to draw.
export function storyArt(a, s = gameState()) {
  const card = a?.card;
  if (card?.type === "jersey" || card?.type === "coach") {
    const d = sceneData(card, s),
      style = `--px-team:${d.colors.primary};--px-team2:${d.colors.secondary}`,
      art =
        d.kind === "coach"
          ? pixelPortrait(card.face, { seed: card.coachId || card.name, outfit: "suit", colors: d.colors, cap: true, label: d.name })
          : pixelPortrait(card.face, { seed: card.playerId || card.name, colors: d.colors, label: d.name }) + pixelJersey({ colors: d.colors, name: lastName(d.name), number: d.number });
    return `<div class="px-card px-card-${d.kind}" style="${style}"><div class="px-card-art">${art}</div><div class="px-card-copy"><span class="px-kicker">${esc(d.kicker)}</span><b>${esc(d.name)}</b><small>${esc(d.kind === "coach" ? `${d.city} ${d.teamName}` : `#${d.number} · ${card.pos || ""} · ${d.abbr}`)}</small></div><button class="px-watch" onclick="PixelScenes.replay('${esc(a.id)}')" aria-label="Watch the scene: ${esc(d.kicker)}, ${esc(d.name)}">Watch ▸</button></div>`;
  }
  // Ceremony stories (combine, Hall of Fame, honors) carry a feature payload with its own pixel card.
  const feature = a?.feature && globalThis.GDFeatureVisuals?.[a.feature.type];
  if (feature)
    try {
      const html = feature(a.feature.data, a, { compact: true });
      if (html) return html;
    } catch {}
  const p = a?.playerId && findPlayer(s, a.playerId);
  if (!p) return "";
  const team = Number.isInteger(p.__team) ? p.__team : Number(a.team) || 0;
  return `<div class="px-story-portrait">${pixelPortrait(p.face, { seed: p.id, colors: teamColors(team, s), label: p.name })}</div>`;
}

function findPlayer(s, id) {
  if (!s) return null;
  const own = s.roster?.find((p) => p.id === id);
  if (own) return { ...own, __team: s.team };
  for (const c of s.franchise?.clubs || []) {
    const p = c.players?.find((q) => q.id === id);
    if (p) return { ...p, __team: c.id };
  }
  return null;
}

/* ----------------------------------------------------------- scene player */

let active = null;

export function playPixelScene(event, { duration = 8 } = {}) {
  if (active || typeof document === "undefined") return false;
  const d = sceneData(event),
    reduced = globalThis.matchMedia?.("(prefers-reduced-motion: reduce)").matches || document.body.classList.contains("reduce-motion");
  const root = document.createElement("div");
  root.className = `px-scene px-scene-${d.kind}${reduced ? " px-still" : ""}`;
  root.setAttribute("role", "dialog");
  root.setAttribute("aria-label", `${d.kicker}: ${d.name}`);
  root.style.setProperty("--px-team", d.colors.primary);
  root.style.setProperty("--px-team2", d.colors.secondary);
  root.innerHTML = `<div class="px-scene-frame">${d.svg()}</div><div class="px-scene-caption scn-lower"><div class="scn-lower-head"><span class="px-kicker"></span><span class="scn-lower-meta"></span></div><div class="scn-lower-body"><h2></h2><p></p></div></div><div class="px-scene-controls"><button class="px-skip">Skip ▸<kbd>Esc</kbd></button></div><div class="px-scene-progress"><i></i></div>`;
  root.querySelector(".px-kicker").textContent = d.kicker;
  root.querySelector(".scn-lower-meta").textContent = `${d.city || ""} ${d.teamName || ""}`.trim();
  root.querySelector("h2").textContent = d.headline;
  root.querySelector("p").textContent = d.sub;
  document.body.append(root);
  const total = (reduced ? Math.max(4, (d.lines?.length || 0) * 2.2) : duration) * 1000,
    bar = root.querySelector(".px-scene-progress i"),
    start = performance.now();
  let frame = 0,
    lineAt = -1;
  const lines = Array.isArray(d.lines) && d.lines.length ? d.lines : null;
  const close = () => {
    if (!active) return;
    cancelAnimationFrame(frame);
    removeEventListener("keydown", key);
    root.classList.add("px-out");
    active = null;
    setTimeout(() => {
      root.remove();
      document.dispatchEvent(new CustomEvent("gridiron:cinematic-closed", { detail: { eventId: event.id } }));
    }, 300);
  };
  const key = (ev) => {
    if (ev.key === "Escape" || ev.key === " " || ev.key === "Enter") {
      ev.preventDefault();
      close();
    }
  };
  const tick = (now) => {
    const u = Math.min(1, (now - start) / total);
    bar.style.width = `${u * 100}%`;
    // Optional caption sequence (speeches, envelope reveals): one line per equal slice of the scene.
    if (lines) {
      const i = Math.min(lines.length - 1, Math.floor(u * lines.length));
      if (i !== lineAt) root.querySelector(".px-scene-caption p").textContent = lines[(lineAt = i)];
    }
    if (u >= 1) return close();
    frame = requestAnimationFrame(tick);
  };
  addEventListener("keydown", key);
  root.querySelector(".px-skip").onclick = close;
  active = { event, close };
  requestAnimationFrame(() => root.classList.add("px-in"));
  frame = requestAnimationFrame(tick);
  return true;
}

export const pixelSceneActive = () => !!active;

export function installPixelScenes() {
  globalThis.PixelScenes = {
    play: playPixelScene,
    replay(storyId) {
      const a = gameState()?.franchise?.office?.stories?.find((x) => x.id === storyId);
      if (a?.card) playPixelScene({ id: "replay-" + storyId, ...a.card, kind: a.card.type === "coach" ? "CoachingMove" : "Signing" });
    },
  };
}
