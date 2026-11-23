// Tutorials: every tour step opens a real screen and targets markup that exists, steps stay short
// and visual, every screen in the sidebar has help, tour progress is tracked per device, and the
// glossary is well formed.
import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { TOURS, SCREEN_HELP, GLOSSARY } from "./dist/ui/tutorial-content.mjs";
import { GUIDE_CHAPTERS } from "./dist/ui/guide-content.mjs";
import { ART_IDS } from "./dist/ui/guide-art.mjs";
import { NAV_GROUPS, NAV_TOP, ROUTE_ALIASES } from "./dist/franchise/presentation.mjs";

const sidebar = NAV_GROUPS.flatMap((g) => g[1].map((r) => r[0]));
const top = NAV_TOP;
assert.deepEqual([...top].sort(), ["Inbox", "Matchday", "News", "Overview", "Settings"], "top block and Settings");
assert.ok(!sidebar.includes("Careers & saves") && !top.includes("Careers & saves"), "Careers & saves is the career library now, not a screen");
const routes = new Set([...sidebar, ...top, ...Object.keys(ROUTE_ALIASES), "Media room", "Conversations", "Career dossier"]);

// Every class and id a tour targets must appear in the game's markup sources, so a renamed class
// fails here instead of leaving a tour step pointing at nothing. (Tutorial.audit() in the browser
// checks that each target is visible on its screen.)
const sources = [];
(function walk(dir) {
  for (const f of readdirSync(dir)) {
    const p = path.join(dir, f);
    if (statSync(p).isDirectory()) {
      if (!/vendor|assets|data|logos/.test(f)) walk(p);
    } else if (/\.(mjs|js|html)$/.test(f) && !/tutorial|guide/.test(f)) sources.push(readFileSync(p, "utf8"));
  }
})("dist");
const markup = sources.join("\n");
const tokens = (sel) => [...sel.matchAll(/[.#]([a-zA-Z][\w-]*)/g)].map((m) => m[1]);

assert.ok(TOURS.length >= 12, "tours cover the core loop and every topic");
const ids = new Set();
for (const tour of TOURS) {
  assert.ok(!ids.has(tour.id), `tour id ${tour.id} is unique`);
  ids.add(tour.id);
  assert.ok(tour.title && tour.summary && tour.minutes > 0, `${tour.id} has a title, summary and length`);
  assert.ok(tour.steps.length >= 3 && tour.steps.length <= 9, `${tour.id} has a handful of steps`);
  assert.ok(tour.steps[0].route, `${tour.id} opens its screen first`);
  for (const [i, step] of tour.steps.entries()) {
    assert.ok(step.title && step.body, `${tour.id}#${i} has text`);
    const sentences = step.body.split(/[.!?](\s|$)/).filter((s) => s && s.trim()).length;
    assert.ok(sentences <= 2 && step.body.length <= 170, `${tour.id}#${i} is one or two short sentences`);
    if (step.route) assert.ok(routes.has(step.route), `${tour.id}#${i} opens a real screen (${step.route})`);
    if (step.target)
      for (const sel of [].concat(step.target)) {
        assert.equal(typeof sel, "string", `${tour.id}#${i} targets a selector`);
        for (const t of tokens(sel)) assert.ok(markup.includes(t), `${tour.id}#${i}: "${t}" (${sel}) exists in the game's markup`);
      }
    if (step.prepare) assert.equal(typeof step.prepare, "function");
    if (step.art) assert.ok(ART_IDS.includes(step.art), `${tour.id}#${i} art ${step.art} exists`);
    if (step.guide) assert.ok(GUIDE_CHAPTERS.some((c) => c.id === step.guide), `${tour.id}#${i} links a real guide chapter`);
  }
  assert.ok(tour.steps.some((s) => s.art), `${tour.id} shows at least one picture`);
}
for (const topic of ["basics", "roster", "gameplan", "matchday", "market", "cap", "draft", "medical", "locker", "board", "season", "news"]) assert.ok(ids.has(topic), `a ${topic} tour exists`);
assert.equal(TOURS[0].id, "basics", "the first-run tour comes first");
// The first week covers the core loop in order.
const loop = TOURS[0].steps.map((s) => s.route).filter(Boolean);
assert.deepEqual(loop, ["Overview", "Inbox", "Roster", "Game plan", "Matchday"], "first week: overview, inbox, lineup, game plan, matchday");

for (const route of [...sidebar, ...top]) assert.ok(SCREEN_HELP[route]?.text, `${route} has screen help`);
for (const [route, help] of Object.entries(SCREEN_HELP)) if (help.tour) assert.ok(ids.has(help.tour), `${route} help links a real tour`);

for (const [term, text] of Object.entries(GLOSSARY)) {
  assert.ok(term.length < 24, `${term} is a short label`);
  assert.ok(text.endsWith("."), `${term} definition is a sentence`);
}

// Progress is stored per device and survives bad data.
const store = new Map();
globalThis.localStorage = { getItem: (k) => store.get(k) ?? null, setItem: (k, v) => store.set(k, String(v)) };
const { loadProgress, tourProgress, chipTour, stepRoute } = await import("./dist/ui/tutorial.mjs");
assert.deepEqual(loadProgress(), { completed: {}, step: {}, welcomed: false, tips: true, hints: true, dismissed: {} }, "new devices start fresh");
store.set("gridiron-tutorials", JSON.stringify({ completed: { basics: "2026-11-17" }, step: { roster: 2 }, welcomed: true }));
const p = tourProgress();
assert.equal(p.find((t) => t.id === "basics").done, true);
assert.equal(p.find((t) => t.id === "roster").reached, 2);
assert.equal(p.find((t) => t.id === "cap").reached, 0);

// "First time here?" chips: only after the welcome, only for untouched tours, never once dismissed.
assert.equal(chipTour("Contracts")?.id, "cap", "an unseen screen offers its tour");
assert.equal(chipTour("Roster"), null, "a started tour is not offered again");
assert.equal(chipTour("Overview"), null, "a finished tour is not offered again");
assert.equal(chipTour("Statistics"), null, "screens without a tour get no chip");
assert.equal(chipTour("Contracts", { ...loadProgress(), welcomed: false }), null, "nothing competes with the welcome");
assert.equal(chipTour("Contracts", { ...loadProgress(), dismissed: { Contracts: 1 } }), null, "a dismissed chip stays hidden");
assert.equal(chipTour("Contracts", { ...loadProgress(), hints: false }), null, "chips can be turned off");
// Steps without a route run on the nearest earlier step's screen, so Back returns there.
const gp = TOURS.find((t) => t.id === "gameplan");
assert.deepEqual(stepRoute(gp, 2), { route: "Game plan", tab: undefined });
store.set("gridiron-tutorials", "{not json");
assert.equal(loadProgress().welcomed, false, "corrupt progress falls back to a fresh start");
console.log("tutorials ok");

// Sidebar pixel glyphs: every grouped entry names a real glyph that fits the 12×12 grid.
const { PIXEL_GLYPHS, pixelPath } = await import("./dist/ui/pixel-icons.mjs");
for (const [, items] of NAV_GROUPS) for (const [route, , glyph] of items) assert.ok(PIXEL_GLYPHS[glyph], `${route} has a pixel glyph`);
for (const [name, rows] of Object.entries(PIXEL_GLYPHS)) {
  assert.ok(rows.length <= 12 && rows.every((r) => r.length <= 12 && /^[.#]*$/.test(r)), `${name} fits the 12×12 grid`);
  assert.match(pixelPath(name), /^(M\d+ \d+h\d+v1h-\d+z)+$/, `${name} renders as pixel runs`);
}
assert.equal(pixelPath("medical").split("M").length - 1, 10, "one run per lit row segment");
console.log("sidebar glyphs ok");
