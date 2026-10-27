import { sortForLineup } from "./lineup.mjs";
import { simulateExecution } from "../engine/execution.mjs";
import {
  simTargetPlan,
  matchFingerprint,
  resumeSimulatedHalftime,
} from "../engine/sim-targets.mjs";
import { applyExecution } from "../engine/rules.mjs";
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
  const teams = [grouped(job.home, job.a), grouped(job.away, job.b)];
  const ownership = new Map([
    ...job.home.map((p) => [p.id, job.a]),
    ...job.away.map((p) => [p.id, job.b]),
  ]);
  while (!plan.reached(m, plays) && plays < 500) {
    if (m.halftime) {
      resumeSimulatedHalftime(m, {
        delegate: job.directives?.halftime,
        userTeam: job.userTeam,
      });
      if (plan.reached(m, plays)) break;
    }
    let own = (m.poss === 0 ? m.a : m.b) === job.userTeam,
      late = m.quarter === 4 && m.clock < 180,
      losing = m.score[m.poss] < m.score[1 - m.poss],
      directive = own ? job.directives : {},
      call =
        m.down === 4
          ? late && losing && m.spot < 60
            ? "Quick pass"
            : m.spot >= 60
              ? "Field goal"
              : "Punt"
          : directive?.feedRB && m.plays % 3 !== 0
            ? "Inside run"
            : directive?.protectQB
              ? "Quick pass"
              : m.plays % 3 === 0
                ? "Inside run"
                : "Quick pass";
    const tactics = job.tactics || {};
    if (own && tactics.calling === "Manual" && m.call) call = m.call;
    else if (
      own &&
      m.down !== 4 &&
      !directive?.protectQB &&
      !directive?.feedRB
    ) {
      if (tactics.style === "Run-first")
        call = m.plays % 5 < 3 ? "Inside run" : "Play action";
      if (tactics.style === "Vertical offense")
        call = m.plays % 3 === 0 ? "Inside run" : "Deep pass";
    }
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
    let exec = simulateExecution({
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
    });
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
      formation: own ? m.offense || "Shotgun spread" : "Shotgun spread",
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
    m = applyExecution(m, exec, job.labels?.[m.poss] || "Team " + (team + 1));
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
