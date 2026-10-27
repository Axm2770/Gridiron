import { recordDraftDevelopment } from "./career-systems.mjs";
import { assertCanAdvance } from "./compliance.mjs";
import {
  roster,
  active,
  log,
  requireRole,
  makePlayer,
  POS,
  MILLION,
  capLedger,
  basicContract,
  financeYear,
} from "./state.mjs";
import { cut } from "./contracts.mjs";
import { random, clamp } from "../engine/random.mjs";
export function movePlayer(s, id, destination) {
  requireRole(s, "roster");
  if (s.live) throw Error("Roster designations are locked during a game.");
  let p = s.roster.find((p) => p.id === id);
  if (!p) throw Error("Player unavailable.");
  let f = s.franchise;
  if (destination === "practice") {
    if (p.starter) throw Error("Replace the starter first.");
    if (
      s.roster.filter((p) => p.status === "practice").length >= f.rules.practice
    )
      throw Error("Practice squad is full.");
    p.status = "practice";
    p.salary = 0.4;
    f.contracts[id].base[financeYear(s) - f.contracts[id].start] =
      0.4 * MILLION;
    p.protected = false;
  } else if (destination === "active") {
    if (active(s).filter((p) => p.status === "active").length >= 53)
      throw Error("Cut or waive a player before filling the 53-man roster.");
    if (p.status === "ir" && (p.irReturnWeek ?? 0) > s.week)
      throw Error("IR minimum absence has not elapsed.");
    p.status = "active";
    p.elevations = 0;
  } else if (destination === "ir") {
    if (!p.injury) throw Error("Only an injured player can enter IR.");
    p.status = "ir";
    p.starter = false;
    p.irReturnWeek = s.week + f.rules.irWeeks;
  } else if (destination === "elevated") {
    if (p.status !== "practice") throw Error("Select a practice-squad player.");
    if ((p.elevations || 0) >= 3)
      throw Error(
        "Player has used three elevations; sign him to the active roster.",
      );
    if (s.roster.filter((p) => p.status === "elevated").length >= 2)
      throw Error("Two elevations already used.");
    p.status = "elevated";
    p.elevations = (p.elevations || 0) + 1;
  } else throw Error("Invalid roster destination.");
  log(s, "Roster designation", `${p.name} moved to ${destination}.`);
}
export function protect(s, id) {
  requireRole(s, "roster");
  let p = s.roster.find((p) => p.id === id);
  if (!p || p.status !== "practice")
    throw Error("Select a practice-squad player.");
  if (!p.protected && s.roster.filter((p) => p.protected).length >= 4)
    throw Error("Four weekly protections already used.");
  p.protected = !p.protected;
}
export function claim(s, id) {
  requireRole(s, "roster");
  let w = s.franchise.waivers.find((w) => w.player.id === id);
  if (!w) throw Error("Waiver period ended.");
  if (!w.claims.includes(s.team)) w.claims.push(s.team);
  log(
    s,
    "Waiver claim filed",
    `Claim filed for ${w.player.name}. Priority is decided by the reverse standings.`,
  );
}
export function scout(s, id, kind) {
  requireRole(s, "scout");
  let p = s.prospects.find((p) => p.id === id);
  if (!p) throw Error("Prospect unavailable.");
  let f = s.franchise,
    r = (f.reports[id] ??= {
      confidence: 25,
      visits: [],
      notes: [],
      estimate: p.ovr + (id.length % 9) - 4,
    });
  if (
    kind === "Private visit" &&
    f.visits.length >= 30 &&
    !f.visits.includes(id)
  )
    throw Error("All 30 private visits have been used.");
  if (kind === "Private visit" && !f.visits.includes(id)) f.visits.push(id);
  let cost = kind === "Regional report" ? 1 : kind === "Private visit" ? 3 : 2;
  if (f.scoutPoints < cost)
    throw Error("Not enough scouting points; advance the week to replenish.");
  f.scoutPoints -= cost;
  r.confidence = Math.min(
    100,
    r.confidence + (kind === "Private visit" ? 30 : 15),
  );
  r.estimate = Math.round(
    p.ovr + ((100 - r.confidence) / 15) * ((id.length % 3) - 1),
  );
  r.visits.push(kind);
  r.notes.push(
    kind === "Medical check"
      ? `Medical risk: ${p.id.length % 4 === 0 ? "elevated" : "standard"}`
      : kind === "Combine"
        ? `40-yard: ${(4.35 + (p.pos === "OL" ? 0.8 : 0.1) + (99 - p.ovr) * 0.006).toFixed(2)}s · Vertical: ${Math.round(24 + p.ovr * 0.12)}in`
        : kind + " completed.",
  );
  log(
    s,
    "Scouting report updated",
    `${p.name}: ${kind}; confidence ${r.confidence}%.`,
  );
}
export function prepare(s, intensity) {
  requireRole(s, "coach");
  let n = Number(intensity);
  if (!Number.isFinite(n) || n < 0 || n > 100)
    throw Error("Intensity must be 0–100.");
  s.franchise.preparation.intensity = n;
}
export function beginDraft(s) {
  assertCanAdvance(s);
  requireRole(s, "scout");
  if (s.phase !== "offseason")
    throw Error("The draft opens after the championship.");
  let f = s.franchise;
  if (f.draft?.year === s.year) return;
  while (s.prospects.length < 260) {
    let i = s.prospects.length;
    s.prospects.push(
      makePlayer(
        `prospect-${s.year}-${i}`,
        POS[i % 22],
        s.year * 967 + i,
        true,
      ),
    );
  }
  let order = Array.from({ length: 32 }, (_, i) => i).sort(
    (a, b) =>
      s.teams[a].w - s.teams[b].w ||
      s.teams[a].pf - s.teams[a].pa - (s.teams[b].pf - s.teams[b].pa),
  );
  let picks = [];
  for (let round = 1; round <= 7; round++)
    for (let team of order)
      picks.push({
        id: `pick-${s.year}-${round}-${team}`,
        round,
        team,
        original: team,
        player: null,
      });
  for (let pick of f.futurePicks || [])
    if (pick.year === s.year + 1) {
      if (pick.forfeited) {
        let i = picks.findIndex(
          (p) => p.original === pick.team && p.round === pick.round,
        );
        if (i >= 0) picks.splice(i, 1);
      } else picks.push({ ...pick, id: "comp-" + picks.length, player: null });
    }
  picks.sort((a, b) => a.round - b.round);
  while (s.prospects.length < picks.length + 30) {
    let i = s.prospects.length;
    s.prospects.push(
      makePlayer(
        `extra-prospect-${s.year}-${i}`,
        POS[i % 22],
        s.year * 313 + i,
        true,
      ),
    );
  }
  f.draft = { year: s.year, cursor: 0, picks, log: [] };
  advanceCpuDraft(s);
}
export function advanceCpuDraft(s) {
  let d = s.franchise.draft;
  if (!d) return;
  while (d.cursor < d.picks.length && d.picks[d.cursor].team !== s.team) {
    let pick = d.picks[d.cursor],
      available = s.prospects.slice().sort((a, b) => b.ovr - a.ovr);
    if (available.length) {
      let p = available[d.cursor % 9 === 0 && available.length > 2 ? 2 : 0];
      ensureDraftRoom(s, pick.team);
      draftOne(s, pick, p);
    }
    d.cursor++;
  }
}
export function ensureDraftRoom(s, team = s.team) {
  if (roster(s, team).length < 90) return;
  let candidate = roster(s, team)
    .filter((p) => !p.starter)
    .sort(
      (a, b) =>
        (a.status === "practice" ? 0 : 1) - (b.status === "practice" ? 0 : 1) ||
        a.ovr - b.ovr,
    )[0];
  if (!candidate)
    throw Error("Create a roster opening before making this selection.");
  if (team === s.team) {
    cut(s, candidate.id, false);
    return;
  }
  let contract = s.franchise.contracts[candidate.id],
    amount = 0;
  if (contract && !contract.ended) {
    for (let y = financeYear(s); y < contract.start + contract.prorate; y++)
      amount += Math.round(contract.bonus / contract.prorate);
    amount += contract.guarantees
      .slice(Math.max(0, financeYear(s) - contract.start))
      .reduce((a, b) => a + b, 0);
    contract.ended = true;
    s.franchise.dead.push({
      team,
      year: financeYear(s),
      amount,
      reason: "CPU draft roster opening",
      playerId: candidate.id,
    });
  }
  s.franchise.clubs[team].players = roster(s, team).filter(
    (p) => p.id !== candidate.id,
  );
  candidate.status = "free";
  candidate.starter = false;
  s.agents.push(candidate);
}
function draftOne(s, pick, p) {
  let team = pick.team;
  p.starter = false;
  p.status = "active";
  p.salary = Math.max(0.8, 4.5 - pick.round * 0.5);
  let c = basicContract(p, team, s.year + 1);
  c.years = 4;
  c.prorate = 4;
  c.base = Array(4).fill(Math.round(p.salary * MILLION));
  c.guarantees = [Math.round(p.salary * MILLION), 0, 0, 0];
  c.roster = [0, 0, 0, 0];
  c.workout = [0, 0, 0, 0];
  if (roster(s, team).length >= 90)
    throw Error("Preseason roster limit reached.");
  roster(s, team).push(p);
  s.franchise.contracts[p.id] = c;
  s.prospects = s.prospects.filter((x) => x.id !== p.id);
  p.draftYear = s.year + 1;
  p.experience = 0;
  recordDraftDevelopment(s, p, pick);
  pick.player = p.id;
  s.franchise.draft.log.push({
    round: pick.round,
    team,
    name: p.name,
    pos: p.pos,
  });
}
export function draftPick(s, id) {
  assertCanAdvance(s);
  requireRole(s, "scout");
  let d = s.franchise.draft;
  if (!d || d.cursor >= d.picks.length || d.picks[d.cursor].team !== s.team)
    throw Error("Your team is not on the clock.");
  let p = s.prospects.find((p) => p.id === id);
  if (!p) throw Error("Prospect already selected.");
  draftOne(s, d.picks[d.cursor], p);
  d.cursor++;
  advanceCpuDraft(s);
  log(s, "Draft selection", `${p.name} joins the franchise.`);
}
export function tradeDown(s) {
  requireRole(s, "scout");
  let d = s.franchise.draft,
    p = d?.picks[d.cursor];
  if (!p || p.team !== s.team) throw Error("Not on the clock.");
  let target = d.picks.find(
    (q, i) =>
      i > d.cursor &&
      i < d.cursor + 12 &&
      q.round === p.round &&
      q.team !== s.team,
  );
  if (!target) throw Error("No suitable trade-down partner.");
  let partner = target.team;
  p.team = partner;
  target.team = s.team;
  (s.franchise.futurePicks ??= []).push({
    year: s.year + 2,
    team: s.team,
    round: Math.min(7, p.round + 2),
    source: "Draft trade",
  });
  advanceCpuDraft(s);
  log(
    s,
    "Draft trade",
    `Moved down in round ${p.round} and acquired a future pick.`,
  );
}
export function trimRoster(s) {
  requireRole(s, "roster");
  if (s.live) throw Error("Finish the current match.");
  let a = active(s)
    .filter((p) => p.status === "active")
    .sort((a, b) => b.ovr - a.ovr);
  if (a.length <= 53) return;
  let required = new Set();
  for (let pos of new Set(POS)) {
    let best = a.find((p) => p.pos === pos && !p.injury);
    if (best) required.add(best.id);
  }
  let keep = new Set([
    ...required,
    ...a
      .filter((p) => !required.has(p.id))
      .slice(0, 53 - required.size)
      .map((p) => p.id),
  ]);
  for (let p of a.filter((p) => !keep.has(p.id))) {
    p.starter = false;
    if (s.roster.filter((p) => p.status === "practice").length < 16)
      p.status = "practice";
    else cut(s, p.id, false);
  }
  log(
    s,
    "Roster trimmed",
    "Assistant reduced the active roster to 53. Released players retain their applicable dead cap.",
  );
}

export function recruitDepth(s) {
  // Delegated GM operation: fill positional holes and minimum depth using fictional reserve deals.
  let f = s.franchise;
  if (s.live) throw Error("Finish the live match before recruiting.");
  let minimum = {
    QB: 2,
    RB: 3,
    WR: 5,
    TE: 3,
    OL: 9,
    DL: 8,
    LB: 6,
    CB: 6,
    S: 4,
    K: 1,
    P: 1,
  };
  const recruit = (pos) => {
    let i = (f.spawnSerial = (f.spawnSerial || 0) + 1),
      p = makePlayer(`reserve-${s.year}-${i}`, pos, s.year * 401 + i);
    p.ovr = Math.min(p.ovr, 68);
    p.salary = 0.8;
    p.age = 23 + (i % 5);
    let contract = basicContract(p, s.team, financeYear(s));
    if (capLedger(s).room < 0.8 * MILLION)
      throw Error("The GM cannot add reserve depth under the current cap.");
    s.roster.push(p);
    f.contracts[p.id] = contract;
  };
  for (let [pos, n] of Object.entries(minimum))
    while (
      active(s).filter((p) => p.pos === pos && !p.injury && !p.holdout).length <
        n &&
      active(s).filter((p) => p.status === "active").length < 53
    )
      recruit(pos);
  while (active(s).filter((p) => p.status === "active").length < 53)
    recruit(POS[s.roster.length % 22]);
  log(
    s,
    "GM depth report",
    "Reserve recruitment completed within the cap. Review the depth chart before playing.",
  );
}
