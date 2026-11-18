import * as S from "./state.mjs";
export const STAT_VIEWS = {
  Passing: [
    ["attempts", "Att"],
    ["completions", "Cmp"],
    ["completionPct", "Cmp %"],
    ["passYards", "Yards"],
    ["yardsPerAttempt", "Y/A"],
    ["passTD", "TD"],
    ["interceptions", "INT"],
  ],
  Rushing: [
    ["rushAttempts", "Att"],
    ["rushYards", "Yards"],
    ["yardsPerCarry", "Y/C"],
    ["rushTD", "TD"],
    ["snaps", "Snaps"],
  ],
  Receiving: [
    ["receptions", "Rec"],
    ["recYards", "Yards"],
    ["yardsPerReception", "Y/Rec"],
    ["recTD", "TD"],
    ["snaps", "Snaps"],
  ],
  Defense: [
    ["tackles", "Tackles"],
    ["sacks", "Sacks"],
    ["defInterceptions", "INT"],
    ["snaps", "Snaps"],
  ],
  Workload: [
    ["snaps", "Snaps"],
    ["morale", "Morale"],
    ["fitness", "Condition"],
    ["form", "Form"],
    ["training", "Training"],
    ["growth", "Ability Δ"],
  ],
};
export const RATE_KEYS = new Set([
  "completionPct",
  "yardsPerAttempt",
  "yardsPerCarry",
  "yardsPerReception",
  "morale",
  "fitness",
  "form",
  "training",
  "growth",
]);
export function seasonStats(p, year) {
  const raw =
    year === "Career"
      ? Object.values(p.stats || {}).reduce((a, b) => {
          for (const [k, v] of Object.entries(b))
            if (Number.isFinite(v)) a[k] = (a[k] || 0) + v;
          return a;
        }, {})
      : p.stats?.[year] || {};
  const divide = (a, b, m = 1) =>
    raw[b] > 0 ? ((raw[a] || 0) / raw[b]) * m : null;
  return {
    ...raw,
    completionPct: divide("completions", "attempts", 100),
    yardsPerAttempt: divide("passYards", "attempts"),
    yardsPerCarry: divide("rushYards", "rushAttempts"),
    yardsPerReception: divide("recYards", "receptions"),
    morale: p.morale ?? null,
    fitness: p.fitness ?? null,
    form: p.progression?.form ?? null,
    training: p.progression?.training ?? null,
    growth: p.progression?.lastReport?.delta ?? null,
  };
}
export function statValue(stats, key, mode = "Totals") {
  const n = stats[key];
  if (!Number.isFinite(n)) return null;
  if (mode === "Per 100 snaps" && !RATE_KEYS.has(key) && key !== "snaps")
    return stats.snaps > 0 ? (n / stats.snaps) * 100 : null;
  return n;
}
export function allPlayers(s) {
  return Array.from({ length: 32 }, (_, team) =>
    S.roster(s, team).map((p) => ({ p, team })),
  ).flat();
}
export function statRows(
  s,
  {
    category = "Passing",
    year = s.year,
    scope = "League",
    team = s.team,
    query = "",
    mode = "Totals",
    minimum = 0,
    sort,
    direction = -1,
  } = {},
) {
  const positions = {
    Passing: ["QB"],
    Rushing: ["QB", "RB", "WR"],
    Receiving: ["RB", "WR", "TE"],
    Defense: ["DL", "LB", "CB", "S"],
  };
  const key =
    sort ||
    {
      Passing: "passYards",
      Rushing: "rushYards",
      Receiving: "recYards",
      Defense: "tackles",
      Workload: "snaps",
    }[category];
  const q = query
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "");
  return allPlayers(s)
    .filter(
      ({ p, team: t }) =>
        (scope === "League" || t === Number(team)) &&
        (!positions[category] || positions[category].includes(p.pos)) &&
        p.name
          .toLowerCase()
          .normalize("NFKD")
          .replace(/[\u0300-\u036f]/g, "")
          .includes(q),
    )
    .map(({ p, team }) => ({ p, team, stats: seasonStats(p, year) }))
    .filter(({ stats }) => (stats.snaps || 0) >= minimum)
    .sort((a, b) => {
      const av = statValue(a.stats, key, mode),
        bv = statValue(b.stats, key, mode);
      if (av === null && bv === null) return a.p.name.localeCompare(b.p.name);
      if (av === null) return 1;
      if (bv === null) return -1;
      return direction * (av - bv) || a.p.name.localeCompare(b.p.name);
    });
}
const avg = (a) => (a.length ? a.reduce((s, x) => s + x, 0) / a.length : null);
export function teamReport(s, team = s.team) {
  const roster = S.roster(s, team),
    t = s.teams[team],
    games = t.w + t.l + (t.t || 0),
    available = roster.filter(
      (p) =>
        (p.status === "active" || p.status === "elevated") &&
        !p.injury &&
        !p.holdout,
    );
  const played = (s.schedule || []).flatMap((w, index) =>
    w
      .filter((g) => g.score && (g.a === team || g.b === team))
      .map((g) => ({
        week: index + 1,
        opponent: g.a === team ? g.b : g.a,
        for: g.score[g.a === team ? 0 : 1],
        against: g.score[g.a === team ? 1 : 0],
      })),
  );
  return {
    team,
    games,
    ppg: games ? t.pf / games : null,
    allowed: games ? t.pa / games : null,
    differential: games ? (t.pf - t.pa) / games : null,
    available: available.length,
    injured: roster.filter((p) => p.injury).length,
    morale: avg(roster.map((p) => p.morale ?? 75)),
    training: avg(
      roster.map((p) => p.progression?.training).filter(Number.isFinite),
    ),
    form: avg(roster.map((p) => p.progression?.form).filter(Number.isFinite)),
    ovr: avg(available.filter((p) => p.starter).map((p) => p.ovr)),
    played,
    roster,
  };
}
export function leagueBenchmarks(s) {
  const reports = Array.from({ length: 32 }, (_, i) => teamReport(s, i));
  return {
    reports,
    ppg: avg(reports.map((t) => t.ppg).filter(Number.isFinite)),
    allowed: avg(reports.map((t) => t.allowed).filter(Number.isFinite)),
    morale: avg(reports.map((t) => t.morale).filter(Number.isFinite)),
    training: avg(reports.map((t) => t.training).filter(Number.isFinite)),
  };
}
export function csvText(headers, rows) {
  const cell = (v) => {
    let t = String(v ?? "");
    if (/^[=+\-@]/.test(t)) t = "'" + t;
    return '"' + t.replaceAll('"', '""') + '"';
  };
  return [headers, ...rows].map((r) => r.map(cell).join(",")).join("\r\n");
}

// ---------------------------------------------------------------------------------------------
// Read-only analytics for the Data & analysis screen. Everything below is derived from what the
// game records: settled scores (schedule), regular-season player totals per club
// (franchise.statBook.teamTotals, falling back to current rosters), your club's per-game player
// lines (statBook.games) and your playcalling ledger (franchise.decisionLedger). Nothing here
// mutates state. Metrics the engine does not record (third downs, red zone, fumbles, kicking)
// are intentionally absent.

const sumStats = (rows) => {
  const out = {};
  for (const st of rows)
    for (const [k, v] of Object.entries(st || {}))
      if (Number.isFinite(v)) out[k] = (out[k] || 0) + v;
  return out;
};
/** Season counting totals for a club: recorded regular-season totals, else its current roster. */
export function teamTotals(s, team, year = s.year) {
  const book = s.franchise?.statBook?.teamTotals?.[year]?.[team];
  if (book && Object.keys(book).length)
    return sumStats(Object.values(book).map((r) => r.stats));
  return sumStats(S.roster(s, team).map((p) => p.stats?.[year]));
}
// Team metrics: key, label, short label, unit and whether higher is better.
export const TEAM_METRICS = [
  ["ppg", "Points scored", "PTS", "per game", true],
  ["allowed", "Points allowed", "PA", "per game", false],
  ["differential", "Point differential", "DIFF", "per game", true],
  ["yards", "Offensive yards", "YDS", "per game", true],
  ["passYards", "Passing yards", "PASS", "per game", true],
  ["rushYards", "Rushing yards", "RUSH", "per game", true],
  ["completionPct", "Completion rate", "CMP%", "%", true],
  ["yardsPerCarry", "Yards per carry", "Y/C", "yards", true],
  ["giveaways", "Interceptions thrown", "INT", "per game", false],
  ["sacks", "Sacks", "SACK", "per game", true],
  ["takeaways", "Interceptions made", "TAKE", "per game", true],
].map(([key, label, short, unit, higher]) => ({ key, label, short, unit, higher }));

/** Per-game team profile for one club (null values when no games are recorded). */
export function teamProfile(s, team = s.team, year = s.year) {
  const t = s.teams[team],
    games = t.w + t.l + (t.t || 0),
    tot = teamTotals(s, team, year),
    pg = (v) => (games ? (v || 0) / games : null);
  return {
    team,
    games,
    record: [t.w, t.l, t.t || 0],
    ppg: games ? t.pf / games : null,
    allowed: games ? t.pa / games : null,
    differential: games ? (t.pf - t.pa) / games : null,
    yards: pg((tot.passYards || 0) + (tot.rushYards || 0)),
    passYards: pg(tot.passYards),
    rushYards: pg(tot.rushYards),
    completionPct: tot.attempts > 0 ? ((tot.completions || 0) / tot.attempts) * 100 : null,
    yardsPerCarry: tot.rushAttempts > 0 ? (tot.rushYards || 0) / tot.rushAttempts : null,
    giveaways: pg(tot.interceptions),
    sacks: pg(tot.sacks),
    takeaways: pg(tot.defInterceptions),
  };
}
/** Rank of `value` among `values` (1 = best). Ties share the better rank. */
export function rankOf(value, values, higher = true) {
  if (!Number.isFinite(value)) return null;
  return 1 + values.filter((v) => Number.isFinite(v) && (higher ? v > value : v < value)).length;
}
/** Every TEAM_METRIC for `team` with league rank, average, best and worst. */
export function leagueRanks(s, team = s.team, year = s.year) {
  const profiles = Array.from({ length: 32 }, (_, i) => teamProfile(s, i, year)).filter((p) => p.games > 0);
  const mine = teamProfile(s, team, year);
  return {
    teams: profiles.length,
    profile: mine,
    metrics: TEAM_METRICS.map((m) => {
      const vals = profiles.map((p) => p[m.key]).filter(Number.isFinite);
      const value = mine[m.key];
      return {
        ...m,
        value,
        rank: mine.games ? rankOf(value, vals, m.higher) : null,
        avg: avg(vals),
        best: vals.length ? (m.higher ? Math.max(...vals) : Math.min(...vals)) : null,
        worst: vals.length ? (m.higher ? Math.min(...vals) : Math.max(...vals)) : null,
        max: vals.length ? Math.max(...vals, 0) : null,
      };
    }),
  };
}
/**
 * Week-by-week line for a club's regular season: points for/against from the schedule, and for
 * your own club the yards, interceptions and sacks from its recorded per-game player lines.
 */
export function weeklyTrend(s, team = s.team) {
  const book = s.franchise?.statBook,
    lines = new Map();
  if (team === s.team && book)
    for (const g of book.games || []) {
      if (g.year !== s.year || g.team !== team || !String(g.key || "").includes(":season:")) continue;
      const w = lines.get(g.week) || {};
      lines.set(g.week, w);
      for (const [k, v] of Object.entries(g.stats || {})) if (Number.isFinite(v)) w[k] = (w[k] || 0) + v;
    }
  return (s.schedule || []).flatMap((week, index) =>
    (week || [])
      .filter((g) => Array.isArray(g.score) && (g.a === team || g.b === team))
      .map((g) => {
        const k = g.a === team ? 0 : 1,
          st = lines.get(index);
        return {
          week: index + 1,
          opponent: g.a === team ? g.b : g.a,
          home: g.a === team,
          for: g.score[k],
          against: g.score[1 - k],
          result: g.score[k] > g.score[1 - k] ? "W" : g.score[k] < g.score[1 - k] ? "L" : "T",
          yards: st ? (st.passYards || 0) + (st.rushYards || 0) : null,
          passYards: st ? st.passYards || 0 : null,
          rushYards: st ? st.rushYards || 0 : null,
          giveaways: st ? st.interceptions || 0 : null,
          sacks: st ? st.sacks || 0 : null,
          takeaways: st ? st.defInterceptions || 0 : null,
        };
      }),
  );
}
const RUN_CALLS = /run|draw|sweep|option|sneak/i,
  KICK_CALLS = /^(punt|field goal|kick)/i;
/** Your offensive playcalling this season from the decision ledger: run/pass mix and 4th downs. */
export function playMix(s, year = s.year) {
  const ledger = s.franchise?.decisionLedger || {},
    calls = {},
    fourths = [];
  let games = 0;
  for (const [key, e] of Object.entries(ledger)) {
    if (!key.startsWith(year + ":")) continue;
    if (Object.values(e.calls || {}).some((v) => v > 0)) games++;
    for (const [c, v] of Object.entries(e.calls || {})) calls[c] = (calls[c] || 0) + v;
    fourths.push(...(e.fourths || []));
  }
  let run = 0,
    pass = 0,
    kick = 0;
  for (const [c, v] of Object.entries(calls)) {
    if (KICK_CALLS.test(c)) kick += v;
    else if (RUN_CALLS.test(c)) run += v;
    else pass += v;
  }
  const plays = run + pass;
  return {
    games,
    plays,
    run,
    pass,
    kick,
    runPct: plays ? (run / plays) * 100 : null,
    passPct: plays ? (pass / plays) * 100 : null,
    calls: Object.entries(calls)
      .filter(([c]) => !KICK_CALLS.test(c))
      .sort((a, b) => b[1] - a[1]),
    fourthTries: fourths.length,
    fourthMade: fourths.filter((f) => f.good).length,
  };
}
// Position groups for unit ratings: how many of the best healthy players at each position count.
export const UNITS = [
  ["QB", "Quarterback", { QB: 1 }],
  ["RB", "Running back", { RB: 1 }],
  ["REC", "Receivers", { WR: 3, TE: 1 }],
  ["OL", "Offensive line", { OL: 5 }],
  ["DL", "Defensive line", { DL: 4 }],
  ["LB", "Linebackers", { LB: 3 }],
  ["DB", "Secondary", { CB: 2, S: 2 }],
  ["ST", "Specialists", { K: 1, P: 1 }],
].map(([key, label, slots]) => ({ key, label, slots }));
/** Average overall of each unit's best healthy players for one club. */
export function unitRatings(s, team = s.team) {
  const healthy = S.roster(s, team).filter(
    (p) => !p.injury && p.status !== "practice" && p.status !== "ir",
  );
  const out = {};
  for (const u of UNITS) {
    const picked = [];
    for (const [pos, n] of Object.entries(u.slots))
      picked.push(
        ...healthy
          .filter((p) => p.pos === pos)
          .sort((a, b) => b.ovr - a.ovr)
          .slice(0, n),
      );
    out[u.key] = picked.length ? avg(picked.map((p) => p.ovr)) : null;
  }
  return out;
}
/** Unit ratings for `team` with league average and rank per unit. */
export function unitComparison(s, team = s.team) {
  const all = Array.from({ length: 32 }, (_, i) => unitRatings(s, i));
  return UNITS.map((u) => {
    const vals = all.map((r) => r[u.key]).filter(Number.isFinite),
      value = all[team][u.key];
    return {
      ...u,
      value,
      avg: avg(vals),
      rank: rankOf(value, vals, true),
      best: vals.length ? Math.max(...vals) : null,
    };
  });
}
// League leaderboards shown on the Leaders tab.
export const LEADERS = [
  ["passYards", "Passing yards"],
  ["passTD", "Passing TD"],
  ["rushYards", "Rushing yards"],
  ["recYards", "Receiving yards"],
  ["receptions", "Receptions"],
  ["tackles", "Tackles"],
  ["sacks", "Sacks"],
  ["defInterceptions", "Interceptions"],
].map(([key, label]) => ({ key, label }));
/** Top `n` league players for a counting stat (positive values only). */
export function leaders(s, key, { n = 5, year = s.year } = {}) {
  return allPlayers(s)
    .map(({ p, team }) => ({ p, team, value: seasonStats(p, year)[key] }))
    .filter((r) => Number.isFinite(r.value) && r.value > 0)
    .sort((a, b) => b.value - a.value || a.p.name.localeCompare(b.p.name))
    .slice(0, n);
}
