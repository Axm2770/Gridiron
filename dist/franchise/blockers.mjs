// Plain explanations for refused actions. Each helper returns { reason, fix } (fix may be null
// when nothing the user can do changes the answer). Domain modules throw blockerText(...) so the
// same wording appears in toasts, disabled buttons and tests.
import { MILLION, capHit, bonusCharge, financeYear, allowed, roster } from "./state.mjs";

export const moneyText = (cents) => `$${(Math.abs(cents) / MILLION).toFixed(1)}M`;
export const blockerText = (b) => (b ? (b.fix ? `${b.reason} ${b.fix}` : b.reason) : "");

const AREA_WORDS = { roster: "trades and roster moves", finance: "contracts", scout: "scouting", coach: "the depth chart" };

export function roleBlocker(s, area) {
  if (allowed(s, area)) return null;
  return { reason: `In a ${s.franchise.role} career, your general manager handles ${AREA_WORDS[area] || area}.`, fix: "Switch your career role to Owner or GM in Career dossier to do it yourself." };
}

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

// Room a restructure can create now: base above the $0.8M floor, spread over remaining years.
export function restructureRoom(s, c) {
  const year = financeYear(s),
    i = c ? year - c.start : -1;
  if (!c || c.ended || i < 0 || i >= c.years || Math.min(5, c.years + (c.voidYears || 0) - i) <= 1) return 0;
  const amount = c.base[i] - 0.8 * MILLION,
    term = Math.min(5, c.years + (c.voidYears || 0) - i);
  return amount > 0 ? amount - Math.ceil(amount / term) : 0;
}

// "Cap space short by $2.1M: release X (saves $2.4M) or restructure Y (up to $3.0M)."
export function capShortfall(s, short, { exclude = [] } = {}) {
  const f = s.franchise,
    pool = s.roster.filter((p) => !exclude.includes(p.id) && f.contracts[p.id]),
    release = pool
      .filter((p) => !p.starter)
      .map((p) => ({ p, v: releaseSavings(s, f.contracts[p.id]) }))
      .filter((x) => x.v >= short)
      .sort((a, b) => (a.p.ovr ?? 0) - (b.p.ovr ?? 0) || a.v - b.v)[0],
    restructure = pool
      .map((p) => ({ p, v: restructureRoom(s, f.contracts[p.id]) }))
      .filter((x) => x.v >= short)
      .sort((a, b) => a.v - b.v)[0];
  const options = [];
  if (release) options.push(`release ${release.p.name} (saves ${moneyText(release.v)})`);
  if (restructure) options.push(`restructure ${restructure.p.name} (frees up to ${moneyText(restructure.v)})`);
  return {
    reason: `Cap space short by ${moneyText(short)}.`,
    fix: options.length ? `Fix: ${options.join(" or ")} in Contracts.` : "No single release or restructure covers it; combine moves in Contracts or reduce the salary involved.",
  };
}

// projected = active players after the move; returns null while it fits.
export function rosterFull(s, projected) {
  const limit = rosterLimit(s),
    over = projected - limit;
  if (over <= 0) return null;
  return {
    reason: `Your active roster would be ${projected}/${limit}.`,
    fix: `Waive ${over === 1 ? "a player" : `${over} players`} or move ${over === 1 ? "one" : "them"} to the practice squad on the Squad screen first.`,
  };
}
