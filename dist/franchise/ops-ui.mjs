// Front-office views for the Hub: Medical, Training, Market and Draft. Compact cards and
// sub-tabs instead of long tables; every mutation goes through state.transact.
import * as S from "./state.mjs";
import * as K from "../ui/kit.mjs";
import { medicalBoard, treatmentOutlook, recommendedTreatment, chooseTreatment, physioCandidates, hirePhysio, TREATMENTS } from "./medical.mjs";
import { DAYS, BLOCKS, TEMPLATES, DRILLS, POSITION_MOVES, ensureTraining, weekPlan, setSchedule, applyTemplate, setDrill, setIndividualTarget, changePosition, efficiency } from "./training.mjs";
import { medicalView as medicalScreen, trainingView as trainingScreen, trainingPlayersView, installMedical } from "./medical-ui.mjs";
import { evaluateTrade, executeTrade, ownedPicks, pickValue, pickLabel, playerTradeValue, teamMode, marketValue, signingFactors, respondToOffer, marketWindows, tradeBlockers, estimatedAsk, suggestPackage, scoutedTradeValue, pickEquivalent, scoutedAsk, counterOffer } from "./market.mjs";
import { REGIONS, ensureScouting, scoutCandidates, hireScout, assignScout, scoutedView, consensusBoard, startLiveDraft, onTheClock, stepDraft, simToUserPick, makeUserPick, tradeDownOffers, acceptTradeDown, tradeUpQuote, acceptTradeUp } from "./draft-room.mjs";
import { ensurePlayerRatings } from "./ratings.mjs";
import { pixelFace } from "../ui/pixel-face.mjs";
import { scoutRange } from "./scouting.mjs";
import { offerBlockers } from "./contracts.mjs";
import { blockerText, rosterLimit, activeCount } from "./blockers.mjs";
import { marketDay } from "./world.mjs";
import { ensureCalendar, addDays } from "./calendar-core.mjs";
import { pageOf, filterAssets, filterAgents, sortAgents, dealMeter, ASSET_PAGE, AGENT_PAGE } from "./market-view.mjs";
import { teamColors } from "../presentation/pixel-art.mjs";

const e = K.escapeHTML;
const money = (cents) => `${cents < 0 ? "-" : ""}$${(Math.abs(cents) / S.MILLION).toFixed(Math.abs(cents) >= S.MILLION * 10 ? 1 : 2)}M`;
const attrName = (k) => k.replace(/([A-Z])/g, " $1").replace(/^./, (c) => c.toUpperCase());
const pct = (x) => `${Math.round(x * 100)}%`;
const ui = { training: "plan", market: "builder", draft: "scouting", partner: null, give: [], get: [], classPos: "All", response: null, digest: null, mk: marketFilters() };
// Market picker filters: one set per trade side and one for the free-agent board.
function marketFilters() {
  const side = () => ({ group: "all", pos: "All", q: "", page: 0 });
  return { give: side(), get: side(), fa: { pos: "All", age: "all", minOvr: 0, maxAsk: 0, q: "", sort: "ovr", dir: "desc", page: 0 }, allFactors: false };
}
const clubTable = () => (typeof clubs !== "undefined" ? clubs : globalThis.clubs);
const club = (t) => clubTable()?.[t]?.[2] ?? `Team ${t + 1}`;
const sub = (items, active, key) => K.tabs(items, active, `Ops.sub('${key}','$id')`, { small: true, label: key });

/* ------------------------------------------------------------------- medical */
// The treatment room and the practice planner live in medical-ui.mjs (styles in medical.css).

export const medicalView = () => medicalScreen();

/* ------------------------------------------------------------------- training */

export function trainingView() {
  const tabs = sub([["plan", "Weekly plan"], ["players", "Individual plans"]], ui.training, "training");
  return ui.training === "players" ? trainingPlayersView(tabs) : trainingScreen(tabs);
}

/* --------------------------------------------------------------------- market */

// One line per window (trades, free agency, draft) with its dates. Reused by the draft room and
// the scouting card so every screen states the same rule.
export function windowStrip(which = ["trade", "freeAgency", "draft"]) {
  const w = marketWindows(state),
    names = { trade: "Trades", freeAgency: "Free agency", draft: "Draft" };
  return `<div class="ops-windows">${which.map((k) => `<div class="ops-window ${w[k].open ? "open" : "closed"}"><b>${names[k]}: ${e(w[k].status)}</b><small>${e(w[k].detail)}</small></div>`).join("")}</div>`;
}

const blockList = (list) => `<ul class="ops-blockers">${list.map((b) => `<li><b>${e(b.reason)}</b>${b.fix ? `<span>${e(b.fix)}</span>` : ""}</li>`).join("")}</ul>`;

/* --------------------------------------------------------------------- market */
// The Market is a pixel trade desk: two trade cards (You send / You receive) with club banners,
// paged asset pickers instead of long scroll boxes, a deal meter in the middle and the partner's
// reasoning as short +/− badges. Free agents are a filtered, sorted, paged board.

const fmt = (n) => Math.round(Number(n) || 0).toLocaleString("en-US");
const clubLogo = (t) => {
  const fn = typeof logo === "function" ? logo : globalThis.logo;
  try {
    return fn ? `<span class="mk-logo">${fn(t)}</span>` : "";
  } catch {
    return "";
  }
};
const clubVars = (t) => {
  const c = teamColors(t, state);
  return `--club:${c.primary};--club-2:${c.secondary}`;
};
const yearsLeft = (p) => {
  const c = state.franchise.contracts?.[p.id];
  return c && !c.ended ? c.start + c.years - S.financeYear(state) : null;
};
const contractText = (p) => {
  const y = yearsLeft(p);
  return `$${(Number(p.salary) || 0).toFixed(1)}M${y > 0 ? ` · ${y} yr${y === 1 ? "" : "s"}` : ""}`;
};
const tag = (text, tone) => `<i class="mk-tag mk-${tone}">${e(text)}</i>`;
const POS_ORDER = ["QB", "RB", "FB", "WR", "TE", "OL", "OT", "OG", "C", "DL", "DE", "DT", "EDGE", "LB", "CB", "S", "K", "P", "LS"];
const posSort = (list) => [...new Set(list)].sort((a, b) => ((POS_ORDER.indexOf(a) + 1 || 99) - (POS_ORDER.indexOf(b) + 1 || 99)) || a.localeCompare(b));
const PICK_ICON = `<span class="mk-pick-icon" aria-hidden="true"><svg viewBox="0 0 9 9" width="100%" height="100%" shape-rendering="crispEdges"><rect x="1" y="0" width="7" height="9" fill="currentColor"/><rect x="0" y="1" width="9" height="7" fill="currentColor"/><rect x="2" y="2" width="5" height="1" fill="var(--gd-bg)"/><rect x="2" y="4" width="3" height="1" fill="var(--gd-bg)"/><rect x="2" y="6" width="4" height="1" fill="var(--gd-bg)"/></svg></span>`;
const pts = (v) => `<span class="mk-pts" ${v.exact ? "" : `title="Your scouts' range: ${fmt(v.low)}–${fmt(v.high)} points"`}><b>${v.exact ? "" : "~"}${fmt(v.estimate)}</b><small>pts</small></span>`;

// Every asset a side can put in the deal: players by value (yours as the partner values them,
// theirs as your scouts expect them to price them), then draft picks.
function assetRows(team, side) {
  const mine = team === state.team,
    picked = side === "give" ? ui.give : ui.get,
    players = (mine ? state.roster : state.franchise.clubs[team].players)
      .filter((p) => picked.includes(p.id) || ((!p.status || p.status === "active") && (!p.injury || !mine)))
      .map((p) => ({ kind: "player", id: p.id, p, v: mine ? { estimate: playerTradeValue(state, p, ui.partner), exact: true } : scoutedAsk(state, p, team) }))
      .sort((a, b) => b.v.estimate - a.v.estimate),
    picks = ownedPicks(state, team).map((x) => ({ kind: "pick", id: x.id, x, label: pickLabel(state, x), v: { estimate: pickValue(state, x), exact: true } }));
  return players.concat(picks);
}

function assetRow(r, side, team) {
  const on = (side === "give" ? ui.give : ui.get).includes(r.id),
    mine = team === state.team,
    name = r.kind === "player" ? r.p.name : r.label,
    check = `<input type="checkbox" class="mk-check" ${on ? "checked" : ""} aria-label="${side === "give" ? "Send" : "Ask for"} ${e(name)}" onchange="Ops.asset('${side}','${r.id}',this.checked)"><span class="mk-box" aria-hidden="true"></span>`;
  if (r.kind === "pick") return `<label class="mk-asset ${on ? "on" : ""}">${check}${PICK_ICON}<span class="mk-asset-main"><b>${e(r.label)}</b><small>Draft pick · ${e(pickEquivalent(r.v.estimate))}</small></span><span class="mk-ovr mk-ovr-pick" title="Round ${r.x.round}">R${r.x.round}</span>${pts(r.v)}</label>`;
  const p = r.p,
    view = mine ? null : scoutRange(state, p, team),
    locked = !mine && r.v.untouchable,
    ovr = mine || view.exact ? `<span class="mk-ovr" title="Overall rating">${p.ovr}</span>` : `<span class="mk-ovr mk-fog" title="Scouted ${e(view.label)} OVR (${view.confidence}% confidence). Request a report to narrow it.">${view.estimate}<i>?</i></span>`,
    tags = (locked ? tag("Not for sale", "bad") : "") + (p.tradeDemand ? tag("Wants out", "warn") : "") + (p.injury ? tag("Injured", "bad") : "") + (state.franchise.contracts?.[p.id]?.noTrade ? tag("No-trade", "bad") : "");
  return `<label class="mk-asset ${on ? "on" : ""} ${locked ? "locked" : ""}">${check}${pixelFace(p, { size: 34, team })}<span class="mk-asset-main"><b><span class="mk-pos">${e(p.pos)}</span>${e(p.name)}</b><small>${tags}${p.age} yrs · ${contractText(p)}${p.starter ? " · Starter" : ""}</small></span>${ovr}${pts(r.v)}<button type="button" class="link mk-info" title="Scouting report: ${e(p.name)}" aria-label="Scouting report: ${e(p.name)}" onclick="event.preventDefault();Scout.open('${p.id}')">i</button></label>`;
}

// The deal tray: what is already in the deal on this side, as removable chips.
function tray(rows, side, team) {
  const picked = side === "give" ? ui.give : ui.get,
    byId = new Map(rows.map((r) => [r.id, r])),
    chips = picked
      .map((id) => byId.get(id))
      .filter(Boolean)
      .map((r) => {
        const label = r.kind === "player" ? `${r.p.pos} ${r.p.name}` : r.label;
        return `<span class="mk-chip" title="${e(label)}">${r.kind === "player" ? pixelFace(r.p, { size: 22, team }) : PICK_ICON}<b>${e(label)}</b><small>${r.v.exact ? "" : "~"}${fmt(r.v.estimate)}</small><button type="button" class="link mk-chip-x" aria-label="Remove ${e(label)}" onclick="Ops.asset('${side}','${r.id}',false)">×</button></span>`;
      })
      .join("");
  return `<div class="mk-tray" aria-label="${side === "give" ? "Assets you send" : "Assets you receive"}">${chips || `<span class="mk-tray-empty">${side === "give" ? "Nothing yet: tick players or picks below, or press Suggest a package." : "Tick the players or picks you want below."}</span>`}</div>`;
}

const pager = (pg, onPage) =>
  pg.pages > 1
    ? `<div class="mk-pager"><button type="button" class="secondary small" ${pg.page <= 0 ? "disabled" : ""} onclick="${onPage(pg.page - 1)}" aria-label="Previous page">◀ Prev</button><span>${pg.from}–${pg.to} of ${pg.total}</span><button type="button" class="secondary small" ${pg.page >= pg.pages - 1 ? "disabled" : ""} onclick="${onPage(pg.page + 1)}" aria-label="Next page">Next ▶</button></div>`
    : `<div class="mk-pager"><span>${pg.total} shown</span></div>`;

const seg = (items, active, onclick, label) => `<div class="mk-seg" role="group" aria-label="${e(label)}">${items.map(([id, text]) => `<button type="button" class="link ${String(id) === String(active) ? "on" : ""}" aria-pressed="${String(id) === String(active)}" onclick="${onclick(id)}">${e(text)}</button>`).join("")}</div>`;

function picker(rows, side, team) {
  const f = ui.mk[side],
    positions = posSort(rows.filter((r) => r.kind === "player").map((r) => r.p.pos)),
    pg = pageOf(filterAssets(rows, f), f.page, ASSET_PAGE);
  const controls = `<div class="mk-filters">${seg([["all", "All"], ["starters", "Starters"], ["reserves", "Reserves"], ["picks", "Picks"]], f.group, (id) => `Ops.mk('${side}','group','${id}')`, "Show")}<select aria-label="Position" onchange="Ops.mk('${side}','pos',this.value)">${["All", ...positions].map((x) => `<option value="${x}" ${x === f.pos ? "selected" : ""}>${x === "All" ? "All positions" : x}</option>`).join("")}</select><input type="search" id="mk-q-${side}" placeholder="Search name" aria-label="Search by name" value="${e(f.q)}" oninput="Ops.mkSearch('${side}',this.value)"></div>`;
  const list = pg.items.map((r) => assetRow(r, side, team)).join("") || `<p class="mk-none">Nothing matches these filters.</p>`;
  return `${controls}<div class="mk-assets ops-assets">${list}</div>${pager(pg, (n) => `Ops.mk('${side}','page',${n})`)}`;
}

function sideCard(side, partners, sending, ask) {
  const team = side === "give" ? state.team : ui.partner,
    rows = assetRows(team, side),
    total = side === "give" ? `<b>${fmt(sending)}</b><small>pts to them</small>` : ask ? `<b>${ask.exact ? fmt(ask.estimate) : `${fmt(ask.low)}–${fmt(ask.high)}`}</b><small>${ask.exact ? "pts asked" : "pts asked (est.)"}</small>` : `<b>—</b><small>pts asked</small>`,
    name =
      side === "give"
        ? `<span class="mk-banner-name"><small>You send</small><b>${e(club(team))}</b><em>${e(teamMode(state, team))}</em></span>`
        : `<span class="mk-banner-name"><small>You receive from</small><select class="mk-partner" aria-label="Trade partner" onchange="Ops.partner(this.value)">${partners.map((t) => `<option value="${t}" ${t === ui.partner ? "selected" : ""}>${e(club(t))} · ${teamMode(state, t)}</option>`).join("")}</select>${window.W?.club ? `<button type="button" class="link club-link mk-profile-link" onclick="W.club(${team})">Club profile →</button>` : ""}</span>`;
  return `<section class="mk-side mk-${side}"><div class="mk-banner" style="${clubVars(team)}">${clubLogo(team)}${name}<span class="mk-banner-total">${total}</span></div>${tray(rows, side, team)}${picker(rows, side, team)}</section>`;
}

// One line per factor: + helps your offer, − raises their price. The percentage is the effect
// on that asset's value (or on the whole deal), never the hidden rating behind it.
function effectLabel(f) {
  const n = Math.round(Math.abs(f.pct) * 100),
    sign = f.pct > 0 ? "+" : "−";
  if (f.key === "dead" || (!f.pct && f.flat)) return `+${f.flat ?? Math.abs(f.points)} pts`;
  if (f.key === "margin") return `+${n}% on top`;
  if (f.side === "deal") return `picks ${sign}${n}%`;
  return f.side === "receive" ? `their price ${sign}${n}%` : `value to them ${sign}${n}%`;
}

const weight = (f) => Math.abs(f.points || f.flat || 0);
function factorList(list, limit = 8) {
  return `<ul class="mk-factors">${list
    .slice(0, limit)
    .map((f) => `<li class="mk-${f.tone || "neutral"}" title="${e(f.text)}"><span class="mk-sign" aria-hidden="true">${f.tone === "good" ? "+" : f.tone === "bad" ? "−" : "·"}</span><span class="mk-ftext">${e(f.text)}</span><small>${e(effectLabel(f))}</small></li>`)
    .join("")}</ul>`;
}

// The partner's live reasoning as badges: the biggest effects first, top five unless expanded.
function factorBadges(list) {
  const sorted = list.slice().sort((a, b) => weight(b) - weight(a)),
    limit = 5;
  return `${factorList(sorted, ui.mk.allFactors ? sorted.length : limit)}${sorted.length > limit ? `<button type="button" class="link mk-more" onclick="Ops.mkFactors()">${ui.mk.allFactors ? "Show fewer" : `Show all ${sorted.length} reasons`}</button>` : ""}`;
}

function dealMeterHTML(sending, ask, verdict) {
  const m = dealMeter(sending, ask);
  return `<div class="mk-meter mk-${verdict[1] || "neutral"}"><div class="mk-meter-legend"><span><small>You send</small><b>${fmt(sending)}</b></span><span><small>They want</small><b>${ask.exact ? fmt(ask.estimate) : `${fmt(ask.low)}–${fmt(ask.high)}`}</b></span></div><div class="mk-meter-track" role="meter" aria-label="What you send against what they want" aria-valuemin="0" aria-valuemax="${Math.round(m.max)}" aria-valuenow="${Math.round(sending)}"><i class="mk-meter-band" style="left:${m.low}%;width:${Math.max(1, m.high - m.low)}%"></i><i class="mk-meter-fill" style="width:${m.fill}%"></i><i class="mk-meter-tick" style="left:${m.est}%"></i></div><div class="mk-verdict"><b>${e(verdict[0])}</b><small>${ui.give.length ? e(pickEquivalent(sending)) : "Add what you send"}${ask.exact ? " · exact ask" : " · scouts' estimate"}</small></div></div>`;
}

// The deal meter: what you send against what they want, the verdict and the actions on one side;
// their front office's reasoning (or why the deal is blocked) on the other.
function dealPanel(sending, ask) {
  const proposal = { partner: ui.partner, give: ui.give, get: ui.get },
    locked = !!ask && ask.untouchable.length > 0,
    blockers = tradeBlockers(state, proposal).filter((b) => (ui.give.length && ui.get.length ? true : !/at least one player or pick/.test(b.reason)) && !(locked && /not for sale/i.test(b.reason)));
  let main = "",
    side = "";
  if (ui.response) side += `<div class="ops-response ${ui.response.ok ? "good" : "bad"}"><b>${e(ui.response.title)}</b>${ui.response.lines.map((l) => `<p>${e(l)}</p>`).join("")}${ui.response.factors?.length ? factorList(ui.response.factors) : ""}${ui.response.counter ? `<button class="gd-btn secondary" onclick="Ops.addAll('${(ui.response.counter.adds || [ui.response.counter.add]).join(",")}')">Add ${e(ui.response.counter.label)} and try again</button>` : ""}</div>`;
  if (!ask) main += `<ol class="mk-steps"><li><b>1</b><span>Pick a club and tick who you want from them.</span></li><li><b>2</b><span>Press <em>Suggest a package</em> or tick what you send.</span></li><li><b>3</b><span>Check the meter and their reasoning, then propose.</span></li></ol>`;
  else {
    const verdict = locked ? ["Not for sale", "bad"] : !ui.give.length ? ["Add what you send", ""] : sending >= ask.high ? ["Likely accepted", "good"] : sending >= ask.low ? ["Borderline", "warn"] : ["Likely refused", "bad"];
    main += dealMeterHTML(sending, ask, verdict);
    if (!ask.exact) main += `<p class="mk-note">Unscouted players make the ask a guess. Request a report (i) to narrow it.</p>`;
    if (locked) {
      if (!ui.response || ui.response.ok) side += `<div class="mk-untouchable">${ask.untouchable.map((u) => `<p><b>${e(u.why)}.</b></p>`).join("")}<small>Ask about someone else, or come back if they start rebuilding.</small></div>`;
    } else {
      const gap = ask.estimate - sending,
        counter = ui.give.length && gap > 0 ? counterOffer(state, { partner: ui.partner, give: ui.give, get: ui.get }, gap) : null;
      if (counter) main += `<button type="button" class="secondary mk-counter" onclick="Ops.addAll('${counter.adds.join(",")}')"><span>Close the gap of ${fmt(gap)} pts</span><b>+ Add ${e(counter.label)} (${fmt(counter.value)})</b></button>`;
      // Their reasoning, live: the partner's factors for this exact package.
      const reaction = evaluateTrade(state, { partner: ui.partner, give: ui.give, get: ui.get }),
        shown = reaction.factors.filter((f) => f.points || f.flat);
      side += `<h4>Their front office</h4>${shown.length ? factorBadges(shown) : `<p class="mk-note">Nothing beyond the points: no age, contract, injury, reputation, character or need concerns either way.</p>`}`;
    }
  }
  const reason = blockers[0] ? blockerText(blockers[0]) : locked ? "That player is not for sale." : "";
  main += `<div class="mk-actions"><button type="button" class="gd-btn gd-primary" ${blockers.length || locked || !ui.get.length || !ui.give.length ? "disabled" : ""} title="${e(reason || (!ui.give.length || !ui.get.length ? "Add at least one player or pick on each side." : "Send this offer to their front office."))}" onclick="Ops.propose()">Propose trade</button>${ask ? `<button type="button" class="gd-btn secondary" ${locked ? "disabled" : ""} onclick="Ops.suggest()">Suggest a package</button>` : ""}</div>`;
  if (blockers.length) main += `<div class="mk-blocked"><p class="ops-label">Can't be proposed yet</p>${blockList(blockers)}</div>`;
  return `<section class="mk-deal ${side ? "" : "is-empty"}"><div class="mk-deal-main"><div class="mk-deal-head"><h3>Deal meter</h3><span class="mk-help" tabindex="0" title="Points are each asset's trade value: yours as the other club values them, theirs as your scouts expect them to price them. Age, contracts, injuries, reputation, character and each club's needs move the price; their front office lists its reasoning as you build the deal.">?</span></div>${main}</div>${side ? `<div class="mk-reasoning">${side}</div>` : ""}</section>`;
}

// The Market's trade builder state after "Trade for <player>": that club as partner, the player
// ticked in "You receive", and a suggested package (if one covers the ask) in "You send".
export function applyTradeFor(s, id, team, target = ui) {
  const partner = Number(team);
  target.market = "builder";
  target.partner = partner;
  target.get = [id];
  target.give = [];
  target.response = null;
  if (!s.franchise.clubs[partner] || partner === s.team || !S.roster(s, partner).some((p) => p.id === id)) {
    target.get = [];
    target.response = { ok: false, title: "He is no longer with that club", lines: ["Pick another player from their list."] };
    return target;
  }
  const name = S.roster(s, partner).find((p) => p.id === id).name,
    pkg = suggestPackage(s, partner, [id]);
  if (pkg.untouchable?.length) target.response = { ok: false, title: `${name} is not for sale`, lines: pkg.untouchable.map((u) => `${u.why}.`) };
  else if (!pkg.covered) target.response = { ok: false, title: "Nothing you own covers it", lines: [`Your scouts expect them to want about ${pkg.target} points for ${name}, more than any four of your tradeable assets are worth to them.`] };
  else {
    target.give = pkg.give;
    target.response = { ok: true, title: `Suggested package for ${name}`, lines: [`Worth ${pkg.total} points to them against an estimated ask of ${pkg.target}. Their front office lists its reasoning under the deal meter; adjust it, then propose.`] };
  }
  return target;
}

function sendingValue() {
  return ui.give.reduce((n, id) => {
    if (id.startsWith("pk-")) return n + pickValue(state, state.franchise.pickLedger.find((x) => x.id === id));
    const p = state.roster.find((x) => x.id === id);
    return n + (p ? playerTradeValue(state, p, ui.partner) : 0);
  }, 0);
}

function tradeBuilder() {
  const partners = Array.from({ length: 32 }, (_, i) => i).filter((i) => i !== state.team);
  if (ui.partner == null || ui.partner === state.team) ui.partner = partners[0];
  const sending = sendingValue(),
    ask = ui.get.length ? estimatedAsk(state, ui.partner, ui.get) : null;
  return `<div class="mk-desk">${dealPanel(sending, ask)}${sideCard("give", partners, sending, ask)}${sideCard("get", partners, sending, ask)}</div>`;
}

/* ---------------------------------------------------------------- offers tab */

function offersBoard(offers) {
  if (!offers.length) return `<div class="mk-empty">${PICK_ICON}<b>No offers on the table</b><p>Contending clubs make offers for your players in the three weeks before the trade deadline.</p></div>`;
  return `<div class="mk-offers">${offers
    .map((o) => {
      const p = state.roster.find((x) => x.id === o.playerId),
        block = tradeBlockers(state, { partner: o.partner, give: o.give, get: o.get })[0],
        worth = p ? playerTradeValue(state, p, o.partner) : 0,
        picks = o.get.map((id) => state.franchise.pickLedger.find((x) => x.id === id)).filter(Boolean),
        total = o.value ?? picks.reduce((n, x) => n + pickValue(state, x), 0);
      const him = p ? `<div class="mk-offer-player">${pixelFace(p, { size: 40, team: state.team })}<span><b><span class="mk-pos">${e(p.pos)}</span>${e(p.name)}</b><small>${p.ovr} OVR · ${p.age} yrs · ${contractText(p)}</small></span></div>` : `<p class="mk-note">A player who has since left.</p>`;
      return `<article class="mk-offer"><div class="mk-banner" style="${clubVars(o.partner)}">${clubLogo(o.partner)}<span class="mk-banner-name"><small>Offer from</small><b>${e(club(o.partner))}</b><em>${e(teamMode(state, o.partner))}</em></span><span class="mk-banner-total"><small>Expires</small><b>Week ${e(o.expires)}</b></span></div><div class="mk-offer-body"><div class="mk-offer-col"><small class="mk-cap">They want</small>${him}<small class="mk-note">Worth ${fmt(worth)} pts to them</small></div><span class="mk-offer-swap" aria-hidden="true">⇄</span><div class="mk-offer-col"><small class="mk-cap">You get</small><div class="mk-offer-picks">${picks.map((x) => `<span class="mk-chip">${PICK_ICON}<b>${e(pickLabel(state, x))}</b><small>${fmt(pickValue(state, x))}</small></span>`).join("")}</div><small class="mk-note">${fmt(total)} pts in picks</small></div></div>${block ? `<p class="mk-offer-block">${e(blockerText(block))}</p>` : ""}<div class="mk-offer-actions"><button class="gd-btn gd-primary" ${block ? "disabled" : ""} title="${e(block ? blockerText(block) : "Accept")}" onclick="Ops.offer('${o.id}',true)">Accept</button><button class="gd-btn secondary" title="Open this deal in the trade builder to change it" onclick="Ops.counterIncoming('${o.id}')">Counter</button><button class="gd-btn secondary" onclick="Ops.offer('${o.id}',false)">Decline</button></div></article>`;
    })
    .join("")}</div>`;
}

/* ---------------------------------------------------------- free agents tab */

function freeAgentTable() {
  const f = ui.mk.fa,
    agents = state.agents || [],
    cheapest = agents.slice().sort((a, b) => a.salary - b.salary)[0],
    general = cheapest ? offerBlockers(state, cheapest.id) : [],
    mine = state.franchise.market.offers.filter((o) => o.team === state.team);
  const rows = agents.map((p) => {
    const v = scoutRange(state, p, -1);
    return { p, v, ovr: v.exact ? p.ovr : v.estimate, pot: v.exact ? Math.max(p.pot ?? p.ovr, p.ovr) : v.potEstimate, pull: 0, f: null };
  });
  // Pull is only needed for every agent when sorting by it; otherwise just for the visible page.
  if (f.sort === "pull") for (const r of rows) (r.f = signingFactors(state, r.p, state.team)), (r.pull = r.f.total);
  const pg = pageOf(sortAgents(filterAgents(rows, f), f.sort, f.dir), f.page, AGENT_PAGE),
    positions = posSort(agents.map((p) => p.pos));
  const filters = `<div class="mk-filters mk-fa-filters"><select aria-label="Position" onchange="Ops.mk('fa','pos',this.value)">${["All", ...positions].map((x) => `<option value="${x}" ${x === f.pos ? "selected" : ""}>${x === "All" ? "All positions" : x}</option>`).join("")}</select>${seg([["all", "Any age"], ["young", "≤25"], ["prime", "26–29"], ["veteran", "30+"]], f.age, (id) => `Ops.mk('fa','age','${id}')`, "Age")}<select aria-label="Minimum rating" onchange="Ops.mk('fa','minOvr',this.value)">${[0, 60, 65, 70, 75, 80].map((x) => `<option value="${x}" ${Number(f.minOvr) === x ? "selected" : ""}>${x ? `${x}+ OVR` : "Any rating"}</option>`).join("")}</select><select aria-label="Maximum asking salary" onchange="Ops.mk('fa','maxAsk',this.value)">${[0, 1, 3, 5, 10, 20].map((x) => `<option value="${x}" ${Number(f.maxAsk) === x ? "selected" : ""}>${x ? `Asking ≤ $${x}M` : "Any asking"}</option>`).join("")}</select><input type="search" id="mk-q-fa" placeholder="Search name" aria-label="Search free agents by name" value="${e(f.q)}" oninput="Ops.mkSearch('fa',this.value)"><span class="mk-count">${pg.total} of ${agents.length} free agents</span></div>`;
  const th = (key, label, title = "") => `<th class="${key === "player" || key === "pull" ? "" : "numeric"}" ${f.sort === key ? `aria-sort="${f.dir === "asc" ? "ascending" : "descending"}"` : ""}>${key === "player" ? label : `<button type="button" class="link mk-sort ${f.sort === key ? "on" : ""}" ${title ? `title="${e(title)}"` : ""} onclick="Ops.mkSort('${key}')">${label}${f.sort === key ? (f.dir === "asc" ? " ▲" : " ▼") : ""}</button>`}</th>`;
  const body = pg.items
    .map((r) => {
      const p = r.p,
        v = r.v,
        sf = r.f || signingFactors(state, p, state.team),
        bids = state.franchise.market.offers.filter((o) => o.playerId === p.id),
        own = mine.find((o) => o.playerId === p.id),
        block = offerBlockers(state, p.id)[0],
        why = sf.reasons[0],
        potLabel = v.exact ? String(r.pot) : v.pot[0] === v.pot[1] ? String(v.pot[0]) : `${v.pot[0]}–${v.pot[1]}`;
      return `<tr><td><span class="mk-fa-id">${pixelFace(p, { size: 34 })}<span><button type="button" class="link mk-name" onclick="W.player('${p.id}',-1)" title="Open ${e(p.name)}'s profile"><span>${e(p.name)}</span></button><small><span class="mk-pos">${e(p.pos)}</span>${e(p.archetype || (p.starter ? "Starter-calibre" : "Free agent"))}</small></span></span></td><td class="numeric">${v.exact ? `<span class="mk-ovr">${p.ovr}</span>` : `<span class="mk-ovr mk-fog" title="Scouted ${e(v.label)} OVR (${v.confidence}% confidence)">${r.ovr}<i>?</i></span>`}</td><td class="numeric"><span class="mk-pot" title="Potential">${e(potLabel)}</span></td><td class="numeric">${p.age}</td><td class="numeric"><b class="mk-ask">${money(Math.round(p.salary * S.MILLION))}</b><small>/yr</small></td><td class="mk-pull" title="${e(sf.reasons.map((x) => x.text).join(" ") || "No strong pull either way")}"><span class="mk-pull-top">${K.chip(`×${sf.total}`, sf.total >= 1.05 ? "good" : sf.total <= 0.95 ? "bad" : "")}<small>${bids.length} bid${bids.length === 1 ? "" : "s"}</small></span>${why ? `<small class="mk-why mk-${why.tone || "neutral"}">${e(why.text)}</small>` : `<small class="mk-why">No strong pull either way</small>`}</td><td class="mk-fa-act">${own ? `<span class="mk-own" title="Decided on market day ${own.close}">${tag(`Offer in · day ${own.close}`, "good")}</span>` : ""}<span class="ops-actions"><button type="button" class="link mk-info" title="Scouting report: ${e(p.name)}" aria-label="Scouting report: ${e(p.name)}" onclick="Scout.open('${p.id}')">i</button><button class="gd-btn secondary small" onclick="W.player('${p.id}',-1)">Profile</button><button class="gd-btn gd-primary small" ${block ? "disabled" : ""} title="${e(block ? blockerText(block) : "Open contract talks")}" onclick="Neg.open('${p.id}')">Offer</button></span></td></tr>`;
    })
    .join("");
  return `${general.length ? `<div class="ops-callout mk-callout"><b>Contract offers are blocked right now</b>${blockList(general)}</div>` : ""}${filters}<table class="ops-table mk-fa-table" data-no-sort="1"><colgroup><col class="c-player"><col class="c-n"><col class="c-n"><col class="c-age"><col class="c-ask"><col class="c-pull"><col class="c-act"></colgroup><thead><tr>${th("player", "Player")}${th("ovr", "OVR")}${th("pot", "POT")}${th("age", "Age")}${th("ask", "Asking")}${th("pull", "Pull / bids", "How much your club appeals to him beyond money: role, contention, coach, scheme, his personality")}<th class="numeric">Action</th></tr></thead><tbody>${body || `<tr><td colspan="7" class="mk-none">${agents.length ? "No free agents match these filters." : "No free agents available right now."}</td></tr>`}</tbody></table>${pager(pg, (n) => `Ops.mk('fa','page',${n})`)}`;
}

/* -------------------------------------------------------- windows and clock */

// Why the "Next market day" button cannot move the calendar, or null.
function marketDayBlocker() {
  const c = ensureCalendar(state);
  if (state.live) return "Finish the live game first.";
  if (state.phase !== "offseason" && c.nextRoundDate && addDays(c.date, 1) > c.nextRoundDate) return `This week's game (${c.nextRoundDate}) comes first. Play it, and the market settles with the round.`;
  return null;
}

// The windows (trades, free agency, draft) and the market clock on one compact strip.
function marketStrip() {
  const w = marketWindows(state),
    names = { trade: "Trades", freeAgency: "Free agency", draft: "Draft" },
    block = marketDayBlocker(),
    d = ui.digest;
  const wins = ["trade", "freeAgency", "draft"].map((k) => `<div class="ops-window mk-win ${w[k].open ? "open" : "closed"}" title="${e(w[k].detail)}"><span class="mk-led" aria-hidden="true"></span><span><b>${names[k]}<em>${e(w[k].status)}</em></b><small>${e(w[k].detail)}</small></span></div>`).join("");
  const clock = `<div class="ops-clock mk-clock" title="Each market day, players decide on offers whose deadline has arrived, CPU clubs bid, and waiver claims are awarded. In season this also happens automatically after every game week."><span class="mk-clock-day"><small>Market day</small><b>${state.franchise.market.day}</b></span><span class="mk-clock-date"><b>${e(ensureCalendar(state).date)}</b><small>${e(block || "Offers, bids and claims settle daily")}</small></span><button class="gd-btn small" ${block ? "disabled" : ""} title="${e(block || "Move the calendar forward one day")}" onclick="Ops.marketDay()">Next day ▶</button></div>`;
  const digest = d ? `<div class="ops-digest mk-digest"><div class="mk-digest-head"><b>Market day: ${e(d.from)} → ${e(d.to)}</b><button type="button" class="link" onclick="Ops.mkDigest()">Dismiss</button></div>${d.items.length ? `<ul>${d.items.map((x) => `<li><b>${e(x.title)}</b> ${e(x.body)}</li>`).join("")}</ul>` : `<p>A quiet day: no offer reached its deadline and no claims were due.</p>`}</div>` : "";
  return `<div class="ops-windows mk-strip">${wins}${clock}</div>${digest}`;
}

// Market styles live in market.css, loaded once beside the design system.
function marketStyles() {
  if (typeof document !== "undefined" && typeof document.querySelector === "function" && !document.querySelector('link[href="market.css"]')) document.head?.insertAdjacentHTML?.("beforeend", '<link rel="stylesheet" href="market.css">');
}

export function marketView() {
  marketStyles();
  const offers = state.franchise.tradeDesk?.offers.filter((o) => o.status === "open") ?? [];
  const tabs = sub([["builder", "Trade builder"], ["offers", `Offers${offers.length ? ` (${offers.length})` : ""}`], ["agents", "Free agents"]], ui.market, "market");
  const head = `<div class="gd-toolbar mk-toolbar">${tabs}<span class="mk-club-chips"><span title="How the league sees your club this season: contenders value proven players, rebuilding clubs value youth and picks.">${K.chip(`Your club: ${teamMode(state, state.team)}`, "team")}</span>${K.chip(`Cap room ${money(S.capLedger(state).room)}`)}${K.chip(`Roster ${activeCount(state)}/${rosterLimit(state)}`)}</span></div>${marketStrip()}`;
  const body = ui.market === "offers" ? offersBoard(offers) : ui.market === "agents" ? `<section class="mk-panel">${freeAgentTable()}</section>` : tradeBuilder();
  return `<div class="mk-page">${head}${body}</div>`;
}

/* ---------------------------------------------------------------------- draft */

export const draftView = (opts) => windowStrip(["draft", "trade"]) + draftWorkspace(opts);

function draftWorkspace({ pipeline } = {}) {
  const tabs = sub([["scouting", "Scouting network"], ["class", "Draft class"], ["board", "Big board"], ["day", "Draft day"]], ui.draft, "draft");
  if (ui.draft === "board") return `<div class="gd-toolbar">${tabs}</div>${pipeline ? pipeline() : ""}`;
  if (ui.draft === "class") return `<div class="gd-toolbar">${tabs}${K.tabs(["All", "QB", "RB", "WR", "TE", "OL", "DL", "LB", "CB", "S"].map((x) => [x, x]), ui.classPos, "Ops.classPos('$id')", { small: true, label: "Position" })}</div>${draftClass()}`;
  if (ui.draft === "day") return `<div class="gd-toolbar">${tabs}</div>${draftDay()}`;
  const n = ensureScouting(state);
  const scouts = n.scouts.map((sc) => `<article class="ops-scout"><header><span class="gd-pos">SC</span><span><b>${e(sc.name)}</b><small>Skill ${sc.skill}</small></span></header><label>Region<select onchange="Ops.assign('${sc.id}',this.value,null)">${REGIONS.map((r) => `<option ${r === sc.region ? "selected" : ""}>${r}</option>`).join("")}</select></label><label>Focus<select onchange="Ops.assign('${sc.id}',null,this.value)">${["All", "QB", "Skill", "Line", "Front 7", "Secondary", "Specialist"].map((f) => `<option ${f === sc.focus ? "selected" : ""}>${f}</option>`).join("")}</select></label></article>`).join("");
  return `<div class="gd-toolbar">${tabs}<small style="color:var(--gd-text-3)">Scouts file reports every week, raising confidence and revealing combine, film, medical and personality detail.</small></div><div class="gd-bento">${K.card({ title: `Your scouts (${n.scouts.length}/5)`, span: 8, accent: true, body: `<div class="ops-scouts">${scouts}</div>` })}${K.card({ title: "Available scouts", span: 4, body: `<div class="gd-rows">${scoutCandidates(state).map((c) => K.row({ lead: "SC", title: c.name, sub: `${c.region} · ${c.focus} · skill ${c.skill}`, trail: `<button class="gd-btn" onclick="Ops.scout('${c.id}')">${money(c.salary)}</button>` })).join("") || K.empty("No candidates.")}</div>` })}${K.card({ title: "Latest reports", span: 12, body: n.log.length ? `<div class="gd-rows">${n.log.slice(0, 10).map((r) => K.row({ lead: "↑", title: `${r.scout} on ${r.prospect}`, sub: `Confidence ${r.from}% → ${r.to}%` })).join("")}</div>` : K.empty("Reports arrive after the next game week.") })}</div>`;
}

function draftClass() {
  const board = consensusBoard(state)
    .filter((x) => ui.classPos === "All" || x.p.pos === ui.classPos)
    .slice(0, 24);
  return `<div class="gd-bento">${K.card({ title: "Prospects (consensus order) — fog of war by scouting confidence", span: 12, accent: true, body: `<div class="ops-class">${board.map(({ p, rank }) => { const v = scoutedView(state, p); return `<article class="ops-prospect"><header>${pixelFace(p, { size: 34 })}<span><b>#${rank} <button class="gd-link" onclick="Scout.open('${p.id}')">${e(p.name)}</button></b><small>${e(p.pos)} · ${e(p.college ?? "")} · ${e(v.region)} · ${e(p.archetype ?? "")}</small></span><span class="gd-ovr">${v.range[0]}–${v.range[1]}</span></header><small>${e(v.storyline)}</small><div class="ops-reveal">${v.combine ? `<span>40 ${v.combine.forty}s · bench ${v.combine.bench} · vert ${v.combine.vertical}"</span>` : "<span class='ops-fog'>Combine: needs 40% confidence</span>"}${v.film != null ? `<span>Film ${v.film}</span>` : "<span class='ops-fog'>Film: 55%</span>"}${v.medical ? `<span class="${v.medical === "No red flags" ? "" : "gd-down"}">${e(v.medical)}</span>` : "<span class='ops-fog'>Medical: 70%</span>"}${v.personality ? `<span>Work ethic ${v.personality.workEthic}${v.personality.character ? ` · <b class="gd-down">${e(v.personality.character)}</b>` : ""}</span>` : ""}${v.sleeperOdds != null ? `<span class="gd-up">Sleeper ${v.sleeperOdds}%</span><span class="gd-down">Bust ${v.bustOdds}%</span>` : ""}</div>${K.meter("Confidence", v.confidence)}</article>`; }).join("")}</div>` })}</div>`;
}

function draftDay() {
  const d = state.franchise.draft;
  if (!d || d.year !== state.year) {
    return `<div class="gd-bento">${K.card({ title: "Draft day", span: 12, accent: true, body: `<p style="margin:0;color:var(--gd-text-2)">${state.phase === "offseason" ? "The draft is ready. Run it live: CPU clubs pick one at a time, analysts grade every selection, and you can trade up or down on the clock." : "The draft opens after the championship. Scout the class until then."}</p>${state.phase === "offseason" ? `<button class="gd-btn gd-primary" onclick="Ops.draft('start')">Start the live draft</button>` : ""}` })}</div>`;
  }
  const pick = onTheClock(state),
    mine = pick && pick.team === state.team,
    ticker = (d.ticker || []).slice(0, 14);
  const best = consensusBoard(state).slice(0, 10);
  const upQuotes = !pick || mine ? [] : Array.from({ length: 6 }, (_, k) => d.cursor + k).map((i) => tradeUpQuote(state, i)).filter(Boolean).slice(0, 3);
  return `<div class="gd-bento"><section class="gd-card gd-span-12 gd-hero"><div class="gd-hero-mid" style="grid-column:1/-1;text-align:left"><span class="gd-eyebrow">${pick ? `Round ${pick.round} · pick ${d.cursor + 1}` : "Draft complete"}</span><strong>${pick ? (mine ? "YOU'RE ON THE CLOCK" : `${e(club(pick.team))} on the clock`) : "THAT'S THE DRAFT"}</strong></div><div class="gd-hero-actions">${pick && !mine ? `<span style="display:flex;gap:6px"><button class="gd-btn" onclick="Ops.draft('next')">Next pick</button><button class="gd-btn gd-primary" onclick="Ops.draft('sim')">Sim to my pick</button></span>` : "<span></span>"}</div></section>
  ${K.card({ title: mine ? "Best available — make your pick" : "Best available", span: 7, scroll: true, body: `<div class="gd-rows">${best.map(({ p, rank }) => { const v = scoutedView(state, p); const tag = mine ? "div" : `button onclick="Scout.open('${p.id}')"`;
    return `<${tag} class="gd-row ops-draft-row">${pixelFace(p, { size: 34 })}<span><b>#${rank} ${e(p.name)}</b><small>${e(p.pos)} · ${e(p.college ?? "")} · scouted ${v.range[0]}–${v.range[1]} (${v.confidence}%)</small></span><span>${mine ? `<button class="gd-btn gd-primary" onclick="Ops.pick('${p.id}')">Draft</button>` : ""}</span></${mine ? "div" : "button"}>`; }).join("")}</div>` })}
  ${K.card({ title: "Draft ticker", span: 5, scroll: true, body: ticker.length ? `<div class="gd-rows">${ticker.map((t) => K.row({ lead: t.grade, title: `#${t.slot} ${club(t.team)}: ${t.name}`, sub: `${t.pos} · consensus #${t.consensus} · ${t.line}` })).join("")}</div>` : K.empty("Picks and analyst grades appear here.") })}
  ${mine ? K.card({ title: "Trade down", span: 6, body: tradeDownOffers(state).map((o) => K.row({ lead: "↓", title: `${club(o.partner)}: #${o.swapIndex + 1} + #${o.extraIndex + 1}`, sub: `${o.value} chart points for your ${o.cost}`, trail: `<button class="gd-btn" onclick="Ops.down('${o.id}')">Accept</button>` })).join("") || K.empty("No offers to move down right now.") }) : ""}
  ${upQuotes.length ? K.card({ title: "Trade up", span: 6, body: upQuotes.map((q) => K.row({ lead: "↑", title: `Move up to #${q.targetIndex + 1} (${club(q.partner)})`, sub: `Costs ${q.pay.map((j) => `#${j + 1}`).join(" + ")} · ${q.value} pts`, trail: `<button class="gd-btn" onclick="Ops.up(${q.targetIndex})">Do it</button>` })).join("") }) : ""}</div>`;
}

/* --------------------------------------------------------------------- actions */

let searchTimer = null;
export function installOps({ isBusy }) {
  installMedical({ isBusy });
  const mutate = (fn, message) => {
    if (isBusy()) return;
    try {
      let result;
      state = S.transact(state, (s) => (result = fn(s)));
      save();
      render();
      const text = message?.(result);
      if (text) toast(text);
    } catch (err) {
      toast(err.message);
    }
  };
  window.Ops = {
    sub(key, id) {
      ui[key] = id;
      render();
    },
    treat: (id, option) => mutate((s) => chooseTreatment(s, id, option), (c) => `Treatment set: ${TREATMENTS[c.treatment].label}`),
    physio: (id) => mutate((s) => hirePhysio(s, id), (p) => `${p.name} hired`),
    day: (i, block) =>
      mutate((s) => {
        const schedule = [...ensureTraining(s).schedule];
        schedule[i] = block;
        return setSchedule(s, schedule);
      }, (p) => `Schedule updated · intensity ${p.intensity}`),
    template: (name) => mutate((s) => applyTemplate(s, name), (p) => `${name} week · intensity ${p.intensity}`),
    drill: (side, drill) => mutate((s) => setDrill(s, side, drill), () => `${drill} emphasis set`),
    target: (id, attr) => mutate((s) => setIndividualTarget(s, id, attr), (p) => (attr ? `${p.name} will focus on ${attr}` : `${p.name} back on team drills`)),
    position: (id, to) => mutate((s) => changePosition(s, id, to), (p) => `${p.name} moves to ${to}`),
    partner(t) {
      ui.partner = Number(t);
      ui.get = [];
      ui.response = null;
      ui.mk.get = { group: "all", pos: "All", q: "", page: 0 };
      render();
    },
    // Market picker and free-agent board filters (view state only).
    mk(side, key, value) {
      const f = ui.mk[side];
      if (!f) return;
      f[key] = key === "page" ? Number(value) || 0 : value;
      if (key !== "page") f.page = 0;
      render();
    },
    mkSearch(side, value) {
      clearTimeout(searchTimer);
      searchTimer = setTimeout(() => {
        if (!ui.mk[side]) return;
        ui.mk[side].q = value;
        ui.mk[side].page = 0;
        render();
        const box = document.getElementById(`mk-q-${side}`);
        if (box) {
          box.focus();
          box.setSelectionRange?.(box.value.length, box.value.length);
        }
      }, 220);
    },
    mkSort(key) {
      const f = ui.mk.fa;
      if (f.sort === key) f.dir = f.dir === "asc" ? "desc" : "asc";
      else {
        f.sort = key;
        f.dir = key === "age" || key === "ask" ? "asc" : "desc";
      }
      f.page = 0;
      render();
    },
    mkFactors() {
      ui.mk.allFactors = !ui.mk.allFactors;
      render();
    },
    mkDigest() {
      ui.digest = null;
      render();
    },
    // Opens an incoming offer in the trade builder so it can be reworked and proposed back.
    counterIncoming(id) {
      const o = state.franchise.tradeDesk?.offers.find((x) => x.id === id && x.status === "open");
      if (!o) return toast("That offer has expired.");
      ui.market = "builder";
      ui.partner = o.partner;
      ui.give = [...o.give];
      ui.get = [...o.get];
      ui.mk.get = { group: "picks", pos: "All", q: "", page: 0 };
      ui.response = { ok: true, title: `Countering the ${club(o.partner)}`, lines: ["Their offer is loaded. Change either side, then propose it back."] };
      render();
    },
    asset(side, id, on) {
      const list = side === "give" ? ui.give : ui.get;
      const i = list.indexOf(id);
      if (on && i < 0) list.push(id);
      if (!on && i >= 0) list.splice(i, 1);
      ui.response = null;
      render();
    },
    addAll(ids) {
      for (const id of String(ids).split(",").filter(Boolean)) if (!ui.give.includes(id)) ui.give.push(id);
      ui.response = null;
      render();
    },
    suggest() {
      const pkg = suggestPackage(state, ui.partner, ui.get);
      if (pkg.untouchable?.length) {
        ui.response = { ok: false, title: "Not for sale", lines: pkg.untouchable.map((u) => `${u.why}.`) };
      } else if (!pkg.covered) {
        ui.response = { ok: false, title: "Nothing you own covers it", lines: [`Your scouts expect them to want about ${pkg.target} points, more than any four of your tradeable assets are worth to them.`] };
      } else {
        ui.give = pkg.give;
        ui.response = { ok: true, title: "Suggested package", lines: [`Worth ${pkg.total} points to them against an estimated ask of ${pkg.target}. Adjust it, then propose.`] };
      }
      render();
    },
    // Opens the trade builder for one player from his scouting card, with a suggested package.
    // Also used by the player profile ("Trade for <name>").
    tradeFor(id, team) {
      applyTradeFor(state, id, team);
      ui.mk.give = { group: "all", pos: "All", q: "", page: 0 };
      ui.mk.get = { group: "all", pos: "All", q: "", page: 0 };
      if (typeof closeModal === "function") closeModal();
      if (window.W?.open) window.W.open("Market");
      else render();
    },
    propose() {
      if (isBusy()) return;
      const proposal = { partner: ui.partner, give: [...ui.give], get: [...ui.get] },
        verdict = evaluateTrade(state, proposal);
      if (!verdict.accept) {
        ui.response = { ok: false, title: `${club(ui.partner)} said no`, lines: verdict.reasons, counter: verdict.counter, factors: verdict.factors.filter((f) => f.points < 0).slice(0, 4) };
        render();
        return;
      }
      mutate((s) => executeTrade(s, proposal), (r) => {
        ui.give = [];
        ui.get = [];
        ui.response = { ok: true, title: "Trade agreed", lines: [`${r.received.map((p) => p.name).join(", ") || "Picks"} joined from the ${club(proposal.partner)}.`] };
        render();
        return `Trade done: ${r.received.map((p) => p.name).join(", ") || "picks"} acquired`;
      });
    },
    marketDay() {
      const before = ensureCalendar(state).date,
        seen = new Set(state.franchise.events.map((x) => x.id));
      mutate((s) => marketDay(s), () => {
        const items = state.franchise.events.filter((x) => !seen.has(x.id) && !/^Rumou?r/.test(x.title)).slice(0, 12);
        ui.digest = { from: before, to: ensureCalendar(state).date, items };
        render();
        return items.length ? `${items.length} market update${items.length === 1 ? "" : "s"}` : "A quiet market day";
      });
    },
    offer: (id, accept) => mutate((s) => respondToOffer(s, id, accept), () => (accept ? "Trade accepted" : "Offer declined")),
    scout: (id) => mutate((s) => hireScout(s, id), () => "Scout hired"),
    assign: (id, region, focus) =>
      mutate((s) => {
        const sc = ensureScouting(s).scouts.find((x) => x.id === id);
        return assignScout(s, id, region ?? sc.region, focus ?? sc.focus);
      }),
    classPos(pos) {
      ui.classPos = pos;
      render();
    },
    draft: (what) =>
      mutate((s) => (what === "start" ? startLiveDraft(s) : what === "next" ? stepDraft(s) : simToUserPick(s)), () => (what === "start" ? "The draft is under way" : null)),
    pick: (id) => mutate((s) => makeUserPick(s, id), (p) => `${p.name} is yours`),
    down: (id) => mutate((s) => acceptTradeDown(s, id), () => "Traded down"),
    up: (i) => mutate((s) => acceptTradeUp(s, i), () => "Traded up — you're on the clock"),
  };
}
