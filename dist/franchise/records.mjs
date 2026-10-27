import { roster, log } from "./state.mjs";
import {
  ensureCareerSystems,
  changeCoachReputation,
} from "./career-systems.mjs";
const fields = {
  passYards: "Passing yards",
  passTD: "Passing touchdowns",
  rushYards: "Rushing yards",
  rushTD: "Rushing touchdowns",
  recYards: "Receiving yards",
  receptions: "Receptions",
  recTD: "Receiving touchdowns",
  sacks: "Official sacks",
  defInterceptions: "Interceptions",
};
export const RECORD_FIELDS = fields;
export const HISTORICAL_RECORDS = [
  [
    "passYards",
    554,
    "Norm Van Brocklin",
    1951,
    5477,
    "Peyton Manning",
    2013,
    89214,
    "Tom Brady",
    2022,
  ],
  [
    "passTD",
    7,
    "Shared record",
    null,
    55,
    "Peyton Manning",
    2013,
    649,
    "Tom Brady",
    2022,
  ],
  [
    "rushYards",
    296,
    "Adrian Peterson",
    2007,
    2105,
    "Eric Dickerson",
    1984,
    18355,
    "Emmitt Smith",
    2004,
  ],
  [
    "rushTD",
    6,
    "Shared record",
    null,
    28,
    "LaDainian Tomlinson",
    2006,
    164,
    "Emmitt Smith",
    2004,
  ],
  [
    "recYards",
    336,
    "Flipper Anderson",
    1989,
    1964,
    "Calvin Johnson",
    2012,
    22895,
    "Jerry Rice",
    2004,
  ],
  [
    "receptions",
    21,
    "Brandon Marshall",
    2009,
    149,
    "Michael Thomas",
    2019,
    1549,
    "Jerry Rice",
    2004,
  ],
  [
    "recTD",
    5,
    "Shared record",
    null,
    23,
    "Randy Moss",
    2007,
    197,
    "Jerry Rice",
    2004,
  ],
  [
    "sacks",
    7,
    "Derrick Thomas",
    1990,
    23,
    "Myles Garrett",
    2025,
    200,
    "Bruce Smith",
    2003,
  ],
  [
    "defInterceptions",
    4,
    "Shared record",
    null,
    14,
    "Night Train Lane",
    1952,
    81,
    "Paul Krause",
    1979,
  ],
].flatMap(([metric, ...a]) =>
  ["game", "season", "career"].map((scope, i) => ({
    id: `league:${scope}:${metric}`,
    entity: "Player",
    metric,
    label: fields[metric],
    scope,
    value: a[i * 3],
    name: a[i * 3 + 1],
    year: a[i * 3 + 2],
    historical: true,
    team: null,
  })),
);
let historicalCareers = new Map();
const normalized = (s) =>
  String(s)
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "")
    .replace(/(jr|sr|iii|ii)$/, "");
export function configureCareerHistory(data) {
  historicalCareers = new Map(
    (data?.players || []).map((p) => [`${normalized(p.name)}:${p.pos}`, p]),
  );
}
export function historicalCareerFor(p) {
  if (!p?.realPlayer) return null;
  return historicalCareers.get(`${normalized(p.name)}:${p.pos}`) || null;
}
export function ensureRecordBook(s) {
  const f = ensureCareerSystems(s);
  if (!f.statBook) {
    f.statBook = {
      version: 1,
      startYear: s.year,
      lastTotals: {},
      regularTotals: {},
      coverage: {
        [s.year]: s.phase === "season" ? "Complete" : "Upgrade boundary",
      },
      records: {},
      games: [],
      seen: [],
      alerts: [],
      alertKeys: [],
    };
    const b = f.statBook;
    b.regularTotals[s.year] = {};
    for (let team = 0; team < 32; team++)
      for (const p of roster(s, team))
        if (p.stats?.[s.year]) {
          b.lastTotals[`${s.year}:${p.id}`] = { ...p.stats[s.year] };
          if (s.phase === "season")
            b.regularTotals[s.year][p.id] = {
              id: p.id,
              name: p.name,
              pos: p.pos,
              team,
              stats: { ...p.stats[s.year] },
            };
        }
  }
  const b = f.statBook;
  b.teamTotals ??= {};
  for (const r of HISTORICAL_RECORDS) b.records[r.id] ??= { ...r };
  for (const r of [
    {
      id: "coach:game:points",
      entity: "Coach",
      metric: "points",
      label: "Single-game points",
      scope: "game",
      value: 72,
      name: "Washington coaching staff",
      year: 1966,
    },
    {
      id: "coach:season:wins",
      entity: "Coach",
      metric: "wins",
      label: "Regular-season wins",
      scope: "season",
      value: 16,
      name: "Shared record",
      year: null,
    },
    {
      id: "coach:career:wins",
      entity: "Coach",
      metric: "wins",
      label: "Regular-season wins",
      scope: "career",
      value: 328,
      name: "Don Shula",
      year: 1995,
    },
    {
      id: "coach:career:titles",
      entity: "Coach",
      metric: "titles",
      label: "Super Bowl victories",
      scope: "career",
      value: 6,
      name: "Bill Belichick",
      year: 2018,
    },
  ])
    b.records[r.id] ??= { ...r, historical: true, team: null };
  return b;
}
function alert(s, key, item) {
  const b = ensureRecordBook(s);
  if (b.alertKeys.includes(key)) return;
  b.alertKeys.push(key);
  b.alertKeys = b.alertKeys.slice(-2200);
  const entry = { key, year: s.year, week: s.week, ...item };
  b.alerts.unshift(entry);
  b.alerts = b.alerts.slice(0, 100);
  if (item.team === s.team || item.broken)
    log(
      s,
      item.broken ? "A record falls" : "Record watch",
      `${item.name}: ${item.label.toLowerCase()} · ${item.value.toLocaleString("en-US")} ${item.broken ? "sets a new mark." : `closes on ${item.target.toLocaleString("en-US")}.`}`,
      "league",
    );
}
function consider(s, recordKey, candidate, { announce = false } = {}) {
  const b = ensureRecordBook(s),
    old = b.records[recordKey];
  if (!Number.isFinite(candidate.value) || candidate.value <= 0) return;
  if (
    old &&
    candidate.value >= old.value * 0.9 &&
    candidate.value < old.value &&
    announce
  )
    alert(
      s,
      `${s.year}:${candidate.scope}:${candidate.metric}:${candidate.playerId || candidate.coachId}:near`,
      { ...candidate, target: old.value, broken: false },
    );
  if (!old || candidate.value > old.value) {
    b.records[recordKey] = { ...candidate, id: recordKey, historical: false };
    if (old && announce) {
      alert(
        s,
        `${s.year}:${candidate.scope}:${candidate.metric}:${candidate.playerId || candidate.coachId}:broken`,
        { ...candidate, target: old.value, broken: true },
      );
      if (candidate.team === s.team)
        changeCoachReputation(
          s,
          "record:" + recordKey + ":" + s.year,
          3,
          "A league record was broken under your leadership",
          "Records",
        );
    }
  }
}
export function regularCareerTotals(s, p) {
  const b = ensureRecordBook(s),
    base = historicalCareerFor(p),
    out = { ...(base?.stats || {}) };
  for (const rows of Object.values(b.regularTotals)) {
    const r = rows[p.id];
    if (r)
      for (const [k, v] of Object.entries(r.stats))
        if (Number.isFinite(v)) out[k] = (out[k] || 0) + v;
  }
  return out;
}
export function recordRound(s, results, info) {
  const b = ensureRecordBook(s),
    f = s.franchise;
  if (b.seen.includes(info.key)) return false;
  b.seen.push(info.key);
  b.seen = b.seen.slice(-1000);
  const regular = info.phase === "season";
  b.regularTotals[s.year] ??= {};
  b.coverage[s.year] ??= "Complete";
  for (const game of results) {
    for (const team of [game.a, game.b]) {
      for (const p of roster(s, team)) {
        const current = p.stats?.[s.year] || {},
          prior = b.lastTotals[`${s.year}:${p.id}`] || {},
          delta = {};
        for (const [k, v] of Object.entries(current))
          if (Number.isFinite(v)) delta[k] = v - (prior[k] || 0);
        b.lastTotals[`${s.year}:${p.id}`] = { ...current };
        if (!Object.values(delta).some((v) => v !== 0)) continue;
        if (!regular) continue;
        const record = (b.regularTotals[s.year][p.id] ??= {
          id: p.id,
          name: p.name,
          pos: p.pos,
          team,
          stats: { games: 0 },
        });
        record.team = team;
        for (const [k, v] of Object.entries(delta))
          record.stats[k] = (record.stats[k] || 0) + v;
        if (!Number.isFinite(delta.games) && delta.snaps > 0)
          record.stats.games = (record.stats.games || 0) + 1;
        const career = regularCareerTotals(s, p);
        const seasonTeams = (b.teamTotals[s.year] ??= {}),
          teamRows = (seasonTeams[team] ??= {}),
          teamRow = (teamRows[p.id] ??= { stats: {} });
        for (const [k, v] of Object.entries(delta))
          teamRow.stats[k] = (teamRow.stats[k] || 0) + v;
        const teamCareer = {};
        for (const season of Object.values(b.teamTotals)) {
          const st = season[team]?.[p.id]?.stats || {};
          for (const [k, v] of Object.entries(st))
            if (Number.isFinite(v)) teamCareer[k] = (teamCareer[k] || 0) + v;
        }
        for (const [scope, stats] of [
          ["game", delta],
          ["season", record.stats],
          ["career", career],
        ])
          for (const metric of Object.keys(fields)) {
            const item = {
              entity: "Player",
              playerId: p.id,
              name: p.name,
              team,
              pos: p.pos,
              year: s.year,
              week: info.week,
              scope,
              metric,
              label: fields[metric],
              value: stats[metric] || 0,
              headshot: p.headshot,
              face: p.face,
            };
            consider(s, `league:${scope}:${metric}`, item, { announce: true });
            consider(s, `team:${team}:${scope}:${metric}`, {
              ...item,
              value:
                (scope === "career"
                  ? teamCareer
                  : scope === "season"
                    ? teamRow.stats
                    : delta)[metric] || 0,
            });
          }
        if (team === s.team)
          b.games.unshift({
            id: p.id,
            name: p.name,
            pos: p.pos,
            team,
            year: s.year,
            week: info.week,
            stats: delta,
            key: info.key,
          });
      }
      const hc = f.clubs[team].staff.find((c) => c.role === "HC"),
        id = hc?.id || `hc-vacant-${team}`,
        name = hc?.name || "Interim head coach";
      const k = game.a === team ? 0 : 1,
        won = game.score[k] > game.score[1 - k],
        tie = game.score[k] === game.score[1 - k];
      const cs = (f.coachSeasons[s.year] ??= {}),
        entry = (cs[id] ??= {
          id,
          name,
          team,
          teams: [team],
          wins: 0,
          losses: 0,
          ties: 0,
          points: 0,
          allowed: 0,
          games: 0,
          titles: 0,
          playoffWins: 0,
        });
      if (!entry.teams.includes(team)) entry.teams.push(team);
      if (regular) {
        entry.games++;
        entry.points += game.score[k];
        entry.allowed += game.score[1 - k];
        entry[won ? "wins" : tie ? "ties" : "losses"]++;
      } else if (won) {
        entry.playoffWins++;
        if (info.round >= 3) {
          entry.titles++;
        }
      }
      const totals = Object.values(f.coachSeasons).reduce((out, season) => {
        const a = season[id];
        if (a)
          for (const k of ["wins", "titles"]) out[k] = (out[k] || 0) + a[k];
        return out;
      }, {});
      for (const [scope, metric, value] of [
        ...(regular
          ? [
              ["game", "points", game.score[k]],
              ["season", "wins", entry.wins],
              ["career", "wins", totals.wins],
            ]
          : []),
        ["career", "titles", totals.titles],
      ]) {
        const item = {
          entity: "Coach",
          coachId: id,
          name,
          team,
          year: s.year,
          week: info.week,
          scope,
          metric,
          label:
            metric === "titles"
              ? "Super Bowl victories"
              : metric === "points"
                ? "Single-game points"
                : "Regular-season wins",
          value,
        };
        consider(s, `coach:${scope}:${metric}`, item, { announce: true });
        consider(s, `team:${team}:coach:${scope}:${metric}`, item);
      }
    }
  }
  b.games = b.games.slice(0, 1200);
  return true;
}
