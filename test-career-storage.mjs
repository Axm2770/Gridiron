import assert from "node:assert/strict";
import { CareerStore } from "./dist/franchise/save-store.mjs";
const { indexedDB } = await import(
  process.env.FAKE_INDEXEDDB_MODULE || "fake-indexeddb"
);
const store = new CareerStore(indexedDB);
await store.open();
const meta = (id, name) => ({
  id,
  name,
  coach: name,
  team: 16,
  year: 2026,
  week: 0,
  createdAt: 1,
  updatedAt: Date.now(),
  archived: false,
});
await store.put(
  "coach-a",
  JSON.stringify({ coach: "A", week: 0 }),
  meta("coach-a", "Coach A"),
  { active: true },
);
await store.put(
  "coach-b",
  JSON.stringify({ coach: "B", week: 0 }),
  meta("coach-b", "Coach B"),
);
assert.equal((await store.current()).id, "coach-a");
assert.equal((await store.list()).length, 2);
await store.put(
  "coach-a",
  JSON.stringify({ coach: "A", week: 4 }),
  meta("coach-a", "Coach A"),
  { active: true },
);
assert.equal(
  JSON.parse((await store.get("coach-b")).payload).week,
  0,
  "saving A must not overwrite B",
);
await store.setActive("coach-b");
assert.equal((await store.current()).id, "coach-b");
await assert.rejects(
  store.put(
    "coach-b",
    "corrupt new payload",
    { ...meta("coach-b", "Coach B"), uncloneable: () => {} },
    { active: true },
  ),
);
await new Promise((resolve) => setTimeout(resolve, 0));
assert.equal(
  JSON.parse((await store.get("coach-b")).payload).week,
  0,
  "a failed metadata write must roll back the payload",
);
await store.archive("coach-a", true);
assert((await store.list()).find((m) => m.id === "coach-a").archived);
assert.equal(
  JSON.parse((await store.get("coach-a")).payload).week,
  4,
  "archive retains the complete save",
);
await store.archive("coach-a", false);
assert(!(await store.list()).find((m) => m.id === "coach-a").archived);
const branch = await store.get("coach-a");
await store.put(
  "coach-c",
  branch.payload,
  meta("coach-c", "Alternate timeline"),
);
await store.put(
  "coach-c",
  JSON.stringify({ coach: "A", week: 12 }),
  meta("coach-c", "Alternate timeline"),
);
assert.equal(
  JSON.parse((await store.get("coach-a")).payload).week,
  4,
  "branched careers evolve independently",
);
store.db.close();
store.db = null;
const reopened = new CareerStore(indexedDB);
await reopened.open();
assert.equal((await reopened.current()).id, "coach-b");
assert.equal((await reopened.list()).length, 3);
assert.equal(JSON.parse((await reopened.get("coach-c")).payload).week, 12);
reopened.db.close();
console.log(
  "PASS: IndexedDB separate coach saves, atomic metadata/payload rollback on failure, active-slot persistence, independent career branches, recoverable archiving and database reopen.",
);
