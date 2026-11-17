// Special-teams units, run schemes and pursuit/tackling in the execution engine.
import assert from "node:assert/strict";
import { simulateExecution, buildActors, interceptPoint, RUN_SCHEMES } from "./dist/engine/execution.mjs";
import { planFootball, footballFrame } from "./dist/football-motion.mjs";

const play = (call, seed, extra = {}) =>
  simulateExecution({
    seed,
    playId: `motion-${call}-${seed}`,
    spot: 20 + (seed % 55),
    call,
    coverage: ["Cover 2", "Cover 3", "Quarters", "Man coverage"][seed % 4],
    formation: ["Shotgun spread", "I formation", "Singleback"][seed % 3],
    ...extra,
  });
const at = (e, time) => e.frames.find((f) => f.time >= time - 1e-6) || e.frames.at(-1);

// Kick units line up like the real thing.
const fg = buildActors(70, {}, {}, "Field goal");
assert.deepEqual(fg.slice(0, 2).map((a) => a.role), ["K", "H"]);
assert.equal(fg[7].role, "LS");
assert.ok(Math.abs(fg[1].x - 63) < 0.01 && Math.abs(fg[1].z) < 0.01, "holder seven yards behind the snap");
const punt = buildActors(30, {}, {}, "Punt");
assert.equal(punt[0].role, "P");
assert.ok(punt[0].x <= 30 - 14, "punter fifteen yards deep");
assert.ok(Math.abs(punt[2].z) > 20 && Math.abs(punt[3].z) > 20 && punt[2].role === "G", "gunners split wide");
assert.ok(punt[21].x > 60, "returner deep");

for (let seed = 0; seed < 30; seed++) {
  const kick = play("Field goal", seed, { spot: 60 + (seed % 25) }),
    snap = kick.events.find((e) => e.type === "Kick");
  assert.ok(snap.time > 1, "the kick follows the snap and hold");
  const hold = at(kick, snap.time - 0.1);
  assert.ok(Math.abs(hold.ball.x - hold.actors[1].x) < 1.2 && hold.ball.y < 0.6, "ball is down at the holder's spot");
  assert.ok(hold.actors[0].x - kick.frames[0].actors[0].x > 1.5, "kicker approaches");
  const p = play("Punt", seed),
    landed = p.events.find((e) => e.type === "Punt"),
    end = at(p, landed.time);
  assert.ok(landed.time - p.events.find((e) => e.type === "Kick").time > 3, "punts have hang time");
  if (end.ball.x < 97) {
    assert.ok(Math.hypot(end.actors[21].x - end.ball.x, end.actors[21].z - end.ball.z) < 2.5, "returner fields the punt");
    assert.ok(Math.min(...[2, 3].map((g) => Math.abs(end.actors[g].x - end.ball.x))) < 12, "gunners arrive in coverage");
  }
}

// Run schemes: every scheme blocks, power and counter pull a guard across the formation.
for (const scheme of RUN_SCHEMES) {
  const gains = [];
  for (let seed = 0; seed < 60; seed++) {
    const e = play(scheme === "Outside zone" ? "Outside run" : "Inside run", seed, { scheme, formation: scheme === "Counter" ? "I formation" : "Singleback" });
    assert.equal(e.scheme, scheme);
    const blocks = e.events.filter((x) => x.type === "BlockEngaged" && x.blockerIndex >= 4 && x.blockerIndex <= 10);
    assert.ok(blocks.length >= 4, `${scheme}: the line engages defenders (${blocks.length})`);
    if (scheme === "Power" || scheme === "Counter") {
      const first = e.frames[0].actors,
        mid = at(e, 0.9).actors,
        pulled = [5, 6, 8, 9].some((i) => Math.abs(mid[i].z - first[i].z) > 3.5 && mid[i].x < e.frames[0].actors[7].x + 1.5);
      assert.ok(pulled, `${scheme}: a lineman pulls behind the line`);
    }
    gains.push(e.result.yards);
  }
  const avg = gains.reduce((a, b) => a + b, 0) / gains.length;
  assert.ok(avg > 1.5 && avg < 9, `${scheme}: average gain ${avg.toFixed(1)}`);
  assert.ok(new Set(gains).size >= 4, `${scheme}: gains vary`);
}
assert.equal(play("Inside run", 1, { scheme: "Counter", formation: "Shotgun spread" }).scheme, "Power", "offset shotgun back runs counter as power");
assert.ok(new Set(Array.from({ length: 40 }, (_, s) => play("Inside run", s).scheme)).size >= 2, "inside runs mix schemes");

// Pursuit angles lead a crossing runner.
const lead = interceptPoint({ x: 0, z: 0 }, { x: 10, z: -10, vx: 0, vz: 7 }, 7.5);
assert.ok(lead.z > -10 + 3, "defender aims ahead of the runner");

// Tackles: contact first, the real tackler is on the runner, and nobody teleports.
let checked = 0;
for (const call of ["Inside run", "Outside run", "Quick pass", "Short pass", "Screen", "Deep pass", "Punt", "Field goal"])
  for (let seed = 0; seed < 50; seed++) {
    const e = play(call, seed);
    for (let k = 1; k < e.frames.length; k++) {
      const a = e.frames[k - 1],
        b = e.frames[k],
        dt = b.time - a.time;
      if (dt <= 0) continue;
      b.actors.forEach((p, i) => {
        const v = Math.hypot(p.x - a.actors[i].x, p.z - a.actors[i].z) / dt;
        assert.ok(v < 11, `${call} seed ${seed}: actor ${i} moved at ${v.toFixed(1)} yd/s at ${b.time}s`);
      });
    }
    const tackle = e.events.find((x) => x.type === "Tackle" && x.tacklerIndex !== undefined);
    if (!tackle) continue;
    const contact = e.events.find((x) => x.type === "Contact");
    assert.ok(contact && contact.tacklerIndex === tackle.tacklerIndex, "the tackle is made by the defender who made contact");
    assert.ok(tackle.time - contact.time >= 0.25, "the runner is wrapped up before he goes down");
    const f = at(e, contact.time),
      r = f.actors[e.result.carrier],
      t = f.actors[contact.tacklerIndex];
    assert.ok(Math.hypot(r.x - t.x, r.z - t.z) < 1.6, "tackler is on the runner at contact");
    const plan = planFootball({ poss: 0, spot: e.result.spot }, {}, { execution: e, call });
    assert.equal(plan.tackler, contact.tacklerIndex, "the 3D plan animates the engine's tackler");
    assert.ok(plan.contactTime < plan.downTime);
    const frame = footballFrame(plan, plan.downTime);
    assert.ok(frame.every((p) => Number.isFinite(p.x + p.z)));
    checked++;
  }
assert.ok(checked > 100, `checked ${checked} tackles`);
assert.deepEqual(play("Power", 7, { call: "Inside run", scheme: "Power" }), play("Power", 7, { call: "Inside run", scheme: "Power" }), "deterministic per seed");
console.log(`PASS: field goal/punt units and coverage, four run schemes with blocks and pulls, pursuit angles, contact-before-tackle and bounded speed over ${checked} tackles`);
