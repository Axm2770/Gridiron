// Club overview: a bento-grid front-office dashboard. It used to carry its own tab strip (Squad,
// Medical, Training, Market, Draft, Media & fans, Coaching) that duplicated the sidebar; the sidebar
// is now the only way between screens. Content unique to those tabs moved to its proper screen:
// the scout network and the watchlist pipeline to Draft room, the coaching tree to Coach career.
import * as S from "./state.mjs";
import { officeCounts, ensureOffice } from "./newsroom.mjs";
import { socialPulse, socialEnginePosts } from "./social-engine.mjs";
import { activeDilemma, resolveDilemma, pressConference, answerPress, COACHING_TREE, treePoints, hasPerk, unlockNode, ensureDepth, momentum, environment, halftimeDeck, playHalftimeCard } from "./depth-systems.mjs";
import { TEAM_COLORS } from "../presentation/team-colors.mjs";
import { STAGES, SCOUT_COSTS, ensurePipeline, pipelineView, addToWatchlist, removeFromPipeline, moveStage, rankOnBoard, syncPipeline, talentRange, positionalNeed } from "./recruiting-pipeline.mjs";
import { scout, draftPick } from "./personnel.mjs";
import * as K from "../ui/kit.mjs";
import { medicalView, trainingView, installOps } from "./ops-ui.mjs";
import { REGIONS, ensureScouting, scoutCandidates } from "./draft-room.mjs";
import { pixelFace } from "../ui/pixel-face.mjs";
import { teamColors } from "../presentation/pixel-art.mjs";
import { fixtures } from "./front-office.mjs";
import { rosterLimit } from "./blockers.mjs";
import { winChance, oddsLabel, moneyline, litBlocks, recentForm, teamForm, divisionTable, ordinal, pageOf, daysBetween, shortDate, senderInitials, loadDeskStyles } from "./hub-model.mjs";


// Old Hub tab ids → the sidebar screen that now owns that content (Hub2.tab keeps old links working).
export const HUB_TAB_ROUTES = {
  hub: "Overview",
  squad: "Roster",
  medical: "Medical",
  training: "Medical",
  market: "Market",
  draft: "Draft",
  pipeline: "Draft",
  media: "News",
  coach: "Career",
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
// Medical | Training sub-tab of the Medical & training screen (an old saved Hub tab is honoured once).
let medTab = store("gridiron-med-tab", store("gridiron-hub-tab", "") === "training" ? "training" : "medical"),
  // Draft room sub-tab: the room itself, the regional scout network, or the watchlist pipeline.
  draftTab = "room",
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
// The Hub tab is a pixel "front office dashboard": the next match as a scoreboard hero, a KPI
// strip, then panels (fd-* classes, styled in desk.css). Every panel links to the screen that owns it.

const h = K.escapeHTML;
const short = (name) => String(name || "").split(" ").at(-1);
const abbr = (t) => clubs[t]?.[0] ?? "—";
const teamPower = (t) => {
  try {
    if (typeof strength === "function") return strength(t);
  } catch {}
  return state.teams[t]?.rating ?? 75;
};
// Block meter: whole squares, never smooth fills (same idea as the draft room's dr-blocks).
const blocks = (value, max = 100, cells = 10, tone = "") =>
  `<span class="fd-blocks ${tone}" aria-hidden="true">${Array.from({ length: cells }, (_, i) => `<i${i < litBlocks(value, max, cells) ? ' class="on"' : ""}></i>`).join("")}</span>`;
const toneOf = (v, good = 65, bad = 40) => (v >= good ? "good" : v <= bad ? "bad" : "warn");
const formStrip = (form, cells = 5) =>
  `<span class="fd-form" aria-label="Last ${cells}: ${form.join(" ") || "no games"}">${Array.from({ length: cells }, (_, i) => {
    const r = form[form.length - cells + i];
    return `<i class="${r === "W" ? "w" : r === "L" ? "l" : r === "T" ? "t" : ""}">${r || "·"}</i>`;
  }).join("")}</span>`;
const panel = ({ title, span = 4, action = "", body, cls = "" }) =>
  `<section class="fd-panel fd-s${span} ${cls}"><header class="fd-head"><h2>${h(title)}</h2>${action}</header><div class="fd-body">${body}</div></section>`;
const crest = (t, cls = "") => `<span class="fd-crest ${cls}">${logo(t)}</span>`;
const face = (p, size = 34) => pixelFace(p, { size, team: state.team });

function hero() {
  const g = game(),
    me = state.teams[state.team],
    { rank, div } = divisionRank(state.team),
    pulse = socialPulse(state),
    myColors = teamColors(state.team),
    myForm = teamForm(state.schedule, state.team);
  const side = (t, label, form, right) => {
    const r = state.teams[t];
    return `<div class="fd-side ${right ? "fd-right" : ""}">${crest(t, "fd-crest-lg")}<div class="fd-side-copy"><small>${h(label)}</small><b>${h(nameOf(t))}</b><em>${r.w}–${r.l}${r.t ? `–${r.t}` : ""} · ${h(clubs[t][3])}</em>${formStrip(form)}</div></div>`;
  };
  if (!g) {
    const title = state.phase === "offseason" ? "Offseason" : state.phase === "playoffs" ? "Season over" : "Bye week",
      note = state.phase === "offseason" ? "Re-sign, draft and rebuild before next season." : state.phase === "playoffs" ? "Your season has ended. Advance to the offseason." : "No game this week. Rest, train and plan.";
    return `<section class="fd-match fd-s12 fd-idle" style="--home:${myColors.primary};--home-2:${myColors.secondary}"><div class="fd-match-grid">${side(state.team, `#${rank} ${div}`, myForm, false)}<div class="fd-board"><span class="fd-kick">${state.year} · ${h(title.toUpperCase())}</span><strong class="fd-vs">${state.phase === "offseason" ? "BUILD" : "REST"}</strong><span class="fd-venue">${h(note)}</span></div><div class="fd-side fd-right fd-idle-actions">${K.chip(pulse.label, pulse.drama >= 60 ? "bad" : pulse.fanScore >= 70 ? "good" : "")}</div></div><div class="fd-match-foot"><span class="fd-chips"></span><span class="fd-actions"><button class="gd-btn gd-primary" onclick="advance()">${state.phase === "offseason" ? "Open offseason" : "Advance calendar"} →</button></span></div></section>`;
  }
  const opp = opponent(),
    home = g.a === state.team,
    oppColors = teamColors(opp),
    env = environment(state, { a: g.a, b: g.b, weather: state.live && state.live.a === g.a && state.live.b === g.b ? state.live.weather : undefined }),
    stadium = state.franchise.clubs?.[home ? state.team : opp]?.stadium?.name,
    cal = state.franchise.calendarSim,
    kickoff = cal?.nextRoundDate,
    days = daysBetween(cal?.date, kickoff),
    chance = winChance(teamPower(state.team), teamPower(opp), home),
    rival = clubs[opp][3] === div,
    when = state.phase === "playoffs" ? "Playoffs" : `Week ${state.week + 1}`,
    live = state.live && !state.live.finished;
  const odds = `<div class="fd-odds" role="meter" aria-label="Win chance ${chance}%" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${chance}"><div class="fd-odds-legend"><span><small>Win chance</small><b>${chance}%</b></span><span class="fd-odds-mid">${K.chip(oddsLabel(chance), chance >= 56 ? "good" : chance <= 44 ? "bad" : "warn")}<small>Moneyline ${moneyline(chance)}</small></span><span><small>${h(abbr(opp))}</small><b>${100 - chance}%</b></span></div><div class="fd-odds-track">${Array.from({ length: 20 }, (_, i) => `<i class="${i < Math.round(chance / 5) ? "us" : "them"}"></i>`).join("")}</div></div>`;
  return `<section class="fd-match fd-s12" style="--home:${myColors.primary};--home-2:${myColors.secondary};--away:${oppColors.primary};--away-2:${oppColors.secondary}"><div class="fd-match-grid">${side(state.team, `Your club · ${home ? "Home" : "Away"}`, myForm, false)}<div class="fd-board"><span class="fd-kick">${h(when)}${kickoff ? ` · ${h(shortDate(kickoff))}` : ""}${days != null && days >= 0 ? ` · ${days === 0 ? "Game day" : `in ${days} day${days === 1 ? "" : "s"}`}` : ""}</span><strong class="fd-vs">${live ? "LIVE" : "VS"}</strong><span class="fd-venue">${stadium ? `${h(stadium)} · ` : ""}${h(env.weather === "Dome" ? "Indoors" : env.weather)}${env.forecast && !env.forecast.indoor ? ` ${env.forecast.temp}°F` : ""} · Crowd ${env.crowd}</span></div>${side(opp, `Opponent · #${divisionTable(state.teams, clubs, opp).find((r) => r.me)?.rank ?? "–"} ${clubs[opp][3]}`, teamForm(state.schedule, opp), true)}</div>${odds}<div class="fd-match-foot"><span class="fd-chips">${K.chip(`#${rank} ${div}`, "team")}${env.hostile ? K.chip(`Hostile crowd ${env.crowd}`, "warn") : ""}${env.communication !== "Normal" ? K.chip(env.communication, "warn") : ""}${rival ? K.chip("Division rival", "bad") : ""}${K.chip(pulse.label, pulse.drama >= 60 ? "bad" : pulse.fanScore >= 70 ? "good" : "")}</span><span class="fd-actions"><button class="gd-btn" onclick="W.open('Game plan')">Game plan</button><button class="gd-btn gd-primary" onclick="advance()">${state.live ? "Return to match" : "Go to matchday"} →</button></span></div></section>`;
}

function kpiStrip() {
  const me = state.teams[state.team],
    games = me.w + me.l + (me.t || 0),
    cap = S.capLedger(state),
    table = divisionTable(state.teams, clubs, state.team),
    mine = table.find((r) => r.me),
    leader = table[0],
    back = mine && leader && !leader.me ? (leader.w - mine.w + (mine.l - leader.l)) / 2 : 0,
    diff = me.pf - me.pa,
    active = state.roster.filter((p) => !p.status || p.status === "active").length,
    limit = rosterLimit(state),
    capPct = cap.limit ? Math.max(0, Math.min(100, ((cap.used ?? 0) / cap.limit) * 100)) : 0;
  const tile = (label, value, note, meter, tone = "") => `<div class="fd-kpi ${tone}"><small>${h(label)}</small><b>${h(value)}</b>${meter}<em>${h(note)}</em></div>`;
  return `<div class="fd-kpis fd-s12">${[
    tile("Record", `${me.w}–${me.l}${me.t ? `–${me.t}` : ""}`, games ? `${Math.round((me.w / games) * 100)}% wins · ${games} played` : "No games yet", blocks(me.w, Math.max(1, state.schedule.length), 17, "good")),
    tile("Division", mine ? ordinal(mine.rank) : "—", back > 0 ? `${back} game${back === 1 ? "" : "s"} back in the ${clubs[state.team][3]}` : mine?.rank === 1 ? `Leads the ${clubs[state.team][3]}` : clubs[state.team][3], blocks(table.length - (mine?.rank ?? table.length) + 1, Math.max(1, table.length), Math.max(1, table.length), "team")),
    tile("Point diff", `${diff > 0 ? "+" : ""}${diff}`, `${me.pf} for · ${me.pa} against`, `<span class="fd-blocks-gap"></span>`, diff > 0 ? "up" : diff < 0 ? "down" : ""),
    tile("Cap room", millions(cap.room ?? 0), `${Math.round(capPct)}% of the cap committed`, blocks(capPct, 100, 10, capPct > 95 ? "bad" : capPct > 85 ? "warn" : "good"), (cap.room ?? 0) < 0 ? "down" : ""),
    tile("Roster", `${active}/${limit}`, active > limit ? `Cut ${active - limit} before the deadline` : `${limit - active} open spot${limit - active === 1 ? "" : "s"}`, blocks(active, limit, 10, active > limit ? "bad" : ""), active > limit ? "down" : ""),
  ].join("")}</div>`;
}

function pulseCard(span = 4) {
  const p = socialPulse(state),
    owner = state.franchise.clubs?.[state.team]?.owner,
    morale = Math.round(state.morale ?? 75);
  const row = (label, v, tone, note = "") => `<div class="fd-meter"><span>${h(label)}</span>${blocks(v, 100, 12, tone)}<b>${Math.round(v)}</b>${note ? `<small>${h(note)}</small>` : ""}</div>`;
  return panel({
    title: "Club pulse",
    span,
    cls: "fd-pulse",
    action: K.link("Fans", "Hub2.tab('media')"),
    body: `${row("Morale", morale, toneOf(morale))}${row("Chemistry", p.chemistry, toneOf(p.chemistry))}${row("Fan score", p.fanScore, toneOf(p.fanScore))}${owner ? row("Board", owner.patience, toneOf(owner.patience)) : ""}${row("Drama", p.drama, toneOf(100 - p.drama))}<div class="fd-pulse-note"><b>${h(p.label)}</b><span>Hot takes raise drama; wins and straight answers calm it.</span>${K.sparkline(p.trend.map((x) => x.fanScore), { width: 200, height: 26 })}</div><div class="fd-foot-line"><span>Weekly morale effect</span>${K.chip(`${p.moraleModifier > 0 ? "+" : ""}${p.moraleModifier}`, p.moraleModifier > 0 ? "good" : p.moraleModifier < 0 ? "bad" : "")}</div>`,
  });
}

function deskCard(span = 5) {
  const c = officeCounts(state),
    dilemma = activeDilemma(state),
    presser = pressConference(state),
    answered = presser && ensureDepth(state).pressers.some((x) => x.id === presser.id),
    messages = ensureOffice(state).messages;
  let body = "",
    leadId = null;
  const decision = (kicker, title, text, choices, tone = "") => `<div class="fd-decision ${tone}"><span class="fd-kicker">${h(kicker)}</span><h3>${h(title)}</h3>${text ? `<p>${h(text)}</p>` : ""}<div class="fd-choices">${choices}</div></div>`;
  if (dilemma) body += decision("Locker room", dilemma.title, dilemma.body, dilemma.choices.map((ch) => `<button class="gd-btn" onclick="Hub2.dilemma('${dilemma.id}','${ch.id}')">${h(ch.label)}</button>`).join(""));
  else if (presser && !answered) body += decision("Press conference", presser.question, "", presser.answers.map((a) => `<button class="gd-btn" onclick="Hub2.press('${presser.id}','${a.id}')">${h(a.label)}</button>`).join(""));
  else {
    // Inbox decisions count here too, so the card never says "nothing waiting" beside a decision chip.
    const next = messages.find((m) => m.status === "pending");
    leadId = next?.id;
    body += next ? decision(next.source || "Inbox", next.title, next.summary, `<button class="gd-btn gd-primary" onclick="W.open('Inbox');Office.select('${next.id}')">Respond in inbox →</button>`, next.priority === "urgent" ? "urgent" : "") : `<div class="fd-clear"><b>Desk clear</b><small>Nothing needs your answer right now.</small></div>`;
  }
  const queue = messages
    .filter((m) => m.id !== leadId && (m.status === "pending" || !m.read))
    .slice(0, 2)
    .map((m) => `<button class="fd-mail ${m.read ? "" : "unread"}" onclick="W.open('Inbox');Office.select('${m.id}')"><span class="fd-mono fd-cat-${h(String(m.category || "").toLowerCase())}">${h(senderInitials(m.source))}</span><span><b>${h(m.title)}</b><small>${h(m.source)} · ${h(m.category)}</small></span>${m.status === "pending" ? K.chip("Reply", m.priority === "urgent" ? "bad" : "warn") : ""}</button>`)
    .join("");
  body += queue ? `<div class="fd-queue">${queue}</div>` : "";
  return panel({
    title: "Your desk",
    span,
    cls: "fd-desk",
    action: `<span class="fd-head-chips">${K.chip(`${c.unread} unread`)}${c.pending ? K.chip(`${c.pending} decision${c.pending === 1 ? "" : "s"}`, "warn") : ""}${c.urgent ? K.chip(`${c.urgent} urgent`, "bad") : ""}${K.link("Inbox", "W.open('Inbox')")}</span>`,
    body,
  });
}

function standingsCard(span = 3) {
  const rows = divisionTable(state.teams, clubs, state.team),
    div = clubs[state.team][3],
    games = fixtures(state).filter((r) => r.stage === "Regular season" && !r.bye && clubs[r.opponent]?.[3] === div),
    nextDiv = games.find((r) => !r.done),
    dw = games.filter((r) => r.result === "W").length,
    dl = games.filter((r) => r.result === "L").length;
  return panel({
    title: clubs[state.team][3],
    span,
    cls: "fd-std",
    action: K.link("League", "W.open('League desk')"),
    body: `<table class="fd-table"><thead><tr><th>#</th><th>Club</th><th>W–L</th><th>Diff</th></tr></thead><tbody>${rows
      .map((r) => `<tr class="${r.me ? "me" : ""}"><td>${r.rank}</td><td><span class="fd-club">${crest(r.team, "fd-crest-sm")}<b>${h(abbr(r.team))}</b></span></td><td>${r.w}–${r.l}${r.t ? `–${r.t}` : ""}</td><td class="${r.diff > 0 ? "up" : r.diff < 0 ? "down" : ""}">${r.diff > 0 ? "+" : ""}${r.diff}</td></tr>`)
      .join("")}</tbody></table><div class="fd-std-foot"><span><small>Division record</small><b>${dw}–${dl}</b></span><span><small>Next division game</small><b>${nextDiv ? `W${nextDiv.week} ${nextDiv.home ? "vs" : "at"} ${h(abbr(nextDiv.opponent))}` : "None left"}</b></span></div>`,
  });
}

function roadCard(span = 8) {
  const all = fixtures(state).filter((r) => r.stage === "Regular season"),
    played = all.filter((r) => r.done),
    last = played.at(-1),
    next = all.find((r) => !r.done && !r.bye),
    form = recentForm(all, 5);
  const tile = (r) =>
    r.bye
      ? `<span class="fd-week bye" title="Week ${r.week}: bye"><small>W${r.week}</small><b>BYE</b></span>`
      : `<button class="fd-week ${r.result ? r.result.toLowerCase() : ""} ${r.current ? "now" : ""}" title="Week ${r.week}: ${r.home ? "vs" : "at"} ${h(nameOf(r.opponent))}${r.done ? ` · ${r.result} ${r.for}–${r.against}` : ""}" onclick="W.open('Calendar')"><small>W${r.week}</small><b>${r.home ? "" : "@"}${h(abbr(r.opponent))}</b><em>${r.done ? `${r.for}–${r.against}` : r.current ? "NEXT" : ""}</em></button>`;
  return panel({
    title: "Season road",
    span,
    cls: "fd-roadp",
    action: K.link("Schedule", "W.open('Calendar')"),
    body: `<div class="fd-road" style="--weeks:${Math.max(1, all.length)}">${all.map(tile).join("")}</div><div class="fd-road-foot"><span><small>Form</small>${formStrip(form)}</span><span><small>Last result</small><b>${last ? `${last.result} ${last.for}–${last.against} ${last.home ? "vs" : "at"} ${h(abbr(last.opponent))}` : "Season opener ahead"}</b></span><span><small>Next</small><b>${next ? `W${next.week} ${next.home ? "vs" : "at"} ${h(nameOf(next.opponent))}` : "Regular season complete"}</b></span></div>`,
  });
}

function rosterCard(span = 5) {
  const top = state.roster
    .filter((p) => !p.injury)
    .sort((a, b) => b.ovr - a.ovr)
    .slice(0, 6);
  return panel({
    title: "Core players",
    span,
    cls: "fd-core",
    action: K.link("Squad", "W.open('Roster')"),
    body: `<div class="fd-players">${top
      .map((p) => {
        const m = Math.round(p.morale ?? 75);
        return `<button class="fd-player" onclick="W.player('${p.id}',${state.team})">${face(p, 36)}<span class="fd-player-copy"><b><i class="fd-pos">${h(p.pos)}</i>${h(p.name)}</b><small>${p.age} yrs · morale ${m}</small></span>${blocks(m, 100, 5, toneOf(m))}<span class="fd-ovr">${p.ovr}</span></button>`;
      })
      .join("")}</div>`,
  });
}

function medicalCard(span = 3) {
  const out = state.roster.filter((p) => p.injury).sort((a, b) => b.injury - a.injury || b.ovr - a.ovr),
    starters = out.filter((p) => p.starter).length;
  return panel({
    title: "Medical room",
    span,
    cls: "fd-med",
    action: K.link("Medical", "Hub2.tab('medical')"),
    body: `<div class="fd-med-sum"><div><b class="${out.length ? "down" : "up"}">${out.length}</b><small>Injured</small></div><div><b class="${starters ? "down" : ""}">${starters}</b><small>Starters out</small></div></div>${
      out.length
        ? `<div class="fd-injuries">${out
            .slice(0, 4)
            .map((p) => `<button class="fd-injury" onclick="W.player('${p.id}',${state.team})">${face(p, 28)}<span><b>${h(p.pos)} ${h(short(p.name))}</b><small>${p.starter ? "Starter" : "Reserve"} · ${p.ovr} OVR</small></span><em>${p.injury}w</em></button>`)
            .join("")}${out.length > 4 ? `<button class="gd-link fd-more" onclick="Hub2.tab('medical')">+${out.length - 4} more →</button>` : ""}</div>`
        : `<div class="fd-clear"><b>Full health</b><small>Every player is available.</small></div>`
    }`,
  });
}

function leadersCard(span = 4) {
  const best = (key) => state.roster.slice().sort((a, b) => seasonStat(b, key) - seasonStat(a, key))[0];
  const rows = [
    ["Passing", "passYards", "yds"],
    ["Rushing", "rushYards", "yds"],
    ["Receiving", "recYards", "yds"],
    ["Sacks", "sacks", ""],
  ].map(([label, key, unit]) => {
    const p = best(key),
      v = p ? seasonStat(p, key) : 0;
    return v
      ? `<button class="fd-leader" onclick="W.player('${p.id}',${state.team})">${face(p, 28)}<span><small>${h(label)}</small><b>${h(p.name)}</b></span><strong>${v.toLocaleString("en-US")}<small>${unit}</small></strong></button>`
      : `<div class="fd-leader empty"><span class="fd-leader-blank"></span><span><small>${h(label)}</small><b>No stats yet</b></span><strong>—</strong></div>`;
  });
  return panel({ title: "Team leaders", span, cls: "fd-lead", action: K.link("Stats", "W.open('Statistics')"), body: `<div class="fd-leaders">${rows.join("")}</div>` });
}

function feedCard(span = 4, limit = 3) {
  const posts = socialEnginePosts(state).slice(0, limit);
  return panel({
    title: "The timeline",
    span,
    cls: "fd-feed",
    action: limit > 4 ? "" : K.link("All", "Hub2.tab('media')"),
    body: posts.length ? posts.map(K.post).join("") : `<div class="fd-clear"><b>Quiet so far</b><small>The timeline lights up after your first game.</small></div>`,
  });
}

/* -------------------------------------------------------------- overview */

function hubTab() {
  return `<div class="fd-grid gd-bento">${hero()}${kpiStrip()}${deskCard(5)}${pulseCard(4)}${standingsCard(3)}${roadCard(8)}${leadersCard(4)}${rosterCard(5)}${medicalCard(3)}${feedCard(4)}</div>`;
}

// Coaching tree, locker-room decisions and press record: shown on Coach career.
export function coachingSection() {
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
  return `<section class="gd-hub fd-coaching"><div class="gd-toolbar"><h2 class="fd-section-title">Coaching tree</h2><span>${K.chip(`${points} coaching point${points === 1 ? "" : "s"} available`, points ? "good" : "")} <small style="color:var(--gd-text-3)">Earn points through career XP each round.</small></span></div><div class="gd-bento fd-coach">${tree}${K.card({ title: "Locker-room decisions", span: 6, body: history ? `<div class="gd-rows">${history}</div>` : K.empty("No locker-room decisions yet.") })}${K.card({ title: "Press record", span: 6, body: d.pressers.length ? `<div class="gd-rows">${d.pressers.slice(0, 6).map((x) => K.row({ lead: `W${x.week + 1}`, title: `"${x.quote}"`, sub: x.answer })).join("")}</div>` : K.empty("No press conferences answered yet.") })}</div></section>`;
}

// Regional scouts for the draft class (hire, region, focus); reports raise prospect confidence.
function scoutNetwork() {
  const n = ensureScouting(state),
    e = K.escapeHTML,
    money = (c) => `$${(c / S.MILLION).toFixed(2)}M`;
  const scouts = n.scouts.map((sc) => `<article class="ops-scout"><header><span class="gd-pos">SC</span><span><b>${e(sc.name)}</b><small>Skill ${sc.skill}</small></span></header><label>Region<select onchange="Ops.assign('${sc.id}',this.value,null)">${REGIONS.map((r) => `<option ${r === sc.region ? "selected" : ""}>${r}</option>`).join("")}</select></label><label>Focus<select onchange="Ops.assign('${sc.id}',null,this.value)">${["All", "QB", "Skill", "Line", "Front 7", "Secondary", "Specialist"].map((f) => `<option ${f === sc.focus ? "selected" : ""}>${f}</option>`).join("")}</select></label></article>`).join("");
  return `<div class="gd-bento">${K.card({ title: `Your scouts (${n.scouts.length}/5)`, span: 8, accent: true, body: `<div class="ops-scouts">${scouts}</div>` })}${K.card({ title: "Available scouts", span: 4, body: `<div class="gd-rows">${scoutCandidates(state).map((c) => K.row({ lead: "SC", title: c.name, sub: `${c.region} · ${c.focus} · skill ${c.skill}`, trail: `<button class="gd-btn" onclick="Ops.scout('${c.id}')">${money(c.salary)}</button>` })).join("") || K.empty("No candidates.")}</div>` })}${K.card({ title: "Latest reports", span: 12, body: n.log.length ? `<div class="gd-rows">${n.log.slice(0, 10).map((r) => K.row({ lead: "↑", title: `${r.scout} on ${r.prospect}`, sub: `Confidence ${r.from}% → ${r.to}%` })).join("")}</div>` : K.empty("Reports arrive after the next game week.") })}</div>`;
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
  return `<div class="gd-toolbar"><span style="display:flex;gap:6px;flex-wrap:wrap">${K.chip(`${v.points} scouting points`, v.points ? "good" : "warn")}${K.chip(`${v.visits}/30 private visits`)}${onClock ? K.chip(`On the clock · round ${pick.round}`, "bad") : d ? K.chip(d.cursor >= d.picks.length ? "Draft complete" : `Round ${pick?.round ?? "–"} in progress`) : K.chip("Draft opens in the offseason")}${v.lost.length ? K.chip(`${v.lost.length} targets taken elsewhere`, "warn") : ""}${canScout ? "" : K.chip(`${state.franchise.role}: the front office makes the picks — your board guides them`)}</span></div><div class="gd-kanban">${columns}</div><div class="gd-bento">${add}</div>`;
}

export function hubView() {
  theme();
  return `<div class="gd-hub fd-hub fd-tab-hub">${hubTab()}</div>`;
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
  return `<section class="gd-card gd-gameday gd-accent"><div class="gd-card-body"><div class="gd-toolbar"><span class="gd-eyebrow">Game-day strategy</span><span style="display:flex;gap:6px;flex-wrap:wrap">${K.chip((env.weather === "Dome" ? "Indoors" : env.weather) + (env.forecast && !env.forecast.indoor ? ` ${env.forecast.temp}°F` : ""))}${K.chip(`Crowd ${env.crowd}`, env.hostile ? "warn" : "")}${K.chip(env.communication, env.communication === "Normal" ? "" : "warn")}${env.windAdvice ? K.chip(env.windAdvice) : ""}</span></div><div class="gd-meter" style="grid-template-columns:92px 1fr 36px"><span>Momentum</span>${K.momentumBar(mo)}<b>${mo > 0 ? "+" : ""}${mo}</b></div>${
    deck.length && !used
      ? `<div><span class="gd-eyebrow">Halftime adjustment — pick one</span></div><div class="gd-deck">${deck.map((c) => `<button class="gd-play-card" onclick="Hub2.halftime('${c.id}')"><b>${K.escapeHTML(c.name)}</b><small>${K.escapeHTML(c.desc)}</small></button>`).join("")}</div>`
      : used && m.halftime
        ? K.chip("Halftime adjustment locked in", "good")
        : ""
  }</div></section>`;
}

/* ------------------------------------------------------------- installer */

export function installDashboard({ views, isBusy }) {
  loadDeskStyles();
  installOps({ isBusy });
  // The sidebar's "Medical & training" route opens the new medical and training planner.
  const classicMedical = views.Medical;
  views.Medical = () => `<div class="gd-hub"><div class="gd-toolbar">${K.tabs([["medical", "Medical"], ["training", "Training"]], medTab, "Hub2.tab('$id')", { label: "Medical and training" })}</div>${medTab === "training" ? trainingView() : medicalView()}${classicMedical ? `<details class="gd-classic"><summary>Classic preparation controls</summary>${classicMedical()}</details>` : ""}</div>`;
  // The Hub is the only club overview; an old "gridiron-classic-overview" preference is ignored.
  views.Overview = hubView;
  // Draft room gains two sub-tabs for content that only the old Hub "Draft" tab had.
  const draftRoom = views.Draft;
  views.Draft = () =>
    `<div class="gd-toolbar fd-draft-tabs">${K.tabs([["room", "Draft room"], ["scouts", "Scout network"], ["pipeline", "Watchlist pipeline"]], draftTab, "Hub2.draftTab('$id')", { label: "Draft room sections" })}</div>${draftTab === "scouts" ? scoutNetwork() : draftTab === "pipeline" ? pipelineTab() : draftRoom()}`;
  // The coaching tree (and decision / press record) lives on Coach career.
  const careerView = views.Career;
  if (careerView) views.Career = () => careerView() + coachingSection();
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
    // Old Hub tab ids open the sidebar screen that owns that content; medical/training pick the
    // Medical & training sub-tab, media opens News & social on the fan network.
    tab(id) {
      if (id === "medical" || id === "training") {
        medTab = id;
        remember("gridiron-med-tab", id);
      }
      if (id === "draft" || id === "pipeline") draftTab = id === "pipeline" ? "pipeline" : "room";
      W.open(HUB_TAB_ROUTES[id] || "Overview");
      if (id === "media") window.Hub?.mediaTab?.("Fan network");
    },
    draftTab(id) {
      draftTab = ["room", "scouts", "pipeline"].includes(id) ? id : "room";
      render();
    },
    // Kept so old onclick handlers do nothing harmful.
    feedPage() {},
    unit() {},
    feed() {},
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
