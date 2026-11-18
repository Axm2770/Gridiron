// Draft room presentation helpers: class grades and pixel faces.
import assert from "node:assert/strict";
import { gradeFor, classGrade, draftClassSummary } from "./dist/franchise/draft-summary.mjs";
import { pixelFace } from "./dist/ui/pixel-face.mjs";

// Grade thresholds match the analyst scale used on the live-draft ticker.
assert.equal(gradeFor(25), "A+");
assert.equal(gradeFor(10), "A");
assert.equal(gradeFor(0), "B");
assert.equal(gradeFor(-20), "D");
assert.equal(gradeFor(-80), "F");
assert.equal(classGrade([]), null);
assert.equal(classGrade(["A", "A", "A"]), "A");
assert.equal(classGrade(["A+", "F"]), "C");

// Value grades compare the slot with the player's ability rank among everyone drafted.
const drafted = [
  { slot: 1, team: 0, id: "a", ovr: 70 },
  { slot: 2, team: 1, id: "b", ovr: 90 },
  { slot: 3, team: 1, id: "c", ovr: 88 },
  { slot: 40, team: 0, id: "d", ovr: 95 },
];
for (let i = 4; i < 40; i++) drafted.push({ slot: i, team: 2, id: "x" + i, ovr: 60 });
const s = draftClassSummary(drafted, 0);
assert.deepEqual(s.picks.map((p) => p.id), ["a", "d"]);
assert.equal(s.picks[1].rank, 1, "the best player in the class ranks first");
assert.equal(s.picks[1].grade, "A+", "a top talent at #40 is a steal");
assert.equal(s.picks[0].grade, "B", "#1 for the fourth-best player is around value");
assert.equal(s.picks[0].source, "value");
// A live-draft analyst grade wins over the value grade, and the source says so.
const live = draftClassSummary(drafted, 0, [{ slot: 1, team: 0, grade: "D" }]);
assert.equal(live.picks[0].grade, "D");
assert.equal(live.picks[0].source, "analyst");
assert.deepEqual(draftClassSummary(drafted, 5), { picks: [], grade: null });

// Pixel faces are crisp-edged sprites, deterministic per player and sized by the caller.
const p = { id: "prospect-2026-4", name: "Jalen <Test>", college: "Iowa" };
const face = pixelFace(p, { size: 40 });
assert.match(face, /class="gd-pixel-face /);
assert.match(face, /--pf-size:40px/);
assert.match(face, /shape-rendering="crispEdges"/);
assert(!face.includes("<Test>"), "labels are escaped");
assert.equal(face, pixelFace(p, { size: 40 }));
assert.notEqual(face, pixelFace({ ...p, id: "prospect-2026-5" }, { size: 40 }));
assert(!/undefined|NaN/.test(pixelFace({}, {})));

console.log("PASS: draft class grades and pixel faces");
