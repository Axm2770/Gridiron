import assert from "node:assert/strict";
import {
  defaultCoach,
  validateCoach,
  applyCoach,
  BACKGROUNDS,
  COACH_BUDGET,
} from "./dist/franchise/coach-profile.mjs";
import {
  developWeek,
  ensureDevelopment,
  setDevelopmentPlan,
  offseasonDevelopment,
} from "./dist/franchise/development.mjs";
import {
  effectiveAttributes,
  serializeCareer,
} from "./dist/franchise/ratings.mjs";
import { makePlayer, migrate } from "./dist/franchise/state.mjs";
import {
  createCharacter,
  appearanceFor,
} from "./dist/franchise/character-stage.mjs";
import {
  parseCareerSave,
  saveMetadata,
  careerId,
} from "./dist/franchise/save-store.mjs";
const coach = defaultCoach(16);
assert(validateCoach(coach));
for (const attrs of Object.values(BACKGROUNDS))
  assert.equal(
    Object.values(attrs).reduce((a, b) => a + b, 0),
    COACH_BUDGET,
  );
assert.throws(() => validateCoach({ ...coach, name: "" }), /name/);
assert.throws(() => validateCoach({ ...coach, age: 12 }), /age/);
assert.throws(() => validateCoach({ ...coach, team: 32 }), /franchise/);
assert.throws(
  () =>
    validateCoach({
      ...coach,
      attributes: { ...coach.attributes, development: 25 },
    }),
  /104/,
);
assert.throws(
  () =>
    validateCoach({
      ...coach,
      appearance: { ...coach.appearance, skin: "<script>" },
    }),
  /appearance/,
);
const specimen = () => ({
  ...makePlayer("development-subject", "QB", 771, true),
  age: 22,
  ovr: 70,
  pot: 90,
  morale: 85,
  fitness: 100,
  starter: true,
  persona: { loyalty: 0.9, ambition: 0.9 },
  stats: {
    2026: {
      attempts: 100,
      completions: 75,
      passTD: 8,
      interceptions: 0,
      snaps: 100,
    },
  },
});
const baseContext = {
  year: 2026,
  week: 0,
  roundKey: "2026:season:0:0",
  teamRoster: [],
  coaching: 85,
  facilities: 3,
  medical: 3,
  intensity: 60,
  played: true,
  coachAttributes: {
    development: 18,
    motivation: 17,
    discipline: 14,
    medical: 16,
  },
};
const a = specimen(),
  b = specimen();
assert.deepEqual(developWeek(a, baseContext), developWeek(b, baseContext));
const snapshot = JSON.stringify(a);
assert.equal(developWeek(a, baseContext), null);
assert.equal(
  JSON.stringify(a),
  snapshot,
  "same round cannot grant duplicate growth",
);
assert(a.progression.lastReport.delta > 0);
assert(a.progression.form > 7);
assert(a.progression.training >= 3 && a.progression.training <= 9.8);
const injured = specimen();
injured.injury = 8;
injured.medical = {
  bodyPart: "shoulder",
  diagnosis: "Shoulder surgery",
  weeks: 8,
};
const healthy = specimen();
for (let week = 0; week < 8; week++) {
  const c = { ...baseContext, week, roundKey: "r" + week };
  developWeek(injured, c);
  developWeek(healthy, c);
}
assert(healthy.ratings.development > injured.ratings.development);
assert(injured.ratings.development < 0);
assert.equal(injured.progression.training, null);
assert(injured.ratings.attributeChanges.throwPower < 0);
assert.equal(injured.progression.injuries[0].weeksMissed, 8);
let restored = JSON.parse(JSON.stringify(injured));
developWeek(restored, { ...baseContext, week: 8, roundKey: "r8" });
assert.equal(
  restored.progression.injuries[0].weeksMissed,
  9,
  "injury ledger stays linked after JSON reload",
);
restored.injury = 0;
developWeek(restored, { ...baseContext, week: 9, roundKey: "r9" });
assert(restored.progression.injuries[0].returned);
assert(
  restored.progression.lastReport.reasons.some((r) =>
    r.includes("Return-to-play"),
  ),
);
assert(
  restored.progression.lastReport.delta < healthy.progression.lastReport.delta,
  "rehab ramps workload rather than instant full growth",
);
const older = specimen();
older.age = 40;
developWeek(older, baseContext);
assert(older.progression.lastReport.delta < 0);
const poor = specimen();
poor.morale = 30;
poor.fitness = 45;
poor.progression = ensureDevelopment(poor);
poor.progression.load = "Intensive";
developWeek(poor, { ...baseContext, coaching: 40, facilities: 1 });
assert(poor.progression.lastReport.delta < a.progression.lastReport.delta);
assert(poor.progression.training < a.progression.training);
const noSnaps = specimen();
noSnaps.starter = false;
noSnaps.stats = {};
developWeek(noSnaps, { ...baseContext, played: false });
assert(
  a.progression.lastReport.delta > noSnaps.progression.lastReport.delta,
  "competitive exposure supplements training",
);
assert(
  noSnaps.progression.lastReport.delta > 0,
  "reserves can develop in training",
);
const mentor = { ...specimen(), id: "mentor", age: 32 };
const squad = {
  year: 2026,
  franchise: { role: "HC", debug: false },
  roster: [specimen(), mentor],
};
setDevelopmentPlan(squad, squad.roster[0].id, {
  focus: "DecisionMaking",
  load: "Light",
  mentorId: "mentor",
});
assert.equal(squad.roster[0].progression.mentorId, "mentor");
assert.throws(
  () =>
    setDevelopmentPlan(squad, "missing", { focus: "Balanced", load: "Normal" }),
  /no longer/,
);
assert.throws(
  () =>
    setDevelopmentPlan(squad, squad.roster[0].id, {
      focus: "Invalid",
      load: "Normal",
    }),
  /focus/,
);
assert.throws(
  () =>
    setDevelopmentPlan(squad, squad.roster[0].id, {
      focus: "Balanced",
      load: "Normal",
      mentorId: squad.roster[0].id,
    }),
  /teammate/,
);
squad.franchise.role = "GM";
assert.throws(
  () =>
    setDevelopmentPlan(squad, squad.roster[0].id, {
      focus: "Balanced",
      load: "Normal",
    }),
  /delegates/,
);
const ceiling = specimen();
ceiling.pot = 70;
for (let i = 0; i < 80; i++)
  developWeek(ceiling, { ...baseContext, week: i, roundKey: "ceiling" + i });
assert(ceiling.ovr <= 70);
assert(ceiling.progression.history.length <= 26);
assert(
  effectiveAttributes(injured).throwPower <
    injured.ratings.attributes.throwPower,
);
const before = healthy.ratings.development;
offseasonDevelopment(healthy, 2027, 3);
const after = healthy.ratings.development;
offseasonDevelopment(healthy, 2027, 3);
assert.equal(healthy.ratings.development, after);
assert(
  after - before < 1,
  "offseason does not double-count a full year of weekly growth",
);
const rig = createCharacter(coach.appearance),
  second = createCharacter({
    ...coach.appearance,
    build: "Broad",
    height: 200,
    hairStyle: "Curly",
    outfit: "Suit",
    beard: "Full",
    glasses: true,
  });
assert.equal(rig.arms.length, 2);
assert.equal(rig.legs.length, 2);
assert(rig.head.children.length > 10);
assert(second.group.scale.x > rig.group.scale.x);
for (const model of [rig, second]) {
  model.group.updateMatrixWorld(true);
  let meshes = 0;
  model.group.traverse((n) => {
    if (n.isMesh) {
      meshes++;
      assert(
        !n.material.map,
        "character body must not paste a portrait onto a mesh",
      );
      for (const v of n.geometry.attributes.position.array)
        assert(Number.isFinite(v));
    }
  });
  assert(meshes > 30);
}
assert.deepEqual(
  appearanceFor({ id: "face-one" }),
  appearanceFor({ id: "face-one" }),
);
const save = {
  team: 16,
  year: 2026,
  week: 2,
  phase: "season",
  teams: Array.from({ length: 32 }, () => ({ w: 0, l: 0 })),
  roster: [],
  schedule: [],
  coach: { name: "Ash Carter" },
  franchise: { role: "HC", userCoach: coach },
};
assert.equal(
  parseCareerSave(JSON.stringify(save)).state.coach.name,
  "Ash Carter",
);
assert.equal(
  parseCareerSave(
    JSON.stringify({
      format: "GridironCareer",
      name: "Dallas branch",
      state: save,
    }),
  ).name,
  "Dallas branch",
);
assert.throws(() => parseCareerSave("{"), /readable/);
assert.throws(
  () => parseCareerSave(JSON.stringify({ ...save, team: 100 })),
  /supported/,
);
assert.equal(
  saveMetadata(save, { id: "slot-a", name: "Separate career" }).coach,
  "Ash Carter",
);
assert.equal(new Set(Array.from({ length: 1000 }, careerId)).size, 1000);
console.log(
  "PASS: coach setup/budgets/appearance validation; deterministic weekly training, form, exposure, fatigue, age, injury loss, persisted injury ledger, rehabilitation and bounded growth; mentoring and role guards; offseason idempotency; unified 3D model anatomy and finite geometry; career import metadata and unique save identities.",
);
