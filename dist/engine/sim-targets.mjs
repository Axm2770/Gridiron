// Target predicates are shared by the worker and UI. They only inspect committed match state.
export const SIM_TARGETS = {
  play: "Next play",
  five: "Next 5 plays",
  drive: "Next change of possession",
  quarter: "End of quarter",
  halftime: "Halftime",
  q2: "Start of Q2",
  q3: "Start of Q3",
  q4: "Start of Q4",
  final: "Final whistle",
};
export function matchFingerprint(m) {
  return [
    m.a,
    m.b,
    m.plays,
    m.quarter,
    m.clock,
    m.poss,
    m.spot,
    m.down,
    m.toGo,
    ...m.score,
    m.engine?.serial ?? 0,
    Boolean(m.halftime),
    Boolean(m.finished),
  ].join(":");
}
export function simTargetPlan(match, target = "final") {
  if (!Object.hasOwn(SIM_TARGETS, target))
    throw Error("Unknown simulation target.");
  const start = {
      quarter: match.quarter,
      halftime: Boolean(match.halftime),
      poss: match.halftime ? 1 : match.poss,
    },
    endQuarter = match.halftime ? 3 : match.quarter;
  const reached = (m, plays = 0) => {
    if (m.finished) return true;
    if (target === "final") return false;
    if (target === "halftime") return Boolean(m.halftime) || m.quarter > 2;
    if (/^q[234]$/.test(target)) return m.quarter >= Number(target[1]);
    if (m.halftime && !start.halftime) return true;
    if (target === "quarter") return m.quarter > endQuarter;
    if (target === "play") return plays >= 1;
    if (target === "five") return plays >= 5;
    if (target === "drive") return m.poss !== start.poss;
    return false;
  };
  return { target, label: SIM_TARGETS[target], reached };
}
export function resumeSimulatedHalftime(
  m,
  { delegate = false, userTeam } = {},
) {
  if (!m.halftime) return;
  if (delegate) {
    let side = m.a === userTeam ? 0 : 1;
    m.tempo = m.score[side] < m.score[1 - side] ? "Hurry-up" : "Normal";
  }
  m.halftime = false;
  m.quarter = 3;
  m.clock = 900;
  m.poss = 1;
  m.spot = m.settings?.touchback || 25;
  m.down = 1;
  m.toGo = 10;
  m.timeouts = [3, 3];
  m.events.unshift({
    text: "Second-half kickoff. The away team receives. Halftime adjustments delegated.",
    time: "Q3 15:00",
    highlight: true,
  });
}
