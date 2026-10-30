import { financeYear } from "./state.mjs";
import { socialPulse } from "./social-engine.mjs";

// Read model for the locker room: who is happy, who is not, and why.
export const MOOD_BANDS = [
  [75, "Happy", "good"],
  [60, "Content", ""],
  [45, "Unsettled", "warn"],
  [0, "Unhappy", "bad"],
];
export const moodBand = (m) => MOOD_BANDS.find(([min]) => m >= min);
const leaderScore = (p) => (p.persona?.leadership ?? 0.5) + (p.age || 25) / 50;

function playerCauses(s, p, startersByPos) {
  const causes = [],
    add = (text, tone) => causes.push({ text, tone });
  if (p.holdout) add("Holding out for a new contract", "bad");
  if (p.tradeDemand) add("Has asked for a trade", "bad");
  if (p.injury) add(`Injured, out ${p.injury} week${p.injury === 1 ? "" : "s"}`, "warn");
  const c = s.franchise.contracts?.[p.id];
  if (c && !c.ended && c.start + c.years - 1 <= financeYear(s))
    add("Contract expires this season", "warn");
  const starters = startersByPos[p.pos] || [];
  if (!p.starter && !p.injury && starters.length && p.ovr >= Math.min(...starters))
    add("Wants more playing time", "warn");
  if (p.starter && (p.morale ?? 75) >= 70) add("Secure starting role", "good");
  for (const e of (p.moodLog || []).slice(0, 3))
    if (e.delta && e.year === s.year && s.week - e.week <= 3)
      add(`${e.reason} (${e.delta > 0 ? "+" : ""}${e.delta})`, e.delta > 0 ? "good" : "bad");
  return causes.slice(0, 4);
}

function recentResults(s) {
  const out = [];
  for (let w = Math.min(s.week, s.schedule.length) - 1; w >= 0 && out.length < 3; w--) {
    const g = s.schedule[w]?.find((g) => (g.a === s.team || g.b === s.team) && g.score);
    if (!g) continue;
    const k = g.a === s.team ? 0 : 1;
    out.push(g.score[k] > g.score[1 - k] ? "W" : g.score[k] < g.score[1 - k] ? "L" : "T");
  }
  return out;
}

export function lockerReport(s) {
  const roster = s.roster.filter((p) => p.status !== "retired"),
    startersByPos = {};
  for (const p of roster.filter((p) => p.starter && !p.injury))
    (startersByPos[p.pos] ??= []).push(p.ovr);
  const players = roster
    .map((p) => {
      const morale = Math.round(p.morale ?? 75),
        [, label, tone] = moodBand(morale);
      return {
        id: p.id,
        name: p.name,
        pos: p.pos,
        ovr: p.ovr,
        age: p.age,
        starter: !!p.starter,
        morale,
        trust: Math.round(p.coachTrust ?? 60),
        leadership: Math.round((p.persona?.leadership ?? 0.5) * 100),
        mood: label,
        tone,
        causes: playerCauses(s, p, startersByPos),
        concern: p.holdout || p.tradeDemand || morale < 60,
      };
    })
    .sort((a, b) => a.morale - b.morale || b.ovr - a.ovr);
  const leaders = roster
      .slice()
      .sort((a, b) => leaderScore(b) - leaderScore(a))
      .slice(0, 5)
      .map((p) => players.find((x) => x.id === p.id)),
    pulse = socialPulse(s),
    counts = Object.fromEntries(MOOD_BANDS.map(([, l]) => [l, 0]));
  for (const p of players) counts[p.mood]++;
  const avgMorale = players.length
      ? Math.round(players.reduce((n, p) => n + p.morale, 0) / players.length)
      : 0,
    leadership = leaders.length
      ? Math.round(leaders.slice(0, 3).reduce((n, p) => n + p.leadership, 0) / Math.min(3, leaders.length))
      : 0,
    results = recentResults(s),
    teamCauses = [];
  const wins = results.filter((r) => r === "W").length;
  if (results.length)
    teamCauses.push({
      text: `Recent form ${results.join("-")}`,
      tone: wins >= 2 ? "good" : wins === 0 ? "bad" : "",
    });
  teamCauses.push({
    text: `Chemistry ${pulse.chemistry} and drama ${pulse.drama}: weekly morale ${pulse.moraleModifier > 0 ? "+" : ""}${pulse.moraleModifier}`,
    tone: pulse.moraleModifier > 0 ? "good" : pulse.moraleModifier < 0 ? "bad" : "",
  });
  const leaderMood = leaders.length ? Math.round(leaders.reduce((n, p) => n + p.morale, 0) / leaders.length) : 0;
  teamCauses.push({
    text: `Leaders' morale ${leaderMood}%${leaderMood < 60 ? ": unhappy leaders drag the room down" : ""}`,
    tone: leaderMood >= 70 ? "good" : leaderMood < 60 ? "bad" : "",
  });
  const recentTeam = (s.roster.flatMap((p) => p.moodLog || []).find((e) => /^Team message:/.test(e.reason) && e.year === s.year));
  if (recentTeam)
    teamCauses.push({ text: recentTeam.reason.replace(/^Team message: /, "Team talk: "), tone: recentTeam.delta > 0 ? "good" : "bad" });
  return {
    teamMorale: Math.round(s.morale ?? avgMorale),
    avgMorale,
    chemistry: pulse.chemistry,
    drama: pulse.drama,
    moraleModifier: pulse.moraleModifier,
    pulseLabel: pulse.label,
    leadership,
    unhappy: players.filter((p) => p.concern),
    counts,
    leaders,
    players,
    teamCauses,
    results,
  };
}
