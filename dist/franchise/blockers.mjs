// Plain explanations for refused actions. Each helper returns { reason, fix, fixes }: reason is the
// problem (shown bold), fix is one sentence saying what to do (null when nothing the user can do
// changes the answer), and fixes are structured options the UI turns into buttons
// (ui/notice.mjs renders them, franchise/fixes.mjs runs them):
//   { kind: "release" | "restructure" | "practice" | "waive", playerId, label, amount? }
//   { kind: "open", route, tab?, label }   { kind: "matchday" | "quicksim", label }
//   { kind: "dealRemove", side, id, label } { kind: "freeAgents", pos?, label }
// Domain modules throw blockerText(...) so the same wording appears in toasts, disabled buttons
// and tests.
import { MILLION, capHit, capLedger, bonusCharge, financeYear, allowed, roster, ROLE_TITLES, capWorse } from "./state.mjs";
import { cooldownRemaining } from "./career-systems.mjs";

export const moneyText = (cents) => `$${(Math.abs(cents) / MILLION).toFixed(1)}M`;
export const blockerText = (b) => (b ? (b.fix ? `${b.reason} ${b.fix}` : b.reason) : "");

const AREA_WORDS = { roster: "trades and roster moves", finance: "contracts", scout: "scouting", coach: "the depth chart" };

export function roleBlocker(s, area) {
  if (allowed(s, area)) return null;
  return {
    reason: `As ${ROLE_TITLES[s.franchise.role] || s.franchise.role}, ${AREA_WORDS[area] || area} are handled by the front office.`,
    fix: "Your career role was set when the career began. Start a new career, or accept a job offer as Head coach, GM or Owner, to do it yourself.",
    fixes: [{ kind: "open", route: "Career", label: "Open Coach career" }],
  };
}

// A game in progress locks business; both fixes end it or take you to it.
export const liveFixes = () => [
  { kind: "quicksim", label: "Quick-sim the game" },
  { kind: "matchday", label: "Go to Matchday" },
];

export function rosterLimit(s) {
  return s.phase === "offseason" ? 90 : 53;
}
export const activeCount = (s, team = s.team) => roster(s, team).filter((p) => !p.status || p.status === "active").length;

// Cap a release frees this league year: the cap hit leaves, unamortised bonus and guarantees stay.
export function releaseSavings(s, c) {
  if (!c || c.ended) return 0;
  const year = financeYear(s);
  let dead = c.guarantees.slice(Math.max(0, year - c.start)).reduce((a, b) => a + b, 0);
  for (const b of [{ amount: c.bonus, year: c.start, term: c.prorate }, ...(c.restructureBonuses || [])])
    for (let y = Math.max(year, b.year); y < b.year + b.term; y++) dead += bonusCharge(b.amount, b.term, y - b.year);
  return capHit(c, year) - dead;
}
// Dead money an immediate release leaves on the cap (what was charged but doesn't leave).
export function releaseDeadMoney(s, c) {
  if (!c || c.ended) return 0;
  return capHit(c, financeYear(s)) - releaseSavings(s, c);
}

// Room a restructure can create now: base above the $0.8M floor, spread over remaining years.
export function restructureRoom(s, c) {
  const year = financeYear(s),
    i = c ? year - c.start : -1;
  if (!c || c.ended || i < 0 || i >= c.years || Math.min(5, c.years + (c.voidYears || 0) - i) <= 1) return 0;
  const amount = Math.floor((c.base[i] - 0.8 * MILLION) / (0.01 * MILLION)) * 0.01 * MILLION,
    term = Math.min(5, c.years + (c.voidYears || 0) - i);
  return amount > 0 ? amount - Math.ceil(amount / term) : 0;
}

// The smallest restructure (in $0.01M steps) that frees `short` this year, or the largest allowed
// when short is omitted: { amount, frees, term, perYear } in cents, or null when none is possible.
export function restructurePlan(s, c, short = Infinity) {
  if (!restructureRoom(s, c)) return null;
  const i = financeYear(s) - c.start,
    term = Math.min(5, c.years + (c.voidYears || 0) - i),
    step = 0.01 * MILLION,
    max = Math.floor((c.base[i] - 0.8 * MILLION) / step) * step;
  let amount = Number.isFinite(short) ? Math.ceil((short * term) / (term - 1) / step) * step : max;
  amount = Math.round(Math.min(max, Math.max(step, amount)));
  if (amount <= 0) return null;
  // Proration rounds the first-year charge up by a cent; step up until the gap is really covered.
  while (Number.isFinite(short) && amount - Math.ceil(amount / term) < short && amount + step <= max) amount = Math.round(amount + step);
  const perYear = Math.ceil(amount / term);
  return { amount, frees: amount - perYear, term, perYear };
}

const contractCooldown = (s, id) => {
  try {
    return cooldownRemaining(s, "Contract review", id);
  } catch {
    return 0;
  }
};

// "You are $2.1M short of cap space. Fix: release X (saves $2.4M) or restructure Y."
export function capShortfall(s, short, { exclude = [] } = {}) {
  const f = s.franchise,
    pool = s.roster.filter((p) => !exclude.includes(p.id) && f.contracts[p.id]),
    release = pool
      .filter((p) => !p.starter)
      .map((p) => ({ p, v: releaseSavings(s, f.contracts[p.id]) }))
      .filter((x) => x.v >= short)
      .sort((a, b) => (a.p.ovr ?? 0) - (b.p.ovr ?? 0) || a.v - b.v)[0],
    restructure = pool
      .filter((p) => !contractCooldown(s, p.id))
      .map((p) => ({ p, v: restructureRoom(s, f.contracts[p.id]) }))
      .filter((x) => x.v >= short)
      .sort((a, b) => a.v - b.v)[0];
  const options = [],
    fixes = [];
  if (release) {
    options.push(`release ${release.p.name} (saves ${moneyText(release.v)})`);
    fixes.push({ kind: "release", playerId: release.p.id, label: `Release ${release.p.name} (−${moneyText(release.v)})`, saves: release.v });
  }
  if (restructure) {
    const plan = restructurePlan(s, f.contracts[restructure.p.id], short);
    options.push(`restructure ${restructure.p.name} (frees up to ${moneyText(restructure.v)})`);
    if (plan) fixes.push({ kind: "restructure", playerId: restructure.p.id, label: `Restructure ${restructure.p.name} (+${moneyText(plan.frees)})`, amount: plan.amount, frees: plan.frees });
  }
  fixes.push({ kind: "open", route: "Contracts", label: "Open Contracts" });
  return {
    reason: `You are ${moneyText(short)} short of cap space.`,
    fix: options.length ? `Fix: ${options.join(" or ")} in Contracts.` : "No single release or restructure covers it; combine moves in Contracts or reduce the salary involved.",
    fixes,
  };
}

// The cheapest ways to open one active spot: the least valuable healthy reserve to the practice
// squad (while it has room) and the least valuable reserve to waivers, plus the Squad screen.
export function rosterSpotFixes(s, { exclude = [] } = {}) {
  const f = s.franchise,
    reserves = s.roster.filter((p) => !exclude.includes(p.id) && (!p.status || p.status === "active") && !p.starter && f.contracts[p.id]),
    byValue = (a, b) => (a.ovr ?? 0) - (b.ovr ?? 0) || (a.pot ?? 0) - (b.pot ?? 0),
    practiceRoom = s.roster.filter((p) => p.status === "practice").length < (f.rules?.practice ?? 16),
    practice = practiceRoom ? reserves.filter((p) => !p.injury).sort(byValue)[0] : null,
    // Same rule as contracts.cut: a release may not leave the club over the cap with less room.
    room = capLedger(s).room,
    releasable = (p) => f.debug || !capWorse(room + releaseSavings(s, f.contracts[p.id]), room),
    waive = reserves.filter(releasable).sort((a, b) => byValue(a, b) || releaseDeadMoney(s, f.contracts[a.id]) - releaseDeadMoney(s, f.contracts[b.id]))[0],
    fixes = [];
  if (practice) fixes.push({ kind: "practice", playerId: practice.id, label: `Move ${practice.name} to practice squad` });
  if (waive) fixes.push({ kind: "waive", playerId: waive.id, label: `Waive ${waive.name}` });
  fixes.push({ kind: "open", route: "Roster", label: "Open Squad" });
  return fixes;
}

// Fix options for a compliance issue or calendar pause ({ route, message, code? }): the cap and
// roster checks get the same inline fixes as blockers, anything else opens its screen.
const ROUTE_LABELS = { Contracts: "Open Contracts", Roster: "Open Squad", Inbox: "Open Inbox", "Game plan": "Open Tactics", Medical: "Open Medical", Draft: "Open Draft room", Staff: "Open Coaching staff" };
export function issueFixes(s, issue = {}) {
  const msg = String(issue.message || ""),
    room = (() => {
      try {
        return capLedger(s).room;
      } catch {
        return 0;
      }
    })();
  if ((issue.code === "CAP_OVER" || /above the salary cap|Over the salary cap|Clear \$/.test(msg)) && room < 0) return capShortfall(s, -room).fixes;
  if (issue.code === "ROSTER_ACTIVE" || /Active roster: \d+|exceeds 53/.test(msg)) return rosterSpotFixes(s);
  if (/inbox/i.test(msg)) return [{ kind: "open", route: "Inbox", label: "Open Inbox" }];
  if (/Begin next season/.test(msg)) return [{ kind: "open", route: "Draft", label: "Open Draft room" }];
  return issue.route ? [{ kind: "open", route: issue.route, label: ROUTE_LABELS[issue.route] || `Open ${issue.route}` }] : [];
}

// projected = active players after the move; returns null while it fits.
export function rosterFull(s, projected, { exclude = [] } = {}) {
  const limit = rosterLimit(s),
    over = projected - limit;
  if (over <= 0) return null;
  return {
    reason: `Your active roster would be ${projected}/${limit}.`,
    fix: `Waive ${over === 1 ? "a player" : `${over} players`} or move ${over === 1 ? "one" : "them"} to the practice squad on the Squad screen first.`,
    fixes: rosterSpotFixes(s, { exclude }),
  };
}
