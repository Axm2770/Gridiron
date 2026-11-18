// Gridiron Journal article reader and front-page card art (News & social → Newsroom).
// Views only: text comes from news-articles.mjs, visuals are pixel string templates (pixel faces,
// pixel-chart bars/sparklines, crests). Styles in news.css (na-* reader, nw-* card additions).
//
// articleView(s, a, nav)   full newspaper page: kicker, headline, byline + dateline, hero visual,
//                          drop-cap lead, body with a pull quote, analytics side column, Related strip
// articleHero(s, a, copy)  the hero visual: a registered feature visual (window.GDFeatureVisuals)
//                          or the generic one for the story kind
// cardArt(s, a)            small art for a front-page card when the story has no pixel card
import {
  articleCopy,
  relatedStories,
  featureVisual,
  storyKind,
  kindLabel,
  clubName,
  clubAbbr,
  recordText,
  divisionTable,
  statLine,
  keyMetric,
  metricLabel,
  teamForm,
} from "./news-articles.mjs";
import { pixelFace } from "../ui/pixel-face.mjs";
import { sparkline, hbar, meter, barChart } from "../ui/pixel-chart.mjs";
import { coachPixelAvatar, coachAppearance } from "./coach-avatar.mjs";
import { storyArt, teamColors } from "../presentation/pixel-art.mjs";

const esc = (v) => String(v ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
const fin = (v) => typeof v === "number" && Number.isFinite(v);
const n0 = (v) => (fin(v) ? v : 0);
const fmt = (v) => (fin(v) ? Math.round(v).toLocaleString("en-US") : "0");
const js = (v) => esc(JSON.stringify(String(v ?? "")).replace(/"/g, "'"));
const teamColor = (t) => {
  try {
    return teamColors(t).primary || "var(--gd-accent)";
  } catch {
    return "var(--gd-accent)";
  }
};
const money = (c) => `$${(n0(c) / 1e8).toFixed(1)}M`;

export function loadNewsStyles() {
  if (typeof document !== "undefined" && typeof document.querySelector === "function" && !document.querySelector('link[href="news.css"]')) document.head?.insertAdjacentHTML?.("beforeend", '<link rel="stylesheet" href="news.css">');
}

/* ------------------------------------------------------------------ bits */

// The classic scripts declare `clubs` and `logo` as globals (lexical, not window properties).
const CLUBS = () => (typeof clubs !== "undefined" ? clubs : globalThis.clubs);
const LOGO = () => (typeof logo === "function" ? logo : typeof globalThis.logo === "function" ? globalThis.logo : null);
const crest = (t, size = 40) => {
  if (!fin(t)) return "";
  const lg = LOGO() && CLUBS()?.[t] ? LOGO()(t) : `<b>${esc(CLUBS()?.[t]?.[0] || "")}</b>`;
  return `<span class="na-crest" style="--c:${size}px" data-club="${t}">${lg}</span>`;
};
const clubBtn = (s, t, label = clubName(s, t)) =>
  fin(t) ? `<button type="button" class="link club-link na-club" onclick="event.stopPropagation();W.club(${t})" title="Open the club profile">${esc(label)}</button>` : esc(label);
const playerBtn = (id, team, label) =>
  id ? `<button type="button" class="link na-plink" onclick="event.stopPropagation();W.player(${js(id)},${fin(team) ? team : "null"})">${esc(label)}</button>` : esc(label);
const face = (p, team, size = 40) => (p ? pixelFace(p, { size, team: fin(team) ? team : null }) : "");
const panel = (title, body, cls = "") => (body ? `<div class="na-panel ${cls}"><h3 class="na-panel-h">${esc(title)}</h3>${body}</div>` : "");
const chip = (text, tone = "") => `<span class="na-chip ${tone}">${esc(text)}</span>`;
const findP = (s, id) => {
  if (!id) return null;
  const own = (s.roster || []).find((p) => p.id === id);
  if (own) return { p: own, team: s.team };
  for (const [t, c] of (s.franchise?.clubs || []).entries()) {
    const p = (c.players || []).find((q) => q.id === id);
    if (p) return { p, team: t };
  }
  const fa = (s.agents || []).find((p) => p.id === id);
  return fa ? { p: fa, team: null } : null;
};

// Pixel scoreboard: crests, abbreviations and big digits.
function scoreboard(s, g, { label = "FINAL" } = {}) {
  const recs = Array.isArray(g.rec) ? g.rec : [],
    side = (t, pts, win, r = "") => `<div class="na-sb-side ${r} ${win ? "win" : ""}">${crest(t, 56)}<span class="na-sb-abbr">${esc(fin(t) ? clubAbbr(s, t) : "—")}</span><small>${esc(recs[r ? 1 : 0] || "")}</small><b class="na-sb-pts">${fmt(pts)}</b></div>`;
  const [x, y] = g.score;
  return `<div class="na-sb" role="img" aria-label="${esc(`${fin(g.a) ? clubName(s, g.a) : ""} ${x}, ${fin(g.b) ? clubName(s, g.b) : ""} ${y}`)}">${side(g.a, x, x > y)}<div class="na-sb-mid"><span>${esc(label)}</span>${g.phase === "playoffs" ? "<small>Playoffs</small>" : fin(g.week) ? `<small>Week ${g.week + 1}</small>` : ""}</div>${side(g.b, y, y > x, "r")}</div>`;
}
function linescore(s, g) {
  if (!g.periods) return "";
  const head = g.periods.map((_, i) => `<th>${i < 4 ? "Q" + (i + 1) : "OT"}</th>`).join("");
  const row = (k, t) => `<tr><th scope="row">${esc(fin(t) ? clubAbbr(s, t) : "—")}</th>${g.periods.map((q) => `<td>${fmt(q[k])}</td>`).join("")}<td class="na-ls-t">${fmt(g.score[k])}</td></tr>`;
  return `<table class="na-ls"><thead><tr><th></th>${head}<th>T</th></tr></thead><tbody>${row(0, g.a)}${row(1, g.b)}</tbody></table>`;
}
// Two-sided team stat bars: left club grows left, right club grows right.
function teamBars(s, g) {
  if (!g.box) return "";
  const rows = [["yards", "Total yards"], ["pass", "Passing"], ["rush", "Rushing"], ["first", "First downs"], ["turnovers", "Turnovers", true]];
  return `<div class="na-tb"><div class="na-tb-head"><span>${esc(clubAbbr(s, g.a))}</span><span>${esc(clubAbbr(s, g.b))}</span></div>${rows
    .map(([k, label, low]) => {
      const a = n0(g.box[0][k]),
        b = n0(g.box[1][k]),
        max = Math.max(1, a, b),
        better = low ? (a < b ? 0 : b < a ? 1 : -1) : a > b ? 0 : b > a ? 1 : -1;
      return `<div class="na-tb-row"><b class="${better === 0 ? "lead" : ""}">${fmt(a)}</b><span class="na-tb-bar l">${hbar(a, max, { tone: better === 0 ? "accent" : "muted", title: `${label} ${clubAbbr(s, g.a)} ${a}` })}</span><small>${esc(label)}</small><span class="na-tb-bar r">${hbar(b, max, { tone: better === 1 ? "accent" : "muted", title: `${label} ${clubAbbr(s, g.b)} ${b}` })}</span><b class="${better === 1 ? "lead" : ""}">${fmt(b)}</b></div>`;
    })
    .join("")}</div>`;
}
function performers(s, top = []) {
  if (!top.length) return "";
  return `<ul class="na-perf">${top
    .map((x) => {
      const f = findP(s, x.id);
      return `<li>${face(f?.p, x.team, 40)}<span>${playerBtn(x.id, x.team, x.name)}<small>${esc(x.pos)} · ${esc(clubAbbr(s, x.team))}</small><em>${esc(x.line)}</em></span></li>`;
    })
    .join("")}</ul>`;
}
function miniTable(s, rows, mark = []) {
  if (!rows.length) return "";
  return `<table class="na-mt"><thead><tr><th>Club</th><th>W-L</th><th>PF</th><th>PA</th></tr></thead><tbody>${rows
    .map((r) => `<tr class="${mark.includes(r.team) ? "me" : ""}"><td>${crest(r.team, 18)}${clubBtn(s, r.team, clubAbbr(s, r.team))}</td><td>${r.w}-${r.l}${r.t ? "-" + r.t : ""}</td><td>${fmt(r.pf)}</td><td>${fmt(r.pa)}</td></tr>`)
    .join("")}</tbody></table>`;
}
function formStrip(form = [], label = "Last results") {
  if (!form.length) return "";
  return `<div class="na-form" role="img" aria-label="${esc(label + ": " + form.join(" "))}">${form.map((r) => `<i class="na-f-${r}">${r}</i>`).join("")}</div>`;
}
// Player card: face, position, OVR, season line, key-stat sparkline.
function playerCard(s, p, team, { trail = [], season = {}, big = false } = {}) {
  if (!p) return "";
  const metric = keyMetric(p, season),
    values = trail.map((x) => n0(x[metric])),
    spark = values.length >= 2 ? sparkline(values, { w: 120, h: 28, cell: 2, tone: "accent", title: `${metricLabel(metric)} by week` }) : "",
    line = statLine(season);
  return `<div class="na-pcard ${big ? "big" : ""}">${face(p, team, big ? 96 : 64)}<div class="na-pc-id"><span class="na-pc-pos">${esc(p.pos)}</span>${playerBtn(p.id, team, p.name)}<small>${fin(team) ? esc(clubName(s, team)) : "Free agent"}${p.age ? ` · ${p.age} yrs` : ""}</small><div class="na-pc-ovr"><b>${fmt(p.ovr)}</b><span>OVR</span>${meter(n0(p.ovr), 99, { segments: 10, size: 7, tone: n0(p.ovr) >= 80 ? "good" : "accent", title: `${p.ovr} overall` })}</div></div>${line || spark ? `<div class="na-pc-stats">${line ? `<span>${esc(line)}</span>` : ""}${spark ? `<span class="na-spark">${spark}<small>${esc(metricLabel(metric))} by week</small></span>` : ""}</div>` : ""}</div>`;
}
// 11×21 pixel body with the injured region lit (same grid as the medical screen).
const BODY = { head: [[4, 0, 3, 3]], neck: [[5, 3, 1, 1]], shoulderL: [[1, 4, 2, 2]], shoulderR: [[8, 4, 2, 2]], chest: [[3, 4, 5, 3]], back: [[3, 7, 5, 3]], armL: [[1, 6, 2, 4]], armR: [[8, 6, 2, 4]], handL: [[1, 10, 2, 1]], handR: [[8, 10, 2, 1]], hips: [[3, 10, 5, 1]], thighL: [[3, 11, 2, 4]], thighR: [[6, 11, 2, 4]], kneeL: [[3, 15, 2, 1]], kneeR: [[6, 15, 2, 1]], shinL: [[3, 16, 2, 3]], shinR: [[6, 16, 2, 3]], ankleL: [[3, 19, 2, 1]], ankleR: [[6, 19, 2, 1]], footL: [[2, 20, 3, 1]], footR: [[6, 20, 3, 1]] };
const PARTS = { head: ["head"], concussion: ["head"], chest: ["chest"], rib: ["chest"], back: ["back"], shoulder: ["shoulderL"], arm: ["armL"], elbow: ["armL"], hand: ["handL"], wrist: ["handL"], hamstring: ["thighL"], thigh: ["thighL"], groin: ["hips"], hip: ["hips"], knee: ["kneeL"], acl: ["kneeL"], mcl: ["kneeL"], ankle: ["ankleL"], foot: ["footL"], toe: ["footL"], calf: ["shinL"], achilles: ["ankleL"] };
export function injuryRegions(part, diagnosis = "") {
  const text = `${part || ""} ${diagnosis || ""}`.toLowerCase();
  for (const [k, v] of Object.entries(PARTS)) if (text.includes(k)) return v;
  return ["chest", "back"];
}
function bodyFigure(part, diagnosis) {
  const hurt = injuryRegions(part, diagnosis);
  return `<svg class="na-body" viewBox="0 0 11 21" width="66" height="126" shape-rendering="crispEdges" role="img" aria-label="${esc(`Injury: ${diagnosis || part || "body"}`)}">${Object.entries(BODY)
    .map(([k, rs]) => rs.map(([x, y, w, h]) => `<rect x="${x}" y="${y}" width="${w}" height="${h}" class="${hurt.includes(k) ? "hurt" : ""}"/>`).join(""))
    .join("")}</svg>`;
}

/* ------------------------------------------------------------------ hero visuals */

function eventHero(s, a, e) {
  const rows = e.rows || [];
  switch (e.event) {
    case "bracket": {
      const conf = (c) => rows.filter((r) => r.conf === c);
      const col = (c, name) => `<div class="na-seeds"><h4>${name}</h4><ol>${conf(c).map((r) => `<li class="${r.team === s.team ? "me" : ""}"><b>${r.seed}</b>${crest(r.team, 20)}${clubBtn(s, r.team, clubAbbr(s, r.team))}<small>${esc(r.record)}${r.division ? " · div" : ""}</small></li>`).join("")}</ol></div>`;
      return `<div class="na-hero-ev na-bracket">${col(0, "AFC")}${col(1, "NFC")}</div>`;
    }
    case "awards":
      return `<ul class="na-list na-awards">${rows.slice(0, 8).map((r) => { const f = findP(s, r.playerId); return `<li>${f ? face(f.p, r.team, 40) : crest(r.team, 32)}<span><small>${esc(r.label)}</small>${r.playerId ? playerBtn(r.playerId, r.team, r.name) : `<b>${esc(r.name)}</b>`}<em>${fin(r.team) ? esc(clubName(s, r.team)) : ""}</em></span></li>`; }).join("")}</ul>`;
    case "deadline": {
      const tiles = `<dl class="na-cap na-tiles"><div><dt>Trades</dt><dd>${fmt(n0(e.trades))}</dd></div><div><dt>Your moves</dt><dd>${fmt(n0(e.mine))}</dd></div><div><dt>Cutoff</dt><dd>WK ${fmt(n0(e.week))}</dd></div><div><dt>Window</dt><dd>Closed</dd></div></dl>`;
      return rows.length ? tiles + eventHero(s, a, { ...e, event: "free-agency" }) : tiles;
    }
    case "free-agency":
      return `<ul class="na-list">${rows.slice(0, 6).map((r) => { const f = findP(s, r.playerId); return `<li>${face(f?.p || { id: r.playerId || r.name, name: r.name }, f?.team ?? r.to, 40)}<span>${playerBtn(r.playerId, f?.team ?? r.to, r.name)}<small>${esc(r.pos)}${fin(r.ovr) ? ` · ${r.ovr} OVR` : ""}${fin(r.age) ? ` · ${r.age} yrs` : ""}</small>${e.event === "deadline" && fin(r.to) ? `<em>${fin(r.from) ? esc(clubAbbr(s, r.from)) + " → " : ""}${esc(clubAbbr(s, r.to))}</em>` : ""}</span>${fin(r.ovr) ? meter(r.ovr, 99, { segments: 8, size: 6, title: `${r.ovr} overall` }) : ""}</li>`; }).join("") || `<li class="na-none">No moves yet.</li>`}</ul>`;
    case "draft":
      return `<ol class="na-list na-picks">${rows.map((r) => { const f = findP(s, r.playerId); return `<li><b class="na-pick">#${r.overall}</b>${crest(r.team, 28)}<span>${r.name ? playerBtn(r.playerId, r.team, r.name) : `<b>${esc(clubName(s, r.team))}</b>`}<small>${r.name ? `${esc(r.pos)} · ${esc(clubAbbr(s, r.team))}` : `Round ${r.round} · on the clock`}</small></span>${f ? face(f.p, r.team, 32) : ""}</li>`; }).join("")}</ol>`;
    case "champion":
      return `<div class="na-hero-ev na-champ">${crest(e.team, 96)}<div><span class="na-banner">Champions</span><b>${esc(clubName(s, e.team))}</b>${e.score ? `<small>${Math.max(...e.score)}–${Math.min(...e.score)}${fin(e.opp) ? ` over the ${esc(clubName(s, e.opp))}` : ""}</small>` : ""}</div></div>`;
    case "anniversary":
      return coachHero(s, e);
    default:
      return "";
  }
}
function coachHero(s, c = {}) {
  const wins = n0(c.wins),
    losses = n0(c.losses),
    total = Math.max(1, wins + losses);
  return `<div class="na-hero-ev na-coach"><span class="na-coach-face">${coachPixelAvatar(coachAppearance(s), { label: s.coach?.name || "Head coach", seed: "coach" })}</span><div><b>${esc(s.coach?.name || "Head coach")}</b><small>${esc(clubName(s, s.team))} head coach</small><div class="na-coach-rec"><span>${fmt(wins)}-${fmt(losses)}${c.ties ? "-" + c.ties : ""}</span>${hbar(wins, total, { tone: "good", title: `${wins} wins of ${total}` })}<small>${Math.round((wins / total) * 100)}% wins · ${fmt(n0(c.playoffWins))} playoff wins · ${fmt(n0(c.titles))} titles</small></div></div></div>`;
}
function milestoneHero(s, a, copy) {
  const f = copy.facts,
    m = f.milestone || {};
  if (["player", "season", "games", "record"].includes(m.type) || (!m.type && f.player)) {
    const target = m.record?.value > n0(m.value) ? m.record.value : m.next;
    const big = fin(m.value) ? `<div class="na-ms-num"><span class="na-ms-label">${esc(m.type === "games" ? "career games" : m.type === "season" ? `${metricLabel(m.metric)} · ${a.year}` : m.type === "record" ? "new record" : "career " + metricLabel(m.metric))}</span><b>${fmt(m.value)}</b>${fin(target) && target > m.value ? `<span class="na-ms-next">${meter(m.value, target, { segments: 12, size: 8, tone: "accent", title: `${fmt(m.value)} of ${fmt(target)}` })}<small>${fmt(target - m.value)} to ${fmt(target)}${m.record?.value === target ? " (league record)" : ""}</small></span>` : ""}</div>` : "";
    return `<div class="na-hero-ms">${playerCard(s, f.player, f.playerTeam, { trail: f.trail, season: f.season, big: true })}${big}</div>`;
  }
  if (m.type === "streak" || m.type === "wins10") {
    const team = m.team ?? f.team;
    return `<div class="na-hero-ev na-streak">${crest(team, 72)}<div><span class="na-banner ${m.losing ? "bad" : ""}">${m.type === "wins10" ? "10 wins" : `${m.length} ${m.losing ? "losses" : "wins"} in a row`}</span><b>${esc(clubName(s, team))}</b><small>${esc(m.record || recordText(s, team))}</small>${formStrip((m.form || teamForm(s, team)).slice(-12), "Season results")}</div></div>`;
  }
  if (m.type === "coach") return coachHero(s, m);
  return "";
}
function transactionHero(s, a, copy) {
  const f = copy.facts,
    mv = f.move,
    p = f.player,
    from = mv && fin(mv.from) ? mv.from : fin(a.card?.from) ? a.card.from : fin(a.otherTeam) ? a.otherTeam : null,
    to = mv && fin(mv.to) ? mv.to : fin(f.playerTeam) ? f.playerTeam : fin(a.team) ? a.team : null,
    type = mv?.type || f.via || "move",
    c = f.contract;
  const trade = f.trade?.length
    ? `<ul class="na-list na-trade">${f.trade.map((e) => { const q = findP(s, e.playerId); return `<li>${face(q?.p, e.to, 32)}<span>${playerBtn(e.playerId, e.to, e.name)}<small>${esc(e.pos)}${fin(e.ovr) ? ` · ${e.ovr} OVR` : ""}</small><em>${esc(clubAbbr(s, e.from))} → ${esc(clubAbbr(s, e.to))}</em></span></li>`; }).join("")}</ul>`
    : "";
  if (!p && !trade) return "";
  const capRow = f.tradeCap && (f.tradeCap.in || f.tradeCap.out) ? `<dl class="na-cap"><div><dt>Cap in</dt><dd>${money(f.tradeCap.in)}</dd></div><div><dt>Cap out</dt><dd>${money(f.tradeCap.out)}</dd></div><div><dt>Net</dt><dd>${f.tradeCap.in - f.tradeCap.out > 0 ? "+" : ""}${money(f.tradeCap.in - f.tradeCap.out)}</dd></div><div><dt>Players</dt><dd>${fmt(f.trade.length)}</dd></div></dl>` : "";
  return `<div class="na-tx">${p ? `<div class="na-tx-move">${fin(from) ? crest(from, 48) : `<span class="na-tx-src">${esc(type === "drafted" ? "Draft" : type === "signed" ? "FA" : "—")}</span>`}<span class="na-tx-arrow" aria-hidden="true">▶</span>${face(p, to, 72)}<span class="na-tx-arrow" aria-hidden="true">▶</span>${fin(to) ? crest(to, 48) : ""}</div><div class="na-tx-id"><span class="na-chip">${esc(String(type).toUpperCase())}</span>${playerBtn(p.id, to, p.name)}<small>${esc(p.pos)} · ${fmt(p.ovr)} OVR${p.age ? ` · ${p.age} yrs` : ""}</small></div>` : ""}${c ? `<dl class="na-cap"><div><dt>Years</dt><dd>${fmt(c.years)}</dd></div><div><dt>Through</dt><dd>${esc(c.through)}</dd></div><div><dt>Cap hit</dt><dd>${money(c.capHit)}</dd></div><div><dt>Total</dt><dd>${money(c.total)}</dd></div></dl>` : ""}${trade}${capRow}</div>`;
}
function injuryHero(s, a, copy) {
  const f = copy.facts,
    inj = f.injury || {},
    weeks = n0(inj.weeks),
    p = f.player,
    left = p && fin(p.injury) ? p.injury : weeks;
  return `<div class="na-inj">${bodyFigure(inj.part, inj.diagnosis)}<div class="na-inj-info">${p ? `<div class="na-inj-id">${face(p, f.playerTeam, 48)}<span>${playerBtn(p.id, f.playerTeam, p.name)}<small>${esc(p.pos)} · ${fmt(p.ovr)} OVR</small></span></div>` : ""}<span class="na-cap-l">Diagnosis</span><b class="na-inj-dx">${esc(inj.diagnosis || "Injury")}</b><span class="na-cap-l">Weeks out at report</span><div class="na-weeks">${meter(Math.min(weeks, 12), 12, { segments: 12, size: 10, tone: weeks >= 6 ? "bad" : weeks >= 3 ? "warn" : "good", title: `${weeks} weeks` })}<b>${weeks ? fmt(weeks) : "—"}</b></div>${p ? `<small class="na-inj-now">${left > 0 ? `${plural(left, "week")} remaining now` : "Cleared to return"}</small>` : ""}</div></div>`;
}
const plural = (n, w) => `${fmt(n)} ${n === 1 ? w : w + "s"}`;

// The article's hero visual. A `feature` story asks window.GDFeatureVisuals[type] first.
export function articleHero(s, a, copy = articleCopy(s, a), registry = globalThis.GDFeatureVisuals) {
  const custom = featureVisual(a, registry);
  if (custom) return `<div class="na-hero-feature">${custom}</div>`;
  const f = copy.facts;
  switch (f.kind) {
    case "match":
    case "result":
      return f.game ? `${scoreboard(s, f.game)}${linescore(s, f.game)}` : genericHero(s, a);
    case "milestone":
      return milestoneHero(s, a, copy) || genericHero(s, a);
    case "event":
      return eventHero(s, a, f.event || {}) || genericHero(s, a);
    case "injury":
      return injuryHero(s, a, copy);
    case "transaction":
      return transactionHero(s, a, copy) || genericHero(s, a);
    default:
      if (f.player) return playerCard(s, f.player, f.playerTeam, { trail: f.trail, season: f.season, big: true });
      return genericHero(s, a);
  }
}
function genericHero(s, a) {
  const art = safeStoryArt(a, s);
  if (art) return `<div class="na-hero-art">${art}</div>`;
  if (fin(a.team) && fin(a.otherTeam) && a.team !== a.otherTeam) return `<div class="na-hero-ev na-vs">${crest(a.team, 72)}<b>VS</b>${crest(a.otherTeam, 72)}</div>`;
  return fin(a.team) ? `<div class="na-hero-ev na-vs">${crest(a.team, 88)}<div><span class="na-banner">${esc(kindLabel(storyKind(a)))}</span><b>${esc(clubName(s, a.team))}</b><small>${esc(recordText(s, a.team))}</small></div></div>` : "";
}
const safeStoryArt = (a, s) => {
  try {
    return storyArt(a, s) || "";
  } catch {
    return "";
  }
};

/* ------------------------------------------------------------------ side analytics */

function sideColumn(s, a, copy) {
  const divTitle = a.year === s.year && a.week === s.week ? "Division" : "Division · today",
    f = copy.facts,
    out = [];
  if ((f.kind === "match" || f.kind === "result") && f.game) {
    out.push(panel("Team stats", teamBars(s, f.game)));
    out.push(panel("Top performers", performers(s, f.game.top)));
    const t = f.kind === "match" ? f.team : f.winner;
    out.push(panel(divTitle, miniTable(s, divisionTable(s, t), [s.team, f.game.a, f.game.b].filter(fin))));
  } else if (f.kind === "milestone") {
    const m = f.milestone || {},
      team = fin(m.team) ? m.team : f.team;
    if (f.player && m.type !== "streak") {
      const wk = f.trail || [],
        metric = m.metric && m.metric !== "games" ? m.metric : keyMetric(f.player, f.season);
      if (wk.length >= 2)
        out.push(panel(`${metricLabel(metric)} by week`, barChart(wk.map((x, i) => ({ label: "W" + (i + 1), values: [n0(x[metric])] })).slice(-10), { series: [{ label: metricLabel(metric), tone: "accent" }], h: 72, title: `${metricLabel(metric)} by week` })));
    }
    if (fin(team) && s.teams?.[team]) {
      out.push(panel("Form", formStrip(teamForm(s, team).slice(-10), "Last ten results")));
      out.push(panel(divTitle, miniTable(s, divisionTable(s, team), [team])));
    }
  } else if (f.kind === "event" && f.event?.event === "bracket") {
    const me = (f.event.rows || []).find((r) => r.team === s.team);
    if (me) out.push(panel("Your seed", `<p class="na-big">No. ${me.seed}</p>`));
  } else if (f.player) {
    const season = f.season || {},
      stats = [["Pass yds", season.passYards], ["Rush yds", season.rushYards], ["Rec yds", season.recYards], ["TD", n0(season.passTD) + n0(season.rushTD) + n0(season.recTD)], ["Tackles", season.tackles], ["Sacks", season.sacks]].filter(([, v]) => n0(v) > 0);
    if (stats.length) out.push(panel(`${a.year ?? s.year} season`, `<dl class="na-stats">${stats.slice(0, 4).map(([k, v]) => `<div><dt>${k}</dt><dd>${fmt(v)}</dd></div>`).join("")}</dl>`));
    if (fin(f.playerTeam) && s.teams?.[f.playerTeam]) out.push(panel(divTitle, miniTable(s, divisionTable(s, f.playerTeam), [f.playerTeam])));
  } else if (fin(f.team) && s.teams?.[f.team]) {
    out.push(panel("Form", formStrip(teamForm(s, f.team).slice(-10), "Last ten results")));
    out.push(panel(divTitle, miniTable(s, divisionTable(s, f.team), [f.team])));
  }
  return out.filter(Boolean).join("");
}

/* ------------------------------------------------------------------ cards */

// Front-page card art when the story has no jersey/coach/portrait card.
export function cardArt(s, a) {
  const art = safeStoryArt(a, s);
  if (art) return art;
  const kind = storyKind(a),
    d = a.data || {};
  if ((kind === "match" || kind === "result") && Array.isArray(d.score)) {
    // A match report reads from your side (your score first); a league result from the winner's.
    const k = kind === "match" ? (d.side ?? 0) : d.score[0] >= d.score[1] ? 0 : 1,
      [t1, t2] = k === 0 ? [d.a, d.b] : [d.b, d.a];
    return `<span class="nw-mini-sb">${crest(t1, 40)}<b>${fmt(d.score[k])}<i>–</i>${fmt(d.score[1 - k])}</b>${crest(t2, 40)}</span>`;
  }
  if (kind === "milestone" && fin(d.value)) {
    const f = findP(s, d.playerId);
    return `<span class="nw-mini-ms">${f ? face(f.p, f.team, 56) : crest(d.team, 48)}<span><b>${fmt(d.type === "streak" ? d.length : d.type === "coach" ? d.threshold : d.value)}</b><small>${esc(d.type === "streak" ? "in a row" : d.type === "coach" ? (d.metric === "wins" ? "career wins" : d.metric) : metricLabel(d.metric))}</small></span></span>`;
  }
  if (kind === "milestone" && (d.type === "streak" || d.type === "wins10")) return `<span class="nw-mini-ms">${crest(d.team, 48)}<span><b>${d.type === "wins10" ? 10 : fmt(d.length)}</b><small>${d.type === "wins10" ? "wins" : d.losing ? "losses in a row" : "wins in a row"}</small></span></span>`;
  if (kind === "milestone" && d.type === "coach") return `<span class="nw-mini-ms"><span class="na-coach-face sm">${coachPixelAvatar(coachAppearance(s), { label: s.coach?.name || "Coach", seed: "coach" })}</span><span><b>${fmt(d.threshold)}</b><small>${esc(d.metric === "wins" ? "career wins" : d.metric === "playoffWins" ? "playoff wins" : "titles")}</small></span></span>`;
  if (kind === "event") {
    const rows = d.rows || [],
      first = rows[0],
      fp = first?.playerId ? findP(s, first.playerId) : null,
      big = (lead, value, label) => `<span class="nw-mini-ms">${lead}<span><b>${esc(value)}</b><small>${esc(label)}</small></span></span>`;
    switch (d.event) {
      case "deadline":
        return big(`<span class="nw-mini-ic">⏱</span>`, fmt(n0(d.trades)), n0(d.trades) === 1 ? "trade" : "trades");
      case "free-agency":
        return big(fp ? face(fp.p, null, 48) : `<span class="nw-mini-ic">✍</span>`, fmt(n0(d.count)), "free agents");
      case "draft":
        return big(fin(first?.team) ? crest(first.team, 44) : `<span class="nw-mini-ic">#1</span>`, `${fmt(n0(d.picks))}`, d.done ? "picks made" : "picks");
      case "awards":
        return big(fp ? face(fp.p, fp.team, 48) : fin(first?.team) ? crest(first.team, 44) : `<span class="nw-mini-ic">★</span>`, first?.award || "★", first?.name || "Awards");
      case "bracket":
        return big(`<span class="nw-mini-ic">⚑</span>`, "14", "playoff clubs");
      case "champion":
        return big(crest(d.team, 48), "♛", "Champions");
      case "anniversary":
        return big(`<span class="na-coach-face sm">${coachPixelAvatar(coachAppearance(s), { label: s.coach?.name || "Coach", seed: "coach" })}</span>`, `Y${fmt(n0(d.seasons) + 1)}`, "in charge");
      default:
        return `<span class="nw-mini-ev">${fin(a.team) ? crest(a.team, 44) : ""}<b>▣</b></span>`;
    }
  }
  if (kind === "injury") return `<span class="nw-mini-inj">${bodyFigure(d.part, d.diagnosis)}${fin(d.weeks) ? `<b>${fmt(d.weeks)}<small>wks</small></b>` : ""}</span>`;
  return "";
}

/* ------------------------------------------------------------------ reader */

// Scores and records (28–24, 11-6) never break across lines.
const keepScores = (html) => html.replace(/(\d)[-–](\d)/g, "$1‑$2");
// Newspaper lead-in: the opening words in bold small caps, so the first sentence is never split
// apart (a boxed single-letter drop cap read as "he Cowboys…").
function withInitial(text) {
  const s = String(text ?? ""),
    m = s.match(/^((?:\S+\s+){1,3}?\S+?)(?=\s)/),
    words = m && m[1].length <= 34 ? m[1] : "";
  if (!words) return keepScores(esc(s));
  return `<span class="na-leadin">${keepScores(esc(words))}</span>${keepScores(esc(s.slice(words.length)))}`;
}
// nav: { list (stories in the current view, ordered), all (every story, for Related), actions (HTML) }
export function articleView(s, a, { list = [], all = list, actions = "" } = {}) {
  loadNewsStyles();
  const copy = articleCopy(s, a),
    i = list.findIndex((x) => x.id === a.id),
    prev = i > 0 ? list[i - 1] : null,
    next = i >= 0 && i < list.length - 1 ? list[i + 1] : null,
    related = relatedStories(all, a, 4),
    by = copy.byline,
    reporter = pixelFace({ id: by.id, name: by.name }, { size: 40, label: by.name }),
    team = fin(copy.facts.team) ? copy.facts.team : fin(a.team) ? a.team : null,
    paras = copy.paragraphs,
    quoteAt = Math.min(2, paras.length),
    quote = copy.quote ? `<blockquote class="na-quote"><p>“${esc(copy.quote.text)}”</p><cite>— ${esc(copy.quote.by)}${copy.quote.role ? `, <span>${esc(copy.quote.role)}</span>` : ""}</cite></blockquote>` : "",
    body = paras.map((p, k) => (k === quoteAt ? quote : "") + `<p>${keepScores(esc(p))}</p>`).join("") + (quoteAt >= paras.length ? quote : ""),
    side = sideColumn(s, a, copy),
    hero = articleHero(s, a, copy);
  const navBtn = (x, dir) =>
    x ? `<button class="secondary small na-step" onclick="Office.storyStep(${dir})" title="${esc(x.title)}">${dir < 0 ? "◀ Previous" : "Next ▶"}</button>` : `<button class="secondary small na-step" disabled>${dir < 0 ? "◀ Previous" : "Next ▶"}</button>`;
  const rel = related.length
    ? `<div class="na-related" role="region" aria-label="Related stories"><h3 class="na-panel-h">Related</h3><div class="na-rel-row">${related
        .map((r) => `<button class="na-rel" onclick="Office.readStory(${js(r.id)})"><span class="na-rel-art">${cardArt(s, r) || crest(r.team, 36)}</span><span class="na-rel-copy"><small>${esc(kindLabel(storyKind(r)))} · ${r.year} W${n0(r.week) + 1}</small><b>${esc(r.title)}</b></span></button>`)
        .join("")}</div></div>`
    : "";
  return `<div class="na-reader" id="na-reader" tabindex="-1" data-story="${esc(a.id)}" style="${fin(team) ? `--na-team:${teamColor(team)}` : ""}">
<div class="na-bar"><button class="secondary small na-back" onclick="Office.closeStory()" aria-label="Back to the front page">← Front page</button><span class="na-pos">${i >= 0 ? `Story ${i + 1} of ${list.length}` : ""}<small>← → to turn pages · Esc to close</small></span><span class="na-nav">${navBtn(prev, -1)}${navBtn(next, 1)}</span></div>
<div class="na-page" role="article" aria-labelledby="na-h">
<div class="na-head"><div class="na-kick"><span class="na-kicker">${esc(copy.kicker)}</span>${a.feature && copy.kicker !== "Feature" ? chip("Feature", "feat") : ""}${String(a.category || "News").toLowerCase() === String(copy.kicker).toLowerCase() ? "" : chip(a.category || "News")}${fin(team) ? `<span class="na-team">${crest(team, 18)}${clubBtn(s, team, clubName(s, team))}</span>` : ""}<button class="icon-button na-save ${a.bookmarked ? "on" : ""}" aria-label="${a.bookmarked ? "Unsave" : "Save"} story" onclick="Office.storyBookmark(${js(a.id)})">${a.bookmarked ? "★" : "☆"}</button></div>
<h1 id="na-h" class="na-headline">${esc(copy.headline)}</h1>${copy.deck ? `<p class="na-deck">${esc(copy.deck)}</p>` : ""}
<div class="na-byline">${reporter}<span><b>By ${esc(by.name)}</b><small>${esc(by.beat)} · ${esc(by.outlet)}</small></span><span class="na-dateline">${esc(copy.dateline.text)}</span></div></div>
<div class="na-cols${side ? "" : " solo"}"><div class="na-main">${hero ? `<figure class="na-hero">${hero}</figure>` : ""}<div class="na-text"><p class="na-lead">${withInitial(copy.lead)}</p>${body}</div>${actions ? `<div class="na-actions">${actions}</div>` : ""}</div>${side ? `<div class="na-side" role="complementary" aria-label="Analytics">${side}</div>` : ""}</div>
${rel}</div></div>`;
}
