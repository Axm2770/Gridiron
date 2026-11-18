// Club profile: one pixel dialog for any club (yours included), opened with W.club(team) from
// standings, fixtures, the trade desk, news, transactions, records, player profiles and Ctrl+K.
// clubProfile() is a pure read model of existing state (tests: test-club-profile.mjs); the
// dialog reuses the player profile's gp-* shell (ui/dialogs.css) plus club.css for the club parts.
// Read-only: the only writes are existing actions (follow a team, open the trade desk).
import * as S from "./state.mjs";
import * as M from "./matchups.mjs";
import { rankTeams, recentForm, streak, playoffPicture } from "./league-table.mjs";
import { teamMode } from "./market.mjs";
import { commitments, blockCount } from "./cap-sheet.mjs";
import { transactionsFor, describeTransaction, TRANSACTION_TYPES } from "./transactions.mjs";
import { RECORD_FIELDS } from "./records.mjs";
import { STAFF_ROLES } from "./staff.mjs";
import { pixelFace } from "../ui/pixel-face.mjs";
import { staffBust } from "./fo-pixel.mjs";
import { coachAppearance } from "./coach-avatar.mjs";
import { teamColors } from "../presentation/pixel-art.mjs";
import * as SV from "../ui/status-visual.mjs";

const OFFENSE = ["QB", "RB", "WR", "TE", "OL"],
  DEFENSE = ["DL", "LB", "CB", "S"],
  SPECIAL = ["K", "P"],
  POS_ORDER = [...OFFENSE, ...DEFENSE, ...SPECIAL];
export const unitOf = (pos) => (OFFENSE.includes(pos) ? "Offense" : DEFENSE.includes(pos) ? "Defense" : "Special teams");
const STAGES = ["Wild Card", "Divisional", "Conference", "Championship"];
const avg = (list) => (list.length ? Math.round(list.reduce((n, v) => n + v, 0) / list.length) : null);

// Roof and typical climate per home city. A small local table: a weather module can replace it
// later (the STADIUMS table on the weather branch) through `opts.climate`.
export const CLIMATE = {
  BUF: ["Open air", "Cold", "Lake-effect snow and wind late in the season"],
  MIA: ["Open air", "Hot", "Heat, humidity and afternoon storms"],
  NE: ["Open air", "Cold", "Cold, wind and snow from November"],
  NYJ: ["Open air", "Cold", "Swirling wind; cold late in the season"],
  BAL: ["Open air", "Temperate", "Mild autumn, cold and wet in December"],
  CIN: ["Open air", "Cold", "Cool autumn, freezing in December"],
  CLE: ["Open air", "Cold", "Lake wind, rain and snow"],
  PIT: ["Open air", "Cold", "Rain, wind and cold late in the season"],
  HOU: ["Retractable roof", "Hot", "Roof closed in heat and storms"],
  IND: ["Retractable roof", "Cold", "Usually closed; controlled conditions"],
  JAX: ["Open air", "Hot", "Heat and humidity early in the season"],
  TEN: ["Open air", "Mild", "Mild autumn, occasional cold snaps"],
  DEN: ["Open air", "Cold", "Altitude, dry air and sudden snow"],
  KC: ["Open air", "Cold", "Wind and freezing temperatures in winter"],
  LV: ["Dome", "Indoor", "Climate-controlled indoors"],
  LAC: ["Fixed canopy", "Mild", "Sheltered under a canopy; mild all year"],
  DAL: ["Retractable roof", "Hot", "Usually closed; controlled conditions"],
  NYG: ["Open air", "Cold", "Swirling wind; cold late in the season"],
  PHI: ["Open air", "Cold", "Cold, wind and rain late in the season"],
  WAS: ["Open air", "Temperate", "Mild autumn, cold and wet in winter"],
  CHI: ["Open air", "Cold", "Lake wind and freezing winter games"],
  DET: ["Dome", "Indoor", "Climate-controlled indoors"],
  GB: ["Open air", "Frigid", "Frozen field and snow in winter"],
  MIN: ["Dome", "Indoor", "Climate-controlled indoors"],
  ATL: ["Retractable roof", "Mild", "Usually closed; controlled conditions"],
  CAR: ["Open air", "Mild", "Mild autumn, occasional rain"],
  NO: ["Dome", "Indoor", "Climate-controlled indoors, loud crowd"],
  TB: ["Open air", "Hot", "Heat, humidity and storms"],
  ARI: ["Retractable roof", "Hot", "Desert heat; roof closed when hot"],
  LAR: ["Fixed canopy", "Mild", "Sheltered under a canopy; mild all year"],
  SF: ["Open air", "Mild", "Mild with afternoon wind"],
  SEA: ["Open air", "Wet", "Rain and a famously loud crowd"],
};
export function climateFor(abbr, table = CLIMATE) {
  const c = table?.[abbr];
  return c ? { roof: c[0], climate: c[1], weather: c[2], indoor: /Dome|Retractable/.test(c[0]) } : { roof: "Not recorded", climate: "", weather: "", indoor: false };
}

const recordText = (r) => (r ? `${r.w}–${r.l}${r.t ? "–" + r.t : ""}` : "0–0");
const ordinal = (n) => n + (n % 100 >= 11 && n % 100 <= 13 ? "th" : ["th", "st", "nd", "rd"][n % 10] || "th");

// How far a club went in one season's playoffs, from the game log.
export function playoffResult(s, team, year, games = M.ensureMatchups(s).games) {
  const mine = games.filter((g) => g.year === year && g.phase === "playoffs" && (g.a === team || g.b === team)).sort((a, b) => a.week - b.week);
  if (!mine.length) return null;
  const last = mine.at(-1),
    k = last.a === team ? 0 : 1,
    won = last.score[k] > last.score[1 - k],
    stage = STAGES[last.week] || "Playoffs",
    champion = (s.history || []).find((h) => h.year === year)?.champion;
  if (last.final || stage === "Championship") return won || champion === team ? { label: "Won the Super Bowl", tone: "good", title: true } : { label: "Lost the Super Bowl", tone: "accent" };
  return won ? { label: `Won ${stage} · in progress`, tone: "accent" } : { label: `Lost in the ${stage}${stage === "Championship" ? "" : " round"}`, tone: "warn" };
}

// One row per season this career has recorded for the club, newest first. Finished seasons come
// from the archive (s.franchise.archive), the current one from s.teams.
export function seasonHistory(s, team) {
  const f = s.franchise || {},
    games = M.ensureMatchups(s).games,
    rows = [];
  const seen = new Set();
  for (const a of [...(f.archive || [])].sort((x, y) => y.year - x.year)) {
    const r = a.teams?.[team];
    if (!r || seen.has(a.year)) continue;
    seen.add(a.year);
    const po = playoffResult(s, team, a.year, games);
    rows.push({ year: a.year, w: r.w, l: r.l, t: r.t || 0, pf: r.pf, pa: r.pa, record: recordText(r), result: po?.label || "Missed the playoffs", tone: po?.tone || "", title: !!po?.title, current: false });
  }
  if (!seen.has(s.year) && s.teams?.[team]) {
    const r = s.teams[team],
      po = playoffResult(s, team, s.year, games);
    rows.unshift({ year: s.year, w: r.w, l: r.l, t: r.t || 0, pf: r.pf, pa: r.pa, record: recordText(r), result: po ? po.label : s.phase === "offseason" ? "Missed the playoffs" : "Season in progress", tone: po?.tone || "", title: !!po?.title, current: true });
  }
  return rows;
}

// Every regular-season and playoff fixture of `team` this season.
export function clubFixtures(s, team) {
  const out = [];
  const add = (games, week, stage) => {
    const g = (games || []).find((g) => g.a === team || g.b === team);
    if (!g) {
      if (stage === "Regular season") out.push({ week, stage, bye: true });
      return;
    }
    const home = g.a === team,
      k = home ? 0 : 1,
      done = Array.isArray(g.score);
    out.push({
      week,
      stage,
      home,
      opponent: home ? g.b : g.a,
      done,
      for: done ? g.score[k] : null,
      against: done ? g.score[1 - k] : null,
      result: done ? (g.score[k] > g.score[1 - k] ? "W" : g.score[k] < g.score[1 - k] ? "L" : "T") : null,
    });
  };
  (s.schedule || []).forEach((games, i) => add(games, i + 1, "Regular season"));
  (s.playoffs?.rounds || []).forEach((games, i) => add(games, i + 1, STAGES[i] || "Postseason"));
  const next = out.find((r) => !r.bye && !r.done);
  if (next) next.next = true;
  return out;
}

// Best single regular-season totals by players while at this club (this career's stat book).
export function clubRecords(s, team) {
  const totals = s.franchise?.statBook?.regularTotals || {},
    best = {};
  for (const [year, rows] of Object.entries(totals))
    for (const r of Object.values(rows || {})) {
      if (r.team !== team) continue;
      for (const k of Object.keys(RECORD_FIELDS)) {
        const v = r.stats?.[k];
        if (Number.isFinite(v) && v > 0 && (!best[k] || v > best[k].value)) best[k] = { key: k, label: RECORD_FIELDS[k], value: v, name: r.name, id: r.id, pos: r.pos, year: Number(year) };
      }
    }
  return Object.keys(RECORD_FIELDS)
    .map((k) => best[k])
    .filter(Boolean);
}

function ratingSplit(players, fallback) {
  const fit = players.filter((p) => p.status !== "practice" && p.status !== "ir"),
    pick = (unit) => {
      const group = fit.filter((p) => unit.includes(p.pos)),
        starters = group.filter((p) => p.starter);
      return avg((starters.length >= 5 ? starters : group.sort((a, b) => b.ovr - a.ovr).slice(0, 11)).map((p) => p.ovr));
    };
  return { overall: Math.round(fallback ?? avg(fit.filter((p) => p.starter).map((p) => p.ovr)) ?? 0), offense: pick(OFFENSE), defense: pick(DEFENSE) };
}

// Depth chart: per position, healthy players in starter-then-OVR order.
export function depthChart(players) {
  const out = [];
  for (const pos of POS_ORDER) {
    const group = players
      .filter((p) => p.pos === pos && p.status !== "practice")
      .sort((a, b) => (b.starter ? 1 : 0) - (a.starter ? 1 : 0) || b.ovr - a.ovr);
    if (group.length) out.push({ pos, unit: unitOf(pos), starters: group.filter((p) => p.starter), depth: group.filter((p) => !p.starter), players: group });
  }
  return out;
}

// The whole profile as plain data. `teams` is the club table ([abbr, city, name, division]).
export function clubProfile(s, team, { teams = globalThis.clubs, heritage = null, climate = CLIMATE } = {}) {
  const t = Number(team),
    f = s.franchise,
    club = f?.clubs?.[t];
  if (!club || !teams?.[t]) return null;
  const own = t === s.team,
    row = teams[t],
    identity = club.identity || {},
    rebrand = club.rebrand,
    abbr = identity.abbr || row[0],
    city = rebrand?.city || identity.city || row[1],
    nickname = rebrand?.name || identity.name || row[2],
    division = identity.division || row[3],
    divIds = teams.map((c, i) => (c[3] === row[3] ? i : -1)).filter((i) => i >= 0),
    order = rankTeams(s, divIds),
    rec = s.teams[t] || { w: 0, l: 0, pf: 0, pa: 0 },
    year = S.financeYear(s),
    players = S.roster(s, t) || [];
  let seed = 0,
    mark = null;
  try {
    const pic = playoffPicture(s);
    seed = pic.conferences[Math.floor(t / 16)]?.seeds.indexOf(t) + 1 || 0;
    mark = pic.marks[t] || null;
  } catch {}
  const staff = club.staff || [],
    role = (r) => staff.find((c) => c.role === r) || null,
    hc = role("HC");
  // Roster rows with the contract numbers the screens show.
  const rows = players.map((p) => {
    const c = f.contracts?.[p.id],
      live = c && !c.ended && c.team === t;
    return { p, id: p.id, name: p.name, pos: p.pos, ovr: p.ovr, pot: p.pot, age: p.age, starter: !!p.starter, status: p.status || "active", injury: p.injury || 0, unit: unitOf(p.pos), cap: live ? S.capHit(c, year) : 0, through: live ? c.start + c.years - 1 : null };
  });
  const cap = S.capLedger(s, t, year),
    topContracts = rows
      .filter((r) => r.cap > 0)
      .sort((a, b) => b.cap - a.cap)
      .slice(0, 6),
    txs = transactionsFor(s, { team: t }),
    nameOf = (id) => players.find((p) => p.id === id)?.name || transactionsFor(s, { playerId: id })[0]?.name || "Former player",
    dead = (f.dead || [])
      .filter((d) => d.team === t && d.year === year && d.amount > 0)
      .map((d) => ({ ...d, name: nameOf(d.playerId) }))
      .sort((a, b) => b.amount - a.amount);
  const fixtures = clubFixtures(s, t),
    played = fixtures.filter((r) => r.done);
  const titles = M.championshipList(s, teams).filter((c) => c.winner === t),
    her = heritage?.teams?.find((x) => x.id === t) || null,
    legends = (heritage?.legends || []).filter((l) => (l.teamIds || []).includes(t) || (her?.legendIds || []).includes(l.id)),
    former = [...(f.retired || []), ...(f.hall || [])]
      .filter((r, i, a) => r.team === t && a.findIndex((x) => x.id === r.id) === i)
      .sort((a, b) => (b.legacy || 0) - (a.legacy || 0)),
    coachMoves = (f.staffMovements || []).filter((m) => (m.to === t || m.from === t) && ["HC", "OC", "DC"].includes(m.role));
  const st = club.stadium || {},
    weather = climateFor(abbr, climate);
  return {
    team: t,
    own,
    abbr,
    city,
    nickname,
    name: `${city} ${nickname}`,
    division,
    conference: division.split(" ")[0],
    colors: (() => {
      try {
        return teamColors(t, s);
      } catch {
        return { primary: "", secondary: "" };
      }
    })(),
    record: { ...rec, t: rec.t || 0, text: recordText(rec), diff: (rec.pf || 0) - (rec.pa || 0), played: played.length },
    standing: { rank: order.indexOf(t) + 1, of: order.length, label: `${ordinal(order.indexOf(t) + 1)} in the ${division}`, seed, mark },
    mode: teamMode(s, t),
    form: recentForm(s, t),
    streak: streak(recentForm(s, t, 17)),
    ratings: ratingSplit(players, own ? null : s.teams[t]?.rating),
    owner: club.owner || null,
    staff: { hc, oc: role("OC"), dc: role("DC"), stc: role("STC"), all: staff },
    scheme: {
      style: own ? s.coach?.style || hc?.scheme || "Balanced" : hc?.scheme || "Balanced",
      offense: own ? s.coach?.offense || role("OC")?.scheme || "—" : role("OC")?.scheme || "—",
      defense: own ? s.coach?.defense || role("DC")?.scheme || "—" : role("DC")?.scheme || "—",
    },
    stadium: {
      name: st.name || `${city} Field`,
      city: st.city || city,
      capacity: st.capacity || 0,
      condition: Math.round(st.condition ?? 0),
      ticket: st.ticket ?? null,
      concessions: st.concessions ?? null,
      attendance: Math.round((club.attendance ?? 0) * 100),
      crowd: Math.round((st.capacity || 0) * (club.attendance ?? 0)),
      fanApproval: Math.round(club.fanApproval ?? 0),
      medical: st.medical ?? 1,
      training: st.training ?? 1,
      projects: (st.projects || []).filter((p) => p.remaining > 0),
      ...weather,
    },
    roster: {
      rows,
      counts: {
        total: rows.length,
        active: rows.filter((r) => r.status === "active" || r.status === "elevated").length,
        practice: rows.filter((r) => r.status === "practice").length,
        ir: rows.filter((r) => r.status === "ir").length,
        injured: rows.filter((r) => r.injury > 0).length,
        starters: rows.filter((r) => r.starter).length,
      },
      depth: depthChart(players),
      top: rows
        .filter((r) => r.status !== "practice")
        .sort((a, b) => b.ovr - a.ovr)
        .slice(0, 5),
      injuries: rows.filter((r) => r.injury > 0).sort((a, b) => b.ovr - a.ovr),
    },
    schedule: { fixtures, upcoming: fixtures.filter((r) => !r.bye && !r.done).slice(0, 4), next: fixtures.find((r) => r.next) || null },
    h2h: own ? null : M.headToHead(s, s.team, t),
    history: { seasons: seasonHistory(s, t), titles, retired: her?.retiredNumbers || [], legends, former, records: clubRecords(s, t), coachMoves },
    transactions: txs,
    finances: {
      year,
      cap,
      topContracts,
      dead,
      deadTotal: dead.reduce((n, d) => n + d.amount, 0),
      outlook: commitments(s, year, 3, t),
      cash: club.cash ?? null,
    },
    followed: (f.office?.followedTeams || []).includes(t),
  };
}

// Search helper for Ctrl+K: clubs whose name, city or abbreviation matches.
export function findClubs(query, teams = globalThis.clubs) {
  const q = String(query || "").toLowerCase().trim();
  if (q.length < 2 || !teams) return [];
  return teams
    .map((c, i) => ({ i, text: `${c[0]} ${c[1]} ${c[2]} ${c[1]} ${c[2]}`.toLowerCase(), abbr: c[0].toLowerCase() }))
    .filter((c) => c.abbr === q || c.text.includes(q))
    .map((c) => c.i);
}

// A club name as a link to its profile.
export const clubLink = (t, label, cls = "") =>
  `<button type="button" class="link club-link ${cls}" onclick="event.stopPropagation();W.club(${Number(t)})" title="Open the club profile">${label}</button>`;

/* ============================================================================ dialog */
const TABS = ["Overview", "Roster", "Schedule", "History", "Stadium & finances"];
const ROSTER_PAGE = 12,
  TX_PAGE = 8,
  SEASON_PAGE = 8;

export function installClubProfile({ heritage = null } = {}) {
  if (typeof document === "undefined") return;
  if (!document.querySelector('link[href="club.css"]')) document.head.insertAdjacentHTML("beforeend", '<link rel="stylesheet" href="club.css">');
  const ui = { team: null, tab: "Overview", unit: "All", sort: "depth", page: 0, tx: 0, seasons: 0 };
  const h = (v) => (typeof esc === "function" ? esc(v) : String(v ?? ""));
  const money = (n) => "$" + (n / S.MILLION).toFixed(1) + "M";
  const chip = (text, tone = "") => `<span class="gp-chip ${tone}">${text}</span>`;
  const panel = (title, body, extra = "", cls = "") =>
    `<section class="gp-panel ${cls}"><div class="gp-panel-head"><h3>${title}</h3>${extra ? `<div>${extra}</div>` : ""}</div><div class="gp-panel-body">${body}</div></section>`;
  const tile = (label, value, sub = "", tone = "") => `<div class="gp-tile ${tone}"><small>${label}</small><b>${value}</b>${sub ? `<span>${sub}</span>` : ""}</div>`;
  const blocks = (value, max, cells = 10, tone = "") => {
    const on = blockCount(value, max, cells);
    return `<span class="gp-blocks ${tone}" aria-hidden="true">${Array.from({ length: cells }, (_, i) => `<i${i < on ? ' class="on"' : ""}></i>`).join("")}</span>`;
  };
  const tone = (v, good = 65, bad = 45) => (v >= good ? "good" : v <= bad ? "bad" : "warn");
  const meter = (label, value, max, text, t = tone(value)) => `<div class="gp-meter"><span>${label}</span>${blocks(value, max, 10, t)}<b class="${t}">${text}</b></div>`;
  const pager = (pg, fn, label) =>
    pg.pages > 1
      ? `<div class="gp-pager"><span>${label}</span><div><button class="secondary small" onclick="ClubUI.${fn}(${pg.page - 1})" ${pg.page ? "" : "disabled"}>◀ Prev</button><b>${pg.page + 1} / ${pg.pages}</b><button class="secondary small" onclick="ClubUI.${fn}(${pg.page + 1})" ${pg.page >= pg.pages - 1 ? "disabled" : ""}>Next ▶</button></div></div>`
      : "";
  const pageOf = (rows, page, size) => {
    const pages = Math.max(1, Math.ceil(rows.length / size)),
      at = Math.max(0, Math.min(pages - 1, page | 0));
    return { rows: rows.slice(at * size, at * size + size), page: at, pages };
  };
  const crest = (t, size = 40, cls = "") => {
    let c = { primary: "", secondary: "" };
    try {
      c = teamColors(t);
    } catch {}
    return `<span class="cp-crest ${cls}" style="--sz:${size}px;--club:${c.primary};--club-2:${c.secondary}">${logo(t)}</span>`;
  };
  const oppName = (t) => (typeof cname === "function" ? cname(t) : clubs[t].slice(1, 3).join(" "));
  const face = (p, team, size = 32) => pixelFace(p, { size, team });
  const playerBtn = (r, team, sub = "") =>
    `<button class="link cp-player" onclick="W.player('${h(r.id)}',${team})">${face(r.p, team, 30)}<span><b>${h(r.name)}</b>${sub ? `<small>${sub}</small>` : ""}</span></button>`;
  const res = (r) => `<span class="cp-res ${r === "W" ? "w" : r === "L" ? "l" : "t"}">${r}</span>`;
  const statusChip = (r) =>
    r.injury ? chip(`Inj ${r.injury}w`, "bad") : r.status === "ir" ? chip("IR", "bad") : r.status === "practice" ? chip("PS") : r.starter ? chip("Starter", "accent") : "";

  // ---- Overview
  function overview(m) {
    const r = m.record,
      st = m.standing,
      cap = m.finances.cap,
      tiles = `<div class="gp-tiles">${tile("Record", r.text, `${r.played} played · ${r.pf}–${r.pa} points`, r.w > r.l ? "good" : r.l > r.w ? "bad" : "")}${tile("Standing", st.rank ? ordinal(st.rank) : "—", `${h(m.division)}${st.seed ? ` · seed ${st.seed}` : ""}`, st.rank === 1 ? "good" : "")}${tile("Point diff", `${r.diff > 0 ? "+" : ""}${r.diff}`, m.streak ? `Streak ${m.streak}` : "No streak yet", r.diff > 0 ? "good" : r.diff < 0 ? "bad" : "")}${tile("Cap room", money(cap.room), `${SV.money(cap.used / S.MILLION, cap.limit / S.MILLION, { label: `${money(cap.used)} of ${money(cap.limit)} used` })}${money(cap.used)} of ${money(cap.limit)} used`, cap.room < 0 ? "bad" : "accent")}</div>`;
    const person = (c, label, size = 44) =>
      c
        ? `<div class="cp-person">${staffBust(c, { size, team: m.team, appearance: c.userControlled ? coachAppearance(state) : null })}<span><small>${label}</small><b>${h(c.name)}</b><em>${h(c.scheme || "")}${c.personality ? ` · ${h(c.personality)}` : ""}</em></span>${Number.isFinite(c.rating) ? `<strong class="sv-rate ${SV.toneFor(c.rating, 75, 60)}" title="${c.rating} ability"><b>${c.rating}</b><small>ABL</small></strong>` : ""}</div>`
        : `<div class="cp-person cp-vacant"><span class="cp-bust-empty" aria-hidden="true">?</span><span><small>${label}</small><b>Vacant</b><em>Appointment pending</em></span></div>`;
    const o = m.owner,
      leadership = panel(
        "Leadership",
        `<div class="cp-people">${o ? `<div class="cp-person">${staffBust({ id: "owner-" + m.team, name: o.name, role: "Owner" }, { size: 40, team: m.team })}<span><small>Owner</small><b>${h(o.name)}</b><em>${h(o.trait || "")}${o.age ? ` · age ${Math.round(o.age)}` : ""}</em></span></div>` : ""}${person(m.staff.hc, "Head coach", 40)}${person(m.staff.oc, "Off. coordinator", 40)}${person(m.staff.dc, "Def. coordinator", 40)}</div>${o ? meter("Owner patience", o.patience ?? 0, 100, Math.round(o.patience ?? 0) + "%") : ""}`,
        m.own ? `<button class="link" onclick="closeModal();W.open('Staff')">Coaching staff →</button>` : `<small>${m.staff.all.length} staff</small>`,
      );
    const c = m.colors,
      identity = panel(
        "Identity",
        `<dl class="cp-facts"><div><dt>Team style</dt><dd>${h(m.scheme.style)}</dd></div><div><dt>Offense</dt><dd>${h(m.scheme.offense)}</dd></div><div><dt>Defense</dt><dd>${h(m.scheme.defense)}</dd></div><div><dt>Front office</dt><dd>${h(m.mode)}</dd></div><div><dt>Colours</dt><dd><span class="cp-swatch" style="background:${c.primary}"></span><span class="cp-swatch" style="background:${c.secondary}"></span></dd></div><div><dt>Home</dt><dd>${h(m.stadium.name)}</dd></div></dl><div class="cp-formline"><small>Last ${m.form.length || 5}</small>${m.form.length ? m.form.map(res).join("") : "<em>No games yet</em>"}</div>`,
        chip(h(m.mode), m.mode === "Contender" ? "good" : m.mode === "Rebuilding" ? "warn" : ""),
      );
    const top = panel(
      "Top players",
      m.roster.top.length ? `<div class="cp-top">${m.roster.top.map((x) => `<button class="link cp-top-card" onclick="W.player('${h(x.id)}',${m.team})">${face(x.p, m.team, 48)}<b>${h(x.name)}</b><small>${h(x.pos)} · ${x.age} yrs</small><strong>${x.ovr}</strong></button>`).join("")}</div>` : `<p class="gp-note">No players under contract.</p>`,
      `<button class="link" onclick="ClubUI.tab('Roster')">Full roster →</button>`,
    );
    const next = m.schedule.next,
      meet = m.schedule.fixtures.find((x) => !x.bye && !x.done && x.opponent === state.team),
      h2h = m.h2h,
      vs = m.own
        ? panel("Next game", next ? `<div class="cp-next">${crest(next.opponent, 44)}<span><small>${next.stage === "Regular season" ? "Week " + next.week : h(next.stage)} · ${next.home ? "Home" : "Away"}</small>${clubLink(next.opponent, h(oppName(next.opponent)))}<em>${recordText(state.teams[next.opponent])} this season</em></span></div>` : `<p class="gp-note">No games left this season.</p>`, `<button class="link" onclick="ClubUI.tab('Schedule')">Schedule →</button>`)
        : panel(
            `Against ${h(clubs[state.team][2])}`,
            h2h.games.length
              ? `<div class="cp-h2h"><strong>${recordText({ w: h2h.allTime.wins, l: h2h.allTime.losses, t: h2h.allTime.ties })}</strong><span>Your all-time record · ${h2h.games.length} meeting${h2h.games.length === 1 ? "" : "s"}</span><div>${h2h.games.slice(0, 5).map((g) => `<span class="cp-meet">${res(g.result)}<b>${g.pf}–${g.pa}</b><small>${g.year}</small></span>`).join("")}</div></div>`
              : `<p class="gp-note">You haven't played the ${h(m.nickname)} yet in this career. Results appear here after the first meeting.</p>${meet ? `<p class="gp-note"><b>Next meeting:</b> ${meet.stage === "Regular season" ? "week " + meet.week : h(meet.stage)}, ${meet.home ? "at their place" : "at yours"}.</p>` : ""}`,
            `<button class="link" onclick="closeModal();Nav.rival(${m.team})">Head-to-head →</button>`,
          );
    return `${tiles}<div class="gp-grid">${leadership}${identity}</div><div class="gp-grid gp-grid-wide">${top}${vs}</div>`;
  }

  // ---- Roster: depth chart by position, then a sortable, paged list.
  function roster(m) {
    const depth = m.roster.depth.filter((d) => ui.unit === "All" || d.unit === ui.unit),
      chart = `<div class="cp-depth">${depth
        .map(
          (d) =>
            `<div class="cp-pos"><span class="cp-pos-tag">${d.pos}</span><div>${(d.starters.length ? d.starters : d.players.slice(0, 1))
              .map((p) => `<button class="link cp-dc ${p.injury ? "hurt" : ""}" onclick="W.player('${h(p.id)}',${m.team})" title="${h(p.name)} · ${p.ovr} OVR${p.injury ? ` · injured ${p.injury}w` : ""}">${face(p, m.team, 26)}<b>${h(String(p.name).split(" ").at(-1))}</b><i>${p.ovr}</i></button>`)
              .join("")}</div>${d.depth.length ? `<small>+${d.depth.length}</small>` : ""}</div>`,
        )
        .join("")}</div>`;
    const sorters = { depth: (a, b) => POS_ORDER.indexOf(a.pos) - POS_ORDER.indexOf(b.pos) || b.starter - a.starter || b.ovr - a.ovr, ovr: (a, b) => b.ovr - a.ovr, age: (a, b) => a.age - b.age || b.ovr - a.ovr, cap: (a, b) => b.cap - a.cap };
    const list = m.roster.rows.filter((r) => ui.unit === "All" || r.unit === ui.unit).sort(sorters[ui.sort] || sorters.depth),
      pg = pageOf(list, ui.page, ROSTER_PAGE);
    ui.page = pg.page;
    const seg = (items, cur, fn) => `<div class="cp-seg" role="group">${items.map(([k, label]) => `<button type="button" class="${k === cur ? "on" : ""}" aria-pressed="${k === cur}" onclick="ClubUI.${fn}('${k}')">${label}</button>`).join("")}</div>`;
    const c = m.roster.counts,
      table = `<div class="gp-table-wrap"><table class="gp-table cp-roster" data-no-sort="true"><thead><tr><th>Player</th><th>Pos</th><th class="num">OVR</th><th class="num">Age</th><th class="num">Cap hit</th><th class="num">Thru</th><th>Status</th></tr></thead><tbody>${pg.rows
        .map((r) => `<tr><td>${playerBtn(r, m.team)}</td><td>${h(r.pos)}</td><td class="num"><b class="cp-ovr">${r.ovr}</b></td><td class="num">${r.age}</td><td class="num">${r.cap ? money(r.cap) : "—"}</td><td class="num">${r.through ?? "—"}</td><td>${statusChip(r)}</td></tr>`)
        .join("")}</tbody></table></div>${pager(pg, "page", `${list.length} players`)}`;
    const injuries = m.roster.injuries.length ? `<div class="cp-injuries"><small>Injured</small>${m.roster.injuries.slice(0, 6).map((r) => `<button class="link" onclick="W.player('${h(r.id)}',${m.team})">${h(r.pos)} ${h(r.name)} <b>${r.injury}w</b></button>`).join("")}${m.roster.injuries.length > 6 ? `<em>+${m.roster.injuries.length - 6} more</em>` : ""}</div>` : "";
    return `<div class="cp-roster-bar">${seg([["All", "All"], ["Offense", "Offense"], ["Defense", "Defense"], ["Special teams", "Special"]], ui.unit, "unit")}<span class="cp-counts">${chip(`${c.active} active`)}${chip(`${c.practice} practice`)}${c.ir ? chip(`${c.ir} IR`, "warn") : ""}${chip(`${c.injured} injured`, c.injured ? "bad" : "")}</span></div>${panel("Depth chart", chart + injuries, `<small>Starters · tap a player for his profile</small>`)}${panel("Roster", table, seg([["depth", "Depth"], ["ovr", "OVR"], ["age", "Age"], ["cap", "Cap"]], ui.sort, "sort"))}`;
  }

  // ---- Schedule & results
  function schedule(m) {
    const fx = m.schedule.fixtures,
      strip = `<div class="cp-strip" style="--cols:${Math.max(9, Math.ceil(fx.length / 2))}">${fx
        .map((r) => {
          const label = r.stage === "Regular season" ? "WK " + r.week : { "Wild Card": "WC", Divisional: "DIV", Conference: "CONF", Championship: "FINAL" }[r.stage] || "POST";
          if (r.bye) return `<div class="cp-wk bye"><span>${label}</span><b>BYE</b><small>Rest</small></div>`;
          return `<button type="button" class="link cp-wk ${r.done ? "r-" + r.result.toLowerCase() : ""} ${r.next ? "next" : ""} ${r.opponent === state.team && !m.own ? "you" : ""}" onclick="W.club(${r.opponent})" title="${h(`${label}: ${r.home ? "vs" : "at"} ${oppName(r.opponent)}${r.done ? ` · ${r.result} ${r.for}–${r.against}` : ""}`)}"><span>${label}</span>${crest(r.opponent, 26)}<em>${r.home ? "vs" : "@"} ${h(clubs[r.opponent][0])}</em><small>${r.done ? `${r.result} ${r.for}-${r.against}` : r.next ? "NEXT" : r.opponent === state.team && !m.own ? "YOU" : "—"}</small></button>`;
        })
        .join("")}</div><div class="cp-legend"><span>${res("W")} Win</span><span>${res("L")} Loss</span><span><i class="cp-key next"></i> Next game</span>${m.own ? "" : `<span><i class="cp-key you"></i> Against you</span>`}<span>Select a week for that opponent's profile.</span></div>`;
    const done = fx.filter((r) => r.done),
      home = done.filter((r) => r.home),
      away = done.filter((r) => !r.home),
      split = (list) => recordText({ w: list.filter((r) => r.result === "W").length, l: list.filter((r) => r.result === "L").length, t: list.filter((r) => r.result === "T").length }),
      up = m.schedule.upcoming,
      upcoming = up.length
        ? `<div class="cp-list">${up.map((r) => `<div class="cp-line">${crest(r.opponent, 30)}<span>${clubLink(r.opponent, `${r.home ? "vs" : "@"} ${h(oppName(r.opponent))}`)}<small>${r.stage === "Regular season" ? "Week " + r.week : h(r.stage)} · ${recordText(state.teams[r.opponent])}</small></span>${r.opponent === state.team && !m.own ? chip("You", "accent") : chip(r.home ? "Home" : "Away")}</div>`).join("")}</div>`
        : `<p class="gp-note">No games left this season.</p>`,
      results = done.length
        ? `<div class="cp-list">${done
            .slice(-5)
            .reverse()
            .map((r) => `<div class="cp-line">${crest(r.opponent, 30)}<span>${clubLink(r.opponent, `${r.home ? "vs" : "@"} ${h(oppName(r.opponent))}`)}<small>${r.stage === "Regular season" ? "Week " + r.week : h(r.stage)}</small></span><span class="cp-score">${res(r.result)}<b>${r.for}–${r.against}</b></span></div>`)
            .join("")}</div>`
        : `<p class="gp-note">Results appear after the first game of the season.</p>`;
    const h2h = m.h2h
      ? panel(
          `Head-to-head with you`,
          m.h2h.games.length
            ? `<div class="gp-tiles">${tile("All-time", recordText({ w: m.h2h.allTime.wins, l: m.h2h.allTime.losses, t: m.h2h.allTime.ties }), `Your record · ${m.h2h.allTime.pf}–${m.h2h.allTime.pa} points`, m.h2h.allTime.wins >= m.h2h.allTime.losses ? "good" : "bad")}${tile("Playoffs", recordText({ w: m.h2h.playoffs.wins, l: m.h2h.playoffs.losses, t: m.h2h.playoffs.ties }))}${tile("Last met", m.h2h.last ? `${m.h2h.last.result} ${m.h2h.last.pf}–${m.h2h.last.pa}` : "—", m.h2h.last ? String(m.h2h.last.year) : "")}</div>`
            : `<p class="gp-note">No meetings yet in this career.</p>`,
          `<button class="link" onclick="closeModal();Nav.rival(${m.team})">Full head-to-head →</button>`,
        )
      : "";
    return `${panel(`${state.year} season`, strip, `<small>Home ${split(home)} · Away ${split(away)}</small>`)}<div class="gp-grid">${panel("Upcoming", upcoming)}${panel("Latest results", results)}</div>${h2h}`;
  }

  // ---- History
  function history(m) {
    const H = m.history,
      pg = pageOf(H.seasons, ui.seasons, SEASON_PAGE);
    ui.seasons = pg.page;
    const seasons = H.seasons.length
      ? `<div class="gp-table-wrap"><table class="gp-table cp-seasons" data-no-sort="true"><thead><tr><th>Season</th><th class="num">W–L</th><th class="num">PF</th><th class="num">PA</th><th>Finish</th></tr></thead><tbody>${pg.rows
          .map((r) => `<tr class="${r.current ? "now" : ""}"><td>${r.year}</td><td class="num">${r.record}</td><td class="num">${r.pf}</td><td class="num">${r.pa}</td><td>${r.title ? "🏆 " : ""}<span class="cp-finish ${r.tone}">${h(r.result)}</span></td></tr>`)
          .join("")}</tbody></table></div>${pager(pg, "seasons", `${H.seasons.length} seasons`)}`
      : `<p class="gp-note">Season records appear here as the career goes on.</p>`;
    const titles = H.titles.length
      ? `<div class="cp-titles">${H.titles.map((c) => `<span class="cp-title ${c.kind === "career" ? "career" : ""}" title="${h(c.kind === "career" ? "Won in this career" : "Historical champion")}"><b>${c.year}</b>${c.score ? `<small>${c.score[0]}–${c.score[1]}</small>` : ""}</span>`).join("")}</div>`
      : `<p class="gp-note">No Super Bowl titles yet.</p>`;
    const records = H.records.length
      ? `<div class="cp-records">${H.records.map((r) => `<div><small>${h(r.label)}</small><b>${r.value.toLocaleString("en-US")}</b><span><button class="link" onclick="W.player('${h(r.id)}',${m.team})">${h(r.name)}</button> · ${r.year}</span></div>`).join("")}</div>`
      : `<p class="gp-note">Club single-season records are set from the first regular-season game of this career.</p>`;
    const retired = H.retired.length ? `<div class="cp-numbers">${H.retired.map((r) => `<span><b>${r.number}</b><small>${h(r.name)}</small></span>`).join("")}</div>` : "";
    const greats = [...H.legends.map((l) => `<span class="cp-legend-name"><b>${h(l.name)}</b><small>${h(l.role || l.category || "")}${l.classYear ? ` · HOF ${l.classYear}` : ""}</small></span>`), ...H.former.slice(0, 6).map((r) => `<span class="cp-legend-name"><b>${h(r.name)}</b><small>${h(r.pos || "")}${r.retired ? ` · retired ${r.retired}` : ""}</small></span>`)];
    const legends = retired || greats.length ? `${retired ? `<span class="gp-label">Retired numbers</span>${retired}` : ""}${greats.length ? `<span class="gp-label">Hall of Famers and former greats</span><div class="cp-greats">${greats.join("")}</div>` : ""}` : `<p class="gp-note">No retired numbers or Hall of Famers recorded for this club yet.</p>`;
    const coaches = H.coachMoves.length
      ? `<div class="cp-list">${H.coachMoves.slice(0, 5).map((c) => `<div class="cp-line plain"><span><b>${h(c.name)}</b><small>${h(STAFF_ROLES[c.role] || c.role)} · ${c.to === m.team ? "joined" : "left"} ${c.year}</small></span></div>`).join("")}</div>`
      : `<p class="gp-note">No coaching changes recorded in this career.</p>`;
    const tp = pageOf(m.transactions, ui.tx, TX_PAGE);
    ui.tx = tp.page;
    const teamName = (t) => clubs[t]?.[2] || `Team ${t + 1}`;
    const moves = m.transactions.length
      ? `<div class="cp-moves">${tp.rows.map((e) => `<div class="cp-move"><span class="tx-type tx-${e.type}">${TRANSACTION_TYPES[e.type] || e.type}</span><span><b>${h(describeTransaction(e, teamName, m.team))}</b><small>${e.year} · ${e.phase === "season" ? `Week ${(e.week ?? 0) + 1}` : e.phase === "playoffs" ? "Playoffs" : "Offseason"}</small></span></div>`).join("")}</div>${pager(tp, "tx", `${m.transactions.length} moves`)}`
      : `<p class="gp-note">Signings, trades, claims and releases involving this club are logged here from the first market day.</p>`;
    return `<div class="gp-grid gp-grid-wide">${panel("Seasons", seasons)}${panel(`Championships · ${H.titles.length}`, titles)}</div><div class="gp-grid">${panel("Club records", records, `<small>Best single season</small>`)}${panel("Legends", legends)}</div><div class="gp-grid gp-grid-wide">${panel("Transactions", moves, `<button class="link" onclick="ClubUI.log(${m.team})">Full log →</button>`)}${panel("Coaching changes", coaches)}</div>`;
  }

  // ---- Stadium & finances
  function stadium(m) {
    const s = m.stadium,
      F = m.finances,
      cap = F.cap,
      facts = `<div class="gp-tiles">${tile("Capacity", s.capacity.toLocaleString("en-US"), `${h(s.city)}`)}${tile("Crowd", s.crowd.toLocaleString("en-US"), `${s.attendance}% attendance`, tone(s.attendance, 85, 65))}${tile("Ticket", s.ticket != null ? "$" + s.ticket : "—", s.concessions != null ? `Concessions $${s.concessions}` : "")}${tile("Roof", h(s.roof), h(s.climate || ""), s.indoor ? "accent" : "")}</div>`,
      ground = panel(
        h(s.name),
        `${meter("Condition", s.condition, 100, s.condition + "%")}${meter("Fan approval", s.fanApproval, 100, s.fanApproval + "%")}${meter("Attendance", s.attendance, 100, s.attendance + "%")}${meter("Medical centre", s.medical, 5, "Tier " + s.medical, "")}${meter("Training facility", s.training, 5, "Tier " + s.training, "")}${s.weather ? `<p class="gp-note"><b>Typical weather:</b> ${h(s.weather)}.</p>` : ""}${s.projects.length ? `<p class="gp-note">Projects under way: ${s.projects.map((p) => h(p.name)).join(", ")}.</p>` : ""}`,
        chip(h(s.roof), s.indoor ? "accent" : ""),
      );
    const usedPct = cap.limit ? Math.round((cap.used / cap.limit) * 100) : 0,
      capPanel = panel(
        `Salary cap · ${F.year}`,
        `${meter("Cap used", usedPct, 100, usedPct + "%", usedPct > 97 ? "bad" : usedPct > 88 ? "warn" : "good")}<dl class="cp-facts"><div><dt>Cap room</dt><dd class="${cap.room < 0 ? "bad" : ""}">${money(cap.room)}</dd></div><div><dt>Active contracts</dt><dd>${money(cap.live)}</dd></div><div><dt>Dead money</dt><dd class="${F.deadTotal ? "bad" : ""}">${money(cap.dead)}</dd></div>${F.cash != null ? `<div><dt>Club cash</dt><dd>${money(F.cash)}</dd></div>` : ""}</dl><span class="gp-label">Next seasons</span><div class="cp-outlook">${F.outlook.map((y) => `<span><small>${y.year}</small><b class="${y.room < 0 ? "bad" : ""}">${money(y.room)}</b><em>${y.contracts} deals</em></span>`).join("")}</div>`,
        m.own ? `<button class="link" onclick="closeModal();W.open('Contracts')">Cap sheet →</button>` : "",
      );
    const top = panel(
      "Top contracts",
      F.topContracts.length ? `<div class="cp-list">${F.topContracts.map((r) => `<div class="cp-line pl">${playerBtn(r, m.team, `${h(r.pos)} · through ${r.through ?? "—"}`)}<b class="cp-money">${money(r.cap)}</b></div>`).join("")}</div>` : `<p class="gp-note">No contracts on the books.</p>`,
    );
    const dead = panel(
      "Dead money",
      F.dead.length ? `<div class="cp-list">${F.dead.slice(0, 5).map((d) => `<div class="cp-line plain"><span><b>${h(d.name)}</b><small>${h(d.reason || "Release")}</small></span><b class="cp-money bad">${money(d.amount)}</b></div>`).join("")}</div>` : `<p class="gp-note">No dead money this league year.</p>`,
    );
    return `${facts}<div class="gp-grid">${ground}${capPanel}</div><div class="gp-grid">${top}${dead}</div>`;
  }

  function html(m) {
    const body = ui.tab === "Roster" ? roster(m) : ui.tab === "Schedule" ? schedule(m) : ui.tab === "History" ? history(m) : ui.tab === "Stadium & finances" ? stadium(m) : overview(m);
    const tabs = TABS.map((t) => `<button role="tab" aria-selected="${ui.tab === t}" class="${ui.tab === t ? "on active" : ""}" onclick="ClubUI.tab('${t}')">${t === "Stadium & finances" ? `<span class="cp-tab-long">Stadium & finances</span><span class="cp-tab-short">Stadium</span>` : t}</button>`).join("");
    const st = m.standing,
      chips = [m.own ? chip("Your club", "accent") : "", chip(`${st.rank ? ordinal(st.rank) : "—"} ${h(m.division)}`), st.seed ? chip(`Seed ${st.seed}`, "good") : "", st.mark === "e" ? chip("Eliminated", "bad") : st.mark === "y" ? chip("Division clinched", "good") : st.mark === "x" ? chip("Playoff berth", "good") : "", chip(h(m.mode)), m.followed && !m.own ? chip("★ Following", "accent") : ""].join("");
    const rating = (label, v) => `<div class="gp-badge ${v >= 85 ? "good" : v >= 75 ? "accent" : v >= 68 ? "warn" : "bad"}"><b>${v ?? "—"}</b><small>${label}</small></div>`;
    const actions = m.own
      ? `<button onclick="closeModal();W.open('Roster')">Open squad</button><button class="secondary" onclick="closeModal();W.open('Club')">Organization hub</button>`
      : `<button onclick="ClubUI.trade(${m.team})">Trade with the ${h(m.nickname)}</button><button class="secondary" onclick="ClubUI.follow(${m.team},${!m.followed})">${m.followed ? "★ Following" : "☆ Follow team"}</button>`;
    return `<div class="gp-profile cp-profile" style="--gp-club:${m.colors.primary || "var(--team)"}"><div class="gp-head cp-head">${crest(m.team, 88, "cp-crest-lg")}<div class="gp-id"><span class="gp-kicker">${h(m.conference)} · ${h(m.division)} · ${h(m.stadium.city)}</span><h2>${h(m.name)}</h2><p><b class="cp-rec">${m.record.text}</b> · ${h(st.label)} · HC ${h(m.staff.hc?.name || "vacant")} · Owner ${h(m.owner?.name || "—")}</p><div class="gp-chips">${chips}</div></div><div class="gp-badges">${rating("OVR", m.ratings.overall)}${rating("OFF", m.ratings.offense)}${rating("DEF", m.ratings.defense)}</div><button class="gp-x" onclick="closeModal()" aria-label="Close club profile">×</button></div><div class="gp-tabs" role="tablist" aria-label="Club profile sections">${tabs}</div><div class="gp-body" role="tabpanel">${body}</div><div class="gp-foot"><div class="gp-actions">${actions}</div><div class="gp-jumps"><span>Open in</span><button class="link" onclick="closeModal();W.open('League desk')">League snapshot</button><button class="link" onclick="closeModal();${m.own ? "W.open('Calendar','Head-to-head')" : `Nav.rival(${m.team})`}">Head-to-head</button></div></div></div>`;
  }

  function show() {
    const m = clubProfile(state, ui.team, { teams: clubs, heritage });
    if (!m) {
      toast("This club could not be found.");
      return;
    }
    const dialog = document.getElementById("modal"),
      body = dialog.open && dialog.classList.contains("club-profile") ? dialog.querySelector(".gp-body") : null,
      keep = body && ui.shown === ui.tab ? body.scrollTop : 0;
    ui.shown = ui.tab;
    modal(html(m));
    dialog.classList.add("club-profile");
    if (keep) dialog.querySelector(".gp-body").scrollTop = keep;
  }
  function open(team, tab = "Overview") {
    const t = Number(team);
    if (!Number.isInteger(t) || !clubs[t] || !state?.franchise?.clubs?.[t]) return;
    if (ui.team !== t) Object.assign(ui, { unit: "All", sort: "depth", page: 0, tx: 0, seasons: 0 });
    ui.team = t;
    ui.tab = TABS.includes(tab) ? tab : "Overview";
    show();
  }
  const rerender = (patch) => {
    Object.assign(ui, patch);
    show();
  };
  window.ClubUI = {
    open,
    tab: (t) => rerender({ tab: t }),
    unit: (u) => rerender({ unit: u, page: 0 }),
    sort: (k) => rerender({ sort: k, page: 0 }),
    page: (n) => rerender({ page: Math.max(0, n | 0) }),
    tx: (n) => rerender({ tx: Math.max(0, n | 0) }),
    seasons: (n) => rerender({ seasons: Math.max(0, n | 0) }),
    follow(t, on) {
      if (window.Office?.followTeam) window.Office.followTeam(Number(t), !!on);
      show();
    },
    trade(t) {
      closeModal();
      W.open("Market");
      window.Ops?.partner?.(Number(t));
    },
    // League snapshot's transaction log, filtered to this club.
    log(t) {
      closeModal();
      window.Nav?.txFilter?.("team", Number(t) === state.team ? "mine" : String(t));
      W.open("League desk", "Transactions");
    },
    model: (t) => clubProfile(state, t, { teams: clubs, heritage }),
  };
  W.club = open;
  // A modal opened by anything else drops the club-profile frame.
  const previousModal = modal;
  modal = function (markup) {
    document.getElementById("modal").classList.remove("club-profile");
    previousModal(markup);
  };
  const previousClose = closeModal;
  closeModal = function () {
    previousClose();
    document.getElementById("modal").classList.remove("club-profile");
  };

  // Club names and crests anywhere on a screen open the profile, like player names do. Logos carry
  // data-club (ui.mjs); text that is exactly a club's name, nickname or (beside its logo) its
  // abbreviation is linked too. Anything already inside a button, link or handler is left alone.
  const INTERACTIVE = "button, a, select, input, label, summary, [onclick], [data-club-open], [contenteditable]";
  function linkClubs(root = document.getElementById("app")) {
    if (!root || !state?.franchise) return;
    const names = new Map();
    clubs.forEach((c, i) => {
      const full = typeof cname === "function" ? cname(i) : `${c[1]} ${c[2]}`;
      for (const n of [full, `${c[1]} ${c[2]}`, c[2]]) if (!names.has(n)) names.set(n, i);
    });
    for (const img of root.querySelectorAll("img.team-logo[data-club]")) {
      const host = img.closest(".lg-crest, .fd-crest, .mk-logo, .cp-crest") || img;
      if (host.dataset.clubOpen || host.parentElement?.closest(INTERACTIVE) || img.closest("button, a, [onclick]")) continue;
      host.dataset.clubOpen = img.dataset.club;
      host.classList.add("club-link-auto");
      host.setAttribute("role", "link");
      host.setAttribute("tabindex", "0");
      host.title = `Open the ${clubs[img.dataset.club]?.[2] || "club"} profile`;
    }
    for (const el of root.querySelectorAll("td, b, strong, h2, h3, .lg-name, .fd-club b")) {
      if (el.dataset.clubOpen || el.children.length || el.closest(INTERACTIVE) || el.closest(".player-name-link")) continue;
      const text = el.textContent.trim();
      let t = names.get(text);
      if (t === undefined && /^[A-Z]{2,3}$/.test(text)) {
        const i = clubs.findIndex((c) => c[0] === text);
        if (i >= 0 && el.parentElement?.querySelector(`img.team-logo[data-club="${i}"]`)) t = i;
      }
      if (t === undefined) continue;
      el.dataset.clubOpen = t;
      el.classList.add("club-link-auto", "club-name-link");
      el.setAttribute("role", "link");
      el.setAttribute("tabindex", "0");
      el.title = `Open the ${clubs[t][2]} profile`;
    }
  }
  const openLinked = (e) => {
    const el = e.target.closest?.("[data-club-open]");
    if (!el || (e.type === "keydown" && e.key !== "Enter" && e.key !== " ")) return;
    e.preventDefault();
    e.stopPropagation();
    open(Number(el.dataset.clubOpen));
  };
  document.addEventListener("click", openLinked);
  document.addEventListener("keydown", openLinked);
  const previousRender = render;
  render = function () {
    previousRender();
    try {
      linkClubs();
    } catch (error) {
      console.warn("Club links:", error);
    }
  };
  window.ClubUI.link = linkClubs;
  linkClubs();
}
