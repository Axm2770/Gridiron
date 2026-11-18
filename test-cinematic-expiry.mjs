// Cutscenes queued during a long simulation expire: a draft-night scene must not play months later.
import assert from "node:assert/strict";
import { isRecent } from "./dist/presentation/cinematics.mjs";

const s = { year: 2027, phase: "season", week: 2, franchise: { calendarSim: { date: "2027-09-20" } } };
assert.equal(isRecent({ date: "2027-09-15" }, s), true, "a moment from this week plays");
assert.equal(isRecent({ date: "2027-04-30" }, s), false, "last April's draft night does not");
const undated = { ...s, franchise: {} };
assert.equal(isRecent({ year: 2027, phase: "season", week: 1 }, undated), true);
assert.equal(isRecent({ year: 2026, phase: "offseason", week: 17 }, undated), false);
console.log("cinematic expiry ok");
