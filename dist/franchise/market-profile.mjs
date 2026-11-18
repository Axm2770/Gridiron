// Market profile of one player: the things beyond his rating that move his price. Club tenure
// and standing (captain, fan favourite, franchise icon, legend), injury history, conduct and
// controversy, and where he stands against his position's age curve. Every field is derived
// from data saves already carry; the only optional field read is p.joined ({ team, year },
// written when a player changes clubs), and older saves fall back to the transaction log or
// an estimate from experience and loyalty.
import { roster } from "./state.mjs";
import { reputationView } from "./reputation.mjs";
import { playerAwards } from "./player-catalog.mjs";

// Age at which each position usually peaks; value falls away after it.
export const PEAK_AGE = { QB: 31, RB: 26, WR: 28, TE: 28, OL: 30, DL: 28, LB: 28, CB: 28, S: 29, K: 34, P: 34 };

const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
const leaderScore = (p) => (p.persona?.leadership ?? 0.5) + (p.age || 25) / 50;

// Seasons the player has spent with this club.
export function clubTenure(s, p, team) {
  if (team == null || team < 0) return 0;
  if (p.joined && p.joined.team === team && Number.isFinite(p.joined.year)) return Math.max(0, s.year - p.joined.year);
  const entries = s.franchise?.transactionLog?.entries || [];
  const arrival = entries.find((x) => x.playerId === p.id && x.to === team);
  if (arrival && Number.isFinite(arrival.year)) return Math.max(0, s.year - arrival.year);
  // With the club since before the save began: part of his career, more for loyal players.
  const experience = p.experience ?? Math.max(0, (p.age ?? 25) - 23),
    loyalty = p.persona?.loyalty ?? 0.5;
  return Math.round(experience * (0.3 + loyalty * 0.5));
}

// Is he the club's captain (its top leader by personality and age)?
export function isCaptain(s, p, team) {
  if (team == null || team < 0 || !s.franchise?.clubs?.[team]) return false;
  const list = roster(s, team).filter((q) => q.status !== "retired");
  if (list.length < 5 || (p.age ?? 0) < 25) return false;
  return list.slice().sort((a, b) => leaderScore(b) - leaderScore(a))[0]?.id === p.id;
}

// How attached a club and its fans are to the player.
// level: "none" | "favourite" | "icon" | "legend".
export function clubStanding(s, p, team) {
  const tenure = clubTenure(s, p, team),
    rep = reputationView(s, p),
    awards = playerAwards(s, p).length,
    captain = isCaptain(s, p, team),
    loyalty = p.persona?.loyalty ?? 0.5,
    score = Math.min(60, tenure * 7) + clamp((rep.recognition - 60) * 0.9, 0, 30) + Math.min(5, awards) * 4 + (captain ? 10 : 0) + (loyalty - 0.5) * 12 + clamp(((p.ovr ?? 60) - 75) * 0.6, 0, 12);
  let level = "none";
  if (tenure >= 7 && score >= 85) level = "legend";
  else if (tenure >= 4 && score >= 60) level = "icon";
  else if (tenure >= 3 && score >= 40) level = "favourite";
  const label = { legend: "a franchise legend", icon: "a franchise icon", favourite: "a fan favourite", none: "" }[level];
  return { tenure, recognition: Math.round(rep.recognition), repLabel: rep.label, awards, captain, loyalty, score: Math.round(score), level, label };
}

// Current injury, joint wear and recent injury record.
export function injuryProfile(s, p) {
  const wear = p.wear || {},
    [part, worst] = Object.entries(wear).sort((a, b) => b[1] - a[1])[0] || ["", 0],
    history = (s.franchise?.medical?.history || []).filter((c) => c.playerId === p.id && (c.opened?.year ?? s.year) >= s.year - 2),
    extra = Array.isArray(p.injuryHistory) ? p.injuryHistory.filter((x) => (x.year ?? s.year) >= s.year - 2).length : 0,
    recent = history.length + extra,
    serious = history.filter((c) => c.tier === "major" || c.tier === "season").length;
  const risk = clamp((p.injury ? 0.35 : 0) + Math.max(0, worst - 30) / 140 + recent * 0.08 + serious * 0.08, 0, 1);
  return { current: p.injury || 0, wearPart: part, wear: Math.round(worst || 0), recent, serious, risk: Math.round(risk * 100) / 100 };
}

// Off-field and locker-room concerns. score 0 (model pro) .. 1 (constant trouble).
export function conductProfile(s, p) {
  const flags = [],
    persona = p.persona || {};
  let score = 0;
  const add = (n, text) => {
    score += n;
    if (n > 0) flags.push(text);
  };
  if (p.tradeDemand) add(0.3, "has demanded a trade");
  if (p.holdout) add(0.3, "held out for a new deal");
  if (Number.isFinite(p.controversy)) add(clamp(p.controversy, 0, 1) * 0.6, "off-field controversy");
  if ((p.morale ?? 75) < 45) add(0.15, "is unhappy in the locker room");
  if ((p.coachTrust ?? 60) < 35) add(0.15, "has clashed with coaches");
  if ((persona.money ?? 0.5) > 0.8 && (persona.leadership ?? 0.5) < 0.25) add(0.15, "has a me-first reputation");
  if ((persona.leadership ?? 0.5) > 0.75 && score < 0.3) score -= 0.1;
  score = clamp(score, 0, 1);
  return { score: Math.round(score * 100) / 100, flags, troublemaker: score >= 0.3, leader: (persona.leadership ?? 0.5) > 0.75 && score < 0.15 };
}

export const yearsPastPeak = (p) => (p.age ?? 27) - (PEAK_AGE[p.pos] ?? 28);
