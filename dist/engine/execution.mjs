import { effectiveAttributes } from "../franchise/ratings.mjs";
import { random, clamp, distance } from "./random.mjs";
export const TICK_RATE = 20;
const slots = [
  "QB",
  "RB",
  "WR",
  "WR",
  "TE",
  "OL",
  "OL",
  "OL",
  "OL",
  "OL",
  "WR",
  "DL",
  "DL",
  "DL",
  "DL",
  "LB",
  "LB",
  "LB",
  "CB",
  "CB",
  "S",
  "S",
];
const zOff = [0, 5, -20, 20, 11, -4, -2, 0, 2, 4, -11],
  zDef = [-5, -2, 2, 5, -10, 0, 10, -20, 20, -9, 9];
export function buildActors(
  spot,
  offenseGroups = {},
  defenders = {},
  formation = "Shotgun spread",
  personnel = "11",
  front = "Nickel",
  shell = "2-High",
) {
  const assigned = [new Set(), new Set()];
  return slots.map((baseRole, i) => {
    let role = baseRole;
    if (i === 10 && personnel === "12") role = "TE";
    if (i === 10 && personnel === "21") role = "RB";
    if (i === 4 && personnel === "10") role = "WR";
    if (personnel === "Goal Line" && [2, 3].includes(i)) role = "TE";
    if (i === 14 && front === "3–4 base") role = "LB";
    if (i === 17 && ["Nickel", "Dime"].includes(front)) role = "CB";
    if (i === 16 && front === "Dime") role = "CB";
    const source = (i < 11 ? offenseGroups : defenders)[role] || [];
    const side = i < 11 ? 0 : 1;
    const sourcePlayer = source.find((p) => !assigned[side].has(p.id));
    if (sourcePlayer) assigned[side].add(sourcePlayer.id);
    const skills = effectiveAttributes(sourcePlayer);
    const relevant =
      {
        QB: ["throwAccuracyShort", "awareness"],
        RB: ["carrying", "breakTackle"],
        WR: ["catching", "shortRouteRunning"],
        TE: ["catching", "runBlock"],
        OL: ["passBlock", "runBlock", "strength"],
        DL: ["strength", "tackle"],
        LB: ["tackle", "awareness"],
        CB: ["manCoverage", "zoneCoverage"],
        S: ["zoneCoverage", "tackle"],
      }[role] || [];
    const grades = relevant.map((key) => skills?.[key]).filter(Number.isFinite);
    const positional = grades.length
      ? grades.reduce((a, b) => a + b, 0) / grades.length
      : (sourcePlayer?.ovr ?? 75);
    const o = clamp(
      ((sourcePlayer?.ovr ?? 75) * 0.8 + positional * 0.2) *
        (0.7 + (0.3 * (sourcePlayer?.fitness ?? 100)) / 100) -
        (sourcePlayer?.injury ? 25 : 0) +
        ((sourcePlayer?.morale ?? 75) - 75) * 0.06,
      35,
      99,
    );
    let dx =
      i === 0
        ? -5
        : i === 1
          ? -5.2
          : i < 5 || i === 10
            ? -1
            : i < 11
              ? 0
              : i < 15
                ? 2
                : i < 20
                  ? 6
                  : 14;
    let z = i < 11 ? zOff[i] : zDef[i - 11];
    if (i >= 20 && shell === "Zero") dx = 5;
    if (i === 20 && shell === "Single-High") {
      dx = 6;
      z = -6;
    }
    if (i === 21 && shell === "Single-High") {
      dx = 17;
      z = 0;
    }
    if (formation === "I formation" && i === 0) dx = -2;
    if (["Singleback", "I formation"].includes(formation) && i === 1) z = 0;
    if (formation === "Empty backfield" && i === 1) {
      dx = -1;
      z = -24;
    }
    return {
      id: sourcePlayer?.id || `actor-${i}`,
      name: sourcePlayer?.name || `${role} ${i + 1}`,
      jersey: sourcePlayer?.jersey ?? null,
      role,
      side: i < 11 ? 0 : 1,
      index: i,
      x: spot + dx,
      z,
      vx: 0,
      vz: 0,
      rating: o,
      skills: skills,
      progression: sourcePlayer?.ratings
        ? sourcePlayer.ovr - sourcePlayer.ratings.base
        : 0,
      maxSpeed: skills?.speed
        ? clamp(
            4.5 +
              (skills.speed +
                (sourcePlayer.ovr - sourcePlayer.ratings.base) * 0.5 -
                60) *
                0.09,
            3.4,
            8.3,
          ) *
          (0.7 + (0.3 * (sourcePlayer.fitness ?? 100)) / 100)
        : (role === "OL" || role === "DL" ? 4.2 : 6.1) + (o - 60) * 0.045,
      distance: 0,
    };
  });
}
function steer(actor, target, dt, factor = 1) {
  let dx = target.x - actor.x,
    dz = target.z - actor.z,
    d = Math.hypot(dx, dz),
    speed = Math.min(actor.maxSpeed * factor, d * 3);
  let tx = d ? (dx / d) * speed : 0,
    tz = d ? (dz / d) * speed : 0,
    ax = tx - actor.vx,
    az = tz - actor.vz,
    a = Math.hypot(ax, az),
    max = 13 * dt;
  if (a > max) {
    ax *= max / a;
    az *= max / a;
  }
  actor.vx += ax;
  actor.vz += az;
  let x = actor.x,
    z = actor.z;
  actor.x = clamp(actor.x + actor.vx * dt, -9, 109);
  actor.z = clamp(actor.z + actor.vz * dt, -26.6, 26.6);
  actor.distance += Math.hypot(actor.x - x, actor.z - z);
}
export function simulateExecution(input) {
  if (!Number.isFinite(input.spot) || input.spot < 1 || input.spot > 99)
    throw Error("Invalid field position");
  const rng = random(input.seed),
    actors = buildActors(
      input.spot,
      input.offensePlayers,
      input.defensePlayers,
      input.formation,
      input.personnel,
      input.front,
      input.shell,
    ),
    initial = structuredClone(actors),
    events = [],
    frames = [],
    dt = 1 / TICK_RATE;
  let time = 0,
    carrier = 0,
    target = null,
    flight = null,
    result = null,
    caught = false,
    released = false,
    contact = null;
  const emit = (type, data = {}) =>
    events.push({
      id: `${input.playId}:${events.length}`,
      type,
      time: Number(time.toFixed(2)),
      ...data,
    });
  const pass = !["Inside run", "Outside run", "Punt", "Field goal"].includes(
      input.call,
    ),
    kick = ["Punt", "Field goal"].includes(input.call),
    deep = ["Deep pass", "Play action"].includes(input.call),
    playAction = input.call === "Play action",
    blitz = /blitz/i.test(input.coverage),
    zone = !/Man/.test(input.coverage),
    spot = input.spot;
  let runLane = pass ? 0 : (rng() > 0.5 ? 1 : -1) * (3 + rng() * 2);
  // Outside runs pick an edge each snap and turn upfield once they reach it.
  const edge = (rng() > 0.5 ? 1 : -1) * (9 + rng() * 5);
  // Per-snap variation, all drawn from the play seed so a replay is identical: effort (top speed
  // ±5%), defender reaction delay and pursuit lead, and each receiver's route (depth, break point
  // and direction). Without it identical calls resolved to the same yardage every time.
  for (const a of actors) {
    a.maxSpeed *= 0.95 + rng() * 0.1;
    a.react = a.side ? 0.03 + rng() * 0.12 : 0;
    a.lead = 0.55 + rng() * 0.3;
    a.zoneDepth = (rng() - 0.5) * 4;
  }
  const baseDepth = { "Quick pass": 5, "Short pass": 9, Screen: 1.5, "Deep pass": 24, "Play action": 26 }[input.call] ?? (deep ? 24 : 9);
  const routes = actors.slice(0, 11).map(() => ({
    depth: baseDepth * (0.75 + rng() * 0.5),
    breakAt: 0.6 + rng() * 0.7,
    dir: rng() > 0.5 ? 1 : -1,
  }));
  // Linebackers may bite on the play-action fake and step up before dropping.
  const bite = playAction && rng() < 0.65 ? 0.55 + rng() * 0.45 : 0;
  // The quarterback reads separation with an error that shrinks with awareness.
  const awareness = actors[0].skills?.awareness ?? actors[0].rating;
  const misread = actors.slice(0, 11).map(() => (rng() - 0.5) * 2.4 * clamp((105 - awareness) / 40, 0.2, 1.5));
  let ball = { x: actors[0].x, y: 1.6, z: 0 };
  let catchTime = 0;
  const routeTarget = (i, t) => {
    const route = routes[i];
    let depth = deep
        ? Math.min(Math.min(34, route.depth), t * 5.5)
        : input.call === "Screen"
          ? route.depth
          : Math.min(Math.min(14, route.depth), t * 3.6),
      z = zOff[i];
    if (input.personnel === "12" && i === 10) z = -8;
    if (input.personnel === "21" && i === 10) z = -3;
    if (input.formation === "Empty backfield" && i === 1) z = -24;
    let cut = Math.max(0, t - route.breakAt);
    return {
      x: spot + depth,
      z: clamp(z + route.dir * Math.min(9, cut * 4), -24, 24),
    };
  };
  emit("Snap", {
    actorId: actors[0].id,
    name: actors[0].name,
    call: input.call,
  });
  if (kick) {
    const kicker = (input.offensePlayers?.K || [])[0],
      rating = effectiveAttributes(kicker)?.kickAccuracy
        ? effectiveAttributes(kicker).kickAccuracy * 0.65 +
          effectiveAttributes(kicker).kickPower * 0.35 +
          (kicker.ovr - kicker.ratings.base)
        : (kicker?.ovr ?? 75);
    time = 1.6;
    emit("Kick", {
      name: kicker?.name || "The kicker",
      distance:
        input.call === "Field goal" ? 117 - spot : Math.round(34 + rng() * 20),
    });
    let yards = input.call === "Punt" ? Math.round(34 + rng() * 20) : 0;
    let good =
      input.call === "Field goal" &&
      rng() <
        clamp(
          1.08 - (117 - spot - 25) * 0.018 + (rating - 75) * 0.004,
          0.02,
          0.98,
        );
    result = {
      kind:
        input.call === "Punt" ? "punt" : good ? "fieldGoal" : "missedFieldGoal",
      yards,
      spot: clamp(spot + yards, 0, 110),
      carrier: 0,
      passing: false,
    };
    emit(
      good ? "FieldGoalGood" : input.call === "Punt" ? "Punt" : "FieldGoalMiss",
      result,
    );
    for (let t = 0; t <= 3; t += 0.1)
      frames.push({
        time: t,
        actors: initial.map((a) => ({
          x: a.x,
          z: a.z,
          distance: 0,
          speed: 0,
          yaw: Math.PI / 2,
        })),
        ball: {
          x: spot + (input.call === "Punt" ? yards : 110 - spot) * (t / 3),
          y: Math.max(
            0.2,
            1.3 +
              (((input.call === "Field goal" ? 2.6 : -1.1) + 0.5 * 10.7 * 9) /
                3) *
                t -
              0.5 * 10.7 * t * t,
          ),
          z: 0,
        },
      });
    return finish();
  }
  const passGrade = clamp(
    (actors[0].skills?.[deep ? "throwAccuracyDeep" : "throwAccuracyShort"] ??
      actors[0].rating) + (actors[0].skills ? actors[0].progression : 0),
    20,
    99,
  );
  let throwingError =
      ((rng() - 0.5) * (deep ? 7 : 2.4) * (110 - passGrade)) / 35,
    aimBias = (rng() - 0.5) * 2;
  for (let tick = 0; tick < 180 && !result; tick++) {
    time = tick * dt;
    for (let i = 0; i < 11; i++) {
      let a = actors[i];
      if (i === carrier && caught) {
        // Outside runs press the edge while gaining ground, then turn upfield once there.
        const outside = !pass && input.call === "Outside run",
          turned = outside && Math.abs(a.z - edge) < 2.5;
        steer(
          a,
          {
            x: pass ? 110 : outside && !turned ? Math.max(spot + 1.5, a.x + 2.5) : a.x + 6,
            z: pass ? a.z : outside ? edge : runLane,
          },
          dt,
          0.94,
        );
        continue;
      }
      if (i === 0) {
        steer(a, { x: spot - (deep ? 7 : 5.8), z: 0 }, dt, 0.5);
        continue;
      }
      if (i >= 5 && i <= 9) {
        let d = actors[i + 6];
        steer(
          a,
          { x: spot + (pass ? 0.7 : Math.min(3, time * 1.5)), z: d.z },
          dt,
          0.35,
        );
        continue;
      }
      if (!pass && i === 1) {
        if (time < 0.65) steer(a, { x: actors[0].x + 1, z: 1 }, dt);
        else
          steer(
            a,
            {
              x: 110,
              z:
                input.call === "Outside run"
                  ? edge
                  : input.formation === "I formation"
                    ? 0
                    : 2,
            },
            dt,
          );
        continue;
      }
      steer(a, routeTarget(i, time), dt);
    }
    for (let i = 11; i < 22; i++) {
      let a = actors[i],
        targetPos;
      if (i < 15 || (blitz && i < 17)) {
        let blocker = actors
            .slice(5, 10)
            .slice()
            .sort((b, c) => distance(a, b) - distance(a, c))[0],
          inReach = distance(a, blocker) < 2.1;
        if (inReach && a.blockedUntil === undefined)
          a.blockedUntil =
            time + 0.9 + rng() * 2.8 + (blocker.rating - a.rating) * 0.025;
        let blocked = time < (a.blockedUntil || 0);
        let strength = clamp(
          0.22 + (a.rating - blocker.rating) / 90,
          0.08,
          0.75,
        );
        targetPos = pass && !caught ? actors[0] : actors[carrier];
        steer(a, targetPos, dt, blocked ? strength : 1);
        if (blocked && Math.abs(a.z - blocker.z) < 2)
          a.x = Math.max(a.x, blocker.x + 0.55);
        if (blocked && tick === 20)
          emit("BlockEngaged", { blocker: blocker.id, rusher: a.id });
      } else if (caught || (!pass && time > 1.15)) {
        let runner = actors[carrier];
        // Each defender reacts to the catch or handoff a beat late and takes his own angle.
        if (time < (pass ? catchTime : 1.15) + a.react) {
          a.x = clamp(a.x + a.vx * dt, -9, 109);
          a.z = clamp(a.z + a.vz * dt, -26.6, 26.6);
        } else
          steer(
            a,
            { x: runner.x + runner.vx * a.lead, z: runner.z + runner.vz * a.lead },
            dt,
            1.02,
          );
      } else if (bite && i <= 17 && time < bite) {
        steer(a, { x: spot + 1, z: a.z }, dt, 0.8);
      } else {
        let wr = actors[[1, 4, 10, 2, 3, 2, 3][i - 15]];
        let depth =
          input.coverage === "Prevent"
            ? 20
            : input.coverage === "Tampa 2" && i === 16
              ? 17
              : input.coverage === "Cover 3"
                ? 14
                : input.coverage === "Quarters"
                  ? 16
                  : 9;
        depth += a.zoneDepth;
        let coverageTarget = zone
          ? {
              x: Math.max(spot + Math.min(depth, time * 3.8), wr.x + 1.5),
              z: wr.z * 0.96,
            }
          : wr;
        steer(a, coverageTarget, dt, 0.97);
      }
    }
    if (!pass && time >= 0.65 && carrier === 0) {
      carrier = 1;
      caught = true;
      emit("Handoff", { actorId: actors[1].id, name: actors[1].name });
    }
    if (pass && !released && time > 1.35) {
      let candidates = [2, 3, 4, 10, 1]
        .map((i) => ({
          i,
          separation:
            Math.min(...actors.slice(15).map((d) => distance(d, actors[i]))) +
            misread[i],
        }))
        .sort((a, b) => b.separation - a.separation);
      let progression = [2, 3, 4, 10, 1],
        readCount = clamp(Math.floor((time - 1.1) / 0.55) + 1, 1, 5),
        available = progression.slice(0, readCount);
      let read = candidates.filter((c) => available.includes(c.i))[0];
      if (tick % 11 === 0)
        emit("ReadProgression", {
          name: actors[0].name,
          read: readCount,
          targetId: actors[read.i].id,
        });
      if (
        (time > (playAction ? 2.35 : deep ? 2.05 : 1.55) && read.separation > 1.2) ||
        time > 3.2
      ) {
        target = read.i;
        let receiver = actors[target],
          // Lead the receiver by the ball's flight time, so deep balls land where he will be.
          lead = clamp(distance(actors[0], receiver) / 22, 0.42, 1.3),
          aim = {
            x: receiver.x + receiver.vx * lead + throwingError,
            z: clamp(
              receiver.z +
                receiver.vz * lead +
                aimBias +
                (input.weather === "Wind" ? 2 : 0),
              -26,
              26,
            ),
          };
        let duration = clamp(distance(actors[0], aim) / 22, 0.42, 1.3);
        flight = {
          from: { x: actors[0].x, z: actors[0].z },
          aim,
          begin: time,
          duration,
        };
        released = true;
        emit("PassReleased", {
          actorId: actors[0].id,
          name: actors[0].name,
          targetId: receiver.id,
          targetName: receiver.name,
          separation: read.separation,
        });
      }
    }
    if (
      !released &&
      !caught &&
      time > 0.7 &&
      actors.slice(11).some((d) => distance(d, actors[0]) < 0.65)
    ) {
      carrier = 0;
      contact = time;
      result = {
        kind: "sack",
        yards: Math.round(actors[0].x - spot),
        spot: actors[0].x,
        carrier,
        passing: true,
      };
      let tackler = actors.slice(11).find((d) => distance(d, actors[0]) < 0.65);
      emit("Sack", {
        name: actors[0].name,
        tackler: tackler?.name,
        tacklerId: tackler?.id,
      });
    }
    if (flight && !caught && !result) {
      let u = clamp((time - flight.begin) / flight.duration, 0, 1);
      ball = {
        x: flight.from.x + (flight.aim.x - flight.from.x) * u,
        y:
          1.8 +
          10.7 * flight.duration * 0.5 * (u * flight.duration) -
          0.5 * 10.7 * (u * flight.duration) ** 2,
        z: flight.from.z + (flight.aim.z - flight.from.z) * u,
      };
      if (u === 1) {
        let near = actors
          .slice(11)
          .map((a) => ({ a, d: distance(a, ball) }))
          .sort((a, b) => a.d - b.d)[0];
        let receiver = actors[target],
          error = distance(receiver, ball);
        if (
          near.d < 2.2 &&
          rng() < clamp(0.08 + (near.a.rating - 75) / 400, 0.03, 0.18)
        ) {
          carrier = near.a.index;
          result = {
            kind: "interception",
            yards: 0,
            spot: ball.x,
            carrier,
            passing: true,
          };
          emit("Interception", {
            actorId: near.a.id,
            name: near.a.name,
            quarterback: actors[0].name,
          });
        } else if (
          error < 3 &&
          rng() <
            clamp(
              0.91 +
                (receiver.rating - 75) / 250 -
                error * 0.045 -
                // Contested deep balls are caught less often than underneath throws.
                (deep ? 0.22 : 0) -
                (input.weather === "Rain" ? 0.09 : 0),
              0.15,
              0.97,
            )
        ) {
          carrier = target;
          caught = true;
          catchTime = time;
          emit("CatchCompleted", {
            actorId: receiver.id,
            name: receiver.name,
            spot: receiver.x,
          });
        } else {
          result = {
            kind: "incomplete",
            yards: 0,
            spot,
            carrier: target,
            passing: true,
          };
          emit("PassIncomplete", {
            name: actors[0].name,
            targetName: receiver.name,
          });
        }
        flight = null;
      }
    }
    if (caught && !result) {
      ball = { x: actors[carrier].x, y: 1.3, z: actors[carrier].z };
      let runner = actors[carrier],
        nearest = actors
          .slice(11)
          .filter((a) => time >= (a.blockedUntil || 0))
          .map((a) => ({ a, d: distance(a, runner) }))
          .sort((a, b) => a.d - b.d)[0];
      if (runner.x >= 100) {
        result = {
          kind: "touchdown",
          yards: 100 - spot,
          spot: 100,
          carrier,
          passing: pass,
        };
        emit("Touchdown", { actorId: runner.id, name: runner.name });
      } else if (Math.abs(runner.z) >= 26.5) {
        result = {
          kind: "outOfBounds",
          yards: Math.round(runner.x - spot),
          spot: runner.x,
          carrier,
          passing: pass,
        };
        emit("OutOfBounds", { name: runner.name });
      } else if (nearest.d < 1.2 && time > 0.9) {
        let escape = clamp(
          0.05 + (runner.rating - nearest.a.rating) / 200,
          0.015,
          0.25,
        );
        if (rng() < escape && time < 6) {
          runner.z = clamp(runner.z + (rng() > 0.5 ? 1 : -1) * 0.6, -26, 26);
          emit("BrokenTackle", { name: runner.name });
        } else {
          contact = time;
          result = {
            kind: "tackle",
            yards: Math.round(runner.x - spot),
            spot: runner.x,
            carrier,
            passing: pass,
          };
          emit("Tackle", {
            name: runner.name,
            tackler: nearest.a.name,
            tacklerId: nearest.a.id,
            actorId: runner.id,
          });
        }
      }
    }
    if (!flight && !caught) ball = { x: actors[0].x, y: 1.6, z: actors[0].z };
    if (input.capture !== false && (tick % 2 === 0 || result)) capture();
  }
  if (!result) {
    let runner = actors[carrier];
    result = {
      kind: pass && !caught ? "incomplete" : "tackle",
      yards: pass && !caught ? 0 : Math.round(runner.x - spot),
      spot: pass && !caught ? spot : runner.x,
      carrier,
      passing: pass,
    };
    emit(result.kind === "incomplete" ? "PassIncomplete" : "Tackle", {
      name: runner.name,
    });
  }
  return finish();
  function capture() {
    frames.push({
      time: Number(time.toFixed(2)),
      actors: actors.map((a) => ({
        x: a.x,
        z: a.z,
        distance: a.distance,
        speed: Math.hypot(a.vx, a.vz),
        yaw: Math.atan2(a.vx, a.vz) || Math.PI / 2,
      })),
      ball: { ...ball },
    });
  }
  function finish() {
    result.spot = clamp(Math.round(result.spot), 0, 110);
    result.yards = clamp(result.yards, -spot, 100 - spot);
    emit("PlayEnded", { ...result });
    if (!frames.length) capture();
    const duration = Math.max(3, frames.at(-1).time + 0.8);
    const last = structuredClone(frames.at(-1));
    last.time = duration;
    last.actors.forEach((a) => (a.speed = 0));
    frames.push(last);
    return {
      version: 1,
      seed: input.seed,
      tickRate: TICK_RATE,
      playId: input.playId,
      call: input.call,
      actors: initial.map((a) => ({
        id: a.id,
        name: a.name,
        role: a.role,
        jersey: a.jersey,
      })),
      events,
      frames,
      duration,
      result,
    };
  }
}
