// Ownership expectations, underperformance meetings and plan checkpoints.
// Each season the board writes down measurable targets from franchise strength and the mandate.
// When results fall clearly behind, the owner calls a board meeting (a plan with a checkpoint)
// and the captains ask for a team meeting. Checkpoints and an end-of-season review settle the
// consequences through owner patience, which drives job security in the boardroom.
import { ensureCareerSystems, changeCoachReputation } from "./career-systems.mjs";
import { capLedger, MILLION } from "./state.mjs";
import { ensureBoard, boardOverview, projectedWins, winTarget, BUDGET_STEP } from "./boardroom.mjs";
import { postMessage, applyMood, ensureOffice } from "./newsroom.mjs";
import { ensureSocial } from "./social-engine.mjs";

export const BOARD_DECISIONS = ["boardMeeting", "teamMeeting", "seasonReview"];
// Thresholds and cooldowns (in league rounds) for the in-season meetings.
export const MEETING_RULES = {
  minGames: 4,
  paceGap: -2,
  losingStreak: 3,
  security: 40,
  boardCooldown: 4,
  teamCooldown: 3,
  teamMorale: 55,
  teamDrama: 60,
  finalWarning: 35,
};
export const YOUNG_AGE = 24;
const clamp = (n, a = 0, b = 100) => Math.max(a, Math.min(b, n));
const plural = (n, word) => `${n} ${word}${n === 1 ? "" : "s"}`;
const NUMBER = ["no", "one", "two", "three", "four", "five", "six"];
const spell = (n) => NUMBER[n] || String(n);

export function ensureExpectations(s) {
  const f = ensureCareerSystems(s);
  if (!f) return null;
  const e = (f.expectations ??= {});
  e.version ??= 1;
  if (!e.seasons || typeof e.seasons !== "object") e.seasons = {};
  if (!Array.isArray(e.meetings)) e.meetings = [];
  if (!Array.isArray(e.rounds)) e.rounds = [];
  e.last ??= {};
  e.plan ??= null;
  e.warnings ??= {};
  return e;
}

/* ------------------------------------------------------------ strength */
export function strengthProfile(s) {
  const ratings = s.teams.map((t) => t.rating || 0),
    rating = ratings[s.team],
    rank = 1 + ratings.filter((r) => r > rating).length,
    leagueAvg = Math.round((ratings.reduce((a, b) => a + b, 0) / ratings.length) * 10) / 10,
    tier = rank <= 4 ? "Title contender" : rank <= 12 ? "Playoff team" : rank <= 22 ? "Middle of the pack" : "Rebuilding";
  return { rating, rank, leagueAvg, tier, projected: projectedWins(s) };
}

export const youngStarters = (s) =>
  s.roster.filter((p) => p.starter && (!p.status || p.status === "active") && (p.age || 30) <= YOUNG_AGE);

function seasonFor(s) {
  const e = s.franchise.expectations,
    season = e?.seasons?.[s.year];
  // A new career can reuse the boot world's franchise object: expectations belong to one career.
  return season && season.team === s.team && (season.world ?? careerKey(s)) === careerKey(s) ? season : null;
}
const careerKey = (s) => `${s.franchise.userCoach?.saveName ?? ""}|${s.franchise.userCoach?.name ?? ""}`;
const keyTag = (s) => careerKey(s).replace(/[^a-z0-9]+/gi, "").slice(0, 24);

// Create this season's expectations (and the inbox brief) once per year and club.
export function ensureSeasonExpectations(s, { post = true } = {}) {
  // Partial test fixtures and pre-career states lack the cap calendar or roster; wait for a full career.
  if (!s.franchise?.clubs?.[s.team] || !s.franchise.calendar || !Array.isArray(s.teams) || !Array.isArray(s.roster)) return null;
  const e = ensureExpectations(s);
  let season = seasonFor(s);
  if (!season) {
    if (s.phase === "offseason") return null;
    const strength = strengthProfile(s);
    season = e.seasons[s.year] = {
      year: s.year,
      team: s.team,
      world: careerKey(s),
      ...strength,
      targetShift: e.nextTone?.year === s.year ? e.nextTone.shift : 0,
      createdWeek: s.week,
      posted: false,
      reviewed: false,
      outcome: null,
    };
    for (const y of Object.keys(e.seasons)) if (+y < s.year - 5) delete e.seasons[y];
    if (e.plan && e.plan.year !== s.year) e.plan = null;
  }
  if (post && !season.posted) {
    season.posted = true;
    const r = expectationsReport(s),
      club = s.franchise.clubs[s.team];
    const m = postMessage(s, `expectations-${s.year}-${s.team}-${keyTag(s)}`, {
      title: `Owner's expectations for ${s.year}`,
      summary: r.headline,
      body: `${club.owner.name} has set out what ownership expects this season. The roster rates ${prof(r)}, so the board projects ${r.projected} wins and judges you on a target of ${r.target} under the ${r.mandate} mandate.\n\nTargets:\n${r.items.map((x) => `• ${x.label}${x.required ? "" : " (secondary)"}`).join("\n")}\n\nConsequences:\n${r.bands.map((b) => `• ${b.label}: ${b.when}. ${b.effect}`).join("\n")}\n\nThe board will call a meeting if results fall clearly behind. Track progress in the Boardroom.`,
      category: "Team",
      priority: "important",
      source: "Ownership",
      route: "Boardroom",
      data: {
        kind: "targets",
        lead: `${club.owner.name} has set out what ownership expects this season.`,
        mandate: r.mandate,
        facts: [
          { label: "Roster rating", value: `${r.rating} OVR · ${ordinal(r.rank)}` },
          { label: "Projected wins", value: String(r.projected) },
          { label: "Win target", value: String(r.target) },
        ],
        items: r.items.map((x) => ({ label: x.label, required: x.required, progress: "" })),
        bands: r.bands.map((b) => ({ label: b.label, text: `${b.when}. ${b.effect}` })),
        note: "The board will call a meeting if results fall clearly behind. Track progress in the Boardroom.",
      },
    });
    logMeeting(s, { kind: "Expectations", title: `Expectations set: ${r.headline.replace(/^.*?: /, "")}`, agreed: null, outcome: "Set", messageId: m?.id });
  }
  return season;
}
const prof = (r) => `${r.rating} overall, ${ordinal(r.rank)} of 32 (league average ${r.leagueAvg})`;
const ordinal = (n) => n + (n % 100 >= 11 && n % 100 <= 13 ? "th" : ["th", "st", "nd", "rd"][n % 10] || "th");

/* ------------------------------------------------------------ live status */
function ourGames(s) {
  const out = [];
  for (let w = 0; w < Math.min(s.week, s.schedule?.length || 0); w++) {
    const g = s.schedule[w]?.find((g) => (g.a === s.team || g.b === s.team) && g.score);
    if (!g) continue;
    const k = g.a === s.team ? 0 : 1;
    out.push(g.score[k] > g.score[1 - k] ? "W" : g.score[k] < g.score[1 - k] ? "L" : "T");
  }
  return out;
}
function losingStreak(s) {
  const games = ourGames(s);
  let n = 0;
  for (let i = games.length - 1; i >= 0 && games[i] === "L"; i--) n++;
  return n;
}
function playoffStatus(s) {
  const post = s.franchise.postseason,
    seeded = post?.seeds?.some((c) => c.includes(s.team)),
    wins = (s.playoffs?.rounds || []).flat().filter((g) => g.score && (g.a === s.team || g.b === s.team) && g.score[g.a === s.team ? 0 : 1] > g.score[g.a === s.team ? 1 : 0]).length;
  return { decided: !!post && s.phase !== "season", qualified: !!seeded && s.phase !== "season", wins };
}

// Numbers the board looks at every week.
export function boardPulse(s) {
  const team = s.teams[s.team],
    games = s.franchise.rules?.regularGames || 17,
    played = team.w + team.l + (team.t || 0),
    target = winTarget(s),
    pace = played ? (team.w / played) * games : null,
    social = ensureSocial(s).pulse,
    o = boardOverview(s);
  return {
    w: team.w,
    l: team.l,
    played,
    games,
    remaining: Math.max(0, games - played),
    target,
    pace,
    paceGap: pace === null ? 0 : pace - target,
    pointDiff: (team.pf || 0) - (team.pa || 0),
    streak: losingStreak(s),
    fans: Math.round(s.franchise.clubs[s.team].fanApproval ?? 60),
    morale: Math.round(s.morale ?? 75),
    drama: Math.round(social.drama ?? 15),
    chemistry: Math.round(social.chemistry ?? 70),
    security: o.security,
    status: o.status,
  };
}

// Read model for the Boardroom card. Never mutates state.
export function expectationsReport(s) {
  const b = ensureBoard(s),
    e = s.franchise.expectations || {},
    season = seasonFor(s),
    base = season || { ...strengthProfile(s), targetShift: 0, year: s.year },
    p = boardPulse(s),
    target = p.target,
    minWins = Math.ceil(target),
    ps = playoffStatus(s),
    rebuild = b.mandate === "Rebuild",
    contend = b.mandate === "Contend",
    tier = base.tier,
    needPlayoffs = contend || tier === "Title contender" || (tier === "Playoff team" && !rebuild),
    needPlayoffWin = tier === "Title contender" && !rebuild,
    youthNeed = rebuild || tier === "Rebuilding" ? 3 : tier === "Title contender" ? 1 : 2,
    young = youngStarters(s).length,
    cap = capLedger(s),
    over = s.phase !== "season",
    items = [];
  const state = (done, risk, missed) => (done ? "done" : missed ? "missed" : risk ? "risk" : "on");
  items.push({
    key: "wins",
    label: `Win at least ${minWins} regular-season games`,
    progress: `${p.w} / ${minWins}${p.pace === null || over ? "" : ` · on pace for ${p.pace.toFixed(1)}`}`,
    state: state(p.w >= minWins, p.pace !== null && p.paceGap < -1, over && p.w < minWins),
    required: true,
  });
  if (needPlayoffs || ps.qualified)
    items.push({
      key: "playoffs",
      label: "Reach the playoffs",
      progress: ps.decided ? (ps.qualified ? "Qualified" : "Missed") : p.pace === null ? "Season not started" : p.pace >= 10 ? "On course" : "Outside the picture",
      state: state(ps.qualified, p.pace !== null && p.pace < 10, ps.decided && !ps.qualified),
      required: needPlayoffs,
    });
  if (needPlayoffWin)
    items.push({
      key: "playoffWin",
      label: "Win a playoff game",
      progress: ps.wins ? `${plural(ps.wins, "playoff win")}` : s.phase === "offseason" || (ps.decided && !ps.qualified) ? "No playoff win" : "Awaiting the postseason",
      state: state(ps.wins > 0, false, (s.phase === "offseason" || (ps.decided && !ps.qualified)) && !ps.wins),
      required: true,
    });
  items.push({
    key: "cap",
    label: "Keep the cap under control",
    progress: cap.room >= 0 ? `$${(cap.room / MILLION).toFixed(1)}M room` : "Over the cap",
    state: cap.room >= 0 ? "on" : "risk",
    required: true,
  });
  items.push({
    key: "youth",
    label: `Develop ${spell(youthNeed)} young starter${youthNeed === 1 ? "" : "s"} (${YOUNG_AGE} or under)`,
    progress: `${young} / ${youthNeed} starting`,
    state: young >= youthNeed ? "done" : over ? "missed" : "risk",
    required: rebuild || tier === "Rebuilding",
  });
  items.push({
    key: "fans",
    label: "Keep fan approval at 45% or better",
    progress: `${p.fans}%`,
    state: p.fans >= 45 ? "on" : "risk",
    required: false,
  });
  const headParts = [`at least ${minWins} wins`];
  if (needPlayoffWin) headParts.push("a playoff win");
  else if (needPlayoffs) headParts.push("a playoff spot");
  headParts.push("cap under control", `develop ${spell(youthNeed)} young starter${youthNeed === 1 ? "" : "s"}`);
  const bands = [
    { key: "Exceeded", label: "Exceed", when: `${minWins + 2}+ wins${needPlayoffs ? "" : " or a playoff spot"} with every required target met`, effect: "Owner patience +12 and a reputation boost." },
    { key: "Met", label: "Meet", when: `${minWins}+ wins and every required target met`, effect: "Owner patience +5." },
    { key: "Missed", label: "Miss", when: `Fewer than ${minWins} wins or a required target missed`, effect: "Owner patience −10 (−18 if four or more wins short); a final warning if job security collapses." },
  ];
  const plan = e.plan && e.plan.status === "active" && e.plan.year === s.year && e.plan.team === s.team ? planProgress(s, e.plan) : null;
  const pending = ensureOffice(s).messages.filter((m) => m.status === "pending" && BOARD_DECISIONS.includes(m.decision) && m.team === s.team);
  return {
    year: s.year,
    tier,
    rank: base.rank,
    rating: base.rating,
    leagueAvg: base.leagueAvg,
    projected: base.projected,
    mandate: b.mandate,
    target,
    minWins,
    targetShift: base.targetShift || 0,
    headline: `Owner's expectations for ${s.year}: ${headParts.join(", ")}`,
    items,
    bands,
    outcome: season?.outcome || null,
    plan,
    lastPlan: !plan && e.plan && e.plan.year === s.year ? e.plan : null,
    meetings: (e.meetings || []).filter((x) => x.team === undefined || x.team === s.team).slice(0, 12),
    pending: pending.map((m) => ({ id: m.id, title: m.title, decision: m.decision })),
    pulse: p,
    warning: e.warnings?.[s.year] || 0,
  };
}

function planProgress(s, plan) {
  const team = s.teams[s.team],
    played = team.w + team.l + (team.t || 0),
    since = Math.max(0, played - plan.startPlayed),
    value = plan.metric === "youngStarters" ? youngStarters(s).length : team.w - plan.startWins;
  return { ...plan, since, left: Math.max(0, plan.games - since), value };
}

/* ------------------------------------------------------------ history */
function logMeeting(s, entry) {
  const e = ensureExpectations(s),
    item = {
      id: `meeting-${s.year}-${s.week}-${e.meetings.length}-${entry.kind}`,
      year: s.year,
      week: s.week,
      date: s.franchise.calendarSim?.date || null,
      team: s.team,
      ...entry,
    };
  e.meetings.unshift(item);
  e.meetings = e.meetings.slice(0, 30);
  return item;
}
const patience = (s, delta) => {
  const owner = s.franchise.clubs[s.team].owner;
  owner.patience = Math.round(clamp(owner.patience + delta));
  return delta;
};
const fans = (s, delta) => {
  const club = s.franchise.clubs[s.team];
  club.fanApproval = Math.round(clamp((club.fanApproval ?? 60) + delta));
};
const leaders = (s) =>
  s.roster
    .filter((p) => !p.status || p.status === "active")
    .slice()
    .sort((a, b) => (b.persona?.leadership ?? 0.5) + (b.age || 25) / 50 - ((a.persona?.leadership ?? 0.5) + (a.age || 25) / 50))
    .slice(0, 3);

/* ------------------------------------------------------------ meetings */
const pendingOf = (s, decision) =>
  ensureOffice(s).messages.some((m) => m.status === "pending" && m.decision === decision && m.team === s.team);
const cooled = (e, kind, s, rounds) => {
  const last = e.last[kind];
  return !last || last.year !== s.year || s.week - last.week >= rounds;
};

function boardMeetingTerms(p) {
  const games5 = Math.max(1, Math.min(5, p.remaining)),
    games4 = Math.max(1, Math.min(4, p.remaining));
  return {
    commit: { games: games5, need: Math.ceil(games5 * 0.6) },
    youth: { games: games4 },
    resources: { games: games4, need: Math.ceil(games4 * 0.75), amount: BUDGET_STEP },
  };
}

export function callBoardMeeting(s, p = boardPulse(s), reasons = []) {
  const e = ensureExpectations(s),
    club = s.franchise.clubs[s.team],
    terms = boardMeetingTerms(p),
    youngNow = youngStarters(s).length;
  terms.youth.baseline = youngNow;
  terms.youth.need = Math.min(11, Math.max(3, youngNow + 2));
  e.last.board = { year: s.year, week: s.week };
  const key = `board-meeting-${s.year}-${s.team}-${s.week}`;
  const m = postMessage(s, key, {
    title: `Board meeting: ${club.owner.name} wants a plan`,
    summary: `${p.w}–${p.l} against a target of ${p.target} wins. On pace for ${p.pace.toFixed(1)}. Job security ${p.security}.`,
    body: `${club.owner.name} and the club president have called you in. The season is not going to plan.\n\n• Record: ${p.w}–${p.l} after ${plural(p.played, "game")} (target ${p.target}, on pace for ${p.pace.toFixed(1)})\n• Point differential: ${p.pointDiff >= 0 ? "+" : ""}${p.pointDiff}\n• Losing streak: ${p.streak}\n• Fan approval ${p.fans}% · team morale ${p.morale}% · drama ${p.drama}\n• Job security: ${p.security} (${p.status})\n\nWhy now: ${reasons.join("; ")}.\n\nOwnership wants an agreed plan with a checkpoint. If you do not answer within two league rounds, the first plan is agreed on your behalf.`,
    category: "Team",
    priority: "urgent",
    source: "Ownership",
    decision: "boardMeeting",
    route: "Boardroom",
    meta: terms,
    data: {
      kind: "meeting",
      lead: `${club.owner.name} and the club president have called you in. The season is not going to plan.`,
      status: p.status,
      statusTone: p.security < 40 ? "bad" : "warn",
      facts: [
        { label: "Record", value: `${p.w}–${p.l}` },
        { label: "Win target", value: `${p.target} · pace ${p.pace.toFixed(1)}` },
        { label: "Point diff", value: `${p.pointDiff >= 0 ? "+" : ""}${p.pointDiff}` },
        { label: "Losing streak", value: String(p.streak) },
        { label: "Fan approval", value: `${p.fans}%` },
        { label: "Team morale", value: `${p.morale}%` },
        { label: "Drama", value: `${p.drama}%` },
        { label: "Job security", value: `${p.security}%` },
      ],
      reasons,
      note: "Ownership wants an agreed plan with a checkpoint. If you do not answer within two league rounds, the first plan is agreed on your behalf.",
    },
  });
  if (m) logMeeting(s, { kind: "Board", title: `Board meeting called at ${p.w}–${p.l}`, agreed: null, outcome: "Awaiting your answer", messageId: m.id });
  return m;
}

export function callTeamMeeting(s, p = boardPulse(s), reasons = []) {
  const e = ensureExpectations(s),
    group = leaders(s),
    names = group.map((x) => x.name),
    who = names.length > 1 ? `${names.slice(0, -1).join(", ")} and ${names.at(-1)}` : names[0] || "The captains";
  e.last.team = { year: s.year, week: s.week };
  const m = postMessage(s, `team-meeting-${s.year}-${s.team}-${s.week}`, {
    title: `Captains ask for a team meeting`,
    summary: `${who} want to talk about the ${p.w}–${p.l} start before the room splits.`,
    body: `${who} have asked for a meeting with you and the leadership group.\n\n• Record ${p.w}–${p.l}${p.streak >= 2 ? `, ${p.streak} straight losses` : ""}\n• Team morale ${p.morale}% · chemistry ${p.chemistry} · drama ${p.drama}\n\nWhat they raised: ${reasons.join("; ")}.\n\nHow you lead this meeting changes morale, trust and chemistry in the room.`,
    category: "Team",
    priority: "urgent",
    source: "Leadership group",
    decision: "teamMeeting",
    playerId: group[0]?.id,
    leaders: group.map((x) => x.id),
    route: "Locker room",
    data: {
      kind: "meeting",
      title: "The room",
      lead: `${who} have asked for a meeting with you and the leadership group.`,
      facts: [
        { label: "Record", value: `${p.w}–${p.l}` },
        { label: "Losing streak", value: String(p.streak) },
        { label: "Team morale", value: `${p.morale}%` },
        { label: "Chemistry", value: `${p.chemistry}%` },
        { label: "Drama", value: `${p.drama}%` },
      ],
      reasons,
      reasonsLabel: "What they raised",
      note: "How you lead this meeting changes morale, trust and chemistry in the room.",
    },
  });
  if (m) logMeeting(s, { kind: "Team", title: `Team meeting with ${who}`, agreed: null, outcome: "Awaiting your answer", messageId: m.id });
  return m;
}

/* ------------------------------------------------------------ options */
export function boardDecisionOptions(m) {
  const t = m.meta || {};
  const sets = {
    boardMeeting: [
      ["commit", `Commit to the plan: win ${t.commit?.need ?? 3} of the next ${t.commit?.games ?? 5}`, `Owner patience +3 now. Meet the checkpoint: +10. Miss it: −20 patience and a sharp drop in job security.`],
      ["youth", "Ask for patience to develop youth", `Win target −1.5 and fan approval −4 now. Start at least ${t.youth?.need ?? 3} players aged ${YOUNG_AGE} or under within ${t.youth?.games ?? 4} games: +6 if met, −14 if not.`],
      ["resources", "Request resources", `+$${((t.resources?.amount ?? BUDGET_STEP) / MILLION).toFixed(1)}M staff budget and win target +1. Then win ${t.resources?.need ?? 3} of the next ${t.resources?.games ?? 4}: +8 if met, −24 if missed.`],
    ],
    teamMeeting: [
      ["accountable", "Hold players accountable", "Drama falls and ownership approves. Morale rises only if the room is still confident; otherwise it dips."],
      ["back", "Back the group publicly", "Morale, chemistry and the captain's trust rise. Fans and ownership want accountability."],
      ["gameplan", "Change the game plan", "A fresh approach: small morale and chemistry lift, drama eases and fans like the change."],
    ],
    seasonReview: [
      ["reset", "Accept the verdict and reset", "No promise for next season. Owner patience +1."],
      ["push", "Promise a playoff push next season", "Owner patience +4 now; next season's win target +1."],
      ["runway", "Ask for a development runway", "Next season's win target −1; owner patience −3 (a Patient Rebuilder owner approves instead)."],
    ],
  };
  return (sets[m.decision] || []).map(([id, text, note]) => ({ id, text, note }));
}

// Applies a board, team or review decision. Called from newsroom.respondMessage.
export function resolveBoardDecision(s, m, option, { delegated = false } = {}) {
  const e = ensureExpectations(s),
    club = s.franchise.clubs[s.team],
    choice = option.id,
    team = s.teams[s.team],
    played = team.w + team.l + (team.t || 0);
  let outcome = "",
    changes = [];
  if (m.decision === "boardMeeting") {
    const t = m.meta || boardMeetingTerms(boardPulse(s)),
      season = ensureSeasonExpectations(s, { post: false }),
      base = { id: `plan-${m.id}`, year: s.year, team: s.team, kind: choice, label: option.text, agreedWeek: s.week, startPlayed: played, startWins: team.w, status: "active", messageId: m.id };
    if (choice === "commit") {
      patience(s, 3);
      e.plan = { ...base, games: t.commit.games, need: t.commit.need, metric: "wins", reward: 10, penalty: 20, measure: `Win ${t.commit.need} of the next ${t.commit.games} games` };
      outcome = `Plan agreed: ${e.plan.measure}. Owner patience +3.`;
    } else if (choice === "youth") {
      if (season) season.targetShift = Math.round(((season.targetShift || 0) - 1.5) * 10) / 10;
      fans(s, -4);
      e.plan = { ...base, games: t.youth.games, need: t.youth.need, baseline: t.youth.baseline ?? youngStarters(s).length, metric: "youngStarters", reward: 6, penalty: 14, measure: `Start ${t.youth.need} players aged ${YOUNG_AGE} or under within ${t.youth.games} games` };
      outcome = `Development plan agreed: ${e.plan.measure}. Win target lowered by 1.5; fan approval −4.`;
    } else {
      const amount = club.cash >= 80 * MILLION + t.resources.amount ? t.resources.amount : Math.round(t.resources.amount / 2);
      club.staffBudget += amount;
      if (season) season.targetShift = Math.round(((season.targetShift || 0) + 1) * 10) / 10;
      e.plan = { ...base, games: t.resources.games, need: t.resources.need, metric: "wins", reward: 8, penalty: 24, measure: `Win ${t.resources.need} of the next ${t.resources.games} games`, amount };
      outcome = `Resources granted: +$${(amount / MILLION).toFixed(1)}M staff budget. Win target raised by 1. ${e.plan.measure}.`;
    }
    e.plan.checkpointWeek = s.week + e.plan.games;
  } else if (m.decision === "teamMeeting") {
    const social = ensureSocial(s).pulse,
      confident = (s.morale ?? 75) >= 60,
      fx =
        choice === "accountable"
          ? { teamDelta: confident ? 2 : -2, delta: 1, trust: 3, owner: 2, fan: 0, chemistry: -2, drama: -6 }
          : choice === "back"
            ? { teamDelta: 3, delta: 3, trust: 4, owner: -1, fan: -2, chemistry: 5, drama: -2 }
            : { teamDelta: 1, delta: 1, trust: 2, owner: 0, fan: 1, chemistry: 2, drama: -3 };
    social.chemistry = Math.round(clamp((social.chemistry ?? 70) + fx.chemistry));
    social.drama = Math.round(clamp((social.drama ?? 15) + fx.drama));
    changes = applyMood(s, { playerId: m.playerId, delta: fx.delta, teamDelta: fx.teamDelta, trust: fx.trust, fan: fx.fan, owner: fx.owner, sourceId: m.id, reason: option.text, spillover: false });
    if (choice === "gameplan") e.gamePlanReset = { year: s.year, week: s.week };
    outcome = `${option.text}. Chemistry ${fx.chemistry >= 0 ? "+" : ""}${fx.chemistry}, drama ${fx.drama}, team morale ${fx.teamDelta >= 0 ? "+" : ""}${fx.teamDelta}.${choice === "gameplan" ? " Review Tactics before the next game." : ""}`;
  } else if (m.decision === "seasonReview") {
    const year = (m.year ?? s.year) + 1;
    if (choice === "push") {
      patience(s, 4);
      e.nextTone = { year, shift: 1 };
      outcome = `Promised a playoff push: ${year} win target +1. Owner patience +4.`;
    } else if (choice === "runway") {
      const delta = club.owner.trait === "Patient Rebuilder" ? 2 : -3;
      patience(s, delta);
      e.nextTone = { year, shift: -1 };
      outcome = `Development runway agreed: ${year} win target −1. Owner patience ${delta >= 0 ? "+" : ""}${delta}.`;
    } else {
      patience(s, 1);
      e.nextTone = null;
      outcome = "The board accepts the verdict. Next season starts from the roster projection.";
    }
  }
  m.status = delegated ? "delegated" : "resolved";
  m.read = true;
  m.response = option.text;
  m.resolvedStep = ensureOffice(s).step;
  m.changes = changes;
  m.outcome = (delegated ? "No answer arrived in time, so the first option was agreed on your behalf. " : "") + outcome;
  const entry = e.meetings.find((x) => x.messageId === m.id);
  if (entry) Object.assign(entry, { agreed: option.text, outcome: m.decision === "boardMeeting" ? "Plan active" : "Agreed", detail: outcome });
  return m;
}

/* ------------------------------------------------------------ checkpoints */
function evaluatePlan(s) {
  const e = ensureExpectations(s),
    plan = e.plan;
  if (!plan || plan.status !== "active" || plan.year !== s.year || plan.team !== s.team) return null;
  const pr = planProgress(s, plan),
    seasonOver = s.phase !== "season";
  if (pr.since < plan.games && !seasonOver) return null;
  const met = pr.value >= plan.need,
    club = s.franchise.clubs[s.team],
    before = boardOverview(s).security;
  plan.status = met ? "met" : "missed";
  plan.result = pr.value;
  plan.settledWeek = s.week;
  if (met) {
    patience(s, plan.reward);
    fans(s, 2);
  } else {
    patience(s, -plan.penalty);
    fans(s, -3);
    changeCoachReputation(s, `board-plan:${plan.id}`, -2, "Missed a plan agreed with ownership", "Results");
  }
  const after = boardOverview(s).security,
    progress = plan.metric === "wins" ? `${pr.value} of ${plan.need} wins needed` : `${pr.value} young starters (needed ${plan.need})`;
  const m = postMessage(s, `checkpoint-${plan.id}`, {
    title: met ? "Checkpoint met: ownership is satisfied" : "Checkpoint missed: ownership is losing patience",
    summary: `${plan.measure}: ${progress}. Job security ${before} → ${after}.`,
    body: met
      ? `${club.owner.name} reviewed the plan agreed at the board meeting. ${plan.measure}: ${progress}. Owner patience +${plan.reward}. Job security ${before} → ${after}.`
      : `${club.owner.name} reviewed the plan agreed at the board meeting. ${plan.measure}: ${progress}. Owner patience −${plan.penalty}, fan approval −3. Job security ${before} → ${after}.`,
    category: "Team",
    priority: met ? "important" : "urgent",
    source: "Ownership",
    route: "Boardroom",
    data: {
      kind: "checkpoint",
      lead: `${club.owner.name} reviewed the plan agreed at the board meeting.`,
      met,
      measure: plan.measure,
      value: pr.value,
      need: plan.need,
      unit: plan.metric === "wins" ? "wins" : "young starters",
      security: [before, after],
      effects: met ? [{ label: "Owner patience", delta: plan.reward }, { label: "Fan approval", delta: 2 }] : [{ label: "Owner patience", delta: -plan.penalty }, { label: "Fan approval", delta: -3 }],
    },
  });
  logMeeting(s, { kind: "Checkpoint", title: plan.measure, agreed: plan.label, outcome: met ? "Met" : "Missed", detail: `${progress}. Security ${before} → ${after}.`, messageId: m?.id });
  const entry = e.meetings.find((x) => x.messageId === plan.messageId);
  if (entry) entry.outcome = met ? "Plan met" : "Plan missed";
  if (!met && after < MEETING_RULES.finalWarning) finalWarning(s, after);
  return plan;
}

// There is no dismissal mechanism in the career, so a collapse produces an on-record warning
// (and a reputation hit) instead of a firing.
function finalWarning(s, security) {
  const e = ensureExpectations(s),
    count = (e.warnings[s.year] = (e.warnings[s.year] || 0) + 1),
    club = s.franchise.clubs[s.team];
  changeCoachReputation(s, `board-warning:${s.year}:${count}`, -3, "Received a formal warning from ownership", "Results");
  const m = postMessage(s, `final-warning-${s.year}-${s.team}-${count}`, {
    title: count === 1 ? "Final warning from ownership" : "Ownership ultimatum",
    summary: `Job security has fallen to ${security}. ${club.owner.name} has put the warning on record.`,
    body:
      count === 1
        ? `${club.owner.name} has issued a formal final warning. Job security is ${security}. Results must improve immediately; the next board meeting will not be a discussion.`
        : `${club.owner.name} has delivered an ultimatum: another missed target this season and the board will consider a change of direction. Job security is ${security}.`,
    category: "Team",
    priority: "urgent",
    source: "Ownership",
    route: "Boardroom",
    data: {
      kind: "meeting",
      title: count === 1 ? "Final warning" : "Ultimatum",
      lead: count === 1 ? `${club.owner.name} has issued a formal final warning. Results must improve immediately; the next board meeting will not be a discussion.` : `${club.owner.name} has delivered an ultimatum: another missed target this season and the board will consider a change of direction.`,
      status: "On record",
      statusTone: "bad",
      facts: [{ label: "Job security", value: `${security}%` }, { label: "Warnings this season", value: String(count) }],
    },
  });
  logMeeting(s, { kind: "Warning", title: count === 1 ? "Final warning issued" : "Ultimatum issued", agreed: null, outcome: "On record", detail: `Job security ${security}.`, messageId: m?.id });
}

/* ------------------------------------------------------------ season review */
function seasonReview(s) {
  const e = ensureExpectations(s),
    season = seasonFor(s);
  if (!season || season.reviewed) return null;
  const r = expectationsReport(s),
    required = r.items.filter((x) => x.required),
    missed = required.filter((x) => x.state !== "done" && x.state !== "on"),
    short = r.minWins - r.pulse.w,
    playoffs = playoffStatus(s).qualified,
    band = missed.length ? "Missed" : short <= -2 || (playoffs && !r.items.find((x) => x.key === "playoffs")?.required) ? "Exceeded" : "Met",
    delta = band === "Exceeded" ? 12 : band === "Met" ? 5 : short >= 4 ? -18 : -10,
    club = s.franchise.clubs[s.team];
  patience(s, delta);
  if (band === "Exceeded") changeCoachReputation(s, `board-review:${s.year}`, 3, "Exceeded ownership's expectations", "Results");
  season.reviewed = true;
  season.outcome = band;
  season.wins = r.pulse.w;
  const security = boardOverview(s).security,
    lines = r.items.map((x) => `• ${x.label}: ${x.progress} ${x.state === "done" || x.state === "on" ? "✓" : "✗"}`).join("\n");
  const m = postMessage(s, `season-review-${s.year}-${s.team}`, {
    title: `End-of-season review: expectations ${band.toLowerCase()}`,
    summary: `${r.pulse.w}–${r.pulse.l} against a target of ${r.minWins} wins. Owner patience ${delta >= 0 ? "+" : ""}${delta}.`,
    body: `${club.owner.name} has reviewed the ${s.year} season against the expectations set in preseason.\n\n${lines}\n\nVerdict: expectations ${band.toLowerCase()}. Owner patience ${delta >= 0 ? "+" : ""}${delta}; job security now ${security}.\n\nSet the tone for next season.`,
    category: "Team",
    priority: "important",
    source: "Ownership",
    decision: "seasonReview",
    route: "Boardroom",
    data: {
      kind: "targets",
      title: `${s.year} season review`,
      lead: `${club.owner.name} has reviewed the ${s.year} season against the expectations set in preseason.`,
      verdict: `Expectations ${band.toLowerCase()}`,
      facts: [
        { label: "Record", value: `${r.pulse.w}–${r.pulse.l}` },
        { label: "Win target", value: String(r.minWins) },
        { label: "Owner patience", value: `${delta >= 0 ? "+" : ""}${delta}` },
        { label: "Job security", value: `${security}%` },
      ],
      items: r.items.map((x) => ({ label: x.label, required: x.required, progress: x.progress, state: x.state === "done" || x.state === "on" ? "done" : "missed" })),
      note: "Set the tone for next season.",
    },
  });
  logMeeting(s, { kind: "Review", title: `${s.year} season review: ${band}`, agreed: null, outcome: band, detail: `${r.pulse.w}–${r.pulse.l} vs ${r.minWins} wins. Patience ${delta >= 0 ? "+" : ""}${delta}.`, messageId: m?.id });
  if (band === "Missed" && security < MEETING_RULES.finalWarning) finalWarning(s, security);
  return band;
}

/* ------------------------------------------------------------ weekly hook */
export function underperformance(s, p = boardPulse(s)) {
  const R = MEETING_RULES,
    board = [],
    team = [];
  if (p.played < R.minGames) return { board, team };
  if (p.paceGap <= R.paceGap) board.push(`on pace for ${p.pace.toFixed(1)} wins, ${(-p.paceGap).toFixed(1)} short of the target`);
  if (p.streak >= R.losingStreak) board.push(`${p.streak} straight losses`);
  if (p.security < R.security) board.push(`job security down to ${p.security}`);
  if (board.length && p.pointDiff < 0) board.push(`a ${p.pointDiff} point differential`);
  if (p.streak >= R.losingStreak) team.push(`${p.streak} straight losses`);
  // Players call a meeting over losing, not over missing the owner's target while winning.
  if (p.paceGap <= R.paceGap && p.w <= p.l) team.push("the season is slipping away from the target");
  if (p.w <= p.l && p.morale < R.teamMorale) team.push(`team morale has fallen to ${p.morale}%`);
  if (p.w <= p.l && p.drama >= R.teamDrama) team.push(`drama around the team is at ${p.drama}`);
  return { board, team };
}

export function processBoardRound(s, info) {
  if (!s.franchise?.clubs?.[s.team] || !s.franchise.calendar || !Array.isArray(s.roster)) return;
  const e = ensureExpectations(s);
  if (e.rounds.includes(info.key)) return;
  e.rounds.push(info.key);
  e.rounds = e.rounds.slice(-60);
  if (s.phase === "offseason" && info.phase === "playoffs") {
    seasonReview(s);
    return;
  }
  if (info.phase !== "season") return;
  ensureSeasonExpectations(s);
  const settled = evaluatePlan(s);
  if (s.phase !== "season") return;
  const p = boardPulse(s),
    why = underperformance(s, p),
    activePlan = e.plan && e.plan.status === "active" && e.plan.year === s.year;
  if (why.board.length && !settled && !activePlan && !pendingOf(s, "boardMeeting") && cooled(e, "board", s, MEETING_RULES.boardCooldown))
    callBoardMeeting(s, p, why.board);
  if (why.team.length && !pendingOf(s, "teamMeeting") && cooled(e, "team", s, MEETING_RULES.teamCooldown))
    callTeamMeeting(s, p, why.team);
}

// New season: forget last year's plan and publish fresh expectations.
export function startSeasonExpectations(s) {
  const e = ensureExpectations(s);
  if (e.plan && e.plan.year !== s.year) e.plan = null;
  return ensureSeasonExpectations(s);
}
