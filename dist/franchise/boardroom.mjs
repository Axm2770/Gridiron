import {
  ensureCareerSystems,
  checkCooldown,
  setCooldown,
  cooldownRemaining,
} from "./career-systems.mjs";
import { requireRole, allowed, log, MILLION, capLedger } from "./state.mjs";
import { stadiumProject } from "./world.mjs";

// The boardroom answers three questions: what ownership expects, how safe the job is,
// and what money is available. Every action resolves immediately with a visible result.
export const MANDATES = {
  Rebuild: {
    shift: -2,
    text: "Develop young players and accept a lower win target this season.",
  },
  Compete: {
    shift: 0,
    text: "Meet the preseason projection for this roster.",
  },
  Contend: {
    shift: 1.5,
    text: "Promise ownership a playoff push. A higher target, more goodwill now.",
  },
};
export const FACILITIES = {
  training: {
    label: "Training facilities",
    cost: 35 * MILLION,
    max: 5,
    effect: "+7% weekly player development per level",
  },
  medical: {
    label: "Medical center",
    cost: 35 * MILLION,
    max: 5,
    effect: "Less wear and faster recovery per level",
  },
  condition: {
    label: "Stadium restoration",
    cost: 60 * MILLION,
    max: 85,
    effect: "+20% stadium condition, lifting fans and attendance",
  },
};
export const BUDGET_STEP = 5 * MILLION;
const RESERVE = 80 * MILLION;
const clamp = (n, a = 0, b = 100) => Math.max(a, Math.min(b, n));

export function ensureBoard(s) {
  const f = ensureCareerSystems(s);
  // Older saves keep their meeting/permit records; they are no longer read.
  const b = (f.boardroom ??= {});
  b.mandate = MANDATES[b.mandate] ? b.mandate : "Compete";
  if (!Number.isInteger(b.mandateYear)) b.mandateYear = null;
  if (!Array.isArray(b.decisions)) b.decisions = [];
  return b;
}
function record(s, kind, title, outcome, detail) {
  const b = ensureBoard(s);
  b.decisions.unshift({
    id: `board-${s.year}-${s.franchise.clock.day}-${b.decisions.length}`,
    year: s.year,
    week: s.week,
    kind,
    title,
    outcome,
    detail,
  });
  b.decisions = b.decisions.slice(0, 12);
  log(s, `Ownership: ${title}`, detail, "private");
}
function projectedWins(s) {
  const f = s.franchise,
    saved = f.preseasonExpectations?.[s.year]?.teams?.[s.team]?.expectedWins;
  return Number.isFinite(saved)
    ? saved
    : Math.round(clamp(8.5 + (s.teams[s.team].rating - 79) * 0.36, 3, 14) * 10) /
        10;
}

export function boardOverview(s) {
  const b = ensureBoard(s),
    club = s.franchise.clubs[s.team],
    team = s.teams[s.team],
    games = s.franchise.rules?.regularGames || 17,
    played = s.phase === "season" ? team.w + team.l + (team.t || 0) : 0,
    target =
      Math.round(
        clamp(projectedWins(s) + MANDATES[b.mandate].shift, 2, 15) * 10,
      ) / 10,
    pace = played ? (team.w / played) * games : null,
    gap = pace === null ? 0 : pace - target,
    patience = club.owner.patience,
    fans = club.fanApproval,
    security = Math.round(
      // Early-season pace is noisy; results count fully after eight games.
      clamp(patience * 0.55 + fans * 0.15 + 30 + clamp(gap, -5, 5) * 6 * Math.min(1, played / 8)),
    ),
    status =
      security >= 80
        ? "Secure"
        : security >= 60
          ? "Stable"
          : security >= 40
            ? "Under pressure"
            : "Hot seat",
    cap = capLedger(s),
    payroll = club.staff.reduce((n, c) => n + (c.salary || 0), 0),
    project = club.stadium.projects.find((p) => p.remaining > 0) || null;
  const factors = [
    {
      label: "Owner patience",
      value: `${Math.round(patience)}%`,
      tone: patience >= 60 ? "good" : patience >= 40 ? "warn" : "bad",
    },
    {
      label: "Fan approval",
      value: `${Math.round(fans)}%`,
      tone: fans >= 55 ? "good" : fans >= 40 ? "warn" : "bad",
    },
    {
      label: "Results vs target",
      value:
        pace === null
          ? "No games yet"
          : `On pace for ${pace.toFixed(1)} wins (${gap >= 0 ? "+" : ""}${gap.toFixed(1)})`,
      tone: pace === null ? "" : gap >= 0 ? "good" : gap > -2 ? "warn" : "bad",
    },
  ];
  const objectives = [
    {
      label: `Win ${Math.ceil(target)} regular-season games`,
      progress: `${team.w} / ${Math.ceil(target)}`,
      done: team.w >= Math.ceil(target),
      risk: pace !== null && gap < -1,
    },
    {
      label: "Stay under the salary cap",
      progress: cap.room >= 0 ? "Compliant" : "Over the cap",
      done: cap.room >= 0,
      risk: cap.room < 0,
    },
    {
      label: "Keep the fans onside",
      progress: `${Math.round(fans)}% approval`,
      done: fans >= 50,
      risk: fans < 40,
    },
  ];
  if (b.mandate === "Contend")
    objectives.push({
      label: "Reach the playoffs",
      progress: s.phase === "playoffs" ? "Qualified" : "In progress",
      done: s.phase === "playoffs",
      risk: pace !== null && gap < 0,
    });
  return {
    owner: club.owner,
    mandate: b.mandate,
    mandateLocked: b.mandateYear === s.year,
    target,
    projected: projectedWins(s),
    record: { w: team.w, l: team.l, played, games },
    pace,
    security,
    status,
    factors,
    objectives,
    budget: {
      cash: club.cash,
      staffBudget: club.staffBudget,
      staffPayroll: payroll,
      staffRoom: club.staffBudget - payroll,
      cap,
    },
    facilities: Object.fromEntries(
      Object.keys(FACILITIES).map((area) => [
        area,
        Math.round(club.stadium[area] || 0),
      ]),
    ),
    project,
    budgetCooldown: cooldownRemaining(s, "Budget"),
    decisions: b.decisions,
    can: {
      budget: allowed(s, "finance"),
      facilities: allowed(s, "stadium"),
    },
  };
}

export function setMandate(s, key) {
  const b = ensureBoard(s),
    club = s.franchise.clubs[s.team];
  if (!MANDATES[key]) throw Error("Choose a season mandate.");
  if (s.live) throw Error("Finish the current game first.");
  if (b.mandateYear === s.year)
    throw Error("The season mandate is already agreed for this year.");
  if (key === b.mandate && key === "Compete") {
    b.mandateYear = s.year;
    record(s, "Mandate", "Season mandate agreed", "Agreed", MANDATES[key].text);
    return b;
  }
  const delta =
    key === "Contend"
      ? 6
      : club.owner.trait === "Patient Rebuilder"
        ? 2
        : key === "Rebuild"
          ? -6
          : 0;
  club.owner.patience = clamp(club.owner.patience + delta);
  b.mandate = key;
  b.mandateYear = s.year;
  record(
    s,
    "Mandate",
    `${key} mandate agreed`,
    "Agreed",
    `${MANDATES[key].text} Owner patience ${delta >= 0 ? "+" : ""}${delta}.`,
  );
  return b;
}

export function requestStaffBudget(s) {
  requireRole(s, "finance");
  if (s.live) throw Error("Finish the current game first.");
  checkCooldown(s, "Budget");
  const o = boardOverview(s),
    club = s.franchise.clubs[s.team];
  let outcome, amount, detail;
  if (club.cash < RESERVE + BUDGET_STEP)
    (outcome = "Rejected"),
      (amount = 0),
      (detail = "Cash reserves are too low to raise the staff budget.");
  else if (o.security >= 60)
    (outcome = "Approved"),
      (amount = BUDGET_STEP),
      (detail = "Ownership trusts the direction of the club.");
  else if (o.security >= 40)
    (outcome = "Partial"),
      (amount = BUDGET_STEP / 2),
      (detail = "Ownership will only fund half while results are uncertain.");
  else
    (outcome = "Rejected"),
      (amount = 0),
      (detail = "Ownership will not spend more until results improve.");
  setCooldown(s, "Budget", "club", amount ? 90 : 30);
  club.staffBudget += amount;
  if (amount) club.owner.patience = clamp(club.owner.patience - 1);
  record(
    s,
    "Budget",
    amount
      ? `Staff budget +$${(amount / MILLION).toFixed(1)}M`
      : "Staff budget request declined",
    outcome,
    `${detail} Annual staff budget: $${(club.staffBudget / MILLION).toFixed(1)}M.`,
  );
  return { outcome, amount };
}

export function investFacility(s, area) {
  const spec = FACILITIES[area];
  if (!spec) throw Error("Choose a facility.");
  requireRole(s, "stadium");
  if (s.live) throw Error("Finish the current game first.");
  const club = s.franchise.clubs[s.team];
  if ((club.stadium[area] || 0) >= spec.max)
    throw Error(
      area === "condition"
        ? "The stadium is already in good condition."
        : `${spec.label} are already at the highest level.`,
    );
  stadiumProject(s, area, "Private");
  const owner = club.owner;
  if (owner.trait === "Penny-Pincher")
    owner.patience = clamp(owner.patience - 2);
  else owner.patience = clamp(owner.patience + 1);
  const project = club.stadium.projects.at(-1);
  record(
    s,
    "Facilities",
    `${spec.label} upgrade started`,
    "Approved",
    `$${(spec.cost / MILLION).toFixed(0)}M from club cash. Ready in ${project.remaining} weeks. ${spec.effect}.`,
  );
  return project;
}

// Ownership no longer vets individual trades, hires or projects. These keep older callers working.
export const isBlockbuster = () => false;
export const hasBoardPermit = () => true;
export const consumeBoardPermit = () => ({ scope: "Approved" });
