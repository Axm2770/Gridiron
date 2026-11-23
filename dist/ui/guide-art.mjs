// Pixel illustrations and mini-diagrams for the Gridiron Guide and the guided tours. Pure string
// builders (no DOM), so node can render them for tests. Every picture is an SVG on a small pixel
// grid (crisp edges, tokens for colour) and scales up to its box; a few parts move through CSS
// classes in guide.css (ga-*), which stop under prefers-reduced-motion.
import { fourthChart, CHART_ZONES } from "../franchise/tactics.mjs";

const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);

// Palette characters used by sprites and rects. Fallbacks keep the classic theme readable.
const PAL = {
  a: "var(--gd-accent)",
  g: "var(--gd-good)",
  w: "var(--gd-warn)",
  b: "var(--gd-bad)",
  t: "var(--gd-text)",
  s: "var(--gd-text-2)",
  q: "var(--gd-text-3)",
  d: "var(--gd-border-strong)",
  e: "var(--gd-border)",
  u: "var(--gd-surface-strong)",
  v: "var(--gd-surface)",
  n: "var(--gd-bg-2)",
  k: "var(--px-ink, #05070d)",
  c: "var(--px-chalk, #f4f1de)",
  f: "var(--px-turf-a, #2f8a3c)",
  F: "var(--px-turf-b, #287a34)",
  m: "var(--team, var(--gd-accent))",
  o: "#c98f5a", // skin tone for the tiny people; art-only
  O: "#8a5a34",
  x: "#6b3f1f", // football leather
};
const fill = (c) => PAL[c] || c;

// A sprite: rows of palette characters ("." is transparent), drawn as one path per colour.
export function sprite(rows, x = 0, y = 0, { cls = "", scale = 1 } = {}) {
  const runs = {};
  rows.forEach((row, ry) => {
    for (let rx = 0; rx < row.length; ) {
      const ch = row[rx];
      if (ch === "." || ch === " ") {
        rx++;
        continue;
      }
      let w = 0;
      while (row[rx + w] === ch) w++;
      (runs[ch] ||= []).push(`M${x + rx * scale} ${y + ry * scale}h${w * scale}v${scale}h-${w * scale}z`);
      rx += w;
    }
  });
  const paths = Object.entries(runs)
    .map(([ch, d]) => `<path fill="${fill(ch)}" d="${d.join("")}"/>`)
    .join("");
  return cls ? `<g class="${cls}">${paths}</g>` : paths;
}
const rect = (x, y, w, h, c, extra = "") => `<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="${fill(c)}" ${extra}/>`;
const frame = (x, y, w, h, c = "d", bg = "n") => rect(x, y, w, h, c) + rect(x + 1, y + 1, w - 2, h - 2, bg);
const text = (x, y, str, { size = 5, c = "t", anchor = "start", cls = "" } = {}) =>
  `<text x="${x}" y="${y}" font-size="${size}" fill="${fill(c)}" text-anchor="${anchor}" class="ga-txt ${cls}">${esc(str)}</text>`;
const svg = (w, h, inner, label, cls = "") =>
  `<svg class="ga-svg ${cls}" viewBox="0 0 ${w} ${h}" shape-rendering="crispEdges" role="img" aria-label="${esc(label)}" preserveAspectRatio="xMidYMid meet">${inner}</svg>`;
const turf = (x, y, w, h, stripe = 8) => {
  let out = "";
  for (let i = 0; i * stripe < w; i++) out += rect(x + i * stripe, y, Math.min(stripe, w - i * stripe), h, i % 2 ? "F" : "f");
  return out;
};

// Stands full of fans: a deterministic speckle of team colour, chalk and accent.
const crowd = (x, y, w, h) => {
  let out = "";
  const tones = ["m", "s", "m", "q", "w", "m", "c", "d"];
  for (let r = 0; r < h; r += 3) for (let c = (r / 3) % 2 ? 1 : 0; c < w; c += 3) out += rect(x + c, y + r, 2, 2, tones[(c * 7 + r * 13) % tones.length]);
  return out;
};

/* ------------------------------------------------------------------ shared sprites */
const BALL = ["..xxxx..", ".xxcxxx.", "xxcxcxxx", ".xxxcxx.", "..xxxx.."];
const PERSON = ["..kkk..", ".kooo k", ".kooo..", "..ooo..", ".mmmmm.", "mmmmmmm", "m.mmm.m", "..m.m..", "..k.k.."];
const COACH = ["..kkkk..", ".kkkkkk.", "..oooo..", "..okok..", "..oooo..", ".dddddd.", "ddcccddd", "ddcccddd", "dd.ddd.d", "..d..d..", "..k..k.."];
const TROPHY = ["wwwwwwwwww", "w.wwwwww.w", "w.wwwwww.w", ".wwwwwwww.", "..wwwwww..", "...wwww...", "....ww....", "....ww....", "...wwww...", "..dddddd..", "..dddddd.."];
const ENVELOPE = ["tttttttttttt", "tt........tt", "t.t......t.t", "t..t....t..t", "t...t..t...t", "t....tt....t", "t..........t", "tttttttttttt"];
const MIC = ["..ddd..", ".dsssd.", ".dsssd.", ".dsssd.", ".ddddd.", "d..d..d", ".d.d.d.", "..ddd..", "...d...", ".ddddd."];
const CROSS = ["...bbb...", "...bbb...", "...bbb...", "bbbbbbbbb", "bbbbbbbbb", "bbbbbbbbb", "...bbb...", "...bbb...", "...bbb..."];
const FLOPPY = ["dddddddddd", "dnccccccnd", "dnccccccnd", "dnnnnnnnnd", "dnnnnnnnnd", "dnddddddnd", "dndnnnndnd", "dndnnnndnd", "dddddddddd"];
const CLOUD = ["...ssss.....", "..ssssss.ss.", ".sssssssssss", "ssssssssssss", ".ssssssssss."];
const STAR = ["..w..", ".www.", "wwwww", ".w.w."];
const FACES = {
  happy: [".gggg.", "gkggkg", "gggggg", "gkggkg", "ggkkgg", ".gggg."],
  ok: [".aaaa.", "akaaka", "aaaaaa", "aaaaaa", "akkkka", ".aaaa."],
  meh: [".wwww.", "wkwwkw", "wwwwww", "wwwwww", "wkkkkw", ".wwww."],
  sad: [".bbbb.", "bkbbkb", "bbbbbb", "bbkkbb", "bkbbkb", ".bbbb."],
};

/* ------------------------------------------------------------------------- pictures */
const ART = {
  welcome: () =>
    svg(
      120,
      60,
      rect(0, 0, 120, 22, "u") +
        crowd(0, 3, 120, 17) +
        rect(0, 20, 120, 2, "k") +
        turf(0, 22, 120, 38, 10) +
        rect(0, 22, 120, 1, "c") +
        [10, 30, 50, 70, 90, 110].map((x) => rect(x, 23, 1, 37, "c", 'opacity=".45"')).join("") +
        sprite(["..ww..ww", "..w....w", "..w....w", "..wwwwww", ".....w..", ".....w..", ".....w..", ".....w.."], 100, 20) +
        sprite(COACH, 20, 30, { scale: 2, cls: "ga-bob" }) +
        sprite(BALL, 52, 44, { cls: "ga-spin" }) +
        frame(42, 2, 36, 13, "d", "k") +
        text(60, 11, "YOUR CLUB", { anchor: "middle", c: "a" }),
      "A coach on the field with the goalposts behind him",
    ),

  calendar: () => {
    const days = ["M", "T", "W", "T", "F", "S", "S"];
    let cells = "";
    days.forEach((d, i) => {
      const x = 6 + i * 16;
      cells += frame(x, 14, 14, 22, "e", i === 6 ? "u" : "n") + text(x + 7, 22, d, { anchor: "middle", c: "s" });
    });
    return svg(
      120,
      52,
      text(6, 9, "WEEK 1", { c: "a" }) +
        text(114, 9, "CONTINUE ▸", { anchor: "end", c: "s", size: 4.5 }) +
        cells +
        sprite(BALL, 105, 26) +
        rect(5, 13, 16, 24, "a", 'class="ga-step7" fill-opacity="0" stroke="var(--gd-accent)" stroke-width="1.5"') +
        rect(6, 42, 108, 4, "e") +
        rect(6, 42, 108, 4, "a", 'class="ga-fill"'),
      "A week on the calendar: the marker steps day by day to game day",
    );
  },

  sim: () => {
    const units = [
      ["QB", 8, 6],
      ["OL", 7, 8],
      ["WR", 6, 5],
      ["DEF", 7, 6],
    ];
    let bars = "";
    units.forEach(([u, a, b], i) => {
      const y = 22 + i * 8;
      bars += text(60, y + 4.5, u, { anchor: "middle", c: "s", size: 4.5 });
      for (let k = 0; k < 10; k++) {
        bars += rect(50 - (k + 1) * 4, y, 3, 5, k < a ? "m" : "e");
        bars += rect(70 + k * 4, y, 3, 5, k < b ? "d" : "e");
      }
    });
    return svg(
      120,
      58,
      frame(34, 2, 52, 16, "d", "k") +
        text(46, 13, "24", { anchor: "middle", c: "a", size: 8 }) +
        text(60, 12, "Q4", { anchor: "middle", c: "s", size: 4 }) +
        text(74, 13, "17", { anchor: "middle", c: "t", size: 8 }) +
        bars,
      "Two teams' unit ratings side by side, feeding the scoreboard",
    );
  },

  depth: () => {
    const tok = (x, y, label, ovr, c, cls) =>
      `<g class="${cls}">${rect(x, y, 26, 12, "k")}${rect(x + 1, y + 1, 24, 10, c)}${text(x + 13, y + 8.4, label + " " + ovr, { anchor: "middle", c: "k", size: 5 })}</g>`;
    return svg(
      120,
      62,
      turf(0, 0, 120, 34, 12) +
        rect(0, 26, 120, 1, "c", 'opacity=".6"') +
        [14, 30, 46, 62, 78].map((x) => rect(x, 18, 10, 6, "s")).join("") +
        rect(92, 14, 10, 6, "s") +
        frame(4, 36, 112, 24, "d", "n") +
        text(8, 57.5, "STARTER", { c: "q", size: 4.4 }) +
        text(112, 57.5, "BENCH", { anchor: "end", c: "q", size: 4.4 }) +
        tok(10, 8, "WR", "72", "w", "ga-swap-a") +
        tok(70, 39, "WR", "81", "g", "ga-swap-b") +
        text(56, 49, "⇄", { anchor: "middle", c: "a", size: 7 }),
      "Depth chart swap: a stronger bench receiver trades places with the starter",
    );
  },

  tactics: () => {
    const O = (x, y) => rect(x, y, 4, 4, "c");
    const X = (x, y) => sprite(["b.b", ".b.", "b.b"], x, y);
    return svg(
      120,
      60,
      turf(0, 0, 120, 60, 12) +
        rect(0, 38, 120, 1, "c") +
        `<g class="ga-pulse">${rect(4, 2, 36, 18, "a", 'fill-opacity=".18"')}${rect(42, 2, 36, 18, "a", 'fill-opacity=".1"')}${rect(80, 2, 36, 18, "a", 'fill-opacity=".18"')}</g>` +
        text(22, 12, "DEEP 1/3", { anchor: "middle", c: "c", size: 4.4 }) +
        text(60, 12, "DEEP 1/3", { anchor: "middle", c: "c", size: 4.4 }) +
        text(98, 12, "DEEP 1/3", { anchor: "middle", c: "c", size: 4.4 }) +
        [44, 50, 56, 62, 68].map((x) => O(x, 40)).join("") +
        O(56, 48) +
        O(56, 54) +
        O(8, 40) +
        O(108, 40) +
        O(84, 42) +
        [46, 54, 62, 70].map((x) => X(x, 34)).join("") +
        X(40, 26) +
        X(58, 26) +
        X(76, 26) +
        X(10, 30) +
        X(106, 30) +
        sprite(["a....", "a....", "a....", "a....", "a....", "aaaaa", "....a"], 10, 22, { cls: "ga-blink" }) +
        sprite(["....a", "....a", "....a", "....a", "...aa", "..a..", ".a...", "a...."], 104, 18, { cls: "ga-blink" }),
      "A shotgun formation against Cover 3: three deep zones, two receivers running routes",
    );
  },

  fourth: () => {
    const chart = fourthChart("Aggressive"),
      tone = { Go: "g", "Field goal": "w", Punt: "e" },
      cw = 13,
      ch = 8,
      ox = 18,
      oy = 10;
    let cells = "";
    CHART_ZONES.forEach((z, c) => (cells += text(ox + c * cw + cw / 2, oy - 2.5, ["OWN", "OWN", "MID", "OPP", "OPP", "OPP", "OPP"][c], { anchor: "middle", c: "q", size: 4 })));
    chart.forEach((row, r) => {
      cells += text(ox - 2, oy + r * ch + 5.6, row.label, { anchor: "end", c: "s", size: 4.5 });
      row.cells.forEach((d, c) => {
        cells += rect(ox + c * cw, oy + r * ch, cw - 1, ch - 1, tone[d] || "e");
        cells += text(ox + c * cw + (cw - 1) / 2, oy + r * ch + 5.6, d === "Go" ? "GO" : d === "Punt" ? "P" : "FG", { anchor: "middle", c: d === "Punt" ? "s" : "k", size: 4.4 });
      });
    });
    return svg(120, 58, cells + text(ox, 56, "→ toward their end zone", { c: "q", size: 4.4 }), "The aggressive fourth-down chart: go for it on short yardage, kick in range, punt deep in your own end");
  },

  cap: () => {
    let blocks = "";
    for (let i = 0; i < 28; i++) {
      const kind = i < 21 ? "d" : i < 23 ? "b" : "g";
      blocks += `<rect class="ga-pop" style="--i:${i}" x="${4 + i * 4}" y="14" width="3" height="14" fill="${fill(kind)}" ${kind === "g" ? 'fill-opacity=".55"' : ""}/>`;
    }
    return svg(
      120,
      48,
      text(4, 9, "SALARY CAP $255M", { c: "a" }) +
        rect(3, 13, 113, 16, "e") +
        rect(4, 14, 111, 14, "k") +
        blocks +
        rect(4, 34, 4, 4, "d") +
        text(10, 38, "Contracts", { c: "s", size: 4.6 }) +
        rect(48, 34, 4, 4, "b") +
        text(54, 38, "Dead", { c: "s", size: 4.6 }) +
        rect(76, 34, 4, 4, "g") +
        text(82, 38, "Cap room", { c: "s", size: 4.6 }),
      "The cap bar: live contracts, dead money and the room left under the cap",
    );
  },

  capdeal: () => {
    let cols = "";
    for (let y = 0; y < 4; y++) {
      const x = 8 + y * 20;
      cols += rect(x, 12, 14, 21, "d") + rect(x, 6, 14, 6, "a") + text(x + 7, 39, `Y${y + 1}`, { anchor: "middle", c: "s", size: 4 }) + text(x + 7, 4.5, "$10M", { anchor: "middle", c: "t", size: 4.5 });
    }
    return svg(
      120,
      50,
      cols +
        rect(86, 8, 4, 4, "a") +
        text(92, 11.5, "Bonus $3M", { c: "s", size: 4.5 }) +
        rect(86, 16, 4, 4, "d") +
        text(92, 19.5, "Salary $7M", { c: "s", size: 4.5 }) +
        `<g class="ga-blink">${rect(28, 43, 54, 6, "b")}${text(55, 47.6, "CUT → $9M DEAD", { anchor: "middle", c: "k", size: 4.5 })}</g>`,
      "A four-year deal: $7M salary plus $3M of bonus each year; cutting him before year two leaves $9M of dead money",
    );
  },

  trade: () =>
    svg(
      120,
      52,
      frame(2, 8, 30, 30, "d", "u") +
        rect(9, 13, 16, 12, "m") +
        text(17, 33, "YOU", { anchor: "middle", c: "t", size: 4.5 }) +
        frame(88, 8, 30, 30, "d", "u") +
        rect(95, 13, 16, 12, "s") +
        text(103, 33, "THEM", { anchor: "middle", c: "t", size: 4.5 }) +
        rect(34, 22, 52, 1, "e") +
        `<g class="ga-flow-r">${frame(36, 12, 14, 18, "k", "c")}${rect(39, 15, 8, 5, "m")}${text(43, 26.5, "WR", { anchor: "middle", c: "k", size: 4.4 })}</g>` +
        `<g class="ga-flow-l">${frame(70, 16, 14, 10, "k", "w")}${text(77, 22.8, "R2", { anchor: "middle", c: "k", size: 4.5 })}</g>` +
        text(60, 45, "VALUE", { anchor: "middle", c: "q", size: 4.5 }) +
        rect(34, 47, 52, 4, "e") +
        rect(34, 47, 30, 4, "g", 'class="ga-fill"'),
      "A trade: your receiver goes one way, their second-round pick comes back, and a meter weighs the value",
    ),

  fog: () =>
    svg(
      120,
      46,
      text(4, 8, "SCOUTED OVR", { c: "a" }) +
        rect(4, 18, 112, 6, "e") +
        `<g class="ga-narrow">${rect(30, 15, 50, 12, "w", 'fill-opacity=".35"')}${rect(30, 15, 2, 12, "w")}${rect(78, 15, 2, 12, "w")}</g>` +
        rect(54, 14, 2, 14, "t") +
        text(4, 34, "40", { c: "q", size: 4 }) +
        text(116, 34, "99", { anchor: "end", c: "q", size: 4 }) +
        text(60, 42, "each report narrows the range", { anchor: "middle", c: "s", size: 4 }),
      "A rating range that narrows as scouting confidence rises",
    ),

  combine: () => {
    let lanes = "";
    for (let i = 0; i < 3; i++) lanes += rect(0, 12 + i * 11, 120, 1, "c", 'opacity=".5"');
    return svg(
      120,
      50,
      rect(0, 10, 120, 36, "O") +
        lanes +
        rect(108, 10, 2, 36, "c") +
        `<g class="ga-run">${sprite(PERSON, 4, 24)}</g>` +
        frame(78, 0, 40, 10, "d", "k") +
        text(98, 7.5, "4.42s", { anchor: "middle", c: "a", size: 5 }) +
        text(4, 7, "40-YARD DASH", { c: "s", size: 4 }),
      "A prospect sprinting the 40-yard dash at the combine",
    );
  },

  morale: () => bands([["Happy", 75, "g", FACES.happy], ["Content", 60, "a", FACES.ok], ["Unsettled", 45, "w", FACES.meh], ["Unhappy", 0, "b", FACES.sad]], "MORALE", "Morale bands from happy to unhappy"),
  board: () => bands([["Secure", 80, "g"], ["Stable", 60, "a"], ["Pressure", 40, "w"], ["Hot seat", 0, "b"]], "JOB SECURITY", "Job security bands from secure to the hot seat"),

  staff: () => {
    const box = (x, y, w, label, c = "d") => frame(x, y, w, 10, c, "u") + text(x + w / 2, y + 7, label, { anchor: "middle", c: "t", size: 4 });
    return svg(
      120,
      52,
      box(46, 2, 28, "HC", "a") +
        rect(59, 12, 2, 4, "d") +
        rect(19, 16, 82, 1, "d") +
        [19, 59, 100].map((x) => rect(x, 16, 2, 4, "d")).join("") +
        box(6, 20, 28, "OC") +
        box(46, 20, 28, "DC") +
        box(87, 20, 28, "ST") +
        ["QB", "RB", "WR", "OL", "DL", "LB", "DB", "MED"].map((l, i) => box(2 + i * 14.5, 38, 13, l, "e")).join(""),
      "The coaching tree: head coach, three coordinators and the position coaches",
    );
  },

  trophy: () =>
    svg(
      120,
      52,
      sprite(TROPHY, 14, 6, { scale: 3 }) +
        frame(58, 8, 56, 36, "w", "n") +
        text(86, 18, "HALL OF FAME", { anchor: "middle", c: "w", size: 4.5 }) +
        rect(64, 22, 44, 1, "e") +
        text(86, 30, "CLASS OF 2031", { anchor: "middle", c: "s", size: 4 }) +
        sprite(STAR, 66, 34, { cls: "ga-blink" }) +
        sprite(STAR, 84, 34) +
        sprite(STAR, 102, 34, { cls: "ga-blink" }),
      "A championship trophy beside a Hall of Fame plaque",
    ),

  update: () => {
    const steps = ["SAVE", "GET", "CHECK", "SET", "GO"];
    let out = "";
    steps.forEach((s, i) => {
      const x = 4 + i * 23;
      out += frame(x, 10, 20, 14, "d", "u") + text(x + 10, 19, s, { anchor: "middle", c: "t", size: 4 });
      if (i < 4) out += text(x + 21.5, 19, "›", { anchor: "middle", c: "a", size: 5 });
    });
    return svg(120, 40, text(4, 6, "AUTO-UPDATE", { c: "a", size: 4.5 }) + out + rect(4, 30, 112, 5, "e") + rect(4, 30, 112, 5, "g", 'class="ga-fill"'), "The update steps: save, download, verify, install and restart");
  },

  saves: () =>
    svg(
      120,
      46,
      sprite(FLOPPY, 6, 8, { scale: 3 }) +
        [0, 1, 2].map((i) => frame(46 + i * 4, 6 + i * 6, 64, 14, i === 2 ? "a" : "d", "u")).join("") +
        text(80, 35.5, "Career saved", { anchor: "middle", c: "t", size: 4.5 }) +
        text(80, 42, "on this device", { anchor: "middle", c: "s", size: 4 }),
      "A save disk beside a stack of careers in the library",
    ),

  age: () => {
    const h = [10, 16, 22, 27, 30, 32, 33, 33, 32, 29, 24, 18, 12];
    let cols = "";
    h.forEach((v, i) => (cols += rect(8 + i * 8, 40 - v, 7, v, i < 5 ? "g" : i < 9 ? "a" : "b")));
    return svg(
      120,
      52,
      cols +
        rect(6, 40, 108, 1, "d") +
        text(8, 47, "21", { c: "q", size: 4 }) +
        text(60, 47, "PEAK", { anchor: "middle", c: "a", size: 4 }) +
        text(112, 47, "35", { anchor: "end", c: "q", size: 4 }) +
        text(8, 6, "GROW", { c: "g", size: 4 }) +
        text(112, 6, "DECLINE", { anchor: "end", c: "b", size: 4 }),
      "An age curve: players grow into their mid-twenties, peak, then decline",
    );
  },

  inbox: () =>
    svg(
      120,
      50,
      sprite(ENVELOPE, 6, 12, { scale: 2, cls: "ga-bob" }) +
        frame(40, 4, 76, 42, "w", "u") +
        text(44, 12, "DECISION", { c: "w", size: 4 }) +
        text(44, 19, "Set the tone", { c: "t", size: 4.5 }) +
        frame(44, 24, 32, 9, "a", "a") +
        text(60, 30, "Option A", { anchor: "middle", c: "k", size: 4.6 }) +
        frame(78, 24, 32, 9, "d", "n") +
        text(94, 30, "Option B", { anchor: "middle", c: "s", size: 4.6 }) +
        text(44, 41, "Due in 2 rounds", { c: "q", size: 4.6 }),
      "An inbox decision card with answer buttons and a due date",
    ),

  matchday: () =>
    svg(
      120,
      52,
      turf(0, 30, 120, 22, 10) +
        frame(20, 2, 80, 24, "d", "k") +
        text(34, 15, "21", { anchor: "middle", c: "a", size: 9 }) +
        text(86, 15, "17", { anchor: "middle", c: "t", size: 9 }) +
        text(60, 11, "Q4", { anchor: "middle", c: "s", size: 4 }) +
        text(60, 18, "2:00", { anchor: "middle", c: "w", size: 4.5, cls: "ga-blink" }) +
        text(60, 23.5, "3RD & 4", { anchor: "middle", c: "q", size: 4.4 }) +
        sprite(COACH, 8, 30) +
        sprite(BALL, 70, 42),
      "A matchday scoreboard late in the fourth quarter",
    ),

  weather: () =>
    svg(
      120,
      46,
      sprite(CLOUD, 6, 6, { scale: 2 }) +
        `<g class="ga-rain">${[10, 16, 22, 28].map((x) => rect(x, 20, 1, 4, "a")).join("")}</g>` +
        `<g class="ga-wind">${rect(42, 12, 20, 1, "s")}${rect(46, 18, 26, 1, "s")}${rect(40, 24, 16, 1, "s")}</g>` +
        sprite(["....dddd....", "..dd....dd..", ".d........d.", "d..........d", "dddddddddddd"], 84, 10, { scale: 2 }) +
        text(18, 38, "Rain", { anchor: "middle", c: "s", size: 4 }) +
        text(52, 38, "Wind", { anchor: "middle", c: "s", size: 4 }) +
        text(96, 38, "Dome", { anchor: "middle", c: "s", size: 4 }),
      "Weather: rain, wind, and a dome that shuts both out",
    ),

  injury: () => {
    let weeks = "";
    for (let i = 0; i < 6; i++) weeks += rect(44 + i * 12, 22, 10, 8, i < 4 ? "b" : "e");
    return svg(
      120,
      44,
      sprite(CROSS, 8, 8, { scale: 3 }) + text(44, 15, "OUT 4 WEEKS", { c: "t", size: 4.5 }) + weeks + text(44, 38, "IR: 4 weeks minimum", { c: "s", size: 4 }),
      "An injury report: a red cross and the weeks out",
    );
  },

  press: () =>
    svg(
      120,
      48,
      sprite(MIC, 10, 10, { scale: 3 }) +
        [
          ["Humble", "g", 6],
          ["Confident", "a", 17],
          ["Defiant", "w", 28],
          ["Deflect", "d", 39],
        ]
          .map(([l, c, y]) => frame(44, y - 4, 70, 9, c, "u") + text(48, y + 2, l, { c: "t", size: 4 }))
          .join(""),
      "A press conference microphone and the four answer tones",
    ),

  sidebar: () =>
    svg(
      120,
      52,
      frame(2, 2, 40, 48, "d", "u") +
        ["", "", "", "", ""].map((_, i) => rect(7, 8 + i * 8, i === 1 ? 30 : 26, 4, i === 1 ? "a" : "e")).join("") +
        frame(46, 2, 72, 48, "e", "n") +
        rect(50, 7, 30, 4, "t") +
        rect(50, 15, 64, 12, "v") +
        rect(50, 30, 30, 16, "v") +
        rect(84, 30, 30, 16, "v"),
      "The sidebar on the left and the current screen on the right",
    ),
};

function bands(list, title, label) {
  let out = text(4, 7, title, { c: "a", size: 4.5 });
  list.forEach(([name, min, c, face], i) => {
    const x = 4 + i * 29;
    out += rect(x, 12, 27, 8, c) + text(x + 13.5, 30, name, { anchor: "middle", c: "t", size: 4 }) + text(x + 13.5, 37, min ? `${min}+` : `< ${list[i - 1]?.[1] ?? 0}`, { anchor: "middle", c: "q", size: 4.5 });
    if (face) out += sprite(face, x + 10.5, 40);
  });
  out += sprite(["aaaaa", ".aaa.", "..a.."], 24, 6, { cls: "ga-slide" });
  return svg(120, list[0][3] ? 48 : 42, out, label);
}

export const ART_IDS = Object.keys(ART);
// The picture for an id, or "" for an unknown id (content can name art the build no longer has).
export function art(id, { cls = "" } = {}) {
  const fn = ART[id];
  if (!fn) return "";
  return `<span class="ga ${cls}" data-art="${esc(id)}">${fn()}</span>`;
}
