// Tutorials: every tour step opens a real screen, every screen in the sidebar has help, tour
// progress is tracked per device, and the glossary is well formed.
import assert from "node:assert/strict";
import { TOURS, SCREEN_HELP, GLOSSARY } from "./dist/ui/tutorial-content.mjs";
import { NAV_GROUPS, NAV_TOP, ROUTE_ALIASES } from "./dist/franchise/presentation.mjs";

const sidebar = NAV_GROUPS.flatMap((g) => g[1].map((r) => r[0]));
const top = NAV_TOP;
assert.deepEqual([...top].sort(), ["Inbox", "Matchday", "News", "Overview", "Settings"], "top block and Settings");
assert.ok(!sidebar.includes("Careers & saves") && !top.includes("Careers & saves"), "Careers & saves is the career library now, not a screen");
const routes = new Set([...sidebar, ...top, ...Object.keys(ROUTE_ALIASES)]);

assert.ok(TOURS.length >= 6, "tours cover the basics, roster, cap, market, draft and season");
const ids = new Set();
for (const tour of TOURS) {
  assert.ok(!ids.has(tour.id), `tour id ${tour.id} is unique`);
  ids.add(tour.id);
  assert.ok(tour.title && tour.summary && tour.minutes > 0, `${tour.id} has a title, summary and length`);
  assert.ok(tour.steps.length >= 3, `${tour.id} has several steps`);
  for (const [i, step] of tour.steps.entries()) {
    assert.ok(step.title && step.body, `${tour.id}#${i} has text`);
    if (step.route) assert.ok(routes.has(step.route), `${tour.id}#${i} opens a real screen (${step.route})`);
    if (step.target) for (const sel of [].concat(step.target)) assert.equal(typeof sel, "string", `${tour.id}#${i} targets a selector`);
    if (step.prepare) assert.equal(typeof step.prepare, "function");
  }
}
for (const topic of ["basics", "roster", "cap", "market", "draft", "season"]) assert.ok(ids.has(topic), `a ${topic} tour exists`);
assert.equal(TOURS[0].id, "basics", "the first-run tour comes first");

for (const route of [...sidebar, ...top]) assert.ok(SCREEN_HELP[route]?.text, `${route} has screen help`);
for (const [route, help] of Object.entries(SCREEN_HELP)) if (help.tour) assert.ok(ids.has(help.tour), `${route} help links a real tour`);

for (const [term, text] of Object.entries(GLOSSARY)) {
  assert.ok(term.length < 24, `${term} is a short label`);
  assert.ok(text.endsWith("."), `${term} definition is a sentence`);
}

// Progress is stored per device and survives bad data.
const store = new Map();
globalThis.localStorage = { getItem: (k) => store.get(k) ?? null, setItem: (k, v) => store.set(k, String(v)) };
const { loadProgress, tourProgress } = await import("./dist/ui/tutorial.mjs");
assert.deepEqual(loadProgress(), { completed: {}, step: {}, welcomed: false, tips: true }, "new devices start fresh");
store.set("gridiron-tutorials", JSON.stringify({ completed: { basics: "2026-11-17" }, step: { roster: 2 }, welcomed: true }));
const p = tourProgress();
assert.equal(p.find((t) => t.id === "basics").done, true);
assert.equal(p.find((t) => t.id === "roster").reached, 2);
assert.equal(p.find((t) => t.id === "cap").reached, 0);
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
