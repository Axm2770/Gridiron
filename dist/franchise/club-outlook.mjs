// Club context for the new-career wizard: how strong each club's opening roster is, what the
// board will expect and how hard the job is. Read-only. Ratings follow the same steps as
// applyRealRosters (real-rosters.mjs) on the roster snapshot, so the numbers match the team
// ratings a new career starts with (test-career-wizard.mjs checks this).
import { gameRating } from "./real-rosters.mjs";
import { ensurePlayerRatings, refreshPlayerRating } from "./ratings.mjs";
import { strengthProfile } from "./board-meetings.mjs";

export const NEW_CAREER_YEAR = 2026;
const CAP = 255; // f.rules.cap at the start of a career, in $M.
const BUDGET = 224; // Modeled first-year commitments per club (applyRealRosters).
const POSITIONS = ["QB", "RB", "WR", "TE", "OL", "DL", "LB", "CB", "S", "K", "P"];
const KEEP = { OL: 5, WR: 2, DL: 3, LB: 2, CB: 2, S: 2 };
const STARTING = { QB: 1, RB: 1, WR: 3, TE: 1, OL: 5, DL: 4, LB: 3, CB: 3, S: 2, K: 1, P: 1 };
const POSITION_WEIGHT = { QB: 3.7, RB: 0.8, WR: 1.5, TE: 0.9, OL: 1.25, DL: 1.6, LB: 1, CB: 1.2, S: 0.8, K: 0.45, P: 0.4 };

// One club's opening roster: ovr, status and starters exactly as a new career builds them.
export function openingRoster(team, year = NEW_CAREER_YEAR) {
  let list = team.players.map((raw) => {
    const p = {
      id: raw.id,
      name: raw.name,
      pos: raw.pos === "LS" ? "OL" : raw.pos,
      realPosition: raw.position,
      age: raw.age,
      realPlayer: true,
      sourceTeam: team.abbr,
      ovr: gameRating(raw),
    };
    p.pot = Math.min(99, p.ovr + (p.age < 26 ? 5 : 1));
    ensurePlayerRatings(p);
    refreshPlayerRating(p, year);
    p.status =
      raw.group === "practiceSquad"
        ? "practice"
        : raw.group === "injuredReserveOrOut" || raw.group === "suspended"
          ? "ir"
          : "active";
    return p;
  });
  const active = list.filter((p) => p.status === "active");
  if (active.length > 53) {
    const keep = new Set();
    for (const pos of POSITIONS)
      for (const p of active
        .filter((p) => p.pos === pos)
        .sort((a, b) => b.ovr - a.ovr)
        .slice(0, KEEP[pos] || 1))
        keep.add(p.id);
    for (const p of active.slice().sort((a, b) => b.ovr - a.ovr)) if (keep.size < 53) keep.add(p.id);
    for (const p of active) if (!keep.has(p.id)) p.status = "practice";
  }
  const practice = list.filter((p) => p.status === "practice").sort((a, b) => b.ovr - a.ovr);
  for (const p of practice.slice(16)) list = list.filter((q) => q !== p);
  for (const [pos, n] of Object.entries(STARTING))
    for (const p of list
      .filter((p) => p.pos === pos && p.status === "active")
      .sort((a, b) => b.ovr - a.ovr)
      .slice(0, n))
      p.starter = true;
  // Modeled salaries: the same split of the club budget applyRealRosters uses.
  const weight = (p) =>
      p.status === "practice" ? 0.18 : Math.max(0.5, Math.max(0, p.ovr - 55) ** 1.65 * (POSITION_WEIGHT[p.pos] || 1)),
    total = list.reduce((n, p) => n + weight(p), 0),
    minimum = list.reduce((n, p) => n + (p.status === "practice" ? 0.4 : 0.8), 0),
    budget = Math.max(0, BUDGET - minimum);
  for (const p of list)
    p.salary = Number(((p.status === "practice" ? 0.4 : 0.8) + (budget * weight(p)) / total).toFixed(4));
  return list;
}

// Difficulty comes from opening roster strength: the weaker the roster, the harder the job.
export function difficultyFor(rank) {
  return rank <= 8
    ? { label: "Easy", tone: "good" }
    : rank <= 16
      ? { label: "Normal", tone: "neutral" }
      : rank <= 24
        ? { label: "Hard", tone: "warn" }
        : { label: "Very hard", tone: "bad" };
}
// Short expectation label from the board's strength tier (board-meetings.mjs strengthProfile).
export const EXPECTATION = {
  "Title contender": "Contender",
  "Playoff team": "Playoff push",
  "Middle of the pack": "Middle of the pack",
  Rebuilding: "Rebuild",
};

// Per-club context for all 32 clubs, indexed by team id. `snapshot` is nfl-rosters.json.
export function clubOutlook(snapshot, { year = NEW_CAREER_YEAR } = {}) {
  if (!snapshot?.teams || snapshot.teams.length !== 32) return null;
  const rows = [];
  for (const team of snapshot.teams) {
    const list = openingRoster(team, year),
      starters = list.filter((p) => p.starter),
      rating = Math.round(starters.reduce((n, p) => n + p.ovr, 0) / Math.max(1, starters.length)),
      payroll = list.reduce((n, p) => n + p.salary, 0),
      best = (filter) => list.filter(filter).sort((a, b) => b.ovr - a.ovr)[0] || null,
      star = best((p) => p.status !== "practice"),
      qb = best((p) => p.pos === "QB" && p.starter);
    rows[team.teamId] = {
      team: team.teamId,
      abbr: team.abbr,
      rating,
      players: list.length,
      starterAge: Math.round((starters.reduce((n, p) => n + (p.age || 0), 0) / Math.max(1, starters.length)) * 10) / 10,
      capRoom: Math.round((CAP - payroll) * 10) / 10,
      star: star && { name: star.name, pos: star.pos, ovr: star.ovr },
      qb: qb && { name: qb.name, ovr: qb.ovr },
      coach: team.coach || null,
    };
  }
  const teams = rows.map((r) => ({ rating: r.rating }));
  for (const r of rows) {
    const s = strengthProfile({ teams, team: r.team, year, franchise: {} });
    Object.assign(r, {
      rank: s.rank,
      leagueAvg: s.leagueAvg,
      tier: s.tier,
      expectation: EXPECTATION[s.tier] || s.tier,
      projected: s.projected,
      difficulty: difficultyFor(s.rank),
    });
  }
  return rows;
}
