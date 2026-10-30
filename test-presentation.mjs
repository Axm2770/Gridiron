import assert from "node:assert/strict";
import fs from "node:fs";
import { timeOfDay, directorShot } from "./dist/presentation/stadium-pro.mjs";
import { bannerFor, fieldPosition, clockText, scorebug } from "./dist/presentation/broadcast-hud.mjs";
import { accentFor, hexToHsl } from "./dist/presentation/theme-motion.mjs";

globalThis.clubs ??= Array.from({ length: 32 }, (_, i) => [`T${i}`, `City ${i}`, `Club${i}`, `Division ${Math.floor(i / 4)}`]);

// Day → dusk → night follows the game clock.
assert.equal(timeOfDay({ quarter: 1 }), "Afternoon");
assert.equal(timeOfDay({ quarter: 3 }), "Dusk");
assert.equal(timeOfDay({ quarter: 4 }), "Night");
assert.equal(timeOfDay({ quarter: 5 }), "Night");

// Director cuts follow the play's phase.
const v = (x, y, z) => ({ x, y, z });
const s = { focus: v(10, 1, 0), ball: { position: v(14, 3, 2) }, players: Array.from({ length: 22 }, (_, i) => ({ group: { position: v(i, 0, 0) } })) };
const pass = { pass: true, release: 0.4, catchTime: 0.65, carrier: 3, duration: 6 };
assert.equal(directorShot(s, null).name, "Establishing");
assert.equal(directorShot(s, { ...pass, elapsed: 1.2 }).name, "Sideline");
assert.equal(directorShot(s, { ...pass, elapsed: 3 }).name, "SkyCam");
assert.equal(directorShot(s, { ...pass, elapsed: 4.5 }).name, "Ground track");
assert.equal(directorShot(s, { ...pass, touchdown: true, elapsed: 5.5 }).name, "End zone hero");
assert.match(directorShot(s, { ...pass, elapsed: 3 }, { replay: true }).name, /Reverse|reverse/);
const run = { pass: false, release: 0, catchTime: 0, carrier: 1, duration: 6, elapsed: 0.6 };
assert.equal(directorShot(s, run).name, "Sideline");
assert.ok(directorShot(s, { ...pass, elapsed: 3 }, { dir: -1 }).pos[0] > directorShot(s, { ...pass, elapsed: 3 }, { dir: 1 }).pos[0], "camera mirrors with possession");

// Banners come from the rules engine's result text.
assert.equal(bannerFor({ last: { text: "DAL: Lamb receives for 34 yards. TOUCHDOWN! Extra point good." } }).label, "TOUCHDOWN");
assert.equal(bannerFor({ last: { text: "KC: INTERCEPTED!" } }).kind, "turnover");
assert.equal(bannerFor({ last: { text: "KC make a 44-yard field goal!" } }).label, "FIELD GOAL");
assert.equal(bannerFor({ last: { text: "KC miss a 52-yard field goal." } }), null);
assert.equal(bannerFor({ last: { text: "DAL: quarterback sacked for 7 yards." } }).label, "SACK");
assert.equal(bannerFor({ last: { text: "DAL: Pollard runs for 4 yards." } }), null);
assert.equal(bannerFor({ last: { text: "DAL: Lamb receives for 27 yards. First down." } }).label, "BIG PLAY");

// Scorebug text.
const m = { a: 0, b: 1, poss: 0, spot: 35, down: 3, toGo: 4, quarter: 2, clock: 125, score: [14, 10] };
assert.equal(fieldPosition(m), "T0 35");
assert.equal(fieldPosition({ ...m, spot: 70 }), "T1 30");
assert.equal(fieldPosition({ ...m, spot: 50 }), "MIDFIELD");
assert.equal(clockText(m), "2:05");
const bug = scorebug(m);
assert.match(bug, /3RD &amp; 4/);
assert.match(bug, /bh-has-ball/);
assert.match(scorebug({ ...m, spot: 95, toGo: 5 }), /&amp; GOAL/);
assert.match(scorebug({ ...m, finished: true }), /FINAL/);
assert.match(scorebug(m, { replay: true }), /REPLAY/);

// Accent colour is always light enough to read on the dark surfaces, even for navy clubs.
for (const hex of ["#17315d", "#0b1320", "#ee631d", "#dbb92a", "#484f59"]) {
  const [, , l] = hexToHsl(hex);
  const accent = accentFor(hex),
    lightness = Number(/(\d+)%\)$/.exec(accent)[1]);
  assert(lightness >= 62 && lightness <= 72, `${hex} → ${accent} (from ${Math.round(l * 100)}%)`);
}

// Wiring: the stadium hook, presentation stylesheet and title screen are in place.
const stadium = fs.readFileSync("dist/stadium.js", "utf8"),
  index = fs.readFileSync("dist/index.html", "utf8");
assert(stadium.includes("window.GridironStadium=") && stadium.includes("presentation/stadium-pro.mjs"));
assert(index.includes("ui/presentation.css") && /<body class="[^"]*\bgd-themed\b/.test(index) && index.includes("gd-wordmark"));
// The pixel theme loads after every other stylesheet and is on before scripts run.
assert(index.indexOf("ui/pixel.css") > index.indexOf("ui/presentation.css") && /<body class="[^"]*\bgd-pixel\b/.test(index));

console.log("PASS: time-of-day lighting, Director camera cuts, broadcast banners and scorebug, club accent contrast and presentation wiring.");
