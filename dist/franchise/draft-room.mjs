// Scouting network and draft room: deterministic prospect profiles behind fog of war
// (combine, film, medical, personality, storyline, sleeper/bust odds), regional scouts that
// build reports every week, a live pick-by-pick draft with need-aware CPU selections,
// trade-up/down on the clock, and analyst grades. Scouting confidence uses the existing
// franchise.reports so the classic scouting screen and the pipeline board stay in sync.
import { random, clamp } from "../engine/random.mjs";
import { identitySeed } from "./newgens.mjs";
import { log, MILLION, requireRole } from "./state.mjs";
import { draftOne, beginDraft, ensureDraftRoom } from "./personnel.mjs";
import { slotValue } from "./market.mjs";

export const REGIONS = ["West", "Southwest", "Midwest", "Southeast", "Northeast"];
const GROUPS = { QB: "QB", RB: "Skill", WR: "Skill", TE: "Skill", OL: "Line", DL: "Line", LB: "Front 7", CB: "Secondary", S: "Secondary", K: "Specialist", P: "Specialist" };
const STORYLINES = [
  { id: "small-school", text: "Dominated at the FCS level; the jump in competition is the question.", consensus: -5 },
  { id: "walk-on", text: "Former walk-on who earned a scholarship and never left the field.", consensus: -3 },
  { id: "transfer", text: "Transfer who broke out after finally getting a full-time role.", consensus: -1 },
  { id: "riser", text: "All-star week riser: scouts left with a higher grade than they arrived with.", consensus: 3 },
  { id: "injury-year", text: "Senior season cut short by injury; the medical will decide his range.", consensus: -4 },
  { id: "legacy", text: "Son of a former pro; polished beyond his years.", consensus: 2 },
  { id: "two-sport", text: "Two-sport athlete still learning the position full time.", consensus: -2 },
  { id: "productive", text: "Four-year starter with production few in the class can match.", consensus: 1 },
  { id: "tools", text: "Freak testing numbers; the tape is inconsistent.", consensus: 4 },
];
const MEDICAL_FLAGS = ["Torn ACL two seasons ago (fully cleared)", "Recurring hamstring strains", "Shoulder surgery last winter", "Multiple concussions in college", "Stress fracture in the foot"];
const CHARACTER_FLAGS = ["Missed team meetings as an underclassman", "Questions about maturity in interviews", "Inconsistent effort on film"];

const SCOUT_NAMES = ["Walt Brennan", "Keisha Monroe", "Luis Arrieta", "Bo Whitaker", "Nadia Petrov", "Grant Ellison", "Tamika Ford", "Hank Sorensen"];

/* --------------------------------------------------------------------- profiles */

// Deterministic per prospect, so nothing extra is stored on player records.
export function prospectProfile(p) {
  const rng = random(identitySeed(`${p.id}:profile`)),
    pick = (a) => a[Math.floor(rng() * a.length)],
    speedish = ["WR", "CB", "RB", "S"].includes(p.pos) ? 1 : ["OL", "DL"].includes(p.pos) ? -1 : 0,
    talent = (p.ovr ?? 65) - 65;
  const story = pick(STORYLINES),
    medical = rng() < 0.12 ? pick(MEDICAL_FLAGS) : null,
    character = rng() < 0.07 ? pick(CHARACTER_FLAGS) : null;
  const workEthic = Math.round(clamp(55 + rng() * 40 + (story.id === "walk-on" ? 10 : 0)));
  const ceiling = (p.pot ?? p.ovr) - (p.ovr ?? 0);
  // Public perception: talent plus noise plus storyline hype; small schools are underrated.
  const consensusScore = (p.ovr ?? 65) + (rng() - 0.5) * 12 + story.consensus + (medical ? -3 : 0) + (character ? -4 : 0);
  return {
    id: p.id,
    region: REGIONS[identitySeed(p.college || p.id) % REGIONS.length],
    group: GROUPS[p.pos] || "Skill",
    story,
    combine: {
      forty: Math.round((4.42 + (speedish < 0 ? 0.72 : speedish ? 0 : 0.25) - talent * 0.006 + (rng() - 0.5) * 0.12) * 100) / 100,
      bench: Math.round(clamp(12 + (speedish < 0 ? 14 : 0) + talent * 0.2 + rng() * 6, 5, 45)),
      vertical: Math.round((30 + (speedish > 0 ? 5 : speedish < 0 ? -4 : 0) + talent * 0.15 + rng() * 4) * 2) / 2,
      cone: Math.round((7.05 + (speedish < 0 ? 0.6 : 0) - talent * 0.006 + (rng() - 0.5) * 0.2) * 100) / 100,
    },
    film: Math.round(clamp((p.ovr ?? 65) + (rng() - 0.5) * 10, 40, 99)),
    medical,
    personality: { workEthic, coachability: Math.round(clamp(50 + rng() * 45)), leadership: Math.round(clamp(40 + rng() * 55)), character },
    consensusScore,
    // Truth the fog hides: big gap between ability and ceiling = sleeper, flags = bust risk.
    sleeper: clamp((ceiling - 8) / 12 + (story.consensus < 0 ? 0.15 : 0), 0, 0.95),
    bust: clamp(0.12 + (medical ? 0.18 : 0) + (character ? 0.15 : 0) - ceiling / 40 + (workEthic < 65 ? 0.1 : 0), 0.03, 0.85),
  };
}

const profileCache = new Map();
const profile = (p) => {
  if (!profileCache.has(p.id)) profileCache.set(p.id, prospectProfile(p));
  return profileCache.get(p.id);
};

// Consensus big board: the public ranking the media and CPU clubs lean on.
export function consensusBoard(s) {
  return (s.prospects || [])
    .map((p) => ({ p, score: profile(p).consensusScore }))
    .sort((a, b) => b.score - a.score)
    .map((x, i) => ({ ...x, rank: i + 1 }));
}

// What your staff can actually see about a prospect, by scouting confidence.
export function scoutedView(s, p) {
  const r = s.franchise.reports?.[p.id],
    confidence = r?.confidence ?? 25,
    pr = profile(p),
    estimate = r?.estimate ?? p.ovr + (p.id.length % 9) - 4,
    spread = Math.ceil((100 - confidence) / 10),
    reveal = (min, value) => (confidence >= min ? value : null);
  return {
    id: p.id,
    confidence,
    range: [Math.max(40, estimate - spread), Math.min(99, estimate + spread)],
    region: pr.region,
    storyline: pr.story.text,
    archetype: p.archetype ?? null,
    combine: reveal(40, pr.combine),
    film: reveal(55, pr.film),
    medical: reveal(70, pr.medical ?? "No red flags"),
    personality: reveal(70, pr.personality),
    sleeperOdds: reveal(85, Math.round(pr.sleeper * 100)),
    bustOdds: reveal(85, Math.round(pr.bust * 100)),
  };
}

/* -------------------------------------------------------------- scouting network */

export function ensureScouting(s) {
  const f = s.franchise;
  if (!f) return null;
  f.scouting ??= { version: 1, scouts: [], pool: [], seen: [], log: [] };
  const n = f.scouting;
  for (const k of ["scouts", "pool", "seen", "log"]) if (!Array.isArray(n[k])) n[k] = [];
  if (!n.scouts.length)
    n.scouts = [0, 1].map((i) => ({ id: `scout-start-${i}`, name: SCOUT_NAMES[(identitySeed(`${s.team}`) + i) % SCOUT_NAMES.length], region: REGIONS[i * 2], focus: "All", skill: 62 + i * 6, salary: Math.round(0.15 * MILLION) }));
  return n;
}

export function scoutCandidates(s) {
  const n = ensureScouting(s);
  if (n.poolYear !== s.year) {
    const rng = random(identitySeed(`scouts:${s.team}:${s.year}`)),
      taken = new Set(n.scouts.map((x) => x.name)),
      names = SCOUT_NAMES.filter((x) => !taken.has(x));
    n.pool = Array.from({ length: 3 }, (_, i) => {
      const skill = Math.round(58 + rng() * 37);
      return { id: `scout-${s.year}-${i}`, name: names.splice(Math.floor(rng() * names.length), 1)[0] ?? `Scout ${i + 1}`, region: REGIONS[Math.floor(rng() * REGIONS.length)], focus: ["All", "QB", "Skill", "Line", "Front 7", "Secondary"][Math.floor(rng() * 6)], skill, salary: Math.round((skill - 40) * 0.006 * MILLION) };
    });
    n.poolYear = s.year;
  }
  return n.pool;
}

export function hireScout(s, id) {
  requireRole(s, "scout");
  const n = ensureScouting(s),
    c = scoutCandidates(s).find((x) => x.id === id),
    club = s.franchise.clubs[s.team];
  if (!c) throw Error("That scout is no longer available.");
  if (n.scouts.length >= 5) throw Error("The department has room for five scouts.");
  if ((club.cash ?? 0) < c.salary) throw Error("The club cannot cover this salary.");
  club.cash -= c.salary;
  n.scouts.push({ ...c });
  n.pool = n.pool.filter((x) => x.id !== id);
  log(s, "Scout hired", `${c.name} joins to cover the ${c.region}${c.focus !== "All" ? ` (${c.focus})` : ""}.`);
}

export function assignScout(s, scoutId, region, focus = "All") {
  requireRole(s, "scout");
  const scout = ensureScouting(s).scouts.find((x) => x.id === scoutId);
  if (!scout) throw Error("Scout not found.");
  if (!REGIONS.includes(region)) throw Error("Choose a region.");
  if (!["All", ...new Set(Object.values(GROUPS))].includes(focus)) throw Error("Choose a position focus.");
  Object.assign(scout, { region, focus });
}

// Each round every scout files reports on prospects in their region/focus, raising confidence
// in the same reports the classic scouting screen uses. Free once the scout is hired.
export function processScoutingWeek(s, roundKey) {
  const n = ensureScouting(s);
  if (!n || n.seen.includes(roundKey) || !s.prospects?.length) return [];
  n.seen.push(roundKey);
  n.seen = n.seen.slice(-200);
  const f = s.franchise,
    filed = [];
  f.reports ??= {};
  for (const scout of n.scouts) {
    const rng = random(identitySeed(`${scout.id}:${roundKey}`)),
      pool = s.prospects.filter((p) => profile(p).region === scout.region && (scout.focus === "All" || profile(p).group === scout.focus)),
      count = 2 + Math.floor(scout.skill / 30);
    for (let i = 0; i < count && pool.length; i++) {
      const p = pool.splice(Math.floor(rng() * pool.length), 1)[0],
        r = (f.reports[p.id] ??= { confidence: 25, visits: [], notes: [], estimate: p.ovr + (p.id.length % 9) - 4 });
      // Reports filed by the classic scouting screen may predate the notes list.
      if (!Array.isArray(r.notes)) r.notes = [];
      r.confidence = Number(r.confidence) || 25;
      const before = r.confidence;
      r.confidence = Math.min(100, r.confidence + Math.round(6 + scout.skill / 8));
      r.estimate = Math.round(p.ovr + ((100 - r.confidence) / 15) * ((p.id.length % 3) - 1));
      const view = scoutedView(s, p);
      r.notes.push(`${scout.name}: ${view.film != null ? `film grade ${view.film}` : "early look"}${view.medical && view.medical !== "No red flags" ? ` · medical: ${view.medical}` : ""}`);
      r.notes = r.notes.slice(-6);
      filed.push({ scout: scout.name, prospect: p.name, from: before, to: r.confidence });
    }
  }
  n.log = [...filed.slice(0, 12), ...n.log].slice(0, 30);
  return filed;
}

/* --------------------------------------------------------------------- live draft */

const STARTERS = { QB: 1, RB: 1, WR: 3, TE: 1, OL: 5, DL: 4, LB: 3, CB: 3, S: 2, K: 1, P: 1 };

function teamNeed(s, team, pos) {
  const players = (team === s.team ? s.roster : s.franchise.clubs[team].players).filter((p) => p.pos === pos && !p.injury);
  const good = players.filter((p) => (p.ovr ?? 0) >= 75).length;
  return clamp((STARTERS[pos] ?? 1) - good, 0, 3);
}

// CPU clubs draft from the consensus board, nudged by positional need and a little noise.
export function cpuChoice(s, pick) {
  const board = consensusBoard(s).slice(0, 25),
    rng = random(identitySeed(`cpu:${s.year}:${pick.id}`));
  return board.map((x) => ({ p: x.p, v: x.score + teamNeed(s, pick.team, x.p.pos) * 2.5 - x.rank * 0.15 + rng() * 2 })).sort((a, b) => b.v - a.v)[0]?.p;
}

const GRADES = [
  [20, "A+", "Steal of the round. This is the kind of value that builds rosters."],
  [10, "A", "Excellent value; he was rated well above this slot."],
  [3, "B+", "Good, sensible pick at a fair price."],
  [-5, "B", "Right around where most boards had him."],
  [-15, "C", "A bit of a reach, but the fit makes sense."],
  [-30, "D", "Significant reach. They must see something others don't."],
  [-999, "F", "Nobody had him anywhere near this range."],
];

export function analystGrade(s, slot, p) {
  const rank = consensusBoard(s).find((x) => x.p.id === p.id)?.rank ?? slot,
    diff = slot - rank,
    [, grade, line] = GRADES.find(([min]) => diff >= min);
  return { grade, line, rank, diff };
}

function recordSelection(s, pick, p, slot) {
  const d = s.franchise.draft,
    g = analystGrade(s, slot, p);
  d.ticker ??= [];
  d.ticker.unshift({ slot, round: pick.round, team: pick.team, name: p.name, pos: p.pos, college: p.college ?? "", grade: g.grade, line: g.line, consensus: g.rank });
  d.ticker = d.ticker.slice(0, 40);
}

export function startLiveDraft(s) {
  requireRole(s, "scout");
  s.franchise.draftLivePreference = true;
  beginDraft(s);
  return s.franchise.draft;
}

export const onTheClock = (s) => {
  const d = s.franchise.draft;
  return d && d.cursor < d.picks.length ? d.picks[d.cursor] : null;
};

// One CPU selection. Returns the pick made, or null when it's your turn or the draft is over.
export function stepDraft(s) {
  const d = s.franchise.draft,
    pick = onTheClock(s);
  if (!d || !pick || pick.team === s.team) return null;
  const choice = cpuChoice(s, pick);
  if (choice) {
    ensureDraftRoom(s, pick.team);
    // Grade against the board before the player leaves it.
    const slot = d.cursor + 1;
    recordSelection(s, pick, choice, slot);
    draftOne(s, pick, choice);
  }
  d.cursor++;
  return pick;
}

export function simToUserPick(s) {
  let n = 0;
  while (stepDraft(s)) n++;
  return n;
}

export function makeUserPick(s, prospectId) {
  requireRole(s, "scout");
  const d = s.franchise.draft,
    pick = onTheClock(s);
  if (!pick || pick.team !== s.team) throw Error("You are not on the clock.");
  const p = s.prospects.find((x) => x.id === prospectId);
  if (!p) throw Error("That prospect has already been selected.");
  // Like the classic draft, your pick never cuts anyone silently: draftOne refuses at 90.
  recordSelection(s, pick, p, d.cursor + 1);
  draftOne(s, pick, p);
  d.cursor++;
  log(s, "Draft selection", `${p.name} (${p.pos}, ${p.college ?? "college"}) joins the franchise.`);
  return p;
}

// Offers from clubs below you who want to move up into your slot.
export function tradeDownOffers(s) {
  const d = s.franchise.draft,
    pick = onTheClock(s);
  if (!pick || pick.team !== s.team) return [];
  const mine = slotValue(d.cursor + 1),
    later = d.picks.map((q, i) => ({ q, i })).filter(({ q, i }) => i > d.cursor && i <= d.cursor + 20 && q.team !== s.team);
  const offers = [];
  for (const { q, i } of later.slice(0, 12)) {
    const theirs = slotValue(i + 1),
      extra = d.picks.map((x, j) => ({ x, j })).find(({ x, j }) => j > i && x.team === q.team && theirs + slotValue(j + 1) >= mine * 1.02);
    if (extra) offers.push({ id: `down-${d.cursor}-${i}-${extra.j}`, partner: q.team, swapIndex: i, extraIndex: extra.j, value: theirs + slotValue(extra.j + 1), cost: mine });
    if (offers.length >= 2) break;
  }
  return offers;
}

export function acceptTradeDown(s, offerId) {
  requireRole(s, "scout");
  const offer = tradeDownOffers(s).find((o) => o.id === offerId);
  if (!offer) throw Error("That offer is no longer on the table.");
  const d = s.franchise.draft;
  d.picks[d.cursor].team = offer.partner;
  d.picks[offer.swapIndex].team = s.team;
  d.picks[offer.extraIndex].team = s.team;
  log(s, "Draft trade", `Moved down from #${d.cursor + 1} to #${offer.swapIndex + 1} and picked up #${offer.extraIndex + 1}.`);
  return offer;
}

// Move up: pay with your later picks worth at least 110% of the target slot on the chart.
export function tradeUpQuote(s, targetIndex) {
  const d = s.franchise.draft;
  if (!d || targetIndex < d.cursor || targetIndex >= d.picks.length || d.picks[targetIndex].team === s.team) return null;
  // Only picks still to be made count; never trade the pick currently on the clock for less.
  const target = slotValue(targetIndex + 1) * 1.1,
    mine = d.picks.map((x, j) => ({ x, j })).filter(({ x, j }) => j > targetIndex && x.team === s.team).sort((a, b) => a.j - b.j),
    pay = [];
  let total = 0;
  for (const m of mine) {
    if (total >= target) break;
    pay.push(m.j);
    total += slotValue(m.j + 1);
  }
  return total >= target ? { targetIndex, partner: d.picks[targetIndex].team, pay, value: total, cost: Math.round(target) } : null;
}

export function acceptTradeUp(s, targetIndex) {
  requireRole(s, "scout");
  const q = tradeUpQuote(s, targetIndex);
  if (!q) throw Error("You don't have enough later picks to move up that far.");
  const d = s.franchise.draft;
  d.picks[targetIndex].team = s.team;
  for (const j of q.pay) d.picks[j].team = q.partner;
  log(s, "Draft trade", `Traded up to #${targetIndex + 1}, sending pick${q.pay.length > 1 ? "s" : ""} ${q.pay.map((j) => `#${j + 1}`).join(", ")}.`);
  return q;
}
