// The Gridiron Guide: every chapter is complete (picture, 3–6 key points, tips, a working "Where to
// find it"), every picture renders, search finds things, the repository doc is in sync with the
// in-game content, and the numbers the guide quotes still match the rules in the code.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { GUIDE_CHAPTERS, ROUTE_CHAPTER, searchGuide, guideMarkdown } from "./dist/ui/guide-content.mjs";
import { art, ART_IDS, sprite } from "./dist/ui/guide-art.mjs";
import { PIXEL_GLYPHS } from "./dist/ui/pixel-icons.mjs";
import { NAV_GROUPS, NAV_TOP, ROUTE_ALIASES, ROUTE_ACTIONS } from "./dist/franchise/presentation.mjs";
import { playerGuide } from "./scripts/build-player-guide.mjs";

const sidebar = NAV_GROUPS.flatMap((g) => g[1].map((r) => r[0]));
const routes = new Set([...sidebar, ...NAV_TOP, ...Object.keys(ROUTE_ALIASES), ...Object.keys(ROUTE_ACTIONS), "Media room"]);
const TABS = { Calendar: ["Fixtures", "Head-to-head", "Calendar"], Records: ["Champions", "Record book", "Hall of Fame", "Awards"] };

assert.equal(GUIDE_CHAPTERS.length, 12, "twelve chapters");
const ids = new Set();
for (const c of GUIDE_CHAPTERS) {
  assert.ok(!ids.has(c.id), `${c.id} is unique`);
  ids.add(c.id);
  assert.ok(c.title && c.short && c.short.length <= 24 && c.lead, `${c.id} has a title, a short rail label and a lead`);
  assert.ok(PIXEL_GLYPHS[c.glyph], `${c.id} has a pixel glyph`);
  assert.ok(ART_IDS.includes(c.hero.art) && c.hero.alt, `${c.id} has a hero picture with alt text`);
  assert.ok(c.points.length >= 3 && c.points.length <= 6, `${c.id} has 3–6 key points`);
  for (const p of c.points) {
    assert.ok(p.title && p.text && p.text.endsWith("."), `${c.id}: "${p.title}" is a full sentence`);
    assert.ok(p.text.length <= 330, `${c.id}: "${p.title}" stays card-sized`);
    if (p.art) assert.ok(ART_IDS.includes(p.art), `${c.id}: ${p.art} exists`);
  }
  assert.ok(c.tips.length >= 1, `${c.id} has pro tips`);
  assert.ok(c.where.length >= 1, `${c.id} has a Where to find it button`);
  for (const w of c.where) {
    assert.ok(routes.has(w.route), `${c.id}: where-to-find route ${w.route} exists`);
    if (w.tab) assert.ok(TABS[w.route]?.includes(w.tab), `${c.id}: tab ${w.tab} exists on ${w.route}`);
    if (w.then) assert.ok(Array.isArray(w.then) && w.then.length >= 2, `${c.id}: sub-tab switch is [object, method, ...args]`);
  }
  assert.ok(c.keywords, `${c.id} has search keywords`);
}
for (const route of [...sidebar, ...NAV_TOP]) assert.ok(ids.has(ROUTE_CHAPTER[route]) || ROUTE_CHAPTER[route] === undefined, `${route} maps to a real chapter`);
for (const route of sidebar) assert.ok(ROUTE_CHAPTER[route], `${route} has a guide chapter for the ? button`);

// Pictures: every id renders an accessible, crisp SVG with no stray NaN coordinates.
for (const id of ART_IDS) {
  const html = art(id);
  assert.match(html, /<svg class="ga-svg[^"]*" viewBox="0 0 \d+ \d+" shape-rendering="crispEdges" role="img" aria-label="[^"]+"/, `${id} is an SVG with a label`);
  assert.ok(!/NaN|undefined/.test(html), `${id} has no broken values`);
}
assert.equal(art("nope"), "", "unknown pictures render nothing");
assert.equal(sprite(["a.a"], 0, 0), '<path fill="var(--gd-accent)" d="M0 0h1v1h-1zM2 0h1v1h-1z"/>', "sprites draw one path per colour");

// Search: every word must match; results point at the matching cards.
assert.equal(searchGuide("").length, 12, "an empty search lists every chapter");
const dead = searchGuide("dead money");
assert.ok(dead.some((r) => r.chapter.id === "cap" && r.points.length), "dead money finds the cap chapter's cards");
assert.ok(searchGuide("combine")[0].chapter.id === "draft", "combine finds the draft chapter first");
assert.equal(searchGuide("zzzz qqq").length, 0, "nonsense finds nothing");

// The repository doc is generated from the same content.
const doc = readFileSync("docs/player-guide.md", "utf8").replace(/\r\n/g, "\n");
assert.equal(doc, playerGuide(), "docs/player-guide.md is up to date (node scripts/build-player-guide.mjs)");
assert.ok(guideMarkdown().includes("## The salary cap") && doc.includes("**Where to find it:** Tactics"), "doc has chapters and sidebar labels");

// The rules quoted in the guide match the code they describe.
const text = GUIDE_CHAPTERS.flatMap((c) => [c.lead, ...c.points.map((p) => p.text), ...c.tips]).join(" ");
const src = (f) => readFileSync(f, "utf8");
const state = src("dist/franchise/state.mjs");
assert.match(state, /cap: 255 \* MILLION/);
assert.ok(text.includes("$255M"), "cap amount");
for (const [rule, phrase] of [["active: 53", "53 active players"], ["preseason: 90", "90 in the offseason"], ["practice: 16", "16 on the practice squad"], ["elevations: 2", "two practice-squad elevations"], ["irWeeks: 4", "at least four weeks"], ["regularGames: 17", "17 games over 18 weeks"]])
  assert.ok(state.includes(rule) && text.includes(phrase), `${rule} ↔ "${phrase}"`);
const scouting = src("dist/franchise/scouting.mjs");
assert.ok(/REPORT_DAYS = 3/.test(scouting) && /REPORT_GAIN = 35/.test(scouting) && text.includes("takes three days and adds 35 confidence"), "scouting reports");
assert.ok(/COMBINE_CONFIDENCE = 90/.test(scouting) && text.includes("90% confidence"), "combine confidence");
const { MOOD_BANDS } = await import("./dist/franchise/locker-room.mjs");
assert.deepEqual(MOOD_BANDS.map(([m, l]) => [m, l]), [[75, "Happy"], [60, "Content"], [45, "Unsettled"], [0, "Unhappy"]]);
assert.ok(text.includes("Happy at 75+, Content 60+, Unsettled 45+"), "mood bands");
const board = src("dist/franchise/boardroom.mjs");
assert.ok(/security >= 80\s*\? "Secure"/.test(board) && text.includes("Secure 80+, Stable 60+, Under pressure 40+, Hot seat below 40"), "job security bands");
const dev = src("dist/franchise/development.mjs");
for (const [pos, age] of [["QB", 29], ["RB", 25], ["CB", 26], ["K", 32]]) assert.match(dev, new RegExp(`${pos}: ${age},`), `${pos} peaks at ${age}`);
const { fourthChart } = await import("./dist/franchise/tactics.mjs");
assert.equal(fourthChart("Aggressive")[0].cells[1], "Go", "aggressive goes for it on 4th & 1 from your own 30–44");
assert.ok(!fourthChart("Balanced").some((r) => r.cells.includes("Go")), "balanced never goes for it outside the trailing-late rule");
console.log("guide ok");
