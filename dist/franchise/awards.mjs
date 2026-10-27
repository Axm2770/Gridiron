import { roster, log } from "./state.mjs";
import {
  ensureCareerSystems,
  capturePreseason,
  hash,
  coachReputation,
  changeCoachReputation,
} from "./career-systems.mjs";
import { ensureRecordBook } from "./records.mjs";
export const AWARD_NAMES = {
  MVP: "Most Valuable Player",
  OPOY: "Offensive Player of the Year",
  DPOY: "Defensive Player of the Year",
  OROY: "Offensive Rookie of the Year",
  DROY: "Defensive Rookie of the Year",
  CPOY: "Comeback Player of the Year",
  COTY: "Coach of the Year",
  ACOTY: "Assistant Coach of the Year",
};
export const AP_POINTS = [10, 5, 3, 2, 1];
const offensive = (p) => ["QB", "RB", "WR", "TE", "OL"].includes(p.pos),
  defensive = (p) => ["DL", "LB", "CB", "S"].includes(p.pos);
const clamp = (n, a = 0, b = 120) => Math.max(a, Math.min(b, n));
export function playerAwardScore(p, award) {
  const a = p.stats || {},
    td = (a.rushTD || 0) + (a.recTD || 0);
  let production =
    p.pos === "QB"
      ? ((a.passYards || 0) / 5500) * 40 +
        ((a.passTD || 0) / 55) * 35 -
        (a.interceptions || 0) * 0.8 +
        ((a.rushYards || 0) / 1000) * 8 +
        (a.rushTD || 0) * 1.1 +
        (a.attempts > 20 ? (a.completions / a.attempts) * 10 : 0)
      : ["RB", "WR", "TE"].includes(p.pos)
        ? (((a.rushYards || 0) + (a.recYards || 0)) / 2300) * 55 +
          (td / 28) * 30 +
          ((a.receptions || 0) / 150) * 10
        : ((a.sacks || 0) / 25) * 55 +
          ((a.defInterceptions || 0) / 10) * 45 +
          ((a.tackles || 0) / 170) * 20;
  if (award === "MVP")
    production *=
      p.pos === "QB"
        ? 1.15
        : p.pos === "RB"
          ? 0.93
          : ["WR", "TE"].includes(p.pos)
            ? 0.84
            : 0.65;
  if (award === "OPOY" && p.pos === "QB") production *= 0.9;
  const team = p.teamRecord || { w: 0, l: 0 },
    wins = team.w || 0,
    seed = p.seed || 8;
  const recordBias =
    award === "MVP"
      ? wins * 1.6 + (seed <= 2 ? 5 : seed <= 7 ? 2 : 0)
      : wins * 0.25;
  const narrative =
    clamp((p.form ?? 6.5) - 6.5, -2, 3) * 1.2 +
    clamp((p.recognition ?? 50) - 65, -10, 30) * 0.035 +
    clamp((p.coachRep ?? 50) - 50, -20, 40) * 0.025;
  if (award === "CPOY")
    production += Math.min(16, (p.recoveryWeeks || 0) * 1.5);
  return {
    production,
    team: recordBias,
    narrative,
    total: production + recordBias + narrative,
  };
}
export function coachAwardScore(c) {
  const excess = c.wins - c.expectedWins,
    turnaround = c.priorWins === null ? 0 : c.wins - c.priorWins;
  return {
    production: c.wins * 2 + excess * 6 + Math.max(-5, turnaround) * 2.5,
    team: c.seed <= 2 ? 6 : c.seed <= 7 ? 3 : 0,
    narrative: (c.reputation - 50) * 0.07 + (c.lateForm - 6.5) * 1.2,
    total:
      c.wins * 2 +
      excess * 6 +
      Math.max(-5, turnaround) * 2.5 +
      (c.seed <= 2 ? 6 : c.seed <= 7 ? 3 : 0) +
      (c.reputation - 50) * 0.07 +
      (c.lateForm - 6.5) * 1.2,
  };
}
function seeds(teams) {
  const result = {};
  for (const offset of [0, 16]) {
    const ids = Array.from({ length: 16 }, (_, i) => i + offset),
      rank = (a) =>
        a
          .slice()
          .sort(
            (a, b) =>
              teams[b].w - teams[a].w ||
              teams[b].pf - teams[b].pa - (teams[a].pf - teams[a].pa) ||
              a - b,
          ),
      winners = Array.from(
        { length: 4 },
        (_, d) => rank(ids.slice(d * 4, d * 4 + 4))[0],
      ),
      ordered = [
        ...rank(winners),
        ...rank(ids.filter((t) => !winners.includes(t))).slice(0, 3),
      ];
    ordered.forEach((t, i) => (result[t] = i + 1));
  }
  return result;
}
function rookie(p, year) {
  return p.experience === 0 || p.draftYear === year;
}
export function awardsSnapshot(s) {
  const f = ensureCareerSystems(s),
    b = ensureRecordBook(s),
    expected = capturePreseason(s),
    seed = seeds(s.teams),
    players = [];
  for (let team = 0; team < 32; team++)
    for (const p of roster(s, team)) {
      const row = b.regularTotals[s.year]?.[p.id];
      if (!row || !Object.values(row.stats).some((n) => n > 0)) continue;
      const form = p.progression?.formHistory?.slice(-4) || [],
        injuries = p.progression?.injuries || [];
      players.push({
        id: p.id,
        name: p.name,
        team,
        pos: p.pos,
        ovr: p.ovr,
        experience: p.experience,
        draftYear: p.draftYear,
        headshot: p.headshot,
        face: p.face,
        stats: structuredClone(row.stats),
        seed: seed[team] || 8,
        teamRecord: { w: s.teams[team].w, l: s.teams[team].l },
        form: form.length ? form.reduce((a, b) => a + b, 0) / form.length : 6.5,
        recognition: p.reputation?.recognition ?? 50,
        coachRep:
          team === s.team
            ? coachReputation(s)
            : f.clubs[team].staff.find((c) => c.role === "HC")?.rating || 65,
        recoveryWeeks: injuries
          .filter((i) => i.year >= s.year - 1 && i.returned)
          .reduce((n, i) => Math.max(n, i.weeksMissed || 0), 0),
      });
    }
  const coaches = f.clubs
    .map((c, team) => {
      const staff = c.staff.find((c) => c.role === "HC"),
        entry = f.coachSeasons[s.year]?.[staff?.id],
        e = expected.teams[team],
        forms = players.filter((p) => p.team === team).map((p) => p.form);
      return {
        id: staff?.id || `hc-${team}`,
        name: staff?.name || "Interim head coach",
        team,
        wins: entry?.wins ?? s.teams[team].w,
        games: entry?.games ?? s.teams[team].w + s.teams[team].l,
        expectedWins: e.expectedWins,
        priorWins: e.priorWins,
        seed: seed[team] || 8,
        reputation:
          team === s.team && f.role === "HC"
            ? coachReputation(s)
            : staff?.rating || 65,
        lateForm: forms.length
          ? forms.reduce((a, b) => a + b, 0) / forms.length
          : 6.5,
      };
    })
    .filter((c) => c.games >= Math.min(8, Math.floor(s.schedule.length / 2)));
  const assistants = f.clubs.flatMap((c, team) =>
    c.staff
      .filter((c) => ["OC", "DC", "STC"].includes(c.role))
      .map((c) => {
        const t = s.teams[team],
          g = Math.max(1, t.w + t.l),
          expectedWins = expected.teams[team].expectedWins,
          production =
            c.role === "OC"
              ? (t.pf / g - 15) * 4
              : c.role === "DC"
                ? (30 - t.pa / g) * 4
                : (t.w - expectedWins) * 2 + 35;
        return {
          id: c.id,
          name: c.name,
          team,
          role: c.role,
          score: {
            production,
            team: t.w * 0.6,
            narrative: (c.rating - 70) * 0.1,
            total: production + t.w * 0.6 + (c.rating - 70) * 0.1,
          },
        };
      }),
  );
  return {
    year: s.year,
    teams: structuredClone(s.teams),
    players,
    coaches,
    assistants,
    coverage: b.coverage[s.year] || "Complete",
  };
}
export function rankedVote(candidates, year, award) {
  const all = candidates
    .map((c) => ({ ...c, breakdown: c.score || playerAwardScore(c, award) }))
    .filter((c) => Number.isFinite(c.breakdown.total));
  const scores = new Map(
    all.map((c) => [
      c.id,
      {
        id: c.id,
        name: c.name,
        team: c.team,
        playerId: c.pos ? c.id : null,
        coachId: c.pos ? null : c.id,
        pos: c.pos,
        points: 0,
        firstVotes: 0,
        ranks: [0, 0, 0, 0, 0],
        breakdown: c.breakdown,
        headshot: c.headshot,
        face: c.face,
      },
    ]),
  );
  const ballots = [];
  for (let voter = 0; voter < 50; voter++) {
    const ranked = all
      .map((c) => {
        const h = hash(`${year}:${award}:${voter}:${c.id}`),
          statTaste = 0.96 + (hash(`${award}:${voter}:stat`) % 9) / 100,
          storyTaste = 0.6 + (hash(`${voter}:story`) % 11) / 10;
        return {
          id: c.id,
          value:
            c.breakdown.production * statTaste +
            c.breakdown.team +
            c.breakdown.narrative * storyTaste +
            ((h % 1001) / 1000 - 0.5) * 9,
        };
      })
      .sort((a, b) => b.value - a.value || a.id.localeCompare(b.id))
      .slice(0, 5);
    ballots.push({ voter: voter + 1, ranked: ranked.map((x) => x.id) });
    ranked.forEach((c, i) => {
      const row = scores.get(c.id);
      row.points += AP_POINTS[i];
      row.ranks[i]++;
      if (!i) row.firstVotes++;
    });
  }
  const results = [...scores.values()]
    .filter((r) => r.points > 0)
    .sort(
      (a, b) =>
        b.points - a.points ||
        b.firstVotes - a.firstVotes ||
        a.id.localeCompare(b.id),
    );
  const top = results[0]?.points;
  for (const r of results) r.winner = r.points === top;
  return {
    award,
    year,
    voters: 50,
    points: [...AP_POINTS],
    ballots,
    results,
    finalists: results.slice(0, 5).map((r) => r.id),
  };
}
export function freezeAwards(s) {
  const f = ensureCareerSystems(s);
  f.awardBallots ??= {};
  if (f.awardBallots[s.year]) return f.awardBallots[s.year];
  const snapshot = awardsSnapshot(s),
    races = {};
  for (const award of Object.keys(AWARD_NAMES)) {
    let candidates;
    if (award === "COTY")
      candidates = snapshot.coaches.map((c) => ({
        ...c,
        score: coachAwardScore(c),
      }));
    else if (award === "ACOTY") candidates = snapshot.assistants;
    else
      candidates = snapshot.players.filter((p) =>
        award === "MVP"
          ? offensive(p) || defensive(p)
          : award === "OPOY"
            ? offensive(p)
            : award === "DPOY"
              ? defensive(p)
              : award === "OROY"
                ? offensive(p) && rookie(p, s.year)
                : award === "DROY"
                  ? defensive(p) && rookie(p, s.year)
                  : p.recoveryWeeks >= 6 && (p.stats.snaps || 0) >= 100,
      );
    races[award] = rankedVote(candidates, s.year, award);
  }
  const ballot = {
    year: s.year,
    locked: true,
    lockedWeek: s.week,
    phase: "Regular-season close",
    coverage: snapshot.coverage,
    announced: false,
    snapshot,
    races,
  };
  f.awardBallots[s.year] = ballot;
  log(
    s,
    "The awards ballot is sealed",
    "The regular-season voting is complete. Finalists and votes are preserved through the postseason.",
    "league",
  );
  return ballot;
}
export function announceAwards(s) {
  const f = ensureCareerSystems(s),
    ballot = f.awardBallots?.[s.year];
  if (!ballot || ballot.announced) return ballot;
  ballot.announced = true;
  for (const [award, race] of Object.entries(ballot.races))
    for (const winner of race.results.filter((r) => r.winner)) {
      if (
        f.awards.some(
          (a) =>
            a.year === s.year &&
            a.award === award &&
            (a.playerId === winner.playerId || a.coachId === winner.coachId) &&
            a.name === winner.name,
        )
      )
        continue;
      f.awards.push({
        year: s.year,
        award,
        playerId: winner.playerId,
        coachId: winner.coachId,
        name: winner.name,
        team: winner.team,
        score: winner.points,
        firstVotes: winner.firstVotes,
        method: "Ranked media ballot",
        coWinner: race.results.filter((r) => r.winner).length > 1,
      });
      if (winner.team === s.team && ["COTY", "ACOTY", "MVP"].includes(award))
        changeCoachReputation(
          s,
          `honor:${s.year}:${award}`,
          award === "COTY" ? 4 : 2,
          `${winner.name} wins ${AWARD_NAMES[award]}`,
          "Awards",
        );
      log(
        s,
        `${AWARD_NAMES[award]}: ${winner.name}`,
        `${winner.points} points · ${winner.firstVotes} first-place votes.`,
        "league",
      );
    }
  for (const [pos, count] of Object.entries({
    QB: 1,
    RB: 1,
    WR: 3,
    TE: 1,
    OL: 5,
    DL: 4,
    LB: 2,
    CB: 3,
    S: 2,
    K: 1,
    P: 1,
  })) {
    const rows = ballot.snapshot.players
      .filter((p) => p.pos === pos)
      .sort((a, b) => {
        const quality = (p) =>
          ["OL", "K", "P"].includes(pos)
            ? (p.stats.snaps || 0) * 0.01 + p.ovr * 0.4 + p.teamRecord.w * 0.5
            : playerAwardScore(p, offensive(p) ? "OPOY" : "DPOY").total;
        return quality(b) - quality(a) || a.id.localeCompare(b.id);
      });
    for (const [award, n] of [
      ["All-Pro", count],
      ["Pro Bowl", count * 2],
    ])
      for (const p of rows.slice(0, n))
        if (
          !f.awards.some(
            (a) =>
              a.year === s.year && a.award === award && a.playerId === p.id,
          )
        )
          f.awards.push({
            year: s.year,
            award,
            playerId: p.id,
            name: p.name,
            team: p.team,
            method: "Positional selection",
          });
  }
  return ballot;
}
