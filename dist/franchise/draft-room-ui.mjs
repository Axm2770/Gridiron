// The Draft room route (W.open('Draft')): a pixel "war room" before the draft, an on-the-clock
// desk while it runs and a class summary afterwards. View only: every button calls the handlers
// the room always used (F.action draftStart / draftPick / tradeDown, Hub.* board controls,
// Recruit.report, and the live-draft Ops.* actions). Styles live in draft.css.
import * as S from "./state.mjs";
import { hubPreferences, teamNeeds, draftBoard } from "./front-office.mjs";
import { previewAttributes, positionBadge } from "./player-ui.mjs";
import { heightLabel, paginate } from "./player-catalog.mjs";
import { marketWindows, projectedSlot } from "./market.mjs";
import { tradeDownOffers, tradeUpQuote } from "./draft-room.mjs";
import { draftClassSummary } from "./draft-summary.mjs";
import { pixelFace } from "../ui/pixel-face.mjs";

export const BOARD_PAGE = 12;
const POSITIONS = ["All", ...new Set(S.POS)];
const SORTS = [
  ["estimate", "Scouted ability"],
  ["need", "Team need"],
  ["confidence", "Report confidence"],
  ["board", "My board order"],
];
const h = (v) => (typeof esc === "function" ? esc(v) : String(v ?? "").replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`));
const arg = (x) => h(JSON.stringify(x));
const abbr = (t) => clubs[t]?.[0] ?? "—";
const clubName = (t) => clubs[t]?.[2] ?? `Team ${t + 1}`;
const fmt = (n) => (Number.isFinite(n) ? n.toLocaleString("en-US") : "—");
const pad = (n, w = 3) => String(n).padStart(w, "0");

// Ability ranges are drawn on a 40–99 scale; the potential band sits behind the current one.
const pct = (v) => Math.max(0, Math.min(100, ((v - 40) / 59) * 100));
const bounds = (label) => {
  const [a, b = a] = String(label).split("–").map(Number);
  return [Number.isFinite(a) ? a : 40, Number.isFinite(b) ? b : a];
};
const band = (cls, [lo, hi]) => `<i class="${cls}" style="left:${pct(lo).toFixed(1)}%;width:${Math.max(3, pct(hi) - pct(lo)).toFixed(1)}%"></i>`;
const rangeBar = (x) => `<span class="dr-range" aria-hidden="true">${band("dr-range-pot", bounds(x.potentialLabel))}${band("dr-range-now", bounds(x.ratingLabel))}</span>`;
// Segmented pixel meter: `cells` squares, filled in proportion to value / max.
export const blocks = (value, max, cells = 10, tone = "") => {
  const n = Math.round(Math.max(0, Math.min(1, max ? value / max : 0)) * cells);
  return `<span class="dr-blocks ${tone}" aria-hidden="true">${Array.from({ length: cells }, (_, i) => `<i${i < n ? ' class="on"' : ""}></i>`).join("")}</span>`;
};
const gradeTone = (g) => (/^A/.test(g) ? "good" : /^B/.test(g) ? "ok" : /^C/.test(g) ? "warn" : "bad");

export function draftRoomView({ filters, busy = () => false }) {
  const f = state.franchise,
    d = f.draft?.year === state.year ? f.draft : null,
    pick = d?.picks[d.cursor],
    own = pick?.team === state.team,
    done = !!d && !pick,
    canScout = S.allowed(state, "scout"),
    off = (area) => (busy() || (area && !S.allowed(state, area)) ? "disabled" : ""),
    btn = (text, code, { area = "", tone = "", label = "" } = {}) => `<button class="${tone} small" onclick="${code}" ${off(area)}${label ? ` aria-label="${h(label)}"` : ""}>${text}</button>`,
    windows = marketWindows(state),
    pins = hubPreferences(state).board.filter((id) => state.prospects.some((p) => p.id === id)),
    all = draftBoard(state, filters),
    rows = filters.scouted ? all.filter((x) => f.reports[x.p.id]) : all,
    page = paginate(rows, filters.page, BOARD_PAGE),
    best = draftBoard(state)[0]?.p.id,
    topPin = pins[0],
    mine = (d?.picks || []).map((p, i) => ({ ...p, index: i })).filter((p) => p.team === state.team),
    next = d ? mine.find((p) => p.index >= d.cursor) : null;
  filters.page = page.page;

  /* ---------------------------------------------------------------- header */
  const status = done ? "Draft complete" : pick ? (own ? "You're on the clock" : `Round ${pick.round} under way`) : windows.draft.open ? "Draft day is here" : "Scouting season";
  const left = d ? mine.filter((p) => p.index >= d.cursor).length : 0,
    headLine = done ? "All seven rounds are complete. Your class is below." : pick ? `${d.live ? "Live draft" : "Quick draft"} · pick ${d.cursor + 1} of ${d.picks.length} · ${left} selection${left === 1 ? "" : "s"} left for you.` : windows.draft.detail;
  const startButtons = state.phase === "offseason" && !d ? `${btn("Open seven-round draft", "F.action('draftStart')", { area: "scout" })}${btn("Run it live", "Ops.draft('start')", { area: "scout", tone: "secondary", label: "Run the draft live, one pick at a time" })}` : "";
  const meters = [
    ["Scouting points", f.scoutPoints, blocks(f.scoutPoints, 20, 10), "+5 a week"],
    ["Private visits", `${f.visits.length}/30`, blocks(f.visits.length, 30, 10, "good"), "Before the draft"],
    ["Pinned targets", pins.length, blocks(Math.min(pins.length, 10), 10, 10, "warn"), "My board"],
  ];
  const head = `<section class="dr-head"><div class="dr-head-title"><span class="dr-kicker">WAR ROOM · ${state.year + 1} DRAFT</span><h2>${h(status)}</h2><p>${h(headLine)}</p></div><div class="dr-meters">${meters.map(([k, v, bar, note]) => `<div class="dr-meter"><span>${k}</span><b>${v}</b>${bar}<small>${note}</small></div>`).join("")}</div>${startButtons ? `<div class="dr-head-actions">${startButtons}</div>` : ""}</section>`;

  /* ----------------------------------------------------------- on the clock */
  let clock = "";
  if (pick) {
    const away = next ? next.index - d.cursor : null,
      total = d.picks.length,
      progress = Math.round((d.cursor / total) * 100),
      liveControls = !own ? `${btn("Next pick", "Ops.draft('next')", { tone: "secondary" })}${btn("Sim to my pick", "Ops.draft('sim')")}` : "";
    clock = `<section class="dr-clock ${own ? "mine" : ""}" style="--clock-team:var(--team)"><div class="dr-clock-slot"><span>PICK</span><b>${pad(d.cursor + 1)}</b><small>ROUND ${pick.round}</small></div><div class="dr-clock-team">${logo(pick.team)}<span><small>${own ? "THE PICK IS IN YOUR HANDS" : "ON THE CLOCK"}</small><b>${h(clubs[pick.team][1] + " " + clubName(pick.team))}</b>${pick.original !== pick.team ? `<em>via ${h(abbr(pick.original))}</em>` : ""}</span></div><div class="dr-clock-next"><span>YOUR NEXT PICK</span><b>${next ? `#${next.index + 1}` : "—"}</b><small>${next ? (away ? `${away} pick${away === 1 ? "" : "s"} away` : "Now") : "No picks left"}</small></div><div class="dr-clock-actions">${own ? `<span class="dr-live-dot">● ${d.live ? "LIVE" : "YOUR PICK"}</span><small>Choose from the board below.</small>${d.live ? "" : btn("Trade down", "F.action('tradeDown')", { area: "scout", tone: "secondary", label: "Trade down with the next club in this round" })}` : liveControls}</div><div class="dr-clock-progress" role="progressbar" aria-label="Draft progress" aria-valuenow="${progress}" aria-valuemin="0" aria-valuemax="100"><i style="width:${progress}%"></i><small>${d.cursor} of ${total} picks made</small></div></section>`;
  }

  /* ---------------------------------------------------------- draft capital */
  let tokens;
  if (d) {
    tokens = mine.map((p) => {
      const used = p.index < d.cursor,
        who = used && p.player ? S.roster(state).find((x) => x.id === p.player) : null;
      return `<div class="dr-token ${used ? "used" : p === next ? "next" : ""}"><small>R${p.round}</small><b>#${p.index + 1}</b><span>${who ? h(who.name.split(" ").slice(-1)[0]) : used ? "Made" : p.original !== state.team ? `via ${h(abbr(p.original))}` : "Own"}</span></div>`;
    });
  } else {
    const ledger = (f.pickLedger || []).filter((x) => x.year === state.year + 1 && x.owner === state.team).sort((a, b) => a.round - b.round),
      list = ledger.length ? ledger : Array.from({ length: 7 }, (_, i) => ({ year: state.year + 1, round: i + 1, original: state.team }));
    tokens = list.map((p) => `<div class="dr-token projected"><small>R${p.round}</small><b>~#${projectedSlot(state, p)}</b><span>${p.original !== state.team ? `via ${h(abbr(p.original))}` : "Projected"}</span></div>`);
  }
  const capital = `<section class="dr-capital"><div class="dr-section-label"><span>YOUR PICKS</span><small>${d ? `${mine.filter((p) => p.index >= d.cursor).length} remaining` : "Order set when the draft opens"}</small></div><div class="dr-tokens">${tokens.join("") || '<p class="dr-muted">You hold no selections in this draft.</p>'}</div>${d ? "" : `<button class="link" onclick="W.open('League')">Future picks →</button>`}</section>`;

  /* ---------------------------------------------------------------- ticker */
  let ticker = "";
  if (d) {
    const items = d.live && d.ticker?.length
      ? d.ticker.slice(0, 4).map((t) => ({ slot: t.slot, team: t.team, name: t.name, pos: t.pos, grade: t.grade }))
      : d.log.map((l, i) => ({ ...l, slot: i + 1 })).slice(-4).reverse();
    ticker = `<section class="dr-ticker"><div class="dr-section-label"><span>PICK FEED</span><small>${items.length ? "Latest first" : ""}</small></div>${items.length ? `<ol>${items.map((t) => `<li class="${t.team === state.team ? "me" : ""}"><span class="dr-ticker-slot">#${t.slot}</span>${logo(t.team)}<span class="dr-ticker-name" title="${h(t.name)}"><b>${h(t.name)}</b><small>${h(t.pos)} · ${h(abbr(t.team))}</small></span>${t.grade ? `<span class="dr-grade ${gradeTone(t.grade)}" title="Analyst grade">${h(t.grade)}</span>` : ""}</li>`).join("")}</ol>` : '<p class="dr-muted">Selections appear here as they are made.</p>'}</section>`;
  }

  /* ---------------------------------------------------------- class summary */
  let summary = "";
  if (done) {
    const byId = new Map();
    for (let t = 0; t < 32; t++) for (const p of S.roster(state, t) || []) byId.set(p.id, p);
    const drafted = d.picks.map((p, i) => ({ slot: i + 1, team: p.team, round: p.round, id: p.player, ovr: byId.get(p.player)?.ovr })).filter((x) => x.id),
      s = draftClassSummary(drafted, state.team, d.ticker || []);
    summary = `<section class="dr-summary"><div class="dr-summary-grade"><span>CLASS GRADE</span><b class="dr-grade big ${gradeTone(s.grade || "C")}">${h(s.grade || "—")}</b><small>${s.picks.length} selection${s.picks.length === 1 ? "" : "s"}</small></div><div class="dr-summary-picks">${s.picks.map((x) => {
      const p = byId.get(x.id);
      return p ? `<button class="dr-class-card" ${previewAttributes(p, state.team)} onclick="W.player(${arg(p.id)},${state.team})">${pixelFace(p, { size: 44, team: state.team })}<span><small>R${x.round} · #${x.slot}</small><b>${h(p.name)}</b><em>${h(p.pos)} · ${h(p.college || "College unrecorded")}</em></span><span class="dr-grade ${gradeTone(x.grade)}" title="${x.source === "analyst" ? "Analyst grade on draft day" : "Value grade: slot against ability rank in this class"}">${h(x.grade)}</span></button>` : "";
    }).join("") || '<p class="dr-muted">You made no selections in this draft.</p>'}</div></section>`;
  }

  /* ----------------------------------------------------------------- board */
  const pickCode = (id) => (d?.live ? `Ops.pick(${arg(id)})` : `F.action('draftPick',${arg(id)})`);
  const boardRows = page.rows.map((x) => {
    const p = x.p,
      rank = pins.indexOf(p.id) + 1,
      tags = [p.id === best ? '<span class="dr-tag best">BEST AVAILABLE</span>' : "", pick && p.id === topPin ? '<span class="dr-tag top">TOP OF BOARD</span>' : ""].join("");
    return `<tr class="${x.pinned ? "pinned" : ""} ${p.id === best && pick ? "best" : ""}"><td class="dr-col-rank"><button class="dr-pin ${x.pinned ? "on" : ""}" aria-label="${x.pinned ? "Unpin" : "Pin"} ${h(p.name)}" aria-pressed="${x.pinned}" onclick="Hub.pin(${arg(p.id)})">${x.pinned ? "★" : "☆"}</button>${x.pinned ? `<span class="dr-order"><b>${rank}</b><button aria-label="Move ${h(p.name)} up board" onclick="Hub.rank(${arg(p.id)},-1)">▲</button><button aria-label="Move ${h(p.name)} down board" onclick="Hub.rank(${arg(p.id)},1)">▼</button></span>` : ""}</td><td class="dr-col-player"><button class="dr-prospect" ${previewAttributes(p, -2)} onclick="W.player(${arg(p.id)},-2)">${pixelFace(p, { size: 40 })}<span><b>${h(p.name)}</b><small>${h(p.college || "College unrecorded")} · ${p.age} yrs</small>${tags}</span></button></td><td>${positionBadge(p)}</td><td class="dr-col-range"><span class="dr-range-label"><b>${h(x.ratingLabel)}</b><small>POT ${h(x.potentialLabel)}</small></span>${rangeBar(x)}</td><td class="dr-col-report">${blocks(x.confidence, 100, 5)}<span><b>${x.confidence}%</b><button class="link" onclick="Recruit.report(${arg(p.id)})">Report</button></span></td><td class="dr-col-size"><b>${heightLabel(p)}</b><small>${p.weight ? fmt(p.weight) + " lb" : "— lb"}</small></td><td class="dr-col-act">${x.need ? `<span class="dr-need ${x.need.urgency === "Need" ? "need" : ""}">${h(x.need.urgency)}</span>` : ""}${own ? btn("Draft", pickCode(p.id), { area: "scout", label: `Draft ${p.name}` }) : ""}</td></tr>`;
  }).join("");
  const needMap = new Map(teamNeeds(state).map((n) => [n.pos, n]));
  const posChips = POSITIONS.map((x) => {
    const n = needMap.get(x),
      flag = n?.urgency === "Need" ? "need" : n?.urgency === "Upgrade" ? "upgrade" : "";
    return `<button class="${filters.position === x ? "on" : ""} ${flag}" aria-pressed="${filters.position === x}" onclick="Hub.filter('draft','position',${arg(x)})"${n ? ` title="${h(n.urgency)}: ${n.available}/${n.target} available, best ${n.best || "—"}"` : ""}>${x}${flag ? `<i aria-label="${h(n.urgency)}"></i>` : ""}</button>`;
  }).join("");
  const board = `<section class="dr-board"><div class="dr-board-head"><h2>Big board</h2><label class="dr-search"><span aria-hidden="true">⌕</span><input id="hub-draft-query" type="search" aria-label="Search prospects or colleges" placeholder="Search prospects or colleges…" value="${h(filters.query)}" oninput="Hub.filter('draft','query',this.value)"></label><select aria-label="Draft sorting" onchange="Hub.filter('draft','sort',this.value)">${SORTS.map(([v, l]) => `<option value="${v}" ${filters.sort === v ? "selected" : ""}>${l}</option>`).join("")}</select></div><div class="dr-filters"><div class="dr-pos" role="group" aria-label="Draft position">${posChips}</div><span class="dr-toggles"><button class="${filters.pinned ? "on" : ""}" aria-pressed="${filters.pinned}" onclick="Hub.filter('draft','pinned',${!filters.pinned})">★ Pinned</button><button class="${filters.scouted ? "on" : ""}" aria-pressed="${filters.scouted}" onclick="Hub.filter('draft','scouted',${!filters.scouted})">◉ Scouted</button></span></div><table class="dr-table"><thead><tr><th><span class="sr-only">Board rank</span>#</th><th>Prospect</th><th>Pos</th><th>Ability range</th><th>Report</th><th>Size</th><th>${own ? "Fit / pick" : "Fit"}</th></tr></thead><tbody>${boardRows || `<tr><td colspan="7" class="dr-empty">No prospects match. Clear the filters or turn off Pinned / Scouted.</td></tr>`}</tbody></table><div class="dr-pager"><span>${page.total ? `${page.from}–${page.to} of ${page.total}` : "0 results"}</span><div><button class="secondary small" onclick="Hub.page('draft',-1)" ${page.page <= 1 ? "disabled" : ""} aria-label="Previous page">◀ Prev</button><b>${page.page} / ${page.pages}</b><button class="secondary small" onclick="Hub.page('draft',1)" ${page.page >= page.pages ? "disabled" : ""} aria-label="Next page">Next ▶</button></div></div></section>`;

  /* ------------------------------------------------------------ trade desk */
  let trades = "";
  if (pick && own && d.live) {
    const offers = tradeDownOffers(state);
    trades = `<div class="dr-desk-col"><div class="dr-section-label"><span>TRADE DOWN</span><small>Offers for #${d.cursor + 1}</small></div>${offers.map((o) => `<div class="dr-offer">${logo(o.partner)}<span><b>#${o.swapIndex + 1} + #${o.extraIndex + 1}</b><small>${h(abbr(o.partner))} · ${o.value} pts for your ${o.cost}</small></span>${btn("Accept", `Ops.down('${o.id}')`, { area: "scout", tone: "secondary" })}</div>`).join("") || '<p class="dr-muted">No clubs want to move up right now.</p>'}</div>`;
  } else if (pick && !own && d.live) {
    const quotes = Array.from({ length: 6 }, (_, k) => d.cursor + k).map((i) => tradeUpQuote(state, i)).filter(Boolean).slice(0, 3);
    trades = `<div class="dr-desk-col"><div class="dr-section-label"><span>TRADE UP</span><small>Jump the queue</small></div>${quotes.map((q) => `<div class="dr-offer">${logo(q.partner)}<span><b>Move to #${q.targetIndex + 1}</b><small>Costs ${q.pay.map((j) => `#${j + 1}`).join(" + ")}</small></span>${btn("Trade up", `Ops.up(${q.targetIndex})`, { area: "scout", tone: "secondary" })}</div>`).join("") || '<p class="dr-muted">Your later picks are not worth enough to move up yet.</p>'}</div>`;
  }
  const roleNote = canScout ? "" : `<p class="dr-note">${h(f.role)}: the front office makes the picks — your board guides them.</p>`;

  return `<div class="dr-room ${pick ? "is-live" : done ? "is-done" : "is-pre"}">${head}${clock}${summary}${trades ? `<section class="dr-desk">${trades}</section>` : ""}<div class="dr-strip ${ticker ? "" : "solo"}">${capital}${ticker}</div>${board}<div class="dr-foot"><p>Ranges keep scouting uncertainty: the bright bar is current ability, the faint one the ceiling. Flagged positions compare your depth and visible ability — guidance, not a guarantee.</p>${roleNote}${state.phase === "offseason" ? btn("Begin next season", "F.newSeason()") : ""}</div></div>`;
}
