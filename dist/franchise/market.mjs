// Market engine: player valuation, non-monetary signing factors, a draft-pick ledger and
// value chart, multi-asset AI trade evaluation and execution, and trade-deadline offers.
// Contract structures (bonuses, guarantees, incentives, void years, cap hits) already live in
// contracts.mjs/state.mjs and are reused here, never re-implemented.
import { random, clamp } from "../engine/random.mjs";
import { identitySeed } from "./newgens.mjs";
import { MILLION, capLedger, capHit, roster, log, financeYear, bonusCharge } from "./state.mjs";
import { setCooldown, cooldownRemaining, fanReaction, coachReputation } from "./career-systems.mjs";
import { reactTo } from "./social-engine.mjs";
import { ensureCalendar, leagueDates, seasonAnchor, addDays } from "./calendar-core.mjs";
import { scoutRange } from "./scouting.mjs";
import { roleBlocker, capShortfall, rosterFull, rosterLimit, activeCount, blockerText, moneyText } from "./blockers.mjs";

// Clubs live in a classic-script global in the browser; Node tests run without it.
const clubTable = () => (typeof clubs !== "undefined" ? clubs : globalThis.clubs);

const POS_WEIGHT = { QB: 1.6, DL: 1.15, OL: 1.05, WR: 1.05, CB: 1.0, TE: 0.8, LB: 0.85, S: 0.85, RB: 0.7, K: 0.2, P: 0.2 };
const STARTERS = { QB: 1, RB: 1, WR: 3, TE: 1, OL: 5, DL: 4, LB: 3, CB: 3, S: 2, K: 1, P: 1 };

/* ------------------------------------------------------------------ team context */

export function teamMode(s, team) {
  const t = s.teams?.[team],
    games = t ? t.w + t.l : 0,
    pct = games ? t.w / games : null,
    rating = t?.rating ?? 75;
  if (s.phase === "season" && pct != null && games >= 4) return pct >= 0.6 ? "Contender" : pct <= 0.35 ? "Rebuilding" : "Middle";
  return rating >= 83 ? "Contender" : rating <= 74 ? "Rebuilding" : "Middle";
}

const tradeDeadline = (s) => s.franchise.rules?.tradeDeadline || 9;
export const deadlinePressure = (s) => (s.phase === "season" ? clamp(1 - (tradeDeadline(s) - s.week) / 3, 0, 1) : 0);

/* ------------------------------------------------------------------- windows */

const draftLive = (s) => !!(s.franchise.draft && s.franchise.draft.year === s.year && s.franchise.draft.cursor < s.franchise.draft.picks.length);
const draftDone = (s) => !!(s.franchise.draft && s.franchise.draft.year === s.year && s.franchise.draft.cursor >= s.franchise.draft.picks.length);

// When trading, free agency and the draft are open, with exact dates from the league calendar.
// Each window: { open, status, detail, date? } — status is a short label, detail one sentence.
export function marketWindows(s) {
  const today = ensureCalendar(s).date,
    dates = leagueDates(s.year, s.schedule?.length || 18),
    anchor = seasonAnchor(s.year),
    deadlineWeek = tradeDeadline(s),
    // Trades are allowed while s.week < deadline: they close once that week's games are played.
    deadlineDate = addDays(anchor, (deadlineWeek - 1) * 7 + 6),
    nextDeadline = addDays(seasonAnchor(s.year + 1), (deadlineWeek - 1) * 7 + 6),
    market = s.franchise.market || {};
  let trade;
  if (s.live) trade = { open: false, status: "Paused", detail: "Trades pause while a game is being played." };
  else if (s.phase === "season" && s.week < deadlineWeek) trade = { open: true, status: "Open", detail: `Trade deadline: ${deadlineDate}, after the week ${deadlineWeek} games.`, date: deadlineDate };
  else if (s.phase === "season" || s.phase === "playoffs") trade = { open: false, status: "Closed", detail: `The deadline passed on ${deadlineDate}. Trading reopens after the championship (${dates.championship}).`, date: dates.championship };
  else if (draftLive(s)) trade = { open: false, status: "Draft in progress", detail: "Player trades pause during the draft. Swap picks on the clock in the Draft room." };
  else trade = { open: true, status: "Open", detail: `Offseason trading. Next deadline: ${nextDeadline}.`, date: nextDeadline };
  let freeAgency;
  if (s.phase !== "offseason") freeAgency = { open: true, status: "In-season", detail: "Unsigned players can be signed. Offers are decided after each game week, or by advancing a market day." };
  else if (today < dates.tampering) freeAgency = { open: false, status: "Opens " + dates.tampering, detail: `Negotiating window opens ${dates.tampering}; signings from ${dates.freeAgency}. Advance a market day to jump there.`, date: dates.tampering };
  else if (market.phase === "Tampering") freeAgency = { open: true, status: "Negotiating only", detail: `Offers can be made now; no player can sign before ${dates.freeAgency}.`, date: dates.freeAgency };
  else freeAgency = { open: true, status: "Open", detail: `Free agency opened ${dates.freeAgency}. Each market day, players decide on offers that reached their deadline.` };
  let draft;
  if (s.phase !== "offseason") draft = { open: false, status: "Scouting season", detail: `The ${s.year + 1} draft is on ${dates.draft}, after the championship. Scout the class until then.`, date: dates.draft };
  else if (draftLive(s)) draft = { open: true, status: "Live", detail: `Round ${s.franchise.draft.picks[s.franchise.draft.cursor]?.round ?? 1} is under way in the Draft room.` };
  else if (draftDone(s)) draft = { open: false, status: "Complete", detail: `This year's draft is complete. The next one is on ${leagueDates(s.year + 1, s.schedule?.length || 18).draft}.` };
  else draft = { open: true, status: "Ready", detail: `Draft day is ${dates.draft}. Start it from the Draft room whenever you are ready.`, date: dates.draft };
  return { today, trade, freeAgency, draft };
}

/* --------------------------------------------------------------------- valuation */

// Annual market value (integer cents) for a player in an open market.
export function marketValue(p) {
  const talent = Math.max(0, (p.ovr ?? 60) - 55),
    age = p.age ?? 27,
    agePremium = age <= 26 ? 1.1 : age >= 31 ? 0.7 : 1;
  return Math.round(Math.max(0.8, 0.012 * talent ** 2 * (POS_WEIGHT[p.pos] ?? 1) * agePremium) * MILLION);
}

// Depth-chart rank the player would hold on a team (1 = best at the position).
export function depthRank(s, p, team) {
  const players = (team === s.team ? s.roster : roster(s, team)).filter((q) => q.pos === p.pos && q.id !== p.id && !q.injury);
  return players.filter((q) => (q.ovr ?? 0) >= (p.ovr ?? 0)).length + 1;
}

// Non-monetary pull of a team for a free agent. Multiplies the monetary offer score.
export function signingFactors(s, p, team) {
  const persona = p.persona || {},
    club = s.franchise.clubs[team],
    rank = depthRank(s, p, team),
    starters = STARTERS[p.pos] ?? 2,
    mode = teamMode(s, team),
    prestige = team === s.team ? coachReputation(s) : club?.staff?.[0]?.rating ?? 65;
  const factors = [
    { key: "Playing time", value: rank <= starters ? 0.12 : rank <= starters + 2 ? 0 : -0.12, detail: rank <= starters ? "Projects as a starter" : rank <= starters + 2 ? "Rotational role" : "Buried on the depth chart" },
    { key: "Contender", value: mode === "Contender" ? 0.06 + (p.age >= 29 ? 0.06 : 0) : mode === "Rebuilding" ? -0.05 - (p.age >= 29 ? 0.05 : 0) : 0, detail: mode },
    { key: "Prestige", value: (prestige - 65) / 300, detail: `${Math.round(prestige)} ${team === s.team ? "coach reputation" : "head coach rating"}` },
    { key: "Scheme fit", value: p.preferredScheme && club?.staff?.[0]?.scheme ? (p.preferredScheme === club.staff[0].scheme ? 0.06 : -0.03) : 0, detail: p.preferredScheme ? `Prefers ${p.preferredScheme}` : "No strong preference" },
  ];
  if (team === s.team && p.medicalGrievances) factors.push({ key: "Medical trust", value: -Math.min(0.2, p.medicalGrievances * 0.05), detail: "Remembers being pushed to play hurt" });
  // Money-motivated players care less about everything else.
  const weight = 1 - (persona.money ?? 0.5) * 0.5,
    total = clamp(1 + factors.reduce((n, f) => n + f.value, 0) * weight, 0.75, 1.3);
  return { total: Math.round(total * 1000) / 1000, factors, rank, starters, mode };
}

/* ------------------------------------------------------------- draft pick ledger */

export function upcomingDraftYear(s) {
  const d = s.franchise.draft;
  return s.phase === "offseason" && d?.year === s.year && d.cursor >= d.picks.length ? s.year + 2 : s.year + 1;
}

export function ensurePickLedger(s) {
  const f = s.franchise;
  f.pickLedger ??= [];
  const first = upcomingDraftYear(s);
  for (const year of [first, first + 1])
    for (let round = 1; round <= 7; round++)
      for (let team = 0; team < 32; team++) {
        const id = `pk-${year}-${round}-${team}`;
        if (!f.pickLedger.some((x) => x.id === id)) f.pickLedger.push({ id, year, round, original: team, owner: team });
      }
  f.pickLedger = f.pickLedger.filter((x) => x.year >= s.year);
  return f.pickLedger;
}

export const ownedPicks = (s, team) => ensurePickLedger(s).filter((x) => x.owner === team && x.year >= upcomingDraftYear(s)).sort((a, b) => a.year - b.year || a.round - b.round);

// Called by beginDraft: traded picks are made by their current owner.
export function applyPickOwnership(s, picks, draftYear) {
  const ledger = ensurePickLedger(s);
  for (const pick of picks) {
    const entry = ledger.find((x) => x.year === draftYear && x.round === pick.round && x.original === (pick.original ?? pick.team));
    if (entry) pick.team = entry.owner;
  }
  return picks;
}

// Value chart: smooth exponential decay by overall slot (#1 ≈ 1000, #32 ≈ 380, #100 ≈ 55).
export const slotValue = (slot) => Math.round(1000 * Math.exp(-0.0315 * (slot - 1)) + 8);

export function projectedSlot(s, pick) {
  const order = Array.from({ length: 32 }, (_, i) => i).sort((a, b) => (s.teams[a].w - s.teams[a].l) - (s.teams[b].w - s.teams[b].l) || (s.teams[a].rating ?? 0) - (s.teams[b].rating ?? 0)),
    inRound = pick.year === upcomingDraftYear(s) ? order.indexOf(pick.original) + 1 : 16;
  return (pick.round - 1) * 32 + inRound;
}

export function pickValue(s, pick) {
  const years = pick.year - upcomingDraftYear(s);
  return Math.round(slotValue(projectedSlot(s, pick)) * 0.8 ** years);
}

/* ------------------------------------------------------------------ trade values */

// Player trade value in pick-chart points, from the receiving team's perspective.
export function playerTradeValue(s, p, receiver) {
  const mode = teamMode(s, receiver),
    c = s.franchise.contracts[p.id],
    year = financeYear(s),
    yearsLeft = c ? Math.max(1, c.start + c.years - year) : 1,
    talent = Math.max(0, (p.ovr ?? 60) - 60) ** 2 * 1.1 * (POS_WEIGHT[p.pos] ?? 1),
    age = p.age ?? 27,
    ageFactor = mode === "Rebuilding" ? (age <= 25 ? 1.25 : age <= 28 ? 1 : 0.6) : mode === "Contender" ? (age <= 30 ? 1.05 : 0.9) : age <= 28 ? 1 : 0.8,
    control = clamp(yearsLeft / 3, 0.6, 1.3),
    hit = c ? capHit(c, year) / MILLION : p.salary ?? 1,
    // Contenders pay a premium for ready-now starters as the deadline approaches.
    rush = mode === "Contender" && (p.ovr ?? 0) >= 80 ? 1 + deadlinePressure(s) * 0.15 : 1;
  return Math.max(0, Math.round((talent * ageFactor * control * rush - hit * 6) * (p.injury ? 0.6 : 1)));
}

// Value range as your staff see it: other clubs' lesser-known players are valued at the ends of
// their scouted range, so poor scouting means a wider, less reliable estimate.
export function scoutedTradeValue(s, p, receiver, team) {
  const v = scoutRange(s, p, team);
  if (v.exact) {
    const x = playerTradeValue(s, p, receiver);
    return { low: x, high: x, estimate: x, exact: true, view: v };
  }
  const at = (ovr) => playerTradeValue(s, { ...p, ovr }, receiver);
  return { low: at(v.ovr[0]), high: at(v.ovr[1]), estimate: at(v.estimate), exact: false, view: v };
}

// "≈ a mid 2nd-round pick" for a chart value.
export function pickEquivalent(value) {
  if (value < slotValue(224)) return "less than a 7th-round pick";
  if (value > slotValue(1)) return "more than the #1 overall pick";
  let slot = 1;
  while (slot < 224 && slotValue(slot) > value) slot++;
  const round = Math.ceil(slot / 32),
    within = slot - (round - 1) * 32,
    part = within <= 10 ? "early" : within <= 22 ? "mid" : "late";
  return `≈ ${part === "early" ? "an" : "a"} ${part} ${round}${["st", "nd", "rd"][round - 1] || "th"}-round pick`;
}

function asset(s, team, id) {
  if (id.startsWith("pk-")) {
    const pick = ensurePickLedger(s).find((x) => x.id === id);
    if (!pick || pick.owner !== team) throw Error("That pick is no longer owned by this club. Remove it from the deal.");
    return { kind: "pick", id, pick };
  }
  const p = (team === s.team ? s.roster : roster(s, team)).find((x) => x.id === id);
  if (!p) throw Error("A player in this proposal has changed teams. Remove him from the deal.");
  return { kind: "player", id, player: p };
}

const assetValue = (s, a, receiver) => (a.kind === "pick" ? pickValue(s, a.pick) : playerTradeValue(s, a.player, receiver));

function capDelta(s, team, incoming, outgoing) {
  const year = financeYear(s);
  let delta = 0;
  for (const a of incoming) if (a.kind === "player") delta += capHit(s.franchise.contracts[a.id], year);
  for (const a of outgoing)
    if (a.kind === "player") {
      const c = s.franchise.contracts[a.id];
      // Base salary leaves; any remaining prorated bonus accelerates into dead money now.
      delta -= capHit(c, year);
      delta += remainingBonus(s, c);
    }
  return delta;
}

function remainingBonus(s, c) {
  if (!c) return 0;
  let remaining = 0;
  for (const bonus of [{ amount: c.bonus, year: c.start, term: c.prorate }, ...(c.restructureBonuses || [])])
    for (let y = Math.max(financeYear(s), bonus.year); y < bonus.year + bonus.term; y++) remaining += bonusCharge(bonus.amount, bonus.term, y - bonus.year);
  return remaining;
}

// Everything that stops a deal regardless of value, each with a suggested fix.
// proposal = { partner, give: [ids from us], get: [ids from them] }.
export function tradeBlockers(s, proposal) {
  const { partner } = proposal,
    giveIds = proposal.give || [],
    getIds = proposal.get || [],
    out = [],
    role = roleBlocker(s, "roster");
  if (role) out.push(role);
  const window = marketWindows(s).trade;
  if (!window.open) out.push({ reason: `Trading is closed. ${window.detail}`, fix: s.live ? "Finish or quick-sim the game first." : null });
  if (partner === s.team || !s.franchise.clubs[partner]) {
    out.push({ reason: "Choose another club to trade with.", fix: null });
    return out;
  }
  if (!giveIds.length || !getIds.length) out.push({ reason: "A trade needs at least one player or pick from each side.", fix: !giveIds.length ? "Add something you send." : "Add something you receive." });
  const days = cooldownRemaining(s, "Trade contact", String(partner));
  if (days) out.push({ reason: `You completed a deal with the ${clubName(s, partner)} recently; their front office takes calls again in ${days} day${days === 1 ? "" : "s"}.`, fix: "Trade with another club, or wait." });
  let give, get;
  try {
    give = giveIds.map((id) => asset(s, s.team, id));
    get = getIds.map((id) => asset(s, partner, id));
  } catch (err) {
    out.push({ reason: err.message, fix: null });
    return out;
  }
  for (const a of give) if (a.kind === "player" && s.franchise.contracts[a.id]?.noTrade) out.push({ reason: `${a.player.name} has a no-trade clause.`, fix: "Remove him from the deal." });
  for (const a of get) if (a.kind === "player" && s.franchise.contracts[a.id]?.noTrade) out.push({ reason: `${a.player.name} has a no-trade clause and cannot be acquired.`, fix: "Choose a different player." });
  const capUs = capLedger(s).room - capDelta(s, s.team, get, give),
    capThem = capLedger(s, partner).room - capDelta(s, partner, give, get);
  if (capUs < 0) out.push(capShortfall(s, -capUs, { exclude: giveIds }));
  if (capThem < 0) out.push({ reason: `The ${clubName(s, partner)} would be ${moneyText(-capThem)} over the cap.`, fix: "Take more salary back from them, or send a cheaper player." });
  const moving = (list) => list.filter((a) => a.kind === "player" && (!a.player.status || a.player.status === "active")).length,
    full = rosterFull(s, activeCount(s) - moving(give) + moving(get));
  if (full) out.push({ reason: full.reason, fix: `${full.fix.replace(/ first\.$/, "")}, or add more of your players to the deal.` });
  return out;
}

// AI evaluation from the partner's side, plus every hard blocker. Value is judged with the
// partner's full knowledge; the user sees their own scouted estimate before proposing.
export function evaluateTrade(s, proposal, { aiOffer = false } = {}) {
  const { partner } = proposal,
    blockers = tradeBlockers(s, proposal),
    give = [],
    get = [];
  try {
    for (const id of proposal.give || []) give.push(asset(s, s.team, id));
    for (const id of proposal.get || []) get.push(asset(s, partner, id));
  } catch {}
  const valid = !!s.franchise.clubs[partner] && partner !== s.team,
    mode = valid ? teamMode(s, partner) : "Middle",
    receives = give.reduce((n, a) => n + assetValue(s, a, partner), 0),
    sends = get.reduce((n, a) => n + assetValue(s, a, partner), 0),
    // AI clubs want to win the trade a little; rebuilders want more for veterans.
    // An AI club honours the package it offered itself; otherwise it wants a small edge.
    margin = aiOffer ? 0 : 0.08 + (mode === "Rebuilding" && get.some((a) => a.kind === "player" && a.player.age >= 29) ? -0.05 : 0),
    required = Math.round(sends * (1 + margin)),
    capUs = capLedger(s).room - capDelta(s, s.team, get, give),
    capThem = valid ? capLedger(s, partner).room - capDelta(s, partner, give, get) : 0,
    short = give.length > 0 && get.length > 0 && receives < required,
    reasons = blockers.map(blockerText);
  if (short) reasons.push(`The ${valid ? clubName(s, partner) : "other club"} value what you send at ${receives} points but want ${required}. Add about ${required - receives} points (${pickEquivalent(required - receives).replace("≈ ", "")}).`);
  const accept = !blockers.length && !short && give.length > 0 && get.length > 0;
  // Counter: the cheapest single pick of ours that closes the gap, if any.
  let counter = null;
  if (short && !blockers.length) {
    const gap = required - receives,
      pick = ownedPicks(s, s.team)
        .filter((x) => !(proposal.give || []).includes(x.id))
        .map((x) => ({ x, v: pickValue(s, x) }))
        .filter((x) => x.v >= gap)
        .sort((a, b) => a.v - b.v)[0];
    if (pick) counter = { add: pick.x.id, label: pickLabel(s, pick.x), value: pick.v };
  }
  return { accept, mode, receives, sends, required, capAfter: { you: capUs, them: capThem }, blockers, reasons, counter };
}

// What the user believes the partner will ask for, from scouted knowledge of the players
// requested: { low, high, estimate } in chart points, after the partner's usual margin.
export function estimatedAsk(s, partner, getIds) {
  const margin = 1.08;
  let low = 0,
    high = 0,
    estimate = 0,
    exact = true;
  for (const id of getIds) {
    if (id.startsWith("pk-")) {
      const pick = ensurePickLedger(s).find((x) => x.id === id),
        v = pick ? pickValue(s, pick) : 0;
      low += v;
      high += v;
      estimate += v;
      continue;
    }
    const p = roster(s, partner).find((x) => x.id === id);
    if (!p) continue;
    const v = scoutedTradeValue(s, p, partner, partner);
    low += v.low;
    high += v.high;
    estimate += v.estimate;
    exact &&= v.exact;
  }
  return { low: Math.round(low * margin), high: Math.round(high * margin), estimate: Math.round(estimate * margin), exact };
}

// A package of our assets the partner should accept for what we want, built from our own
// estimate of the ask. Prefers picks and reserves; starters only when nothing else covers it.
export function suggestPackage(s, partner, getIds) {
  const target = estimatedAsk(s, partner, getIds).estimate,
    picks = ownedPicks(s, s.team).map((x) => ({ id: x.id, v: pickValue(s, x), core: false })),
    players = s.roster
      .filter((p) => !p.injury && !s.franchise.contracts[p.id]?.noTrade && (!p.status || p.status === "active"))
      .map((p) => ({ id: p.id, v: playerTradeValue(s, p, partner), core: !!p.starter }))
      .filter((x) => x.v > 0),
    pool = [...picks, ...players];
  const build = (candidates) => {
    const single = candidates.filter((x) => x.v >= target).sort((a, b) => a.v - b.v)[0];
    if (single) return [single];
    const chosen = [];
    let total = 0;
    for (const x of candidates.slice().sort((a, b) => b.v - a.v)) {
      if (total >= target || chosen.length >= 4) break;
      chosen.push(x);
      total += x.v;
    }
    return total >= target ? chosen : null;
  };
  const pkg = build(pool.filter((x) => !x.core)) || build(pool);
  if (!pkg) return { give: [], target, total: 0, covered: false };
  return { give: pkg.map((x) => x.id), target, total: pkg.reduce((n, x) => n + x.v, 0), covered: true };
}

export const pickLabel = (s, pick) => `${pick.year} round ${pick.round}${pick.original !== pick.owner ? ` (via ${clubTable()?.[pick.original]?.[0] ?? pick.original})` : ""}`;
const clubName = (s, t) => s.franchise.clubs[t]?.identity?.name || clubTable()?.[t]?.[2] || `Team ${t + 1}`;

// Executes an accepted trade. Call inside state.transact so any cap/roster failure rolls back.
export function executeTrade(s, proposal, { aiOffer = false } = {}) {
  const { partner } = proposal,
    verdict = evaluateTrade(s, proposal, { aiOffer });
  if (!verdict.accept) throw Error(verdict.reasons[0] || "The other club declined.");
  setCooldown(s, "Trade contact", String(partner), 7);
  const move = (id, from, to) => {
    if (id.startsWith("pk-")) {
      ensurePickLedger(s).find((x) => x.id === id).owner = to;
      return null;
    }
    const list = from === s.team ? s.roster : roster(s, from),
      p = list.find((x) => x.id === id),
      c = s.franchise.contracts[id];
    const dead = remainingBonus(s, c);
    if (dead) s.franchise.dead.push({ playerId: id, team: from, year: financeYear(s), amount: dead, reason: "Trade bonus acceleration" });
    if (c) {
      c.bonus = 0;
      c.restructureBonuses = [];
      c.team = to;
    }
    p.starter = false;
    if (from === s.team) s.roster = s.roster.filter((x) => x.id !== id);
    else s.franchise.clubs[from].players = list.filter((x) => x.id !== id);
    if (to === s.team) s.roster.push(p);
    else roster(s, to).push(p);
    return p;
  };
  const sent = (proposal.give || []).map((id) => move(id, s.team, partner)).filter(Boolean),
    received = (proposal.get || []).map((id) => move(id, partner, s.team)).filter(Boolean);
  if (capLedger(s).room < 0 || capLedger(s, partner).room < 0) throw Error("A team cannot absorb the trade's cap consequences.");
  const limit = s.phase === "offseason" ? 90 : 53;
  if (s.roster.filter((p) => !p.status || p.status === "active").length > limit) throw Error(`Make roster room first: this trade would put you over ${limit} players.`);
  const describe = (ids, team) => ids.map((id) => (id.startsWith("pk-") ? pickLabel(s, ensurePickLedger(s).find((x) => x.id === id)) : (team === s.team ? s.roster : roster(s, team)).find((x) => x.id === id)?.name ?? id)).join(", ");
  const headline = `${describe(proposal.get || [], s.team)} acquired from the ${clubName(s, partner)}`;
  fanReaction(s, `trade:${s.year}:${s.week}:${partner}:${(proposal.give || []).join(",")}`, clamp((verdict.sends - verdict.receives) / 150, -3, 3), headline, { topic: "Trades" });
  log(s, "Trade agreed", `${headline} for ${describe(proposal.give || [], partner)}.`);
  reactTo(s, `trade:${s.year}:${s.week}:${partner}:${(proposal.give || []).join(",")}`, { kind: "Trade", headline, playerId: received[0]?.id, playerName: received[0]?.name, tags: [verdict.mode.toLowerCase(), deadlinePressure(s) > 0.5 ? "deadline" : "regular"] });
  s.franchise.market.history ??= [];
  s.franchise.market.history.unshift({ year: s.year, week: s.week, partner, give: proposal.give, get: proposal.get, headline });
  return { sent, received, verdict };
}

/* ------------------------------------------------------------- deadline offers */

// In the final weeks before the deadline, AI clubs make offers for your players: contenders
// chase ready-now starters, rebuilders offer veterans' clubs picks. Idempotent per round.
export function processMarketWeek(s, roundKey) {
  const f = s.franchise;
  f.tradeDesk ??= { offers: [], seen: [] };
  const desk = f.tradeDesk;
  if (desk.seen.includes(roundKey)) return [];
  desk.seen.push(roundKey);
  desk.seen = desk.seen.slice(-200);
  desk.offers = desk.offers.filter((o) => o.status === "open" && o.expires > s.week && s.phase === "season");
  if (s.phase !== "season" || s.week >= tradeDeadline(s) || tradeDeadline(s) - s.week > 3) return [];
  const rng = random(identitySeed(`desk:${roundKey}:${s.team}`)),
    made = [];
  const targets = s.roster.filter((p) => !p.injury && (p.ovr ?? 0) >= 72 && !f.contracts[p.id]?.noTrade).sort((a, b) => b.ovr - a.ovr).slice(0, 12);
  for (let n = 0; n < 2 && targets.length; n++) {
    const p = targets[Math.floor(rng() * targets.length)],
      buyers = Array.from({ length: 32 }, (_, i) => i).filter((t) => t !== s.team && teamMode(s, t) === "Contender");
    if (!buyers.length) break;
    const partner = buyers[Math.floor(rng() * buyers.length)],
      want = playerTradeValue(s, p, partner),
      picks = ownedPicks(s, partner).map((x) => ({ x, v: pickValue(s, x) }));
    // Build a pick package worth roughly the player's value to them.
    const pkg = [];
    let total = 0;
    for (const { x, v } of picks.sort((a, b) => b.v - a.v)) {
      if (total >= want * 0.95) break;
      if (total + v <= want * 1.15) {
        pkg.push(x.id);
        total += v;
      }
    }
    if (!pkg.length || desk.offers.some((o) => o.playerId === p.id)) continue;
    const offer = { id: `offer-${roundKey}-${n}`, partner, playerId: p.id, give: [p.id], get: pkg, value: total, status: "open", expires: tradeDeadline(s), week: s.week };
    desk.offers.push(offer);
    made.push(offer);
    log(s, "Trade offer received", `The ${clubName(s, partner)} offer ${pkg.length} pick${pkg.length > 1 ? "s" : ""} for ${p.name}.`);
  }
  return made;
}

export function respondToOffer(s, offerId, accept) {
  const desk = s.franchise.tradeDesk,
    o = desk?.offers.find((x) => x.id === offerId && x.status === "open");
  if (!o) throw Error("That offer has expired.");
  o.status = accept ? "accepted" : "declined";
  if (accept) return executeTrade(s, { partner: o.partner, give: o.give, get: o.get }, { aiOffer: true });
  return null;
}
