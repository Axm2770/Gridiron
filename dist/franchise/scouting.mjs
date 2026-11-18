// Fog of war for every player outside your own roster. Prominent veterans are common knowledge;
// depth players at other clubs, low-profile free agents and every draft prospect show predicted
// ranges until your scouts file a formal report. Ranges always contain the true value, narrow
// monotonically as confidence rises and are centred on a deterministic (not truthful) estimate,
// so the midpoint never gives the answer away. Prospect confidence is the same
// franchise.reports entry the draft room and pipeline already use.
import { identitySeed } from "./newgens.mjs";
import { requireRole, allowed } from "./state.mjs";
import { ensurePlayerRatings } from "./ratings.mjs";
import { postMessage } from "./newsroom.mjs";

export const REPORT_DAYS = 3;
export const REPORT_GAIN = 35;
const PROSPECT_TEAM = -2,
  FREE_AGENT_TEAM = -1;
const DAY = 86400000;
const addDays = (iso, n) => new Date(Date.parse(iso + "T00:00:00Z") + n * DAY).toISOString().slice(0, 10);
const today = (s) => s.franchise.calendarSim?.date ?? `${s.year}-09-01`;

export function ensureScoutDesk(s) {
  const f = s.franchise;
  f.scoutDesk ??= { version: 1, knowledge: {}, requests: [], delivered: [] };
  const d = f.scoutDesk;
  d.knowledge ??= {};
  for (const k of ["requests", "delivered"]) if (!Array.isArray(d[k])) d[k] = [];
  return d;
}

// Where a player is right now: our roster, another club, the free-agent pool or the draft class.
export function locate(s, id) {
  let p = s.roster.find((x) => x.id === id);
  if (p) return { p, team: s.team };
  for (let t = 0; t < (s.franchise.clubs?.length ?? 0); t++) {
    if (t === s.team) continue;
    p = s.franchise.clubs[t]?.players?.find((x) => x.id === id);
    if (p) return { p, team: t };
  }
  p = s.agents?.find((x) => x.id === id);
  if (p) return { p, team: FREE_AGENT_TEAM };
  p = s.prospects?.find((x) => x.id === id);
  if (p) return { p, team: PROSPECT_TEAM };
  return null;
}

const isProspect = (s, p) => !!s.prospects?.some((x) => x.id === p.id);

// Prominent players are scouted by the whole league already: starters and anyone rated 80+.
export function isProminent(s, p, team) {
  if (team === s.team) return true;
  if (team === PROSPECT_TEAM || isProspect(s, p)) return false;
  if (team === FREE_AGENT_TEAM || s.agents?.some((x) => x.id === p.id)) return (p.ovr ?? 0) >= 80;
  return (p.ovr ?? 0) >= 80 || !!p.starter;
}

export function confidence(s, p, team) {
  if (team === s.team) return 100;
  if (team === PROSPECT_TEAM || isProspect(s, p)) return Math.min(100, Number(s.franchise.reports?.[p.id]?.confidence) || 25);
  if (isProminent(s, p, team)) return 100;
  return Math.min(100, ensureScoutDesk(s).knowledge[p.id]?.confidence ?? 30);
}

export const halfWidth = (c) => (c >= 100 ? 0 : Math.max(1, Math.ceil((100 - c) / 10)));

// Deterministic lean in [-1, 1] per player and key, so estimates are wrong in a consistent way.
const lean = (id, key) => ((identitySeed(`${id}:scout:${key}`) % 2001) / 1000 - 1) * 0.6;

function band(truth, c, id, key, widen = 1) {
  const hw = halfWidth(c) * widen,
    centre = truth + lean(id, key) * hw,
    lo = Math.max(Math.min(20, truth), Math.min(truth, Math.round(centre - hw))),
    hi = Math.min(99, Math.max(truth, Math.round(centre + hw)));
  return { lo, hi, estimate: Math.round(centre) };
}

// What your staff believe about a player. exact = true means the numbers are the truth.
export function scoutRange(s, p, team = locate(s, p.id)?.team ?? FREE_AGENT_TEAM) {
  const c = confidence(s, p, team),
    ovr = band(p.ovr ?? 60, c, p.id, "ovr"),
    pot = band(Math.max(p.pot ?? p.ovr ?? 60, p.ovr ?? 60), c, p.id, "pot", 1.4),
    pending = ensureScoutDesk(s).requests.find((r) => r.playerId === p.id && r.team === s.team);
  return {
    confidence: c,
    exact: c >= 100,
    prospect: team === PROSPECT_TEAM || isProspect(s, p),
    ovr: [ovr.lo, ovr.hi],
    pot: [Math.max(pot.lo, ovr.lo), Math.max(pot.hi, ovr.hi)],
    estimate: ovr.estimate,
    potEstimate: Math.max(pot.estimate, ovr.estimate),
    label: c >= 100 ? String(p.ovr) : ovr.lo === ovr.hi ? String(ovr.lo) : `${ovr.lo}–${ovr.hi}`,
    pending: pending ? { due: pending.due, scout: pending.scout } : null,
  };
}

// Attributes a scout grades for each position (the rest of the model is not shown).
const ATHLETIC = ["speed", "acceleration", "agility", "strength", "awareness", "stamina", "injury"];
const POSITION_ATTRS = {
  QB: ["throwPower", "throwAccuracyShort", "throwAccuracyMid", "throwAccuracyDeep", "awareness", "speed", "agility", "injury"],
  RB: ["speed", "acceleration", "agility", "changeOfDirection", "carrying", "breakTackle", "catching", "strength", "injury"],
  WR: ["speed", "acceleration", "agility", "changeOfDirection", "catching", "shortRouteRunning", "breakTackle", "awareness", "injury"],
  TE: ["catching", "shortRouteRunning", "runBlock", "passBlock", "strength", "speed", "awareness", "injury"],
  OL: ["passBlock", "runBlock", "strength", "awareness", "agility", "stamina", "injury"],
  DL: ["tackle", "strength", "speed", "acceleration", "awareness", "agility", "stamina", "injury"],
  LB: ["tackle", "zoneCoverage", "manCoverage", "speed", "strength", "awareness", "agility", "injury"],
  CB: ["manCoverage", "zoneCoverage", "speed", "acceleration", "agility", "changeOfDirection", "tackle", "catching", "injury"],
  S: ["zoneCoverage", "manCoverage", "tackle", "speed", "acceleration", "awareness", "agility", "injury"],
  K: ["kickPower", "kickAccuracy", "awareness", "injury"],
  P: ["kickPower", "kickAccuracy", "awareness", "injury"],
};

export function attributeRanges(s, p, team) {
  const c = confidence(s, p, team),
    attrs = ensurePlayerRatings(p).attributes || {};
  const keys = POSITION_ATTRS[p.pos] || ATHLETIC;
  return keys
    .filter((k) => Number.isFinite(attrs[k]))
    .map((k) => [k, attrs[k]])
    .map(([k, v]) => {
      const b = band(v, c, p.id, k);
      return { key: k, value: c >= 100 ? v : null, lo: b.lo, hi: b.hi, estimate: c >= 100 ? v : b.estimate };
    });
}

// Where your board would put a prospect: rank in the class by your scouts' grade (current
// estimate weighted with potential), so fog changes the projection, not just the range.
export function draftProjection(s, p) {
  const grade = (q) => {
      const v = scoutRange(s, q, PROSPECT_TEAM);
      return v.estimate * 0.55 + v.potEstimate * 0.45;
    },
    mine = grade(p),
    rank = 1 + (s.prospects || []).filter((q) => q.id !== p.id && grade(q) > mine).length,
    round = Math.ceil(rank / 32);
  return {
    rank,
    round,
    label: rank <= 32 ? "1st-round talent" : rank <= 96 ? "2nd–3rd round talent" : rank <= 224 ? "Day 3 talent (rounds 4–7)" : "Undrafted free agent type",
  };
}

// Plain-language ceiling. Prospects are described in draft rounds; veterans by role.
export function potentialLabel(view) {
  const grade = view.prospect ? view.estimate * 0.55 + view.potEstimate * 0.45 : view.potEstimate;
  if (view.prospect)
    return grade >= 78 ? "1st-round talent" : grade >= 73 ? "2nd–3rd round talent" : grade >= 67 ? "Day 3 talent (rounds 4–7)" : "Undrafted free agent type";
  return grade >= 90 ? "Franchise cornerstone" : grade >= 84 ? "Pro Bowl ceiling" : grade >= 77 ? "Starter ceiling" : grade >= 70 ? "Rotation player" : "Depth / special teams";
}

/* ---------------------------------------------------------------- report requests */

const scoutCount = (s) => Math.max(1, s.franchise.scouting?.scouts?.length || 2);
const scoutNames = (s) => s.franchise.scouting?.scouts?.map((x) => x.name) ?? ["Area scout", "National scout"];

// Why a report cannot be requested right now, with what to do about it. null = allowed.
export function reportBlocker(s, id) {
  const where = locate(s, id);
  if (!where) return { reason: "This player is no longer in the league.", fix: null };
  if (where.team === s.team) return { reason: "He is on your roster, so your staff already know his exact ratings.", fix: null };
  if (!allowed(s, "scout")) return { reason: `In a ${s.franchise.role} career your general manager runs scouting.`, fix: "Your career role was set when the career began. Start a new career, or accept a job offer as Owner or GM, to run scouting yourself." };
  const view = scoutRange(s, where.p, where.team);
  if (view.exact) return { reason: "Fully scouted: these are his true ratings.", fix: null };
  if (view.pending) return { reason: `A report is already on the way, due ${view.pending.due}.`, fix: null };
  const busy = ensureScoutDesk(s).requests.filter((r) => r.team === s.team);
  if (busy.length >= scoutCount(s)) {
    const next = busy.map((r) => r.due).sort()[0];
    return { reason: `All ${scoutCount(s)} scouts are on assignment. The next one is free on ${next}.`, fix: "Hire another scout in Draft → Scouting network, or wait." };
  }
  return null;
}

export function requestReport(s, id) {
  requireRole(s, "scout");
  const block = reportBlocker(s, id);
  if (block) throw Error(block.fix ? `${block.reason} ${block.fix}` : block.reason);
  const d = ensureScoutDesk(s),
    { p, team } = locate(s, id),
    busy = new Set(d.requests.filter((r) => r.team === s.team).map((r) => r.scout)),
    scout = scoutNames(s).find((n) => !busy.has(n)) ?? "Area scout",
    request = { id: `scout-${p.id}-${today(s)}`, playerId: p.id, name: p.name, team: s.team, subjectTeam: team, scout, requested: today(s), due: addDays(today(s), REPORT_DAYS), from: scoutRange(s, p, team).confidence };
  d.requests.push(request);
  return request;
}

const fmtRange = (r) => (r[0] === r[1] ? String(r[0]) : `${r[0]}–${r[1]}`);
const attrName = (k) => k.replace(/([A-Z])/g, " $1").replace(/^./, (c) => c.toUpperCase());

// Delivers every report whose due date has arrived. Called whenever the calendar moves.
export function deliverReports(s) {
  const d = ensureScoutDesk(s),
    date = today(s),
    due = d.requests.filter((r) => r.due <= date && r.team === s.team);
  if (!due.length) return [];
  const delivered = [];
  for (const r of due) {
    d.requests = d.requests.filter((x) => x !== r);
    const where = locate(s, r.playerId);
    if (!where) continue;
    const { p, team } = where,
      before = scoutRange(s, p, team);
    if (before.prospect) {
      const rep = (s.franchise.reports[p.id] ??= { confidence: 25, visits: [], notes: [], estimate: p.ovr });
      if (!Array.isArray(rep.notes)) rep.notes = [];
      rep.confidence = Math.min(100, (Number(rep.confidence) || 25) + REPORT_GAIN);
      rep.notes.push(`${r.scout}: formal report filed ${date}.`);
      rep.notes = rep.notes.slice(-6);
    } else {
      const k = (d.knowledge[p.id] ??= { confidence: 30, reports: 0 });
      k.confidence = Math.min(100, k.confidence + REPORT_GAIN);
      k.reports++;
      k.last = date;
    }
    const after = scoutRange(s, p, team);
    if (!after.prospect) d.knowledge[p.id].estimate = after.estimate;
    const attrs = attributeRanges(s, p, team).sort((a, b) => b.estimate - a.estimate),
      best = attrs.slice(0, 3).map((a) => `${attrName(a.key)} ${fmtRange([a.lo, a.hi])}`).join(", "),
      worst = attrs.slice(-2).map((a) => `${attrName(a.key)} ${fmtRange([a.lo, a.hi])}`).join(", ");
    postMessage(s, r.id, {
      title: `Scouting report: ${p.name}`,
      summary: `${p.pos} · overall ${fmtRange(after.ovr)} · ${after.prospect ? draftProjection(s, p).label : potentialLabel(after)}`,
      body: `${r.scout} filed a formal report on ${p.name} (${p.pos}, ${p.age}). Overall ${fmtRange(before.ovr)} → ${fmtRange(after.ovr)}; potential ${fmtRange(after.pot)}. Verdict: ${after.prospect ? `${draftProjection(s, p).label} (#${draftProjection(s, p).rank} on our board)` : potentialLabel(after)}. Strengths: ${best || "not graded"}. Concerns: ${worst || "not graded"}. Confidence ${before.confidence}% → ${after.confidence}%.${after.exact ? " Our grades now match his true ratings." : " Another report would narrow the ranges further."}`,
      source: r.scout,
      category: "Scouting",
      playerId: p.id,
      scoutTeam: team,
      // Inbox report card (ui/message-cards.mjs).
      data: {
        kind: "scouting",
        playerId: p.id,
        name: p.name,
        pos: p.pos,
        age: p.age,
        scout: r.scout,
        before: fmtRange(before.ovr),
        ovr: fmtRange(after.ovr),
        pot: fmtRange(after.pot),
        verdict: after.prospect ? `${draftProjection(s, p).label} · #${draftProjection(s, p).rank} on our board` : potentialLabel(after),
        strengths: attrs.slice(0, 3).map((a) => ({ label: attrName(a.key), range: fmtRange([a.lo, a.hi]) })),
        concerns: attrs.slice(-2).map((a) => ({ label: attrName(a.key), range: fmtRange([a.lo, a.hi]) })),
        confidence: [before.confidence, after.confidence],
        exact: !!after.exact,
      },
    });
    const entry = { playerId: p.id, name: p.name, date, from: before.confidence, to: after.confidence };
    d.delivered.unshift(entry);
    delivered.push(entry);
  }
  d.delivered = d.delivered.slice(0, 40);
  return delivered;
}
