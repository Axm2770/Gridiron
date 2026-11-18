// Pixel art for the league ceremonies (franchise/ceremonies.mjs): the Scouting Combine cutscene
// (a 40-yard dash with a ticking stopwatch, then a bench-press and vertical-jump montage), the Hall
// of Fame enshrinement (gold jacket, bust unveiling, speech captions) and NFL Honors (envelope
// reveal and trophy). Scenes are 160×90 pixel grids split into layers; frame timing is inline CSS
// animation (steps()) so the stopwatch ticks to the real time. Styles: ceremonies.css.
// Also the feature visuals for ceremony news (window.GDFeatureVisuals combine | hof | awards).
import {
  PixelGrid,
  SCENE_BUILDERS,
  spriteLook,
  teamColors,
  teamLabel,
  coachLook,
  pixelPortrait,
  glyphText,
  textWidth,
  shade,
  mix,
  drawHead,
  drawSuited,
  drawPlayer,
  nightSky,
  stadium,
  crowdLayer,
  flashSVG,
  confettiLayer,
  sceneSVG,
  lastName,
  seedOf,
  GOLD,
} from "./pixel-art.mjs";
import { pixelFace } from "../ui/pixel-face.mjs";

const OUTLINE = "#0b0d12",
  KIT = { primary: "#3a4252", secondary: "#e8ebef", dark: "#262c37" },
  NAVY = "#14284b",
  RED = "#c8323c",
  BRONZE = "#b98a46",
  JACKET = "#d4a22c";
const esc = (v) => String(v ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
const lay = (g, cls, style = "") => `<g class="${cls}"${style ? ` style="${style}"` : ""}>${g.rects()}</g>`;
const grid = () => new PixelGrid(160, 90);
const centre = (g, str, cx, y, c, scale = 1) => g.text(str, cx - Math.floor(textWidth(str, scale) / 2), y, c, scale);
const fmtT = (v) => (Number.isFinite(v) ? v.toFixed(2) : "--");
// Visibility helpers: cer-f starts hidden, cer-v starts visible; cer-keep is what reduce-motion shows.
const on = (at, dur) => `animation:cer-on ${dur.toFixed(2)}s steps(1,end) ${at.toFixed(2)}s 1 forwards`;
const stay = (at) => `animation:cer-stay .01s steps(1,end) ${at.toFixed(2)}s 1 forwards`;
const off = (at) => `animation:cer-off .01s steps(1,end) ${at.toFixed(2)}s 1 forwards`;

/* ---------------------------------------------------------------- combine */

// Side-view sprinter (facing right), 16×24 box at (x, y). pose: stance | a | b.
function runner(g, x, y, look, pose, colors = KIT) {
  const { skin, hair } = look,
    shirt = colors.primary,
    shorts = colors.dark;
  if (pose === "stance") {
    g.ellipse(x + 13, y + 14, 3, 3.2, skin).rect(x + 11, y + 10, 5, 2, hair);
    g.rect(x + 3, y + 13, 9, 5, shirt).rect(x + 1, y + 15, 4, 4, shorts);
    g.rect(x + 11, y + 17, 2, 6, skin).rect(x + 0, y + 19, 3, 4, skin).rect(x + 5, y + 18, 3, 5, skin);
    g.rect(x - 1, y + 22, 4, 1, "#f2f2f2").rect(x + 4, y + 22, 4, 1, "#f2f2f2");
    return g;
  }
  const a = pose === "a";
  g.ellipse(x + 10, y + 3, 3, 3.4, skin).rect(x + 7, y, 6, 2, hair).set(x + 12, y + 3, OUTLINE);
  g.rect(x + 7, y + 6, 6, 8, shirt).rect(x + 7, y + 6, 6, 1, shade(shirt, 1.3));
  // arms
  if (a) g.rect(x + 12, y + 7, 4, 2, shirt).rect(x + 15, y + 5, 2, 3, skin).rect(x + 4, y + 9, 4, 2, shirt).rect(x + 2, y + 10, 2, 3, skin);
  else g.rect(x + 12, y + 9, 3, 2, shirt).rect(x + 14, y + 10, 2, 3, skin).rect(x + 5, y + 7, 3, 2, shirt).rect(x + 4, y + 4, 2, 3, skin);
  g.rect(x + 7, y + 14, 6, 3, shorts);
  // legs: a = right leg driving forward, left trailing
  if (a) g.rect(x + 11, y + 16, 3, 3, skin).rect(x + 13, y + 18, 3, 3, skin).rect(x + 13, y + 21, 3, 2, skin).rect(x + 14, y + 23, 3, 1, "#f2f2f2").rect(x + 6, y + 16, 3, 3, skin).rect(x + 3, y + 18, 3, 3, skin).rect(x + 1, y + 17, 2, 2, "#f2f2f2");
  else g.rect(x + 9, y + 16, 3, 4, skin).rect(x + 9, y + 20, 3, 3, skin).rect(x + 9, y + 23, 4, 1, "#f2f2f2").rect(x + 10, y + 16, 3, 3, skin).rect(x + 12, y + 18, 2, 2, skin).rect(x + 6, y + 19, 3, 2, skin).rect(x + 5, y + 20, 2, 2, "#f2f2f2");
  return g;
}
function combineHall(g, seed) {
  nightSky(g, 10, "#05070d", "#101827");
  stadium(g, { primary: NAVY, secondary: RED, dark: shade(NAVY, 0.6) }, seed, { top: 6, bottom: 32 });
  g.rect(0, 25, 160, 6, "#0b0f18");
  centre(g, "NFL SCOUTING COMBINE", 80, 26, GOLD);
  for (let y = 33; y < 90; y++) g.rect(0, y, 160, 1, Math.floor((y - 33) / 5) % 2 ? "#2c7a3a" : "#33873f");
  // Yard lines every 10 yards from the start (x=16) to the finish (x=146), numbered on the turf.
  for (let i = 0; i <= 4; i++) {
    const x = 16 + Math.round(i * 32.5);
    g.rect(x, 33, 1, 57, "#d9e6cf");
    g.text(String(i * 10), x - Math.floor(textWidth(String(i * 10)) / 2), 82, "#d9e6cf");
  }
  g.rect(0, 54, 160, 1, "#3c9a4a").rect(0, 76, 160, 1, "#3c9a4a");
  // Laser gates at the start and the finish.
  for (const x of [14, 148]) g.rect(x, 44, 1, 32, "#c9ced6").rect(x - 1, 43, 3, 2, RED);
  return g;
}
function scoreboard(g, x, y, w, h, label) {
  g.rect(x, y, w, h, "#05070b").rect(x, y, w, 1, "#3a4252").rect(x, y + h - 1, w, 1, "#3a4252").rect(x, y, 1, h, "#3a4252").rect(x + w - 1, y, 1, h, "#3a4252");
  centre(g, label, x + Math.floor(w / 2), y + 2, "#9aa5b4");
  return g;
}
export function combineSceneSVG(d) {
  const seed = seedOf("combine-" + (d.playerId || d.name)),
    look = spriteLook(d.face, d.playerId || d.name),
    drills = d.drills || {},
    forty = Number.isFinite(drills.forty) ? drills.forty : 4.6,
    split = Number.isFinite(drills.split) ? drills.split : forty * 0.352,
    t0 = 0.6,
    run = forty,
    end = t0 + run,
    // Phases line up with the four caption lines (quarters of the 11s scene) unless the 40 runs long.
    benchAt = Math.max(5.5, end + 0.6),
    vertAt = benchAt + (11 - benchAt) / 2;
  const back = combineHall(grid(), seed);
  scoreboard(back, 106, 2, 50, 21, "40 YD DASH");
  scoreboard(back, 4, 2, 40, 21, "10 YD");
  // Stopwatch frames: 0.00 ticking to the official time in step with the run.
  const n = 16;
  let frames = "";
  for (let i = 0; i < n; i++) {
    const g = grid(),
      t = (forty * i) / (n - 1),
      last = i === n - 1;
    centre(g, fmtT(t), 131, 10, last ? GOLD : "#ff5a4f", 2);
    frames += lay(g, `cer-f${last ? " cer-keep" : ""}`, last ? stay(end) : i === 0 ? on(0, t0 + run / (n - 1)) : on(t0 + (run * i) / (n - 1), run / (n - 1)));
  }
  const splitG = grid();
  centre(splitG, fmtT(split), 24, 10, GOLD, 2);
  const official = grid();
  official.rect(106, 24, 50, 7, RED);
  centre(official, "OFFICIAL", 131, 25, "#ffffff");
  // The runner: stance until the gun, then two alternating strides while the group slides 130px.
  const strides = Math.max(2, Math.round(run / 0.13));
  const stance = runner(grid(), 6, 52, look, "stance").outline(),
    strideA = runner(grid(), 4, 52, look, "a").outline(),
    strideB = runner(grid(), 4, 52, look, "b").outline();
  const runnerSVG = `<g class="cer-run cer-keep-run" style="animation:cer-run ${run.toFixed(2)}s steps(${Math.round(run * 9)}) ${t0}s both">${lay(stance, "cer-v", off(t0))}${lay(strideA, "cer-f cer-keep", `animation:cer-stride .26s steps(1,end) ${t0}s ${strides / 2} forwards`)}${lay(strideB, "cer-f", `animation:cer-stride .26s steps(1,end) ${(t0 + 0.13).toFixed(2)}s ${strides / 2 - 0.5}`)}</g>`;
  const crowd = crowdLayer(seed);
  const phaseA = `<g class="cer-v cer-keep" style="${off(benchAt)}">${lay(back, "")}${frames}${lay(splitG, "cer-f cer-keep", stay(t0 + split))}${lay(official, "cer-f cer-keep", `animation:cer-blink .5s steps(1,end) ${end.toFixed(2)}s 4 forwards`)}${runnerSVG}${lay(crowd.g, "")}${flashSVG(crowd.flashes.slice(0, 4), seed)}</g>`;
  // Bench press montage: 225 lb, the bar driving up and down while the rep counter climbs.
  const gym = grid();
  gym.rect(0, 0, 160, 66, "#1b2230").rect(0, 18, 160, 3, "#2a3446");
  for (let x = 6; x < 160; x += 22) gym.rect(x, 26, 16, 26, "#222b3b").rect(x + 1, 27, 14, 24, "#2b3548");
  gym.rect(0, 66, 160, 24, "#262b33");
  for (let x = 0; x < 160; x += 12) gym.rect(x, 66, 1, 24, "#2e343e");
  centre(gym, "BENCH PRESS 225", 80, 6, GOLD);
  scoreboard(gym, 112, 26, 40, 22, "REPS");
  // Dumbbell rack on the wall.
  for (let x = 8; x < 104; x += 9) gym.rect(x, 50, 2, 4, "#3a3f48").rect(x + 2, 51, 3, 2, "#5a606b").rect(x + 5, 50, 2, 4, "#3a3f48");
  gym.rect(6, 54, 100, 2, "#3a3f48");
  // Rack uprights, bench and the lifter lying on it (head to the left, face up).
  gym.rect(55, 34, 2, 30, "#5a606b").rect(55, 40, 5, 2, "#5a606b").rect(53, 64, 6, 2, "#3a3f48");
  gym.rect(46, 60, 60, 4, "#4a2f2f").rect(46, 60, 60, 1, "#6a4444").rect(50, 64, 3, 10, "#3a3f48").rect(100, 64, 3, 10, "#3a3f48").rect(48, 74, 8, 1, "#3a3f48").rect(98, 74, 8, 1, "#3a3f48");
  const body = grid(),
    skin2 = shade(look.skin, 0.85);
  body.ellipse(51, 56, 4.5, 3.5, (nx, ny) => (nx < -0.45 ? look.hair : ny < -0.2 && nx > 0.6 ? look.hair : look.skin));
  body.set(52, 54, OUTLINE);
  body.set(55, 56, shade(look.skin, 0.8));
  body.rect(56, 55, 26, 5, KIT.primary).rect(58, 54, 14, 1, KIT.primary).rect(56, 59, 26, 1, KIT.dark);
  body.rect(82, 55, 8, 5, KIT.dark);
  body.rect(88, 55, 6, 3, skin2).rect(92, 56, 3, 17, skin2).rect(91, 73, 6, 2, "#d8dadd");
  body.rect(88, 53, 10, 3, look.skin).rect(96, 53, 4, 20, look.skin).rect(95, 73, 7, 2, "#f2f2f2");
  body.outline();
  const up = grid(),
    down = grid();
  const plate = (g, cx, cy) => {
    g.ellipse(cx, cy, 8, 8, (nx, ny) => (nx * nx + ny * ny > 0.55 ? "#20242c" : nx * nx + ny * ny > 0.2 ? "#2e333d" : "#9aa5b4"));
    g.rect(cx - 1, cy - 1, 2, 2, "#c9ced6");
  };
  plate(up, 62, 37);
  up.rect(61, 40, 3, 15, look.skin).rect(60, 37, 5, 3, shade(look.skin, 0.9));
  plate(down, 59, 48);
  down.rect(58, 50, 3, 6, look.skin).rect(58, 55, 6, 3, look.skin).rect(57, 48, 5, 3, shade(look.skin, 0.9));
  up.outline();
  down.outline();
  const reps = Number.isFinite(drills.bench) ? drills.bench : null;
  let repFrames = "";
  if (reps !== null) {
    const steps = Math.min(8, Math.max(1, reps));
    for (let i = 1; i <= steps; i++) {
      const g = grid(),
        v = Math.round((reps * i) / steps),
        last = i === steps;
      centre(g, String(v), 132, 35, last ? GOLD : "#ffffff", 2);
      const gap = (vertAt - benchAt - 0.4) / steps;
      repFrames += lay(g, `cer-f${last ? " cer-keep-b" : ""}`, last ? stay(benchAt + gap * i) : on(benchAt + gap * i, gap));
    }
  } else {
    const g = grid();
    centre(g, "DNP", 132, 35, "#9aa5b4", 2);
    repFrames = lay(g, "");
  }
  const phaseB = `<g class="cer-f cer-phase-b" style="${on(benchAt, vertAt - benchAt)}">${lay(gym, "")}${lay(body, "")}${lay(up, "", `animation:cer-blink .5s steps(1,end) ${benchAt}s infinite`)}${lay(down, "", `animation:cer-blink .5s steps(1,end) ${(benchAt + 0.25).toFixed(2)}s infinite;opacity:0`)}${repFrames}</g>`;
  // Vertical jump: crouch, launch, swat the vanes.
  const hall = grid();
  nightSky(hall, 66, "#0b1020", "#1b2436");
  for (let x = 4; x < 160; x += 26) hall.rect(x, 8, 18, 40, "#1f2a3e").rect(x + 1, 9, 16, 38, "#243149");
  for (let y = 66; y < 90; y++) hall.rect(0, y, 160, 1, Math.floor((y - 66) / 4) % 2 ? "#2c7a3a" : "#33873f");
  centre(hall, "VERTICAL JUMP", 80, 2, GOLD);
  hall.rect(112, 14, 2, 62, "#c9ced6").rect(106, 76, 14, 3, "#5a606b");
  const vanes = grid(),
    swatted = grid();
  for (let i = 0; i < 16; i++) {
    const y = 16 + i * 2,
      c = i % 3 === 0 ? RED : i % 3 === 1 ? "#f2f2f2" : "#3b6cc8";
    if (i < 6) swatted.rect(114, y, 9, 1, c);
    else swatted.rect(103, y, 9, 1, c);
    vanes.rect(103, y, 9, 1, c);
  }
  const crouch = grid(),
    leap = grid();
  drawPlayer(crouch, 88, 46, look, KIT, { number: "", arms: "down" });
  drawPlayer(leap, 92, 40, look, KIT, { number: "", arms: "up" });
  crouch.outline();
  leap.outline();
  const vert = Number.isFinite(drills.vertical) ? drills.vertical : null,
    readout = grid();
  scoreboard(readout, 6, 26, 46, 22, "VERT");
  centre(readout, vert === null ? "DNP" : String(vert), 29, 35, GOLD, 2);
  const phaseC = `<g class="cer-f cer-phase-c" style="${stay(vertAt)}">${lay(hall, "")}${lay(vanes, "", off(vertAt + 1.0))}${lay(swatted, "cer-f", stay(vertAt + 1.0))}${lay(crouch, "", off(vertAt + 0.6))}<g class="cer-f" style="${stay(vertAt + 0.6)}"><g style="animation:cer-leap 1.6s steps(6) ${(vertAt + 0.6).toFixed(2)}s 1 both">${lay(leap, "")}</g></g>${lay(readout, "cer-f", stay(vertAt + 1.1))}</g>`;
  return sceneSVG(`${d.name} runs the 40-yard dash at the combine in ${fmtT(forty)} seconds`, phaseA + phaseB + phaseC);
}

/* ------------------------------------------------------------ Hall of Fame */

function hofStage(g, colors, seed, year) {
  g.rect(0, 0, 160, 90, "#0d0b09");
  // Backdrop: bronze-gold banner between stone columns.
  g.rect(30, 1, 100, 25, "#2a2116").rect(31, 2, 98, 23, "#3a2c18").rect(31, 2, 98, 1, GOLD).rect(31, 24, 98, 1, GOLD);
  centre(g, "HALL OF FAME", 80, 5, GOLD, 2);
  centre(g, `CLASS OF ${year}`, 80, 17, "#f1dfb0");
  for (const x of [8, 140]) {
    g.rect(x, 4, 12, 62, "#8d8a83").rect(x + 2, 4, 2, 62, "#a7a39b").rect(x + 9, 4, 2, 62, "#6f6c66").rect(x - 2, 2, 16, 3, "#a7a39b").rect(x - 2, 64, 16, 3, "#6f6c66");
  }
  // Stage floor with a team-coloured runner.
  g.rect(0, 70, 160, 20, "#2a2016").rect(0, 70, 160, 2, "#4a3826").rect(50, 72, 60, 18, mix(colors.primary, "#2a2016", 0.35));
  for (const cx of [44, 80, 124]) for (let y = 26; y < 70; y++) g.rect(cx - 2 - ((y - 26) >> 3), y, 4 + ((y - 26) >> 2), 1, mix(g.get(cx, y) || "#0d0b09", "#fff3cf", 0.06));
  return g;
}
function bust(g, cx, top, look) {
  const bronze = { skin: BRONZE, hair: shade(BRONZE, 0.7), style: look.style, beard: look.beard };
  drawHead(g, cx, top + 8, bronze);
  g.rect(cx - 7, top + 16, 14, 5, shade(BRONZE, 0.85)).rect(cx - 5, top + 21, 10, 2, shade(BRONZE, 0.7));
  return g;
}
function pedestal(g, cx) {
  return g.rect(cx - 9, 54, 18, 16, "#3b3630").rect(cx - 10, 52, 20, 3, "#5a5249").rect(cx - 7, 58, 14, 6, "#2b2722").rect(cx - 10, 68, 20, 2, "#5a5249");
}
export function hofSceneSVG(d) {
  const colors = d.colors,
    seed = seedOf("hof-" + (d.playerId || d.name)),
    look = spriteLook(d.face, d.playerId || d.name),
    T = 13,
    jacketAt = T * 0.3,
    unveilAt = T * 0.55;
  const back = hofStage(grid(), colors, seed, d.classYear || "");
  pedestal(back, 124);
  const presenter = grid();
  drawSuited(presenter, 44, 28, spriteLook(null, "presenter-" + seed), { tie: colors.primary });
  // Presenter holding the gold jacket out, then clapping.
  const holding = grid();
  holding.rect(52, 42, 10, 14, JACKET).rect(52, 42, 10, 1, shade(JACKET, 1.2)).rect(56, 42, 2, 14, shade(JACKET, 0.75)).rect(50, 44, 3, 3, "#d8a47f");
  holding.outline();
  presenter.outline();
  const suitG = grid(),
    jacketG = grid();
  drawSuited(suitG, 80, 28, look, { tie: colors.primary });
  drawSuited(jacketG, 80, 28, look, { tie: colors.primary, suit: JACKET, arm: "up" });
  // The gold jacket over the suit: two front panels around the shirt and tie, darker lapels.
  jacketG.rect(70, 45, 7, 16, JACKET).rect(83, 45, 7, 16, JACKET).rect(72, 44, 5, 1, JACKET).rect(83, 44, 5, 1, JACKET).rect(76, 47, 1, 6, shade(JACKET, 0.7)).rect(83, 47, 1, 6, shade(JACKET, 0.7)).rect(73, 47, 1, 13, shade(JACKET, 1.15));
  suitG.outline();
  jacketG.outline();
  const cloth = grid();
  cloth.ellipse(124, 42, 9, 11, (nx, ny) => (ny < 0.95 ? (nx > 0.3 ? "#c9c4ba" : "#e8e4dc") : null)).rect(115, 44, 18, 9, "#d9d4ca").rect(118, 50, 12, 2, "#bdb7ac");
  cloth.outline();
  const statue = bust(grid(), 124, 29, look).outline();
  const sparkle = grid();
  for (const [x, y] of [[112, 31], [136, 35], [124, 26], [116, 49], [132, 51]]) sparkle.rect(x - 1, y, 3, 1, "#fff7d6").rect(x, y - 1, 1, 3, "#fff7d6");
  const crowd = crowdLayer(seed);
  const gold = { primary: GOLD, secondary: "#fff1b8", dark: "#a8791b" };
  return sceneSVG(
    `${d.name} is enshrined in the Hall of Fame`,
    lay(back, "") +
      lay(presenter, "px-l-owner") +
      lay(holding, "cer-v", off(jacketAt)) +
      lay(suitG, "cer-v", off(jacketAt)) +
      `<g class="cer-f cer-keep" style="${stay(jacketAt)}">${lay(jacketG, "px-l-body")}</g>` +
      lay(cloth, "cer-v", off(unveilAt)) +
      lay(statue, "cer-f cer-keep", stay(unveilAt)) +
      lay(sparkle, "cer-f", `animation:cer-blink .4s steps(1,end) ${unveilAt.toFixed(2)}s 6 forwards`) +
      `<g class="cer-f" style="${stay(unveilAt)}">${lay(confettiLayer(seed, gold, 50), "px-l-fall-a")}${lay(confettiLayer(seed + 5, gold, 50), "px-l-fall-b")}</g>` +
      lay(crowd.g, "") +
      flashSVG(crowd.flashes, seed),
  );
}

/* -------------------------------------------------------------- NFL Honors */

function goldTrophy(g, cx, top) {
  g.ellipse(cx, top + 4, 5, 4, (nx, ny) => (nx + ny < -0.6 ? "#fff6c8" : nx > 0.45 ? "#b8860b" : GOLD));
  g.rect(cx - 7, top + 2, 2, 4, GOLD).rect(cx + 5, top + 2, 2, 4, "#b8860b");
  g.rect(cx - 1, top + 8, 2, 6, GOLD).rect(cx - 3, top + 14, 6, 2, GOLD).rect(cx - 4, top + 16, 8, 3, "#3a2c18");
  return g;
}
export function honorsSceneSVG(d) {
  const colors = d.colors,
    seed = seedOf("honors-" + d.award + d.seasonYear),
    T = 11,
    revealAt = T * 0.3,
    walkAt = T * 0.45,
    liftAt = T * 0.6;
  const back = grid();
  back.rect(0, 0, 160, 90, "#0b0f1d");
  for (let x = 0; x < 160; x += 6) back.rect(x, 0, 3, 64, "#14193a").rect(x + 3, 0, 3, 64, "#10142f");
  back.rect(34, 1, 92, 28, "#05070b").rect(35, 2, 90, 26, "#0d1b3d").rect(35, 2, 90, 1, GOLD).rect(35, 27, 90, 1, GOLD);
  centre(back, "NFL HONORS", 80, 4, GOLD);
  back.rect(0, 68, 160, 22, "#1a1630").rect(0, 68, 160, 2, GOLD).rect(0, 70, 160, 1, "#6b5a1e");
  for (const cx of [56, 116]) for (let y = 0; y < 68; y++) back.rect(cx - 2 - (y >> 3), y, 4 + (y >> 2), 1, mix(back.get(cx, y) || "#0b0f1d", "#fff6d2", 0.06));
  // Screen: award name, then the winner.
  const label = glyphText(d.awardName || "").trim(),
    words = label.split(" "),
    lines = [];
  for (const w of words) {
    const lastLine = lines.at(-1);
    if (lastLine && textWidth(lastLine + " " + w) <= 86) lines[lines.length - 1] = lastLine + " " + w;
    else lines.push(w);
  }
  const titleG = grid();
  lines.slice(0, 2).forEach((l, i) => centre(titleG, l, 80, 12 + i * 7, "#ffffff"));
  const name = glyphText(lastName(d.winnerName)).trim(),
    scale = textWidth(name, 2) <= 86 ? 2 : 1,
    winnerG = grid();
  centre(winnerG, name, 80, scale === 2 ? 10 : 12, GOLD, scale);
  centre(winnerG, d.winnerAbbr || "", 80, 21, "#c9d4ea");
  // Host at the lectern with the envelope.
  const host = grid();
  drawSuited(host, 56, 32, spriteLook(null, "host-" + seed), { tie: "#9aa5af", suit: "#22262e", legs: false });
  host.rect(46, 54, 22, 16, "#2a2f3c").rect(44, 52, 26, 3, "#3a4252").rect(51, 58, 12, 7, GOLD);
  host.outline();
  const closed = grid(),
    open = grid();
  closed.rect(64, 46, 9, 6, "#f4efe2").rect(64, 46, 9, 1, "#c9c2b0").set(68, 48, RED);
  open.rect(64, 42, 9, 10, "#f4efe2").rect(65, 43, 7, 1, GOLD).rect(65, 45, 6, 1, "#5a5f6a").rect(65, 47, 5, 1, "#5a5f6a");
  closed.outline();
  open.outline();
  // The winner walks on and lifts the trophy.
  const coachWin = d.coach,
    look = coachWin ? d.coachLook : spriteLook(d.winnerFace, d.winnerId || d.winnerName),
    wc = d.winnerColors || colors,
    walker = grid(),
    lifter = grid();
  drawSuited(walker, 116, 28, look, { tie: wc.primary });
  drawSuited(lifter, 116, 28, look, { tie: wc.primary, arm: "up" });
  goldTrophy(lifter, 127, 13);
  walker.outline();
  lifter.outline();
  // Front row: your finalist (when you didn't win) watching from the seats.
  const row = grid();
  for (let i = 0; i < 9; i++) {
    const cx = 10 + i * 18;
    row.ellipse(cx, 86, 7, 6, "#07090d").rect(cx - 4, 77, 8, 5, "#0e1117");
  }
  let yoursSeat = "";
  if (!d.won && d.finalistName) {
    const seat = grid();
    drawHead(seat, 28, 80, spriteLook(d.finalistFace, d.finalistId || d.finalistName));
    seat.rect(20, 88, 16, 2, colors.primary).outline();
    yoursSeat = lay(seat, "px-l-bob-b");
  }
  const crowd = crowdLayer(seed);
  return sceneSVG(
    `${d.winnerName} wins ${d.awardName}`,
    lay(back, "") +
      lay(titleG, "cer-v", off(walkAt)) +
      lay(winnerG, "cer-f cer-keep", stay(walkAt)) +
      lay(host, "") +
      lay(closed, "cer-v", off(revealAt)) +
      lay(open, "cer-f cer-keep", stay(revealAt)) +
      `<g class="cer-f" style="${on(walkAt, liftAt - walkAt)}"><g style="animation:cer-walk ${(liftAt - walkAt).toFixed(2)}s steps(8) ${walkAt.toFixed(2)}s both">${lay(walker, "")}</g></g>` +
      lay(lifter, "cer-f cer-keep", stay(liftAt)) +
      `<g class="cer-f" style="${stay(liftAt)}">${lay(confettiLayer(seed, { primary: wc.primary, secondary: wc.secondary }, 60), "px-l-fall-a")}${lay(confettiLayer(seed + 9, { primary: GOLD, secondary: "#ffffff" }, 40), "px-l-fall-b")}</g>` +
      lay(row, "") +
      yoursSeat +
      flashSVG(crowd.flashes.slice(2), seed),
  );
}

/* --------------------------------------------------------- scene registry */

SCENE_BUILDERS.Combine = (e) => {
  const dr = e.drills || {},
    bits = [Number.isFinite(dr.forty) && `40: ${dr.forty.toFixed(2)}`, Number.isFinite(dr.split) && `10-yd ${dr.split.toFixed(2)}`, Number.isFinite(dr.bench) && `Bench ${dr.bench}`, Number.isFinite(dr.vertical) && `Vert ${dr.vertical}"`].filter(Boolean);
  return {
    kind: "combine",
    name: e.playerName,
    kicker: `${e.classYear || ""} Scouting Combine`.trim(),
    headline: String(e.playerName || "").toUpperCase(),
    sub: `${e.pos}${e.college ? " · " + e.college : ""} — ${bits.join(" · ")}`,
    teamName: e.mine ? "On your watchlist" : "Draft class",
    city: "",
    lines: [
      `${e.pos}${e.college ? " · " + e.college : ""} · ${e.mine ? "on your watchlist" : "the headline act"} steps into the blocks.`,
      Number.isFinite(dr.forty) ? `${dr.forty.toFixed(2)} in the 40, with a ${Number.isFinite(dr.split) ? dr.split.toFixed(2) : "--"} split.` : "He skipped the 40.",
      Number.isFinite(dr.bench) ? `Bench press: ${dr.bench} reps at 225 pounds.` : "No bench press today.",
      Number.isFinite(dr.vertical) ? `Vertical jump: ${dr.vertical} inches. Athletic score ${Number(e.score ?? 0).toFixed(1)}.` : `Athletic score ${Number(e.score ?? 0).toFixed(1)}.`,
    ],
    svg: () => combineSceneSVG({ ...e, name: e.playerName }),
  };
};
SCENE_BUILDERS.HallOfFame = (e, s, base) => ({
  kind: "hof",
  name: e.playerName,
  kicker: `Hall of Fame · Class of ${e.classYear}`,
  headline: String(e.playerName || "").toUpperCase(),
  sub: (e.lines || [])[0] || `${e.pos} · Class of ${e.classYear}`,
  lines: e.lines,
  svg: () => hofSceneSVG({ ...base, ...e, name: e.playerName }),
});
SCENE_BUILDERS.Honors = (e, s, base) => {
  const winnerTeam = Number.isInteger(e.winnerTeam) ? e.winnerTeam : base.team,
    wl = teamLabel(winnerTeam, s),
    winnerName = e.coach ? s?.coach?.name || e.winnerName : e.winnerName;
  return {
    kind: "honors",
    name: winnerName,
    kicker: `NFL Honors ${e.seasonYear ?? ""}`.trim(),
    headline: String(e.awardName || "").toUpperCase(),
    sub: `And the ${e.awardName} goes to…`,
    lines: [
      `And the ${e.awardName} goes to…`,
      `${winnerName}! (${wl.name})`,
      `${e.points ?? "—"} points · ${e.firstVotes ?? 0} of 50 first-place votes.`,
      e.won ? (e.coach ? "Your staff, your players, your season. Take a bow." : `${winnerName} thanks the ${wl.name} locker room.`) : `${e.finalistName} was a finalist. The club applauds from the front row.`,
    ],
    svg: () => honorsSceneSVG({ ...base, ...e, winnerName, winnerAbbr: wl.abbr, winnerColors: teamColors(winnerTeam, s), coachLook: coachLook(s, base.team) }),
  };
};

/* --------------------------------------------------------- feature visuals */

const pf = (r, size, team = null) => pixelFace({ id: r.id || r.playerId || r.name, name: r.name, face: r.face || null, college: r.college }, { size, team: Number.isInteger(team) && team >= 0 ? team : null });
const DRILL_LABEL = { forty: "40-yard dash", split: "10-yard split", bench: "Bench press", vertical: "Vertical jump", broad: "Broad jump", cone: "3-cone drill", shuttle: "20-yard shuttle" };
const fmtDrill = (v, id) => (!Number.isFinite(v) ? "—" : id === "broad" ? `${Math.floor(v / 12)}'${Math.round(v % 12)}"` : id === "vertical" ? `${v}"` : id === "bench" ? `${v}` : v.toFixed(2));
// Small pixel poster (96×54) for news cards: label strip, big pixel number or a sprite, a name line.
function poster({ kicker, big, name, sub = "", tone = GOLD, sprite = "" }) {
  const g = new PixelGrid(96, 54);
  g.rect(0, 0, 96, 54, "#0b0f18").rect(0, 0, 96, 9, "#141c2c").rect(0, 9, 96, 1, tone);
  const k = glyphText(kicker).trim().slice(0, 23);
  g.text(k, 48 - Math.floor(textWidth(k) / 2), 2, tone);
  if (big) {
    const b = glyphText(big).trim(),
      sc = textWidth(b, 3) <= 90 ? 3 : 2;
    g.text(b, 48 - Math.floor(textWidth(b, sc) / 2) + 1, 15 + 1, "#3a2c18", sc);
    g.text(b, 48 - Math.floor(textWidth(b, sc) / 2), 15, tone, sc);
  }
  const n = glyphText(lastName(name)).trim().slice(0, 22);
  g.text(n, 48 - Math.floor(textWidth(n) / 2), 38, "#ffffff");
  const sb = glyphText(sub).trim().slice(0, 23);
  if (sb) g.text(sb, 48 - Math.floor(textWidth(sb) / 2), 45, "#8f9bb0");
  return `<svg class="cer-poster" viewBox="0 0 96 54" shape-rendering="crispEdges" role="img" aria-label="${esc(kicker + ": " + name)}">${g.rects()}${sprite}</svg>`;
}
function trophySprite() {
  const g = new PixelGrid(24, 26);
  goldTrophy(g, 12, 3);
  return g.outline().svg({ cls: "cer-trophy" });
}
function bar(pct, cells = 10) {
  const n = Math.round(Math.max(0, Math.min(1, pct)) * cells);
  return `<span class="cer-bar" aria-hidden="true">${Array.from({ length: cells }, (_, i) => `<i${i < n ? ' class="on"' : ""}></i>`).join("")}</span>`;
}

export function combineVisual(data = {}, article = null, { compact = false } = {}) {
  const rows = data.rows || data.risers || [],
    top = rows[0];
  if (compact) {
    if (data.kind === "stock") {
      const r = data.risers?.[0] || data.fallers?.[0];
      return r ? `<div class="cer-fv cer-fv-compact">${poster({ kicker: `${data.year} combine risers`, big: `${r.stock > 0 ? "+" : ""}${Number(r.stock).toFixed(1)}`, name: r.name, sub: r.pos, tone: r.stock >= 0 ? "#5fd38a" : "#ff6b6b" })}</div>` : "";
    }
    const drill = data.drill || top?.drill || "forty";
    return top ? `<div class="cer-fv cer-fv-compact">${poster({ kicker: `${data.year} combine · ${drill === "forty" ? "40 yd" : DRILL_LABEL[drill]}`, big: fmtDrill(top.value, drill), name: top.name, sub: top.pos })}</div>` : "";
  }
  if (data.kind === "stock") {
    const list = (arr, up) =>
      (arr || [])
        .map((r) => `<li class="${r.mine ? "mine" : ""}">${pf(r, 28)}<span><b>${esc(r.name)}</b><small>${esc(r.pos)} · score ${Number(r.score ?? 0).toFixed(1)}</small></span><em class="${up ? "up" : "down"}">${up ? "▲" : "▼"} ${Math.abs(r.stock).toFixed(1)}</em></li>`)
        .join("");
    return `<div class="cer-fv cer-board"><div class="cer-board-head"><span>NFL SCOUTING COMBINE ${esc(data.year)}</span><b>Stock watch</b></div><div class="cer-board-cols"><section><h4>Risers</h4><ul>${list(data.risers, true)}</ul></section><section><h4>Fallers</h4><ul>${list(data.fallers, false)}</ul></section></div></div>`;
  }
  const drill = data.drill || "forty",
    vals = rows.map((r) => r.value).filter(Number.isFinite),
    lo = Math.min(...vals),
    hi = Math.max(...vals);
  return `<div class="cer-fv cer-board"><div class="cer-board-head"><span>NFL SCOUTING COMBINE ${esc(data.year)}</span><b>${esc(data.kind === "records" ? "Record watch" : data.kind === "watchlist" ? "Your watchlist" : DRILL_LABEL[drill])}</b></div><ol class="cer-board-rows">${rows
    .slice(0, 6)
    .map((r, i) => {
      const id = r.drill || drill,
        share = hi > lo ? (DRILL_LABEL[id] && ["forty", "split", "cone", "shuttle"].includes(id) ? (hi - r.value) / (hi - lo) : (r.value - lo) / (hi - lo)) : 1;
      return `<li class="${r.mine ? "mine" : ""}"><em>${i + 1}</em>${pf(r, 28)}<span><b>${esc(r.name)}</b><small>${esc(r.pos)}${r.college ? " · " + esc(r.college) : ""}${data.kind === "records" ? " · " + esc(DRILL_LABEL[id]) : ""}</small></span>${bar(0.35 + share * 0.65, 8)}<strong>${esc(fmtDrill(r.value, id))}</strong></li>`;
    })
    .join("")}</ol></div>`;
}

export function hofVisual(data = {}, article = null, { compact = false } = {}) {
  const star = data.inductee || data.rows?.[0];
  if (!star) return "";
  const portrait = (r, size) => `<span class="cer-bust" style="width:${size}px;height:${size}px">${pixelPortrait(r.face, { seed: r.id || r.name, outfit: "suit", colors: { primary: JACKET, secondary: "#fff1b8", dark: "#8a6414" }, label: r.name })}</span>`;
  if (compact) return `<div class="cer-fv cer-fv-compact">${poster({ kicker: data.kind === "finalists" ? `Class of ${data.classYear} finalists` : `Hall of Fame ${data.classYear}`, big: "", name: star.name, sub: `${star.pos}${star.vote ? " · " + star.vote + "%" : ""}`, sprite: `<g transform="translate(34 10) scale(.875)">${pixelPortraitRaw(star)}</g>` })}</div>`;
  const rows = (data.rows || []).slice(0, data.kind === "finalists" ? 8 : 8);
  return `<div class="cer-fv cer-plaque-card"><div class="cer-plaque-main"><span class="cer-plaque-kicker">${data.kind === "finalists" ? "FINALIST" : "CLASS OF " + esc(data.classYear)}</span>${portrait(star, 96)}<b>${esc(star.name)}</b><small>${esc(star.pos)}${star.seasons ? ` · ${star.seasons} seasons` : ""}${star.vote ? ` · ${star.vote}% of the vote` : ""}</small>${star.firstBallot ? '<em class="cer-chip">First ballot</em>' : ""}</div><ul class="cer-plaque-class">${rows.map((r) => `<li>${portrait(r, 32)}<span><b>${esc(r.name)}</b><small>${esc(r.pos)}${r.vote ? ` · ${r.vote}%` : ""}</small></span></li>`).join("")}</ul></div>`;
}
function pixelPortraitRaw(r) {
  const svg = pixelPortrait(r.face, { seed: r.id || r.name, outfit: "suit", colors: { primary: JACKET, secondary: "#fff1b8", dark: "#8a6414" } });
  return svg.replace(/^<svg[^>]*>/, "").replace(/<\/svg>$/, "");
}

export function awardsVisual(data = {}, article = null, { compact = false } = {}) {
  const team = (t) => (Number.isInteger(t) && typeof clubs !== "undefined" && clubs[t] ? clubs[t][0] : "");
  if (data.kind === "allpro") {
    const rows = data.rows || [];
    if (compact) return `<div class="cer-fv cer-fv-compact">${poster({ kicker: `${data.year} All-Pro`, big: String(rows.length), name: "First team", sub: `${rows.filter((r) => r.yours).length} from your club` })}</div>`;
    return `<div class="cer-fv cer-allpro"><div class="cer-board-head"><span>NFL HONORS ${esc(data.year)}</span><b>First-team All-Pro</b></div><ul>${rows.map((r) => `<li class="${r.yours ? "mine" : ""}"><em>${esc(r.pos)}</em>${pf({ id: r.playerId, name: r.name }, 24, r.team)}<b>${esc(r.name)}</b><small>${esc(team(r.team))}</small></li>`).join("")}</ul></div>`;
  }
  const winners = data.kind === "night" ? data.winners || [] : [{ award: data.award, label: data.label, winner: data.winner }];
  const w0 = winners[0]?.winner;
  if (!w0) return "";
  if (compact) return `<div class="cer-fv cer-fv-compact">${poster({ kicker: `${data.year} ${data.kind === "night" ? "NFL Honors" : data.award}`, big: "", name: w0.name, sub: data.kind === "night" ? `${winners.length} awards` : `${w0.points ?? ""} pts`, sprite: `<g transform="translate(36 11)">${trophyRaw()}</g>` })}</div>`;
  return `<div class="cer-fv cer-trophies">${winners
    .slice(0, 8)
    .map((a) => `<article class="cer-trophy-card ${a.winner.yours ? "mine" : ""}"><span class="cer-trophy-art">${trophySprite()}</span>${pf({ id: a.winner.playerId || a.winner.id, name: a.winner.name, face: a.winner.face }, 40, a.winner.team)}<span class="cer-trophy-award">${esc(a.award)}</span><b>${esc(a.winner.name)}</b><small>${esc(team(a.winner.team))}${a.winner.points != null ? ` · ${a.winner.points} pts` : ""}</small></article>`)
    .join("")}</div>`;
}
function trophyRaw() {
  const g = new PixelGrid(24, 26);
  goldTrophy(g, 12, 3);
  return g.outline().rects();
}

export function installFeatureVisuals() {
  if (typeof window === "undefined") return;
  window.GDFeatureVisuals = Object.assign(window.GDFeatureVisuals || {}, { combine: combineVisual, hof: hofVisual, awards: awardsVisual });
}
