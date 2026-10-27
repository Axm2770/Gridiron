import { announceAwards } from "./awards.mjs";
// Historical champion identities are factual database records; season year is used.
const champions =
  "GB GB NYJ KC IND DAL MIA MIA PIT PIT LV DAL PIT PIT LV SF WAS LV SF CHI NYG WAS SF SF NYG WAS DAL DAL SF DAL GB DEN DEN LAR BAL NE TB NE NE PIT IND NYG PIT NO GB NYG BAL SEA NE DEN NE PHI NE KC TB LAR KC KC PHI SEA".split(
    " ",
  );
export const historicChampions = champions.map((winner, i) => ({
  year: 1966 + i,
  winner,
  kind: "historical",
  source:
    i < 59
      ? "NFL 2025 Vikings Media Guide, All-Time Super Bowl Results"
      : "NFL Super Bowl LX results",
  mvp:
    i >= 53
      ? [
          "Patrick Mahomes",
          "Tom Brady",
          "Cooper Kupp",
          "Patrick Mahomes",
          "Patrick Mahomes",
          "Jalen Hurts",
          "Kenneth Walker III",
        ][i - 53]
      : "",
}));
export function recordPlayerStats(s, e, team) {
  let players = team === s.team ? s.roster : s.franchise.clubs[team]?.players;
  if (!players) return;
  let map = new Map(players.map((p) => [p.id, p])),
    r = e.result,
    qb = map.get(e.actors[0]?.id),
    runner = map.get(e.actors[r.carrier]?.id);
  const stat = (p) =>
    p
      ? (p.stats[s.year] ??= {
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
        })
      : null;
  const opponents =
    e.opponent === s.team
      ? s.roster
      : s.franchise.clubs[e.opponent]?.players || [];
  const participantMap = new Map(
    [...players, ...opponents].map((p) => [p.id, p]),
  );
  for (const id of new Set(e.actors.map((a) => a.id))) {
    const participant = participantMap.get(id);
    if (participant) {
      const entry = stat(participant);
      entry.snaps = (entry.snaps || 0) + 1;
    }
  }
  if (r.passing && r.kind !== "sack" && qb) {
    let q = stat(qb);
    q.attempts++;
    if (r.kind === "interception") q.interceptions++;
    else if (r.kind !== "incomplete") {
      q.completions++;
      q.passYards += r.yards;
      if (r.kind === "touchdown") q.passTD++;
      if (runner) {
        let a = stat(runner);
        a.receptions++;
        a.recYards += r.yards;
        if (r.kind === "touchdown") a.recTD++;
      }
    }
  } else if (
    !r.passing &&
    ["tackle", "touchdown", "outOfBounds"].includes(r.kind) &&
    runner
  ) {
    let a = stat(runner);
    a.rushYards += r.yards;
    a.rushAttempts = (a.rushAttempts || 0) + 1;
    if (r.kind === "touchdown") a.rushTD++;
  }
  const pick = e.events.find((x) => x.type === "Interception");
  const interceptor = opponents.find((p) => p.id === pick?.actorId);
  if (interceptor) {
    const st = stat(interceptor);
    st.defInterceptions = (st.defInterceptions || 0) + 1;
  }
  let defense =
    e.opponent === s.team ? s.roster : s.franchise.clubs[e.opponent]?.players;
  let tackle = e.events.find((x) => x.type === "Tackle" || x.type === "Sack");
  if (tackle) {
    let p = defense?.find(
      (p) => p.id === tackle.tacklerId || p.name === tackle.tackler,
    );
    if (p) {
      stat(p).tackles++;
      if (tackle.type === "Sack") stat(p).sacks++;
    }
  }
}
export function seasonAwards(s) {
  const f = s.franchise;
  announceAwards(s);
  if (!f.archive.some((a) => a.year === s.year))
    f.archive.push({
      year: s.year,
      teams: structuredClone(s.teams),
      players: Object.values(f.statBook?.regularTotals[s.year] || {}).map(
        (r) => ({
          id: r.id,
          name: r.name,
          pos: r.pos,
          team: r.team,
          ...r.stats,
        }),
      ),
      champion: s.history.at(-1)?.champion,
    });
}
