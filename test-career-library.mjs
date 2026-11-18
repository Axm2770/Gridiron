// Career library: permanent delete in the store (with active-career fallback), the career setup
// lock (role/background/archetype fixed after creation; job offers still move you) and the
// pixel coach avatar.
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import { CareerStore } from "./dist/franchise/save-store.mjs";
import * as S from "./dist/franchise/state.mjs";
import * as Staff from "./dist/franchise/staff.mjs";
import * as K from "./dist/franchise/career-systems.mjs";
import * as Jobs from "./dist/franchise/career-jobs.mjs";
import {
  CAREER_SETUP_LOCKED,
  careerSetupLocked,
  updateCareerAppearance,
  defaultCoach,
  applyCoach,
} from "./dist/franchise/coach-profile.mjs";
import {
  coachPixelAvatar,
  coachBadge,
  coachAppearance,
} from "./dist/franchise/coach-avatar.mjs";
const { indexedDB } = await import(
  process.env.FAKE_INDEXEDDB_MODULE || "fake-indexeddb"
);

/* ---------- CareerStore.delete ---------- */
const store = new CareerStore(indexedDB);
await store.open();
const meta = (id, updatedAt, archived = false) => ({
  id,
  name: "Career " + id,
  coach: "Coach " + id,
  team: 16,
  year: 2026,
  week: 0,
  createdAt: 1,
  updatedAt,
  archived,
});
const put = (id, updatedAt, opts, archived) =>
  store.put(id, JSON.stringify({ id }), meta(id, updatedAt, archived), opts);
await put("old", 100);
await put("newer", 300);
await put("archived-latest", 900, {}, true);
await put("active", 500, { active: true });

// Deleting a non-active career leaves the active one alone.
assert.deepEqual(await store.delete("old"), { active: "active" });
assert.equal(await store.get("old"), undefined, "payload removed");
assert.equal(await store.read("metadata", "old"), undefined, "metadata removed");
assert.equal((await store.current()).id, "active");
assert.equal((await store.list()).length, 3);

// Deleting the active career falls back to the most recent non-archived career.
assert.deepEqual(await store.delete("active"), { active: "newer" });
assert.equal(await store.get("active"), undefined);
assert.equal(await store.read("metadata", "active"), undefined);
assert.equal((await store.current()).id, "newer");
assert.deepEqual(
  (await store.list()).map((m) => m.id).sort(),
  ["archived-latest", "newer"],
);

// Archived careers can be deleted too, and never become the active fallback.
assert.deepEqual(await store.delete("newer"), { active: null });
assert.equal(await store.current(), null, "active setting cleared");
assert.equal(await store.read("settings", "active"), undefined);
await store.delete("archived-latest");
assert.equal((await store.list()).length, 0);
await assert.rejects(store.delete("missing"), /not found/);

/* ---------- Career setup lock ---------- */
const context = {
  console,
  Math,
  Date,
  setTimeout() {},
  localStorage: { getItem: () => null, setItem() {} },
  document: {
    getElementById: () => ({ innerHTML: "", style: {}, showModal() {}, close() {} }),
    querySelector: () => ({}),
    querySelectorAll: () => [],
  },
};
context.window = context;
context.addEventListener = () => {};
vm.createContext(context);
vm.runInContext(fs.readFileSync("dist/game.js", "utf8"), context);
vm.runInContext(fs.readFileSync("dist/match.js", "utf8"), context);
function fresh() {
  const s = JSON.parse(vm.runInContext("JSON.stringify(fresh())", context));
  s.coach = { name: "Library QA", style: "Balanced", calling: "Manual" };
  S.migrate(s);
  Staff.ensureStaff(s);
  return s;
}
let s = fresh();
applyCoach(s, { ...defaultCoach(s.team), role: "OC" });
const before = {
  role: s.franchise.role,
  origin: s.franchise.career.origin,
  archetype: s.franchise.career.archetype,
};
assert.equal(careerSetupLocked().message, CAREER_SETUP_LOCKED);
assert.match(CAREER_SETUP_LOCKED, /set when this career began/);
for (const change of [
  { role: "HC" },
  { origin: "Analytics Guru" },
  { background: "Analytics Guru" },
  { archetype: "Cap Strategist" },
  { archetype: "Cap Strategist", avatar: { shirt: "#123456", skin: "#abcdef" } },
])
  assert.throws(() => updateCareerAppearance(s, change), /set when this career began/);
assert.throws(() => updateCareerAppearance(s, { reputation: 99 }), /appearance/);
assert.throws(
  () => updateCareerAppearance(s, { avatar: { shirt: "red", skin: "#abcdef" } }),
  /appearance/,
);
assert.deepEqual(
  {
    role: s.franchise.role,
    origin: s.franchise.career.origin,
    archetype: s.franchise.career.archetype,
  },
  before,
  "rejected changes leave the career untouched",
);
// Appearance stays editable and reaches the 3D coach profile.
updateCareerAppearance(s, { avatar: { shirt: "#123456", skin: "#abcdef" } });
assert.deepEqual(s.franchise.career.avatar, { shirt: "#123456", skin: "#abcdef" });
assert.equal(s.franchise.userCoach.appearance.jacket, "#123456");
assert.equal(s.franchise.userCoach.appearance.skin, "#abcdef");
assert.equal(coachAppearance(s).jacket, "#123456");

// The UI's role action is a hard error and the Coach career card has no role/background pickers.
const ui = fs.readFileSync("dist/franchise/ui.mjs", "utf8");
assert.match(ui, /case "role":\s*\/\/[^\n]*\n\s*throw careerSetupLocked\(\);/);
assert.doesNotMatch(ui, /F\.action\('role'/);
assert.doesNotMatch(ui, /id="career-origin"|id="career-archetype"/);
assert.match(ui, /Chosen when the career began/);

// Accepting a job offer is still how a career changes role.
s.phase = "offseason";
s.franchise.coachReputation.value = 95;
K.generateJobOffers(s);
const job = s.franchise.coachReputation.jobOffers[0];
Jobs.beginJobInterview(s, job.id);
Jobs.answerJobInterview(s, job.id, 0, 1);
Jobs.answerJobInterview(s, job.id, 1, 0);
s = S.transact(s, (q) => Jobs.acceptJob(q, job.id));
assert.equal(s.franchise.role, "HC");
assert.equal(s.team, job.team);
assert.equal(s.franchise.userCoach.role, "HC");

/* ---------- Pixel coach avatar ---------- */
const svg = coachPixelAvatar(
  { skin: "#b77b51", hair: "#24201c", hairStyle: "Curly", beard: "Full", jacket: "#204c68", outfit: "Suit" },
  { label: 'Coach "<x>"' },
);
assert.match(svg, /^<svg class="px-sprite px-portrait coach-pixel-avatar/);
assert.match(svg, /shape-rendering="crispEdges"/);
assert.doesNotMatch(svg, /<x>/, "labels are escaped");
assert.match(coachPixelAvatar(null), /<rect /, "older saves without an appearance still draw");
assert.match(coachPixelAvatar({ skin: "javascript:", jacket: "nope" }), /#b77b51/i, "invalid colours fall back");
const badge = coachBadge("Alex <b>Morgan</b>", null);
assert.match(badge, /coach-badge-initials">A</);
assert.doesNotMatch(badge, /<b>/);
console.log("career library ok");
