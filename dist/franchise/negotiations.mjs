import { coachPerks } from "./career-systems.mjs";
import * as S from "./state.mjs";
import * as C from "./contracts.mjs";
const round = (n) => Math.round(n * 10) / 10;
export const NEGOTIATION_PITCHES = {
  Security: "We want to build this around meaningful guaranteed money.",
  Compete: "We see you helping this group compete right away.",
  Development:
    "We can offer a clear football plan and strong support from the staff.",
};
export function contractSummary(s, c) {
  if (!c) return null;
  const total =
    c.base.reduce((a, b) => a + b, 0) +
    c.bonus +
    (c.roster || []).reduce((a, b) => a + b, 0) +
    (c.workout || []).reduce((a, b) => a + b, 0);
  const guaranteed = c.bonus + c.guarantees.reduce((a, b) => a + b, 0),
    cap = S.capHit(c, S.financeYear(s));
  return {
    total,
    guaranteed,
    cap,
    annual: total / c.years,
    remaining: S.capLedger(s).room - cap,
  };
}
function assertTerms(s, p, terms) {
  for (const key of ["roster", "workout", "incentive"])
    if (
      !Number.isFinite(Number(terms[key] || 0)) ||
      Number(terms[key] || 0) < 0
    )
      throw Error("Bonuses and incentives must be non-negative amounts.");
  if (!["LTBE", "NLTBE"].includes(terms.incentiveType || "NLTBE"))
    throw Error("Choose an incentive classification.");
  return C.proposal(s, p, terms);
}
export function beginNegotiation(s, id) {
  const p = s.agents.find((p) => p.id === id);
  if (!p) throw Error("This player is no longer a free agent.");
  const sessions = (s.franchise.negotiations ??= {}),
    old = sessions[id];
  if (old && old.team === s.team && old.year === S.financeYear(s)) return old;
  const annual = Math.max(0.8, p.salary * coachPerks(s).demand);
  return (sessions[id] = {
    id,
    team: s.team,
    year: S.financeYear(s),
    step: "Introduction",
    round: 0,
    pitch: null,
    status: "open",
    terms: {
      annual: round(annual),
      years: 3,
      bonus: round(annual * 0.5),
      guaranteed: round(annual),
      roster: 0,
      workout: 0,
      voidYears: 0,
      incentive: 0,
      incentiveType: "NLTBE",
      noTrade: false,
    },
    history: [],
  });
}
function active(s, id) {
  const p = s.agents.find((p) => p.id === id),
    n = s.franchise.negotiations?.[id];
  if (!p || !n || n.team !== s.team || n.year !== S.financeYear(s))
    throw Error("These talks are no longer current.");
  return { p, n };
}
export function discussPitch(s, id, pitch) {
  S.requireRole(s, "finance");
  if (!Object.hasOwn(NEGOTIATION_PITCHES, pitch))
    throw Error("Choose a meeting approach.");
  const { p, n } = active(s, id);
  if (n.status === "submitted")
    throw Error("This proposal is already with the player.");
  n.pitch = pitch;
  n.step = "Proposal";
  const priority =
    p.persona?.money >= 0.65
      ? "security"
      : p.age >= 30
        ? "a chance to compete"
        : "fit and a clear football plan";
  n.line =
    pitch === "Security"
      ? "That is a useful starting point. Show us how much is guaranteed and what the first year looks like."
      : pitch === "Compete"
        ? `The football case matters. We still need the terms to reflect the player's value; our priority is ${priority}.`
        : "A clear plan helps. We will judge the contract on the money, the guarantees and the situation together.";
}
export function evaluateNegotiation(s, id, terms) {
  S.requireRole(s, "finance");
  const { p, n } = active(s, id);
  if (n.status === "submitted")
    throw Error("This proposal has already been submitted.");
  const c = assertTerms(s, p, terms),
    summary = contractSummary(s, c);
  const baseline = C.proposal(s, p, {
    annual: Math.max(0.8, p.salary * coachPerks(s).demand),
    years: Number(terms.years),
    bonus: p.salary * 0.5,
    guaranteed: Math.min(
      p.salary,
      Math.max(0.8, p.salary * coachPerks(s).demand) * Number(terms.years),
    ),
  });
  const score = C.offerScore(s, p, { team: s.team, contract: c }),
    askScore = C.offerScore(s, p, { team: s.team, contract: baseline });
  const ratio = score / Math.max(1, askScore),
    rivals = s.franchise.market.offers.filter(
      (o) => o.playerId === id && o.team !== s.team,
    ),
    best = Math.max(0, ...rivals.map((o) => C.offerScore(s, p, o)));
  n.terms = { ...terms };
  n.round++;
  n.step = "Feedback";
  n.feedback =
    ratio >= 1.05
      ? "Strong proposal"
      : ratio >= 0.96
        ? "Competitive proposal"
        : "Needs improvement";
  n.line =
    ratio >= 1.05
      ? "This is a serious proposal. We are comfortable taking it back to the player, but the market still has a say."
      : ratio >= 0.96
        ? "We are close enough to keep talking. A little more security could make the choice easier."
        : "At that level, we would need a stronger base salary or more guaranteed money to recommend the offer.";
  if (best > score)
    n.line +=
      " Another current bid is more attractive under our overall evaluation.";
  n.counter = {
    ...terms,
    annual: round(
      Math.max(
        Number(terms.annual),
        p.salary * coachPerks(s).demand * (ratio < 0.96 ? 1.08 : 1),
      ),
    ),
    guaranteed: round(
      Math.min(
        Math.max(Number(terms.guaranteed), p.salary * 1.2),
        Math.max(Number(terms.annual), p.salary * 1.08) * Number(terms.years),
      ),
    ),
  };
  n.history.push({
    round: n.round,
    feedback: n.feedback,
    terms: { ...terms },
    line: n.line,
  });
  n.history = n.history.slice(-6);
  return { ...summary, feedback: n.feedback, score };
}
export function submitNegotiation(s, id) {
  const { p, n } = active(s, id);
  if (n.status === "submitted")
    throw Error("This offer was already submitted.");
  if (s.live)
    throw Error("Finish the live game before completing contract business.");
  assertTerms(s, p, n.terms);
  C.offer(s, id, n.terms);
  n.status = "submitted";
  n.step = "Submitted";
  n.submittedDay = s.franchise.market.day;
  n.line =
    "The proposal is with the player. We will compare the full situation and respond through the market. This is not a signed contract yet.";
  return n;
}
export function useCounter(s, id) {
  S.requireRole(s, "finance");
  const { n } = active(s, id);
  if (n.status === "submitted" || !n.counter)
    throw Error("No current counteroffer.");
  n.terms = { ...n.counter };
  n.step = "Proposal";
}
