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
// Special-teams units, by actor slot. Offense: kicker/punter, holder/personal protector, wings or
// gunners, ends, a five-man line with the long snapper in the middle. Roles name the job; `from`
// names the roster group the player is drawn from. Alignments are [depth from the line, width].
export const RUN_SCHEMES = ["Inside zone", "Outside zone", "Power", "Counter"];
const KICK_UNITS = {
  "Field goal": {
    roles: ["K", "H", "W", "W", "TE", "OL", "OL", "LS", "OL", "OL", "TE"],
    from: { H: ["P", "QB"], W: ["TE", "WR"], LS: ["OL"] },
    offense: [[-9.4, -1.9], [-7, 0], [-0.9, 4.6], [-0.9, -4.6], [-0.2, 3.4], [0, -2.3], [0, -1.15], [0, 0], [0, 1.15], [0, 2.3], [-0.2, -3.4]],
    defense: [[1, -3.4], [1, -1.2], [1, 1.2], [1, 3.4], [1.1, -5.8], [3.6, 0], [1.1, 5.8], [1.4, -8], [1.4, 8], [7.5, -5], [7.5, 5]],
  },
  Punt: {
    roles: ["P", "PP", "G", "G", "W", "OL", "OL", "LS", "OL", "OL", "W"],
    from: { PP: ["RB", "LB"], G: ["WR", "CB"], W: ["TE", "LB"], LS: ["OL"] },
    offense: [[-14.5, 0], [-5.2, 0.9], [0, -22], [0, 22], [-0.9, 3.6], [0, -2.4], [0, -1.2], [0, 0], [0, 1.2], [0, 2.4], [-0.9, -3.6]],
    defense: [[1, -3.3], [1, -1.1], [1, 1.1], [1, 3.3], [4, -6], [4.5, 0], [4, 6], [1, -20.5], [1, 20.5], [16, 0], [40, 0]],
  },
};
export function buildActors(
  spot,
  offenseGroups = {},
  defenders = {},
  formation = "Shotgun spread",
  personnel = "11",
  front = "Nickel",
  shell = "2-High",
) {
  const assigned = [new Set(), new Set()],
    unit = KICK_UNITS[formation];
  return slots.map((baseRole, i) => {
    let role = baseRole;
    if (unit && i < 11) role = unit.roles[i];
    else if (!unit) {
      if (i === 10 && personnel === "12") role = "TE";
      if (i === 10 && personnel === "21") role = "RB";
      if (i === 4 && personnel === "10") role = "WR";
      if (personnel === "Goal Line" && [2, 3].includes(i)) role = "TE";
      if (i === 14 && front === "3–4 base") role = "LB";
      if (i === 17 && ["Nickel", "Dime"].includes(front)) role = "CB";
      if (i === 16 && front === "Dime") role = "CB";
    }
    const groups = i < 11 ? offenseGroups : defenders,
      source = (unit && i < 11 ? unit.from[role] || [role] : [role]).flatMap((g) => groups[g] || []);
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
        K: ["kickAccuracy", "kickPower"],
        P: ["kickPower", "kickAccuracy"],
        LS: ["passBlock", "strength"],
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
    if (unit) [dx, z] = i < 11 ? unit.offense[i] : unit.defense[i - 11];
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
const smooth01 = (u) => {
  const x = clamp(u, 0, 1);
  return x * x * (3 - 2 * x);
};
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
// Pursuit angle: where the defender meets the runner if both hold their current speed. `lead`
// (per-snap discipline) shortens the angle a little, so some defenders chase from behind.
export function interceptPoint(actor, runner, speed, lead = 1) {
  const rx = runner.x - actor.x,
    rz = runner.z - actor.z,
    a = runner.vx ** 2 + runner.vz ** 2 - speed * speed,
    b = 2 * (rx * runner.vx + rz * runner.vz),
    c = rx * rx + rz * rz;
  let t = 0;
  if (Math.abs(a) < 1e-6) t = b < 0 ? -c / b : 0;
  else {
    const disc = b * b - 4 * a * c;
    if (disc >= 0) {
      const r = Math.sqrt(disc),
        t1 = (-b - r) / (2 * a),
        t2 = (-b + r) / (2 * a);
      t = Math.min(...[t1, t2].filter((v) => v > 0), Infinity);
      if (!Number.isFinite(t)) t = 0;
    }
  }
  t = clamp(t, 0, 2.5) * lead;
  return { x: runner.x + runner.vx * t, z: runner.z + runner.vz * t };
}
function pursue(actor, runner, dt, factor = 1.02) {
  const d = distance(actor, runner);
  // Breaking down: inside three yards the tackler gathers, closing a little faster than the
  // runner moves, and aims at the near hip instead of the far intercept point.
  if (d < 3) {
    const hx = runner.x + runner.vx * 0.2 - actor.x,
      hz = runner.z + runner.vz * 0.2 - actor.z,
      h = Math.hypot(hx, hz) || 1,
      close = Math.min(actor.maxSpeed * 0.97, Math.hypot(runner.vx, runner.vz) + 2.2);
    return steer(actor, { x: actor.x + (hx / h) * 10, z: actor.z + (hz / h) * 10 }, dt, close / actor.maxSpeed);
  }
  steer(actor, interceptPoint(actor, runner, actor.maxSpeed * factor, 0.82 + actor.lead * 0.2), dt, factor);
}
export function simulateExecution(input) {
  if (!Number.isFinite(input.spot) || input.spot < 1 || input.spot > 99)
    throw Error("Invalid field position");
  const rng = random(input.seed),
    actors = buildActors(
      input.spot,
      input.offensePlayers,
      input.defensePlayers,
      KICK_UNITS[input.call] ? input.call : input.formation,
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
    contact = null,
    scheme = null,
    wrap = null;
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
    // The outcome draws come first, in their historical order, so kicking results are unchanged
    // by the choreography below (which uses no random numbers at all).
    const punt = input.call === "Punt",
      announced = punt ? Math.round(34 + rng() * 20) : 117 - spot;
    let yards = punt ? Math.round(34 + rng() * 20) : 0;
    let good =
      input.call === "Field goal" &&
      rng() <
        clamp(
          1.08 - (117 - spot - 25) * 0.018 + (rating - 75) * 0.004,
          0.02,
          0.98,
        );
    result = {
      kind: punt ? "punt" : good ? "fieldGoal" : "missedFieldGoal",
      yards,
      spot: clamp(spot + yards, 0, 110),
      carrier: 0,
      passing: false,
    };
    kickPlay(punt, good, punt ? yards : announced, kicker?.name || "The kicker");
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
  // Run schemes. Inside runs are inside zone, power or counter; outside runs are outside zone.
  // Blockers take assignments from the front they see at the snap, fit on their man and drive
  // him; pullers travel flat behind the line before turning up through the hole.
  if (!pass) {
    if (RUN_SCHEMES.includes(input.scheme)) scheme = input.scheme;
    else if (input.call === "Outside run") scheme = "Outside zone";
    else {
      const r = rng(),
        iForm = input.formation === "I formation";
      scheme = r < (iForm ? 0.35 : 0.5) ? "Inside zone" : r < (iForm ? 0.8 : 0.78) ? "Power" : "Counter";
    }
    // Counter needs the back behind the quarterback to sell the misdirection; an offset shotgun
    // back runs it as power.
    if (scheme === "Counter" && actors[1].z) scheme = "Power";
  }
  const side = scheme === "Outside zone" ? Math.sign(edge) : Math.sign(runLane) || 1,
    zoneScheme = /zone/.test(scheme || ""),
    // Outside zone aims just outside the end man; the edge draw sets how wide.
    hole = scheme === "Outside zone" ? side * (6 + (Math.abs(edge) - 9) * 0.4) : scheme === "Inside zone" ? side * 3 : side * 4.5,
    blocks = new Map();
  let laneZ = null,
    endMan;
  if (!pass) {
    const box = [11, 12, 13, 14, 15, 16, 17].filter((j) => Math.abs(actors[j].z) < 12),
      line = box.filter((j) => actors[j].x < spot + 3.5),
      backers = box.filter((j) => !line.includes(j)),
      taken = new Set(),
      nearest = (pool, z, within = 99) =>
        pool
          .filter((j) => !taken.has(j) && Math.abs(actors[j].z - z) < within)
          .sort((p, q) => Math.abs(actors[p].z - z) - Math.abs(actors[q].z - z))[0],
      assign = (i, target, drive, extra = {}) => {
        blocks.set(i, { target, drive, ...extra });
        if (target !== undefined) taken.add(target);
      };
    const pullers = scheme === "Power" ? [side > 0 ? 6 : 8] : scheme === "Counter" ? [side > 0 ? 6 : 8, side > 0 ? 5 : 9] : [];
    if (pullers.length) {
      // The first puller kicks out the end man on the line; the second wraps for the linebacker.
      endMan = line.slice().sort((p, q) => side * actors[q].z - side * actors[p].z)[0];
      assign(pullers[0], endMan, [0.25, side], { pull: true });
      if (pullers[1] !== undefined) assign(pullers[1], nearest(backers, hole), [1, 0], { pull: true });
    }
    const fullback = actors[10].role === "RB" ? 10 : null,
      linemen = [4, 5, 6, 7, 8, 9, 10]
        .filter((i) => !pullers.includes(i) && i !== fullback && ["OL", "TE"].includes(actors[i].role))
        .sort((p, q) => side * actors[q].z - side * actors[p].z);
    for (const i of linemen) {
      const b = actors[i],
        aim = b.z + side * (scheme === "Outside zone" ? 2.4 : zoneScheme ? 1.4 : -1.5),
        drive = scheme === "Outside zone" ? [0.35, side] : zoneScheme ? [0.8, side * 0.6] : [0.7, -side * 0.7],
        target = nearest(line, aim, scheme === "Outside zone" ? 3.2 : 2.6) ?? nearest(backers, b.z + side * 2);
      assign(i, target, drive);
    }
    if (fullback !== null) assign(fullback, nearest(backers, hole), [1, 0], { lead: true });
    for (const i of [2, 3, 4, 10]) if (actors[i].role === "WR") blocks.set(i, { target: undefined, drive: [1, 0], stalk: true });
  }
  const engage = (b, d, plan) => {
    d.engagedBy = b.index;
    b.engaged = d.index;
    d.blockedUntil =
      time +
      clamp(0.8 + rng() * 2.6 + (b.rating - d.rating) * 0.03, 0.35, 4) * (d.index >= 15 ? 0.7 : 1) * (plan.stalk ? 0.6 : 1);
    emit("BlockEngaged", { blocker: b.id, rusher: d.id, blockerIndex: b.index, defenderIndex: d.index });
  };
  const release = (b, d) => {
    b.engaged = undefined;
    d.engagedBy = undefined;
    d.freeUntil = time + 0.5;
    b.face = d.face = undefined;
  };
  function runBlock(i, a) {
    const plan = blocks.get(i),
      held = a.engaged !== undefined ? actors[a.engaged] : null;
    if (held && time >= held.blockedUntil) release(a, held);
    else if (held) {
      // Drive block: the winner moves the pair; a beaten blocker is walked back into the backfield.
      const push = clamp(0.9 + (a.rating - held.rating) / 30, -0.6, 2.2),
        len = Math.hypot(...plan.drive);
      steer(a, { x: a.x + (plan.drive[0] / len) * push * 2, z: a.z + (plan.drive[1] / len) * push * 2 }, dt, Math.abs(push) / a.maxSpeed);
      a.face = Math.atan2(held.x - a.x, held.z - a.z);
      return;
    }
    let t = plan.target !== undefined ? actors[plan.target] : null;
    if (!t || (t.engagedBy !== undefined && t.engagedBy !== i) || t.freeUntil > time) {
      // Combo done or man taken: climb to the nearest free defender in front.
      t = actors
        .slice(11)
        .filter((d) => d.engagedBy === undefined && !(d.freeUntil > time) && d.x > a.x - 0.5 && distance(d, a) < (plan.stalk ? 12 : 7))
        .sort((p, q) => distance(p, a) - distance(q, a))[0];
      plan.target = t?.index;
    }
    if (!t) {
      steer(a, { x: a.x + 1, z: a.z + side * 0.5 }, dt, 0.4);
      return;
    }
    const pulling = plan.pull && Math.abs(a.z - hole) > 1.6 && a.x < spot + 0.5;
    const fit = pulling
      ? { x: spot - 1.3, z: hole }
      : { x: t.x - 0.7, z: t.z + (zoneScheme ? side : -side) * 0.35 * (plan.pull ? -1 : 1) };
    steer(a, plan.stalk && time < 0.5 ? { x: a.x + 3, z: a.z } : fit, dt, plan.stalk ? 0.8 : pulling ? 1.15 : 0.95);
    if (time > (plan.stalk ? 0.6 : 0.12) && distance(a, t) < (time < 0.6 ? 1.5 : 1.25) && t.engagedBy === undefined && !(t.freeUntil > time)) engage(a, t, plan);
    else if (!pulling && !plan.stalk && time > 0.12) {
      // Whoever shows up in the blocker's gap gets blocked, assignment or not.
      const crash = actors.slice(11).find((d) => d.engagedBy === undefined && !(d.freeUntil > time) && distance(d, a) < 1);
      if (crash) {
        plan.target = crash.index;
        engage(a, crash, plan);
      }
    }
  }
  // Engaged defenders are carried by the block, working toward the ball with their strength.
  function heldDefender(a) {
    const b = actors[a.engagedBy],
      runner = actors[carrier === 0 && !caught ? 1 : carrier],
      strength = clamp(0.22 + (a.rating - b.rating) / 90, 0.08, 0.75);
    let ox = a.x - b.x,
      oz = a.z - b.z;
    const o = Math.hypot(ox, oz) || 1,
      rx = runner.x - a.x,
      rz = runner.z - a.z,
      r = Math.hypot(rx, rz) || 1;
    ox = ox / o + (rx / r) * strength * 0.35;
    oz = oz / o + (rz / r) * strength * 0.35;
    const n = Math.hypot(ox, oz) || 1,
      px = a.x,
      pz = a.z;
    a.x += (b.x + (ox / n) * 0.9 - a.x) * 0.35;
    a.z += (b.z + (oz / n) * 0.9 - a.z) * 0.35;
    a.vx = (a.x - px) / dt;
    a.vz = (a.z - pz) / dt;
    a.distance += Math.hypot(a.x - px, a.z - pz);
    a.face = Math.atan2(b.x - a.x, b.z - a.z);
  }
  const freeDefenders = () =>
    actors.slice(11).filter((a) => time >= (a.blockedUntil || 0) && a.engagedBy === undefined && !(a.stumble > time));
  function carrierPath(a) {
    // Open field: run to daylight, leaning away from the nearest unblocked defender ahead.
    const ahead = freeDefenders()
      .filter((d) => d.x > a.x - 1 && distance(d, a) < 5)
      .sort((p, q) => distance(p, a) - distance(q, a))[0];
    const dodge = ahead ? Math.sign(a.z - ahead.z || side) * clamp(5 - distance(ahead, a), 0, 2) : 0;
    if (pass || a.x > spot + 3.5) return { x: 110, z: a.z + dodge };
    if (scheme === "Outside zone") {
      // Press the edge; if the edge defender has leverage, plant and cut up inside him.
      if (laneZ === null && time > 1.0) {
        const corner = { x: spot + 1, z: hole },
          contain = freeDefenders().find((d) => distance(d, corner) < 3 && Math.abs(d.z) > Math.abs(a.z));
        laneZ = contain ? side * 3 : hole;
      }
      const z = laneZ ?? hole,
        turned = Math.abs(a.z - z) < 2.5;
      return { x: turned ? a.x + 6 : Math.max(spot + 1.5, a.x + 2.5), z };
    }
    if (laneZ === null && time > 0.85) {
      // Inside zone reads front side, bounce and cutback; gap schemes hit the hole behind the pull.
      if (zoneScheme) {
        const open = (z) => Math.min(...freeDefenders().map((d) => distance(d, { x: spot + 1.5, z })), 9);
        laneZ = [hole, side * 6.5, -side * 1.5].map((z, k) => ({ z, score: open(z) + (k ? 0 : 1.2) })).sort((p, q) => q.score - p.score)[0].z;
      } else laneZ = hole;
    }
    return { x: a.x + 6, z: laneZ ?? hole };
  }
  for (let tick = 0; tick < 180 && !result; tick++) {
    time = tick * dt;
    for (let i = 0; i < 11; i++) {
      let a = actors[i];
      if (i === carrier && caught) {
        // Wrapped up: the runner falls forward with the tackler on him.
        if (wrap) steer(a, { x: a.x + 3, z: a.z }, dt, 0.3);
        else steer(a, carrierPath(a), dt, 0.94);
        continue;
      }
      if (i === 0) {
        // On runs the quarterback carries out his fake away from the play.
        steer(a, pass || time < 0.75 ? { x: spot - (deep ? 7 : 5.8), z: 0 } : { x: spot - 7, z: -side * 4 }, dt, pass ? 0.5 : 0.6);
        continue;
      }
      if (!pass && blocks.has(i)) {
        runBlock(i, a);
        continue;
      }
      if (i >= 5 && i <= 9) {
        let d = actors[i + 6];
        steer(a, { x: spot + 0.7, z: d.z }, dt, 0.35);
        continue;
      }
      if (!pass && i === 1) {
        // Mesh path by scheme; the counter steps away first to freeze the linebackers.
        const qb = actors[0],
          mesh =
            scheme === "Counter" && time < 0.3
              ? { x: a.x - 0.3, z: initial[1].z - side * 1.8 }
              : { x: qb.x + (scheme === "Outside zone" ? 0.6 : 1), z: side * (scheme === "Outside zone" ? 2.8 : scheme === "Inside zone" ? 1.2 : 0.7) };
        steer(a, mesh, dt);
        continue;
      }
      steer(a, routeTarget(i, time), dt);
    }
    for (let i = 11; i < 22; i++) {
      let a = actors[i],
        targetPos;
      if (wrap && a === wrap.a) {
        // The tackler stays wrapped on the runner's near hip as they go down together.
        const runner = actors[carrier],
          px = a.x,
          pz = a.z;
        a.x += (runner.x - 0.55 - a.x) * 0.4;
        a.z += (runner.z + 0.25 * side - a.z) * 0.4;
        a.vx = (a.x - px) / dt;
        a.vz = (a.z - pz) / dt;
        a.face = Math.atan2(runner.x - a.x, runner.z - a.z);
        continue;
      }
      if (!pass) {
        if (a.engagedBy !== undefined) {
          if (time >= a.blockedUntil) release(actors[a.engagedBy], a);
          else {
            heldDefender(a);
            continue;
          }
        }
        const runner = actors[caught ? carrier : 1],
          handoff = 0.65 + a.react;
        if (a.stumble > time) steer(a, { x: a.x + a.vx, z: a.z + a.vz }, dt, 0.3);
        else if (i < 15 || (blitz && i < 17)) {
          // Defensive line: fire off into the gap, then play the ball.
          // The end man squeezes the down block and waits for the puller instead of charging.
          if (i === endMan && time < 1.1) steer(a, { x: spot + 0.3, z: initial[i].z + side * 0.6 }, dt, 0.5);
          else if (time < 0.6) steer(a, { x: spot - 0.4, z: a.z }, dt, 0.7);
          else pursue(a, runner, dt);
        } else if (Math.abs(initial[i].z) < 12 && i < 18) {
          // Linebackers read and flow (counter action pulls them the wrong way first).
          if (time < handoff + 0.2) steer(a, { x: spot + 3.5, z: a.z + (scheme === "Counter" && time < 0.9 ? -side : side) * 2.5 }, dt, 0.55);
          else pursue(a, runner, dt);
        } else if (time > 1.15 + a.react) pursue(a, runner, dt);
        else steer(a, { x: Math.max(a.x, spot + 6), z: a.z * 0.9 }, dt, 0.6);
        continue;
      }
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
        if (caught && !blocked && !(a.stumble > time)) pursue(a, targetPos, dt);
        else steer(a, targetPos, dt, blocked ? strength : a.stumble > time ? 0.3 : 1);
        // A blocked rusher is held on the blocker's front, eased there instead of snapped.
        if (blocked && Math.abs(a.z - blocker.z) < 2 && a.x < blocker.x + 0.55)
          a.x += (blocker.x + 0.55 - a.x) * 0.5;
        a.face = blocked && distance(a, blocker) < 1.6 ? Math.atan2(blocker.x - a.x, blocker.z - a.z) : undefined;
        if (blocked && tick === 20)
          emit("BlockEngaged", { blocker: blocker.id, rusher: a.id });
      } else if (caught || (!pass && time > 1.15)) {
        let runner = actors[carrier];
        // Each defender reacts to the catch or handoff a beat late and takes his own angle.
        if (time < (pass ? catchTime : 1.15) + a.react) {
          a.x = clamp(a.x + a.vx * dt, -9, 109);
          a.z = clamp(a.z + a.vz * dt, -26.6, 26.6);
        } else if (a.stumble > time) steer(a, { x: a.x + a.vx, z: a.z + a.vz }, dt, 0.3);
        else pursue(a, runner, dt);
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
        tacklerIndex: tackler?.index,
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
        nearest = freeDefenders()
          .map((a) => ({ a, d: distance(a, runner) }))
          .sort((a, b) => a.d - b.d)[0] || { d: Infinity };
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
      } else if (wrap) {
        // Contact happened earlier; the play ends when the runner is brought down.
        if (time >= wrap.until) {
          result = {
            kind: "tackle",
            yards: Math.round(runner.x - spot),
            spot: runner.x,
            carrier,
            passing: pass,
          };
          emit("Tackle", {
            name: runner.name,
            tackler: wrap.a.name,
            tacklerId: wrap.a.id,
            tacklerIndex: wrap.a.index,
            actorId: runner.id,
          });
        }
      } else if (nearest.d < 1.1 && time > 0.9) {
        let escape = clamp(
          // One roll per contact (it used to re-roll every tick a defender stayed close).
          0.1 + (runner.rating - nearest.a.rating) / 150,
          0.04,
          0.32,
        );
        if (rng() < escape && time < 6) {
          // Broken tackle: the runner spins out of it and the tackler stumbles off balance.
          runner.vz = clamp(runner.vz + (rng() > 0.5 ? 1 : -1) * 2.6, -8, 8);
          runner.vx *= 0.85;
          nearest.a.stumble = time + 0.55;
          nearest.a.vx *= 0.3;
          nearest.a.vz *= 0.3;
          emit("BrokenTackle", { name: runner.name, tacklerIndex: nearest.a.index });
        } else {
          contact = time;
          wrap = { a: nearest.a, until: time + 0.28 + rng() * 0.17 };
          emit("Contact", {
            name: runner.name,
            tackler: nearest.a.name,
            tacklerId: nearest.a.id,
            tacklerIndex: nearest.a.index,
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
  // Special teams: snap, hold or punt, protection against the rush, then the kick and (on punts)
  // gunners and coverage converging on the returner. Purely positional; the result is decided.
  function kickPlay(punt, good, kickDistance, kickerName) {
    const [kicker, holder] = actors,
      snapT = punt ? 0.75 : 0.38,
      kickT = punt ? 2.05 : 1.28,
      hold = { x: holder.x + 0.7, z: holder.z + 0.15 },
      catchAt = { x: kicker.x + 0.35, z: kicker.z },
      kickStart = { x: kicker.x, z: kicker.z },
      plant = punt ? { x: kicker.x + 1.9, z: kicker.z } : { x: hold.x - 0.55, z: hold.z - 0.35 },
      wide = good ? 0 : input.seed % 2 ? 4.2 : -4.2,
      landing = { x: Math.min(spot + kickDistance, 109.5), z: punt ? ((input.seed % 9) - 4) * 1.6 : wide },
      flight = punt ? clamp(3.4 + (kickDistance - 34) * 0.05, 3.4, 4.6) : clamp((110 - hold.x) / 25, 0.85, 2.1),
      launch = punt ? { x: plant.x + 0.8, y: 1.15, z: plant.z } : { x: hold.x, y: 0.15, z: hold.z },
      peak = punt ? (10.7 * flight * flight) / 8 : Math.max(5.5, (110 - hold.x) * 0.2),
      end = kickT + flight + (punt ? 0.7 : 0.4),
      center = actors[7],
      returner = actors[21];
    const ballAt = (t) => {
      if (t < 0.05) return { x: center.x + 0.2, y: 0.25, z: center.z };
      if (t < snapT) {
        const u = (t - 0.05) / (snapT - 0.05),
          to = punt ? { x: catchAt.x, y: 1.2, z: catchAt.z } : { x: hold.x - 0.25, y: 0.5, z: hold.z };
        return { x: center.x + (to.x - center.x) * u, y: 0.3 + (to.y - 0.3) * u + Math.sin(u * Math.PI) * 0.35, z: center.z + (to.z - center.z) * u };
      }
      if (t < kickT) {
        if (!punt) return { x: hold.x, y: t < snapT + 0.25 ? 0.5 - ((t - snapT) / 0.25) * 0.35 : 0.15, z: hold.z };
        return { x: kicker.x + 0.35, y: 1.15, z: kicker.z };
      }
      const u = Math.min(1, (t - kickT) / flight),
        endY = punt ? 1.4 : good ? 4.6 : 3.6;
      if (punt && u === 1 && landing.x > 98) return { x: landing.x, y: 0.2, z: landing.z };
      return {
        x: launch.x + (landing.x - launch.x) * u + (!punt && u === 1 ? (t - kickT - flight) * 6 : 0),
        y: launch.y + (endY - launch.y) * u + 4 * peak * u * (1 - u),
        z: launch.z + (landing.z - launch.z) * u,
      };
    };
    const protectors = [2, 3, 4, 5, 6, 7, 8, 9, 10].filter((i) => !(punt && (i === 2 || i === 3))),
      rushers = punt ? [11, 12, 13, 14, 16] : [11, 12, 13, 14, 15, 16, 17, 18, 19];
    let kicked = false,
      landed = false;
    for (let tick = 0; time < end; tick++) {
      time = tick * dt;
      // Kicker or punter: a timed approach (two-step drop for the punter, jab-and-plant for the
      // kicker), then the follow-through.
      const px = kicker.x,
        pz = kicker.z;
      if (time < kickT) {
        const u = punt ? smooth01((time - snapT - 0.2) / (kickT - snapT - 0.2)) : smooth01((time - 0.42) / (kickT - 0.42));
        kicker.x = kickStart.x + (plant.x - kickStart.x) * u;
        kicker.z = kickStart.z + (plant.z - kickStart.z) * u;
      } else {
        const u = Math.min(1, (time - kickT) / 0.7);
        kicker.x = plant.x + 1.6 * Math.sin((u * Math.PI) / 2);
      }
      kicker.vx = (kicker.x - px) / dt;
      kicker.vz = (kicker.z - pz) / dt;
      kicker.distance += Math.hypot(kicker.x - px, kicker.z - pz);
      holder.vx = holder.vz = 0;
      if (!kicked && time >= kickT) {
        kicked = true;
        emit("Kick", { name: kickerName, distance: kickDistance });
      }
      if (!landed && time >= kickT + flight) {
        landed = true;
        emit(good ? "FieldGoalGood" : punt ? "Punt" : "FieldGoalMiss", result);
      }
      const covering = punt && time > kickT + 0.25;
      for (const i of protectors) {
        const a = actors[i],
          home = initial[i];
        if (covering) {
          // Coverage lanes: spread across the field and break down five yards short of the catch.
          const lane = (protectors.indexOf(i) - (protectors.length - 1) / 2) * 3.6;
          steer(a, { x: landing.x - 5 - Math.abs(lane) * 0.3, z: landing.z + lane }, dt, 0.92);
          continue;
        }
        // Protection: kick-slide a half yard, then hold ground against the nearest rusher.
        const r = rushers.map((j) => actors[j]).sort((p, q) => distance(p, a) - distance(q, a))[0],
          set = { x: home.x - 0.5, z: home.z + clamp((r.z - home.z) * 0.35, -0.8, 0.8) };
        steer(a, time < snapT ? { x: home.x - 0.35, z: home.z } : set, dt, 0.5);
        a.face = r && distance(r, a) < 1.6 ? Math.atan2(r.x - a.x, r.z - a.z) : undefined;
      }
      for (const j of rushers) {
        const a = actors[j],
          aim = punt ? plant : hold;
        if (kicked && !punt) {
          steer(a, { x: a.x - 0.3, z: a.z }, dt, 0.25);
          continue;
        }
        if (kicked) {
          // After the punt the rush peels back to set up a return wall.
          steer(a, { x: landing.x - 12, z: a.z * 0.6 + landing.z * 0.4 }, dt, 0.7);
          continue;
        }
        const wall = protectors.map((i) => actors[i]).find((p) => distance(p, a) < 1.15);
        steer(a, aim, dt, time < 0.1 ? 0 : wall ? 0.12 : 0.85);
        if (wall) {
          a.face = Math.atan2(wall.x - a.x, wall.z - a.z);
          // Bodies do not pass through each other: the rusher is held on the protector's front.
          const dx = a.x - wall.x,
            dz = a.z - wall.z,
            d = Math.hypot(dx, dz) || 1;
          if (d < 0.85) {
            a.x = wall.x + (dx / d) * 0.85;
            a.z = wall.z + (dz / d) * 0.85;
          }
        } else a.face = undefined;
      }
      if (punt) {
        // Gunners release at the snap and race to the catch; the jammers ride their hips.
        for (const g of [2, 3]) {
          const a = actors[g];
          steer(a, time < 0.15 ? a : { x: landing.x - 1.2, z: landing.z + (g === 2 ? -1.5 : 1.5) }, dt, time < kickT ? 0.9 : 1);
          const jam = actors[g === 2 ? 18 : 19];
          steer(jam, { x: a.x + 0.9, z: a.z + (g === 2 ? 0.7 : -0.7) }, dt, 0.98);
        }
        // Returner settles under the ball; the up man drifts back to block.
        const settle = landing.x > 98 ? { x: 96, z: landing.z } : { x: landing.x - 0.3, z: landing.z };
        steer(returner, time > 0.4 ? settle : returner, dt, 0.8);
        steer(actors[20], { x: settle.x - 9, z: landing.z * 0.5 }, dt, 0.7);
        for (const j of [15, 17]) steer(actors[j], kicked ? { x: settle.x - 14, z: actors[j].z * 0.7 } : { x: spot + 2.5, z: actors[j].z }, dt, 0.6);
      } else for (const j of [20, 21]) steer(actors[j], { x: initial[j].x - (time > 0.6 ? 1.5 : 0), z: initial[j].z }, dt, 0.4);
      ball = ballAt(time);
      if (input.capture !== false && tick % 2 === 0) capture();
    }
    if (input.capture !== false) capture();
  }
  function capture() {
    frames.push({
      time: Number(time.toFixed(2)),
      actors: actors.map((a) => {
        const speed = Math.hypot(a.vx, a.vz);
        return {
          x: a.x,
          z: a.z,
          distance: a.distance,
          speed,
          // Engaged players face their opponent; standing players face the line of scrimmage.
          yaw: a.face ?? (speed > 0.05 ? Math.atan2(a.vx, a.vz) : a.side ? -Math.PI / 2 : Math.PI / 2),
        };
      }),
      ball: { ...ball },
    });
  }
  function finish() {
    result.spot = clamp(Math.round(result.spot), 0, 110);
    result.yards = clamp(result.yards, -spot, 100 - spot);
    emit("PlayEnded", { ...result });
    if (!frames.length) capture();
    // Players coast to a stop after the whistle instead of freezing mid-stride.
    const settle = frames.at(-1),
      duration = Math.max(3, settle.time + 0.8);
    for (const k of [0.2, 0.4, 0.6]) {
      const f = structuredClone(settle);
      f.time = Number((settle.time + k).toFixed(2));
      f.actors.forEach((a, i) => {
        const s = settle.actors[i],
          travel = s.speed * (k - (k * k) / 1.2);
        a.x = clamp(s.x + Math.sin(s.yaw) * travel, -9, 109);
        a.z = clamp(s.z + Math.cos(s.yaw) * travel, -26.6, 26.6);
        a.distance = s.distance + travel;
        a.speed = s.speed * (1 - k / 0.6);
      });
      if (f.time < duration) frames.push(f);
    }
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
      scheme,
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
