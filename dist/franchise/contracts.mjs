import {
  checkCooldown,
  setCooldown,
  coachPerks,
  fanReaction,
} from "./career-systems.mjs";
import { consumeBoardPermit, isBlockbuster } from "./boardroom.mjs";
import {
  MILLION,
  capLedger,
  capHit,
  roster,
  log,
  requireRole,
  financeYear,
  bonusCharge,
  validateContract,
} from "./state.mjs";
export function proposal(s, p, terms) {
  let years = Number(terms.years),
    annual = Math.round(Number(terms.annual) * MILLION),
    bonus = Math.round(Number(terms.bonus) * MILLION),
    guaranteed = Math.round(Number(terms.guaranteed) * MILLION),
    voidYears = Number(terms.voidYears || 0);
  if (
    !Number.isInteger(years) ||
    years < 1 ||
    years > 5 ||
    !Number.isInteger(voidYears) ||
    voidYears < 0 ||
    years + voidYears > 7 ||
    ![annual, bonus, guaranteed].every(
      (x) => Number.isSafeInteger(x) && x >= 0,
    ) ||
    annual < 0.8 * MILLION ||
    guaranteed > annual * years
  )
    throw Error("Invalid contract structure.");
  for (const k of ["roster", "workout", "incentive"])
    if (!Number.isFinite(Number(terms[k] || 0)) || Number(terms[k] || 0) < 0)
      throw Error("Invalid contract structure.");
  if (
    terms.incentive &&
    !["LTBE", "NLTBE"].includes(terms.incentiveType || "NLTBE")
  )
    throw Error("Invalid incentive type.");
  let base = Array(years).fill(annual),
    guarantees = Array(years).fill(0);
  for (let i = 0, left = guaranteed; i < years; i++) {
    guarantees[i] = Math.min(annual, left);
    left -= guarantees[i];
  }
  const contract = {
    id: "contract-" + p.id,
    playerId: p.id,
    team: s.team,
    start: financeYear(s),
    years,
    bonus,
    prorate: Math.min(5, years + voidYears),
    base,
    guarantees,
    roster: Array(years).fill(Math.round(Number(terms.roster || 0) * MILLION)),
    workout: Array(years).fill(
      Math.round(Number(terms.workout || 0) * MILLION),
    ),
    incentives: terms.incentive
      ? [
          {
            year: financeYear(s),
            type: terms.incentiveType || "NLTBE",
            amount: Math.round(Number(terms.incentive) * MILLION),
            earned: false,
          },
        ]
      : [],
    voidYears,
    noTrade: !!terms.noTrade,
    transactions: [],
    ended: false,
  };
  validateContract(contract);
  return contract;
}
export function cut(s, id, postJune = false) {
  requireRole(s, "roster");
  let p = roster(s).find((p) => p.id === id);
  if (!p) throw Error("Player not found.");
  if (s.live)
    throw Error("Complete the current game before changing contracts.");
  let c = s.franchise.contracts[id],
    remaining = 0,
    currentBonus = 0;
  if (c && !c.ended) {
    for (let b of [
      { amount: c.bonus, year: c.start, term: c.prorate },
      ...(c.restructureBonuses || []),
    ]) {
      for (let y = Math.max(financeYear(s), b.year); y < b.year + b.term; y++) {
        let per = bonusCharge(b.amount, b.term, y - b.year);
        remaining += per;
        if (y === financeYear(s)) currentBonus += per;
      }
    }
    let guarantee = c.guarantees
        .slice(Math.max(0, financeYear(s) - c.start))
        .reduce((a, b) => a + b, 0),
      current = postJune ? currentBonus + guarantee : remaining + guarantee,
      future = postJune ? remaining - currentBonus : 0;
    s.franchise.dead.push({
      playerId: id,
      team: s.team,
      year: financeYear(s),
      amount: current,
      reason: "Release",
    });
    if (future)
      s.franchise.dead.push({
        playerId: id,
        team: s.team,
        year: financeYear(s) + 1,
        amount: future,
        reason: "Post-June release",
      });
    c.ended = true;
    c.transactions.push({ type: "released", year: s.year, postJune });
    if (capLedger(s).room < 0 && !s.franchise.debug)
      throw Error(
        "The release accelerates more dead money than the team can absorb.",
      );
  }
  s.roster = s.roster.filter((x) => x.id !== id);
  p.starter = false;
  p.status = "waivers";
  s.franchise.waivers.push({
    player: p,
    day: s.franchise.market.day + 1,
    claims: [],
  });
  log(
    s,
    "Player waived",
    `${p.name} enters waivers. Dead cap is retained in the ledger.`,
  );
}
export function restructure(s, id, amount) {
  if (s.live) throw Error("Complete the game before changing contracts.");
  checkCooldown(s, "Contract review", id);
  requireRole(s, "finance");
  let c = s.franchise.contracts[id],
    n = Math.round(Number(amount) * MILLION),
    i = c ? financeYear(s) - c.start : -1;
  if (!c || c.ended || i < 0 || i >= c.years)
    throw Error("No current contract.");
  if (!Number.isSafeInteger(n) || n <= 0 || n > c.base[i] - 0.8 * MILLION)
    throw Error("Keep at least $0.8M base salary.");
  let term = Math.min(5, c.years + c.voidYears - i);
  if (term <= 1) throw Error("No future contract years to prorate.");
  c.base[i] -= n;
  c.guarantees[i] = Math.max(0, c.guarantees[i] - n);
  (c.restructureBonuses ??= []).push({ amount: n, year: financeYear(s), term });
  c.transactions.push({ type: "restructure", amount: n, year: s.year });
  setCooldown(s, "Contract review", id, 14);
  log(
    s,
    "Contract restructured",
    `Converted $${(n / MILLION).toFixed(1)}M to a prorated bonus; future cap charges increase.`,
  );
}
export function offer(s, id, terms) {
  requireRole(s, "finance");
  if (
    roster(s).filter((p) => p.status === "active").length >=
    (s.phase === "offseason" ? 90 : 53)
  )
    throw Error(
      "Create an active-roster opening before submitting a free-agent offer.",
    );
  let p = s.agents.find((p) => p.id === id);
  if (!p) throw Error("Free agent unavailable.");
  let c = proposal(s, p, terms);
  if (capLedger(s).room < capHit(c, financeYear(s)))
    throw Error("Insufficient cap room for the first-year charge.");
  s.franchise.market.offers = s.franchise.market.offers.filter(
    (o) => !(o.playerId === id && o.team === s.team),
  );
  s.franchise.market.offers.push({
    id: `offer-${id}-${s.team}`,
    playerId: id,
    team: s.team,
    contract: c,
    close: s.franchise.market.day + 2,
  });
  log(
    s,
    "Offer submitted",
    `${p.name} is weighing your offer against other teams. ${s.franchise.market.phase === "Tampering" ? "No signing before the open period." : ""}`,
  );
}
export function offerScore(s, p, o) {
  let c = o.contract,
    total =
      c.base.reduce((a, b) => a + b, 0) +
      c.bonus +
      (c.roster || []).reduce((a, b) => a + b, 0) +
      (c.workout || []).reduce((a, b) => a + b, 0),
    guaranteed = c.bonus + c.guarantees.reduce((a, b) => a + b, 0),
    prestige = s.franchise.clubs[o.team].staff[0]?.rating || 65,
    contender = s.teams[o.team].rating;
  return (
    (total / MILLION) * (0.7 + (p.persona?.money || 0.5)) +
    (guaranteed / MILLION) * 0.4 +
    contender * 0.12 +
    prestige * 0.08 +
    (o.team === s.team
      ? s.franchise.career.skills.cap * 0.5 + coachPerks(s).recruitment
      : 0) +
    (p.preferredScheme === s.franchise.clubs[o.team].staff[0]?.scheme ? 8 : 0) -
    (s.franchise.taxRate[o.team] * total) / MILLION +
    (p.age > 29 ? contender * 0.12 : 0)
  );
}
export function tag(s, id, type) {
  requireRole(s, "finance");
  let p = s.roster.find((p) => p.id === id),
    c = s.franchise.contracts[id];
  if (!p || !c || c.ended || c.start + c.years !== financeYear(s))
    throw Error("Tag only an expiring contract.");
  if (s.franchise.tagYear === financeYear(s))
    throw Error("One franchise/transition tag per year.");
  let top = Object.values(s.franchise.contracts)
      .filter((x) => x.playerId !== id)
      .map((x) => capHit(x, financeYear(s)))
      .sort((a, b) => b - a)
      .slice(0, 5),
    value = Math.max(
      Math.round(p.salary * 1.2 * MILLION),
      Math.round(top.reduce((a, b) => a + b, 0) / Math.max(1, top.length)),
    );
  c.base.push(value);
  c.roster.push(0);
  c.workout.push(0);
  c.guarantees.push(value);
  c.years++;
  c.tag = { type, year: financeYear(s) };
  s.franchise.tagYear = financeYear(s);
  if (capLedger(s).room < 0) throw Error("Tag would exceed next year’s cap.");
  log(s, "Tag applied", `${type} tender offered to ${p.name}.`);
}
export function trade(s, id, other, targetId) {
  if (
    s.phase === "playoffs" ||
    (s.phase === "offseason" && s.franchise.market.phase === "Tampering")
  )
    throw Error("Player trades reopen with the new league year.");
  if (s.live) throw Error("Finish the live game before trade talks.");
  requireRole(s, "roster");
  if (s.phase === "season" && s.week >= (s.franchise.rules.tradeDeadline || 9))
    throw Error("The trade deadline has passed.");
  if (other === s.team || !s.franchise.clubs[other])
    throw Error("Select another team.");
  let a = s.roster.find((p) => p.id === id),
    b = roster(s, other).find((p) => p.id === targetId);
  if (!a || !b) throw Error("Player no longer available.");
  let ca = s.franchise.contracts[a.id],
    cb = s.franchise.contracts[b.id];
  if (ca.noTrade || cb.noTrade)
    throw Error("A no-trade clause prevents this trade.");
  let va = a.ovr + (29 - a.age) * 0.8,
    vb = b.ovr + (29 - b.age) * 0.8;
  checkCooldown(s, "Trade contact", String(other));
  const permit = isBlockbuster(s, id, other, targetId)
    ? consumeBoardPermit(s, "Trade", { id, other, targetId })
    : null;
  setCooldown(s, "Trade contact", String(other), 7);
  if (va + 3 < vb) {
    log(
      s,
      "Trade proposal rejected",
      `${a.name} for ${b.name}: the other club wants stronger value.`,
    );
    fanReaction(
      s,
      `trade-rejected:${s.franchise.clock.day}:${other}`,
      -0.4,
      "Trade talks ended without an agreement",
    );
    return false;
  }
  if (
    permit?.scope === "Compromise" &&
    s.franchise.clubs[s.team].cash < 2 * MILLION
  )
    throw Error("Ownership requires a $2M transition reserve.");
  for (let [p, c, team] of [
    [a, ca, s.team],
    [b, cb, other],
  ]) {
    let remaining = 0;
    for (let bonus of [
      { amount: c.bonus, year: c.start, term: c.prorate },
      ...(c.restructureBonuses || []),
    ])
      for (
        let y = Math.max(financeYear(s), bonus.year);
        y < bonus.year + bonus.term;
        y++
      )
        remaining += bonusCharge(bonus.amount, bonus.term, y - bonus.year);
    s.franchise.dead.push({
      playerId: p.id,
      team,
      year: financeYear(s),
      amount: remaining,
      reason: "Trade bonus acceleration",
    });
    c.bonus = 0;
    c.restructureBonuses = [];
    c.team = team === s.team ? other : s.team;
    p.starter = false;
  }
  s.roster = s.roster.filter((p) => p.id !== a.id);
  s.franchise.clubs[other].players = roster(s, other).filter(
    (p) => p.id !== b.id,
  );
  s.roster.push(b);
  s.franchise.clubs[other].players.push(a);
  if (capLedger(s).room < 0 || capLedger(s, other).room < 0)
    throw Error("A team cannot absorb the trade’s cap consequences.");
  if (permit?.scope === "Compromise")
    s.franchise.clubs[s.team].cash -= 2 * MILLION;
  fanReaction(
    s,
    `trade:${s.year}:${id}:${targetId}`,
    Math.max(-3, Math.min(3, (b.ovr - a.ovr) * 0.15 + (a.age - b.age) * 0.25)),
    `${a.name} exchanged for ${b.name}`,
    { topic: "Trades", detail: `${b.pos} · ${b.ovr} overall · age ${b.age}` },
  );
  log(s, "Trade agreed", `${a.name} is exchanged for ${b.name}.`);
  return true;
}

// An extension appends new salary years while preserving all existing bonus obligations.
export function extendContract(s, id, terms) {
  requireRole(s, "finance");
  if (s.live) throw Error("Complete the game before negotiating an extension.");
  const p = s.roster.find((p) => p.id === id),
    c = s.franchise.contracts[id],
    year = financeYear(s);
  if (
    !p ||
    !c ||
    c.ended ||
    c.team !== s.team ||
    year < c.start ||
    year >= c.start + c.years
  )
    throw Error("A current rostered contract is required.");
  checkCooldown(s, "Contract review", id);
  const extension = proposal(s, p, terms);
  if (
    c.years + extension.years > 10 ||
    c.years + extension.years + extension.voidYears > 12
  )
    throw Error("The combined agreement exceeds the maximum contract horizon.");
  const start = c.start + c.years;
  // Agents demand a market-level annual value; security and coaching prestige influence the ask.
  const ask = Math.max(0.8, p.salary * coachPerks(s).demand),
    value =
      (extension.base.reduce((n, v) => n + v, 0) + extension.bonus) /
      extension.years /
      MILLION;
  if (value < ask * 0.92)
    throw Error(
      "The agent needs a stronger annual value before recommending the extension.",
    );
  for (const field of ["base", "guarantees", "roster", "workout"])
    c[field].push(...extension[field]);
  c.years += extension.years;
  c.voidYears = extension.voidYears;
  c.noTrade = c.noTrade || extension.noTrade;
  if (extension.bonus)
    (c.restructureBonuses ??= []).push({
      amount: extension.bonus,
      year,
      term: Math.min(5, c.start + c.years + c.voidYears - year),
    });
  for (const incentive of extension.incentives)
    c.incentives.push({ ...incentive, year: start });
  validateContract(c);
  for (let y = year; y < c.start + c.years; y++)
    if (capLedger(s, s.team, y).room < 0)
      throw Error(`The extension would exceed the ${y} salary cap.`);
  c.transactions.push({
    type: "extension",
    year,
    starts: start,
    years: extension.years,
  });
  p.salary = extension.base[0] / MILLION;
  setCooldown(s, "Contract review", id, 45);
  p.holdout = false;
  p.morale = Math.min(99, p.morale + 3);
  log(
    s,
    "Contract extension agreed",
    `${p.name} commits to ${extension.years} additional seasons from ${start}.`,
    "club",
  );
  return c;
}
