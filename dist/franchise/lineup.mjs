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
  const role = s.franchise.role,
    ownUnit = unit !== "Defense";
  if (
    !(
      S.allowed(s, "coach") ||
      S.allowed(s, "roster") ||
      (role === "OC" && ownUnit) ||
      (role === "DC" && !ownUnit)
    )
  )
    throw Error("This unit is delegated to another member of staff.");
  if (s.live?.finished)
    throw Error(
      "The game has finished. Review the result before changing personnel.",
    );
  const actors = lineupActors(s, unit),
    out = actors[slot],
    incoming = s.roster.find((p) => p.id === id);
  if (
    !out ||
    !incoming ||
    !availableForLineup(incoming) ||
    incoming.pos !== out.role
  )
    throw Error("Choose an available player at the same position.");
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
  if (out.p?.starter) {
    out.p.starter = false;
    incoming.starter = true;
  }
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
