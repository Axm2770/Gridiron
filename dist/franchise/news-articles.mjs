// Gridiron Journal articles: everything a news story needs beyond its card. DOM-free and
// deterministic (seeded by the story id), so it runs in Node tests and never changes results.
//
//   storyKind(a)                  what a story is about (match, result, milestone, event, injury,
//                                 transaction, player, coach, interview, scouting, feature, general);
//                                 old saved stories without `kind` are classified from their text
//   articleFacts(s, a)            the numbers an article is built from (score, box, player, record…),
//                                 read from `a.data` when the story carries it, else from the save
//   articleCopy(s, a)             kicker, byline, dateline, lead + 2–5 body paragraphs, pull quote
//   relatedStories(list, a)       same player first, then same club
//   matchData(s, r, i, roundKey)  compact box score stored on new match/result stories
//   milestoneStories(s, results, roundKey)   career/season/team/coach milestones and records broken
//   leagueEventStories(s)         trade deadline, free agency, draft day, awards, bracket, champion,
//                                 season anniversaries — each once per season (dedupe keys)
//   featureVisual(a, registry)    the optional `feature: { type, data }` hook (docs/design-system.md)
//
// Milestone and event state lives in `franchise.office.milestones`, created lazily, so older saves
// load unchanged. Detection compares this round's totals with the totals before the round, so a
// threshold fires once, in the week it is crossed.
import { regularCareerTotals, ensureRecordBook } from "./records.mjs";
import { AWARD_NAMES } from "./awards.mjs";
import { transactionsFor } from "./transactions.mjs";
import { capHit, financeYear } from "./state.mjs";

const hash = (s) => {
  let h = 2166136261;
  for (const c of String(s)) h = Math.imul(h ^ c.charCodeAt(0), 16777619);
  return h >>> 0;
};
const pick = (list, seed) => list[hash(seed) % list.length];
const fin = (v) => typeof v === "number" && Number.isFinite(v);
const n0 = (v) => (fin(v) ? v : 0);
const fmt = (v) => (fin(v) ? Math.round(v).toLocaleString("en-US") : "0");
const ord = (n) => {
  const v = Math.abs(Math.round(n)),
    t = v % 100;
  return v + (t >= 11 && t <= 13 ? "th" : ["th", "st", "nd", "rd"][v % 10] || "th");
};
const QUARTER = ["first", "second", "third", "fourth"];
const plural = (n, w, p = w + "s") => `${fmt(n)} ${n === 1 ? w : p}`;

/* ------------------------------------------------------------------ lookups */

// The classic scripts declare `clubs` as a global lexical binding (not a window property).
const CLUBS = () => (typeof clubs !== "undefined" ? clubs : globalThis.clubs);
export const clubName = (s, t) =>
  s?.franchise?.clubs?.[t]?.identity?.name || CLUBS()?.[t]?.[2] || (fin(t) ? `Team ${t + 1}` : "League");
export const clubCity = (s, t) =>
  s?.franchise?.clubs?.[t]?.identity?.city || CLUBS()?.[t]?.[1] || "";
export const clubAbbr = (s, t) =>
  CLUBS()?.[t]?.[0] || s?.franchise?.clubs?.[t]?.identity?.abbr || clubName(s, t).slice(0, 3).toUpperCase();
export const recordText = (s, t) => {
  const r = s?.teams?.[t];
  return r ? `${n0(r.w)}-${n0(r.l)}${r.t ? "-" + r.t : ""}` : "";
};
export function findPlayer(s, id) {
  if (!s || !id) return null;
  const own = (s.roster || []).find((p) => p.id === id);
  if (own) return { p: own, team: s.team };
  for (const [t, c] of (s.franchise?.clubs || []).entries()) {
    if (t === s.team) continue;
    const p = (c.players || []).find((q) => q.id === id);
    if (p) return { p, team: t };
  }
  const fa = (s.agents || []).find((p) => p.id === id);
  if (fa) return { p: fa, team: null };
  const gone = (s.franchise?.retired || []).find((p) => p.id === id);
  return gone ? { p: gone, team: null, retired: true } : null;
}
const clubPlayers = (s, t) => (t === s.team ? s.roster : s.franchise?.clubs?.[t]?.players) || [];
const division = (t) => Math.floor(t / 4);
export function divisionTable(s, t) {
  if (!fin(t) || !s?.teams?.[t]) return [];
  const d = division(t);
  return s.teams
    .map((r, i) => ({ team: i, w: n0(r.w), l: n0(r.l), t: n0(r.t), pf: n0(r.pf), pa: n0(r.pa) }))
    .filter((r) => division(r.team) === d)
    .sort((a, b) => b.w - a.w || b.pf - b.pa - (a.pf - a.pa) || a.team - b.team);
}

/* ------------------------------------------------------------------ kinds */

export const STORY_KINDS = ["match", "result", "milestone", "event", "injury", "transaction", "player", "coach", "interview", "scouting", "feature", "general"];
const KIND_LABEL = {
  match: "Match report",
  result: "Around the league",
  milestone: "Milestone",
  event: "League calendar",
  injury: "Medical",
  transaction: "Transactions",
  player: "Profile",
  coach: "Coaching",
  interview: "Press room",
  scouting: "Scouting",
  feature: "Feature",
  general: "The Journal",
};
export const kindLabel = (k) => KIND_LABEL[k] || KIND_LABEL.general;
const SHORT_LABEL = { match: "Match", result: "League", milestone: "Milestone", event: "Calendar", injury: "Medical", transaction: "Moves", player: "Profile", coach: "Coaching", interview: "Press", scouting: "Scouting", feature: "Feature", general: "News" };
export const shortKindLabel = (k) => SHORT_LABEL[k] || SHORT_LABEL.general;

export function storyKind(a) {
  if (!a) return "general";
  if (a.feature && typeof a.feature === "object" && a.feature.type) return "feature";
  if (STORY_KINDS.includes(a.kind)) return a.kind;
  const id = String(a.id || ""),
    text = `${a.title || ""} ${a.body || ""}`;
  if (id.startsWith("story-match-") || a.source === "Sunday Review") return "match";
  if (id.startsWith("story-league-")) return "result";
  if (/^(A record falls|Record watch)$/.test(a.title || "")) return "milestone";
  if (a.category === "Medical") return "injury";
  if (a.card?.type === "coach") return "coach";
  if (a.card?.type === "jersey" || a.source === "Transactions wire" || /\b(trade agreed|traded|acquired?|signs?|signed|released|waived|claimed)\b/i.test(text)) return "transaction";
  if (a.category === "Interviews") return "interview";
  if (a.category === "Scouting") return "scouting";
  if (id.startsWith("story-player-action") || (a.category === "Players" && a.playerId)) return "player";
  return "general";
}

/* ------------------------------------------------------------------ box scores */

// Compact box score for a played game (stored on new match/result stories; about 300 bytes).
export function matchData(s, r, side = 0, roundKey = "") {
  if (!r || !Array.isArray(r.score)) return null;
  const m = r.match || {},
    periods = Array.isArray(m.periodScores) && m.periodScores.length >= 4 && m.periodScores.every((q) => Array.isArray(q) && q.length === 2) ? m.periodScores.map((q) => [n0(q[0]), n0(q[1])]) : null,
    box = Array.isArray(m.stats) && m.stats.length === 2 ? m.stats.map((x) => ({ yards: n0(x?.yards), pass: n0(x?.pass), rush: n0(x?.rush), first: n0(x?.first), turnovers: n0(x?.turnovers), plays: n0(x?.plays) })) : null,
    [year, phase, week] = String(roundKey).split(":");
  // Top performers: worker stat lines, or this round's own-team lines from the record book.
  let lines = (r.stats || []).filter((x) => x && (x.team === r.a || x.team === r.b));
  if (!lines.length) {
    const b = s?.franchise?.statBook;
    lines = (b?.games || []).filter((g) => g.key === roundKey).map((g) => ({ ...g.stats, id: g.id, team: g.team }));
  }
  const top = lines
    .map((x) => ({ x, v: n0(x.passYards) / 2.5 + n0(x.rushYards) + n0(x.recYards) + 20 * (n0(x.passTD) + n0(x.rushTD) + n0(x.recTD)) + 25 * n0(x.sacks) + 30 * n0(x.defInterceptions) + 3 * n0(x.tackles) }))
    .filter((e) => e.v > 0)
    .sort((a, b) => b.v - a.v)
    .slice(0, 3)
    .map(({ x }) => {
      const found = findPlayer(s, x.id);
      return { id: x.id, team: x.team, name: found?.p?.name || "", pos: found?.p?.pos || "", line: statLine(x) };
    })
    .filter((x) => x.name && x.line);
  return {
    a: r.a,
    b: r.b,
    score: [n0(r.score[0]), n0(r.score[1])],
    side,
    week: fin(+week) ? +week : null,
    phase: phase || null,
    year: fin(+year) ? +year : null,
    ...(periods ? { periods } : {}),
    ...(box ? { box } : {}),
    ...(top.length ? { top } : {}),
    // Records as they stood after this game (the live table moves on every week).
    rec: [recordText(s, r.a), recordText(s, r.b)],
  };
}

// "21/30, 254 yds, 2 TD" style line from any stat record.
export function statLine(x = {}) {
  const parts = [];
  if (n0(x.passYards) || n0(x.attempts)) parts.push(`${n0(x.attempts) ? `${n0(x.completions)}/${n0(x.attempts)}, ` : ""}${fmt(x.passYards)} pass yds${n0(x.passTD) ? `, ${x.passTD} TD` : ""}${n0(x.interceptions) ? `, ${x.interceptions} INT` : ""}`);
  if (n0(x.rushYards) || n0(x.rushTD)) parts.push(`${fmt(x.rushYards)} rush yds${n0(x.rushTD) ? `, ${x.rushTD} TD` : ""}`);
  if (n0(x.receptions) || n0(x.recYards)) parts.push(`${n0(x.receptions)} rec, ${fmt(x.recYards)} yds${n0(x.recTD) ? `, ${x.recTD} TD` : ""}`);
  if (n0(x.sacks)) parts.push(`${plural(x.sacks, "sack")}`);
  if (n0(x.defInterceptions)) parts.push(`${plural(x.defInterceptions, "interception")}`);
  if (!parts.length && n0(x.tackles)) parts.push(`${plural(x.tackles, "tackle")}`);
  return parts.slice(0, 2).join(" · ");
}

// The game behind an older match story (saved before box scores were stored): the matchup log.
function loggedGame(s, a) {
  const score = String(a.body || "").match(/(\d+)\s*[–-]\s*(\d+)/),
    games = s?.franchise?.matchups?.games || [];
  if (!score) return null;
  const us = +score[1],
    them = +score[2],
    team = fin(a.team) ? a.team : s.team;
  const g = games.find((g) => g.year === a.year && (g.a === team || g.b === team) && g.score[g.a === team ? 0 : 1] === us && g.score[g.a === team ? 1 : 0] === them);
  if (g) return { a: g.a, b: g.b, score: [...g.score], side: g.a === team ? 0 : 1, week: g.week, phase: g.phase, year: g.year };
  if (fin(a.otherTeam)) return { a: team, b: a.otherTeam, score: [us, them], side: 0, week: null, phase: null, year: a.year };
  return { a: team, b: null, score: [us, them], side: 0, week: null, phase: null, year: a.year };
}
function leagueGame(s, a) {
  const m = String(a.body || "").match(/^(.+?)\s+(\d+)\s*[–-]\s*(\d+)\s+(.+?)\./);
  if (!m || !fin(a.team)) return null;
  return { a: a.team, b: fin(a.otherTeam) ? a.otherTeam : null, score: [+m[2], +m[3]], side: 0, week: null, phase: null, year: a.year };
}

/* ------------------------------------------------------------------ facts */

const MILESTONE_LABEL = {
  passYards: ["passing yards", "passing yard"],
  passTD: ["touchdown passes", "touchdown pass"],
  rushYards: ["rushing yards", "rushing yard"],
  rushTD: ["rushing touchdowns", "rushing touchdown"],
  recYards: ["receiving yards", "receiving yard"],
  receptions: ["receptions", "reception"],
  recTD: ["receiving touchdowns", "receiving touchdown"],
  sacks: ["sacks", "sack"],
  defInterceptions: ["interceptions", "interception"],
  games: ["games", "game"],
};
export const metricLabel = (m, v = 2) => (MILESTONE_LABEL[m] || [String(m), String(m)])[v === 1 ? 1 : 0];

// Season stats for a player, plus the per-week trail the record book keeps for your own club.
export function playerSeason(s, id, year = s?.year) {
  const found = findPlayer(s, id),
    st = found?.p?.stats?.[year] || {},
    trail = (s?.franchise?.statBook?.games || [])
      .filter((g) => g.id === id && g.year === year)
      .sort((a, b) => a.week - b.week)
      .map((g) => g.stats || {});
  return { found, stats: st, trail };
}
// The headline stat for a position: what a sparkline / bar should show.
export function keyMetric(p, st = {}) {
  const pos = p?.pos || "";
  if (pos === "QB" || n0(st.passYards) > 300) return "passYards";
  if (pos === "RB" || (n0(st.rushYards) > n0(st.recYards) && n0(st.rushYards) > 0)) return "rushYards";
  if (["WR", "TE"].includes(pos) || n0(st.recYards) > 0) return "recYards";
  if (n0(st.sacks)) return "sacks";
  if (n0(st.defInterceptions)) return "defInterceptions";
  return "tackles";
}

export function articleFacts(s, a) {
  const kind = storyKind(a),
    d = a?.data && typeof a.data === "object" ? a.data : {},
    f = { kind, team: fin(a.team) ? a.team : null, otherTeam: fin(a.otherTeam) ? a.otherTeam : null };
  if (kind === "match" || kind === "result") {
    const g = d.score ? d : kind === "match" ? loggedGame(s, a) : leagueGame(s, a);
    if (g) {
      const side = fin(g.side) ? g.side : 0,
        us = g.score[side],
        them = g.score[1 - side];
      Object.assign(f, {
        game: g,
        home: g.a,
        away: g.b,
        us,
        them,
        team: side === 0 ? g.a : g.b,
        opp: side === 0 ? g.b : g.a,
        won: us > them,
        tie: us === them,
        margin: Math.abs(us - them),
      });
      if (kind === "result") {
        const [w, l] = g.score[0] >= g.score[1] ? [g.a, g.b] : [g.b, g.a];
        Object.assign(f, { winner: w, loser: l, wScore: Math.max(...g.score), lScore: Math.min(...g.score) });
      }
    }
  }
  const pid = d.playerId || a.playerId || a.card?.playerId;
  if (pid) {
    const ps = playerSeason(s, pid, a.year ?? s?.year);
    if (ps.found) Object.assign(f, { player: ps.found.p, playerTeam: ps.found.team, season: ps.stats, trail: ps.trail });
    else if (d.name || a.card?.name) f.playerName = d.name || a.card.name;
  }
  if (kind === "milestone") Object.assign(f, { milestone: { ...d } });
  if (kind === "event") Object.assign(f, { event: { ...d } });
  if (kind === "injury") {
    const p = f.player;
    f.injury = {
      diagnosis: d.diagnosis || p?.medical?.diagnosis || (String(a.body || "").match(/with (.+?)\. /)?.[1] ?? "an injury"),
      weeks: fin(d.weeks) ? d.weeks : fin(p?.injury) ? p.injury : null,
      part: d.part || p?.medical?.bodyPart || p?.medical?.part || null,
    };
  }
  if (kind === "transaction") {
    const id = pid,
      entries = id ? transactionsFor(s, { playerId: id }) : [],
      near = entries.find((e) => e.year === a.year) || entries[0];
    const tradeGroup = !id && /trade/i.test(a.title || "") ? transactionsFor(s, { type: "traded", year: a.year }).filter((e) => e.from === s.team || e.to === s.team) : [];
    f.move = near || null;
    f.trade = tradeGroup.slice(0, 6);
    if (f.trade.length)
      f.tradeCap = {
        in: f.trade.filter((e) => e.to === s.team).reduce((n, e) => n + n0(e.contract?.capHit), 0),
        out: f.trade.filter((e) => e.from === s.team).reduce((n, e) => n + n0(e.contract?.capHit), 0),
      };
    f.via = a.card?.via || near?.type || (tradeGroup.length ? "traded" : null);
    f.contract = near?.contract || (id && s?.franchise?.contracts?.[id] && !s.franchise.contracts[id].ended ? contractInfo(s, id) : null);
  }
  return f;
}
function contractInfo(s, id) {
  const c = s.franchise.contracts[id];
  if (!c || !fin(c.years)) return null;
  const year = financeYear(s),
    total = Array.from({ length: c.years }, (_, i) => capHit(c, c.start + i)).reduce((n, v) => n + n0(v), 0);
  return { years: c.years, through: n0(c.start) + c.years - 1, capHit: n0(capHit(c, year)), total };
}

/* ------------------------------------------------------------------ bylines */

const DESKS = {
  match: { beat: "Sideline reporter", names: ["Dana Whitfield", "Marcus Hale", "Reese Calder", "Tomas Ibarra"] },
  result: { beat: "League desk", names: ["Priya Natarajan", "Owen Brandt", "Callum Reyes"] },
  milestone: { beat: "Records editor", names: ["Hollis Grant", "Bea Lindqvist", "Ade Okafor"] },
  event: { beat: "League correspondent", names: ["Sasha Morrow", "Felix Arango", "June Takeda"] },
  injury: { beat: "Medical correspondent", names: ["Nora Valdez", "Ike Brennan"] },
  transaction: { beat: "Transactions wire", names: ["Lena Faulk", "Victor Osei", "Gus Marchetti"] },
  player: { beat: "Features writer", names: ["Imani Ruiz", "Harper Quinn", "Theo Castellanos"] },
  coach: { beat: "Coaching beat", names: ["Wes Dunleavy", "Marta Kowal"] },
  interview: { beat: "Press room", names: ["Rafe Holloway", "Celia Park"] },
  scouting: { beat: "Draft analyst", names: ["Kip Andersen", "Maya Solis"] },
  feature: { beat: "Features editor", names: ["Imani Ruiz", "Hollis Grant"] },
  general: { beat: "Staff writer", names: ["Jordan Avery", "Sam Whitlock", "Rosa Delgado"] },
};
export function byline(a) {
  const k = storyKind(a),
    desk = DESKS[k] || DESKS.general,
    name = pick(desk.names, (a.id || a.title || "") + "by");
  return { name, beat: desk.beat === (a.source || "Gridiron Journal") ? "Staff" : desk.beat, outlet: a.source || "Gridiron Journal", id: "reporter-" + name.toLowerCase().replace(/\W+/g, "-") };
}

export function dateline(s, a) {
  const city = fin(a.team) ? clubCity(s, a.team).toUpperCase() : a.kind === "event" || a.team === null ? "" : clubCity(s, s?.team).toUpperCase(),
    when = a.date ? new Date(a.date + "T00:00:00Z").toLocaleDateString("en-US", { timeZone: "UTC", month: "short", day: "numeric", year: "numeric" }) : `${a.year ?? s?.year ?? ""}`,
    wk = fin(a.week) ? `Week ${a.week + 1}` : "";
  return { city, when, week: wk, text: [city, [when, wk].filter(Boolean).join(" · ")].filter(Boolean).join(" — ") };
}

/* ------------------------------------------------------------------ copy */

const clean = (t) =>
  String(t ?? "")
    .replace(/\b(undefined|null|NaN)\b/g, "")
    .replace(/\s+([.,;:])/g, "$1")
    .replace(/\(\s*\)/g, "")
    .replace(/\s{2,}/g, " ")
    .trim();
// Mid-sentence diagnosis: "Practice strain" → "a practice strain"; keeps acronyms (ACL).
const condition = (d) => {
  const t = String(d || "").trim();
  if (!t || /^an? /i.test(t) || /^an injury$/i.test(t)) return t || "an injury";
  const lc = /^[A-Z][a-z]/.test(t) ? t[0].toLowerCase() + t.slice(1) : t;
  return (/^[aeiou]/i.test(lc) ? "an " : "a ") + lc;
};

// Live numbers (records, tables, next fixture) only belong in this week's stories.
const isCurrent = (s, a) => a.year === s.year && a.week === s.week;
const playedAny = (s, t) => n0(s.teams?.[t]?.w) + n0(s.teams?.[t]?.l) + n0(s.teams?.[t]?.t) > 0;

function matchCopy(s, a, f, seed) {
  if (!f.game) return null;
  const team = clubName(s, f.team),
    opp = fin(f.opp) ? clubName(s, f.opp) : "opposition",
    g = f.game,
    rec = Array.isArray(g.rec) ? g.rec[g.side ?? 0] : "",
    paras = [];
  const verb = f.tie
    ? `played to a ${f.us}–${f.them} tie with the ${opp}`
    : f.won
      ? `${f.margin >= 21 ? pick(["routed", "overwhelmed", "rolled past"], seed) : f.margin <= 3 ? pick(["edged", "held off", "survived"], seed) : pick(["beat", "defeated", "handled"], seed)} the ${opp} ${f.us}–${f.them}`
      : f.margin >= 21
        ? `were beaten ${f.them}–${f.us} by the ${opp}`
        : f.margin <= 3
          ? `fell ${f.them}–${f.us} to the ${opp} in a one-score finish`
          : `lost ${f.them}–${f.us} to the ${opp}`;
  const lead = `The ${team} ${verb}${g.phase === "playoffs" ? " in the postseason" : fin(g.week) ? ` in week ${g.week + 1}` : ""}${rec ? `, ${f.won ? "improving" : f.tie ? "moving" : "dropping"} to ${rec}` : ""}.`;
  if (g.periods) {
    const k = g.side ?? 0,
      diffs = g.periods.map((q) => q[k] - q[1 - k]),
      swing = f.won || f.tie ? diffs.indexOf(Math.max(...diffs)) : diffs.indexOf(Math.min(...diffs)),
      q = g.periods[swing],
      half = [0, 1].map((i) => g.periods.slice(0, 2).reduce((n, p) => n + p[i], 0));
    paras.push(
      `${half[k] === half[1 - k] ? "It was level at halftime" : `The ${half[k] > half[1 - k] ? team : opp} led ${Math.max(...half)}–${Math.min(...half)} at the break`}. The game turned in the ${QUARTER[swing] || "overtime"} ${swing < 4 ? "quarter" : "period"}, ${f.won || f.tie ? `when the ${team} outscored the ${opp} ${q[k]}–${q[1 - k]}` : `when the ${opp} outscored the ${team} ${q[1 - k]}–${q[k]}`}.`,
    );
  }
  if (g.box) {
    const k = g.side ?? 0,
      me = g.box[k],
      th = g.box[1 - k],
      to = me.turnovers === th.turnovers ? `both sides turned it over ${plural(me.turnovers, "time")}` : me.turnovers < th.turnovers ? `the ${team} won the turnover battle ${th.turnovers}–${me.turnovers}` : `${plural(me.turnovers, "turnover")} hurt the ${team}`;
    paras.push(`The ${team} piled up ${fmt(me.yards)} yards (${fmt(me.pass)} passing, ${fmt(me.rush)} rushing) against ${fmt(th.yards)} for the ${opp}, with ${plural(me.first, "first down")} to ${th.first}, and ${to}.`);
  }
  if (g.top?.length) {
    const [p1, p2] = g.top;
    paras.push(`${p1.name} (${p1.pos}, ${clubAbbr(s, p1.team)}) led the way with ${p1.line}.${p2 ? ` ${p2.name} added ${p2.line}.` : ""}`);
  }
  const close = f.won
    ? pick(["The staff want the confidence carried into practice.", "Third-down execution and field position told the story.", "The locker room was loud, but the film session comes first."], seed + "c")
    : f.tie
      ? "Neither side found the decisive play."
      : pick(["Players and coaches turn to the film for a response.", "The margin came down to a handful of snaps.", "A short week of practice now carries extra weight."], seed + "c");
  const next = isCurrent(s, a) && f.team === s.team && s.phase === "season" ? (s.schedule?.[s.week] || []).find((x) => x.a === s.team || x.b === s.team) : null;
  paras.push(`${close}${next ? ` Next up: the ${clubName(s, next.a === s.team ? next.b : next.a)} in week ${s.week + 1}.` : ""}`);
  const coach = f.team === s.team ? s.coach?.name || "The head coach" : "The head coach";
  const quote = {
    text: f.won ? pick(["We played complementary football. Offense, defense, special teams — everybody pulled the rope.", "It wasn't perfect, but I loved how we finished.", "That's the standard. Now we go back to work."], seed + "q") : f.tie ? "We'll take the lessons. Nobody in that room is satisfied." : pick(["We left plays out there. That's on all of us, starting with me.", "Credit to them. We have to coach it better and play it better.", "Nobody is pointing fingers. We fix it on the practice field."], seed + "q"),
    by: coach,
    role: f.team === s.team ? "Head coach" : `${clubName(s, f.team)} head coach`,
  };
  return { lead, paras, quote };
}

function resultCopy(s, a, f, seed) {
  if (!f.game || !fin(f.winner)) return null;
  const w = clubName(s, f.winner),
    l = fin(f.loser) ? clubName(s, f.loser) : "their opponents",
    total = f.wScore + f.lScore,
    paras = [],
    lead = `The ${w} beat the ${l} ${f.wScore}–${f.lScore}${f.margin <= 3 ? " in a one-score finish" : f.margin >= 21 ? " in a rout" : total >= 60 ? " in a shootout" : ""}.`;
  const recs = Array.isArray(f.game.rec) ? f.game.rec : null,
    wr = recs ? recs[f.winner === f.game.a ? 0 : 1] : "",
    lr = recs ? recs[f.winner === f.game.a ? 1 : 0] : "";
  if (wr) paras.push(`The result moves the ${w} to ${wr}${lr ? `, while the ${l} fall to ${lr}` : ""}.`);
  const table = divisionTable(s, f.winner),
    pos = table.findIndex((r) => r.team === f.winner);
  const gap = table.length && pos > 0 ? table[0].w - table[pos].w : 0;
  if (isCurrent(s, a) && table.length && pos >= 0) paras.push(`The ${w} sit ${pos === 0 ? "top of" : ord(pos + 1) + " in"} their division${pos > 0 ? (gap > 0 ? `, ${plural(gap, "win")} behind the ${clubName(s, table[0].team)}` : `, level on wins with the ${clubName(s, table[0].team)}`) : ""}.`);
  if (f.game.top?.length) paras.push(`${f.game.top[0].name} starred with ${f.game.top[0].line}.`);
  if (f.game.box) {
    const [x, y] = f.game.box;
    paras.push(`Total yards finished ${fmt(x.yards)}–${fmt(y.yards)}, with ${n0(x.turnovers) + n0(y.turnovers)} turnovers between the two sides.`);
  }
  if (paras.length < 2) paras.push(pick(["Playoff pictures shift across the conference.", "Scouts around the league will study the tape this week.", "Both staffs now turn to next week's opponent."], seed));
  return { lead, paras, quote: null };
}

function milestoneCopy(s, a, f, seed) {
  const m = f.milestone || {},
    p = f.player,
    name = p?.name || m.name || f.playerName || "",
    team = clubName(s, fin(m.team) ? m.team : f.team ?? s.team),
    paras = [];
  let lead, quote = null;
  if (m.type === "player" || m.type === "season" || m.type === "games" || m.type === "record") {
    const label = metricLabel(m.metric);
    if (m.type === "games") lead = `${name} played the ${ord(m.threshold)} regular-season game of his career for the ${team}.`;
    else if (m.type === "season") lead = `${name} went past ${fmt(m.threshold)} ${label} for the ${a.year ?? s.year} season and now has ${fmt(m.value)}.`;
    else if (m.type === "record") lead = `${name} set a new ${m.scope === "game" ? "single-game" : m.scope === "career" ? "career" : "single-season"} ${m.league ? "league" : "franchise"} record with ${fmt(m.value)} ${label}.`;
    else lead = `${name} reached ${fmt(m.threshold)} career ${label} and now stands at ${fmt(m.value)}.`;
    if (m.type === "record" && fin(m.previous)) paras.push(`The previous mark of ${fmt(m.previous)} belonged to ${m.previousHolder || "a former great"}${m.previousYear ? ` (${m.previousYear})` : ""}.`);
    const st = f.season || {},
      line = statLine(st);
    if (line) paras.push(`His ${a.year ?? s.year} line so far: ${line}.`);
    if (p) paras.push(`The ${p.age ? p.age + "-year-old " : ""}${p.pos || "veteran"} is rated ${fmt(p.ovr)} overall${fin(p.potential) && p.potential > p.ovr ? ` with room to grow toward ${p.potential}` : ""}.`);
    if (m.record && fin(m.record.value) && m.record.value > n0(m.value)) paras.push(`The league record of ${fmt(m.record.value)} is held by ${m.record.name || "a Hall of Famer"}. He is ${Math.round((n0(m.value) / m.record.value) * 100)}% of the way there.`);
    else if (m.next) paras.push(`Next on the board: ${fmt(m.next)} ${label}.`);
    if (name) quote = { text: pick(["I'll think about the number when I'm done playing. Right now it's about the next game.", "Nobody gets there alone. That one belongs to the guys up front and the coaches.", "My family was in the stands. That made it special."], seed + "q"), by: name, role: `${p?.pos || "Player"}, ${team}` };
  } else if (m.type === "streak") {
    lead = m.losing ? `The ${team} have now lost ${m.length} straight games.` : `The ${team} have won ${m.length} straight games, the longest run of their season.`;
    paras.push(`They are ${m.record || recordText(s, m.team) || "level"} after week ${n0(m.week) + 1}.`);
    if (!m.losing && m.length >= 5) paras.push("Opposing coaches say the confidence shows on third down and in the fourth quarter.");
    else paras.push(m.losing ? "The staff are looking for a spark, and the depth chart may change this week." : "The locker room insists nobody is looking past next week's opponent.");
    quote = { text: m.losing ? "We have the people in that room to fix it. It starts with practice tomorrow." : "Streaks are for the fans. We're just trying to go 1-0 every week.", by: m.team === s.team ? s.coach?.name || "Head coach" : `${team} head coach`, role: "Head coach" };
  } else if (m.type === "wins10") {
    lead = `The ${team} reached ten wins for the ${a.year ?? s.year} season.`;
    paras.push(`At ${isCurrent(s, a) ? recordText(s, m.team) || "10 wins" : "ten wins"}, they are ${m.team === s.team ? "chasing a top playoff seed" : "firmly in the playoff picture"}.`);
    paras.push("Ten-win seasons are the benchmark owners and boards measure a contender by.");
  } else if (m.type === "coach") {
    const coach = s.coach?.name || "The head coach";
    lead = m.metric === "playoffWins" ? `${coach} has his ${m.threshold === 1 ? "first" : ord(m.threshold)} postseason win as a head coach.` : m.metric === "titles" ? `${coach} is a champion: the ${m.threshold === 1 ? "first" : ord(m.threshold)} title of his coaching career.` : `${coach} earned the ${m.threshold === 1 ? "first" : ord(m.threshold)} win of his head-coaching career.`;
    paras.push(`His career record stands at ${fmt(m.wins)}-${fmt(m.losses)}${m.ties ? `-${m.ties}` : ""} in the regular season${m.playoffWins ? `, with ${plural(m.playoffWins, "playoff win")}` : ""}.`);
    if (isCurrent(s, a) && playedAny(s, s.team)) paras.push(`The ${team} are ${recordText(s, s.team)} this season.`);
    else paras.push("Every win on the board started with a week of preparation nobody outside the building sees.");
    quote = { text: pick(["That number belongs to the players and every assistant who has given up weekends for this.", "I'll enjoy it tonight. Tomorrow we get back to the next one."], seed + "q"), by: coach, role: "Head coach" };
  } else {
    // Older "A record falls" / "Record watch" stories from the league log.
    lead = clean(a.body) || `A new mark in the ${team} record book.`;
    paras.push(a.title === "Record watch" ? "The chase is on: the number is within reach if the pace holds." : "The record book has been updated in Records & milestones.");
    paras.push("Records are tracked from regular-season games across every club.");
  }
  return { lead, paras, quote };
}

function eventCopy(s, a, f, seed) {
  const e = f.event || {},
    rows = Array.isArray(e.rows) ? e.rows : [],
    paras = [];
  let lead,
    quote = null;
  switch (e.event) {
    case "deadline":
      lead = `The ${a.year ?? s.year} trade deadline has passed after the week ${n0(e.week)} games. ${n0(e.trades) ? `${plural(n0(e.trades), "player")} changed clubs by trade this season.` : "Not a single player changed clubs by trade this season."}`;
      if (rows.length) paras.push(`The biggest names moved: ${rows.slice(0, 3).map((r) => `${r.name} (${r.pos}, to the ${clubName(s, r.to)})`).join("; ")}.`);
      paras.push(n0(e.mine) ? `Your club made ${plural(e.mine, "trade move")} before the window shut.` : "Your club stood pat with the roster it has.");
      paras.push("Rosters are now set for the stretch run; only free agents and waiver claims can add players until the championship.");
      break;
    case "free-agency":
      lead = `Free agency is open. ${plural(n0(e.count), "unsigned player")} can now agree terms with any club.`;
      if (rows.length) paras.push(`The top of the market: ${rows.slice(0, 3).map((r) => `${r.name} (${r.pos}, ${r.ovr} OVR)`).join(", ")}.`);
      paras.push("Each market day players decide on the offers that reached their deadline, so the first week moves fast.");
      paras.push("Cap room is the currency now. Front offices that planned ahead have the most choice.");
      break;
    case "draft":
      lead = e.done ? `The ${a.year ?? s.year} draft is complete: ${plural(n0(e.picks), "player")} heard their names called.` : `Draft day is here. ${plural(n0(e.picks), "pick")} are on the board across ${plural(n0(e.rounds), "round")}.`;
      if (rows.length) paras.push(`${e.done ? "The first selections" : "On the clock first"}: ${rows.slice(0, 3).map((r) => `${r.name ? `${r.name} (${r.pos}) to the ` : "the "}${clubName(s, r.team)}`).join("; ")}.`);
      paras.push(n0(e.mine) ? `Your club holds ${plural(e.mine, "pick")} in this class.` : "Your club has no selections this year.");
      paras.push("Scouts say the true value of a class shows three seasons later.");
      break;
    case "awards":
      lead = `The ${a.year ?? s.year} season awards are in. ${rows[0] ? `${rows[0].name} is the ${rows[0].label}.` : ""}`;
      if (rows.length > 1) paras.push(`Also honoured: ${rows.slice(1, 5).map((r) => `${r.name} (${r.label})`).join(", ")}.`);
      paras.push("Voting is a ranked media ballot sealed at the end of the regular season.");
      if (n0(e.mine)) paras.push(`${plural(e.mine, "award")} went to your club.`);
      break;
    case "bracket":
      lead = `The postseason field is set: seven clubs per conference, with the top seeds earning a bye.`;
      if (rows.length) paras.push(`Top seeds: ${rows.filter((r) => r.seed === 1).map((r) => `the ${clubName(s, r.team)} (${r.record})`).join(" and ")}.`);
      paras.push(fin(e.mySeed) ? `Your club is the No. ${e.mySeed} seed${e.myDivision ? " and division champion" : ""}.` : "Your club did not qualify; the offseason work starts early.");
      paras.push("Wild-card weekend opens the bracket; one loss ends a season.");
      break;
    case "champion":
      lead = `The ${clubName(s, e.team)} are champions${e.score ? `, winning the final ${Math.max(...e.score)}–${Math.min(...e.score)}${fin(e.opp) ? ` over the ${clubName(s, e.opp)}` : ""}` : ""}.`;
      paras.push(e.team === s.team ? "The parade route is being planned. The title is the first line of your legacy." : `The ${clubName(s, e.team)} finish the season on top; every other club starts chasing them now.`);
      paras.push("The offseason begins: contracts, free agency and the draft are next on the calendar.");
      quote = { text: "This group believed when nobody else did. Enjoy it — you earned every inch.", by: e.team === s.team ? s.coach?.name || "Head coach" : `${clubName(s, e.team)} head coach`, role: "Head coach" };
      break;
    case "anniversary":
      lead = `${s.coach?.name || "The head coach"} begins season ${fmt(e.seasons + 1)} in charge of the ${clubName(s, s.team)}.`;
      paras.push(`Across ${plural(n0(e.seasons), "completed season")} the record reads ${fmt(e.wins)}-${fmt(e.losses)}${e.playoffWins ? `, with ${plural(e.playoffWins, "playoff win")}` : ""}.`);
      paras.push("Expectations rise with every year on the job. The board will review the season goals at the next meeting.");
      break;
    default:
      lead = clean(a.body) || "The league calendar moves on.";
      paras.push("Dates and windows are listed in Schedule & calendar.", "Clubs adjust their plans as each window opens and closes.");
  }
  if (paras.length < 2) paras.push("Clubs adjust their plans as each window opens and closes.");
  return { lead, paras, quote };
}

function injuryCopy(s, a, f, seed) {
  const p = f.player,
    name = p?.name || (a.title || "").split(": ")[1] || "The player",
    inj = f.injury || {},
    team = clubName(s, f.playerTeam ?? f.team ?? s.team),
    paras = [],
    lead = `${name} ${inj.weeks ? `is expected to miss about ${plural(inj.weeks, "week")}` : "is unavailable"} with ${condition(inj.diagnosis)}.`;
  const backup = p ? clubPlayers(s, f.playerTeam ?? s.team).filter((q) => q.id !== p.id && q.pos === p.pos && !q.injury).sort((x, y) => n0(y.ovr) - n0(x.ovr))[0] : null;
  if (p) paras.push(`The ${p.age ? p.age + "-year-old " : ""}${p.pos} is rated ${fmt(p.ovr)} overall${p.starter ? " and has been a starter" : ""}.`);
  paras.push(backup ? `${backup.name} (${fmt(backup.ovr)} OVR) is next on the depth chart for the ${team}.` : `The ${team} will need to find snaps elsewhere at the position.`);
  const line = statLine(f.season || {});
  if (line) paras.push(`Before the injury his season line read ${line}.`);
  paras.push("Rehabilitation and missed practice can affect condition and development; the medical staff will manage the return.");
  return { lead, paras, quote: { text: pick(["We'll be patient. The worst thing we can do is rush him back.", "He's attacking the rehab. We'll follow the medical plan, not the calendar."], seed + "q"), by: "Medical staff", role: team } };
}

function transactionCopy(s, a, f, seed) {
  const p = f.player,
    m = f.move,
    name = p?.name || m?.name || f.playerName || "",
    paras = [];
  let lead = clean(a.body) || clean(a.title);
  if (!m && p && fin(f.playerTeam) && lead.length < 60) lead = `The ${clubName(s, f.playerTeam)} have added ${name} (${p.pos}). ${lead}`;
  if (m && name) {
    const to = fin(m.to) ? clubName(s, m.to) : "",
      from = fin(m.from) ? clubName(s, m.from) : "";
    lead = m.type === "traded" ? `The ${to} acquired ${name} from the ${from}.` : m.type === "signed" ? `The ${to} signed ${name}${from ? `, formerly of the ${from},` : ""} as a free agent.` : m.type === "drafted" ? `The ${to} drafted ${name}${m.round ? ` in round ${m.round}` : ""}.` : m.type === "claimed" ? `The ${to} claimed ${name} off waivers.` : `${name}: ${m.type} by the ${from || to}.`;
  }
  if (p) paras.push(`${name} is a ${p.age ? p.age + "-year-old " : ""}${p.pos} rated ${fmt(p.ovr)} overall.`);
  if (f.contract) paras.push(`The deal runs ${plural(f.contract.years, "year")} through ${f.contract.through}, with a cap hit of $${(n0(f.contract.capHit) / 1e8).toFixed(1)}M this season ($${(n0(f.contract.total) / 1e8).toFixed(1)}M in total).`);
  if (f.trade?.length) paras.push(`The full exchange: ${f.trade.map((e) => `${e.name} (${e.pos}) to the ${clubName(s, e.to)}`).join("; ")}.`);
  if (p && fin(f.playerTeam)) {
    const room = clubPlayers(s, f.playerTeam).filter((q) => q.pos === p.pos).sort((x, y) => n0(y.ovr) - n0(x.ovr)),
      rank = room.findIndex((q) => q.id === p.id);
    if (rank >= 0) paras.push(`He slots in ${rank === 0 ? "as the top-rated" : ord(rank + 1) + " among"} ${p.pos}${rank === 0 ? "" : "s"} on the ${clubName(s, f.playerTeam)} roster.`);
  }
  if (paras.length < 2) paras.push(clean(a.body) !== lead ? clean(a.body) : "The transaction is listed in the league's Transactions log.", "Front offices around the league took note of the move.");
  return { lead, paras: paras.filter(Boolean), quote: name ? { text: pick(["I'm ready to get to work. Give me a playbook and a practice field.", "This organization showed it wanted me. That matters."], seed + "q"), by: name, role: p?.pos || "Player" } : null };
}

function genericCopy(s, a, f, seed) {
  const p = f.player,
    team = fin(f.team) ? f.team : a.team === null ? null : s.team,
    paras = [],
    lead = clean(a.body) || clean(a.title);
  if (p) {
    const line = statLine(f.season || {});
    paras.push(`${p.name} is a ${p.age ? p.age + "-year-old " : ""}${p.pos} rated ${fmt(p.ovr)} overall${line ? `; his season so far: ${line}` : ""}.`);
  }
  const rec = fin(team) && isCurrent(s, a) && playedAny(s, team) ? recordText(s, team) : "";
  if (rec) paras.push(`The ${clubName(s, team)} are ${rec} ${s.phase === "offseason" ? "after the season" : "this season"}.`);
  const tail = {
    interview: "What is said at the podium travels: players, supporters and ownership all hear it.",
    scouting: "Scouting reports sharpen as the season goes on; the draft board will move before draft day.",
    coach: "Staff changes reshape a club's identity: scheme, practice habits and the depth chart.",
    player: "Teammates say the work behind the scenes is what earns trust in the building.",
    feature: "Scouts and front offices around the league will be talking about this one all week.",
  }[f.kind] || pick(["Follow the story through the league desk.", "More on this as the week develops."], seed);
  paras.push(tail);
  return {
    lead,
    paras,
    quote: p ? { text: pick(["I just try to show up the same way every day.", "The guys in that locker room push me. That's the best part of this job."], seed + "q"), by: p.name, role: p.pos } : null,
  };
}

// Everything the reader shows as text. Paragraph count: lead + 2–5.
export function articleCopy(s, a) {
  const f = articleFacts(s, a),
    seed = a.id || a.title || "story",
    fn = { match: matchCopy, result: resultCopy, milestone: milestoneCopy, event: eventCopy, injury: injuryCopy, transaction: transactionCopy }[f.kind];
  let body = (fn && fn(s, a, f, seed)) || genericCopy(s, a, f, seed);
  let paras = body.paras.map(clean).filter((x) => x && x.length > 3);
  const lead = clean(body.lead) || clean(a.title);
  // Every article has at least two body paragraphs; the original wire copy fills the gap.
  for (const extra of [clean(a.body) !== lead ? clean(a.body) : "", "More from the league desk as the story develops."]) if (paras.length < 2 && extra) paras.push(extra);
  paras = paras.slice(0, 5);
  const quote = body.quote?.text ? { text: clean(body.quote.text), by: clean(body.quote.by) || "A team source", role: clean(body.quote.role) } : null;
  return {
    kind: f.kind,
    kicker: a.feature?.kicker || kindLabel(f.kind),
    headline: clean(a.title) || "League news",
    deck: clean(a.body) !== lead ? clean(a.body) : "",
    byline: byline(a),
    dateline: dateline(s, a),
    lead,
    paragraphs: paras,
    quote,
    facts: f,
  };
}

/* ------------------------------------------------------------------ related */

// Related: same player first, then the clubs involved, then the same kind of story; newest first.
export function relatedStories(list, a, limit = 4) {
  const pid = a.playerId || a.data?.playerId,
    kind = storyKind(a),
    teams = new Set([a.team, a.otherTeam, a.data?.a, a.data?.b, a.data?.team].filter(fin)),
    score = (x) => {
      let n = 0;
      if (pid && (x.playerId === pid || x.data?.playerId === pid)) n += 8;
      const xt = [x.otherTeam, x.data?.a, x.data?.b].filter(fin);
      if (xt.some((t) => teams.has(t))) n += 3;
      if (teams.has(x.team)) n += 1;
      if (storyKind(x) === kind) n += 2;
      return n;
    };
  return (list || [])
    .filter((x) => x && x.id !== a.id)
    .map((x, i) => ({ x, i, n: score(x) }))
    .filter((e) => e.n >= 3)
    .sort((p, q) => q.n - p.n || p.i - q.i)
    .slice(0, limit)
    .map((e) => e.x);
}

/* ------------------------------------------------------------------ feature hook */

// `feature: { type, data }` on a story asks a registered visual to draw the article's hero:
// window.GDFeatureVisuals[type](data, article) → HTML. Returns null to fall back to the generic visual.
export function featureVisual(a, registry = globalThis.GDFeatureVisuals) {
  const type = a?.feature?.type,
    fn = type && registry && typeof registry === "object" ? registry[type] : null;
  if (typeof fn !== "function") return null;
  try {
    const html = fn(a.feature.data, a);
    return typeof html === "string" && html.trim() ? html : null;
  } catch {
    return null;
  }
}

/* ------------------------------------------------------------------ milestones */

const CAREER_STEPS = {
  passYards: [5000, 10000, 15000, 20000, 25000, 30000, 35000, 40000, 45000, 50000, 55000, 60000, 65000, 70000, 75000, 80000, 85000, 90000],
  passTD: [25, 50, 75, 100, 150, 200, 250, 300, 350, 400, 450, 500, 550, 600],
  rushYards: [1000, 2000, 3000, 4000, 5000, 6000, 7000, 8000, 9000, 10000, 12000, 14000, 16000, 18000],
  rushTD: [10, 25, 50, 75, 100, 125, 150],
  recYards: [1000, 2000, 3000, 4000, 5000, 6000, 7000, 8000, 9000, 10000, 12000, 14000, 16000, 18000, 20000, 22000],
  receptions: [100, 200, 300, 400, 500, 600, 700, 800, 900, 1000, 1200, 1400],
  recTD: [10, 25, 50, 75, 100, 125, 150, 175, 200],
  sacks: [10, 25, 50, 75, 100, 125, 150, 175, 200],
  defInterceptions: [10, 20, 30, 40, 50, 60],
  games: [50, 100, 150, 200, 250, 300],
};
// League-wide players only make the paper for the round numbers.
const BIG_STEP = { passYards: 10000, passTD: 100, rushYards: 5000, rushTD: 50, recYards: 5000, receptions: 500, recTD: 50, sacks: 50, defInterceptions: 30, games: 200 };
const SEASON_STEPS = { passYards: [3000, 4000, 5000], passTD: [30, 40], rushYards: [1000, 1500, 2000], recYards: [1000, 1500], sacks: [10, 15, 20], defInterceptions: [5, 8] };
const COACH_WINS = [1, 10, 25, 50, 75, 100, 150, 200, 250, 300];

export function ensureMilestones(s) {
  const o = s.franchise.office;
  const m = (o.milestones ??= { version: 1, done: [], alerts: null, records: null, streaks: {} });
  if (!Array.isArray(m.done)) m.done = [];
  m.streaks ??= {};
  return m;
}
const once = (m, key) => {
  if (m.done.includes(key)) return false;
  m.done.push(key);
  if (m.done.length > 1500) m.done = m.done.slice(-1200);
  return true;
};
const crossed = (steps, before, after) => steps.filter((t) => before < t && after >= t);

// This round's per-player stat deltas: worker lines plus the record book's own-club lines.
function roundDeltas(s, results, roundKey) {
  const out = new Map();
  for (const r of results || [])
    for (const x of r.stats || []) if (x?.id) out.set(x.id, { ...x });
  for (const g of s.franchise?.statBook?.games || []) if (g.key === roundKey && !out.has(g.id)) out.set(g.id, { ...g.stats, id: g.id, team: g.team });
  return out;
}
function coachTotals(s) {
  const name = s.coach?.name,
    hc = s.franchise?.clubs?.[s.team]?.staff?.find?.((c) => c.role === "HC"),
    out = { wins: 0, losses: 0, ties: 0, playoffWins: 0, titles: 0, seasons: 0 };
  for (const season of Object.values(s.franchise?.coachSeasons || {})) {
    const e = Object.values(season || {}).find((x) => (hc && x.id === hc.id) || (name && x.name === name));
    if (!e) continue;
    out.seasons++;
    for (const k of ["wins", "losses", "ties", "playoffWins", "titles"]) out[k] += n0(e[k]);
  }
  return out;
}
// Own-club results this season, oldest first ("W"/"L"/"T").
export function teamForm(s, team, year = s.year) {
  return (s.franchise?.matchups?.games || [])
    .filter((g) => g.year === year && (g.a === team || g.b === team))
    .map((g) => {
      const k = g.a === team ? 0 : 1;
      return g.score[k] > g.score[1 - k] ? "W" : g.score[k] < g.score[1 - k] ? "L" : "T";
    });
}

// Stories for milestones crossed in this round: [key, story][]. Idempotent per round key.
export function milestoneStories(s, results, roundKey) {
  if (!s?.franchise?.office) return [];
  const m = ensureMilestones(s),
    out = [],
    year = s.year,
    week = fin(+String(roundKey).split(":")[2]) ? +String(roundKey).split(":")[2] : Math.max(0, s.week - 1),
    followed = new Set([s.team, ...(s.franchise.office.followedTeams || [])]);
  if (!once(m, "round:" + roundKey)) return [];
  const deltas = roundDeltas(s, results, roundKey),
    regular = String(roundKey).split(":")[1] === "season";
  // Player career and season milestones.
  if (regular)
    for (const [id, d] of deltas) {
      const found = findPlayer(s, id);
      if (!found?.p || !fin(found.team)) continue;
      const p = found.p,
        team = found.team,
        mine = followed.has(team),
        career = regularCareerTotals(s, p),
        season = p.stats?.[year] || {};
      const games = n0(career.games),
        played = n0(d.snaps) > 0 || Object.keys(d).some((k) => k !== "team" && k !== "id" && n0(d[k]) > 0) ? 1 : 0;
      for (const [metric, steps] of Object.entries(CAREER_STEPS)) {
        const now = metric === "games" ? games : n0(career[metric]),
          before = now - (metric === "games" ? played : n0(d[metric]));
        if (now <= before) continue;
        for (const t of crossed(steps, before, now)) {
          if (!mine && t % BIG_STEP[metric]) continue;
          const key = `ms-${id}-${metric}-${t}`;
          if (!once(m, key)) continue;
          const rec = s.franchise.statBook?.records?.[`league:career:${metric}`],
            next = steps.find((x) => x > now);
          out.push([key, {
            kind: "milestone",
            team,
            playerId: id,
            category: "Players",
            source: "Records desk",
            title: metric === "games" ? `${p.name} reaches ${fmt(t)} career games` : `${p.name} passes ${fmt(t)} career ${metricLabel(metric)}`,
            body: `The ${clubName(s, team)} ${p.pos} now has ${fmt(now)} ${metric === "games" ? "regular-season games" : metricLabel(metric)} in his career.`,
            data: { type: metric === "games" ? "games" : "player", playerId: id, name: p.name, team, metric, threshold: t, value: now, next: next || null, record: rec && fin(rec.value) ? { value: rec.value, name: rec.name, year: rec.year } : null, week },
          }]);
        }
      }
      if (mine)
        for (const [metric, steps] of Object.entries(SEASON_STEPS)) {
          const now = n0(season[metric]),
            before = now - n0(d[metric]);
          for (const t of crossed(steps, before, now)) {
            const key = `ms-season-${year}-${id}-${metric}-${t}`;
            if (!once(m, key)) continue;
            out.push([key, {
              kind: "milestone",
              team,
              playerId: id,
              category: "Players",
              source: "Records desk",
              title: `${p.name} reaches ${fmt(t)} ${metricLabel(metric)} this season`,
              body: `${p.name} has ${fmt(now)} ${metricLabel(metric)} in ${year} for the ${clubName(s, team)}.`,
              data: { type: "season", playerId: id, name: p.name, team, metric, threshold: t, value: now, next: steps.find((x) => x > now) || null, week },
            }]);
          }
        }
    }
  // Records broken (league marks from the record book; franchise marks for your club).
  const b = s.franchise.statBook;
  if (b) {
    if (!Array.isArray(m.alerts)) m.alerts = (b.alerts || []).map((x) => x.key);
    for (const al of (b.alerts || []).slice().reverse()) {
      if (m.alerts.includes(al.key)) continue;
      m.alerts.push(al.key);
      if (!al.broken || al.scope === "game") continue;
      const key = "record-" + al.key;
      out.push([key, {
        kind: "milestone",
        team: al.team,
        playerId: al.playerId,
        category: "Players",
        source: "Records desk",
        title: `Record: ${al.name} sets a new ${al.scope} mark`,
        body: `${al.name} now holds the league ${al.scope} record for ${String(al.label || metricLabel(al.metric)).toLowerCase()} with ${fmt(al.value)}.`,
        data: { type: "record", league: true, scope: al.scope, playerId: al.playerId, name: al.name, team: al.team, metric: al.metric, value: al.value, previous: al.target, week },
      }]);
    }
    m.alerts = m.alerts.slice(-400);
    // Franchise single-season records for your club, broken this season over an older mark.
    m.records ??= {};
    for (const metric of Object.keys(CAREER_STEPS)) {
      if (metric === "games") continue;
      const r = b.records?.[`team:${s.team}:season:${metric}`],
        prev = m.records[metric];
      if (!r) continue;
      if (prev && r.year === year && fin(prev.year) && prev.year < year && r.value > prev.value && r.playerId) {
        const key = `franchise-${s.team}-${metric}-${year}`;
        if (once(m, key))
          out.push([key, {
            kind: "milestone",
            team: s.team,
            playerId: r.playerId,
            category: "Team",
            source: "Records desk",
            title: `${r.name} breaks the ${clubName(s, s.team)} season record for ${metricLabel(metric)}`,
            body: `${fmt(r.value)} ${metricLabel(metric)} and counting, past the ${fmt(prev.value)} set by ${prev.name || "a former player"} in ${prev.year}.`,
            data: { type: "record", league: false, scope: "season", playerId: r.playerId, name: r.name, team: s.team, metric, value: r.value, previous: prev.value, previousHolder: prev.name, previousYear: prev.year, week },
          }]);
      }
      // Remember last season's mark until this season's first change.
      if (!prev || prev.year < year || r.year < year) m.records[metric] = { value: r.value, year: r.year, name: r.name };
      if (prev && prev.year < year && r.year === year && r.value > prev.value) m.records[metric] = { ...prev, broken: year };
    }
  }
  // Team streaks and ten-win seasons (your club and the clubs you follow).
  for (const team of followed) {
    if (!s.teams?.[team]) continue;
    const form = teamForm(s, team);
    if (!form.length) continue;
    const last = form.at(-1);
    let len = 0;
    for (let i = form.length - 1; i >= 0 && form[i] === last; i--) len++;
    const tier = last === "W" ? [3, 5, 7, 10, 13].filter((x) => x === len)[0] : last === "L" ? [4, 6, 8].filter((x) => x === len)[0] : null;
    if (tier) {
      const key = `streak-${year}-${team}-${last}-${tier}-${form.length}`;
      if (once(m, key))
        out.push([key, {
          kind: "milestone",
          team,
          category: "Team",
          source: "Gridiron Journal",
          title: last === "W" ? `${clubName(s, team)} win ${tier} straight` : `${clubName(s, team)} skid reaches ${tier} games`,
          body: last === "W" ? `The ${clubName(s, team)} have won ${tier} in a row and sit at ${recordText(s, team)}.` : `The ${clubName(s, team)} have lost ${tier} in a row and fall to ${recordText(s, team)}.`,
          data: { type: "streak", team, length: tier, losing: last === "L", form: form.slice(-10), record: recordText(s, team), week },
        }]);
    }
    if (regular && n0(s.teams[team].w) === 10 && last === "W") {
      const key = `wins10-${year}-${team}`;
      if (once(m, key))
        out.push([key, { kind: "milestone", team, category: "Team", source: "Gridiron Journal", title: `${clubName(s, team)} reach ten wins`, body: `A ten-win season for the ${clubName(s, team)}, now ${recordText(s, team)}.`, data: { type: "wins10", team, form: form.slice(-10), week } }]);
    }
  }
  // Coaching milestones for the career coach.
  const ours = (results || []).find((r) => r.a === s.team || r.b === s.team);
  if (ours) {
    const k = ours.a === s.team ? 0 : 1,
      won = ours.score[k] > ours.score[1 - k],
      c = coachTotals(s);
    if (won) {
      const metric = regular ? "wins" : "playoffWins",
        now = c[metric],
        steps = regular ? COACH_WINS : [1, 5, 10];
      for (const t of crossed(steps, now - 1, now)) {
        const key = `coach-${metric}-${t}-${s.coach?.name || ""}`;
        if (once(m, key))
          out.push([key, { kind: "milestone", team: s.team, category: "Team", source: "Gridiron Journal", title: regular ? (t === 1 ? `${s.coach?.name || "Coach"} earns his first win` : `${s.coach?.name || "Coach"} reaches ${t} career wins`) : t === 1 ? `${s.coach?.name || "Coach"} wins his first playoff game` : `${s.coach?.name || "Coach"} reaches ${t} playoff wins`, body: `A coaching milestone for the ${clubName(s, s.team)} head coach.`, data: { type: "coach", metric, threshold: t, team: s.team, ...c, week } }]);
      }
      if (!regular && ours && c.titles >= 1) {
        const key = `coach-titles-${c.titles}-${s.coach?.name || ""}`;
        if (s.phase === "offseason" && once(m, key))
          out.push([key, { kind: "milestone", team: s.team, category: "Team", source: "Gridiron Journal", title: c.titles === 1 ? `${s.coach?.name || "Coach"} wins his first championship` : `${s.coach?.name || "Coach"} wins title No. ${c.titles}`, body: `The ${clubName(s, s.team)} head coach adds a championship to his record.`, data: { type: "coach", metric: "titles", threshold: c.titles, team: s.team, ...c, week } }]);
      }
    }
  }
  return out;
}

/* ------------------------------------------------------------------ league events */

const drafted = (s, id) => findPlayer(s, id)?.p;

// Calendar events, once per season each. Safe to call on every render: it only adds a story
// the first time its condition is met.
export function leagueEventStories(s) {
  if (!s?.franchise?.office || !Array.isArray(s.teams)) return [];
  const m = ensureMilestones(s),
    f = s.franchise,
    year = s.year,
    out = [],
    add = (key, item) => {
      // League-wide events belong to no club unless they name one (postStory would default to yours).
      if (once(m, key)) out.push([key, { kind: "event", category: "League", source: "League desk", route: item.route || "League", team: null, ...item }]);
    };
  const deadline = f.rules?.tradeDeadline || 9;
  if (s.phase === "season" && s.week >= deadline && !m.done.includes(`deadline-${year}`)) {
    const trades = transactionsFor(s, { type: "traded", year });
    add(`deadline-${year}`, {
      title: "Trade deadline passes",
      body: trades.length ? `${plural(trades.length, "player")} moved by trade before the week ${deadline} cutoff.` : `No trades were completed before the week ${deadline} cutoff.`,
      route: "Transfers",
      data: { event: "deadline", week: deadline, trades: trades.length, mine: trades.filter((e) => e.from === s.team || e.to === s.team).length, rows: trades.slice().sort((a, b) => n0(b.ovr) - n0(a.ovr)).slice(0, 5).map((e) => ({ name: e.name, pos: e.pos, ovr: e.ovr, to: e.to, from: e.from, playerId: e.playerId })) },
    });
  }
  if (s.phase === "offseason" && f.market && f.market.phase && f.market.phase !== "Tampering") {
    const top = (s.agents || []).slice().sort((a, b) => n0(b.ovr) - n0(a.ovr)).slice(0, 6);
    add(`free-agency-${year}`, {
      title: "Free agency opens",
      body: `${plural((s.agents || []).length, "player")} are on the open market.`,
      route: "Transfers",
      data: { event: "free-agency", count: (s.agents || []).length, rows: top.map((p) => ({ name: p.name, pos: p.pos, ovr: p.ovr, age: p.age, playerId: p.id })) },
    });
  }
  const dr = f.draft;
  if (dr && dr.year === year && Array.isArray(dr.picks) && dr.picks.length) {
    const rows = (done) =>
      dr.picks.slice(0, 6).map((k, i) => {
        const p = done && k.player ? drafted(s, k.player) : null;
        return { overall: i + 1, round: k.round, team: k.team, name: p?.name || "", pos: p?.pos || "", playerId: p?.id || null };
      });
    const mine = dr.picks.filter((k) => k.team === s.team).length,
      rounds = Math.max(...dr.picks.map((k) => n0(k.round)));
    add(`draft-${year}`, { title: "Draft day arrives", body: `${dr.picks.length} picks across ${rounds} rounds. The clock is running.`, route: "Draft room", category: "Scouting", data: { event: "draft", picks: dr.picks.length, rounds, mine, rows: rows(false) } });
    if (dr.cursor >= dr.picks.length) add(`draft-done-${year}`, { title: "The draft is complete", body: `${dr.picks.length} rookies join the league.`, route: "Draft room", category: "Scouting", data: { event: "draft", done: true, picks: dr.picks.length, rounds, mine, rows: rows(true) } });
  }
  const awards = (f.awards || []).filter((x) => x.year === year);
  if (awards.length) {
    // Major awards first (in AWARD_NAMES order); All-Pro / Pro Bowl honours only when there are none.
    const order = Object.keys(AWARD_NAMES),
      major = awards.filter((x) => order.includes(x.award)),
      rows = (major.length ? major : awards)
        .slice()
        .sort((a, b) => order.indexOf(a.award) - order.indexOf(b.award))
        .map((x) => ({ award: x.award, label: AWARD_NAMES[x.award] || x.award, name: x.name, team: x.team, playerId: x.playerId || null }));
    add(`awards-${year}`, { title: `The ${year} season awards`, body: rows[0] ? `${rows[0].name} wins ${rows[0].label}.` : "The ballots are counted.", route: "Records", data: { event: "awards", rows, mine: rows.filter((r) => r.team === s.team).length } });
  }
  const seeds = f.postseason?.seeds;
  if ((s.phase === "playoffs" || s.phase === "offseason") && Array.isArray(seeds) && seeds.length === 2 && !f.postseason.legacy && seeds[0].length <= 7) {
    const rows = seeds.flatMap((c, conf) => c.map((team, i) => ({ conf, seed: i + 1, team, record: recordText(s, team), division: i < 4 })));
    const me = rows.find((r) => r.team === s.team);
    add(`bracket-${year}`, { title: "The playoff field is set", body: me ? `The ${clubName(s, s.team)} are the No. ${me.seed} seed.` : "Fourteen clubs chase the title.", route: "League", data: { event: "bracket", rows, mySeed: me?.seed ?? null, myDivision: !!me?.division } });
  }
  const champ = (s.history || []).find((h) => h.year === year);
  if (s.phase === "offseason" && champ && fin(champ.champion)) {
    const final = (f.matchups?.games || []).find((g) => g.year === year && g.final);
    add(`champion-${year}`, {
      title: `${clubName(s, champ.champion)} win the championship`,
      body: final ? `Final: ${clubName(s, final.a)} ${final.score[0]}–${final.score[1]} ${clubName(s, final.b)}.` : "The season is over.",
      team: champ.champion,
      otherTeam: final ? (final.a === champ.champion ? final.b : final.a) : undefined,
      route: "Records",
      data: { event: "champion", team: champ.champion, opp: final ? (final.a === champ.champion ? final.b : final.a) : null, score: final ? [...final.score] : null },
    });
  }
  // Coaching anniversary: a new season with at least one finished season in charge.
  if (s.phase === "season" && s.week === 0) {
    const c = coachTotals(s);
    if (c.seasons >= 1)
      add(`anniversary-${year}`, { title: `Year ${c.seasons + 1}: ${s.coach?.name || "the head coach"} begins another season`, body: `A ${fmt(c.wins)}-${fmt(c.losses)} career record so far.`, team: s.team, category: "Team", source: "Gridiron Journal", route: "Overview", data: { event: "anniversary", ...c } });
  }
  return out;
}
