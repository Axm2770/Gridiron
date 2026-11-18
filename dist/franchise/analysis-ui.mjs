// Data & analysis and Statistics screens (pixel look). Pure string templates: office-ui.mjs owns
// the screen state and the Office.* handlers and calls these renderers. Charts come from
// ui/pixel-chart.mjs, faces from ui/pixel-face.mjs, numbers from analysis.mjs (read-only).
// Styles: dist/analysis.css (injected once by ensureAnalysisStyles).
import * as S from "./state.mjs";
import {
  STAT_VIEWS,
  seasonStats,
  statRows,
  statValue,
  teamReport,
  leagueRanks,
  weeklyTrend,
  playMix,
  unitComparison,
  unitRatings,
  teamProfile,
  LEADERS,
  leaders,
  allPlayers,
} from "./analysis.mjs";
import { effectiveAttributes } from "./ratings.mjs";
import { previewAttributes } from "./player-ui.mjs";
import { pixelFace } from "../ui/pixel-face.mjs";
import { barChart, stepChart, sparkline, hbar, meter } from "../ui/pixel-chart.mjs";
import { searchKey } from "./presentation.mjs";

export function ensureAnalysisStyles() {
  if (typeof document === "undefined" || typeof document.querySelector !== "function") return;
  if (!document.querySelector('link[href="analysis.css"]'))
    document.head?.insertAdjacentHTML?.("beforeend", '<link rel="stylesheet" href="analysis.css">');
}

const h = (v) => (typeof esc === "function" ? esc(v) : String(v ?? ""));
const num = (n, d = 1) =>
  Number.isFinite(n) ? Number(n).toLocaleString("en-US", { maximumFractionDigits: d }) : "—";
const signed = (n, d = 1) => (Number.isFinite(n) ? (n > 0 ? "+" : "") + num(n, d) : "—");
const abbr = (t) => clubs[t]?.[0] || "—";
const pos = (p) => p.realPosition || p.pos;
export const STAT_PAGE = 12;
const POSITIONS = {
  Passing: ["QB"],
  Rushing: ["QB", "RB", "WR"],
  Receiving: ["RB", "WR", "TE"],
  Defense: ["DL", "LB", "CB", "S"],
  Workload: ["QB", "RB", "WR", "TE", "OL", "DL", "LB", "CB", "S", "K", "P"],
};
// Rank chip: top quarter good, bottom quarter bad.
function rankChip(rank, of) {
  if (!Number.isFinite(rank)) return '<span class="an-rank">—</span>';
  const t = rank <= Math.ceil(of / 4) ? "good" : rank > of - Math.ceil(of / 4) ? "bad" : "";
  return `<span class="an-rank ${t}" title="League rank ${rank} of ${of}">#${rank}</span>`;
}
const panel = (title, body, { extra = "", cls = "" } = {}) =>
  `<section class="an-panel ${cls}"><div class="an-head"><h2>${title}</h2>${extra}</div><div class="an-body">${body}</div></section>`;
const empty = (title, text) => `<div class="an-empty"><b>${title}</b><p>${text}</p></div>`;
const face = (p, team, size = 32) => pixelFace(p, { size, team });
const nameLink = (p, team, sub = "") =>
  `<button class="link an-name" ${previewAttributes(p, team)} onclick="W.player('${p.id}',${team})"><b>${h(p.name)}</b><small>${sub || `${h(pos(p))} · ${h(abbr(team))}`}</small></button>`;

// ------------------------------------------------------------------------------- Analysis
export function analysisView({ tab = "Performance", selected = [], query = "" } = {}) {
  ensureAnalysisStyles();
  const ranks = leagueRanks(state),
    prof = ranks.profile,
    trend = weeklyTrend(state),
    of = Math.max(1, ranks.teams),
    m = Object.fromEntries(ranks.metrics.map((x) => [x.key, x]));
  let run = 0;
  const cumulative = trend.map((g) => (run += g.for - g.against));
  const tile = (label, metric, value, sub, spark, t) =>
    `<div class="an-kpi"><span>${label}</span><b>${value}</b><small>${sub}</small><div class="an-kpi-foot">${rankChip(metric?.rank, of)}${spark || '<i class="an-kpi-none">trend after 2 games</i>'}</div></div>`;
  const rec = prof.record;
  const hero = `<section class="an-hero" style="--club:var(--team)"><div class="an-crest">${logo(state.team)}</div><div class="an-title"><span class="an-kicker">${state.year} SEASON REPORT</span><b>${h(cname(state.team))}</b><span class="an-record"><em>${rec[0]}-${rec[1]}${rec[2] ? "-" + rec[2] : ""}</em><small>${prof.games ? `${prof.games} games · ${signed(prof.differential)} pts/game` : "No games played yet"}</small></span></div><div class="an-kpis">${tile("Points / game", m.ppg, num(prof.ppg), "scored", sparkline(trend.map((g) => g.for), { title: "Points scored by week" }))}${tile("Allowed / game", m.allowed, num(prof.allowed), "conceded", sparkline(trend.map((g) => g.against), { tone: "bad", title: "Points allowed by week" }))}${tile("Yards / game", m.yards, num(prof.yards, 0), "pass + rush", sparkline(trend.map((g) => g.yards), { tone: "team", title: "Offensive yards by week" }))}${tile("Point margin", m.differential, signed(cumulative.at(-1) ?? null, 0), "season total", sparkline(cumulative, { tone: (cumulative.at(-1) ?? 0) >= 0 ? "good" : "bad", title: "Running point margin" }))}</div></section>`;
  const tabs = ["Performance", "Trends", "Leaders", "Compare", "Workload", "Dynamics"];
  const tabBar = `<div class="an-tabs" role="tablist" aria-label="Analysis views">${tabs.map((v) => `<button role="tab" aria-selected="${tab === v}" class="${tab === v ? "active" : ""}" onclick="Office.analysis('${v}')">${v === "Compare" && selected.length ? `Compare <i>${selected.length}</i>` : v}</button>`).join("")}</div>`;
  const body =
    tab === "Trends"
      ? trendsTab(trend, ranks)
      : tab === "Leaders"
        ? leadersTab()
        : tab === "Compare"
          ? compareTab(selected, query)
          : tab === "Workload"
            ? workloadTab()
            : tab === "Dynamics"
              ? dynamicsTab()
              : performanceTab(ranks, of);
  return `<div class="an-page">${hero}${tabBar}${body}<p class="an-foot">— means no recorded sample yet. Team figures use regular-season games; player production includes every recorded game. The engine does not record third downs, red-zone trips, fumbles or kicking, so they are not shown.</p></div>`;
}

function performanceTab(ranks, of) {
  const rows = ranks.metrics
    .map((x) => {
      const pct = x.unit === "%",
        d = x.key === "yards" || x.key.endsWith("Yards") ? 0 : 1;
      const max = x.key === "differential" ? null : Math.max(x.max || 0, x.value || 0);
      const bar =
        x.key === "differential"
          ? diffBar(x.value, Math.max(Math.abs(x.best || 0), Math.abs(x.worst || 0), 1))
          : hbar(x.value, max || 1, { avg: x.avg, tone: x.rank && x.rank <= Math.ceil(of / 4) ? "good" : x.rank > of - Math.ceil(of / 4) ? "bad" : "accent", title: `${x.label}: ${num(x.value, d)}; league average ${num(x.avg, d)}` });
      return `<div class="an-rank-row"><span class="an-rank-label"><b>${x.label}</b><small>${x.higher ? "higher is better" : "lower is better"}</small></span><span class="an-rank-val"><b>${x.key === "differential" ? signed(x.value) : num(x.value, d)}${pct && Number.isFinite(x.value) ? "%" : ""}</b><small>avg ${num(x.avg, d)}</small></span><span class="an-rank-bar">${bar}</span>${rankChip(x.rank, of)}</div>`;
    })
    .join("");
  const where = ranks.profile.games
    ? `<div class="an-rank-key"><span><i class="k-bar"></i>Your club</span><span><i class="k-tick"></i>League average</span><span>Rank of ${of} clubs</span></div>${rows}`
    : empty("Your rankings start after your first game.", "Every regular-season result adds to scoring, yardage and takeaway ranks.");
  const units = unitComparison(state);
  const unitRows = units
    .map(
      (u) =>
        `<div class="an-unit"><span class="an-unit-key">${u.key}</span><span class="an-unit-label"><b>${u.label}</b><small>${signed((u.value ?? 0) - (u.avg ?? 0))} vs avg</small></span><span class="an-unit-bar">${hbar(Number.isFinite(u.value) ? u.value - 50 : null, 45, { avg: Number.isFinite(u.avg) ? u.avg - 50 : null, tone: u.rank <= 8 ? "good" : u.rank > 24 ? "bad" : "team", title: `${u.label} ${num(u.value)} overall; league average ${num(u.avg)}` })}</span><b class="an-unit-ovr">${num(u.value, 0)}</b>${rankChip(u.rank, 32)}</div>`,
    )
    .join("");
  const unitPanel = panel("Unit ratings vs league", `${unitRows}<p class="an-note">Average overall of each unit's best healthy players (QB 1, RB 1, WR 3 + TE 1, OL 5, DL 4, LB 3, CB 2 + S 2, K + P). Bar scale 50–95; the white tick is the league average.</p>`, { extra: '<span class="an-tag">Healthy roster</span>' });
  const mix = playMix(state);
  const mixPanel = panel(
    "Your playcalling",
    mix.plays
      ? `<div class="an-split" role="img" aria-label="Run ${num(mix.runPct, 0)}%, pass ${num(mix.passPct, 0)}%">${Array.from({ length: 20 }, (_, i) => `<i class="${i < Math.round((mix.runPct / 100) * 20) ? "run" : "pass"}"></i>`).join("")}</div><div class="an-split-key"><span><i class="run"></i>Run <b>${num(mix.runPct, 0)}%</b> <small>${mix.run} plays</small></span><span><i class="pass"></i>Pass <b>${num(mix.passPct, 0)}%</b> <small>${mix.pass} plays</small></span></div><div class="an-calls">${mix.calls
          .slice(0, 6)
          .map(([c, v]) => `<div><span>${h(c)}</span>${meter(v, mix.calls[0][1], { segments: 12, tone: /run/i.test(c) ? "good" : "accent", size: 7, title: `${c}: ${v} calls` })}<b>${v}</b></div>`)
          .join("")}</div><div class="an-mini-stats"><span><small>4th-down tries</small><b>${mix.fourthTries}</b></span><span><small>Converted</small><b>${mix.fourthTries ? `${mix.fourthMade}/${mix.fourthTries}` : "—"}</b></span><span><small>Kicks</small><b>${mix.kick}</b></span><span><small>Games logged</small><b>${mix.games}</b></span></div>`
      : empty("Your playcalling appears after your first game.", "Run/pass mix, favourite calls and fourth-down decisions are logged from your matchdays."),
  );
  return `<div class="an-grid an-grid-perf">${panel("Where you rank", where, { extra: `<span class="an-tag">${ranks.profile.games} games</span>`, cls: ranks.profile.games ? "an-span-rows" : "" })}${unitPanel}${mixPanel}</div>${opponentPanel()}`;
}
function diffBar(value, max) {
  // Centre-out bar for the point differential (left = negative, right = positive).
  if (!Number.isFinite(value)) return hbar(null, 1);
  const half = Math.min(1, Math.abs(value) / max) * 50;
  return `<span class="an-diff"><i class="${value >= 0 ? "pos" : "neg"}" style="${value >= 0 ? "left:50%" : `right:50%`};width:${half}%"></i></span>`;
}
function opponentPanel() {
  const g = game();
  if (!g) return panel("Next opponent", empty("No fixture scheduled.", "Use the offseason to address the squad. Scouting returns with the next game."));
  const opp = g.a === state.team ? g.b : g.a,
    us = teamProfile(state, state.team),
    them = teamProfile(state, opp),
    uu = unitRatings(state, state.team),
    tu = unitRatings(state, opp),
    off = (u) => avgOf([u.QB, u.RB, u.REC, u.OL]),
    def = (u) => avgOf([u.DL, u.LB, u.DB]);
  const rows = [
    ["Points / game", us.ppg, them.ppg, true, 1],
    ["Allowed / game", us.allowed, them.allowed, false, 1],
    ["Yards / game", us.yards, them.yards, true, 0],
    ["Sacks / game", us.sacks, them.sacks, true, 1],
    ["Takeaways / game", us.takeaways, them.takeaways, true, 2],
    ["Offense rating", off(uu), off(tu), true, 1],
    ["Defense rating", def(uu), def(tu), true, 1],
  ];
  const tape = rows
    .map(([label, a, b, higher, d]) => {
      const max = Math.max(Math.abs(a || 0), Math.abs(b || 0), 1),
        better = !Number.isFinite(a) || !Number.isFinite(b) || a === b ? 0 : (a > b) === higher ? 1 : -1;
      return `<div class="an-tape-row"><b class="${better > 0 ? "win" : ""}">${num(a, d)}</b><span class="an-tape-bar l"><i style="width:${(Math.abs(a || 0) / max) * 100}%"></i></span><span class="an-tape-label">${label}</span><span class="an-tape-bar r"><i style="width:${(Math.abs(b || 0) / max) * 100}%"></i></span><b class="${better < 0 ? "win" : ""}">${num(b, d)}</b></div>`;
    })
    .join("");
  const tr = state.teams[opp];
  return panel(
    "Next opponent · tale of the tape",
    `<div class="an-tape"><div class="an-tape-team">${logo(state.team)}<b>${h(abbr(state.team))}</b><small>${state.teams[state.team].w}-${state.teams[state.team].l}</small></div><div class="an-tape-rows">${tape}</div><div class="an-tape-team them">${logo(opp)}<b>${h(abbr(opp))}</b><small>${tr.w}-${tr.l}</small></div></div><p class="an-note">${them.games < 3 ? "Small sample: fewer than three games. Lean on roster quality and availability." : "Descriptive season averages; opponent quality and game script shape these figures."} Highlighted numbers are the better side.</p>`,
    { extra: `<button class="secondary small" onclick="W.open('Game plan')">Prepare tactics →</button>`, cls: "an-opp" },
  );
}
const avgOf = (a) => {
  const v = a.filter(Number.isFinite);
  return v.length ? v.reduce((x, y) => x + y, 0) / v.length : null;
};

function trendsTab(trend, ranks) {
  if (!trend.length)
    return `<div class="an-grid">${panel("Season trends", empty("Your trends start after your first game.", "Each regular-season result adds a column: points, yards, sacks and interceptions week by week."))}</div>`;
  const m = Object.fromEntries(ranks.metrics.map((x) => [x.key, x]));
  const labels = trend.map((g) => "W" + g.week);
  const points = barChart(
    trend.map((g) => ({ label: "W" + g.week, title: `Week ${g.week} vs ${abbr(g.opponent)} (${g.result})`, values: [g.for, g.against] })),
    { series: [{ label: "Scored", tone: "accent" }, { label: "Allowed", tone: "bad" }], h: 132, title: "Points scored and allowed by week" },
  );
  const scoring = stepChart(
    [
      { label: "Scored", values: trend.map((g) => g.for), tone: "accent" },
      { label: "Allowed", values: trend.map((g) => g.against), tone: "bad" },
    ],
    { avg: m.ppg?.avg, labels, h: 112, title: "Points by week against the league average" },
  );
  const hasYards = trend.some((g) => Number.isFinite(g.yards));
  const yards = hasYards
    ? stepChart(
        [
          { label: "Total", values: trend.map((g) => g.yards), tone: "warn" },
          { label: "Pass", values: trend.map((g) => g.passYards), tone: "accent" },
          { label: "Rush", values: trend.map((g) => g.rushYards), tone: "good" },
        ],
        { avg: m.yards?.avg, labels, h: 112, title: "Offensive yards by week" },
      )
    : empty("Yardage appears after your next game.", "Per-game yards come from your players' recorded lines.");
  const ball = hasYards
    ? barChart(
        trend.map((g) => ({ label: "W" + g.week, values: [g.sacks, g.takeaways, g.giveaways] })),
        { series: [{ label: "Sacks", tone: "accent" }, { label: "INT made", tone: "good" }, { label: "INT thrown", tone: "bad" }], h: 96, title: "Sacks and interceptions by week" },
      ) + '<div class="pc-legend"><span><i style="background:var(--gd-accent)"></i>Sacks</span><span><i style="background:var(--gd-good)"></i>INT made</span><span><i style="background:var(--gd-bad)"></i>INT thrown</span></div>'
    : "";
  const log = trend
    .slice()
    .reverse()
    .map(
      (g) =>
        `<tr><td><span class="an-wl ${g.result === "W" ? "good" : g.result === "L" ? "bad" : ""}">${g.result}</span></td><td>W${g.week}</td><td class="an-opp-cell">${logo(g.opponent)}<span>${h(abbr(g.opponent))}</span></td><td class="numeric"><b>${g.for}–${g.against}</b></td><td class="numeric">${num(g.yards, 0)}</td><td class="numeric">${num(g.sacks, 0)}</td><td class="numeric">${num(g.takeaways, 0)}</td><td class="numeric">${num(g.giveaways, 0)}</td></tr>`,
    )
    .join("");
  return `<div class="an-grid">${panel("Points by week", points + '<div class="pc-legend"><span><i style="background:var(--gd-accent)"></i>Scored</span><span><i style="background:var(--gd-bad)"></i>Allowed</span></div>', { extra: `<span class="an-tag">${trend.length} games</span>` })}${panel("Scoring vs league average", scoring)}${panel("Offensive yards", yards)}${panel("Pass rush & ball security", ball || empty("Sacks and interceptions appear after your next game.", ""))}</div>${panel("Game log", `<table class="an-table"><thead><tr><th>Res</th><th>Week</th><th>Opponent</th><th class="numeric">Score</th><th class="numeric">Yards</th><th class="numeric">Sacks</th><th class="numeric">INT made</th><th class="numeric">INT thrown</th></tr></thead><tbody>${log}</tbody></table>`)}`;
}

function leadersTab() {
  const cards = LEADERS.map((L) => {
    const rows = leaders(state, L.key, { n: 5 });
    const top = rows[0]?.value || 1;
    return `<section class="an-board"><div class="an-board-head"><h3>${L.label}</h3></div>${
      rows.length
        ? `<ol>${rows
            .map(
              (r, i) =>
                `<li class="${r.team === state.team ? "me" : ""}"><span class="an-pos-n">${i + 1}</span>${face(r.p, r.team, i ? 30 : 40)}${nameLink(r.p, r.team)}<span class="an-board-val"><b>${num(r.value, L.key === "sacks" ? 1 : 0)}</b>${meter(r.value, top, { segments: 6, size: 5, tone: r.team === state.team ? "team" : "accent" })}</span></li>`,
            )
            .join("")}</ol>`
        : empty("No leader yet.", "Appears after the first recorded game.")
    }</section>`;
  }).join("");
  // Your best rank on each board, so you can see where your players stand league-wide.
  const yours = LEADERS.map((L) => {
    const all = leaders(state, L.key, { n: 2000 });
    const i = all.findIndex((r) => r.team === state.team);
    return i < 0 ? null : { L, r: all[i], rank: i + 1 };
  }).filter(Boolean);
  const mine = yours.length
    ? `<div class="an-yours">${yours
        .map(({ L, r, rank }) => `<div>${face(r.p, r.team, 28)}<span><small>${L.label}</small><b>${h(r.p.name)}</b></span><span class="an-rank ${rank <= 5 ? "good" : ""}">#${rank}</span></div>`)
        .join("")}</div>`
    : empty("Your players' ranks appear after your first game.", "");
  return `${panel("Where your players rank", mine, { extra: '<span class="an-tag">Best player per board</span>' })}<div class="an-boards">${cards}</div>`;
}

// ------------------------------------------------------------------------------- Compare
const ROLE_KEYS = {
  QB: ["throwPower", "throwAccuracyShort", "throwAccuracyMid", "throwAccuracyDeep"],
  RB: ["carrying", "breakTackle", "catching"],
  WR: ["catching", "shortRouteRunning"],
  TE: ["catching", "shortRouteRunning", "runBlock"],
  OL: ["runBlock", "passBlock"],
  DL: ["tackle"],
  LB: ["tackle", "zoneCoverage"],
  CB: ["manCoverage", "zoneCoverage", "tackle"],
  S: ["manCoverage", "zoneCoverage", "tackle"],
  K: ["kickPower", "kickAccuracy"],
  P: ["kickPower", "kickAccuracy"],
};
const label = (k) => k.replace(/([A-Z])/g, " $1").replace(/^./, (c) => c.toUpperCase());
const STAT_LABELS = {
  attempts: "Pass att", completions: "Completions", completionPct: "Cmp %", passYards: "Pass yards", yardsPerAttempt: "Y/A",
  passTD: "Pass TD", interceptions: "INT thrown", rushAttempts: "Rush att", rushYards: "Rush yards", yardsPerCarry: "Y/C",
  rushTD: "Rush TD", receptions: "Receptions", recYards: "Rec yards", yardsPerReception: "Y/Rec", recTD: "Rec TD",
  tackles: "Tackles", sacks: "Sacks", defInterceptions: "INT made", snaps: "Snaps",
};
/** Side-by-side comparison body for 2–3 players: rows of { p, team }. Used inline and in the dialog. */
export function compareBody(rows, { year = state.year } = {}) {
  ensureAnalysisStyles();
  const n = rows.length,
    cols = `style="--cmp-n:${n}"`;
  const head = `<div class="cmp-row cmp-heads" ${cols}><span></span>${rows
    .map(
      ({ p, team }) =>
        `<div class="cmp-card" style="--club:var(--team)">${face(p, team, 64)}<div><button class="link an-name" onclick="W.player('${p.id}',${team})"><b>${h(p.name)}</b><small>${h(pos(p))} · ${h(abbr(team))} · ${p.age ?? "—"} yrs</small></button><span class="cmp-ovr"><b>${p.ovr}</b><small>OVR</small><b class="pot">${p.pot ?? "—"}</b><small>POT</small></span></div><button class="link cmp-x" aria-label="Remove ${h(p.name)}" onclick="Office.compareToggle('${p.id}',${team})">×</button></div>`,
    )
    .join("")}</div>`;
  const attrs = [
    ...new Set(["speed", "acceleration", "strength", "awareness", "stamina", ...rows.flatMap(({ p }) => ROLE_KEYS[p.pos] || [])]),
  ];
  const ratingRow = (name, vals, max = 99, d = 0) => {
    const best = Math.max(...vals.filter(Number.isFinite)),
      mark = n > 1 && vals.filter((x) => x === best).length < n;
    return `<div class="cmp-row" ${cols}><span class="cmp-label">${h(name)}</span>${vals
      .map((v) => `<span class="cmp-cell ${mark && v === best ? "best" : ""}">${meter(v, max, { segments: 10, size: 9, tone: mark && v === best ? "good" : "accent", title: `${name} ${num(v, d)}` })}<b>${num(v, d)}</b></span>`)
      .join("")}</div>`;
  };
  const ratings =
    ratingRow("Overall", rows.map(({ p }) => p.ovr)) +
    ratingRow("Potential", rows.map(({ p }) => p.pot)) +
    attrs.map((k) => ratingRow(label(k), rows.map(({ p }) => (effectiveAttributes(p) || {})[k]))).join("") +
    ratingRow("Condition", rows.map(({ p }) => p.fitness ?? null), 100) +
    ratingRow("Morale", rows.map(({ p }) => p.morale ?? null), 100) +
    ratingRow("Form", rows.map(({ p }) => p.progression?.form ?? null), 10, 1);
  const seasons = rows.map(({ p }) => seasonStats(p, year));
  const cats = Object.keys(STAT_VIEWS).filter((c) => c !== "Workload" && rows.some(({ p }) => POSITIONS[c].includes(p.pos)));
  const keys = [...new Map(cats.flatMap((c) => STAT_VIEWS[c]).concat([["snaps", "Snaps"]]).map(([k, l]) => [k, l])).entries()];
  // Only stats someone actually recorded; the better value is marked when the players differ.
  const statRowsHtml = keys
    .map(([k, l]) => {
      const vals = seasons.map((s) => statValue(s, k)),
        lower = k === "interceptions",
        good = vals.filter(Number.isFinite);
      if (!good.some((v) => v !== 0)) return "";
      const best = lower ? Math.min(...good) : Math.max(...good),
        mark = n > 1 && good.length > 1 && vals.filter((v) => v === best).length < n;
      return `<div class="cmp-row cmp-stat" ${cols}><span class="cmp-label">${h(STAT_LABELS[k] || l)}</span>${vals.map((v) => `<span class="cmp-cell ${mark && v === best ? "best" : ""}"><b>${num(v, 1)}</b></span>`).join("")}</div>`;
    })
    .join("");
  return `<div class="cmp">${head}<h3 class="cmp-sec">Ratings</h3>${ratings}<h3 class="cmp-sec">${h(year)} season</h3>${statRowsHtml || '<p class="an-note">No recorded production this season.</p>'}<p class="an-note">Green marks the better value. Position matters: an attribute can be irrelevant to a player's role. Ratings include development and medical changes in this save.</p></div>`;
}
/** Candidate list for the inline picker: search the league, or your best players by default. */
export function comparePickList(selected, query = "") {
  const q = searchKey(query.trim());
  const pool = q
    ? allPlayers(state).filter(({ p }) => searchKey(p.name).includes(q))
    : S.roster(state, state.team).map((p) => ({ p, team: state.team }));
  const rows = pool
    .filter(({ p }) => !selected.some((x) => x.id === p.id))
    .sort((a, b) => b.p.ovr - a.p.ovr)
    .slice(0, 8);
  return rows.length
    ? rows
        .map(
          ({ p, team }) =>
            `<li>${face(p, team, 30)}<span class="an-name"><b>${h(p.name)}</b><small>${h(pos(p))} · ${h(abbr(team))} · ${p.ovr} OVR</small></span><button class="secondary small" ${selected.length >= 3 ? "disabled" : ""} onclick="Office.compareToggle('${p.id}',${team})">＋ Add</button></li>`,
        )
        .join("")
    : '<li class="an-pick-none">No players match. Try a surname.</li>';
}
function compareTab(selected, query) {
  const rows = selected.map((x) => ({ p: S.roster(state, x.team).find((p) => p.id === x.id), team: x.team })).filter((x) => x.p);
  const slots = Array.from({ length: 3 }, (_, i) => {
    const r = rows[i];
    return r
      ? `<div class="cmp-slot on">${face(r.p, r.team, 36)}<span><b>${h(r.p.name)}</b><small>${h(pos(r.p))} · ${h(abbr(r.team))}</small></span><button class="link cmp-x" aria-label="Remove ${h(r.p.name)}" onclick="Office.compareToggle('${r.p.id}',${r.team})">×</button></div>`
      : `<div class="cmp-slot"><i>${i + 1}</i><span>${i < 2 ? "Pick a player" : "Optional third"}</span></div>`;
  }).join("");
  const picker = `<section class="an-panel an-picker"><div class="an-head"><h2>Pick players</h2><span class="an-tag">${rows.length} / 3</span></div><div class="an-body"><div class="cmp-slots">${slots}</div><label class="an-search"><span class="sr-only">Search players</span><input type="search" placeholder="Search any player in the league…" value="${h(query)}" oninput="Office.compareSearch(this.value)" aria-label="Search players to compare"></label><small class="an-pick-hint">${query ? "League search" : "Your highest-rated players"} · add from Statistics or Squad too</small><ul class="an-pick" id="an-pick-list">${comparePickList(selected, query)}</ul>${rows.length ? '<button class="link" onclick="Office.clearCompare()">Clear all</button>' : ""}</div></section>`;
  const main =
    rows.length >= 2
      ? panel("Head to head", compareBody(rows), { cls: "an-cmp-main" })
      : panel("Head to head", empty(rows.length ? "Add one more player." : "Pick two or three players.", "Search the league on the left. Ratings, attributes and this season's production line up side by side."), { cls: "an-cmp-main" });
  return `<div class="an-cmp-layout">${picker}${main}</div>`;
}

function workloadTab() {
  const r = teamReport(state),
    injured = r.roster.filter((p) => p.injury),
    load = r.roster.filter((p) => p.progression?.load === "Intensive" || (p.fitness ?? 100) < 75);
  const row = (p, value, sub, btn, t = "") =>
    `<li class="an-prow">${face(p, state.team, 30)}${nameLink(p, state.team)}<span class="an-pval ${t}"><b>${value}</b><small>${sub}</small></span>${btn}</li>`;
  return `<div class="an-grid">${panel(
    "Availability watch",
    injured.length
      ? `<ul class="an-plist">${injured
          .slice(0, 8)
          .map((p) => row(p, p.injury + "w", h(p.medical?.bodyPart || "Injury"), `<button class="secondary small" onclick="Dev.player('${p.id}')">Rehab →</button>`, "bad"))
          .join("")}</ul>${injured.length > 8 ? `<p class="an-note">+${injured.length - 8} more in the Medical centre.</p>` : ""}`
      : empty("No current injuries.", "Injured players and their expected return appear here."),
    { extra: `<span class="an-tag">${injured.length} out</span>` },
  )}${panel(
    "Training & recovery",
    load.length
      ? `<ul class="an-plist">${load
          .slice(0, 8)
          .map((p) => row(p, num(p.fitness, 0) + "%", h(p.progression?.load || "Normal") + " load", `<button class="secondary small" onclick="Dev.player('${p.id}')">Plan →</button>`, (p.fitness ?? 100) < 75 ? "warn" : ""))
          .join("")}</ul>`
      : empty("No low-condition or intensive-load flags.", "Players under 75% condition or on intensive load appear here."),
  )}</div>`;
}
function dynamicsTab() {
  const r = teamReport(state),
    unsettled = r.roster.filter((p) => p.morale < 60),
    mood = (state.franchise?.office?.moodHistory || []).slice(0, 8);
  return `<div class="an-grid">${panel(
    "Relationship watch",
    unsettled.length
      ? `<ul class="an-plist">${unsettled
          .slice(0, 8)
          .map((p) => `<li class="an-prow">${face(p, state.team, 30)}${nameLink(p, state.team)}<span class="an-pval bad"><b>${num(p.morale, 0)}%</b><small>${num(p.coachTrust ?? 60, 0)}% trust</small></span><button class="secondary small" onclick="Office.morale('${p.id}')">Why? →</button></li>`)
          .join("")}</ul>`
      : empty("No players below 60% morale.", "Unsettled players appear here with their trust in you."),
    { extra: `<span class="an-tag">Squad ${num(r.morale, 0)}%</span>` },
  )}${panel(
    "Why the room changed",
    mood.length
      ? `<ul class="an-mood">${mood.map((e) => `<li><span>${e.year} · W${e.week + 1}</span><b>${h(e.reason)}</b><small>${e.changes.map((c) => h(c.name) + " " + signed(c.delta, 2)).join(" · ") || "No direct morale change"}</small></li>`).join("")}</ul>`
      : empty("Nothing recorded yet.", "News reactions and your responses will be recorded here."),
  )}</div>`;
}

// ------------------------------------------------------------------------------- Statistics
/** Filtered, sorted rows for the Statistics table (league scope can narrow to one club and position). */
export function statisticsRows(st) {
  const scopeTeam = st.scope === "League" && st.club !== "All" && st.club != null ? Number(st.club) : null;
  return statRows(state, {
    ...st,
    scope: scopeTeam !== null ? "My team" : st.scope,
    team: scopeTeam !== null ? scopeTeam : state.team,
  }).filter(({ p }) => !st.pos || st.pos === "All" || p.pos === st.pos);
}
const sortKey = (st) =>
  st.sort || { Passing: "passYards", Rushing: "rushYards", Receiving: "recYards", Defense: "tackles", Workload: "snaps" }[st.category];
/** Table body, pager and count for the current page (re-rendered on search without touching the input). */
export function statisticsResults(st, selected = []) {
  const rows = statisticsRows(st),
    pages = Math.max(1, Math.ceil(rows.length / STAT_PAGE));
  st.page = Math.max(0, Math.min(st.page || 0, pages - 1));
  const cols = STAT_VIEWS[st.category],
    key = sortKey(st),
    start = st.page * STAT_PAGE,
    slice = rows.slice(start, start + STAT_PAGE);
  const body = slice.length
    ? slice
        .map(({ p, team, stats: s }, i) => {
          const on = selected.some((x) => x.id === p.id);
          return `<tr class="${team === state.team && st.scope === "League" ? "me" : ""}"><td class="st-n">${start + i + 1}</td><td><div class="st-player">${face(p, team, 30)}${nameLink(p, team)}</div></td>${cols.map(([k]) => `<td class="numeric ${k === key ? "on" : ""}">${num(statValue(s, k, st.mode), k === "growth" ? 2 : 1)}</td>`).join("")}<td class="st-cmp"><button class="st-toggle ${on ? "active" : ""}" onclick="Office.compareToggle('${p.id}',${team})" aria-pressed="${on}" aria-label="${on ? "Remove" : "Add"} ${h(p.name)} ${on ? "from" : "to"} comparison">${on ? "✓" : "＋"}</button></td></tr>`;
        })
        .join("")
    : `<tr><td colspan="${cols.length + 3}" class="st-none">No matching players with this sample. Widen the filters or reduce the minimum snaps.</td></tr>`;
  const pager = `<div class="st-pager"><button class="secondary small" onclick="Office.statPage(-1)" ${st.page === 0 ? "disabled" : ""}>← Prev</button><span>${rows.length ? `${start + 1}–${start + slice.length} of ${rows.length}` : "0 players"} · page <b>${st.page + 1}</b> / ${pages}</span><button class="secondary small" onclick="Office.statPage(1)" ${st.page >= pages - 1 ? "disabled" : ""}>Next →</button></div>`;
  const podium = rows.filter(({ stats: s }) => Number.isFinite(statValue(s, key, st.mode))).slice(0, 3);
  const keyLabel = cols.find(([k]) => k === key)?.[1] || key;
  const pod = podium.length
    ? `<div class="st-podium">${podium.map(({ p, team, stats: s }, i) => `<div class="st-pod ${i === 0 ? "first" : ""} ${team === state.team ? "me" : ""}"><span class="st-pod-n">${i + 1}</span>${face(p, team, i ? 36 : 44)}${nameLink(p, team)}<span class="st-pod-v"><b>${num(statValue(s, key, st.mode), 1)}</b><small>${h(keyLabel)}</small></span></div>`).join("")}</div>`
    : "";
  return { body, pager, podium: pod, count: rows.length };
}
export function statisticsView(st, { years = [], selected = [], tray = "" } = {}) {
  ensureAnalysisStyles();
  const cols = STAT_VIEWS[st.category],
    key = sortKey(st),
    res = statisticsResults(st, selected),
    opts = (list, v) => list.map(([val, text]) => `<option value="${h(val)}" ${String(val) === String(v) ? "selected" : ""}>${h(text)}</option>`).join(""),
    pair = (list) => list.map((x) => [x, x]);
  const clubOpts = [["All", "All teams"], ...clubs.map((c, i) => [i, `${c[0]} · ${c[2]}`])];
  const tabs = `<div class="an-tabs st-tabs" role="tablist" aria-label="Statistic categories">${Object.keys(STAT_VIEWS)
    .map((c) => `<button role="tab" aria-selected="${c === st.category}" class="${c === st.category ? "active" : ""}" onclick="Office.statFilter('category','${c}')">${c}</button>`)
    .join("")}<span class="st-tab-note" title="The match engine does not record kicking statistics yet.">Kicking: not recorded</span></div>`;
  const filters = `<div class="st-filters"><label>Scope<select aria-label="Statistics scope" onchange="Office.statFilter('scope',this.value)">${opts(pair(["My team", "League"]), st.scope)}</select></label>${st.scope === "League" ? `<label>Team<select aria-label="Statistics team" onchange="Office.statFilter('club',this.value)">${opts(clubOpts, st.club)}</select></label>` : ""}<label>Position<select aria-label="Statistics position" onchange="Office.statFilter('pos',this.value)">${opts(pair(["All", ...POSITIONS[st.category]]), st.pos)}</select></label><label>Season<select aria-label="Statistics season" onchange="Office.statFilter('year',this.value)">${opts(pair(years), st.year)}</select></label><label>Display<select aria-label="Statistics display" onchange="Office.statFilter('mode',this.value)">${opts(pair(["Totals", "Per 100 snaps"]), st.mode)}</select></label><label>Min snaps<select aria-label="Minimum snaps" onchange="Office.statFilter('minimum',Number(this.value))">${opts(pair([0, 25, 100, 250]), st.minimum)}</select></label><label class="st-search">Find<input type="search" aria-label="Search statistics" placeholder="Player name…" value="${h(st.query)}" oninput="Office.searchStats(this.value)"></label><button class="secondary small st-export" onclick="Office.exportStats()">⇩ Export CSV</button></div>`;
  const head = `<thead><tr><th class="st-n">#</th><th>Player</th>${cols.map(([k, l]) => `<th class="numeric" aria-sort="${k === key ? (st.direction === -1 ? "descending" : "ascending") : "none"}"><button class="link st-sort ${k === key ? "on" : ""}" onclick="Office.statSort('${k}')">${h(l)}<i>${k === key ? (st.direction === -1 ? "▼" : "▲") : ""}</i></button></th>`).join("")}<th class="st-cmp">Cmp</th></tr></thead>`;
  const note = `${st.mode === "Per 100 snaps" ? "Counting stats are scaled to 100 recorded snaps; rate columns (Cmp %, Y/A, Y/C, Y/Rec) keep their units." : "Click a column to sort. — means no recorded value or no valid denominator."} Snaps can include special teams. ${st.year === "Career" ? "Career totals cover every recorded season in this save." : ""}`;
  return `<div class="an-page st-page">${tabs}<section class="an-panel st-panel">${filters}<div id="st-podium">${res.podium}</div><div class="st-table-wrap"><table class="st-table">${head}<tbody id="stats-rows">${res.body}</tbody></table></div><div id="st-pager">${res.pager}</div><p class="an-note st-note"><span id="stats-match-count">${num(res.count, 0)}</span> matching players · ${note}</p></section>${tray}</div>`;
}
/** The floating comparison tray shared by Statistics and Squad. */
export function compareTray(rows) {
  if (!rows.length) return "";
  ensureAnalysisStyles();
  return `<div class="comparison-tray an-tray"><span class="an-tray-label">COMPARE <b>${rows.length} / 3</b></span>${rows
    .map(({ p, team }) => `<button class="compare-chip" onclick="Office.compareToggle('${p.id}',${team})" aria-label="Remove ${h(p.name)}">${face(p, team, 22)}<span>${h(p.name)}</span><i>×</i></button>`)
    .join("")}<button onclick="Office.compare()" ${rows.length < 2 ? "disabled" : ""}>Compare →</button><button class="link" onclick="Office.clearCompare()">Clear</button></div>`;
}
