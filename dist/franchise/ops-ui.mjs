// Front-office views for the Hub: Medical, Training, Market and Draft. Compact cards and
// sub-tabs instead of long tables; every mutation goes through state.transact.
import * as S from "./state.mjs";
import * as K from "../ui/kit.mjs";
import { medicalBoard, treatmentOutlook, recommendedTreatment, chooseTreatment, physioCandidates, hirePhysio, TREATMENTS } from "./medical.mjs";
import { DAYS, BLOCKS, TEMPLATES, DRILLS, POSITION_MOVES, ensureTraining, weekPlan, setSchedule, applyTemplate, setDrill, setIndividualTarget, changePosition, efficiency } from "./training.mjs";
import { evaluateTrade, executeTrade, ownedPicks, pickValue, pickLabel, playerTradeValue, teamMode, marketValue, signingFactors, respondToOffer, deadlinePressure } from "./market.mjs";
import { REGIONS, ensureScouting, scoutCandidates, hireScout, assignScout, scoutedView, consensusBoard, startLiveDraft, onTheClock, stepDraft, simToUserPick, makeUserPick, tradeDownOffers, acceptTradeDown, tradeUpQuote, acceptTradeUp } from "./draft-room.mjs";
import { ensurePlayerRatings } from "./ratings.mjs";

const e = K.escapeHTML;
const money = (cents) => `${cents < 0 ? "-" : ""}$${(Math.abs(cents) / S.MILLION).toFixed(Math.abs(cents) >= S.MILLION * 10 ? 1 : 2)}M`;
const attrName = (k) => k.replace(/([A-Z])/g, " $1").replace(/^./, (c) => c.toUpperCase());
const pct = (x) => `${Math.round(x * 100)}%`;
const ui = { training: "plan", market: "builder", draft: "scouting", partner: null, give: [], get: [], classPos: "All" };
const club = (t) => globalThis.clubs?.[t]?.[2] ?? `Team ${t + 1}`;
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

function assetList(team, picked, side) {
  const players = (team === state.team ? state.roster : state.franchise.clubs[team].players)
    .filter((p) => !p.injury || team !== state.team)
    .map((p) => ({ p, v: playerTradeValue(state, p, team === state.team ? ui.partner : state.team) }))
    .sort((a, b) => b.v - a.v)
    .slice(0, 14);
  const picks = ownedPicks(state, team).slice(0, 8);
  const item = (id, title, sub, value) => `<label class="ops-asset ${picked.includes(id) ? "on" : ""}"><input type="checkbox" ${picked.includes(id) ? "checked" : ""} onchange="Ops.asset('${side}','${id}',this.checked)"><span><b>${e(title)}</b><small>${e(sub)}</small></span><span class="gd-ovr">${value}</span></label>`;
  return players.map(({ p, v }) => item(p.id, `${p.pos} ${p.name}`, `${p.ovr} OVR · ${p.age} yrs`, v)).join("") + picks.map((x) => item(x.id, pickLabel(state, x), "Draft pick", pickValue(state, x))).join("");
}

export function marketView() {
  const tabs = sub([["builder", "Trade builder"], ["offers", "Offers"], ["agents", "Free agents"]], ui.market, "market");
  const pressure = deadlinePressure(state);
  const head = `<div class="gd-toolbar">${tabs}<span style="display:flex;gap:6px;flex-wrap:wrap">${K.chip(`You: ${teamMode(state, state.team)}`, "team")}${state.phase === "season" ? K.chip(state.week >= (state.franchise.rules?.tradeDeadline || 9) ? "Deadline passed" : `Deadline week ${(state.franchise.rules?.tradeDeadline || 9) + 1}`, pressure > 0.5 ? "bad" : "") : ""}${K.chip(`Cap room ${money(S.capLedger(state).room)}`)}</span></div>`;
  if (ui.market === "offers") {
    const offers = state.franchise.tradeDesk?.offers.filter((o) => o.status === "open") ?? [];
    return `${head}<div class="gd-bento">${K.card({ title: "Offers on the table", span: 12, accent: true, body: offers.length ? `<div class="gd-rows">${offers.map((o) => { const p = state.roster.find((x) => x.id === o.playerId); return K.row({ lead: p?.pos ?? "?", title: `${club(o.partner)} want ${p?.name ?? "a player"}`, sub: o.get.map((id) => pickLabel(state, state.franchise.pickLedger.find((x) => x.id === id))).join(" + "), trail: `<span style="display:flex;gap:6px"><button class="gd-btn gd-primary" onclick="Ops.offer('${o.id}',true)">Accept</button><button class="gd-btn" onclick="Ops.offer('${o.id}',false)">Decline</button></span>` }); }).join("")}</div>` : K.empty("Contenders make offers in the final weeks before the trade deadline.") })}</div>`;
  }
  if (ui.market === "agents") {
    const agents = (state.agents || []).slice().sort((a, b) => b.ovr - a.ovr).slice(0, 12);
    return `${head}<div class="gd-bento">${K.card({ title: "Free agents — what they care about", span: 12, accent: true, body: agents.length ? `<div class="ops-agents">${agents.map((p) => { const f = signingFactors(state, p, state.team); return `<article class="ops-agent"><header><span class="gd-pos">${e(p.pos)}</span><span><b>${e(p.name)}</b><small>${p.ovr} OVR · ${p.age} yrs · market ${money(marketValue(p))}/yr</small></span>${K.chip(`×${f.total} pull`, f.total >= 1.05 ? "good" : f.total <= 0.95 ? "bad" : "")}</header><div class="ops-factors">${f.factors.map((x) => `<span class="${x.value > 0 ? "gd-up" : x.value < 0 ? "gd-down" : ""}">${e(x.key)}: ${e(x.detail)}</span>`).join("")}</div><button class="gd-btn" onclick="Neg.open('${p.id}')">Negotiate →</button></article>`; }).join("")}</div>` : K.empty("No free agents available right now.") })}</div>`;
  }
  const partners = Array.from({ length: 32 }, (_, i) => i).filter((i) => i !== state.team);
  if (ui.partner == null || ui.partner === state.team) ui.partner = partners[0];
  let verdict = null;
  try {
    if (ui.give.length && ui.get.length) verdict = evaluateTrade(state, { partner: ui.partner, give: ui.give, get: ui.get });
  } catch (err) {
    verdict = { error: err.message };
  }
  const panel = !verdict
    ? K.empty("Pick at least one asset on each side to see how they value it.")
    : verdict.error
      ? `<p class="gd-down">${e(verdict.error)}</p>`
      : `${K.meter("They receive", verdict.receives, { max: Math.max(verdict.required, verdict.receives, 1), color: verdict.accept ? "var(--gd-good)" : "var(--gd-warn)" })}${K.meter("They need", verdict.required, { max: Math.max(verdict.required, verdict.receives, 1) })}${K.stats([["Your cap after", money(verdict.capAfter.you), "", Math.sign(verdict.capAfter.you)], ["Their cap after", money(verdict.capAfter.them), "", Math.sign(verdict.capAfter.them)]])}${verdict.reasons.map((r) => `<p class="gd-down" style="margin:0;font-size:12px">${e(r)}</p>`).join("")}${verdict.counter ? `<button class="gd-btn" onclick="Ops.asset('give','${verdict.counter.add}',true)">Add ${e(verdict.counter.label)} to balance it</button>` : ""}<button class="gd-btn gd-primary" ${verdict.accept ? "" : "disabled"} onclick="Ops.propose()">${verdict.accept ? "Make the trade" : "They'd decline"}</button>`;
  return `${head}<div class="gd-bento">${K.card({ title: "You send", span: 4, scroll: true, body: `<div class="ops-assets">${assetList(state.team, ui.give, "give")}</div>` })}${K.card({ title: "You receive", span: 4, scroll: true, action: `<select aria-label="Trade partner" onchange="Ops.partner(this.value)">${partners.map((t) => `<option value="${t}" ${t === ui.partner ? "selected" : ""}>${e(club(t))} · ${teamMode(state, t)}</option>`).join("")}</select>`, body: `<div class="ops-assets">${assetList(ui.partner, ui.get, "get")}</div>` })}${K.card({ title: "Their front office", span: 4, accent: true, body: panel })}</div>`;
}

/* ---------------------------------------------------------------------- draft */

export function draftView({ pipeline } = {}) {
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
  return `<div class="gd-bento">${K.card({ title: "Prospects (consensus order) — fog of war by scouting confidence", span: 12, accent: true, body: `<div class="ops-class">${board.map(({ p, rank }) => { const v = scoutedView(state, p); return `<article class="ops-prospect"><header><span class="gd-pos">${e(p.pos)}</span><span><b>#${rank} ${e(p.name)}</b><small>${e(p.college ?? "")} · ${e(v.region)} · ${e(p.archetype ?? "")}</small></span><span class="gd-ovr">${v.range[0]}–${v.range[1]}</span></header><small>${e(v.storyline)}</small><div class="ops-reveal">${v.combine ? `<span>40 ${v.combine.forty}s · bench ${v.combine.bench} · vert ${v.combine.vertical}"</span>` : "<span class='ops-fog'>Combine: needs 40% confidence</span>"}${v.film != null ? `<span>Film ${v.film}</span>` : "<span class='ops-fog'>Film: 55%</span>"}${v.medical ? `<span class="${v.medical === "No red flags" ? "" : "gd-down"}">${e(v.medical)}</span>` : "<span class='ops-fog'>Medical: 70%</span>"}${v.personality ? `<span>Work ethic ${v.personality.workEthic}${v.personality.character ? ` · <b class="gd-down">${e(v.personality.character)}</b>` : ""}</span>` : ""}${v.sleeperOdds != null ? `<span class="gd-up">Sleeper ${v.sleeperOdds}%</span><span class="gd-down">Bust ${v.bustOdds}%</span>` : ""}</div>${K.meter("Confidence", v.confidence)}</article>`; }).join("")}</div>` })}</div>`;
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
  ${K.card({ title: mine ? "Best available — make your pick" : "Best available", span: 7, scroll: true, body: `<div class="gd-rows">${best.map(({ p, rank }) => { const v = scoutedView(state, p); return K.row({ lead: p.pos, title: `#${rank} ${p.name}`, sub: `${p.college ?? ""} · scouted ${v.range[0]}–${v.range[1]} (${v.confidence}%)`, trail: mine ? `<button class="gd-btn gd-primary" onclick="Ops.pick('${p.id}')">Draft</button>` : "" }); }).join("")}</div>` })}
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
      render();
    },
    asset(side, id, on) {
      const list = side === "give" ? ui.give : ui.get;
      const i = list.indexOf(id);
      if (on && i < 0) list.push(id);
      if (!on && i >= 0) list.splice(i, 1);
      render();
    },
    propose: () =>
      mutate((s) => executeTrade(s, { partner: ui.partner, give: [...ui.give], get: [...ui.get] }), (r) => {
        ui.give = [];
        ui.get = [];
        return `Trade done: ${r.received.map((p) => p.name).join(", ") || "picks"} acquired`;
      }),
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
