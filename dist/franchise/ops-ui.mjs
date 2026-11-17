// Front-office views for the Hub: Medical, Training, Market and Draft. Compact cards and
// sub-tabs instead of long tables; every mutation goes through state.transact.
import * as S from "./state.mjs";
import * as K from "../ui/kit.mjs";
import { medicalBoard, treatmentOutlook, recommendedTreatment, chooseTreatment, physioCandidates, hirePhysio, TREATMENTS } from "./medical.mjs";
import { DAYS, BLOCKS, TEMPLATES, DRILLS, POSITION_MOVES, ensureTraining, weekPlan, setSchedule, applyTemplate, setDrill, setIndividualTarget, changePosition, efficiency } from "./training.mjs";
import { evaluateTrade, executeTrade, ownedPicks, pickValue, pickLabel, playerTradeValue, teamMode, marketValue, signingFactors, respondToOffer, marketWindows, tradeBlockers, estimatedAsk, suggestPackage, scoutedTradeValue, pickEquivalent } from "./market.mjs";
import { REGIONS, ensureScouting, scoutCandidates, hireScout, assignScout, scoutedView, consensusBoard, startLiveDraft, onTheClock, stepDraft, simToUserPick, makeUserPick, tradeDownOffers, acceptTradeDown, tradeUpQuote, acceptTradeUp } from "./draft-room.mjs";
import { ensurePlayerRatings } from "./ratings.mjs";
import { scoutRange } from "./scouting.mjs";
import { offerBlockers } from "./contracts.mjs";
import { blockerText, rosterLimit, activeCount } from "./blockers.mjs";
import { marketDay } from "./world.mjs";
import { ensureCalendar, addDays } from "./calendar-core.mjs";

const e = K.escapeHTML;
const money = (cents) => `${cents < 0 ? "-" : ""}$${(Math.abs(cents) / S.MILLION).toFixed(Math.abs(cents) >= S.MILLION * 10 ? 1 : 2)}M`;
const attrName = (k) => k.replace(/([A-Z])/g, " $1").replace(/^./, (c) => c.toUpperCase());
const pct = (x) => `${Math.round(x * 100)}%`;
const ui = { training: "plan", market: "builder", draft: "scouting", partner: null, give: [], get: [], classPos: "All", response: null, digest: null };
const clubTable = () => (typeof clubs !== "undefined" ? clubs : globalThis.clubs);
const club = (t) => clubTable()?.[t]?.[2] ?? `Team ${t + 1}`;
const sub = (items, active, key) => K.tabs(items, active, `Ops.sub('${key}','$id')`, { small: true, label: key });

/* ------------------------------------------------------------------- medical */

function optionCard(c, o, recommended) {
  const risk = o.playsNow ? `${pct(o.aggravateRisk)} risk of a worse injury each game` : `${pct(o.reinjuryRisk)} re-injury risk after return`;
  const lt = o.longTerm ? Object.entries(o.longTerm.attrs || {}).map(([k, v]) => `${k} ${v}`).join(", ") || "Small rating loss" : null;
  return `<button class="gd-play-card ops-option ${o.option === recommended ? "ops-rec" : ""}" onclick="Ops.treat('${c.playerId}','${o.option}')"><b>${e(o.label)}</b><span class="ops-when">${o.playsNow ? "Available now" : `Out ~${o.weeksOut} wk${o.weeksOut === 1 ? "" : "s"}`}</span><small>${e(risk)}</small>${lt ? `<small class="gd-down">Long-term: ${e(lt)}</small>` : ""}${o.note ? `<small>${e(o.note)}</small>` : ""}<span class="ops-chips">${o.option === recommended ? K.chip("Staff pick", "good") : ""}${K.chip(o.trust >= 0 ? `Trust +${o.trust}` : `Trust ${o.trust}`, o.trust >= 0 ? "good" : o.trust <= -8 ? "bad" : "warn")}${o.cost ? K.chip(money(o.cost)) : ""}</span></button>`;
}

const PREF = { play: "He wants to play through it.", patient: "He wants to take the time and get it right.", surgery: "He'll do whatever fixes it properly." };

export function medicalView() {
  const b = medicalBoard(state),
    d = b.department;
  const decisions = b.decisions.length
    ? b.decisions
        .map((c) => {
          const rec = recommendedTreatment(state, c);
          return `<article class="ops-case"><header><span class="gd-pos">${e(c.player.pos)}</span><div><b>${e(c.player.name)}</b><small>${e(c.label)} · est. ${c.estimate[0]}–${c.estimate[1]} weeks</small></div>${K.chip(c.tier, c.tier === "season" ? "bad" : c.tier === "major" ? "warn" : "")}</header><p class="ops-quote">“${e(PREF[c.preference])}”</p><div class="gd-deck">${c.options.map((o) => optionCard(c, treatmentOutlook(state, c, o), rec)).join("")}</div></article>`;
        })
        .join("")
    : K.empty("No treatment decisions waiting. New injuries appear here with their options.");
  const recovering = [...b.treating, ...b.playingThrough];
  const board = recovering.length
    ? `<div class="gd-rows">${recovering.map((c) => K.row({ lead: c.player.pos, title: c.player.name, sub: `${c.label} · ${TREATMENTS[c.treatment]?.label ?? "Rehab"}`, trail: c.status === "playing-through" ? K.chip("Playing hurt", "warn") : `<span class="gd-ovr">${c.player.injury}w</span>` })).join("")}</div>`
    : K.empty("Nobody in the treatment room.");
  const pool = physioCandidates(state);
  return `<div class="gd-toolbar"><span style="display:flex;gap:6px;flex-wrap:wrap">${K.chip(`${b.decisions.length} decisions`, b.decisions.length ? "warn" : "")}${K.chip(`${b.treating.length} in treatment`)}${b.playingThrough.length ? K.chip(`${b.playingThrough.length} playing hurt`, "bad") : ""}</span><small style="color:var(--gd-text-3)">Undecided cases follow the staff recommendation after the next game.</small></div>
  <div class="gd-bento">${K.card({ title: "Treatment decisions", span: 8, accent: true, body: decisions })}${K.card({ title: "Recovery board", span: 4, body: board })}
  ${K.card({ title: "Medical department", span: 6, body: `${K.stats([["Team doctor", d.doctor.vacant ? "Vacant" : d.doctor.diagnosis, d.doctor.vacant ? "Hire in Staff" : d.doctor.name], ["Physio recovery", d.physio.recovery, d.physio.name], ["Prevention", d.physio.prevention], ["Facilities", `Lvl ${d.facilities}`]])}<p style="margin:0;font-size:12px;color:var(--gd-text-2)">The doctor narrows diagnosis ranges and improves surgical outcomes; the physio speeds rehab and cuts re-injury risk.</p>` })}
  ${K.card({ title: "Physio market", span: 6, body: `<div class="gd-rows">${pool.map((x) => K.row({ lead: "PT", title: x.name, sub: `Recovery ${x.recovery} · Prevention ${x.prevention}`, trail: `<button class="gd-btn" onclick="Ops.physio('${x.id}')">Hire · ${money(x.salary)}</button>` })).join("") || K.empty("No candidates this year.")}</div>` })}
  ${K.card({ title: "Case history", span: 12, body: b.history.length ? `<div class="gd-rows">${b.history.map((c) => K.row({ lead: `W${(c.opened?.week ?? 0) + 1}`, title: `${state.roster.find((p) => p.id === c.playerId)?.name ?? "Former player"} — ${c.label}`, sub: `${TREATMENTS[c.treatment]?.label ?? "Rehab"}${c.aggravations ? ` · aggravated ×${c.aggravations}` : ""}` })).join("")}</div>` : K.empty("No completed cases yet.") })}</div>`;
}

/* ------------------------------------------------------------------- training */

export function trainingView() {
  const t = ensureTraining(state),
    plan = weekPlan(state);
  if (ui.training === "players") return trainingPlayers();
  const days = DAYS.map((day, i) => {
    const b = BLOCKS[t.schedule[i]];
    return `<div class="ops-day"><span class="gd-eyebrow">${day}</span><select aria-label="${day} block" onchange="Ops.day(${i},this.value)">${Object.entries(BLOCKS).map(([k, v]) => `<option value="${k}" ${t.schedule[i] === k ? "selected" : ""}>${e(v.label)}</option>`).join("")}</select><small>Load ${b.intensity} · fatigue ${b.fatigue > 0 ? "+" : ""}${b.fatigue}</small></div>`;
  }).join("");
  const drill = (side) => {
    const current = t.drills[side],
      def = DRILLS[side][current];
    return `<label class="ops-drill"><span>${side === "offense" ? "Offense" : "Defense"} emphasis</span><select onchange="Ops.drill('${side}',this.value)">${Object.keys(DRILLS[side]).map((k) => `<option ${k === current ? "selected" : ""}>${e(k)}</option>`).join("")}</select><small>${def.positions.join(", ")} · ${def.attrs.map(attrName).join(", ")}</small></label>`;
  };
  return `<div class="gd-toolbar">${sub([["plan", "Weekly plan"], ["players", "Individual plans"]], ui.training, "training")}<span style="display:flex;gap:6px">${Object.keys(TEMPLATES).map((k) => `<button class="gd-btn" onclick="Ops.template('${e(k)}')">${e(k)}</button>`).join("")}</span></div>
  <div class="gd-bento">${K.card({ title: "This week's schedule", span: 8, accent: true, body: `<div class="ops-week">${days}</div>` })}
  ${K.card({ title: "Projected effect", span: 4, body: `${K.meter("Intensity", plan.intensity, { color: K.tone(100 - plan.intensity, 50, 25) })}${K.meter("Injury risk", Math.min(100, plan.risk * 25), { color: K.tone(100 - plan.risk * 25, 60, 30) })}${K.meter("Familiarity", t.familiarity, { color: K.tone(t.familiarity) })}${K.meter("Readiness", t.readiness, { color: K.tone(t.readiness) })}<div style="display:flex;gap:6px;flex-wrap:wrap">${K.chip(`${plan.restDays} rest day${plan.restDays === 1 ? "" : "s"}`)}${K.chip(`Fatigue ${plan.fatigue > 0 ? "+" : ""}${plan.fatigue}`, plan.fatigue > 10 ? "warn" : "")}${K.chip(`Growth ×${plan.development}`)}</div>${K.sparkline(t.history.slice().reverse().map((h) => h.readiness))}` })}
  ${K.card({ title: "Unit drills", span: 6, body: `${drill("offense")}${drill("defense")}` })}
  ${K.card({ title: "How training works", span: 6, body: `<p style="margin:0;font-size:12px;color:var(--gd-text-2)">Intensity sets fatigue, wear and injury risk for the week. Install, film and walkthroughs build scheme familiarity; padded work and conditioning grow attributes faster but cost freshness. Coordinator quality, facilities and scheme fit scale how much players improve.</p>` })}</div>`;
}

function trainingPlayers() {
  const players = state.roster.filter((p) => !p.injury).sort((a, b) => (b.pot - b.ovr) - (a.pot - a.ovr)).slice(0, 14);
  const rows = players
    .map((p) => {
      const r = ensurePlayerRatings(p),
        attrs = Object.keys(r.attributes || {}).slice(0, 18),
        target = p.progression?.target ?? "",
        moves = POSITION_MOVES[p.pos] || [];
      return `<div class="ops-player"><span class="gd-pos">${e(p.pos)}</span><span><b>${e(p.name)}</b><small>${p.age} yrs · ${p.ovr} → ${p.pot} · efficiency ×${efficiency(state, p)}${p.positionChange && p.positionChange.familiarity < 100 ? ` · learning ${p.positionChange.to} ${p.positionChange.familiarity}%` : ""}</small></span><select aria-label="Training target for ${e(p.name)}" onchange="Ops.target('${p.id}',this.value)"><option value="">Team drills only</option>${attrs.map((a) => `<option value="${a}" ${a === target ? "selected" : ""}>${attrName(a)}</option>`).join("")}</select>${moves.length ? `<select aria-label="Position change for ${e(p.name)}" onchange="if(this.value)Ops.position('${p.id}',this.value)"><option value="">Keep at ${p.pos}</option>${moves.map((m) => `<option value="${m}">Move to ${m}</option>`).join("")}</select>` : "<span></span>"}</div>`;
    })
    .join("");
  return `<div class="gd-toolbar">${sub([["plan", "Weekly plan"], ["players", "Individual plans"]], ui.training, "training")}<small style="color:var(--gd-text-3)">Players with the most headroom first. Targets get double reps; position moves cost rating now and are earned back with practice.</small></div><div class="gd-bento">${K.card({ title: "Individual development", span: 12, accent: true, body: `<div class="ops-players">${rows}</div>` })}</div>`;
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

function assetList(team, picked, side) {
  const mine = team === state.team,
    all = (mine ? state.roster : state.franchise.clubs[team].players).filter((p) => (!p.status || p.status === "active") && (!p.injury || !mine)),
    players = all
      .map((p) => {
        const v = mine ? { estimate: playerTradeValue(state, p, ui.partner), exact: true } : scoutedTradeValue(state, p, state.team, team);
        return { p, v };
      })
      .sort((a, b) => b.v.estimate - a.v.estimate)
      .filter((x, i) => i < 16 || picked.includes(x.p.id));
  const picks = ownedPicks(state, team).slice(0, 8);
  const item = (id, title, sub, value, extra = "") => `<label class="ops-asset ${picked.includes(id) ? "on" : ""}"><input type="checkbox" ${picked.includes(id) ? "checked" : ""} onchange="Ops.asset('${side}','${id}',this.checked)"><span><b>${e(title)}</b><small>${sub}</small></span><span class="gd-ovr">${value}</span>${extra}</label>`;
  return (
    players
      .map(({ p, v }) => {
        const view = mine ? null : scoutRange(state, p, team),
          ovr = mine || view.exact ? `${p.ovr} OVR` : `<span class="ops-fogged">${view.label} OVR (scouted ${view.confidence}%)</span>`,
          value = v.exact ? v.estimate : `${v.low}–${v.high}`,
          report = `<button type="button" class="gd-link ops-report" onclick="event.preventDefault();Scout.open('${p.id}')">Report</button>`;
        return item(p.id, `${p.pos} ${p.name}`, `${ovr} · ${p.age} yrs`, value, report);
      })
      .join("") + picks.map((x) => item(x.id, pickLabel(state, x), "Draft pick", pickValue(state, x))).join("")
  );
}

function tradeDesk() {
  const proposal = { partner: ui.partner, give: ui.give, get: ui.get },
    blockers = tradeBlockers(state, proposal).filter((b) => ui.give.length && ui.get.length ? true : !/at least one player or pick/.test(b.reason)),
    sending = ui.give.reduce((n, id) => {
      if (id.startsWith("pk-")) return n + pickValue(state, state.franchise.pickLedger.find((x) => x.id === id));
      const p = state.roster.find((x) => x.id === id);
      return n + (p ? playerTradeValue(state, p, ui.partner) : 0);
    }, 0),
    ask = ui.get.length ? estimatedAsk(state, ui.partner, ui.get) : null;
  let body = "";
  if (!ui.get.length) body += `<p class="ops-help">1. Tick the players or picks you want from the ${e(club(ui.partner))}. 2. Press <b>Suggest a package</b> or pick what you send. 3. Propose.</p>`;
  if (blockers.length) body += `<p class="ops-label">Can't be proposed yet</p>${blockList(blockers)}`;
  if (ask) {
    const verdict = sending >= ask.high ? ["Likely accepted", "good"] : sending >= ask.low ? ["Borderline", "warn"] : ["Likely refused", "bad"];
    body += `${K.stats([["You send", `${sending} pts`, ui.give.length ? pickEquivalent(sending) : "Nothing yet"], ["They want", ask.exact ? `${ask.estimate} pts` : `${ask.low}–${ask.high} pts`, ask.exact ? "Exact: fully scouted" : "Your scouts' estimate"]])}<p class="ops-verdict">${K.chip(ui.give.length ? verdict[0] : "Add what you send", ui.give.length ? verdict[1] : "")} ${ask.exact ? "" : `<small>Unscouted players make this a guess. Request a report to narrow it.</small>`}</p><button class="gd-btn" onclick="Ops.suggest()">Suggest a package</button>`;
  }
  if (ui.response) body += `<div class="ops-response ${ui.response.ok ? "good" : "bad"}"><b>${e(ui.response.title)}</b>${ui.response.lines.map((l) => `<p>${e(l)}</p>`).join("")}${ui.response.counter ? `<button class="gd-btn" onclick="Ops.asset('give','${ui.response.counter.add}',true)">Add ${e(ui.response.counter.label)} and try again</button>` : ""}</div>`;
  const reason = blockers[0] ? blockerText(blockers[0]) : "";
  body += `<button class="gd-btn gd-primary" ${blockers.length || !ui.get.length || !ui.give.length ? "disabled" : ""} title="${e(reason || (!ui.give.length || !ui.get.length ? "Add at least one player or pick on each side." : "Send this offer to their front office."))}" onclick="Ops.propose()">Propose trade</button>`;
  return body;
}

function freeAgentTable() {
  const agents = (state.agents || []).slice().sort((a, b) => b.ovr - a.ovr).slice(0, 30),
    cheapest = agents.slice().sort((a, b) => a.salary - b.salary)[0],
    general = cheapest ? offerBlockers(state, cheapest.id) : [],
    mine = state.franchise.market.offers.filter((o) => o.team === state.team);
  const rows = agents
    .map((p) => {
      const v = scoutRange(state, p, -1),
        f = signingFactors(state, p, state.team),
        bids = state.franchise.market.offers.filter((o) => o.playerId === p.id),
        own = mine.find((o) => o.playerId === p.id),
        block = offerBlockers(state, p.id)[0];
      return `<tr><td><span class="gd-pos">${e(p.pos)}</span> <b>${e(p.name)}</b><small>${p.age} yrs</small></td><td>${v.exact ? p.ovr : `<span class="ops-fogged">${v.label}</span>`}</td><td>${money(Math.round(p.salary * S.MILLION))}/yr</td><td>${K.chip(`×${f.total}`, f.total >= 1.05 ? "good" : f.total <= 0.95 ? "bad" : "")}<small>${bids.length} bid${bids.length === 1 ? "" : "s"}</small></td><td>${own ? K.chip(`Your offer: decided market day ${own.close}`, "good") : ""}<span class="ops-actions"><button class="gd-btn" onclick="Scout.open('${p.id}')">Report</button><button class="gd-btn gd-primary" ${block ? "disabled" : ""} title="${e(block ? blockerText(block) : "Open contract talks")}" onclick="Neg.open('${p.id}')">Negotiate</button></span></td></tr>`;
    })
    .join("");
  return `${general.length ? `<div class="ops-callout"><b>Contract offers are blocked right now</b>${blockList(general)}</div>` : ""}<div class="hub-table-scroll"><table class="ops-table"><thead><tr><th>Player</th><th>Overall</th><th>Asking</th><th>Pull / bids</th><th>Action</th></tr></thead><tbody>${rows || `<tr><td colspan="5">No free agents available right now.</td></tr>`}</tbody></table></div>`;
}

// Why the "Next market day" button cannot move the calendar, or null.
function marketDayBlocker() {
  const c = ensureCalendar(state);
  if (state.live) return "Finish the live game first.";
  if (state.phase !== "offseason" && c.nextRoundDate && addDays(c.date, 1) > c.nextRoundDate) return `This week's game (${c.nextRoundDate}) comes first. Play it, and the market settles with the round.`;
  return null;
}

function marketClock() {
  const block = marketDayBlocker(),
    d = ui.digest;
  return `<div class="ops-clock"><div><b>Market clock · ${e(ensureCalendar(state).date)} · market day ${state.franchise.market.day}</b><small>Each market day, players decide on offers whose deadline has arrived, CPU clubs bid, and waiver claims are awarded. In season this also happens automatically after every game week.</small></div><button class="gd-btn" ${block ? "disabled" : ""} title="${e(block || "Move the calendar forward one day")}" onclick="Ops.marketDay()">Next market day →</button>${block ? `<small class="ops-why">${e(block)}</small>` : ""}</div>${d ? `<div class="ops-digest"><b>${e(d.from)} → ${e(d.to)}</b>${d.items.length ? `<ul>${d.items.map((x) => `<li><b>${e(x.title)}</b> ${e(x.body)}</li>`).join("")}</ul>` : `<p>A quiet day: no offer reached its deadline and no claims were due.</p>`}</div>` : ""}`;
}

export function marketView() {
  const offers = state.franchise.tradeDesk?.offers.filter((o) => o.status === "open") ?? [];
  const tabs = sub([["builder", "Trade builder"], ["offers", `Offers${offers.length ? ` (${offers.length})` : ""}`], ["agents", "Free agents"]], ui.market, "market");
  const head = `<div class="gd-toolbar">${tabs}<span style="display:flex;gap:6px;flex-wrap:wrap">${K.chip(`You: ${teamMode(state, state.team)}`, "team")}${K.chip(`Cap room ${money(S.capLedger(state).room)}`)}${K.chip(`Roster ${activeCount(state)}/${rosterLimit(state)}`)}</span></div>${windowStrip()}`;
  if (ui.market === "offers")
    return `${head}<div class="gd-bento">${K.card({ title: "Offers on the table", span: 12, accent: true, body: offers.length ? `<div class="gd-rows">${offers.map((o) => { const p = state.roster.find((x) => x.id === o.playerId), block = tradeBlockers(state, { partner: o.partner, give: o.give, get: o.get })[0]; return K.row({ lead: p?.pos ?? "?", title: `${club(o.partner)} want ${p?.name ?? "a player"}`, sub: `${o.get.map((id) => pickLabel(state, state.franchise.pickLedger.find((x) => x.id === id))).join(" + ")} · expires week ${o.expires}${block ? ` · ${blockerText(block)}` : ""}`, trail: `<span style="display:flex;gap:6px"><button class="gd-btn gd-primary" ${block ? "disabled" : ""} title="${e(block ? blockerText(block) : "Accept")}" onclick="Ops.offer('${o.id}',true)">Accept</button><button class="gd-btn" onclick="Ops.offer('${o.id}',false)">Decline</button></span>` }); }).join("")}</div>` : K.empty("Contending clubs make offers for your players in the three weeks before the trade deadline.") })}</div>`;
  if (ui.market === "agents") return `${head}${marketClock()}<div class="gd-bento">${K.card({ title: "Free agents", span: 12, accent: true, body: freeAgentTable() })}</div>`;
  const partners = Array.from({ length: 32 }, (_, i) => i).filter((i) => i !== state.team);
  if (ui.partner == null || ui.partner === state.team) ui.partner = partners[0];
  return `${head}<div class="gd-bento">${K.card({ title: "You send", span: 4, scroll: true, body: `<div class="ops-assets">${assetList(state.team, ui.give, "give")}</div>` })}${K.card({ title: "You receive", span: 4, scroll: true, action: `<select aria-label="Trade partner" onchange="Ops.partner(this.value)">${partners.map((t) => `<option value="${t}" ${t === ui.partner ? "selected" : ""}>${e(club(t))} · ${teamMode(state, t)}</option>`).join("")}</select>`, body: `<div class="ops-assets">${assetList(ui.partner, ui.get, "get")}</div>` })}${K.card({ title: "Their front office", span: 4, accent: true, body: tradeDesk() })}</div>`;
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
  return `<div class="gd-bento">${K.card({ title: "Prospects (consensus order) — fog of war by scouting confidence", span: 12, accent: true, body: `<div class="ops-class">${board.map(({ p, rank }) => { const v = scoutedView(state, p); return `<article class="ops-prospect"><header><span class="gd-pos">${e(p.pos)}</span><span><b>#${rank} <button class="gd-link" onclick="Scout.open('${p.id}')">${e(p.name)}</button></b><small>${e(p.college ?? "")} · ${e(v.region)} · ${e(p.archetype ?? "")}</small></span><span class="gd-ovr">${v.range[0]}–${v.range[1]}</span></header><small>${e(v.storyline)}</small><div class="ops-reveal">${v.combine ? `<span>40 ${v.combine.forty}s · bench ${v.combine.bench} · vert ${v.combine.vertical}"</span>` : "<span class='ops-fog'>Combine: needs 40% confidence</span>"}${v.film != null ? `<span>Film ${v.film}</span>` : "<span class='ops-fog'>Film: 55%</span>"}${v.medical ? `<span class="${v.medical === "No red flags" ? "" : "gd-down"}">${e(v.medical)}</span>` : "<span class='ops-fog'>Medical: 70%</span>"}${v.personality ? `<span>Work ethic ${v.personality.workEthic}${v.personality.character ? ` · <b class="gd-down">${e(v.personality.character)}</b>` : ""}</span>` : ""}${v.sleeperOdds != null ? `<span class="gd-up">Sleeper ${v.sleeperOdds}%</span><span class="gd-down">Bust ${v.bustOdds}%</span>` : ""}</div>${K.meter("Confidence", v.confidence)}</article>`; }).join("")}</div>` })}</div>`;
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
  ${K.card({ title: mine ? "Best available — make your pick" : "Best available", span: 7, scroll: true, body: `<div class="gd-rows">${best.map(({ p, rank }) => { const v = scoutedView(state, p); return K.row({ onclick: mine ? null : `Scout.open('${p.id}')`, lead: p.pos, title: `#${rank} ${p.name}`, sub: `${p.college ?? ""} · scouted ${v.range[0]}–${v.range[1]} (${v.confidence}%)`, trail: mine ? `<button class="gd-btn gd-primary" onclick="Ops.pick('${p.id}')">Draft</button>` : "" }); }).join("")}</div>` })}
  ${K.card({ title: "Draft ticker", span: 5, scroll: true, body: ticker.length ? `<div class="gd-rows">${ticker.map((t) => K.row({ lead: t.grade, title: `#${t.slot} ${club(t.team)}: ${t.name}`, sub: `${t.pos} · consensus #${t.consensus} · ${t.line}` })).join("")}</div>` : K.empty("Picks and analyst grades appear here.") })}
  ${mine ? K.card({ title: "Trade down", span: 6, body: tradeDownOffers(state).map((o) => K.row({ lead: "↓", title: `${club(o.partner)}: #${o.swapIndex + 1} + #${o.extraIndex + 1}`, sub: `${o.value} chart points for your ${o.cost}`, trail: `<button class="gd-btn" onclick="Ops.down('${o.id}')">Accept</button>` })).join("") || K.empty("No offers to move down right now.") }) : ""}
  ${upQuotes.length ? K.card({ title: "Trade up", span: 6, body: upQuotes.map((q) => K.row({ lead: "↑", title: `Move up to #${q.targetIndex + 1} (${club(q.partner)})`, sub: `Costs ${q.pay.map((j) => `#${j + 1}`).join(" + ")} · ${q.value} pts`, trail: `<button class="gd-btn" onclick="Ops.up(${q.targetIndex})">Do it</button>` })).join("") }) : ""}</div>`;
}

/* --------------------------------------------------------------------- actions */

export function installOps({ isBusy }) {
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
    suggest() {
      const pkg = suggestPackage(state, ui.partner, ui.get);
      if (!pkg.covered) {
        ui.response = { ok: false, title: "Nothing you own covers it", lines: [`Your scouts expect them to want about ${pkg.target} points, more than any four of your tradeable assets are worth to them.`] };
      } else {
        ui.give = pkg.give;
        ui.response = { ok: true, title: "Suggested package", lines: [`Worth ${pkg.total} points to them against an estimated ask of ${pkg.target}. Adjust it, then propose.`] };
      }
      render();
    },
    // Opens the trade builder for one player from his scouting card, with a suggested package.
    tradeFor(id, team) {
      ui.market = "builder";
      ui.partner = Number(team);
      ui.get = [id];
      ui.give = [];
      if (typeof closeModal === "function") closeModal();
      Ops.suggest();
      window.W?.open?.("Market");
    },
    propose() {
      if (isBusy()) return;
      const proposal = { partner: ui.partner, give: [...ui.give], get: [...ui.get] },
        verdict = evaluateTrade(state, proposal);
      if (!verdict.accept) {
        ui.response = { ok: false, title: `${club(ui.partner)} said no`, lines: verdict.reasons, counter: verdict.counter };
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
