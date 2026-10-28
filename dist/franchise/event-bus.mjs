// Canonical, persisted log of narrative game events. Domain modules append; the social
// engine, depth systems and the Unreal bridge read. Rendering never writes here.
import { hash } from "./career-systems.mjs";

export const EVENT_KINDS = [
  "GameResult",
  "ClutchFinish",
  "Blowout",
  "RivalryGame",
  "Injury",
  "InjuryReturn",
  "Trade",
  "Signing",
  "Holdout",
  "DraftPick",
  "DraftBust",
  "Milestone",
  "Championship",
  "PlayoffElimination",
  "PressConference",
  "CoachingMove",
  "LockerRoomDilemma",
];

const MAX_EVENTS = 240;

export function ensureEventLog(s) {
  const f = s.franchise;
  if (!f) return null;
  // Players already injured when the log is created (imported IR, older saves) are baseline,
  // not news: only injuries that start after this point emit events.
  f.eventLog ??= {
    version: 1,
    serial: 0,
    events: [],
    seen: [],
    injured: Object.fromEntries((s.roster || []).filter((p) => Number(p.injury) > 0).map((p) => [p.id, "baseline"])),
  };
  const log = f.eventLog;
  if (!Array.isArray(log.events)) log.events = [];
  if (!Array.isArray(log.seen)) log.seen = [];
  log.serial = Number.isSafeInteger(log.serial) ? log.serial : 0;
  return log;
}

// Idempotent: the same key never produces a second event, so round re-settlement is safe.
export function emitGameEvent(s, key, event) {
  const log = ensureEventLog(s);
  if (!log || log.seen.includes(key)) return null;
  if (!EVENT_KINDS.includes(event.kind)) throw Error("Unknown game event kind.");
  log.seen.push(key);
  log.seen = log.seen.slice(-2400);
  const entry = {
    id: `evt-${++log.serial}`,
    key,
    year: s.year,
    week: s.week,
    phase: s.phase,
    date: s.franchise.calendarSim?.date,
    team: s.team,
    tags: [],
    ...event,
  };
  log.events.unshift(entry);
  log.events = log.events.slice(0, MAX_EVENTS);
  return entry;
}

export function eventsSince(s, serial = 0) {
  const log = ensureEventLog(s);
  return log
    ? log.events.filter((e) => Number(e.id.slice(4)) > serial).reverse()
    : [];
}

export const rivals = (a, b) =>
  typeof clubs !== "undefined" && clubs[a]?.[3] && clubs[a][3] === clubs[b]?.[3];

// Derives narrative events from settled results. Results come from lifecycle round settlement.
export function deriveRoundEvents(s, results, roundKey, { phase = s.phase } = {}) {
  const out = [],
    mine = results.find((r) => r.score && (r.a === s.team || r.b === s.team));
  if (mine && !ensureEventLog(s).seen.includes(`result:${roundKey}`)) {
    const i = mine.a === s.team ? 0 : 1,
      us = mine.score[i],
      them = mine.score[1 - i],
      opponent = i === 0 ? mine.b : mine.a,
      margin = us - them,
      tags = [];
    if (Math.abs(margin) <= 3) tags.push("one-score", "clutch");
    else if (Math.abs(margin) <= 8) tags.push("one-score");
    if (Math.abs(margin) >= 21) tags.push("blowout");
    if (rivals(s.team, opponent)) tags.push("rivalry");
    if (phase === "playoffs") tags.push("playoffs");
    if (margin === 0) tags.push("tie");
    tags.push(margin > 0 ? "win" : margin < 0 ? "loss" : "draw");
    const streak = updateStreak(s, margin);
    if (streak >= 3) tags.push("win-streak");
    if (streak <= -3) tags.push("losing-streak");
    const base = { opponent, score: [us, them], margin, streak, tags };
    out.push(emitGameEvent(s, `result:${roundKey}`, { kind: "GameResult", ...base }));
    if (tags.includes("clutch") && margin > 0)
      out.push(emitGameEvent(s, `clutch:${roundKey}`, { kind: "ClutchFinish", ...base }));
    if (tags.includes("blowout"))
      out.push(emitGameEvent(s, `blowout:${roundKey}`, { kind: "Blowout", ...base }));
    if (tags.includes("rivalry"))
      out.push(emitGameEvent(s, `rivalry:${roundKey}`, { kind: "RivalryGame", ...base }));
    if (phase === "playoffs" && margin < 0)
      out.push(emitGameEvent(s, `eliminated:${roundKey}`, { kind: "PlayoffElimination", ...base }));
    if (phase === "playoffs" && margin > 0 && s.phase === "offseason")
      out.push(
        emitGameEvent(s, `champion:${s.year}`, {
          kind: "Championship",
          ...base,
          tags: [...tags, "champion"],
        }),
      );
  }
  // `player.injury` is weeks remaining; the log remembers who was out so each spell yields one
  // Injury and one InjuryReturn event.
  const log = ensureEventLog(s);
  log.injured ??= {};
  for (const p of s.roster || []) {
    const weeks = Number(p.injury) || 0,
      who = { playerId: p.id, playerName: p.name, pos: p.pos, starter: !!p.starter };
    if (weeks > 0 && !log.injured[p.id]) {
      log.injured[p.id] = `${s.year}:${s.week}`;
      const severity = weeks >= 6 ? "major" : weeks >= 2 ? "moderate" : "minor";
      out.push(
        emitGameEvent(s, `injury:${p.id}:${log.injured[p.id]}`, {
          kind: "Injury",
          ...who,
          weeks,
          severity,
          tags: [p.starter ? "starter" : "depth", severity === "major" ? "season-altering" : "short-term"],
        }),
      );
    } else if (weeks === 0 && log.injured[p.id] === "baseline") {
      delete log.injured[p.id];
    } else if (weeks === 0 && log.injured[p.id]) {
      out.push(
        emitGameEvent(s, `return:${p.id}:${log.injured[p.id]}`, {
          kind: "InjuryReturn",
          ...who,
          tags: [p.starter ? "starter" : "depth"],
        }),
      );
      delete log.injured[p.id];
    }
  }
  return out.filter(Boolean);
}

function updateStreak(s, margin) {
  const log = ensureEventLog(s);
  const prev = log.streak ?? 0;
  log.streak = margin > 0 ? Math.max(0, prev) + 1 : margin < 0 ? Math.min(0, prev) - 1 : 0;
  return log.streak;
}

export const eventSeed = (e, salt = "") => hash(e.id + ":" + e.key + ":" + salt);
