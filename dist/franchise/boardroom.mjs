import {
  ensureCareerSystems,
  hash,
  checkCooldown,
  setCooldown,
  coachReputation,
} from "./career-systems.mjs";
import { requireRole, log, MILLION } from "./state.mjs";
export const BOARD_KINDS = [
  "Stadium",
  "Relocation",
  "Staff change",
  "Trade",
  "Budget",
  "Uniform",
];
export const BOARD_COOLDOWNS = {
  Stadium: 42,
  Relocation: 365,
  "Staff change": 14,
  Trade: 7,
  Budget: 90,
  Uniform: 90,
};
export const BOARD_CHOICES = [
  [
    {
      label: "Make the football case",
      text: "This gives our players and coaches a better chance to meet the club’s objectives.",
      focus: "football",
    },
    {
      label: "Show the financial plan",
      text: "The proposal protects our reserves and sets a clear spending limit.",
      focus: "finance",
    },
    {
      label: "Put supporters first",
      text: "The people who follow this team should see a lasting benefit.",
      focus: "community",
    },
  ],
  [
    {
      label: "Accept performance milestones",
      text: "Review delivery against clear milestones before releasing the next commitment.",
      focus: "milestones",
    },
    {
      label: "Offer a tighter scope",
      text: "I can accept a more limited brief if we keep the core objective.",
      focus: "scope",
    },
    {
      label: "Stand by the full proposal",
      text: "I believe the full plan is necessary and I want your backing.",
      focus: "mandate",
    },
  ],
];
const canonical = (v) =>
  v && typeof v === "object"
    ? Object.fromEntries(
        Object.keys(v)
          .sort()
          .map((k) => [k, canonical(v[k])]),
      )
    : typeof v === "string"
      ? v.trim()
      : v;
export const boardFingerprint = (kind, payload) =>
  kind + ":" + JSON.stringify(canonical(payload));
function room(s) {
  const f = ensureCareerSystems(s);
  return (f.boardroom ??= {
    serial: 0,
    active: null,
    requests: [],
    permits: [],
  });
}
export function boardCost(s, kind, p = {}) {
  const club = s.franchise.clubs[s.team];
  if (kind === "Stadium")
    return (
      (p.area === "condition" ? 60 : p.area === "capacity" ? 250 : 35) *
      MILLION *
      (p.funding === "Public" ? 0.55 : 1)
    );
  if (kind === "Relocation") return 400 * MILLION;
  if (kind === "Budget") return Number(p.amount) * MILLION;
  if (kind === "Uniform") return 3 * MILLION;
  if (kind === "Staff change") {
    const c = club.staff.find((c) => c.id === p.id);
    return c ? Math.round(c.salary * Math.max(1, c.years) * 0.5) : 0;
  }
  return 0;
}
function validateRequest(s, kind, p) {
  if (
    kind === "Trade" &&
    (s.phase === "playoffs" ||
      (s.phase === "season" &&
        s.week >= (s.franchise.rules.tradeDeadline || 9)) ||
      (s.phase === "offseason" && s.franchise.market.phase === "Tampering"))
  )
    throw Error("The player trade window is closed.");
  if (kind === "Staff change") {
    if (!s.franchise.debug && !["Owner", "GM", "HC"].includes(s.franchise.role))
      throw Error("Your role delegates senior staff changes.");
  } else requireRole(s, kind === "Trade" ? "roster" : "stadium");
  if (
    kind === "Staff change" &&
    ["Owner", "GM", "HC"].includes(s.franchise.role)
  ) {
  } // Additional role checks remain in the appointment function.
  if (s.live)
    throw Error("Complete the current game before meeting ownership.");
  if (!BOARD_KINDS.includes(kind))
    throw Error("Choose an ownership agenda item.");
  const c = s.franchise.clubs[s.team];
  if (kind === "Stadium") {
    if (
      !["condition", "capacity", "medical", "training"].includes(p.area) ||
      !["Private", "Public"].includes(p.funding)
    )
      throw Error("Choose a facility and funding plan.");
    if (c.stadium.projects.some((x) => x.remaining > 0))
      throw Error("Complete the current construction project first.");
    if (
      p.funding === "Public" &&
      (c.fanApproval < 55 || c.stadium.condition > 85)
    )
      throw Error(
        "The council will not support public funding for this proposal.",
      );
  }
  if (kind === "Relocation") {
    if (s.phase !== "offseason")
      throw Error("Relocation applications are reviewed in the offseason.");
    if (c.stadium.condition > 50 && c.fanApproval > 45)
      throw Error(
        "There is no sufficient stadium or market case for relocation.",
      );
    if (
      !p.city?.trim() ||
      !p.name?.trim() ||
      p.city.length > 40 ||
      p.name.length > 40
    )
      throw Error("Enter a city and team name of up to 40 characters.");
  }
  if (kind === "Staff change" && !c.staff.some((x) => x.id === p.id))
    throw Error("The staff position has changed.");
  if (
    kind === "Trade" &&
    (!s.roster.some((x) => x.id === p.id) ||
      !s.franchise.clubs[p.other]?.players.some((x) => x.id === p.targetId))
  )
    throw Error("The proposed trade no longer matches the rosters.");
  if (
    kind === "Budget" &&
    (!Number.isFinite(Number(p.amount)) ||
      Number(p.amount) < 1 ||
      Number(p.amount) > 25)
  )
    throw Error(
      "Request an annual staff budget increase between $1M and $25M.",
    );
  if (
    kind === "Uniform" &&
    (!/^#[0-9a-f]{6}$/i.test(p.primary) ||
      !/^#[0-9a-f]{6}$/i.test(p.secondary) ||
      p.primary === p.secondary)
  )
    throw Error("Choose two distinct uniform colors.");
  if (c.cash < boardCost(s, kind, p) + (kind === "Budget" ? 30 * MILLION : 0))
    throw Error(
      "The club cannot support that commitment with its current reserves.",
    );
}
export function beginBoardRequest(s, kind, payload = {}) {
  const b = room(s),
    p = structuredClone(canonical(payload));
  validateRequest(s, kind, p);
  const fingerprint = boardFingerprint(kind, p),
    active = b.requests.find((r) => r.id === b.active);
  if (active && active.status === "meeting") {
    if (active.fingerprint === fingerprint) return active;
    throw Error("Conclude or withdraw the current ownership meeting first.");
  }
  checkCooldown(s, kind, kind === "Staff change" ? p.id : "club");
  setCooldown(
    s,
    kind,
    kind === "Staff change" ? p.id : "club",
    BOARD_COOLDOWNS[kind],
  );
  const r = {
    id: `board-${++b.serial}-${s.year}-${s.team}`,
    team: s.team,
    year: s.year,
    week: s.week,
    day: s.franchise.clock.day,
    kind,
    payload: p,
    fingerprint,
    step: 0,
    status: "meeting",
    choices: [],
    cost: boardCost(s, kind, p),
  };
  b.requests.unshift(r);
  b.requests = b.requests.slice(0, 100);
  b.active = r.id;
  log(
    s,
    "Ownership meeting scheduled",
    `${kind}: the board will hear your case.`,
    "private",
  );
  return r;
}
export function activeBoardRequest(s) {
  const b = room(s);
  return b.requests.find((r) => r.id === b.active) || null;
}
export function answerBoard(s, id, step, choice) {
  const b = room(s),
    r = b.requests.find((r) => r.id === id);
  if (
    !r ||
    r.team !== s.team ||
    r.status !== "meeting" ||
    r.step !== step ||
    !BOARD_CHOICES[step]?.[choice]
  )
    throw Error("This boardroom response is no longer available.");
  if (s.live)
    throw Error("Finish the match before resuming the board meeting.");
  r.choices.push(choice);
  r.step++;
  if (r.step < 2) return r;
  const c = s.franchise.clubs[s.team],
    owner = c.owner.trait;
  let score =
    52 +
    (coachReputation(s) - 50) * 0.22 +
    (c.owner.patience - 60) * 0.18 +
    ((hash(r.fingerprint + s.year + s.team) % 25) - 12);
  if (r.kind === "Stadium")
    score +=
      r.payload.area === "condition" ? (85 - c.stadium.condition) * 0.25 : 8;
  if (r.kind === "Relocation") score += c.stadium.condition < 40 ? 9 : 3;
  if (r.kind === "Staff change") {
    const old = c.staff.find((c) => c.id === r.payload.id);
    score +=
      (s.teams[s.team].l - s.teams[s.team].w) * 2 - (old?.rating >= 85 ? 8 : 0);
    if (r.payload.replacement) score += 6;
  }
  if (r.kind === "Trade") score += r.payload.reason === "Rebuild" ? 3 : 6;
  if (r.kind === "Budget") score += c.cash > 250 * MILLION ? 5 : -8;
  const first = BOARD_CHOICES[0][r.choices[0]].focus,
    last = BOARD_CHOICES[1][choice].focus;
  score +=
    owner === "Penny-Pincher"
      ? first === "finance"
        ? 13
        : first === "community"
          ? -3
          : 1
      : owner === "Patient Rebuilder"
        ? first === "football"
          ? 10
          : 5
        : owner === "Meddler"
          ? first === "community"
            ? 8
            : 3
          : first === "football"
            ? 12
            : 2;
  score +=
    last === "milestones"
      ? 9
      : last === "scope"
        ? 13
        : owner === "Meddler"
          ? -14
          : -2;
  r.score = Math.round(score);
  r.outcome =
    score >= 74 ? "Approved" : score >= 55 ? "Compromise" : "Rejected";
  r.status = "decided";
  r.decidedDay = s.franchise.clock.day;
  b.active = null;
  r.line =
    r.outcome === "Approved"
      ? "We will back the proposal. Deliver on the case you have made."
      : r.outcome === "Compromise"
        ? "We can support a narrower commitment, with additional delivery conditions."
        : "The board will not support this commitment. Rebuild the case before bringing it back.";
  if (r.outcome !== "Rejected")
    b.permits.push({
      id: r.id,
      team: r.team,
      fingerprint: r.fingerprint,
      kind: r.kind,
      payload: r.payload,
      scope: r.outcome,
      until: s.franchise.clock.day + 30,
      used: false,
    });
  log(
    s,
    `Ownership: ${r.outcome.toLowerCase()}`,
    `${r.kind}. ${r.line}`,
    "private",
  );
  return r;
}
export function hasBoardPermit(s, kind, payload) {
  return room(s).permits.some(
    (p) =>
      p.team === s.team &&
      !p.used &&
      p.until >= s.franchise.clock.day &&
      p.fingerprint === boardFingerprint(kind, payload),
  );
}
export function consumeBoardPermit(s, kind, payload) {
  const b = room(s),
    p = b.permits.find(
      (p) =>
        p.team === s.team &&
        !p.used &&
        p.until >= s.franchise.clock.day &&
        p.fingerprint === boardFingerprint(kind, payload),
    );
  if (!p)
    throw Error(
      "Ownership approval is required. Present this proposal in the boardroom.",
    );
  p.used = true;
  const r = b.requests.find((r) => r.id === p.id);
  if (r) r.status = "executed";
  return p;
}
export function withdrawBoard(s, id) {
  const b = room(s),
    r = b.requests.find((r) => r.id === id);
  if (!r || r.team !== s.team || r.status !== "meeting")
    throw Error("No active ownership proposal.");
  r.status = "withdrawn";
  if (b.active === id) b.active = null;
}
export function applyBudget(s, payload) {
  requireRole(s, "stadium");
  const p = consumeBoardPermit(s, "Budget", payload),
    c = s.franchise.clubs[s.team];
  const amount = Math.round(
    Number(payload.amount) * MILLION * (p.scope === "Compromise" ? 0.5 : 1),
  );
  if (c.cash < amount + 30 * MILLION)
    throw Error("Insufficient operating reserves.");
  c.staffBudget += amount;
  log(
    s,
    "Staff budget increased",
    `The annual football staff budget is now $${(c.staffBudget / MILLION).toFixed(1)}M.`,
    "club",
  );
}
export function applyUniform(s, payload) {
  requireRole(s, "stadium");
  const p = consumeBoardPermit(s, "Uniform", payload),
    c = s.franchise.clubs[s.team];
  if (c.cash < 3 * MILLION) throw Error("Insufficient rebranding budget.");
  c.cash -= 3 * MILLION;
  c.uniform = {
    ...payload,
    alternateOnly: p.scope === "Compromise",
    year: s.year,
  };
  log(
    s,
    "New uniform identity",
    p.scope === "Compromise"
      ? "Ownership approved an alternate uniform package."
      : "Ownership approved the new primary and secondary uniform colors.",
    "club",
  );
}
export function isBlockbuster(s, id, other, target) {
  const a = s.roster.find((p) => p.id === id),
    b = s.franchise.clubs[other]?.players.find((p) => p.id === target);
  return !!(a && b && Math.max(a.ovr, b.ovr) >= 88);
}
