import { sortForLineup } from "./lineup.mjs";
import { simulateExecution } from "../engine/execution.mjs";
import {
  simTargetPlan,
  matchFingerprint,
  resumeSimulatedHalftime,
} from "../engine/sim-targets.mjs";
import { applyExecution } from "../engine/rules.mjs";
import { manualCall, withPossessionTempo, offenseSnap, defenseSnap, onsideKick, snapRoll, matchPersonnel, counterStyle } from "./play-calling.mjs";
// Game-plan inputs for one snap override the original defaults (see play-calling.mjs).
const withSnap = (input, snap) => Object.assign(input, snap);
// Scheme fit: a small rating change for the user's players by position (tactics.mjs schemeBoost).
function fitted(players, boost) {
  if (!boost) return players;
  return players.map((p) => (boost[p.pos] ? { ...p, ovr: Math.max(1, Math.min(99, p.ovr + boost[p.pos])) } : p));
}
function grouped(players, team) {
  let g = {};
  for (let p of sortForLineup(players, team)) (g[p.pos] ??= []).push(p);
  return g;
}
export function simulateGame(job) {
  let m = job.live
    ? structuredClone(job.live)
    : {
        a: job.a,
        b: job.b,
        spot: job.settings?.touchback || 25,
        poss: 0,
        quarter: 1,
        clock: 900,
        score: [0, 0],
        down: 1,
        toGo: 10,
        plays: 0,
        periodScores: [
          [0, 0],
          [0, 0],
          [0, 0],
          [0, 0],
        ],
        tempo: "Normal",
        stats: [
          { yards: 0, pass: 0, rush: 0, first: 0, turnovers: 0, plays: 0 },
          { yards: 0, pass: 0, rush: 0, first: 0, turnovers: 0, plays: 0 },
        ],
        events: [],
        settings: job.settings,
      };
  const plan = simTargetPlan(m, job.target || "final"),
    continuationFrom = matchFingerprint(m),
    fromPlay = m.plays;
  m.engine ??= { version: 1, seed: job.seed >>> 0, serial: m.plays };
  let playerStats = {},
    plays = 0,
    lastExecution,
    highlights = [],
    decisions = [];
  const boost = job.tactics?.boost,
    teams = [
      grouped(job.a === job.userTeam ? fitted(job.home, boost) : job.home, job.a),
      grouped(job.b === job.userTeam ? fitted(job.away, boost) : job.away, job.b),
    ];
  const ownership = new Map([
    ...job.home.map((p) => [p.id, job.a]),
    ...job.away.map((p) => [p.id, job.b]),
  ]);
  // Halftime directives belong to the user's club; CPU-vs-CPU games never inherit them.
  const userGame = m.a === job.userTeam || m.b === job.userTeam;
  while (!plan.reached(m, plays) && plays < 500) {
    if (m.halftime) {
      resumeSimulatedHalftime(m, {
        delegate: userGame && job.directives?.halftime,
        userTeam: job.userTeam,
      });
      if (plan.reached(m, plays)) break;
    }
    const own = (m.poss === 0 ? m.a : m.b) === job.userTeam,
      directive = own ? job.directives : {},
      tactics = job.tactics || {};
    // The user's defense follows the game plan unless he is calling a live game by hand.
    const userDefends = !own && (m.poss === 0 ? m.b : m.a) === job.userTeam,
      byHand = tactics.calling === "Manual" && !!job.live,
      gamePlan = own || (userDefends && !byHand) ? tactics.plan : null,
      manual = own && tactics.calling === "Manual" && manualCall(m),
      o = offenseSnap(m, {
        style: own ? tactics.style : gamePlan ? counterStyle(gamePlan) : "Balanced",
        directives: directive,
        plan: own ? gamePlan : null,
      });
    let call = manual || o.call;
    const formation = own ? (o.fixed && !manual ? o.formation : m.offense || o.formation) : "Shotgun spread",
      snapInputs = own
        ? {
            formation,
            personnel: o.fixed && !manual ? o.personnel : m.personnel || o.personnel,
            ...(!manual && o.scheme ? { scheme: o.scheme } : {}),
          }
        : gamePlan
          ? defenseSnap(m, { plan: gamePlan, defCall: m.defCall, front: m.defense || tactics.front || "Nickel", shell: m.shell || "2-High" })
          : {};
    // The opponent's staff answers the user's personnel and formation with its own front.
    if (own) Object.assign(snapInputs, matchPersonnel(snapInputs.formation, snapInputs.personnel));
    delete snapInputs.pkg;
    const before = m;
    if (
      own &&
      directive?.rookies &&
      m.quarter === 4 &&
      Math.abs(m.score[0] - m.score[1]) >= 21
    ) {
      let candidates = (m.poss === 0 ? job.home : job.away)
        .slice()
        .sort((a, b) => a.age - b.age);
      teams[m.poss] = grouped(
        candidates.map((p) => ({
          ...p,
          starter: p.age <= 24,
          depthPriority: undefined,
        })),
        m.poss === 0 ? job.a : job.b,
      );
    }
    let serial = ++m.engine.serial,
      playSeed =
        (m.engine.nextSeed ?? m.engine.seed + Math.imul(serial, 2654435761)) >>>
        0;
    delete m.engine.nextSeed;
    let exec = simulateExecution(withSnap({
      seed: playSeed,
      playId: `quick-${m.engine.seed}-${serial}`,
      spot: m.spot,
      call,
      coverage: !own
        ? m.defCall || "Cover 2"
        : m.plays % 2
          ? "Cover 3"
          : "Man coverage",
      formation: own ? m.offense || "Shotgun spread" : "Shotgun spread",
      front: !own ? m.defense || "Nickel" : "Nickel",
      personnel: own ? m.personnel || "11" : "11",
      shell: !own ? m.shell || "2-High" : "2-High",
      weather: m.weather || "Clear",
      offensePlayers: teams[m.poss],
      defensePlayers: teams[1 - m.poss],
      capture: false,
    }, snapInputs));
    let team = m.poss === 0 ? m.a : m.b,
      r = exec.result,
      q = exec.actors[0],
      p = exec.actors[r.carrier];
    const stat = (p, team) =>
      (playerStats[p.id] ??= {
        team,
        id: p.id,
        passYards: 0,
        passTD: 0,
        attempts: 0,
        completions: 0,
        interceptions: 0,
        rushYards: 0,
        rushAttempts: 0,
        rushTD: 0,
        receptions: 0,
        recYards: 0,
        recTD: 0,
        tackles: 0,
        sacks: 0,
      });
    for (const actor of new Map(exec.actors.map((a) => [a.id, a])).values()) {
      const actorTeam = ownership.get(actor.id);
      if (actorTeam === undefined) continue;
      const entry = stat(actor, actorTeam);
      entry.snaps = (entry.snaps || 0) + 1;
    }
    if (r.passing && r.kind !== "sack") {
      let a = stat(q, team);
      a.attempts++;
      if (r.kind === "interception") a.interceptions++;
      else if (r.kind !== "incomplete") {
        a.completions++;
        a.passYards += r.yards;
        a.passTD += r.kind === "touchdown" ? 1 : 0;
        let b = stat(p, team);
        b.receptions++;
        b.recYards += r.yards;
        b.recTD += r.kind === "touchdown" ? 1 : 0;
      }
    } else if (
      !r.passing &&
      ["tackle", "outOfBounds", "touchdown"].includes(r.kind)
    ) {
      let a = stat(p, team);
      a.rushYards += r.yards;
      a.rushAttempts = (a.rushAttempts || 0) + 1;
      a.rushTD += r.kind === "touchdown" ? 1 : 0;
    }
    let defenseTeam = m.poss === 0 ? m.b : m.a,
      tackle = exec.events.find(
        (x) => x.type === "Tackle" || x.type === "Sack",
      );
    if (tackle?.tacklerId) {
      let defender = exec.actors.find((a) => a.id === tackle.tacklerId);
      if (defender) {
        let d = stat(defender, defenseTeam);
        d.tackles++;
        if (tackle.type === "Sack") d.sacks++;
      }
    }
    const interception = exec.events.find((e) => e.type === "Interception");
    const interceptor = exec.actors.find((a) => a.id === interception?.actorId);
    if (interceptor) {
      const d = stat(interceptor, defenseTeam);
      d.defInterceptions = (d.defInterceptions || 0) + 1;
    }
    decisions.push({
      id: `${m.engine.seed}:${serial}`,
      team,
      call,
      formation,
      down: m.down,
      toGo: m.toGo,
      spot: m.spot,
      quarter: m.quarter,
      clock: m.clock,
      scoreDiff: m.score[m.poss] - m.score[1 - m.poss],
      kind: r.kind,
      yards: r.yards,
      a: m.a,
      b: m.b,
    });
    exec.context = {
      down: m.down,
      toGo: m.toGo,
      spot: m.spot,
      quarter: m.quarter,
      clock: m.clock,
      team: job.labels?.[m.poss] || "Team " + (team + 1),
      score: [...m.score],
    };
    m = withPossessionTempo(
      m,
      own,
      (x) => applyExecution(x, exec, job.labels?.[x.poss] || "Team " + (team + 1)),
      own && !manual ? o.tempo : undefined,
    );
    if (own && gamePlan) onsideKick(before, m, before.poss, gamePlan.onside, snapRoll(before, 31));
    if (m.events[0]?.highlight) highlights.unshift({ ...m.events[0] });
    lastExecution = exec;
    delete m.last.execution;
    plays++;
  }
  if (!plan.reached(m, plays))
    throw Error("Simulation exceeded the play safety limit.");
  if (lastExecution) m.last.execution = lastExecution;
  return {
    a: job.a,
    b: job.b,
    score: m.score,
    match: m,
    stats: Object.values(playerStats),
    decisions,
    plays,
    fromPlay,
    continuationFrom,
    target: plan.target,
    completed: Boolean(m.finished),
    highlights: highlights.slice(0, 4),
  };
}
if (typeof self !== "undefined" && typeof self.postMessage === "function")
  self.onmessage = (e) => {
    try {
      let results = e.data.jobs.map(simulateGame);
      self.postMessage({ id: e.data.id, results });
    } catch (error) {
      self.postMessage({ id: e.data.id, error: error.message });
    }
  };
