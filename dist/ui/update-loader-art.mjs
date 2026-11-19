// Pixel-art night stadium behind the startup update loader (ui/update-loader.mjs).
//
// The scene is drawn into a small canvas (about 200–430 × 180 logical pixels) that CSS scales by a
// whole number of device pixels with image-rendering: pixelated, so every art pixel stays square
// and crisp from 1280×720 to 2560×1440. A jumbotron shows the step, the percent and the versions,
// a ribbon board scrolls the current step, and a running back carries the ball down the field:
// his yard line is the update percent, the end zone is 100% (touchdown, fireworks, confetti).
//
// Pure parts (pickScale, sceneLayout, sceneModel, yardX, drawScene) need no DOM, so
// test-update-loader.mjs can draw every moment into a recording context in Node.

const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
const frac = (v) => v - Math.floor(v);
// Deterministic 0..1 noise, so a frame always draws the same way (no Math.random in the scene).
const hash = (a, b = 0) => {
  let h = Math.imul(a | 0, 374761393) + Math.imul(b | 0, 668265263);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
};

export const FPS = 12; // pixel frame rate: everything moves in whole frames
const RESTART_DIM_AT = 1.6; // seconds of touchdown before the lights go down

// ------------------------------------------------------------------ palette
// Art colours for the night scene. Club and kit colours come from the theme tokens (readTokens).
const ART = {
  sky: ["#05080f", "#080d1a", "#0c1324", "#111a30"],
  star: "#c8d2f0",
  steel: "#2a3350",
  steelDark: "#1a2033",
  stands: "#121828",
  tier: "#0b101c",
  lamp: "#fff6d8",
  lampOff: "#3a4058",
  glow: "#fff2c0",
  led: "#04060b",
  ledLine: "#080c18",
  ledDim: "#8a93ad",
  skin: ["#c98d5b", "#8a5a3a", "#e0b48a", "#6b4429"],
  fanShirt: ["#b9b4a6", "#3a4466", "#5a2a2a"],
  ball: "#8a4b22",
  gold: "#f2c14e",
  pylon: "#ff7a1a",
  screen: ["#4aa8d8", "#6fd3ff"],
  defJersey: "#d9d4c4",
  defHelmet: "#b23a3a",
  sideline: "#1d5a29",
};
const DEFAULT_TOKENS = { team: "#3b6cc8", accent: "#f2c14e", warn: "#f2c14e", good: "#5bd16b", chalk: "#f4f1de", ink: "#05070d", turfA: "#2f8a3c", turfB: "#287a34" };

// Reads the kit colours from CSS custom properties (falls back to the default kit).
export function readTokens(el) {
  const css = el && typeof getComputedStyle === "function" ? getComputedStyle(el) : null;
  const pick = (name, fallback) => {
    const v = css?.getPropertyValue(name).trim();
    return v && !v.includes("var(") ? v : fallback;
  };
  return {
    team: pick("--team", DEFAULT_TOKENS.team),
    accent: pick("--gd-accent", DEFAULT_TOKENS.accent),
    warn: pick("--gd-warn", DEFAULT_TOKENS.warn),
    good: pick("--gd-good", DEFAULT_TOKENS.good),
    chalk: pick("--px-chalk", DEFAULT_TOKENS.chalk),
    ink: pick("--px-ink", DEFAULT_TOKENS.ink),
    turfA: pick("--px-turf-a", DEFAULT_TOKENS.turfA),
    turfB: pick("--px-turf-b", DEFAULT_TOKENS.turfB),
  };
}

// ------------------------------------------------------------------ 3×5 pixel font
// Each glyph is five rows of three bits (4 = left, 2 = middle, 1 = right).
const GLYPHS = {
  A: "25755", B: "65656", C: "34443", D: "65556", E: "74647", F: "74644", G: "34553", H: "55755", I: "72227",
  J: "11153", K: "55655", L: "44447", M: "57755", N: "65555", O: "25552", P: "65644", Q: "25573", R: "65655",
  S: "34216", T: "72222", U: "55557", V: "55552", W: "55575", X: "55255", Y: "55222", Z: "71247",
  0: "75557", 1: "26227", 2: "61247", 3: "61216", 4: "55711", 5: "74616", 6: "34757", 7: "71122", 8: "75757", 9: "75716",
  " ": "00000", ".": "00002", ">": "42124", "%": "51245", "-": "00700", "!": "22202", "'": "22000", "/": "11244",
  ":": "02020", "?": "61202", "+": "02720", "(": "24442", ")": "42224", ",": "00024",
};
export const pixelText = (s) =>
  String(s ?? "")
    .toUpperCase()
    .replace(/→/g, ">")
    .replace(/[·•—–]/g, "-")
    .replace(/…/g, "...")
    .replace(/[^A-Z0-9 .>%\-!'/:?+(),]/g, " ");
export const textWidth = (s, scale = 1) => (s.length ? (s.length * 4 - 1) * scale : 0);
const fit = (s, width, scale = 1) => {
  const max = Math.floor((width + scale) / (4 * scale));
  return s.length <= max ? s : s.slice(0, Math.max(0, max - 1)).trimEnd() + ".";
};

// ------------------------------------------------------------------ sprites
// Running back, 14×14, four leg frames (frame 3 doubles as the standing pose).
const RB_BODY = [".....HHHH.....", "....HHHHHH....", "....HHHHSMM...", "....HHHSSM....", ".....SSS......", "....JJJJJ.....", "...JJJJJJJ....", "...SJJJJJBB...", "....JJJJJBB...", "....PPPPP....."];
const RB_LEGS = [
  ["...PP...PP....", "..PP.....PP...", ".PP.......P...", ".KK.......KK.."],
  ["....PP.PP.....", "....PP..PP....", "....P....PP...", "...KK....KK..."],
  ["....PP.PP.....", "...PP...PP....", "..PP.....PP...", "..KK......KK.."],
  [".....PPP......", "....PP.PP.....", "....PP..P.....", "....KK..KK...."],
];
// Referee, 11×14: arms down, arms up (touchdown), arm out (flag / signal).
const REF_LEGS = ["...KKKKK...", "...KK.KK...", "...KK.KK...", "...KK.KK...", "..KKK.KKK.."];
const REF = {
  idle: ["....WWW....", "...WWWWW...", "....SSS....", "....SSS....", "..ZKZKZKZ..", "..ZKZKZKZ..", "..ZKZKZKZ..", "..SKZKZKS..", "...KZKZK...", ...REF_LEGS],
  up: ["..S.WWW.S..", "..ZWWWWWZ..", "..Z.SSS.Z..", "..Z.SSS.Z..", "..ZKZKZKZ..", "...KZKZK...", "...KZKZK...", "...KZKZK...", "...KZKZK...", ...REF_LEGS],
  out: ["....WWW....", "...WWWWW...", "....SSS....", "....SSS....", "..ZKZKZKZZS", "..ZKZKZK...", "..ZKZKZK...", "..SKZKZK...", "...KZKZK...", ...REF_LEGS],
};
const FLAG = ["YYYY.", "YYYYK", "YYYY.", "K...."];
const BALL = [[".BB.", "BWWB", ".BB."], [".BB.", "BBBB", ".BB."]];
const FLOPPY = ["FFFMMMMFF.", "FFFMMKMFFF", "FFFMMMMFFF", "FFFFFFFFFF", "FFFFFFFFFF", "FFLLLLLLFF", "FFLLLLLLFF", "FFLLLLLLFF", "FFLLLLLLFF", "FFFFFFFFFF"];
const LENS = ["..LLLL....", ".L....L...", "L......L..", "L......L..", "L......L..", "L......L..", ".L....L...", "..LLLLLL..", ".......LL.", "........LL"];
const ARROW = ["...LLLL...", "...LLLL...", "...LLLL...", ".LLLLLLLL.", "..LLLLLL..", "...LLLL...", "....LL....", "..........", "LL......LL", "LLLLLLLLLL"];

// ------------------------------------------------------------------ layout & model
// Integer scale for the art: as large as fits 200×180 logical pixels, measured in device pixels.
export function pickScale(cssW, cssH, dpr = 1) {
  const w = Math.max(1, cssW * dpr),
    h = Math.max(1, cssH * dpr);
  const s = Math.max(1, Math.floor(Math.min(w / 200, h / 180)));
  return { s, lw: Math.ceil(w / s), lh: Math.ceil(h / s) };
}

// Where everything sits for a lw×lh canvas whose bottom `inset` rows are under the HUD.
export function sceneLayout(lw, lh, inset = 0) {
  const H = Math.max(Math.min(lh, 140), lh - inset);
  const fh = clamp(Math.round(H * 0.36), 46, 110);
  const fieldTop = H - fh,
    ribbonY = fieldTop - 8,
    standsH = clamp(Math.round(H * 0.2), 20, 60),
    standsTop = ribbonY - standsH;
  const bw = Math.min(176, lw - 24),
    bh = 48;
  const end = clamp(Math.round(lw * 0.09), 14, 40);
  return {
    lw,
    lh,
    H,
    fh,
    fieldTop,
    ribbonY,
    standsTop,
    board: { x: Math.round((lw - bw) / 2), y: Math.max(3, standsTop - bh + 12), w: bw, h: bh },
    goalL: end,
    goalR: lw - end,
    base: fieldTop + Math.round(fh * 0.62),
  };
}

// The runner's x for a yard line (0 = own goal line, 100 = the end zone).
export const yardX = (L, yard) => Math.round(L.goalL + ((L.goalR - L.goalL) * clamp(yard, 0, 100)) / 100);

const TITLE = { save: "SAVING", download: "UPDATING", verify: "REVIEW", install: "INSTALL", restart: "TOUCHDOWN", error: "FLAG!" };
// What the scene shows for a loaderView() result: the moment, the yard line and the board text.
export function sceneModel(view) {
  const steps = view?.steps || [];
  const index = Math.max(0, steps.findIndex((s) => s.state === "active" || s.state === "error"));
  const step = steps[index] || { id: "save", label: "", detail: "" };
  const mode = view?.error ? "error" : step.id;
  const percent = clamp(Math.round(Number(view?.percent) || 0), 0, 100);
  const detail = mode === "error" ? "UPDATE POSTPONED" : mode === "restart" ? "SEE YOU AT KICKOFF" : pixelText(step.detail || step.label);
  return {
    mode,
    percent,
    yard: percent,
    from: pixelText(view?.from ? "v" + view.from : "v?"),
    to: pixelText(view?.to ? "v" + view.to : "v?"),
    title: TITLE[mode],
    digits: percent + "%",
    detail,
    ticker: pixelText(`Step ${Math.min(index + 1, steps.length || 5)}/${steps.length || 5}  ${step.label}${step.detail ? "  -  " + step.detail : ""}  -  ${mode === "error" ? "flag on the play. Update postponed" : mode === "restart" ? "touchdown! see you at kickoff" : "your career is saved"}`),
  };
}

// ------------------------------------------------------------------ drawing
// Draws one frame. ctx needs only fillStyle, globalAlpha and fillRect. clock = { t (seconds in
// this moment), frame (global frame number), still (reduced motion: one representative frame) }.
export function drawScene(ctx, L, model, clock = {}, tokens = DEFAULT_TOKENS, runnerX = null) {
  const { lw, lh, board: B } = L;
  const still = !!clock.still,
    mode = model.mode;
  const t = still ? (mode === "restart" ? 0.8 : mode === "error" ? 2 : 0.55) : Math.max(0, clock.t || 0);
  const frame = still ? 1 : Math.max(0, clock.frame | 0);
  const tk = { ...DEFAULT_TOKENS, ...tokens };
  const R = (x, y, w, h, c, a = 1) => {
    if (w <= 0 || h <= 0) return;
    ctx.globalAlpha = a;
    ctx.fillStyle = c;
    ctx.fillRect(Math.round(x), Math.round(y), Math.round(w), Math.round(h));
  };
  const sprite = (rows, x, y, ink, a = 1, k = 1) =>
    rows.forEach((row, r) => {
      for (let c = 0; c < row.length; c++) if (ink[row[c]]) R(Math.round(x) + c * k, Math.round(y) + r * k, k, k, ink[row[c]], a);
    });
  const text = (s, x, y, color, scale = 1, led = false) => {
    for (let i = 0; i < s.length; i++) {
      const g = GLYPHS[s[i]] || GLYPHS[" "];
      for (let r = 0; r < 5; r++) for (let c = 0; c < 3; c++) if (+g[r] & (4 >> c)) R(x + (i * 4 + c) * scale, y + r * scale, led ? scale - 1 : scale, led ? scale - 1 : scale, color);
    }
  };
  const dimmed = mode === "restart" && !still && t >= RESTART_DIM_AT;
  const lightsOff = dimmed && t >= RESTART_DIM_AT + 0.6;
  const td = mode === "restart",
    err = mode === "error";
  const led = err ? tk.warn : td ? tk.good : tk.accent;

  // Sky: four stepped bands and twinkling stars.
  const skyH = L.fieldTop;
  ART.sky.forEach((c, i) => R(0, Math.round((skyH * i) / 4), lw, Math.ceil(skyH / 4) + 1, c));
  for (let i = 0; i < 46; i++) {
    const x = Math.floor(hash(i, 1) * lw),
      y = Math.floor(hash(i, 2) * Math.max(8, L.standsTop - 4));
    if (hash(i, frame >> 1) > 0.12) R(x, y, 1, 1, ART.star, hash(i, 3) > 0.7 ? 0.9 : 0.45);
  }

  // Fireworks over the stadium for the touchdown.
  if (td) {
    const colors = [tk.accent, tk.team, tk.chalk, tk.good, tk.warn];
    for (let k = 0; k < 5; k++) {
      const age = frac((t + k * 0.29) / 1.45);
      const cycle = Math.floor((t + k * 0.29) / 1.45);
      const cx = Math.round(lw * (0.12 + 0.76 * hash(k, cycle + 9))),
        cy = Math.round(6 + hash(k, cycle + 4) * Math.max(10, L.standsTop - 18));
      const r = 3 + age * 15,
        col = colors[(k + cycle) % colors.length];
      if (age < 0.12) R(cx, cy + Math.round((0.12 - age) * 80), 1, 2, tk.chalk);
      else
        for (let p = 0; p < 12; p++) {
          if (age > 0.7 && (p + frame) % 2) continue;
          const a = (p / 12) * Math.PI * 2;
          const size = age < 0.35 ? 2 : 1;
          R(cx + Math.cos(a) * r, cy + Math.sin(a) * r * 0.85 + age * age * 8, size, size, p % 3 ? col : tk.chalk);
        }
    }
  }

  // Light towers with stepped glow; they buzz, and go out at the end of the restart.
  const bankY = Math.max(3, B.y - 1);
  for (const [side, tx] of lw >= 230 ? [[0, 5], [1, lw - 19]] : []) {
    if (!lightsOff) {
      const cx = tx + 7,
        cy = bankY + 5;
      for (const [rad, a] of [[24, 0.035], [16, 0.05], [10, 0.08]])
        for (let dy = -rad; dy <= rad; dy += 1) {
          const w = Math.round(Math.sqrt(rad * rad - dy * dy));
          R(cx - w, cy + dy, w * 2, 1, ART.glow, dimmed ? a / 2 : a);
        }
    }
    R(tx + 6, bankY + 10, 2, L.standsTop - bankY - 10, ART.steel);
    for (let y = bankY + 13; y < L.standsTop; y += 4) R(tx + 5, y, 4, 1, ART.steelDark);
    R(tx, bankY, 14, 10, ART.steel);
    for (let r = 0; r < 3; r++)
      for (let c = 0; c < 4; c++) {
        const off = lightsOff || hash(frame, c + r * 4 + side * 20) < 0.025;
        R(tx + 1 + c * 3, bankY + 1 + r * 3, 2, 2, off ? ART.lampOff : ART.lamp);
      }
  }

  // Stands: tiers of fans who bob, and camera flashes.
  R(0, L.standsTop - 3, lw, L.ribbonY - L.standsTop + 3, ART.stands);
  R(0, L.standsTop - 3, lw, 2, ART.steel);
  const bob = td ? 0.45 : err ? 0 : mode === "download" ? 0.08 : 0.04,
    flash = td ? 0.03 : err ? 0.002 : 0.006;
  for (let row = 0, y = L.standsTop + 1; y + 4 <= L.ribbonY; row++, y += 5) {
    for (let x = 1 + (row % 2); x < lw - 1; x += 3) {
      const i = row * 997 + x,
        h = hash(i, 7);
      const up = !still && hash(i, frame >> 1) < bob ? 1 : 0;
      const shirt = h < 0.5 ? tk.team : h < 0.66 ? ART.fanShirt[0] : h < 0.82 ? ART.fanShirt[1] : h < 0.92 ? ART.fanShirt[2] : tk.accent;
      R(x, y - up, 2, 2, ART.skin[Math.floor(hash(i, 8) * 4)], 0.85);
      R(x, y + 2 - up, 2, 2, shirt, 0.9);
      if (hash(i, frame) < flash) R(x, y - up, 1, 1, "#ffffff");
    }
    R(0, y + 4, lw, 1, ART.tier);
  }
  if (err) R(0, L.standsTop - 3, lw, L.ribbonY - L.standsTop + 3, tk.ink, 0.3);

  // Jumbotron.
  const drawBoard = () => {
    const ix = B.x + 3,
      iy = B.y + 3,
      iw = B.w - 6,
      ih = B.h - 6;
    R(B.x + 18, B.y + B.h, 3, L.standsTop - B.y - B.h + 4, ART.steel);
    R(B.x + B.w - 21, B.y + B.h, 3, L.standsTop - B.y - B.h + 4, ART.steel);
    R(B.x - 1, B.y - 1, B.w + 2, B.h + 2, tk.ink);
    R(B.x, B.y, B.w, B.h, ART.steelDark);
    R(B.x, B.y, B.w, 2, tk.team);
    R(ix, iy, iw, ih, ART.led);
    for (let y = iy + 1; y < iy + ih; y += 2) R(ix, y, iw, 1, ART.ledLine);
    if (dimmed) {
      // The lights are down: one last message before the window closes.
      const a = "SEE YOU AT",
        b = "KICKOFF";
      text(a, ix + Math.round((iw - textWidth(a, 2)) / 2), iy + 6, tk.chalk, 2);
      text(b, ix + Math.round((iw - textWidth(b, 2)) / 2), iy + 19, led, 2);
      const v = model.to;
      text(v, ix + Math.round((iw - textWidth(v)) / 2), iy + 33, ART.ledDim);
      return;
    }
    // Row A: wordmark and the version chips.
    const chip = (s, x, border, color) => {
      const w = textWidth(s);
      R(x - 2, iy + 1, w + 4, 9, border);
      R(x - 1, iy + 2, w + 2, 7, ART.led);
      text(s, x, iy + 3, color);
      return w + 4;
    };
    const toW = textWidth(model.to) + 4,
      fromW = textWidth(model.from) + 4;
    let cx = ix + iw - 2 - toW + 2;
    chip(model.to, cx, led, led);
    cx -= 8;
    text(">", cx + 1, iy + 3, ART.ledDim);
    cx -= fromW;
    chip(model.from, cx + 2, ART.steel, ART.ledDim);
    if (cx - ix > 36) text("GRIDIRON", ix + 2, iy + 3, ART.ledDim);
    // Row B: moment icon, big title, scoreboard percent.
    const flashOn = td && !still && frame % 4 < 2;
    const titleColor = td ? (flashOn ? tk.chalk : tk.good) : led;
    const digitsW = textWidth(model.digits, 3);
    let tx = ix + 3;
    const icon = { save: FLOPPY, verify: LENS, download: ARROW, error: null, restart: null, install: null }[model.mode];
    if (model.mode === "save") {
      const filled = still ? 2 : (frame >> 1) % 5;
      sprite(FLOPPY, ix + 3, iy + 13, { F: tk.team, M: ART.ledDim, K: ART.led, L: tk.chalk });
      for (let r = 0; r < filled && r < 4; r++) R(ix + 6, iy + 18 + r, 4, 1, tk.ink);
      if (frame % 2 || still) R(ix + 12, iy + 13, 1, 1, led);
    } else if (model.mode === "verify") sprite(LENS, ix + 3 + (still ? 0 : [0, 1, 1, 0][frame % 4]), iy + 13, { L: led });
    else if (model.mode === "download") sprite(ARROW, ix + 3, iy + 12 + (still ? 0 : frame % 2), { L: led });
    else if (model.mode === "install")
      for (let b = 0; b < 9; b++) {
        const lit = still ? b < 6 : b <= frame % 10;
        R(ix + 3 + (b % 3) * 4, iy + 21 - Math.floor(b / 3) * 4, 3, 3, lit ? led : ART.ledLine);
      }
    else if (err) sprite(FLAG, ix + 3, iy + 13, { Y: tk.warn, K: tk.chalk }, 1, 2);
    if (icon || model.mode === "install" || err) tx = ix + 17;
    const title = fit(model.title, ix + iw - 6 - digitsW - tx, 2);
    text(title, tx, iy + 14, titleColor, 2);
    text(model.digits, ix + iw - 2 - digitsW, iy + 12, led, 3);
    // Row C: detail; row D: drive chart.
    const detail = fit(model.detail, iw - 6);
    text(detail, ix + Math.round((iw - textWidth(detail)) / 2), iy + 30, tk.chalk);
    const bw = iw - 6,
      fill = Math.round((bw * model.percent) / 100);
    R(ix + 3, iy + 37, bw, 3, ART.steelDark);
    R(ix + 3, iy + 37, fill, 3, led);
    for (let x = ix + 6; x < ix + 3 + bw; x += 4) R(x, iy + 37, 1, 3, ART.led);
    // A packet landing makes the board spark.
    if (model.mode === "download" && !still && frame % 6 === 0) R(B.x + B.w / 2 - 1, B.y + B.h - 1, 3, 2, led);
  };
  drawBoard();

  // Ribbon board: the current step scrolls along the fascia.
  R(0, L.ribbonY, lw, 7, tk.ink);
  R(0, L.ribbonY + 7, lw, 1, tk.team);
  const tick = model.ticker + "      ",
    tw = textWidth(tick) + 4;
  const off = still ? 0 : (frame * 2) % tw;
  for (let x = 2 - off; x < lw; x += tw) text(tick, x, L.ribbonY + 1, err ? tk.warn : tk.accent);

  // Field: sideline, 10-yard stripes, end zones, lines, hash marks, numbers, goal posts.
  const y0 = L.fieldTop + 3,
    fieldH = lh - y0;
  R(0, L.fieldTop, lw, 3, ART.sideline);
  for (let yd = 0; yd < 100; yd += 10) {
    const a = yardX(L, yd);
    R(a, y0, yardX(L, yd + 10) - a, fieldH, (yd / 10) % 2 ? tk.turfB : tk.turfA);
  }
  R(0, y0, L.goalL, fieldH, tk.turfB);
  R(L.goalR, y0, lw - L.goalR, fieldH, tk.turfB);
  R(0, y0, L.goalL, fieldH, tk.team, 0.55);
  R(L.goalR + 1, y0, lw - L.goalR - 1, fieldH, tk.team, td && !still && frame % 2 ? 0.8 : 0.55);
  for (const [x0, x1] of [[0, L.goalL], [L.goalR + 1, lw]])
    for (let y = y0 + 2; y < lh; y += 1)
      for (let x = x0 + ((y * 2) % 8); x < x1; x += 8) R(x, y, 1, 1, tk.chalk, 0.12);
  R(0, y0, lw, 1, tk.chalk, 0.9);
  for (let yd = 0; yd <= 100; yd += 5) R(yardX(L, yd), y0, 1, fieldH, tk.chalk, yd % 50 === 0 ? 0.95 : yd % 10 ? 0.4 : 0.75);
  const hashA = y0 + Math.round(L.fh * 0.22),
    hashB = L.base + 10;
  for (let yd = 1; yd < 100; yd++) {
    if (yd % 5 === 0) continue;
    const x = yardX(L, yd);
    R(x, hashA, 1, 2, tk.chalk, 0.5);
    R(x, hashB, 1, 2, tk.chalk, 0.5);
  }
  for (let yd = 10; yd <= 90; yd += 10) {
    const n = String(yd <= 50 ? yd : 100 - yd);
    text(n, yardX(L, yd) - Math.round(textWidth(n) / 2) + 1, L.base + 3, tk.chalk);
  }
  R(L.goalL, y0, 1, 2, ART.pylon);
  R(L.goalR, y0, 1, 2, ART.pylon);

  // Players. The runner's x comes from the stage (it eases toward the yard line).
  const rbInk = { H: tk.team, J: tk.team, S: ART.skin[0], M: tk.ink, B: ART.ball, P: tk.chalk, K: tk.ink };
  const dfInk = { H: ART.defHelmet, J: ART.defJersey, S: ART.skin[1], M: tk.ink, B: ART.defJersey, P: ART.defHelmet, K: tk.ink };
  const refInk = { W: tk.chalk, S: ART.skin[2], Z: tk.chalk, K: tk.ink };
  const target = td ? Math.round((L.goalR + lw) / 2) : yardX(L, model.yard);
  const rx = runnerX == null ? target : Math.round(runnerX);
  const running = !still && (mode === "download" || Math.abs(target - rx) > 1);
  const legs = (k) => [...RB_BODY, ...RB_LEGS[k]];
  const feet = L.base - 14;
  const refTop = L.base - 21;
  // Two chasers behind the ball carrier.
  for (let k = 1; k >= 0; k--) {
    const dx = td ? -48 - k * 15 : -22 - k * 15;
    const dy = k ? 4 : -5;
    sprite(legs(running ? (frame + k * 2) % 4 : 3), rx + dx - 7, feet + dy, dfInk);
  }
  // Referee: trailing the play, under the replay hood, signalling the touchdown or throwing a flag.
  let refX = clamp(rx + 14, 2, lw - 13);
  if (mode === "verify") {
    const hx = clamp(rx + 12, 4, lw - 16);
    refX = hx + 1;
    sprite(REF.idle, refX, refTop, refInk);
    R(hx + 5, refTop + 9, 2, 5, ART.steel);
    R(hx - 1, refTop - 7, 14, 2, ART.steel);
    R(hx, refTop - 5, 12, 12, ART.steelDark);
    R(hx + 1, refTop - 4, 10, 10, ART.led);
    R(hx + 2, refTop - 3, 8, 6, ART.screen[still ? 1 : frame % 3 ? 0 : 1]);
    if (still || frame % 6 < 4) text("?", hx + 4, refTop - 14, tk.chalk);
  } else if (td) {
    refX = clamp(L.goalR - 20, 2, lw - 13);
    sprite(REF.up, refX, refTop - (still ? 0 : frame % 4 < 2 ? 1 : 0), refInk);
  } else if (err) sprite(REF.out, refX, refTop, refInk);
  else sprite(REF.idle, refX, refTop, refInk);
  // Ball carrier.
  const hop = td && !still && frame % 4 < 2 ? 2 : 0;
  sprite(legs(running ? frame % 4 : td ? 0 : 3), rx - 7, feet - hop, rbInk);
  if (td) sprite(BALL[0], rx + 6, L.base - 3, { B: ART.ball, W: tk.chalk });

  // Downloading: footballs and data packets spiral up into the jumbotron.
  if (mode === "download") {
    const ex = B.x + B.w / 2,
      ey = B.y + B.h - 2;
    for (let k = 0; k < 5; k++) {
      const p = frac(t / 1.7 + k / 5);
      if (p > 0.94) continue;
      const cycle = Math.floor(t / 1.7 + k / 5);
      const sx = lw * (0.12 + 0.76 * hash(k, cycle)),
        sy = L.base - 6;
      const x = sx + (ex - sx) * p,
        y = sy + (ey - sy) * p - Math.sin(p * Math.PI) * 22;
      if (k % 2) R(x, y, 2, 2, tk.accent);
      else sprite(BALL[(frame + k) % 2], x - 2, y - 1, { B: ART.ball, W: tk.chalk });
    }
  }

  // Penalty: the flag arcs from the referee's hand and lands by the ball carrier.
  if (err) {
    const p = clamp(t / 0.6, 0, 1);
    const sx = refX + 10,
      sy = refTop + 4,
      ex = clamp(rx + 8, 2, lw - 6),
      ey = L.base - 3;
    sprite(FLAG, sx + (ex - sx) * p, sy + (ey - sy) * p - Math.sin(p * Math.PI) * 18, { Y: tk.warn, K: tk.ink });
  }

  // Touchdown: confetti and a white flash; then the lights go down.
  if (td) {
    const colors = [tk.accent, tk.team, tk.chalk, tk.good, ART.defHelmet];
    for (let i = 0; i < 80; i++) {
      const speed = 16 + hash(i, 2) * 22;
      const y = ((t * speed + hash(i, 3) * lh) % (lh + 8)) - 6;
      const x = Math.floor(hash(i, 1) * lw) + ((frame + i) % 4 < 2 ? 0 : 1);
      const flip = (frame + i) % 2;
      R(x, y, flip ? 2 : 1, flip ? 1 : 2, colors[i % colors.length]);
    }
    if (!still && t < 0.5 && frame % 2 === 0) R(0, 0, lw, lh, tk.chalk, 0.16);
  }
  if (dimmed) {
    R(0, 0, lw, lh, tk.ink, Math.min(0.62, (Math.floor((t - RESTART_DIM_AT) / 0.2) + 1) * 0.1));
    drawBoard();
  }
  ctx.globalAlpha = 1;
}

// ------------------------------------------------------------------ stage (DOM)
// Mounts the scene on a canvas covering the dialog. getInset() → HUD height in CSS px.
export function createStage(canvas, host, { inset = null, getInset = () => inset?.getBoundingClientRect().height || 0 } = {}) {
  const ctx = canvas.getContext?.("2d");
  let L = null,
    model = null,
    tokens = DEFAULT_TOKENS,
    raf = 0,
    last = -1,
    since = 0,
    runnerX = null,
    dims = null,
    observer = null,
    pending = 0;
  const now = () => (typeof performance !== "undefined" ? performance.now() : Date.now());
  const still = () => !!(globalThis.matchMedia?.("(prefers-reduced-motion: reduce)").matches || document.body.classList.contains("reduce-motion"));
  const draw = (frame) => {
    if (!ctx || !L || !model) return;
    const quiet = still();
    const target = model.mode === "restart" ? Math.round((L.goalR + L.lw) / 2) : yardX(L, model.yard);
    if (quiet || runnerX == null) runnerX = target;
    else runnerX += clamp(target - runnerX, -2, 2);
    drawScene(ctx, L, model, { t: (now() - since) / 1000, frame, still: quiet }, tokens, runnerX);
  };
  const loop = () => {
    raf = requestAnimationFrame(loop);
    if (still()) return;
    const frame = Math.floor((now() / 1000) * FPS);
    if (frame !== last) draw((last = frame));
  };
  const resize = () => {
    const dpr = globalThis.devicePixelRatio || 1;
    dims = pickScale(innerWidth, innerHeight, dpr);
    const u = dims.s / dpr;
    host.style.setProperty("--u", u + "px");
    host.style.setProperty("--z", String(clamp(1 + (u - 4) * 0.15, 0.9, 1.75)));
    canvas.width = dims.lw;
    canvas.height = dims.lh;
    canvas.style.width = dims.lw * u + "px";
    canvas.style.height = dims.lh * u + "px";
    tokens = readTokens(host);
    L = sceneLayout(dims.lw, dims.lh, Math.ceil((getInset() * dpr) / dims.s));
    runnerX = null;
    draw(Math.max(0, last));
  };
  return {
    // A new view: restart the moment's clock when the moment changes, redraw when still.
    set(next) {
      if (!model || model.mode !== next.mode) since = now();
      model = next;
      if (still() || last < 0) draw(Math.max(0, last));
    },
    resize,
    start() {
      addEventListener("resize", resize);
      // The HUD's height decides where the field ends (stylesheet arrival, error panel, wrapping).
      if (typeof ResizeObserver === "function" && inset) {
        let seen = -1;
        observer = new ResizeObserver(() => {
          const h = Math.round(getInset());
          if (h === seen) return;
          seen = h;
          cancelAnimationFrame(pending);
          pending = requestAnimationFrame(resize);
        });
        observer.observe(inset);
      }
      resize();
      if (!raf && typeof requestAnimationFrame === "function") loop();
    },
    stop() {
      cancelAnimationFrame?.(raf);
      raf = 0;
      observer?.disconnect();
      removeEventListener("resize", resize);
    },
  };
}

// ------------------------------------------------------------------ "Updated to" card art
const TROPHY = ["....YYYYYYYY....", ".YYYYWYYYYYDYYY.", "Y..YYWYYYYYDY..Y", "Y..YYWYYYYYDY..Y", ".Y.YYYYYYYYDY.Y.", "..YYYYYYYYYDYY..", "....YYYYYYDD....", ".....YYYYDD.....", "......YYDD......", "......YYDD......", ".....YYYYDD.....", "....KKKKKKKK....", "....KWWWWWWK....", "....KKKKKKKK....", "...KKKKKKKKKK..."];
export function trophySVG() {
  const ink = { Y: ART.gold, D: "#b8862a", W: "#fff6d8", K: "#2a3350" };
  let rects = "";
  TROPHY.forEach((row, y) => [...row].forEach((c, x) => ink[c] && (rects += `<rect x="${x + 4}" y="${y + 6}" width="1" height="1" fill="${ink[c]}"/>`)));
  const spark = [[2, 3], [21, 5], [19, 1], [1, 12], [22, 14]].map(([x, y], i) => `<rect class="gd-uload-spark s${i % 3}" x="${x}" y="${y}" width="1" height="1" fill="#fff6d8"/>`).join("");
  return `<svg viewBox="0 0 24 24" shape-rendering="crispEdges" aria-hidden="true">${rects}${spark}</svg>`;
}
