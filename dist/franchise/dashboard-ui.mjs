// Franchise Hub: a tabbed, bento-grid replacement for the long single-column overview.
// Everything important fits on one screen; detail lives in tabs or the existing routes.
import * as S from "./state.mjs";
import { officeCounts } from "./newsroom.mjs";
import { socialPulse, socialEnginePosts } from "./social-engine.mjs";
import { activeDilemma, resolveDilemma, pressConference, answerPress, COACHING_TREE, treePoints, hasPerk, unlockNode, ensureDepth, momentum, environment, halftimeDeck, playHalftimeCard } from "./depth-systems.mjs";
import { TEAM_COLORS } from "../presentation/team-colors.mjs";
import { STAGES, SCOUT_COSTS, ensurePipeline, pipelineView, addToWatchlist, removeFromPipeline, moveStage, rankOnBoard, syncPipeline, talentRange, positionalNeed } from "./recruiting-pipeline.mjs";
import { scout, draftPick } from "./personnel.mjs";
import * as K from "../ui/kit.mjs";
import { medicalView, trainingView, marketView, draftView, installOps } from "./ops-ui.mjs";

const TABS = [
  ["hub", "Hub"],
  ["squad", "Squad"],
  ["medical", "Medical"],
  ["training", "Training"],
  ["market", "Market"],
  ["draft", "Draft"],
  ["media", "Media & fans"],
  ["coach", "Coaching"],
];
const UNITS = {
  offense: ["QB", "RB", "WR", "TE", "OL"],
  defense: ["DL", "LB", "CB", "S"],
  special: ["K", "P"],
};
const store = (key, fallback) => {
  try {
    return localStorage.getItem(key) ?? fallback;
  } catch {
    return fallback;
  }
};
const remember = (key, value) => {
  try {
    localStorage.setItem(key, value);
  } catch {}
};
let tab = store("gridiron-hub-tab", "hub"),
  unit = "offense",
  feedFilter = "all",
  prospectPos = "need";

const millions = (cents) => `$${(cents / 1e8).toFixed(1)}M`;
const nameOf = (t) => clubs[t]?.[2] ?? `Team ${t + 1}`;
const seasonStat = (p, key) => p.stats?.[state.year]?.[key] ?? 0;

function theme() {
  const color = TEAM_COLORS[state.team] ?? "#3b6cc8";
  document.body.classList.add("gd-themed");
  document.body.style.setProperty("--team", color);
  document.body.style.setProperty("--team-rgb", K.hexToRgb(color));
}

function divisionRank(t) {
  const div = clubs[t][3],
    ids = clubs.map((c, i) => (c[3] === div ? i : -1)).filter((i) => i >= 0);
  ids.sort((a, b) => state.teams[b].w - state.teams[a].w || state.teams[b].pf - state.teams[b].pa - (state.teams[a].pf - state.teams[a].pa));
  return { rank: ids.indexOf(t) + 1, div };
}

/* ------------------------------------------------------------------ cards */

function hero() {
  const g = game(),
    me = state.teams[state.team],
    { rank, div } = divisionRank(state.team),
    pulse = socialPulse(state);
  const teamBlock = (t, right) =>
    `<div class="gd-hero-team ${right ? "gd-right" : ""}">${right ? "" : logo(t)}<div><b>${K.escapeHTML(nameOf(t))}</b><small>${state.teams[t].w}–${state.teams[t].l} · ${K.escapeHTML(clubs[t][3])}</small></div>${right ? logo(t) : ""}</div>`;
  if (!g)
    return `<section class="gd-card gd-span-12 gd-hero"><div class="gd-hero-team">${logo(state.team)}<div><b>${K.escapeHTML(nameOf(state.team))}</b><small>${me.w}–${me.l} · ${K.escapeHTML(div)}</small></div></div><div class="gd-hero-mid"><span class="gd-eyebrow">${K.escapeHTML(state.phase)}</span><strong>${state.phase === "offseason" ? "BUILD" : "NEXT UP"}</strong></div><div></div><div class="gd-hero-actions"><span>${K.chip(pulse.label, pulse.drama >= 60 ? "bad" : pulse.fanScore >= 70 ? "good" : "")}</span><button class="gd-btn gd-primary" onclick="advance()">${state.phase === "offseason" ? "Open offseason" : "Advance calendar"} →</button></div></section>`;
  const opp = opponent(),
    home = g.a === state.team,
    env = environment(state, { a: g.a, b: g.b, weather: state.live?.weather });
  return `<section class="gd-card gd-span-12 gd-hero">${teamBlock(state.team, false)}<div class="gd-hero-mid"><span class="gd-eyebrow">Week ${state.week + 1} · ${home ? "Home" : "Away"}</span><strong>VS</strong></div>${teamBlock(opp, true)}<div class="gd-hero-actions"><span style="display:flex;gap:6px;flex-wrap:wrap">${K.chip(`#${rank} ${div}`, "team")}${K.chip(`Crowd ${env.crowd}`, env.hostile ? "warn" : "")}${clubs[opp][3] === div ? K.chip("Rivalry", "bad") : ""}${K.chip(pulse.label, pulse.drama >= 60 ? "bad" : pulse.fanScore >= 70 ? "good" : "")}</span><span style="display:flex;gap:6px"><button class="gd-btn" onclick="W.open('Game plan')">Game plan</button><button class="gd-btn gd-primary" onclick="advance()">${state.live ? "Return to match" : "Go to matchday"} →</button></span></div></section>`;
}

function seasonCard() {
  const me = state.teams[state.team],
    games = me.w + me.l,
    cap = S.capLedger(state),
    diff = me.pf - me.pa;
  return K.card({
    title: "Season",
    span: 4,
    accent: true,
    body: K.stats([
      ["Record", `${me.w}-${me.l}`, games ? `${Math.round((me.w / games) * 100)}% wins` : "No games yet"],
      ["Point diff", `${diff > 0 ? "+" : ""}${diff}`, `${me.pf} PF · ${me.pa} PA`, Math.sign(diff)],
      ["Cap room", millions(cap.room ?? 0), "This league year", (cap.room ?? 0) < 0 ? -1 : 0],
      ["Morale", Math.round(state.morale ?? 75), "Team average"],
    ]),
  });
}

function pulseCard() {
  const p = socialPulse(state);
  return K.card({
    title: "Team pulse",
    span: 4,
    action: K.link("Fans", "Hub2.tab('media')"),
    body: `${K.meter("Fan score", p.fanScore, { color: K.tone(p.fanScore) })}${K.meter("Drama", p.drama, { color: K.tone(100 - p.drama) })}${K.meter("Chemistry", p.chemistry, { color: K.tone(p.chemistry) })}<div style="display:flex;justify-content:space-between;align-items:center;font-size:12px"><span style="color:var(--gd-text-2)">Weekly morale effect</span>${K.chip(`${p.moraleModifier > 0 ? "+" : ""}${p.moraleModifier}`, p.moraleModifier > 0 ? "good" : p.moraleModifier < 0 ? "bad" : "")}</div>${K.sparkline(p.trend.map((h) => h.fanScore))}`,
  });
}

function deskCard() {
  const c = officeCounts(state),
    dilemma = activeDilemma(state),
    presser = pressConference(state),
    answered = presser && ensureDepth(state).pressers.some((x) => x.id === presser.id);
  let body = "";
  if (dilemma)
    body += `<div class="gd-decision"><span class="gd-eyebrow">Locker room</span><h4>${K.escapeHTML(dilemma.title)}</h4><p>${K.escapeHTML(dilemma.body)}</p><div class="gd-choices">${dilemma.choices.map((ch) => `<button class="gd-btn" onclick="Hub2.dilemma('${dilemma.id}','${ch.id}')">${K.escapeHTML(ch.label)}</button>`).join("")}</div></div>`;
  else if (presser && !answered)
    body += `<div class="gd-decision"><span class="gd-eyebrow">Press conference</span><h4>${K.escapeHTML(presser.question)}</h4><div class="gd-choices">${presser.answers.map((a) => `<button class="gd-btn" onclick="Hub2.press('${presser.id}','${a.id}')">${K.escapeHTML(a.label)}</button>`).join("")}</div></div>`;
  else body += K.empty("No locker-room or media decisions waiting.");
  body += `<div style="display:flex;gap:6px;flex-wrap:wrap">${K.chip(`${c.unread} unread`)}${c.pending ? K.chip(`${c.pending} decisions`, "warn") : ""}${c.urgent ? K.chip(`${c.urgent} urgent`, "bad") : ""}</div>`;
  return K.card({ title: "Your desk", span: 4, action: K.link("Inbox", "W.open('Inbox')"), body });
}

function rosterCard(span = 5) {
  const active = state.roster.filter((p) => !p.injury),
    top = active.slice().sort((a, b) => b.ovr - a.ovr).slice(0, 6),
    injured = state.roster.filter((p) => p.injury);
  const rows = top
    .map((p) => K.row({ lead: p.pos, title: p.name, sub: `${p.age} yrs · morale ${Math.round(p.morale ?? 75)}`, trail: `<span class="gd-ovr">${p.ovr}</span>`, onclick: `W.player('${p.id}',${state.team})` }))
    .join("");
  return K.card({
    title: "Core players",
    span,
    action: K.link("Squad", "Hub2.tab('squad')"),
    body: `<div class="gd-rows">${rows}</div>${injured.length ? `<div style="display:flex;gap:6px;flex-wrap:wrap">${injured.slice(0, 4).map((p) => K.chip(`${p.pos} ${p.name.split(" ").at(-1)} · ${p.injury}w`, "bad")).join("")}</div>` : ""}`,
  });
}

function leadersCard(span = 3) {
  const best = (key) => state.roster.slice().sort((a, b) => seasonStat(b, key) - seasonStat(a, key))[0];
  const items = [
    ["Pass yds", "passYards"],
    ["Rush yds", "rushYards"],
    ["Rec yds", "recYards"],
    ["Sacks", "sacks"],
  ].map(([label, key]) => {
    const p = best(key);
    return [label, p && seasonStat(p, key) ? seasonStat(p, key).toLocaleString("en-US") : "—", p && seasonStat(p, key) ? p.name.split(" ").at(-1) : ""];
  });
  return K.card({ title: "Leaders", span, body: K.stats(items) });
}

function feedCard(span = 4, limit = 4) {
  const posts = socialEnginePosts(state)
    .filter((p) => feedFilter === "all" || p.archetype === feedFilter)
    .slice(0, limit);
  return K.card({
    title: "The timeline",
    span,
    scroll: limit > 4,
    action: limit > 4 ? "" : K.link("All", "Hub2.tab('media')"),
    body: posts.length ? posts.map(K.post).join("") : K.empty("The timeline lights up after your first game."),
  });
}

/* ------------------------------------------------------------------- tabs */

function hubTab() {
  return `<div class="gd-bento">${hero()}${seasonCard()}${pulseCard()}${deskCard()}${rosterCard(5)}${leadersCard(3)}${feedCard(4)}</div>`;
}

function squadTab() {
  const list = state.roster.filter((p) => UNITS[unit].includes(p.pos)).sort((a, b) => UNITS[unit].indexOf(a.pos) - UNITS[unit].indexOf(b.pos) || b.ovr - a.ovr);
  const groups = UNITS[unit]
    .map((pos) => {
      const players = list.filter((p) => p.pos === pos);
      if (!players.length) return "";
      return K.card({
        title: `${pos} · ${players.length}`,
        span: 4,
        body: `<div class="gd-rows">${players
          .slice(0, 8)
          .map((p) =>
            K.row({
              lead: p.starter ? "★" : p.pos,
              title: p.name,
              sub: `${p.age} yrs${p.injury ? ` · out ${p.injury}w` : ""}${p.holdout ? " · holdout" : ""}`,
              trail: `<span class="gd-ovr ${p.injury ? "gd-down" : ""}">${p.ovr}</span>`,
              onclick: `W.player('${p.id}',${state.team})`,
            }),
          )
          .join("")}</div>`,
      });
    })
    .join("");
  return `<div class="gd-toolbar">${K.tabs(
    [
      ["offense", "Offense"],
      ["defense", "Defense"],
      ["special", "Special teams"],
    ],
    unit,
    "Hub2.unit('$id')",
    { small: true, label: "Unit" },
  )}<button class="gd-btn" onclick="W.open('Roster')">Full roster & depth chart →</button></div><div class="gd-bento">${groups || K.card({ span: 12, body: K.empty("No players at these positions.") })}${leadersCard(12)}</div>`;
}

function mediaTab() {
  const p = socialPulse(state),
    filters = [
      ["all", "All"],
      ["insider", "Insiders"],
      ["beat", "Beat"],
      ["hottake", "Hot takes"],
      ["fan", "Fans"],
      ["rival", "Rivals"],
    ];
  return `<div class="gd-toolbar">${K.tabs(filters, feedFilter, "Hub2.feed('$id')", { small: true, label: "Feed filter" })}<button class="gd-btn" onclick="W.open('News')">Classic news & social →</button></div><div class="gd-bento">${feedCard(8, 30)}${K.card({
    title: "Narrative",
    span: 4,
    accent: true,
    body: `${K.stats([
      ["Fan score", Math.round(p.fanScore)],
      ["Drama", Math.round(p.drama)],
      ["Chemistry", Math.round(p.chemistry)],
    ])}<p style="margin:0;font-size:12px;color:var(--gd-text-2)">${K.escapeHTML(p.label)}. Hot takes and insider reports raise drama; drama above 55 erodes chemistry and weekly morale. Wins, accountable answers and good dilemma calls repair it.</p>${K.sparkline(p.trend.map((h) => h.drama))}`,
  })}${deskCard()}</div>`;
}

function coachTab() {
  const points = treePoints(state),
    d = ensureDepth(state),
    branches = [...new Set(COACHING_TREE.map((n) => n.branch))];
  const tree = branches
    .map((b) =>
      K.card({
        title: b,
        span: 3,
        body: `<div class="gd-tree">${COACHING_TREE.filter((n) => n.branch === b)
          .map((n) => {
            const owned = hasPerk(state, n.id),
              locked = n.requires.some((r) => !hasPerk(state, r)) || points < n.cost;
            return `<button class="gd-node ${owned ? "gd-owned" : ""}" ${owned || locked ? "disabled" : ""} onclick="Hub2.unlock('${n.id}')"><b>${K.escapeHTML(n.name)}</b><small>${K.escapeHTML(n.effect)}</small>${owned ? K.chip("Unlocked", "good") : K.chip(`${n.cost} pt${n.cost > 1 ? "s" : ""}`)}</button>`;
          })
          .join("")}</div>`,
      }),
    )
    .join("");
  const history = d.dilemmas
    .filter((x) => x.status === "resolved")
    .slice(0, 6)
    .map((x) => K.row({ lead: `W${x.week + 1}`, title: x.title, sub: x.outcome }))
    .join("");
  return `<div class="gd-toolbar"><span>${K.chip(`${points} coaching point${points === 1 ? "" : "s"} available`, points ? "good" : "")} <small style="color:var(--gd-text-3)">Earn points through career XP each round.</small></span></div><div class="gd-bento">${tree}${K.card({ title: "Locker-room decisions", span: 6, body: history ? `<div class="gd-rows">${history}</div>` : K.empty("No locker-room decisions yet.") })}${K.card({ title: "Press record", span: 6, body: d.pressers.length ? `<div class="gd-rows">${d.pressers.slice(0, 6).map((x) => K.row({ lead: `W${x.week + 1}`, title: `"${x.quote}"`, sub: x.answer })).join("")}</div>` : K.empty("No press conferences answered yet.") })}</div>`;
}

/* --------------------------------------------------------------- pipeline */

const rangeBar = (r) => {
  const pos = (v) => (((v - 40) / 59) * 100).toFixed(1);
  return `<div class="gd-range" title="Talent range ${r.low}–${r.high} · ${r.confidence}% confidence"><i style="left:${pos(r.low)}%;width:${Math.max(3, pos(r.high) - pos(r.low))}%"></i></div>`;
};

function prospectCard(c, onClock, canScout) {
  const nextCost = c.next?.kind ? SCOUT_COSTS[c.next.kind] : 0,
    i = STAGES.findIndex(([id]) => id === c.stage),
    prev = STAGES[i - 1]?.[0],
    next = STAGES[i + 1]?.[0];
  const controls =
    c.stage === "drafted"
      ? K.chip(`Round ${c.round ?? "?"}`, "good")
      : `${c.next?.kind && canScout ? `<button class="gd-btn gd-primary" onclick="Hub2.pipe('scout','${c.id}','${c.next.kind}')">${K.escapeHTML(c.next.label)} · ${nextCost}pt</button>` : ""}${
          c.stage === "board"
            ? `<button class="gd-btn" aria-label="Move up" onclick="Hub2.pipe('rank','${c.id}',-1)">↑</button><button class="gd-btn" aria-label="Move down" onclick="Hub2.pipe('rank','${c.id}',1)">↓</button>${onClock && canScout ? `<button class="gd-btn gd-primary" onclick="Hub2.pipe('draft','${c.id}')">Draft</button>` : ""}`
            : ""
        }${prev && prev !== "drafted" && c.stage !== "watchlist" ? `<button class="gd-btn" aria-label="Move back" onclick="Hub2.pipe('move','${c.id}','${prev}')">←</button>` : ""}${next && next !== "drafted" ? `<button class="gd-btn" aria-label="Advance" onclick="Hub2.pipe('move','${c.id}','${next}')">→</button>` : ""}<button class="gd-btn" aria-label="Remove" onclick="Hub2.pipe('remove','${c.id}')">✕</button>`;
  return `<article class="gd-prospect"><div class="gd-prospect-head"><span class="gd-pos">${K.escapeHTML(c.p.pos)}</span><span><b>${K.escapeHTML(c.p.name)}</b><small>${c.p.age} yrs · ${c.range.confidence}% confidence</small></span><span class="gd-ovr">${c.range.low}–${c.range.high}</span></div>${rangeBar(c.range)}<div class="gd-prospect-tags">${K.chip(`${c.need.need} need`, c.need.need === "High" ? "bad" : c.need.need === "Moderate" ? "warn" : "")}${c.range.notes.length ? `<small>${K.escapeHTML(c.range.notes.at(-1))}</small>` : ""}</div><div class="gd-choices">${controls}</div></article>`;
}

function pipelineTab() {
  const v = pipelineView(state),
    d = v.draft,
    pick = d?.picks?.[d.cursor],
    onClock = !!pick && pick.team === state.team,
    canScout = S.allowed(state, "scout"),
    tracked = new Set(Object.keys(ensurePipeline(state).entries));
  const positions = ["need", ...new Set((state.prospects || []).map((p) => p.pos))];
  const pool = (state.prospects || [])
    .filter((p) => !tracked.has(p.id))
    .filter((p) => (prospectPos === "need" ? positionalNeed(state, p.pos).need !== "Depth" : p.pos === prospectPos))
    .map((p) => ({ p, r: talentRange(state, p) }))
    .sort((a, b) => b.r.estimate - a.r.estimate)
    .slice(0, 8);
  const columns = STAGES.map(
    ([id, label]) =>
      `<section class="gd-card gd-lane"><header class="gd-card-head"><h3>${K.escapeHTML(label)}</h3>${K.chip(String(v.columns[id].length))}</header><div class="gd-card-body gd-scroll">${v.columns[id].length ? v.columns[id].map((c) => prospectCard(c, onClock, canScout)).join("") : K.empty(id === "watchlist" ? "Add prospects from the class below." : id === "board" ? "Rank scouted prospects here." : "Nothing here yet.")}</div></section>`,
  ).join("");
  const add = K.card({
    title: "Draft class",
    span: 12,
    action: `<span style="display:flex;gap:6px;align-items:center">${K.tabs(positions.slice(0, 12).map((p) => [p, p === "need" ? "Team needs" : p]), prospectPos, "Hub2.prospects('$id')", { small: true, label: "Prospect position" })}</span>`,
    body: pool.length
      ? `<div class="gd-pool">${pool.map(({ p, r }) => `<button class="gd-node" onclick="Hub2.pipe('add','${p.id}')"><b>${K.escapeHTML(p.pos)} · ${K.escapeHTML(p.name)}</b><small>${r.low}–${r.high} · ${r.confidence}% · ${p.age} yrs</small>${rangeBar(r)}${K.chip("+ Watchlist", "team")}</button>`).join("")}</div>`
      : K.empty("No untracked prospects at this filter."),
  });
  return `<div class="gd-toolbar"><span style="display:flex;gap:6px;flex-wrap:wrap">${K.chip(`${v.points} scouting points`, v.points ? "good" : "warn")}${K.chip(`${v.visits}/30 private visits`)}${onClock ? K.chip(`On the clock · round ${pick.round}`, "bad") : d ? K.chip(d.cursor >= d.picks.length ? "Draft complete" : `Round ${pick?.round ?? "–"} in progress`) : K.chip("Draft opens in the offseason")}${v.lost.length ? K.chip(`${v.lost.length} targets taken elsewhere`, "warn") : ""}${canScout ? "" : K.chip(`${state.franchise.role}: scouting and picks are delegated — build the board for your GM`)}</span><button class="gd-btn" onclick="W.open('Scouting')">Classic scouting →</button></div><div class="gd-kanban">${columns}</div><div class="gd-bento">${add}</div>`;
}

export function hubView() {
  theme();
  // The recruiting pipeline now lives under Draft → Big board; old saved "pipeline" tabs land there.
  if (tab === "pipeline") tab = "draft";
  const views = { squad: squadTab, medical: medicalView, training: trainingView, market: marketView, draft: () => draftView({ pipeline: pipelineTab }), media: mediaTab, coach: coachTab };
  const body = (views[tab] ?? hubTab)();
  return `<div class="gd-hub"><div class="gd-toolbar">${K.tabs(TABS, tab, "Hub2.tab('$id')", { label: "Franchise hub" })}<button class="gd-link" onclick="Hub2.classic()">Classic overview</button></div>${body}</div>`;
}

/* -------------------------------------------------------------- matchday */

export function gameDayStrip(s = state) {
  const m = s.live;
  if (!m) return "";
  const labels = [clubs[s.team][0], clubs[s.team === m.a ? m.b : m.a][0]],
    mo = momentum(m, labels),
    env = environment(s, m),
    deck = m.halftime ? halftimeDeck(s, m) : [],
    used = ensureDepth(s).halftime.some((h) => h.key === `${s.year}:${s.week}:${m.a}:${m.b}`);
  return `<section class="gd-card gd-gameday gd-accent"><div class="gd-card-body"><div class="gd-toolbar"><span class="gd-eyebrow">Game-day strategy</span><span style="display:flex;gap:6px;flex-wrap:wrap">${K.chip(env.weather)}${K.chip(`Crowd ${env.crowd}`, env.hostile ? "warn" : "")}${K.chip(env.communication, env.communication === "Normal" ? "" : "warn")}${env.windAdvice ? K.chip(env.windAdvice) : ""}</span></div><div class="gd-meter" style="grid-template-columns:92px 1fr 36px"><span>Momentum</span>${K.momentumBar(mo)}<b>${mo > 0 ? "+" : ""}${mo}</b></div>${
    deck.length && !used
      ? `<div><span class="gd-eyebrow">Halftime adjustment — pick one</span></div><div class="gd-deck">${deck.map((c) => `<button class="gd-play-card" onclick="Hub2.halftime('${c.id}')"><b>${K.escapeHTML(c.name)}</b><small>${K.escapeHTML(c.desc)}</small></button>`).join("")}</div>`
      : used && m.halftime
        ? K.chip("Halftime adjustment locked in", "good")
        : ""
  }</div></section>`;
}

/* ------------------------------------------------------------- installer */

export function installDashboard({ views, isBusy }) {
  installOps({ isBusy });
  // The sidebar's "Medical & training" route opens the new medical and training planner.
  const classicMedical = views.Medical;
  views.Medical = () => `<div class="gd-hub"><div class="gd-toolbar">${K.tabs([["medical", "Medical"], ["training", "Training"]], tab === "training" ? "training" : "medical", "Hub2.tab('$id')", { label: "Medical and training" })}<button class="gd-link" onclick="Hub2.tab('${tab === "training" ? "training" : "medical"}');W.open('Overview')">Open in Hub</button></div>${tab === "training" ? trainingView() : medicalView()}${classicMedical ? `<details class="gd-classic"><summary>Classic preparation controls</summary>${classicMedical()}</details>` : ""}</div>`;
  const classicOverview = views.Overview;
  views.Overview = () => (store("gridiron-classic-overview", "0") === "1" ? classicOverview() + `<p style="margin-top:12px"><button class="gd-link" onclick="Hub2.modern()">Switch to the new Hub</button></p>` : hubView());
  // Copy/mutate/validate through state.transact; the toast only fires once the change commits.
  const mutate = (fn, message) => {
    if (isBusy()) return;
    try {
      let result;
      state = S.transact(state, (s) => (result = fn(s)));
      save();
      render();
      toast(message(result));
    } catch (e) {
      toast(e.message);
    }
  };
  window.Hub2 = {
    tab(id) {
      tab = TABS.some(([t]) => t === id) ? id : "hub";
      window.__gdHubTab = tab;
      remember("gridiron-hub-tab", tab);
      render();
    },
    unit(id) {
      unit = UNITS[id] ? id : "offense";
      render();
    },
    feed(id) {
      feedFilter = id;
      render();
    },
    classic() {
      remember("gridiron-classic-overview", "1");
      render();
    },
    modern() {
      remember("gridiron-classic-overview", "0");
      render();
    },
    dilemma: (id, choice) => mutate((s) => resolveDilemma(s, id, choice), (r) => `Decision made: ${r.outcome}`),
    press: (id, answer) => mutate((s) => answerPress(s, id, answer), (r) => `"${r.quote}"`),
    unlock: (id) => mutate((s) => unlockNode(s, id), (r) => `Unlocked: ${r.name}`),
    halftime: (id) => mutate((s) => playHalftimeCard(s, id), (r) => `Halftime adjustment: ${r.name}`),
    prospects(pos) {
      prospectPos = pos;
      render();
    },
    // Scouting and drafting go through personnel.scout / personnel.draftPick so points, visit
    // limits, role checks and roster rules are identical to the classic screens.
    pipe(op, id, arg) {
      if (state.live && ["scout", "draft"].includes(op)) return toast("Complete the live game before making franchise transactions.");
      const name = () => state.prospects?.find((p) => p.id === id)?.name ?? "Prospect";
      const label = name();
      mutate(
        (s) => {
          if (op === "add") addToWatchlist(s, id);
          else if (op === "remove") removeFromPipeline(s, id);
          else if (op === "move") moveStage(s, id, arg);
          else if (op === "rank") rankOnBoard(s, id, Number(arg));
          else if (op === "scout") scout(s, id, arg);
          else if (op === "draft") draftPick(s, id);
          else throw Error("Unknown pipeline action.");
          syncPipeline(s);
          return s.franchise.pipeline.entries[id]?.stage;
        },
        (stage) => (op === "draft" ? `${label} drafted` : op === "scout" ? `${arg} complete: ${label}${stage ? ` · ${STAGES.find(([x]) => x === stage)?.[1]}` : ""}` : op === "add" ? `${label} added to your watchlist` : op === "remove" ? `${label} removed` : `${label} updated`),
      );
    },
  };
  if (typeof matchScreen === "function") {
    const previous = matchScreen;
    matchScreen = function () {
      const html = previous();
      return state.live ? gameDayStrip() + html : html;
    };
  }
}
