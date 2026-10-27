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
