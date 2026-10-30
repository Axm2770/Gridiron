// League game log for head-to-head records and the championship list. Schedules are replaced
// every season, so settled scores are copied into franchise.matchups (additive, idempotent).
const key = (g) => `${g.year}:${g.phase}:${g.week}:${g.a}:${g.b}`;
function push(m, seen, g) {
  const k = key(g);
  if (seen.has(k)) return false;
  seen.add(k);
  m.games.push(g);
  return true;
}
const entry = (year, phase, week, g, final = false) => ({
  year,
  phase,
  week,
  a: g.a,
  b: g.b,
  score: [g.score[0], g.score[1]],
  ...(final ? { final: true } : {}),
});
const settled = (g) =>
  g && Array.isArray(g.score) && g.score.every(Number.isFinite);
export function ensureMatchups(s) {
  const f = s.franchise;
  const m = (f.matchups ??= { version: 1, games: [] });
  m.games ??= [];
  const seen = new Set(m.games.map(key));
  // Backfill the season in progress (saves created before the log existed).
  (s.schedule || []).forEach((week, w) => {
    for (const g of week || [])
      if (settled(g)) push(m, seen, entry(s.year, "season", w, g));
  });
  const rounds = s.playoffs?.rounds || [];
  rounds.forEach((round, r) => {
    const final =
      round.length === 1 && s.phase === "offseason" && r === rounds.length - 1;
    for (const g of round || [])
      if (settled(g)) push(m, seen, entry(s.year, "playoffs", r, g, final));
  });
  return m;
}
export function recordMatchups(s, games, info = {}) {
  const m = ensureMatchups(s),
    seen = new Set(m.games.map(key)),
    phase = info.phase || s.phase,
    roundIndex = s.playoffs?.rounds?.indexOf(games) ?? -1,
    week =
      phase === "season"
        ? (info.week ?? s.week)
        : roundIndex >= 0
          ? roundIndex
          : (info.round ?? 0),
    final = phase === "playoffs" && games.length === 1;
  let added = 0;
  for (const g of games) {
    if (!settled(g)) continue;
    const item = entry(s.year, phase, week, g, final);
    if (push(m, seen, item)) added++;
    else if (final) {
      // The backfill may have logged the deciding game before it was known to be the final.
      const k = key(item),
        logged = m.games.find((x) => key(x) === k);
      if (logged) logged.final = true;
    }
  }
  return added;
}
const sideOf = (g, team) => (g.a === team ? 0 : g.b === team ? 1 : -1);
// All meetings between two clubs, newest first, with the record from `team`'s side.
export function headToHead(s, team, opp, { recent = 5 } = {}) {
  const games = ensureMatchups(s)
    .games.filter(
      (g) => (g.a === team && g.b === opp) || (g.a === opp && g.b === team),
    )
    .map((g) => {
      const k = sideOf(g, team),
        pf = g.score[k],
        pa = g.score[1 - k];
      return {
        year: g.year,
        phase: g.phase,
        week: g.week,
        final: !!g.final,
        home: g.a === team,
        pf,
        pa,
        result: pf > pa ? "W" : pf < pa ? "L" : "T",
      };
    })
    .sort(
      (x, y) =>
        y.year - x.year ||
        (y.phase === "playoffs") - (x.phase === "playoffs") ||
        y.week - x.week,
    );
  const tally = (list) =>
    list.reduce(
      (t, g) => {
        t[g.result === "W" ? "wins" : g.result === "L" ? "losses" : "ties"]++;
        t.pf += g.pf;
        t.pa += g.pa;
        return t;
      },
      { wins: 0, losses: 0, ties: 0, pf: 0, pa: 0 },
    );
  let streak = null;
  for (const g of games) {
    if (!streak) streak = { result: g.result, count: 1 };
    else if (g.result === streak.result) streak.count++;
    else break;
  }
  return {
    team,
    opp,
    games,
    allTime: tally(games),
    recent: tally(games.slice(0, recent)),
    playoffs: tally(games.filter((g) => g.phase === "playoffs")),
    streak,
    last: games[0] || null,
  };
}
// One row per opponent `team` has met, most meetings first.
export function headToHeadTable(s, team, teamCount = 32) {
  const out = [];
  for (let opp = 0; opp < teamCount; opp++) {
    if (opp === team) continue;
    const h = headToHead(s, team, opp);
    if (h.games.length) out.push(h);
  }
  return out.sort(
    (a, b) =>
      b.games.length - a.games.length ||
      b.allTime.wins - b.allTime.losses - (a.allTime.wins - a.allTime.losses),
  );
}
// Championship list: career seasons (with runner-up and score from the game log) and the
// historical database. A career season replaces a historical entry for the same year.
export function championshipList(s, teams) {
  const f = s.franchise,
    log = ensureMatchups(s).games,
    archive = new Map((f.archive || []).map((a) => [a.year, a])),
    awards = f.awards || [];
  const career = (s.history || []).map((h) => {
    const final =
        log.find((g) => g.year === h.year && g.final) ||
        log
          .filter((g) => g.year === h.year && g.phase === "playoffs")
          .sort((x, y) => y.week - x.week)[0],
      k = final ? sideOf(final, h.champion) : -1,
      runnerUp = final && k >= 0 ? (k === 0 ? final.b : final.a) : null,
      season = archive.get(h.year)?.teams?.[h.champion],
      mvp = awards.find((a) => a.year === h.year && a.award === "MVP");
    return {
      year: h.year,
      kind: "career",
      winner: h.champion,
      winnerName: teams[h.champion]?.slice(1, 3).join(" ") || "Unknown",
      runnerUp,
      runnerUpName:
        runnerUp === null ? "" : teams[runnerUp]?.slice(1, 3).join(" ") || "",
      score: final && k >= 0 ? [final.score[k], final.score[1 - k]] : null,
      mvp: h.mvp || "",
      seasonMvp: mvp ? mvp.name : "",
      record: season ? `${season.w}–${season.l}` : "",
      pointsFor: season?.pf ?? null,
      pointsAgainst: season?.pa ?? null,
    };
  });
  const years = new Set(career.map((c) => c.year));
  const historical = (f.history || [])
    .filter((h) => !years.has(h.year))
    .map((h) => {
      const team = teams.findIndex((c) => c[0] === h.winner);
      return {
        year: h.year,
        kind: h.kind || "historical",
        winner: team,
        winnerName: team < 0 ? h.winner : teams[team].slice(1, 3).join(" "),
        runnerUp: null,
        runnerUpName: h.runnerUp || "",
        score: Array.isArray(h.score) ? h.score : null,
        mvp: h.mvp || "",
        seasonMvp: "",
        record: "",
        pointsFor: null,
        pointsAgainst: null,
      };
    });
  return [...career, ...historical].sort((a, b) => b.year - a.year);
}
// Title counts per club across the whole list.
export function titleCounts(list) {
  const counts = new Map();
  for (const c of list)
    if (c.winner >= 0) counts.set(c.winner, (counts.get(c.winner) || 0) + 1);
  return [...counts.entries()].sort((a, b) => b[1] - a[1]);
}
