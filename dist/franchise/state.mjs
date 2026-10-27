import {
  ensureCareerSystems,
  validateCareerSystems,
} from "./career-systems.mjs";
import { ensureRecordBook } from "./records.mjs";
import { newgenIdentity } from "./newgens.mjs";
import { random, clamp } from "../engine/random.mjs";
export const MILLION = 100000000;
export const ROLES = {
  Owner: ["finance", "roster", "coach", "stadium", "league", "media", "scout"],
  GM: ["finance", "roster", "scout", "media"],
  HC: ["coach", "media"],
  OC: ["offense", "media"],
  DC: ["defense", "media"],
};
export const POS = [
  "QB",
  "RB",
  "WR",
  "WR",
  "TE",
  "OL",
  "OL",
  "OL",
  "OL",
  "OL",
  "DL",
  "DL",
  "DL",
  "LB",
  "LB",
  "LB",
  "CB",
  "CB",
  "S",
  "S",
  "K",
  "P",
];
export function makePlayer(id, position, seed, rookie = false) {
  let rng = random(seed),
    r = (a, b) => Math.floor(a + rng() * (b - a + 1)),
    ovr = r(58, 84);
  return {
    id,
    ...newgenIdentity(id, seed, rookie, position),
    pos: position,
    age: rookie ? r(21, 23) : r(23, 32),
    ovr,
    pot: Math.min(99, ovr + r(3, 15)),
    salary: rookie ? 1 : r(9, 19) / 10,
    starter: false,
    injury: 0,
    fitness: 100,
    status: "active",
    morale: r(60, 85),
    persona: {
      money: rng(),
      loyalty: rng(),
      ambition: rng(),
      leadership: rng(),
    },
    wear: { knee: 0, ankle: 0, shoulder: 0, back: 0 },
    stats: {},
  };
}
export function basicContract(p, team, year) {
  let salary = Math.round(p.salary * MILLION),
    bonus = Math.round(salary * 0.6);
  return {
    id: "contract-" + p.id,
    playerId: p.id,
    team,
    start: year,
    years: 3,
    bonus,
    prorate: 3,
    base: [0, 1, 2].map(() => Math.round(salary * 0.8)),
    roster: [0, 0, 0],
    workout: [0, 0, 0],
    guarantees: [Math.round(salary * 0.2), 0, 0],
    incentives: [],
    voidYears: 0,
    noTrade: false,
    transactions: [],
    ended: false,
  };
}
export function migrate(s) {
  if (s.franchise?.version === 1) {
    ensureCareerSystems(s);
    ensureRecordBook(s);
    return s;
  }
  let f = {
    version: 1,
    role: "Owner",
    career: {
      origin: "Former Player",
      archetype: "Development Wizard",
      xp: 0,
      skills: { offense: 0, defense: 0, development: 0, cap: 0 },
      reputation: 50,
    },
    clubs: [],
    contracts: {},
    dead: [],
    market: { day: 3, phase: "Open", offers: [], losses: [], gains: [] },
    draft: null,
    waivers: [],
    claims: [],
    reports: {},
    visits: [],
    scoutPoints: 10,
    board: [],
    events: [],
    archive: [],
    awards: [],
    hall: [],
    records: {},
    history: [],
    rules: {
      cap: 255 * MILLION,
      rollover: true,
      active: 53,
      preseason: 90,
      practice: 16,
      elevations: 2,
      protected: 4,
      irWeeks: 4,
      regularGames: 17,
      seasonWeeks: 18,
      overtime: "Sudden death (simulation)",
      compMax: 4,
    },
    rollover: {},
    directives: {
      protectQB: false,
      feedRB: false,
      rookies: false,
      halftime: true,
    },
    preparation: { intensity: 50, familiarity: 50 },
    calendar: { day: 200, stage: "Regular season", leagueYear: s.year },
    taxRate: Array.from({ length: 32 }, (_, i) => (i % 5) * 0.015),
    debug: false,
  };
  for (let t = 0; t < 32; t++) {
    let players =
      t === s.team
        ? s.roster
        : Array.from({ length: 53 }, (_, i) =>
            makePlayer(
              `club-${t}-${i}`,
              POS[i % POS.length],
              s.year * 919 + t * 131 + i,
            ),
          );
    if (t === s.team) {
      while (players.length < 53) {
        let i = players.length;
        players.push(
          makePlayer(
            `depth-${s.year}-${t}-${i}`,
            POS[i % POS.length],
            s.year * 71 + i,
          ),
        );
      }
    }
    for (let p of players) {
      p.status ??= "active";
      p.morale ??= 75;
      p.persona ??= {
        money: 0.5,
        loyalty: 0.5,
        ambition: 0.5,
        leadership: 0.5,
      };
      p.wear ??= { knee: 0, ankle: 0, shoulder: 0, back: 0 };
      p.stats ??= {};
      f.contracts[p.id] = basicContract(p, t, s.year);
    }
    f.clubs.push({
      id: t,
      players: t === s.team ? [] : players,
      owner: {
        name: "Ownership Group " + (t + 1),
        trait: ["Patient Rebuilder", "Win-Now", "Penny-Pincher", "Meddler"][
          t % 4
        ],
        age: 45 + t,
        patience: 70,
      },
      cash: 650 * MILLION,
      fanApproval: 65,
      attendance: 0.8,
      staff: [
        {
          id: `hc-${t}`,
          name: [
            "Daniel Hayes",
            "Morgan Reed",
            "Taylor Grant",
            "Cameron Brooks",
          ][t % 4],
          role: "HC",
          rating: 70 + (t % 20),
          salary: 5 * MILLION,
          scheme: "Balanced",
          years: 3,
          compEligible: false,
        },
      ],
      stadium: {
        name: "Home Field",
        city: "Home market",
        condition: 75,
        capacity: 65000,
        ticket: 110,
        concessions: 25,
        luxury: 40 * MILLION,
        medical: 1,
        training: 1,
        projects: [],
        relocation: null,
      },
      rebrand: null,
    });
  }
  s.franchise = f;
  for (let p of s.agents) {
    p.status = "free";
    p.stats ??= {};
    p.wear ??= { knee: 0, ankle: 0, shoulder: 0, back: 0 };
    p.fitness ??= 100;
    p.persona ??= { money: 0.5, loyalty: 0.5, ambition: 0.5 };
    p.morale ??= 70;
  }
  ensureCareerSystems(s);
  ensureRecordBook(s);
  return s;
}
export function roster(s, team = s.team) {
  return team === s.team ? s.roster : s.franchise.clubs[team].players;
}
export function active(s, team = s.team) {
  return roster(s, team).filter(
    (p) => p.status === "active" || p.status === "elevated",
  );
}
export function log(s, title, body, kind = "club") {
  s.franchise.events.unshift({
    id: `event-${s.year}-${s.week}-${(s.franchise.eventSerial = (s.franchise.eventSerial || s.franchise.events.length || 0) + 1)}`,
    year: s.year,
    week: s.week,
    title,
    body,
    kind,
  });
  s.franchise.events = s.franchise.events.slice(0, 250);
}
export function allowed(s, area) {
  return s.franchise.debug || ROLES[s.franchise.role]?.includes(area);
}
export function requireRole(s, area) {
  if (!allowed(s, area))
    throw Error(
      `${s.franchise.role} delegates ${area} decisions. Change career role or ask the responsible staff member.`,
    );
}
export function bonusCharge(amount, term, index) {
  if (index < 0 || index >= term) return 0;
  return Math.floor(amount / term) + (index < amount % term ? 1 : 0);
}
export function capHit(c, year) {
  if (!c || c.ended) return 0;
  let i = year - c.start;
  if (i < 0 || i >= c.years + c.voidYears) return 0;
  let value =
    i < c.years
      ? (c.base[i] || 0) + (c.roster[i] || 0) + (c.workout[i] || 0)
      : 0;
  for (let b of [
    { amount: c.bonus, year: c.start, term: c.prorate },
    ...(c.restructureBonuses || []),
  ])
    if (year >= b.year && year < b.year + b.term)
      value += bonusCharge(b.amount, b.term, year - b.year);
  for (let v of c.incentives || [])
    if (v.year === year && v.type === "LTBE") value += v.amount;
  return value;
}
export function financeYear(s) {
  return s.franchise.calendar.leagueYear || s.year;
}
export function capLedger(s, team = s.team, year = financeYear(s)) {
  let f = s.franchise,
    live = Object.values(f.contracts)
      .filter((c) => c.team === team)
      .reduce((n, c) => n + capHit(c, year), 0),
    dead = f.dead
      .filter((d) => d.team === team && d.year === year)
      .reduce((n, d) => n + d.amount, 0),
    limit =
      f.rules.cap +
      (f.rollover[team]?.year === year ? f.rollover[team].amount : 0);
  let adjustments = (f.capAdjustments || [])
    .filter((a) => a.team === team && a.year === year)
    .reduce((n, a) => n + a.amount, 0);
  return {
    limit,
    live,
    dead,
    adjustments,
    used: live + dead + adjustments,
    room: limit - live - dead - adjustments,
  };
}
export function gameEligibility(s) {
  let errors = [],
    a = active(s);
  if (a.length > 55)
    errors.push("Game roster exceeds 55, including elevations.");
  if (a.filter((p) => p.status === "active").length > 53)
    errors.push("Active roster exceeds 53.");
  if (a.filter((p) => p.status === "elevated").length > 2)
    errors.push("At most two practice-squad elevations.");
  if (capLedger(s).room < 0 && !s.franchise.debug)
    errors.push("Team is above the salary cap.");
  for (let [pos, min] of Object.entries({
    QB: 1,
    RB: 1,
    WR: 2,
    TE: 1,
    OL: 5,
    DL: 3,
    LB: 2,
    CB: 2,
    S: 2,
    K: 1,
  }))
    if (a.filter((p) => p.pos === pos && !p.injury && !p.holdout).length < min)
      errors.push(
        `Need ${min} healthy ${pos}; injuries and holdouts are unavailable.`,
      );
  return errors;
}
export function validateContract(c) {
  if (
    !c ||
    !Number.isInteger(c.team) ||
    c.team < 0 ||
    c.team > 31 ||
    !c.playerId ||
    !Number.isInteger(c.start) ||
    !Number.isInteger(c.years) ||
    c.years < 1 ||
    c.years > 10 ||
    !Number.isInteger(c.voidYears) ||
    c.voidYears < 0 ||
    c.years + c.voidYears > 12 ||
    !Number.isInteger(c.prorate) ||
    c.prorate < 1 ||
    c.prorate > 5 ||
    c.prorate > c.years + c.voidYears
  )
    throw Error("Invalid contract term or bonus proration.");
  for (const key of ["base", "guarantees", "roster", "workout"])
    if (
      !Array.isArray(c[key]) ||
      c[key].length !== c.years ||
      c[key].some((n) => !Number.isSafeInteger(n) || n < 0)
    )
      throw Error(
        "Contract schedules must contain nonnegative integer cents for every playing year.",
      );
  if (
    !Number.isSafeInteger(c.bonus) ||
    c.bonus < 0 ||
    c.guarantees.some((n, i) => n > c.base[i])
  )
    throw Error("Contract guarantees cannot exceed scheduled base salary.");
  for (const i of c.incentives || [])
    if (
      !["LTBE", "NLTBE"].includes(i.type) ||
      !Number.isSafeInteger(i.amount) ||
      i.amount < 0 ||
      !Number.isInteger(i.year) ||
      i.year < c.start ||
      i.year >= c.start + c.years
    )
      throw Error("Invalid contract incentive schedule.");
  for (const b of c.restructureBonuses || [])
    if (
      !Number.isSafeInteger(b.amount) ||
      b.amount < 0 ||
      !Number.isInteger(b.year) ||
      !Number.isInteger(b.term) ||
      b.term < 1 ||
      b.term > 5 ||
      b.year < c.start ||
      b.year + b.term > c.start + c.years + c.voidYears
    )
      throw Error("Invalid restructured bonus proration.");
  return true;
}
export function validate(s) {
  validateCareerSystems(s);
  let f = s.franchise,
    ids = new Set();
  for (let t = 0; t < 32; t++) {
    let players = roster(s, t);
    for (let p of players) {
      if (!p?.id || ids.has(p.id)) throw Error("Duplicate/missing player ID.");
      ids.add(p.id);
      if (!Number.isFinite(p.ovr) || p.ovr < 0 || p.ovr > 99)
        throw Error("Invalid rating.");
    }
    if (players.filter((p) => p.status === "active").length > f.rules.preseason)
      throw Error("Roster exceeds preseason limit.");
    if (
      players.filter((p) => p.status === "practice").length > f.rules.practice
    )
      throw Error("Practice squad full.");
  }
  if (!Number.isSafeInteger(f.rules.cap) || f.rules.cap <= 0)
    throw Error("Invalid salary cap limit.");
  for (const d of f.dead)
    if (
      !Number.isSafeInteger(d.amount) ||
      d.amount < 0 ||
      !Number.isInteger(d.year)
    )
      throw Error("Invalid dead-cap ledger entry.");
  for (const a of f.capAdjustments || [])
    if (!Number.isSafeInteger(a.amount) || !Number.isInteger(a.year))
      throw Error("Invalid cap adjustment.");
  for (const r of Object.values(f.rollover || {}))
    if (
      !Number.isSafeInteger(r.amount) ||
      r.amount < 0 ||
      !Number.isInteger(r.year)
    )
      throw Error("Invalid cap rollover.");
  for (let c of Object.values(f.contracts)) {
    validateContract(c);
    for (let n of [
      c.bonus,
      ...c.base,
      ...c.guarantees,
      ...c.roster,
      ...c.workout,
      ...(c.incentives || []).map((v) => v.amount),
    ])
      if (!Number.isSafeInteger(n) || n < 0)
        throw Error("Contract amounts must be nonnegative integer cents.");
  }
  return true;
}
export function transact(s, fn) {
  let draft = structuredClone(s);
  fn(draft);
  validate(draft);
  return draft;
}
