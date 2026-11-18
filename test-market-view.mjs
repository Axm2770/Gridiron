// Market view helpers: paging, asset and free-agent filters, sorting and the deal meter scale,
// plus the pixel face helper used by the market (pure string markup, cached per player).
import assert from "node:assert/strict";
import { pageOf, filterAssets, filterAgents, sortAgents, dealMeter } from "./dist/franchise/market-view.mjs";
import { pixelFace } from "./dist/ui/pixel-face.mjs";

const list = Array.from({ length: 23 }, (_, i) => i);
assert.deepEqual(pageOf(list, 0, 10).items, list.slice(0, 10));
assert.equal(pageOf(list, 2, 10).items.length, 3);
assert.equal(pageOf(list, 9, 10).page, 2, "page clamps to the last page");
assert.equal(pageOf(list, -3, 10).page, 0, "page clamps to the first page");
assert.deepEqual([pageOf(list, 1, 10).from, pageOf(list, 1, 10).to, pageOf(list, 1, 10).pages], [11, 20, 3]);
assert.deepEqual([pageOf([], 0, 10).from, pageOf([], 0, 10).pages], [0, 1], "an empty list is one empty page");

const rows = [
  { kind: "player", id: "a", p: { name: "Al Starter", pos: "QB", starter: true } },
  { kind: "player", id: "b", p: { name: "Bo Backup", pos: "QB", starter: false } },
  { kind: "player", id: "c", p: { name: "Cy Corner", pos: "CB", starter: true } },
  { kind: "pick", id: "pk-1", label: "2027 round 1" },
];
const ids = (r) => r.map((x) => x.id).join(",");
assert.equal(ids(filterAssets(rows)), "a,b,c,pk-1");
assert.equal(ids(filterAssets(rows, { group: "starters" })), "a,c");
assert.equal(ids(filterAssets(rows, { group: "reserves" })), "b");
assert.equal(ids(filterAssets(rows, { group: "picks" })), "pk-1");
assert.equal(ids(filterAssets(rows, { pos: "QB" })), "a,b");
assert.equal(ids(filterAssets(rows, { q: "corner" })), "c", "search matches names case-insensitively");
assert.equal(ids(filterAssets(rows, { q: "round 1" })), "pk-1", "search matches pick labels");

const fa = [
  { p: { name: "Young Gun", pos: "WR", age: 23, salary: 1.2 }, ovr: 70, pot: 82, pull: 1.1 },
  { p: { name: "Prime Time", pos: "CB", age: 27, salary: 8 }, ovr: 78, pot: 79, pull: 0.95 },
  { p: { name: "Old Hand", pos: "WR", age: 33, salary: 3 }, ovr: 74, pot: 74, pull: 1.02 },
];
const names = (r) => r.map((x) => x.p.name).join(",");
assert.equal(names(filterAgents(fa, { pos: "WR" })), "Young Gun,Old Hand");
assert.equal(names(filterAgents(fa, { age: "young" })), "Young Gun");
assert.equal(names(filterAgents(fa, { age: "veteran" })), "Old Hand");
assert.equal(names(filterAgents(fa, { minOvr: 74 })), "Prime Time,Old Hand");
assert.equal(names(filterAgents(fa, { maxAsk: 5 })), "Young Gun,Old Hand");
assert.equal(names(filterAgents(fa, { q: "prime" })), "Prime Time");
assert.equal(names(sortAgents(fa)), "Prime Time,Old Hand,Young Gun", "default sort is OVR, best first");
assert.equal(names(sortAgents(fa, "age", "asc")), "Young Gun,Prime Time,Old Hand");
assert.equal(names(sortAgents(fa, "pot")), "Young Gun,Prime Time,Old Hand");
assert.equal(names(sortAgents(fa, "pull")), "Young Gun,Old Hand,Prime Time");
assert.equal(names(sortAgents(fa, "ask", "asc")), "Young Gun,Old Hand,Prime Time");
assert.equal(fa[0].p.name, "Young Gun", "sorting never mutates the input");

const m = dealMeter(500, { low: 400, high: 600, estimate: 500 });
assert.ok(m.low < m.est && m.est < m.high && m.high < 100, "the ask band sits inside the track with headroom");
assert.equal(m.fill, m.est, "sending exactly the estimate fills to the tick");
assert.equal(dealMeter(5000, { low: 400, high: 600, estimate: 500 }).fill <= 100, true, "fill never overflows");
assert.equal(dealMeter(0, null).fill, 0);

const face = pixelFace({ id: "p1", name: "Test Player", face: { skin: "#dba27b", hair: "#1e1713", style: 1 } }, { size: 40 });
assert.match(face, /^<span class="px-face/);
assert.match(face, /width:40px;height:40px/);
assert.match(face, /<svg width="100%" height="100%" class="px-sprite px-portrait/);
assert.match(face, /shape-rendering="crispEdges"/, "faces are crisp pixel art, not filtered images");
assert.equal(face, pixelFace({ id: "p1", name: "Test Player", face: { skin: "#dba27b" } }, { size: 40 }), "faces are cached per player and colours");
assert.equal(pixelFace(null), "");

console.log("PASS: market view paging, asset and free-agent filters, sorting, deal meter scale and pixel faces.");
