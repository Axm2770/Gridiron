// Depth systems: locker-room dilemmas, press-conference questions, the coaching tree and the
// game-day strategy deck. DOM-free; callers wrap mutations in state.transact.
import { random } from "../engine/random.mjs";
import { hash, changeCoachReputation } from "./career-systems.mjs";
import { applyMood } from "./newsroom.mjs";
import { ensureSocial, reactTo, socialPulse } from "./social-engine.mjs";
import { ensureEventLog } from "./event-bus.mjs";

const clamp = (n, a = 0, b = 100) => Math.max(a, Math.min(b, n));

export function ensureDepth(s) {
  const f = s.franchise;
  if (!f) return null;
  f.depth ??= { version: 1, dilemmas: [], pressers: [], tree: { unlocked: [], spent: 0 }, halftime: [], seen: [] };
  const d = f.depth;
  for (const k of ["dilemmas", "pressers", "halftime", "seen"]) if (!Array.isArray(d[k])) d[k] = [];
  d.tree ??= { unlocked: [], spent: 0 };
  return d;
}

/* ----------------------------------------------------------- coaching tree */

export const COACHING_TREE = [
  { id: "film-room", branch: "Strategy", name: "Film Room Regular", cost: 1, requires: [], effect: "One extra halftime adjustment card." },
  { id: "halftime-whisperer", branch: "Strategy", name: "Halftime Whisperer", cost: 2, requires: ["film-room"], effect: "See every eligible halftime card instead of a hand." },
  { id: "situational-master", branch: "Strategy", name: "Situational Master", cost: 3, requires: ["halftime-whisperer"], effect: "Unlocks the Two-Minute Script card." },
  { id: "players-coach", branch: "Culture", name: "Players' Coach", cost: 1, requires: [], effect: "Dilemma choices give +1 additional morale." },
  { id: "culture-builder", branch: "Culture", name: "Culture Builder", cost: 2, requires: ["players-coach"], effect: "Chemistry decays 50% slower under drama." },
  { id: "media-savvy", branch: "Media", name: "Media Savvy", cost: 1, requires: [], effect: "Press-conference answers generate 40% less drama." },
  { id: "narrative-control", branch: "Media", name: "Narrative Control", cost: 2, requires: ["media-savvy"], effect: "A confident answer after a win lifts fan score." },
  { id: "road-warrior", branch: "Game day", name: "Road Warrior", cost: 2, requires: [], effect: "Hostile crowd noise impact reduced by half." },
];

export function treePoints(s) {
  const d = ensureDepth(s),
    xp = s.franchise.career?.xp ?? 0;
  // Career XP grows 25 per settled round, so a point roughly every four games.
  return Math.max(0, Math.floor(xp / 100) - d.tree.spent);
}

export const hasPerk = (s, id) => ensureDepth(s)?.tree.unlocked.includes(id) ?? false;

export function unlockNode(s, id) {
  const d = ensureDepth(s),
    node = COACHING_TREE.find((n) => n.id === id);
  if (!node) throw Error("Unknown coaching skill.");
  if (d.tree.unlocked.includes(id)) throw Error("Already unlocked.");
  const missing = node.requires.filter((r) => !d.tree.unlocked.includes(r));
  if (missing.length) throw Error("Unlock the earlier skills in this branch first.");
  if (treePoints(s) < node.cost) throw Error(`Requires ${node.cost} coaching points.`);
  d.tree.unlocked.push(id);
  d.tree.spent += node.cost;
  return node;
}

/* -------------------------------------------------------- locker room dilemmas */

// Each dilemma declares when it can fire and what each response changes. Effects use the
// existing mood ledger and the social engine so consequences stay visible and auditable.
export const DILEMMAS = [
  {
    id: "touches",
    title: "The star wants the ball",
    when: (s, ctx) => ctx.lastResult?.margin < 0 && ctx.star,
    body: (c) => `${c.star.name} says he was "invisible" in the loss and wants a bigger role. Teammates are watching how you respond.`,
    choices: [
      { id: "promise", label: "Promise more touches", effect: { player: 4, team: -1, drama: -4, sentiment: 0.1 } },
      { id: "team-first", label: "Team-first, in private", effect: { player: -2, team: 2, drama: 2, sentiment: -0.05 } },
      { id: "public", label: "Shut it down publicly", effect: { player: -6, team: 1, drama: 12, rep: -1, sentiment: -0.4 } },
    ],
  },
  {
    id: "rookie-hazing",
    title: "A veteran crossed the line",
    when: (s, ctx) => ctx.rookie && ctx.veteran,
    body: (c) => `A rookie-dinner prank by ${c.veteran.name} went too far and ${c.rookie.name} skipped a meeting. The story is starting to leak.`,
    choices: [
      { id: "fine", label: "Fine the veteran", effect: { player: -3, team: 1, drama: -3, sentiment: 0.15 } },
      { id: "mediate", label: "Mediate between them", effect: { team: 2, drama: -1, sentiment: 0.05 } },
      { id: "ignore", label: "Let the room sort it out", effect: { team: -2, drama: 8, sentiment: -0.3 } },
    ],
  },
  {
    id: "media-leak",
    title: "Someone is leaking to the media",
    when: (s, ctx) => ctx.pulse.drama >= 40,
    body: () => "Practice details are showing up on the national insider's feed within hours. The locker room suspects a teammate.",
    choices: [
      { id: "lock-down", label: "Lock down the building", effect: { team: -1, drama: -10, sentiment: 0 } },
      { id: "address", label: "Address the team directly", effect: { team: 2, drama: -5, rep: 0.5, sentiment: 0.1 } },
      { id: "counter", label: "Feed a false story", effect: { team: 1, drama: 6, rep: -0.5, sentiment: -0.1 } },
    ],
  },
  {
    id: "streak-celebration",
    title: "The room wants a night off",
    when: (s, ctx) => (ctx.streak ?? 0) >= 3,
    body: (c) => `${c.absStreak} straight wins. Captains ask to cancel Monday film for a team outing.`,
    choices: [
      { id: "reward", label: "Reward them", effect: { team: 3, drama: 0, sentiment: 0.2 } },
      { id: "grind", label: "Stay on the grind", effect: { team: -1, drama: 0, rep: 0.5, sentiment: 0 } },
    ],
  },
];

function dilemmaContext(s) {
  const log = ensureEventLog(s),
    results = log.events.filter((e) => e.kind === "GameResult"),
    roster = (s.roster || []).filter((p) => !p.injury),
    star = roster.slice().sort((a, b) => (b.ovr ?? 0) - (a.ovr ?? 0))[0];
  return {
    lastResult: results[0],
    streak: log.streak ?? 0,
    absStreak: Math.abs(log.streak ?? 0),
    star,
    rookie: roster.find((p) => (p.age ?? 30) <= 22),
    veteran: roster.find((p) => (p.age ?? 0) >= 31),
    pulse: socialPulse(s),
  };
}

export function activeDilemma(s) {
  return ensureDepth(s)?.dilemmas.find((d) => d.status === "open") ?? null;
}

// Opens at most one dilemma per round, deterministically seeded by the round.
export function maybeOpenDilemma(s, roundKey) {
  const d = ensureDepth(s);
  if (!d || activeDilemma(s) || d.seen.includes(`round:${roundKey}`)) return null;
  d.seen.push(`round:${roundKey}`);
  d.seen = d.seen.slice(-400);
  const rng = random(hash(`dilemma:${roundKey}:${s.team}`));
  if (rng() > 0.45) return null;
  const ctx = dilemmaContext(s),
    eligible = DILEMMAS.filter((x) => x.when(s, ctx) && !d.dilemmas.some((y) => y.kind === x.id && y.year === s.year));
  if (!eligible.length) return null;
  const def = eligible[Math.floor(rng() * eligible.length)];
  const entry = {
    id: `dilemma-${def.id}-${roundKey}`,
    kind: def.id,
    title: def.title,
    body: def.body(ctx),
    playerId: (def.id === "rookie-hazing" ? ctx.veteran : ctx.star)?.id,
    year: s.year,
    week: s.week,
    status: "open",
    choices: def.choices.map(({ id, label }) => ({ id, label })),
  };
  d.dilemmas.unshift(entry);
  d.dilemmas = d.dilemmas.slice(0, 40);
  return entry;
}

export function resolveDilemma(s, id, choiceId) {
  const d = ensureDepth(s),
    entry = d.dilemmas.find((x) => x.id === id);
  if (!entry || entry.status !== "open") throw Error("This situation has already been handled.");
  const def = DILEMMAS.find((x) => x.id === entry.kind),
    choice = def?.choices.find((c) => c.id === choiceId);
  if (!choice) throw Error("Choose one of the available responses.");
  const fx = choice.effect,
    bonus = hasPerk(s, "players-coach") ? 1 : 0;
  if (fx.player && entry.playerId)
    applyMood(s, { playerId: entry.playerId, delta: fx.player + bonus, trust: Math.sign(fx.player) * 3, reason: `${entry.title}: ${choice.label}`, sourceId: entry.id });
  if (fx.team) applyMood(s, { teamDelta: fx.team + bonus, reason: `${entry.title}: ${choice.label}`, sourceId: entry.id + ":team", spillover: false });
  if (fx.rep) changeCoachReputation(s, `dilemma:${entry.id}`, fx.rep, `handling "${entry.title}"`, "Leadership");
  const pulse = ensureSocial(s).pulse;
  pulse.drama = clamp(pulse.drama + (fx.drama || 0));
  pulse.chemistry = clamp(pulse.chemistry + (fx.team || 0) * 1.5);
  entry.status = "resolved";
  entry.choice = choiceId;
  entry.outcome = choice.label;
  reactTo(s, `dilemma:${entry.id}`, {
    kind: "LockerRoomDilemma",
    headline: `${entry.title.toLowerCase()} — ${choice.label.toLowerCase()}`,
    sentiment: fx.sentiment ?? 0,
    playerId: entry.playerId,
    tags: [fx.drama > 5 ? "controversial" : "handled"],
  });
  return entry;
}

/* ------------------------------------------------------------ press conference */

const ANSWERS = {
  confident: { label: "Confident", quote: { win: "We expected this. This team is built to win.", loss: "One game doesn't define us. We'll be fine.", other: "We know who we are." }, drama: 4, fan: 1.5, tone: "pos" },
  accountable: { label: "Accountable", quote: { win: "Good win, but there's plenty for me to clean up.", loss: "That's on me. I have to put them in better spots.", other: "I own the decisions in this building." }, drama: -3, fan: 0.5, tone: "neu" },
  deflect: { label: "Deflect", quote: { win: "Ask me about the next opponent.", loss: "I'm not getting into that today.", other: "That's an internal matter." }, drama: 6, fan: -1, tone: "neg" },
};

export function pressConference(s) {
  const last = ensureEventLog(s).events.find((e) => ["GameResult", "Injury", "Trade", "Holdout"].includes(e.kind));
  if (!last) return null;
  const opp = Number.isInteger(last.opponent) ? s.franchise.clubs?.[last.opponent]?.identity?.name || globalThis.clubs?.[last.opponent]?.[2] : null;
  const question =
    last.kind === "GameResult"
      ? last.margin > 0
        ? `Coach, ${last.tags.includes("blowout") ? "a statement win" : "a big win"}${opp ? ` over ${opp}` : ""}. Is this team a contender?`
        : `Coach, ${last.tags.includes("blowout") ? "that was a blowout" : "a tough loss"}. Is your job safe?`
      : last.kind === "Injury"
        ? `How does losing ${last.playerName} change your plans?`
        : last.kind === "Holdout"
          ? `Where do things stand with ${last.playerName || "your holdout"}?`
          : `Can you walk us through the decision${last.headline ? `: "${last.headline}"` : ""}?`;
  return {
    id: `presser-${last.id}`,
    eventId: last.id,
    question,
    context: last.kind === "GameResult" ? (last.margin > 0 ? "win" : "loss") : "other",
    answers: Object.entries(ANSWERS).map(([id, a]) => ({ id, label: a.label })),
  };
}

export function answerPress(s, presserId, answerId) {
  const d = ensureDepth(s),
    p = pressConference(s),
    a = ANSWERS[answerId];
  if (!p || p.id !== presserId || d.pressers.some((x) => x.id === presserId)) throw Error("This press conference has ended.");
  if (!a) throw Error("Choose an answer.");
  const quote = a.quote[p.context],
    pulse = ensureSocial(s).pulse,
    savvy = hasPerk(s, "media-savvy") ? 0.6 : 1;
  pulse.drama = clamp(pulse.drama + a.drama * savvy);
  if (answerId === "confident" && p.context === "win" && hasPerk(s, "narrative-control")) pulse.fanScore = clamp(pulse.fanScore + 2);
  d.pressers.unshift({ id: presserId, answer: answerId, quote, year: s.year, week: s.week });
  d.pressers = d.pressers.slice(0, 40);
  reactTo(s, presserId, { kind: "PressConference", quote, tone: a.tone, tags: [answerId] });
  return { quote };
}

/* ------------------------------------------------------- game-day strategy deck */

// Momentum is presentation and decision support only: it never alters execution outcomes.
export function momentum(live, labels = []) {
  if (!live?.events?.length) return 0;
  const [home, away] = labels;
  let m = 0;
  live.events.slice(0, 10).forEach((e, i) => {
    const w = 1 - i * 0.08,
      side = home && e.text.startsWith(home) ? 1 : away && e.text.startsWith(away) ? -1 : 0;
    if (!side) return;
    const value = /TOUCHDOWN/.test(e.text) ? 22 : /INTERCEPTED|Turnover on downs|SAFETY/.test(e.text) ? -20 : /sacked/.test(e.text) ? -9 : /field goal!/.test(e.text) ? 9 : /First down/.test(e.text) ? 5 : /incomplete|miss/.test(e.text) ? -3 : 1;
    m += side * value * w;
  });
  return Math.round(clamp(m, -100, 100));
}

// Weather and crowd context for the game-day header. Noise rises with home fan sentiment.
export function environment(s, live) {
  const home = live?.a === s.team,
    pulse = socialPulse(s),
    crowd = clamp(Math.round(home ? 60 + pulse.fanScore * 0.35 : 70 + ((s.year * 31 + (live?.a ?? 0)) % 25)), 40, 100),
    noise = home ? 0 : Math.round((crowd - 60) / 8) * (hasPerk(s, "road-warrior") ? 0.5 : 1);
  return {
    weather: live?.weather || "Clear",
    crowd,
    hostile: !home && crowd >= 80,
    // Communication penalty is advisory: it recommends silent counts/quick game rather than changing the dice.
    communication: noise >= 3 ? "Silent count recommended" : noise >= 1 ? "Elevated noise" : "Normal",
    windAdvice: live?.weather === "Wind" ? "Favor short passing and the run" : live?.weather === "Rain" ? "Ball security and inside runs" : null,
  };
}

const CARDS = [
  { id: "max-protect", name: "Max Protect", desc: "12 personnel, keep a TE in to block.", when: (c) => c.sacks >= 2, apply: { personnel: "12" } },
  { id: "spread-out", name: "Spread Them Out", desc: "10 personnel to stress the coverage.", when: (c) => c.passYards < 90, apply: { personnel: "10" } },
  { id: "heavy-run", name: "Lean on the Run", desc: "21 personnel and chew clock with a lead.", when: (c) => c.lead >= 7, apply: { personnel: "21", tempo: "Chew clock" } },
  { id: "tempo", name: "Hurry-Up Tempo", desc: "Go fast to steal possessions.", when: (c) => c.lead <= -7, apply: { tempo: "Hurry-up" } },
  { id: "disguise", name: "Disguise the Shell", desc: "Show single-high, rotate late.", when: (c) => c.allowed >= 14, apply: { shell: "Single-High" } },
  { id: "two-high", name: "Keep Everything in Front", desc: "Two-high safeties to stop the big play.", when: (c) => c.lead >= 10, apply: { shell: "2-High" } },
  { id: "two-minute", name: "Two-Minute Script", desc: "Hurry-up with 10 personnel.", perk: "situational-master", when: () => true, apply: { tempo: "Hurry-up", personnel: "10" } },
];

export function halftimeDeck(s, live) {
  if (!live) return [];
  const side = live.a === s.team ? 0 : 1,
    st = live.stats?.[side] || {},
    c = { lead: live.score[side] - live.score[1 - side], allowed: live.score[1 - side], passYards: st.pass ?? 0, sacks: (live.events || []).filter((e) => /sacked/.test(e.text)).length };
  const size = hasPerk(s, "halftime-whisperer") ? CARDS.length : 3 + (hasPerk(s, "film-room") ? 1 : 0);
  return CARDS.filter((x) => (!x.perk || hasPerk(s, x.perk)) && x.when(c)).concat(CARDS.filter((x) => !x.perk && !x.when(c))).slice(0, size);
}

// Applies a card through the existing match settings only, so live and fast paths stay identical.
export function playHalftimeCard(s, cardId) {
  const live = s.live,
    card = CARDS.find((c) => c.id === cardId);
  if (!live?.halftime) throw Error("Adjustments are made at halftime.");
  if (!card || !halftimeDeck(s, live).some((c) => c.id === cardId)) throw Error("That adjustment is not available.");
  const d = ensureDepth(s),
    key = `${s.year}:${s.week}:${live.a}:${live.b}`;
  if (d.halftime.some((h) => h.key === key)) throw Error("You've already made your halftime adjustment.");
  Object.assign(live, card.apply);
  d.halftime.unshift({ key, card: cardId, year: s.year, week: s.week });
  d.halftime = d.halftime.slice(0, 40);
  return card;
}

export function processDepthRound(s, roundKey) {
  return maybeOpenDilemma(s, roundKey);
}
