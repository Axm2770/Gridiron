// Arrivals: compares every club's roster and head coach with the last snapshot and turns the
// differences into narrative. Free-agent signings, waiver claims and trade arrivals are found the
// same way whichever path moved the player (manual offer, market AI, calendar day, worker), so
// the transaction code never has to know about presentation.
// Own-club arrivals become Signing / CoachingMove events (pixel cutscene + social reaction);
// notable arrivals elsewhere become compact newsroom cards. Deterministic and idempotent.
import { emitGameEvent, ensureEventLog } from "./event-bus.mjs";
import { postStory, ensureOffice } from "./newsroom.mjs";

const hash = (s) => {
  let h = 2166136261;
  for (const c of String(s)) h = Math.imul(h ^ c.charCodeAt(0), 16777619);
  return h >>> 0;
};
const pick = (list, key) => list[hash(key) % list.length];
const fill = (t, ctx) => t.replace(/\{(\w+)\}/g, (_, k) => ctx[k] ?? "");

const JERSEY_RANGES = {
  QB: [[1, 19]], K: [[1, 19]], P: [[1, 19]], RB: [[20, 49]], WR: [[10, 19], [80, 89]], TE: [[80, 89], [40, 49]],
  OL: [[60, 79]], DL: [[90, 99], [50, 79]], LB: [[40, 59], [90, 99]], CB: [[20, 49]], S: [[20, 49]],
};

// Keeps the player's own number unless a teammate already wears it, else the first free number
// in the position's traditional range, starting from a seeded slot.
export function jerseyNumber(p, teammates = []) {
  const taken = new Set(teammates.filter((q) => q.id !== p.id).map((q) => parseInt(q.jersey, 10)).filter(Number.isFinite)),
    own = parseInt(p.jersey, 10);
  if (Number.isFinite(own) && own >= 0 && own <= 99 && !taken.has(own)) return own;
  const pool = (JERSEY_RANGES[p.pos] || [[1, 99]]).flatMap(([a, b]) => Array.from({ length: b - a + 1 }, (_, i) => a + i)),
    start = hash(p.id) % pool.length;
  for (let i = 0; i < pool.length; i++) if (!taken.has(pool[(start + i) % pool.length])) return pool[(start + i) % pool.length];
  return pool[start];
}

const clubList = (s, t) => (t === s.team ? s.roster : s.franchise.clubs[t]?.players) || [];
const clubName = (s, t) => s.franchise.clubs[t]?.identity?.name || globalThis.clubs?.[t]?.[2] || `Team ${t + 1}`;
const clubCity = (s, t) => s.franchise.clubs[t]?.identity?.city || globalThis.clubs?.[t]?.[1] || clubName(s, t);

function snapshot(s) {
  const players = {},
    coaches = {};
  s.franchise.clubs.forEach((c, t) => {
    for (const p of clubList(s, t)) players[p.id] = t;
    const hc = c.staff?.find((q) => q.role === "HC");
    if (hc) coaches[t] = hc.id;
  });
  for (const p of s.agents || []) players[p.id] ??= "fa";
  for (const w of s.franchise.waivers || []) if (w.player) players[w.player.id] ??= "waivers";
  return { players, coaches };
}

// A career that has not settled a round yet and has no results anywhere is brand new.
const isNewCareer = (s) =>
  !ensureOffice(s).rounds.length && (s.teams || []).every((t) => !(t.w || t.l || t.t)) && ["HC", undefined].includes(s.franchise.role);

const faceOf = (p) => (p?.face ? { ...p.face } : undefined);
const userFace = (s) => (s.franchise.career?.avatar?.skin ? { skin: s.franchise.career.avatar.skin, seed: hash("coach-" + s.team) } : undefined);

/* -------------------------------------------------------------- copy */

const SIGN_TITLES = {
  "free-agency": [
    "{name} signs with the {team}",
    "{team} land {pos} {name} in free agency",
    "Pen to paper: {name} picks {city}",
    "{name} is coming to {city}",
    "Free agency: the {team} add {name}",
  ],
  trade: ["{name} arrives in {city} via trade", "Trade brings {name} to the {team}", "{team} welcome {name} from the {from}", "New colours for {name} after the move to {city}"],
  waivers: ["{team} claim {name} off waivers", "Waiver wire: {name} lands with the {team}"],
};
const SIGN_BODIES = [
  "{name} ({pos}, {ovr} overall, age {age}) will wear number {number}. {role}",
  "The {team} hand number {number} to {name}. {role} The {pos} turns {age} this season.",
  "{name} held up a number {number} jersey at the facility. {role}",
  "Rated {ovr} overall, {pos} {name} joins the {team}. {role} He takes number {number}.",
];
const ROLE = {
  starter: ["He projects straight into the starting lineup.", "Coaches expect him to start right away.", "He arrives as a starter, not a project."],
  rotation: ["Expect him in the rotation from the first week.", "He adds competition at the position.", "The staff see a defined rotational role."],
  depth: ["He adds depth and will compete in practice.", "A depth signing with something to prove.", "He will start on special teams and work up."],
};
const COACH_TITLES = [
  "{team} name {name} head coach",
  "{name} takes over the {team}",
  "New era in {city}: {name} hired",
  "{team} hand the headset to {name}",
];
const COACH_BODIES = [
  "{name} is introduced as head coach{fromText}. {schemeText}The first press conference is set for this week.",
  "Ownership in {city} completes its search with {name}{fromText}. {schemeText}Players report to the new staff soon.",
  "{name} arrives{fromText} with a {rating}-rated coaching profile. {schemeText}",
];

function roleOf(s, p, t) {
  const ahead = clubList(s, t).filter((q) => q.id !== p.id && q.pos === p.pos && (q.ovr ?? 0) > (p.ovr ?? 0)).length;
  return ahead === 0 ? "starter" : ahead <= 2 ? "rotation" : "depth";
}

/* ------------------------------------------------------------ detection */

export function detectArrivals(s, { leagueThreshold = 76, leaguePerWeek = 8, ownLimit = 6 } = {}) {
  const f = s?.franchise;
  if (!f?.clubs?.length) return [];
  ensureEventLog(s);
  const now = snapshot(s),
    out = [],
    // The coach profile identifies the career, so a newly created career (which can reuse the
    // boot world's franchise object) starts from its own baseline.
    world = `${f.userCoach?.saveName ?? ""}|${f.userCoach?.name ?? ""}`;
  if (f.arrivals?.version !== 1 || (f.arrivals.world ?? world) !== world) {
    f.arrivals = { version: 1, world, ...now, weekly: { key: "", count: 0 } };
    if (isNewCareer(s)) {
      const e = emitGameEvent(s, `coach:${s.team}:user:${s.year}`, {
        kind: "CoachingMove",
        team: s.team,
        role: "HC",
        user: true,
        coachId: now.coaches[s.team] || "user-coach",
        coachName: s.coach?.name || "Head coach",
        face: userFace(s),
        tags: ["arrival", "your-hire", "career-start"],
      });
      if (e) {
        out.push(e);
        coachStory(s, e);
      }
    }
    return out;
  }
  const a = f.arrivals,
    weekKey = `${s.year}:${s.phase}:${s.week}`;
  if (a.weekly?.key !== weekKey) a.weekly = { key: weekKey, count: 0 };
  const moves = [];
  for (const [id, team] of Object.entries(now.players)) {
    const prev = a.players[id];
    if (!Number.isInteger(team) || prev === undefined || prev === team) continue;
    moves.push({ id, team, from: Number.isInteger(prev) ? prev : null, via: prev === "fa" ? "free-agency" : prev === "waivers" ? "waivers" : "trade" });
  }
  const coachMoves = Object.entries(now.coaches)
    .map(([t, id]) => [Number(t), id])
    .filter(([t, id]) => a.coaches[t] !== id);
  a.players = now.players;
  a.coaches = now.coaches;

  const player = (m) => clubList(s, m.team).find((p) => p.id === m.id);
  const own = moves.filter((m) => m.team === s.team).map((m) => ({ ...m, p: player(m) })).filter((m) => m.p);
  own.sort((x, y) => (y.p.ovr ?? 0) - (x.p.ovr ?? 0));
  for (const m of own.slice(0, ownLimit)) {
    const e = emitGameEvent(s, `arrival:${m.id}:${m.team}:${weekKey}`, signingEvent(s, m));
    if (e) {
      out.push(e);
      signingStory(s, e, "Players");
    }
  }
  // Around the league only the notable names (or followed clubs) earn a card, capped per week.
  const followed = ensureOffice(s).followedTeams;
  const league = moves
    .filter((m) => m.team !== s.team)
    .map((m) => ({ ...m, p: player(m) }))
    .filter((m) => m.p && ((m.p.ovr ?? 0) >= leagueThreshold || followed.includes(m.team)))
    .sort((x, y) => (y.p.ovr ?? 0) - (x.p.ovr ?? 0) || x.id.localeCompare(y.id));
  for (const m of league) {
    if (a.weekly.count >= leaguePerWeek) break;
    if (signingStory(s, { ...signingEvent(s, m), id: `arrival-${m.id}-${m.team}-${weekKey}` }, "League")) a.weekly.count++;
  }
  for (const [t, id] of coachMoves) {
    const c = f.clubs[t].staff.find((q) => q.id === id);
    if (!c) continue;
    const user = !!c.userControlled,
      moved = (f.staffMovements || []).find((x) => x.id === id && x.to === t),
      data = {
        kind: "CoachingMove",
        team: t,
        role: "HC",
        user,
        coachId: id,
        coachName: user ? s.coach?.name || c.name : c.name,
        from: Number.isInteger(moved?.from) && moved.from !== t ? moved.from : null,
        rating: c.rating,
        scheme: c.scheme,
        face: user ? userFace(s) : faceOf(c),
        tags: ["arrival", user ? "your-hire" : "new-hc"],
      };
    if (t === s.team) {
      const e = emitGameEvent(s, `coach:${t}:${id}:${s.year}`, data);
      if (e) {
        out.push(e);
        coachStory(s, e);
      }
    } else coachStory(s, { ...data, id: `coach-${t}-${id}-${s.year}` });
  }
  return out;
}

function signingEvent(s, m) {
  const p = m.p;
  return {
    kind: "Signing",
    team: m.team,
    playerId: p.id,
    playerName: p.name,
    pos: p.pos,
    ovr: p.ovr,
    age: p.age,
    number: jerseyNumber(p, clubList(s, m.team)),
    via: m.via,
    from: m.from,
    role: roleOf(s, p, m.team),
    face: faceOf(p),
    headline: `${p.name} (${p.pos}) joins the ${clubName(s, m.team)}`,
    tags: ["arrival", m.via, (p.ovr ?? 0) >= 80 ? "marquee" : "depth"],
  };
}

function signingStory(s, e, category) {
  const ctx = {
    name: e.playerName,
    pos: e.pos,
    ovr: e.ovr ?? "–",
    age: e.age ?? "–",
    number: e.number,
    team: clubName(s, e.team),
    city: clubCity(s, e.team),
    from: Number.isInteger(e.from) ? clubName(s, e.from) : "previous club",
  };
  ctx.role = pick(ROLE[e.role] || ROLE.depth, e.id + "role");
  return postStory(s, `arrival-${e.id}`, {
    team: e.team,
    otherTeam: Number.isInteger(e.from) ? e.from : undefined,
    playerId: e.playerId,
    category,
    source: "Transactions wire",
    title: fill(pick(SIGN_TITLES[e.via] || SIGN_TITLES["free-agency"], e.id + "title"), ctx),
    body: fill(pick(SIGN_BODIES, e.id + "body"), ctx).replace(/\s{2,}/g, " ").trim(),
    card: { type: "jersey", team: e.team, playerId: e.playerId, name: e.playerName, pos: e.pos, ovr: e.ovr, number: e.number, via: e.via, from: e.from, face: e.face },
  });
}

function coachStory(s, e) {
  const ctx = {
    name: e.coachName,
    team: clubName(s, e.team),
    city: clubCity(s, e.team),
    rating: e.rating ?? "–",
    fromText: Number.isInteger(e.from) ? ` after leaving the ${clubName(s, e.from)}` : "",
    schemeText: e.scheme ? `Expect a ${String(e.scheme).toLowerCase()} identity. ` : "",
  };
  return postStory(s, `coach-${e.id}`, {
    team: e.team,
    category: e.team === s.team ? "Team" : "League",
    source: "Gridiron Journal",
    title: e.user ? `${ctx.team} unveil ${ctx.name} as head coach` : fill(pick(COACH_TITLES, e.id + "title"), ctx),
    body: e.user
      ? `${ctx.name} takes charge in ${ctx.city}. The roster, the staff and the expectations are now yours to shape.`
      : fill(pick(COACH_BODIES, e.id + "body"), ctx).replace(/\s{2,}/g, " ").trim(),
    card: { type: "coach", team: e.team, coachId: e.coachId, name: e.coachName, user: !!e.user, from: e.from, scheme: e.scheme, face: e.face },
  });
}
