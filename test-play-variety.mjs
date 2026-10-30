// The same call against the same defense must not resolve to one fixed outcome: live games
// repeated "receives for 16 yards" snap after snap before per-snap variation existed.
import assert from "node:assert/strict";
import { simulateExecution } from "./dist/engine/execution.mjs";

const input = (call, seed) => ({
  seed,
  playId: `variety-${call}-${seed}`,
  spot: 30,
  call,
  coverage: ["Cover 2", "Cover 3", "Quarters", "Man coverage"][seed % 4],
  formation: "Shotgun spread",
});
const outcomes = (call) => Array.from({ length: 80 }, (_, seed) => simulateExecution(input(call, seed)).result);

for (const call of ["Inside run", "Outside run", "Quick pass", "Short pass", "Deep pass", "Play action", "Screen"]) {
  const results = outcomes(call);
  const gains = results.filter((r) => !["incomplete", "interception"].includes(r.kind)).map((r) => r.yards);
  assert.ok(new Set(gains).size >= 5, `${call}: only ${new Set(gains).size} distinct gains across 80 snaps`);
  const mode = Math.max(...Object.values(Object.groupBy(results, (r) => `${r.kind}:${r.yards}`)).map((g) => g.length));
  assert.ok(mode / results.length < 0.6, `${call}: one outcome in ${Math.round((mode / results.length) * 100)}% of snaps`);
}

// Outside runs used to lose two yards almost every time.
const outside = outcomes("Outside run").map((r) => r.yards);
assert.ok(outside.reduce((a, b) => a + b, 0) / outside.length > 0, "outside runs should gain ground on average");

// Play action is its own call, not a copy of the deep pass.
const deep = outcomes("Deep pass").map((r) => `${r.kind}:${r.yards}`),
  fake = outcomes("Play action").map((r) => `${r.kind}:${r.yards}`);
assert.ok(deep.some((d, i) => d !== fake[i]), "play action resolves differently from a deep pass");

// Determinism is kept: a seed still replays exactly.
assert.deepEqual(simulateExecution(input("Short pass", 7)), simulateExecution(input("Short pass", 7)));
console.log("PASS: play calls vary per snap and stay deterministic per seed");
