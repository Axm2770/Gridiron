// Market engine: player valuation, non-monetary signing factors, a draft-pick ledger and
// value chart, multi-asset AI trade evaluation and execution, and trade-deadline offers.
// Contract structures (bonuses, guarantees, incentives, void years, cap hits) already live in
// contracts.mjs/state.mjs and are reused here, never re-implemented.
import { random, clamp } from "../engine/random.mjs";
import { identitySeed } from "./newgens.mjs";
import { MILLION, capLedger, capHit, roster, log, financeYear, bonusCharge, playerSnap } from "./state.mjs";
import { setCooldown, cooldownRemaining, fanReaction, coachReputation } from "./career-systems.mjs";
import { reactTo } from "./social-engine.mjs";
import { ensureCalendar, leagueDates, seasonAnchor, addDays } from "./calendar-core.mjs";
import { scoutRange } from "./scouting.mjs";
import { roleBlocker, capShortfall, rosterFull, rosterLimit, activeCount, blockerText, moneyText, liveFixes } from "./blockers.mjs";
import { clubStanding, conductProfile, injuryProfile, yearsPastPeak } from "./market-profile.mjs";

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

// The club a free agent last left, from the transaction log (null if unknown).
function formerClub(s, p) {
  const left = (s.franchise.transactionLog?.entries || []).find((x) => x.playerId === p.id && (x.type === "released" || x.type === "expired" || x.type === "waived"));
  return Number.isInteger(left?.from) ? left.from : null;
}

// Non-monetary pull of a team for a free agent. Multiplies the monetary offer score.
// Young players chase money and a role; veterans chase rings; ambitious players want to start;
// loyal players lean towards the club they left; money-first players mostly ignore the rest.
// Each factor: { key, value, detail, reason } — reason is a sentence from the player's camp.
export function signingFactors(s, p, team) {
  const persona = p.persona || {},
    club = s.franchise.clubs[team],
    rank = depthRank(s, p, team),
    starters = STARTERS[p.pos] ?? 2,
    mode = teamMode(s, team),
    age = p.age ?? 27,
    ambition = persona.ambition ?? 0.5,
    prestige = team === s.team ? coachReputation(s) : club?.staff?.[0]?.rating ?? 65;
  const role = rank <= starters ? 1 : rank <= starters + 2 ? 0 : -1,
    roleWeight = (0.7 + ambition * 0.6) * (age <= 26 ? 1.2 : age >= 31 ? 0.75 : 1),
    ringWeight = (age >= 30 ? 2 : age >= 27 ? 1.3 : 0.7) * (0.8 + ambition * 0.4),
    contend = mode === "Contender" ? 0.06 : mode === "Rebuilding" ? -0.05 : 0,
    scheme = club?.staff?.[0]?.scheme;
  const factors = [
    {
      key: "Playing time",
      value: Math.round(role * 0.1 * roleWeight * 1000) / 1000,
      detail: role > 0 ? "Projects as a starter" : role === 0 ? "Rotational role" : "Buried on the depth chart",
      reason: role > 0 ? "He'd start here." : role === 0 ? "He'd be in the rotation, not a sure starter." : "He wants to start: he'd be buried on the depth chart here.",
    },
    {
      key: "Contender",
      value: Math.round(contend * ringWeight * 1000) / 1000,
      detail: mode,
      reason: mode === "Contender" ? (age >= 30 ? "He prefers contenders: at his age he is chasing a ring." : "He likes joining a winning team.") : mode === "Rebuilding" ? (age >= 30 ? "A rebuilding club doesn't suit a veteran chasing a ring." : "A rebuild is less attractive to him.") : "",
    },
    { key: "Prestige", value: (prestige - 65) / 300, detail: `${Math.round(prestige)} ${team === s.team ? "coach reputation" : "head coach rating"}`, reason: prestige >= 75 ? "The coach's reputation appeals to him." : prestige <= 55 ? "The coaching staff doesn't impress him." : "" },
    { key: "Scheme fit", value: p.preferredScheme && scheme ? (p.preferredScheme === scheme ? 0.06 : -0.03) : 0, detail: p.preferredScheme ? `Prefers ${p.preferredScheme}` : "No strong preference", reason: p.preferredScheme && scheme ? (p.preferredScheme === scheme ? `He fits the ${scheme} scheme.` : `He'd rather play in a ${p.preferredScheme} scheme.`) : "" },
  ];
  if (formerClub(s, p) === team) factors.push({ key: "Former club", value: Math.round((persona.loyalty ?? 0.5) * 0.1 * 1000) / 1000, detail: "Played here before", reason: (persona.loyalty ?? 0.5) >= 0.6 ? "He'd welcome a return to his old club." : "" });
  if (team === s.team && p.medicalGrievances) factors.push({ key: "Medical trust", value: -Math.min(0.2, p.medicalGrievances * 0.05), detail: "Remembers being pushed to play hurt", reason: "He remembers being pushed to play hurt here." });
  // Money-motivated players care less about everything else; young players a little less too.
  const weight = clamp(1 - (persona.money ?? 0.5) * 0.5 - (age <= 26 ? 0.08 : 0), 0.35, 1),
    total = clamp(1 + factors.reduce((n, f) => n + f.value, 0) * weight, 0.75, 1.3);
  const reasons = factors
    .filter((f) => f.reason && Math.abs(f.value) >= 0.02)
    .sort((a, b) => Math.abs(b.value) - Math.abs(a.value))
    .map((f) => ({ text: f.reason, tone: f.value > 0 ? "good" : "bad" }));
  if ((persona.money ?? 0.5) >= 0.75) reasons.push({ text: "Money talks: he will mostly follow the biggest offer.", tone: "" });
  else if (age <= 25) reasons.push({ text: "Early in his career: money and a role matter most.", tone: "" });
  return { total: Math.round(total * 1000) / 1000, factors, rank, starters, mode, weight: Math.round(weight * 100) / 100, reasons };
}

// Why a free agent preferred one club over another, beyond the money: short phrases.
export function signingEdge(s, p, winner, loser) {
  const a = signingFactors(s, p, winner),
    b = signingFactors(s, p, loser);
  return a.factors
    .map((f) => ({ f, d: f.value - (b.factors.find((x) => x.key === f.key)?.value ?? 0) }))
    .filter((x) => x.d >= 0.03)
    .sort((x, y) => y.d - x.d)
    .concat(b.factors.filter((f) => f.value < 0 && !a.factors.some((x) => x.key === f.key)).map((f) => ({ f, d: -f.value })))
    .map(({ f }) => ({ "Playing time": "a bigger role", Contender: "a better chance to win", Prestige: "the coaching staff", "Scheme fit": "the scheme", "Former club": "a return to his old club", "Medical trust": "how he was treated medically" })[f.key])
    .filter(Boolean);
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

// How a club values a player, as a list of readable factors on top of his core value.
//
//   core   = talent (overall above 60, squared, weighted by position) × contract control
//   value  = core × (1 + Σ factor pct) − salary cost (cap hit × 6)
//
// `club` is the club doing the valuing. When it already owns the player (holding), the
// factors describe what he is worth to them as their player; otherwise what he would be worth
// if they acquired him. Each factor: { key, text, pct } with text naming the reason from the
// club's side ("They need a CB", "Age 32: past a WR's peak").
export function tradeFactors(s, p, club) {
  const mode = teamMode(s, club),
    c = s.franchise.contracts[p.id],
    year = financeYear(s),
    yearsLeft = c && !c.ended ? Math.max(1, c.start + c.years - year) : 1,
    talent = Math.max(0, (p.ovr ?? 60) - 60) ** 2 * 1.1 * (POS_WEIGHT[p.pos] ?? 1),
    control = clamp(yearsLeft / 3, 0.6, 1.3),
    hitCents = c ? capHit(c, year) : Math.round((p.salary ?? 1) * MILLION),
    age = p.age ?? 27,
    past = yearsPastPeak(p),
    squad = club === s.team ? s.roster : s.franchise.clubs[club]?.players || [],
    holding = squad.some((q) => q.id === p.id),
    factors = [],
    add = (key, text, pct) => pct && factors.push({ key, text, pct: Math.round(pct * 100) / 100 });

  // Age curve against the position, then what this kind of club wants.
  if (past >= 1) add("age", `Age ${age}: past a ${p.pos}'s peak`, -Math.min(0.45, past * 0.07));
  if (mode === "Rebuilding") {
    if (age <= 25) add("mode", "Young: fits a rebuild", 0.2);
    else if (age >= 29) add("mode", `Rebuilding: little use for a ${age}-year-old`, -0.25);
  } else if (mode === "Contender") {
    if ((p.ovr ?? 0) >= 78 && past <= 2) add("mode", "Proven player for a club built to win now", 0.1);
    else if ((p.ovr ?? 0) < 70) add("mode", "Contenders want help now, not projects", -0.1);
    // Contenders pay a premium for ready-now starters as the deadline approaches.
    if ((p.ovr ?? 0) >= 80 && !holding) add("deadline", "Deadline push for a ready-made starter", deadlinePressure(s) * 0.15);
  } else if (age >= 31) add("mode", `Age ${age} limits his value to a mid-table club`, -0.1);

  // Injury now, joint wear and the recent record.
  const inj = injuryProfile(s, p);
  if (inj.current) add("injury", `Currently injured (out ${inj.current} week${inj.current === 1 ? "" : "s"})`, -0.35);
  if (inj.wear >= 45) add("wear", `Injury concerns (${inj.wearPart} wear ${inj.wear})`, -Math.min(0.25, (inj.wear - 35) / 200));
  if (inj.recent) add("history", `Injury history: ${inj.recent} injur${inj.recent === 1 ? "y" : "ies"} in two seasons${inj.serious ? `, ${inj.serious} serious` : ""}`, -Math.min(0.3, inj.recent * 0.06 + inj.serious * 0.06));

  // Contract: overpays against his open-market value, and expiring rentals. (A cheap deal is
  // already worth more through the salary cost below.)
  const market = marketValue(p),
    ratio = hitCents / Math.max(1, market);
  if (c && ratio >= 1.5 && hitCents >= 3 * MILLION) add("contract", `Overpaid: ${moneyText(hitCents)} cap hit`, -Math.min(0.25, (ratio - 1.2) * 0.12));
  if (c && yearsLeft <= 1 && mode === "Rebuilding" && age >= 26) add("expiring", "Expiring deal: only a rental to a rebuilding club", -0.15);

  // Positional need on the club that would own him.
  const starters = STARTERS[p.pos] ?? 2,
    group = squad.filter((q) => q.pos === p.pos && q.id !== p.id && !q.injury && (!q.status || q.status === "active")).sort((a, b) => (b.ovr ?? 0) - (a.ovr ?? 0)),
    rank = group.filter((q) => (q.ovr ?? 0) >= (p.ovr ?? 0)).length + 1;
  if (!holding && squad.length) {
    const weakest = group[starters - 1];
    const ordinal = (n) => `${n}${n % 100 >= 11 && n % 100 <= 13 ? "th" : ["th", "st", "nd", "rd"][n % 10] || "th"}`;
    if (rank <= starters && (!weakest || (p.ovr ?? 0) - (weakest.ovr ?? 0) >= 4)) add("need", `They need a ${p.pos}`, 0.12);
    else if (rank > starters + (["K", "P"].includes(p.pos) ? 0 : 2)) add("need", `Stacked at ${p.pos}: he'd be their ${ordinal(rank)}`, p.pos === "QB" || p.pos === "K" || p.pos === "P" ? -0.5 : -0.3);
  } else if (rank <= starters) {
    const backup = group[starters - 1];
    if (!backup || (p.ovr ?? 0) - (backup.ovr ?? 0) >= 6) add("need", `Losing him leaves a hole at ${p.pos}`, 0.1);
  }

  // Character: buyers are wary of trouble; contenders like proven leaders.
  if (!holding) {
    const conduct = conductProfile(s, p);
    if (conduct.troublemaker) add("conduct", `Wary of his character: ${conduct.flags[0]}`, -(0.1 + conduct.score * 0.25));
    else if (conduct.leader && mode === "Contender") add("conduct", "Respected locker-room leader", 0.05);
  }
  return { core: talent * control, salary: (hitCents / MILLION) * 6, factors, mode, holding, yearsLeft };
}

const valueOf = (t, extraPct = 0, flat = 0) => Math.max(0, Math.round(t.core * (1 + clamp(t.factors.reduce((n, f) => n + f.pct, 0) + extraPct, -0.85, 0.8)) - t.salary + flat));

// Player trade value in pick-chart points, from the receiving (or owning) team's perspective.
export function playerTradeValue(s, p, receiver) {
  return valueOf(tradeFactors(s, p, receiver));
}

// Why a club would ask more (or less) than his value to sell him: franchise attachment,
// captaincy, a trade demand, character, dead money and mid-season selling. A franchise legend
// is untouchable unless the club is rebuilding or he is near the end.
export function sellFactors(s, p, seller) {
  const factors = [],
    add = (key, text, pct) => pct && factors.push({ key, text, pct: Math.round(pct * 100) / 100 }),
    standing = clubStanding(s, p, seller),
    conduct = conductProfile(s, p),
    mode = teamMode(s, seller),
    c = s.franchise.contracts[p.id];
  let untouchable = null;
  if (standing.level === "legend") {
    if (mode === "Rebuilding" || (p.age ?? 27) >= 33) add("standing", `${p.name} is ${standing.label} (${standing.tenure} seasons): they want 45% more`, 0.45);
    else untouchable = `${p.name} is ${standing.label} after ${standing.tenure} seasons; they won't trade him`;
  } else if (standing.level === "icon") add("standing", `${p.name} is ${standing.label}: they want 30% more`, 0.3);
  else if (standing.level === "favourite") add("standing", `${p.name} is ${standing.label}: they want 12% more`, 0.12);
  if (standing.captain && standing.level !== "legend" && standing.level !== "icon") add("captain", "He is their captain", 0.08);
  if (p.tradeDemand) add("wishes", "He has asked out: they are ready to move him", -0.15);
  else if (conduct.troublemaker) add("conduct", `They are keen to move him: he ${conduct.flags[0]}`, -0.12);
  if (c && !c.ended && c.start + c.years - financeYear(s) <= 1 && mode === "Rebuilding" && (p.age ?? 27) >= 28) add("expiring", "Expiring deal: better something than losing him for nothing", -0.1);
  if (s.phase === "season" && mode === "Contender" && p.starter) add("selling", "Contenders don't sell starters mid-season", 0.1);
  const dead = remainingBonus(s, c),
    flat = Math.round((dead / MILLION) * 4);
  if (flat >= 5) factors.push({ key: "dead", text: `Trading him leaves them ${moneyText(dead)} in dead money`, pct: 0, flat });
  return { factors, untouchable, standing, flat: factors.reduce((n, f) => n + (f.flat || 0), 0), pct: factors.reduce((n, f) => n + f.pct, 0) };
}

// What a club asks to part with one of its players, in points.
export function askingValue(s, p, seller) {
  const sell = sellFactors(s, p, seller);
  return valueOf(tradeFactors(s, p, seller), sell.pct, sell.flat);
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

// The asking price for another club's player as your scouts estimate it (their premiums are
// public knowledge; his true rating may not be).
export function scoutedAsk(s, p, seller) {
  const v = scoutRange(s, p, seller),
    sell = sellFactors(s, p, seller),
    at = (ovr) => valueOf(tradeFactors(s, ovr == null ? p : { ...p, ovr }, seller), sell.pct, sell.flat);
  if (v.exact) {
    const x = at(null);
    return { low: x, high: x, estimate: x, exact: true, untouchable: sell.untouchable, view: v };
  }
  return { low: at(v.ovr[0]), high: at(v.ovr[1]), estimate: at(v.estimate), exact: false, untouchable: sell.untouchable, view: v };
}

const pickPct = (mode) => (mode === "Rebuilding" ? 0.1 : mode === "Contender" ? -0.08 : 0);

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
  if (!window.open) out.push({ reason: `Trading is closed. ${window.detail}`, fix: s.live ? "Finish or quick-sim the game first." : null, fixes: s.live ? liveFixes() : [] });
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
  for (const a of give) if (a.kind === "player" && s.franchise.contracts[a.id]?.noTrade) out.push({ reason: `${a.player.name} has a no-trade clause.`, fix: "Remove him from the deal.", fixes: [{ kind: "dealRemove", side: "give", id: a.id, label: `Remove ${a.player.name}` }] });
  for (const a of get) if (a.kind === "player" && s.franchise.contracts[a.id]?.noTrade) out.push({ reason: `${a.player.name} has a no-trade clause and cannot be acquired.`, fix: "Choose a different player.", fixes: [{ kind: "dealRemove", side: "get", id: a.id, label: `Remove ${a.player.name}` }] });
  const capUs = capLedger(s).room - capDelta(s, s.team, get, give),
    capThem = capLedger(s, partner).room - capDelta(s, partner, give, get);
  if (capUs < 0) out.push(capShortfall(s, -capUs, { exclude: giveIds }));
  if (capThem < 0) out.push({ reason: `The ${clubName(s, partner)} would be ${moneyText(-capThem)} over the cap.`, fix: "Take more salary back from them, or send a cheaper player." });
  const moving = (list) => list.filter((a) => a.kind === "player" && (!a.player.status || a.player.status === "active")).length,
    full = rosterFull(s, activeCount(s) - moving(give) + moving(get), { exclude: giveIds });
  if (full) out.push({ reason: full.reason, fix: `${full.fix.replace(/ first\.$/, "")}, or add more of your players to the deal.`, fixes: full.fixes });
  // In season, a deal must not leave a position with nobody healthy to play it: games could not start.
  if (s.phase !== "offseason")
    for (const pos of new Set(give.filter((a) => a.kind === "player").map((a) => a.player.pos))) {
      const healthy = (list) => list.filter((q) => q.pos === pos && !q.injury && !q.holdout && (!q.status || q.status === "active")).length,
        left = healthy(s.roster.filter((q) => !giveIds.includes(q.id))) + healthy(get.filter((a) => a.kind === "player").map((a) => a.player));
      if (left < 1) out.push({ reason: `This would leave you without a healthy ${pos}, so your next game could not be played.`, fix: `Keep him, add a ${pos} from them to the deal, or sign one first.`, fixes: give.filter((a) => a.kind === "player" && a.player.pos === pos).map((a) => ({ kind: "dealRemove", side: "give", id: a.id, label: `Keep ${a.player.name}` })).concat([{ kind: "freeAgents", pos, label: `Find a free-agent ${pos}` }]) });
    }
  return out;
}

// One asset as the partner sees it. `selling` = the partner gives it up (their player or pick).
// { id, name, kind, base, value, core, factors: [{ key, text, pct, flat? }], untouchable }
function appraise(s, a, partner, selling) {
  if (a.kind === "pick") {
    const base = pickValue(s, a.pick);
    return { id: a.id, kind: "pick", name: pickLabel(s, a.pick), base, value: Math.round(base * (1 + pickPct(teamMode(s, partner)))), core: base, factors: [] };
  }
  const t = tradeFactors(s, a.player, partner),
    base = valueOf({ ...t, factors: [] });
  if (!selling) return { id: a.id, kind: "player", name: a.player.name, base, value: valueOf(t), core: t.core, factors: t.factors, untouchable: null };
  const sell = sellFactors(s, a.player, partner);
  return { id: a.id, kind: "player", name: a.player.name, base, value: valueOf(t, sell.pct, sell.flat), core: t.core, factors: [...t.factors, ...sell.factors], untouchable: sell.untouchable };
}

// The cheapest of our unused assets (one, or two together) worth at least `gap` points to the
// partner. Prefers picks and reserves; never a starter. Returns { add, adds, label, value } or null.
export function counterOffer(s, proposal, gap) {
  const { partner } = proposal,
    used = new Set(proposal.give || []),
    pct = pickPct(teamMode(s, partner)),
    pool = [
      ...ownedPicks(s, s.team).filter((x) => !used.has(x.id)).map((x) => ({ id: x.id, label: pickLabel(s, x), v: Math.round(pickValue(s, x) * (1 + pct)) })),
      ...s.roster
        .filter((p) => !used.has(p.id) && !p.starter && !p.injury && (!p.status || p.status === "active") && !s.franchise.contracts[p.id]?.noTrade)
        .map((p) => ({ id: p.id, label: `${p.pos} ${p.name}`, v: playerTradeValue(s, p, partner) }))
        .filter((x) => x.v > 0),
    ];
  if (gap <= 0 || !pool.length) return null;
  const single = pool.filter((x) => x.v >= gap).sort((a, b) => a.v - b.v)[0];
  let best = single ? [single] : null;
  if (!best) {
    let total = Infinity;
    for (let i = 0; i < pool.length; i++)
      for (let j = i + 1; j < pool.length; j++) {
        const v = pool[i].v + pool[j].v;
        if (v >= gap && v < total) {
          total = v;
          best = [pool[i], pool[j]];
        }
      }
  }
  if (!best) return null;
  return { add: best[0].id, adds: best.map((x) => x.id), label: best.map((x) => x.label).join(" + "), value: best.reduce((n, x) => n + x.v, 0) };
}

// AI evaluation from the partner's side, plus every hard blocker. Value is judged with the
// partner's full knowledge; the user sees their own scouted estimate before proposing.
//
// Each side's points are adjusted by the factors in tradeFactors/sellFactors, so the answer
// comes with the partner's reasoning: `factors` lists readable reasons with their effect in
// points from YOUR side (positive helps the deal). A franchise legend is untouchable.
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
    incoming = valid ? give.map((a) => appraise(s, a, partner, false)) : [],
    outgoing = valid ? get.map((a) => appraise(s, a, partner, true)) : [],
    receives = incoming.reduce((n, a) => n + a.value, 0),
    sends = outgoing.reduce((n, a) => n + a.value, 0),
    // AI clubs want to win the trade a little; rebuilders want more for veterans.
    // An AI club honours the package it offered itself; otherwise it wants a small edge.
    margin = aiOffer ? 0 : 0.08 + (mode === "Rebuilding" && get.some((a) => a.kind === "player" && a.player.age >= 29) ? -0.05 : 0),
    required = Math.round(sends * (1 + margin)),
    capUs = capLedger(s).room - capDelta(s, s.team, get, give),
    capThem = valid ? capLedger(s, partner).room - capDelta(s, partner, give, get) : 0,
    untouchable = outgoing.filter((a) => a.untouchable).map((a) => ({ id: a.id, name: a.name, why: a.untouchable })),
    short = give.length > 0 && get.length > 0 && receives < required,
    reasons = blockers.map(blockerText);

  // Readable factors, signed from your side: + helps you, − costs you.
  const factors = [];
  const named = (a, f) => (f.text.includes(a.name) ? f.text : `${a.name}: ${f.text}`);
  for (const a of incoming) for (const f of a.factors) factors.push({ key: f.key, side: "send", id: a.id, text: named(a, f), pct: f.pct, points: Math.round(a.core * f.pct + (f.flat || 0)) });
  for (const a of outgoing) for (const f of a.factors) factors.push({ key: f.key, side: "receive", id: a.id, text: named(a, f), pct: f.pct, points: -Math.round(a.core * f.pct + (f.flat || 0)) });
  const pickNet = incoming.filter((a) => a.kind === "pick").reduce((n, a) => n + a.value - a.base, 0) - outgoing.filter((a) => a.kind === "pick").reduce((n, a) => n + a.value - a.base, 0);
  if (pickNet) factors.push({ key: "picks", side: "deal", text: mode === "Rebuilding" ? "Rebuilding: they value draft picks 10% more" : "Contending: they value draft picks 8% less than players who help now", pct: pickPct(mode), points: pickNet });
  if (margin > 0 && sends > 0) factors.push({ key: "margin", side: "deal", text: `They want to win the trade: ${Math.round(margin * 100)}% on top`, pct: margin, points: -Math.round(sends * margin) });
  for (const f of factors) f.tone = f.points > 0 ? "good" : f.points < 0 ? "bad" : "";
  factors.sort((a, b) => Math.abs(b.points) - Math.abs(a.points));

  for (const u of untouchable) reasons.push(`The ${valid ? clubName(s, partner) : "other club"} won't deal: ${u.why}.`);
  if (short) {
    reasons.push(`The ${valid ? clubName(s, partner) : "other club"} value what you send at ${receives} points but want ${required}. Add about ${required - receives} points (${pickEquivalent(required - receives).replace("≈ ", "")}).`);
    const concerns = factors.filter((f) => f.points < 0 && f.key !== "margin").slice(0, 2).map((f) => f.text);
    if (concerns.length) reasons.push(`What is holding them back: ${concerns.join("; ")}.`);
  }
  const accept = !blockers.length && !untouchable.length && !short && give.length > 0 && get.length > 0;
  // Counter: the cheapest pick or reserve of ours (or two together) that closes the gap.
  const counter = short && !blockers.length && !untouchable.length ? counterOffer(s, proposal, required - receives) : null;
  return { accept, mode, receives, sends, required, gap: Math.max(0, required - receives), margin, capAfter: { you: capUs, them: capThem }, blockers, reasons, counter, factors, untouchable, assets: { incoming, outgoing } };
}

// What the user believes the partner will ask for, from scouted knowledge of the players
// requested: { low, high, estimate } in chart points, after the partner's usual margin and
// their public premiums (icons, captains) and discounts (trade demands, injuries, age).
export function estimatedAsk(s, partner, getIds) {
  const margin = 1.08,
    pct = pickPct(teamMode(s, partner)),
    untouchable = [];
  let low = 0,
    high = 0,
    estimate = 0,
    exact = true;
  for (const id of getIds) {
    if (id.startsWith("pk-")) {
      const pick = ensurePickLedger(s).find((x) => x.id === id),
        v = pick ? Math.round(pickValue(s, pick) * (1 + pct)) : 0;
      low += v;
      high += v;
      estimate += v;
      continue;
    }
    const p = roster(s, partner).find((x) => x.id === id);
    if (!p) continue;
    const v = scoutedAsk(s, p, partner);
    if (v.untouchable) untouchable.push({ id, name: p.name, why: v.untouchable });
    low += v.low;
    high += v.high;
    estimate += v.estimate;
    exact &&= v.exact;
  }
  return { low: Math.round(low * margin), high: Math.round(high * margin), estimate: Math.round(estimate * margin), exact, untouchable };
}

// A package of our assets the partner should accept for what we want, built from our own
// estimate of the ask. Prefers picks and reserves; starters only when nothing else covers it.
export function suggestPackage(s, partner, getIds) {
  const ask = estimatedAsk(s, partner, getIds),
    target = ask.estimate;
  if (ask.untouchable.length) return { give: [], target, total: 0, covered: false, untouchable: ask.untouchable };
  const pct = pickPct(teamMode(s, partner)),
    picks = ownedPicks(s, s.team).map((x) => ({ id: x.id, v: Math.round(pickValue(s, x) * (1 + pct)), core: false })),
    // Never suggest a player whose departure leaves a position without enough healthy players to
    // field its starters (sending away the only healthy QB would stop the season).
    healthy = (pos) => s.roster.filter((q) => q.pos === pos && !q.injury && !q.holdout && (!q.status || q.status === "active")).length,
    needed = (pos) => Math.max(1, s.roster.filter((q) => q.pos === pos && q.starter).length),
    players = s.roster
      .filter((p) => !p.injury && !s.franchise.contracts[p.id]?.noTrade && (!p.status || p.status === "active"))
      .filter((p) => healthy(p.pos) - 1 >= needed(p.pos))
      .map((p) => ({ id: p.id, v: playerTradeValue(s, p, partner), core: !!p.starter }))
      .filter((x) => x.v > 0),
    pool = [...picks, ...players];
  // The cheapest package of up to three assets that covers the ask: least overpayment, and a
  // starter only counts as "cheap" if nothing made of picks and reserves gets there.
  const build = (candidates) => {
    const list = candidates.slice().sort((x, y) => y.v - x.v).slice(0, 28),
      cost = (set) => set.reduce((n, x) => n + x.v, 0) + set.filter((x) => x.core).length * target * 0.35;
    let best = null;
    const consider = (set) => {
      const total = set.reduce((n, x) => n + x.v, 0);
      if (total < target) return;
      if (!best || cost(set) < cost(best)) best = set;
    };
    for (let i = 0; i < list.length; i++) {
      consider([list[i]]);
      for (let j = i + 1; j < list.length; j++) {
        consider([list[i], list[j]]);
        for (let k = j + 1; k < list.length; k++) consider([list[i], list[j], list[k]]);
      }
    }
    return best;
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
  // Fans take it hard when a franchise favourite or icon is sent away.
  const beloved = (proposal.give || []).filter((id) => !id.startsWith("pk-")).map((id) => s.roster.find((x) => x.id === id)).filter(Boolean).map((p) => ({ p, standing: clubStanding(s, p, s.team) })).filter((x) => x.standing.level !== "none");
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
    p.joined = { team: to, year: s.year };
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
  fanReaction(s, `trade:${s.year}:${s.week}:${partner}:${(proposal.give || []).join(",")}`, clamp((verdict.sends - verdict.receives) / 150 - beloved.reduce((n, x) => n + ({ legend: 2, icon: 1.5, favourite: 0.75 })[x.standing.level], 0), -4, 3), headline, { topic: "Trades" });
  for (const x of beloved) log(s, "Fans react", `Supporters are upset to see ${x.p.name}, ${x.standing.label}, traded away after ${x.standing.tenure} seasons.`);
  const picks = (ids) => ids.filter((id) => id.startsWith("pk-")).map((id) => ({ name: pickLabel(s, ensurePickLedger(s).find((x) => x.id === id)), pos: "Draft pick" }));
  log(s, "Trade agreed", `${headline} for ${describe(proposal.give || [], partner)}.`, "club", { kind: "transaction", type: "trade", partner: clubName(s, partner), incoming: [...received.map(playerSnap), ...picks(proposal.get || [])], outgoing: [...sent.map(playerSnap), ...picks(proposal.give || [])] });
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
