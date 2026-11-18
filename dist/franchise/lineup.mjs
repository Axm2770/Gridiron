import * as S from "./state.mjs";
import { buildActors } from "../engine/execution.mjs";
export const availableForLineup = (p) =>
  !!p &&
  !p.injury &&
  !p.holdout &&
  ["active", "elevated"].includes(p.status || "active");
export function sortForLineup(players, team) {
  return players
    .filter(availableForLineup)
    .slice()
    .sort((a, b) => {
      const rank = (p) =>
        p.depthTeam === team && Number.isFinite(p.depthPriority)
          ? p.depthPriority
          : p.starter
            ? 100
            : 200;
      return rank(a) - rank(b) || Number(b.starter) - Number(a.starter);
    });
}
export const LINEUP_UNITS = {
  Offense: ["QB", "RB", "WR", "TE", "OL"],
  Defense: ["DL", "LB", "CB", "S"],
  Specialists: ["K", "P"],
};
// Head coaches and roster managers edit every unit; coordinators only their own side.
export function canEditUnit(s, unit) {
  const role = s.franchise?.role,
    ownUnit = unit !== "Defense";
  return !!(
    S.allowed(s, "coach") ||
    S.allowed(s, "roster") ||
    (role === "OC" && ownUnit) ||
    (role === "DC" && !ownUnit)
  );
}
// Why a player cannot take a lineup slot, or "" when he can.
export function unavailableReason(p) {
  if (!p) return "Not on the roster";
  if (p.injury) return `Injured · ${p.injury} week${p.injury === 1 ? "" : "s"}`;
  if (p.holdout) return "Holding out · resolve his contract";
  const status = p.status || "active";
  if (status === "ir") return "Injured reserve";
  if (status === "practice") return "Practice squad · elevate him first";
  if (!["active", "elevated"].includes(status)) return "Not on the active roster";
  return "";
}
// Read model for the visual lineup: the slots on the field, every position's depth order
// (the order the match engine uses) and who is unavailable and why.
export function lineupBoard(s, unit = "Offense") {
  const actors = lineupActors(s, unit),
    slotOf = new Map(actors.filter((a) => a.p).map((a) => [a.id, a.index])),
    order = sortForLineup(s.roster, s.team);
  const positions = (LINEUP_UNITS[unit] || []).map((pos) => ({
    pos,
    slots: actors.filter((a) => a.role === pos).length,
    depth: order
      .filter((p) => p.pos === pos)
      .map((p, i) => ({ p, rank: i + 1, slot: slotOf.has(p.id) ? slotOf.get(p.id) : null })),
    unavailable: s.roster
      .filter((p) => p.pos === pos && !availableForLineup(p))
      .sort((a, b) => b.ovr - a.ovr)
      .map((p) => ({ p, reason: unavailableReason(p) })),
  }));
  return { unit, actors, positions, filled: actors.filter((a) => a.p).length };
}
// Eligible players for one slot, best first, for the slot picker.
export function slotChoices(s, unit, slot) {
  const a = lineupActors(s, unit)[slot];
  if (!a) return { slot: null, eligible: [], unavailable: [] };
  return {
    slot: a,
    eligible: lineupCandidates(s, unit, slot)
      .slice()
      .sort((x, y) => y.ovr - x.ovr || (y.fitness ?? 100) - (x.fitness ?? 100)),
    unavailable: s.roster
      .filter((p) => p.pos === a.role && !availableForLineup(p))
      .sort((x, y) => y.ovr - x.ovr)
      .map((p) => ({ p, reason: unavailableReason(p) })),
  };
}
// The slot a bench player takes by default: a vacant one, else the weakest occupant.
export function weakestSlot(s, unit, id) {
  const p = s.roster.find((q) => q.id === id);
  if (!p) return null;
  const slots = lineupActors(s, unit).filter((a) => a.role === p.pos);
  if (!slots.length) return null;
  return slots.slice().sort((a, b) => (a.p ? a.p.ovr : -1) - (b.p ? b.p.ovr : -1))[0].index;
}
export function lineupSettings(s) {
  return (
    s.live || {
      a: s.team,
      b: s.team,
      spot: 50,
      poss: 0,
      offense: s.coach.offense,
      defense: s.coach.defense,
      personnel: s.coach.personnel || "11",
      shell: s.coach.shell || "2-High",
    }
  );
}
export function lineupActors(s, unit = "Offense") {
  const m = lineupSettings(s),
    groups = {};
  for (const p of sortForLineup(s.roster, s.team))
    (groups[p.pos] ??= []).push(p);
  if (unit === "Specialists")
    return ["K", "P"].map((role, index) => ({
      id: groups[role]?.[0]?.id || "vacant-" + role,
      role,
      index,
      side: 2,
      name: groups[role]?.[0]?.name || "Vacant",
      p: groups[role]?.[0] || null,
      x: 50,
      z: 0,
    }));
  return buildActors(
    50,
    groups,
    groups,
    m.offense,
    m.personnel || "11",
    m.defense,
    m.shell || "2-High",
  )
    .filter((a) => a.side === (unit === "Defense" ? 1 : 0))
    .map((a, index) => ({
      ...a,
      index,
      p: s.roster.find((p) => p.id === a.id) || null,
    }));
}
export function lineupCandidates(s, unit, slot) {
  const actors = lineupActors(s, unit),
    a = actors[slot];
  if (!a) return [];
  const occupied = new Set(actors.map((x) => x.id));
  return sortForLineup(s.roster, s.team).filter(
    (p) => p.pos === a.role && !occupied.has(p.id),
  );
}
export function changeLineup(s, unit, slot, id) {
  if (
    !["Offense", "Defense", "Specialists"].includes(unit) ||
    !Number.isInteger(slot)
  )
    throw Error("Choose a valid lineup slot.");
  const role = s.franchise.role;
  if (!canEditUnit(s, unit))
    throw Error(`The ${unit.toLowerCase()} depth chart is delegated to another coach in your ${role} role. Switch your career role in Career dossier to change it.`);
  if (s.live?.finished)
    throw Error(
      "The game has finished. Review the result before changing personnel.",
    );
  const actors = lineupActors(s, unit),
    out = actors[slot],
    incoming = s.roster.find((p) => p.id === id);
  if (!out || !incoming) throw Error("Choose an available player at the same position.");
  if (incoming.pos !== out.role)
    throw Error(`${incoming.name} plays ${incoming.pos}; this slot needs a ${out.role}. Change his position in Training → Individual plans first.`);
  if (!availableForLineup(incoming))
    throw Error(
      incoming.injury
        ? `${incoming.name} is injured (${incoming.injury} week${incoming.injury === 1 ? "" : "s"}) and not available. Choose a healthy player.`
        : incoming.holdout
          ? `${incoming.name} is holding out and not available. Resolve his contract in Contracts first.`
          : `${incoming.name} is on the ${incoming.status === "ir" ? "injured reserve" : incoming.status === "practice" ? "practice squad" : incoming.status} list and not available. Move him to the active roster first.`,
    );
  if (actors.some((a) => a.id === id))
    throw Error("This player already occupies another slot in this unit.");
  const position = sortForLineup(s.roster, s.team).filter(
      (p) => p.pos === out.role,
    ),
    index = out.p
      ? position.findIndex((p) => p.id === out.id)
      : actors.slice(0, slot).filter((a) => a.role === out.role).length;
  const incomingIndex = position.findIndex((p) => p.id === id);
  if (out.p)
    [position[index], position[incomingIndex]] = [
      position[incomingIndex],
      position[index],
    ];
  else {
    position.splice(incomingIndex, 1);
    position.splice(index, 0, incoming);
  }
  position.forEach((p, i) => {
    p.depthTeam = s.team;
    p.depthPriority = i;
  });
  // Starter flags move with the slot so every position keeps its number of starters. A
  // starter who sat out this formation (the third WR in 12 personnel) keeps his flag; a
  // vacant slot is filled by a new starter.
  if (out.p?.starter && !incoming.starter) {
    out.p.starter = false;
    incoming.starter = true;
  } else if (!out.p) incoming.starter = true;
  S.log(
    s,
    "Lineup change",
    `${incoming.name} replaces ${out.p?.name || "a vacant slot"} at ${out.role}. Effective next snap.`,
  );
  if (s.live) {
    s.live.events.unshift({
      text: `Substitution: ${incoming.name} replaces ${out.p?.name || "a vacant slot"} at ${out.role}.`,
      time: `Q${s.live.quarter} ${Math.floor(s.live.clock / 60)}:${String(s.live.clock % 60).padStart(2, "0")}`,
      highlight: true,
    });
    s.live.events = s.live.events.slice(0, 200);
  }
  return incoming;
}
