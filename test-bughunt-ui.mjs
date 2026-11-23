// Regression checks for interface bugs found while trying to break the game (pure helpers only;
// the browser-driven checks live outside the repository).
import assert from "node:assert/strict";
import { singleFlight } from "./dist/ui/kit.mjs";
import { campOpen, actionMessage } from "./dist/franchise/action-feedback.mjs";

// A double-click on "Sign & begin career" / "Create separate save" runs the action once.
{
  let runs = 0,
    release;
  const slow = singleFlight(async (x) => {
    runs++;
    await new Promise((r) => (release = r));
    return x * 2;
  });
  const first = slow(21),
    second = slow(5);
  assert.equal(await second, undefined, "a call made while the first is running is ignored");
  release();
  assert.equal(await first, 42);
  assert.equal(runs, 1);
  // Once finished it can run again, and an error does not leave it stuck.
  const again = slow(1);
  release();
  assert.equal(await again, 2);
  assert.equal(runs, 2);
  const failing = singleFlight(async () => {
    throw Error("no");
  });
  await assert.rejects(failing(), /no/);
  await assert.rejects(failing(), /no/, "a failed run releases the lock");
}

// Camp invitations: open in the offseason and before our first game, closed once we have played.
{
  const sched = (played) => [[{ a: 3, b: 4, score: played ? [1, 0] : null }], [{ a: 3, b: 5 }]];
  assert.equal(campOpen({ phase: "offseason", team: 3, schedule: sched(true) }), true);
  assert.equal(campOpen({ phase: "season", team: 3, schedule: sched(false) }), true);
  assert.equal(campOpen({ phase: "season", team: 3, schedule: sched(true) }), false);
  assert.equal(campOpen({ phase: "season", team: 9, schedule: sched(true) }), true, "other clubs' results do not count");
  assert.equal(campOpen({ phase: "playoffs", team: 3, schedule: sched(true) }), false);
}

// Roster operations say what happened instead of a generic "Franchise updated".
{
  assert.match(actionMessage("camp", 37), /^37 players invited to camp/);
  assert.match(actionMessage("camp", 0), /already full/);
  assert.match(actionMessage("recruit", 1), /signed 1 player to/);
  assert.match(actionMessage("recruit", 0), /enough healthy depth/);
  assert.equal(actionMessage("something-else"), "Franchise updated");
}

console.log("bughunt-ui ok");
