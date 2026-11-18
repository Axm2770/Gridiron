// Press conferences with consequences. DOM-free and deterministic.
// A pregame or postgame presser is two questions: a general one answered in a tone
// (humble / confident / defiant / deflect) and, when there is a story, a question about one
// named player (back him, call him out, promise snaps...). The answers move team morale,
// chemistry, drama, fans, the owner's patience, media trust and the named player's morale and
// trust; captains and position-mates react. Context matters: a win or a loss, a losing streak,
// a rivalry and earlier bold claims change the size of every effect.
// Everything is applied once per conversation key (state.franchise.pressRoom.applied).
import { applyMood, postMessage } from "./newsroom.mjs";
import { ensureSocial } from "./social-engine.mjs";
import { changeCoachReputation, dialogueConsequences } from "./career-systems.mjs";

const clamp = (n, a = 0, b = 100) => Math.max(a, Math.min(b, n));
const lastName = (name = "") => String(name).trim().split(/\s+/).filter((w) => !/^(jr\.?|sr\.?|ii|iii|iv)$/i.test(w)).at(-1) || name;
const leaderScore = (p) => (p.persona?.leadership ?? 0.5) + (p.age || 25) / 50;
const ambitious = (p) => (p.persona?.ambition ?? 0.5) >= 0.65;

export function ensurePressRoom(s) {
  const f = s.franchise;
  f.pressRoom ??= { version: 1, applied: [], entries: [], claims: [], credibility: 60 };
  const r = f.pressRoom;
  for (const k of ["applied", "entries", "claims"]) if (!Array.isArray(r[k])) r[k] = [];
  r.credibility = Number.isFinite(r.credibility) ? r.credibility : 60;
  return r;
}

/* ---------------------------------------------------------------- context */

const division = (t) => globalThis.clubs?.[t]?.[3];
function recentResults(s) {
  const out = [];
  for (let w = Math.min(s.week, s.schedule?.length || 0) - 1; w >= 0 && out.length < 5; w--) {
    const g = s.schedule[w]?.find((g) => (g.a === s.team || g.b === s.team) && g.score);
    if (!g) continue;
    const k = g.a === s.team ? 0 : 1;
    out.push(g.score[k] > g.score[1 - k] ? "W" : g.score[k] < g.score[1 - k] ? "L" : "T");
  }
  return out;
}

// What the room and the media are reacting to right now.
export function pressContext(s, type = "post") {
  const m = type === "pre" ? s.live : s.lastMatch,
    k = m ? (m.a === s.team ? 0 : 1) : 0,
    opponent = m ? (k === 0 ? m.b : m.a) : null,
    results = recentResults(s);
  let result = "pre";
  if (type !== "pre" && m?.score) result = m.score[k] > m.score[1 - k] ? "win" : m.score[k] < m.score[1 - k] ? "loss" : "tie";
  // A postgame presser runs after the week is settled, so the schedule already holds this game;
  // fall back to the match itself when it does not.
  const letter = result === "win" ? "W" : result === "loss" ? "L" : "T",
    recorded = s.schedule?.[s.week - 1]?.some((g) => g.a === m?.a && g.b === m?.b && g.score),
    seq = type !== "pre" && m?.score && !recorded ? [letter, ...results] : results;
  let losing = 0,
    winning = 0;
  for (const r of seq) if (r === "L" && !winning) losing++; else break;
  for (const r of seq) if (r === "W" && !losing) winning++; else break;
  const rivalry = Number.isInteger(opponent) && !!division(s.team) && division(s.team) === division(opponent);
  return {
    type,
    result,
    opponent,
    rivalry,
    losingStreak: losing,
    winningStreak: winning,
    turnovers: type !== "pre" ? (m?.stats?.[k]?.turnovers ?? 0) : 0,
  };
}

/* ----------------------------------------------------------------- tones */

export const PRESS_TONES = {
  humble: { label: "Humble", lossLabel: "Accountable" },
  confident: { label: "Confident" },
  defiant: { label: "Defiant" },
  deflect: { label: "Deflect" },
};

// Base effects of the first answer: [team morale, chemistry, drama, fans, owner, media trust].
const TONE_FX = {
  pre: { humble: [1, 1, -2, 1, 1, 2], confident: [3, 0, 3, 2, 0, 0], defiant: [2, 2, 4, 1, -1, -2], deflect: [0, 0, 2, -1, 0, -3] },
  win: { humble: [2, 3, -3, 2, 1, 2], confident: [3, 1, 2, 4, 1, 1], defiant: [1, 0, 4, 1, 0, -3], deflect: [0, 0, 2, -1, 0, -3] },
  loss: { humble: [2, 2, -3, 1, 2, 3], confident: [1, 0, 3, -2, -1, -1], defiant: [2, 1, 6, -1, -2, -4], deflect: [-1, -1, 4, -3, -2, -4] },
};
const FX_KEYS = ["team", "chemistry", "drama", "fans", "owner", "media"];

export function toneEffects(tone, ctx) {
  const table = TONE_FX[ctx.result === "win" ? "win" : ctx.result === "loss" ? "loss" : "pre"],
    fx = Object.fromEntries(FX_KEYS.map((k, i) => [k, (table[tone] || table.humble)[i]]));
  const notes = [];
  // A losing streak makes fans and the owner less forgiving.
  if (ctx.losingStreak >= 2) {
    for (const k of ["fans", "owner"]) if (fx[k] < 0) fx[k] = Math.round(fx[k] * 1.5);
    if (tone === "defiant") fx.chemistry += 1;
    notes.push(`${ctx.losingStreak}-game losing streak: fans and owner less forgiving`);
  }
  // Rivalry week: everything said travels further.
  if (ctx.rivalry) {
    fx.fans = Math.round(fx.fans * 1.5);
    if (tone === "confident" || tone === "defiant") fx.drama += 2;
    notes.push("Rivalry week: every word travels further");
  }
  if (ctx.winningStreak >= 3 && tone === "humble") fx.chemistry += 1;
  return { fx, notes };
}

/* --------------------------------------------------------- player topics */

const TOPIC_OPTIONS = {
  struggle: (n) => [
    { id: "back", tone: "Back him", text: `${n} is our guy. I'm not worried about him.` },
    { id: "blame", tone: "Call him out", text: `${n} has to be better. Everybody saw it.` },
    { id: "compete", tone: "Open the job", text: "Every job is open this week. We'll see who earns it." },
  ],
  star: (n) => [
    { id: "praise", tone: "Praise him", text: `${n} was outstanding. He sets the standard here.` },
    { id: "team", tone: "Share the credit", text: "Nobody does it alone. That was all eleven, every snap." },
    { id: "grounded", tone: "Keep him grounded", text: "He can play better, and he knows it." },
  ],
  injury: (n) => [
    { id: "support", tone: "Back him", text: `We're behind ${n} every step. He'll come back stronger.` },
    { id: "nextman", tone: "Next man up", text: "Next man up. We don't make excuses in this building." },
    { id: "pressure", tone: "Push him", text: `We need ${n} back on the field as soon as possible.` },
  ],
  contract: (n) => [
    { id: "commit", tone: "Back him", text: `${n} is part of our future. We'll get it done.` },
    { id: "business", tone: "Keep it private", text: "That's between his agent and the front office." },
    { id: "callout", tone: "Call him out", text: "Nobody is bigger than this team." },
  ],
  snaps: (n) => [
    { id: "promise", tone: "Promise snaps", text: `Yes. ${n} will get more snaps. You'll see it.` },
    { id: "earn", tone: "Earn it", text: "He'll get them when he earns them in practice." },
    { id: "private", tone: "Deflect", text: "The depth chart is an internal matter." },
  ],
  room: () => [
    { id: "unite", tone: "Unite", text: "We win together and we lose together. That doesn't change." },
    { id: "demand", tone: "Demand more", text: "The standard is higher than that. Everyone has to be better." },
    { id: "focus", tone: "Stay focused", text: "Next week is all that matters now." },
  ],
};

// [player morale, player trust, captains, chemistry, drama, fans, owner, media]
const OPTION_FX = {
  back: [6, 6, 1, 1, -1, 0, 0, 1],
  blame: [-8, -8, -2, -4, 8, 1, 0, 1],
  compete: [-4, -3, 0, -1, 3, 1, 1, 0],
  praise: [5, 3, 0, 0, 0, 1, 0, 1],
  team: [1, 1, 1, 3, -1, 0, 0, 1],
  grounded: [-3, -1, 0, 0, 1, 0, 1, 0],
  support: [6, 6, 1, 1, -1, 1, 0, 1],
  nextman: [-2, -3, 0, 0, 0, 0, 1, 0],
  pressure: [-6, -8, -1, -2, 4, -1, 0, -1],
  commit: [6, 5, 0, 1, -2, 2, -1, 0],
  business: [-1, 0, 0, 0, -1, 0, 1, 0],
  callout: [-8, -8, -1, -3, 8, 1, 2, 0],
  promise: [7, 5, 0, -1, 2, 0, 0, 1],
  earn: [-2, 1, 0, 1, 0, 0, 1, 0],
  private: [-3, -3, 0, 0, 1, 0, 0, -1],
  unite: [0, 0, 1, 2, -1, 0, 0, 1],
  demand: [0, 0, 0, -1, 2, 1, 1, 0],
  focus: [0, 0, 0, 0, 0, 0, 0, 1],
};
const PUBLIC_CRITICISM = new Set(["blame", "callout", "pressure"]);

const starters = (s) => s.roster.filter((p) => p.starter && !p.injury);
const pickBy = (list, score) => list.slice().sort((a, b) => score(b) - score(a) || String(a.id).localeCompare(String(b.id)))[0];

// The player the media asks about, or a "room" question when there is no story.
export function pressTopic(s, type, ctx = pressContext(s, type)) {
  const roster = s.roster || [],
    fin = s.franchise?.contracts || {},
    year = s.franchise?.financeYear ?? s.year;
  const injured = pickBy(roster.filter((p) => p.injury > 0 && p.ovr >= 70), (p) => p.ovr);
  const contract = pickBy(
    roster.filter((p) => p.holdout || p.tradeDemand || (p.ovr >= 80 && fin[p.id] && !fin[p.id].ended && fin[p.id].start + fin[p.id].years - 1 <= year)),
    (p) => (p.holdout ? 200 : p.tradeDemand ? 150 : 0) + p.ovr,
  );
  const startersByPos = {};
  for (const p of starters(s)) (startersByPos[p.pos] ??= []).push(p.ovr);
  const benchPush = pickBy(
    roster.filter((p) => !p.starter && !p.injury && startersByPos[p.pos]?.length && (p.ovr >= Math.min(...startersByPos[p.pos]) - 2 || (ambitious(p) && p.ovr >= 65))),
    (p) => p.ovr + (ambitious(p) ? 5 : 0),
  );
  const qb = starters(s).find((p) => p.pos === "QB");
  const make = (kind, p, question) => ({ kind, playerId: p?.id || null, name: p?.name || null, question, options: TOPIC_OPTIONS[kind](p ? lastName(p.name) : "") });
  if (type === "post" && ctx.result === "loss") {
    const p = ctx.turnovers >= 2 && qb ? qb : pickBy(starters(s).filter((p) => p.ovr >= 70), (p) => -(p.morale ?? 75) * 2 + p.ovr / 4);
    if (p) return make("struggle", p, `${p.name}${ctx.turnovers >= 2 && p === qb ? ` and the offence turned it over ${ctx.turnovers} times` : " had a rough afternoon"}. Is he still your guy?`);
  }
  if (type === "post" && ctx.result === "win") {
    const p = pickBy(starters(s), (p) => p.ovr + ((p.morale ?? 75) >= 70 ? 2 : 0));
    if (p) return make("star", p, `${p.name} was everywhere today. What does he mean to this team?`);
  }
  if (injured) return make("injury", injured, `How big a blow is losing ${injured.name}?`);
  if (contract) return make("contract", contract, `Where do things stand with ${contract.name}${contract.holdout ? "'s holdout" : contract.tradeDemand ? "'s trade request" : "'s contract"}?`);
  if (benchPush) return make("snaps", benchPush, `${benchPush.name} has been pushing for more snaps. Will he get them?`);
  return make("room", null, "And what is your message to the players listening?");
}

/* ------------------------------------------------------- conversation copy */

export function pressQuestion(s, type, ctx = pressContext(s, type)) {
  const opp = Number.isInteger(ctx.opponent) ? globalThis.clubs?.[ctx.opponent]?.[2] : null;
  if (type === "pre") {
    if (ctx.rivalry && opp) return `It's ${opp} week. What should supporters expect against your rivals?`;
    if (ctx.losingStreak >= 2) return `${ctx.losingStreak} straight losses. How do you turn this around today?`;
    if (ctx.winningStreak >= 3) return `${ctx.winningStreak} wins in a row. Is this team a contender?`;
    return "Coach, what should supporters expect from your team today?";
  }
  if (ctx.result === "win") return ctx.rivalry && opp ? `A win over ${opp}. What does beating a rival mean?` : "Your team found a way to win. What made the difference?";
  if (ctx.result === "loss") return ctx.losingStreak >= 3 ? `That's ${ctx.losingStreak} losses in a row. Is your job safe?` : "A difficult result today. Where do you take responsibility?";
  return "A tie. How do you feel walking out of here?";
}

export function pressAnswers(type, ctx) {
  const lost = ctx.result === "loss",
    won = ctx.result === "win";
  const q = {
    humble: type === "pre" ? "We trust our preparation and each other." : won ? "The players earned this. They executed together." : lost ? "That starts with me. We will learn and improve." : "We'll take the lessons and move on.",
    confident: type === "pre" ? "We are here to make a statement." : won ? "We expected this. This team is built to win it all." : "One game doesn't define us. We're still contenders.",
    defiant: type === "pre" ? "Nobody outside this building believes in us. Good." : won ? "People doubted us all week. They can keep talking." : "I don't care what anyone outside this room thinks.",
    deflect: type === "pre" ? "We will let our performance do the talking." : "We'll review the film before drawing conclusions.",
  };
  return Object.entries(q).map(([tone, text]) => ({ tone: tone === "humble" && lost ? PRESS_TONES.humble.lossLabel : PRESS_TONES[tone].label, key: tone, text }));
}

export const toneReaction = {
  humble: "Heads nod around the room. A calm, credible answer.",
  confident: "Pens scribble. That line will be on the back pages tomorrow.",
  defiant: "A murmur in the room. The headline writes itself.",
  deflect: "A few reporters exchange looks. They wanted more.",
};

/* ----------------------------------------------------------------- outcome */

function snapshot(s, playerId) {
  const club = s.franchise.clubs[s.team],
    pulse = ensureSocial(s).pulse,
    p = s.roster.find((x) => x.id === playerId);
  return {
    morale: s.morale ?? 75,
    chemistry: pulse.chemistry,
    drama: pulse.drama,
    fans: club.fanApproval ?? 60,
    owner: club.owner?.patience ?? 60,
    media: s.mediaTrust ?? 50,
    credibility: ensurePressRoom(s).credibility,
    playerMorale: p?.morale ?? 0,
    playerTrust: p?.coachTrust ?? 60,
  };
}


// Applies the two answers once. Returns the summary shown on the outcome card.
export function applyPressConference(s, c) {
  const room = ensurePressRoom(s);
  // Keyed by the conversation instance: one application per presser, however often it renders.
  const id = c.press?.id || c.key,
    done = room.entries.find((e) => (e.id || e.key) === id);
  if (done || room.applied.includes(id)) return done || null;
  room.applied.push(id);
  room.serial = (room.serial || 0) + 1;
  room.applied = room.applied.slice(-200);
  const ctx = c.press?.context || pressContext(s, c.type),
    tone = c.choicesMade[0]?.key || "humble",
    follow = c.press?.topic?.options?.[c.choicesMade[1]?.index ?? 0] || null,
    topic = c.press?.topic || null,
    player = topic?.playerId ? s.roster.find((p) => p.id === topic.playerId) : null,
    before = snapshot(s, player?.id),
    reason = `Press conference: ${c.choicesMade[0]?.text || ""}`.slice(0, 120),
    savvy = (s.franchise.depth?.tree?.unlocked || []).includes("media-savvy") ? 0.6 : 1;
  const { fx, notes } = toneEffects(tone, ctx),
    events = [];
  // Follow-up answer about a named player (or the room).
  const o = follow ? OPTION_FX[follow.id] || [0, 0, 0, 0, 0, 0, 0, 0] : [0, 0, 0, 0, 0, 0, 0, 0];
  let [pm, pt, captains, chem2, drama2, fans2, owner2, media2] = o;
  if (player) {
    const loyalty = player.persona?.loyalty ?? 0.5;
    if (follow.id === "blame" || follow.id === "callout") {
      // Ambitious players take it as fuel; loyal ones take it personally.
      if (ambitious(player)) pm = Math.round(pm / 2);
      pt -= Math.round(loyalty * 3);
      if (ctx.result === "loss") drama2 = Math.round(drama2 * 1.25);
      if (ctx.result === "win") fans2 -= 2;
    }
    if (follow.id === "grounded" && ambitious(player)) pm = 2;
    if (follow.id === "team" && ambitious(player)) pm = -1;
    if (follow.id === "earn" && ambitious(player)) pm = 2;
    if (follow.id === "back" && ctx.result === "loss" && ctx.losingStreak >= 2) fans2 -= 1;
  }
  fx.chemistry += chem2;
  fx.drama += drama2;
  fx.fans += fans2;
  fx.owner += owner2;
  fx.media += media2;
  if (follow && !player) fx.team += follow.id === "unite" ? 1 : follow.id === "demand" ? (ctx.result === "loss" ? 0 : -1) : 0;
  // Credibility: bold claims are remembered and checked against results.
  const recentClaim = room.claims.find((x) => !x.tested && x.year === s.year && s.week - x.week <= 1 && x.key !== id);
  if (c.type === "post" && recentClaim) {
    recentClaim.tested = true;
    if (ctx.result === "loss") {
      recentClaim.broken = true;
      fx.media -= 4;
      fx.fans -= 3;
      fx.owner -= 2;
      room.credibility = clamp(room.credibility - 12);
      notes.push(`Credibility hit: "${recentClaim.text}" and then a loss`);
      events.push({ kind: "credibility", text: recentClaim.text });
      changeCoachReputation(s, `press-claim:${recentClaim.key}`, -0.6, "Bold words before a loss", "Media");
    } else if (ctx.result === "win") {
      room.credibility = clamp(room.credibility + 4);
      fx.fans += 1;
      notes.push("Your bold claim was backed up on the field");
    }
  }
  if (tone === "confident") {
    if (room.credibility < 40 && fx.fans > 0) {
      fx.fans = Math.floor(fx.fans / 2);
      notes.push("Low credibility: fans have heard it before");
    }
    room.claims.unshift({ key: id, year: s.year, week: s.week, text: c.choicesMade[0]?.text || "", tested: false });
    room.claims = room.claims.slice(0, 20);
  }
  if (tone === "humble") room.credibility = clamp(room.credibility + 2);
  if (tone === "deflect") room.credibility = clamp(room.credibility - 2);
  fx.drama = Math.round(fx.drama > 0 ? fx.drama * savvy : fx.drama);
  // Team-wide morale, fans and the owner go through the newsroom's mood ledger.
  applyMood(s, { teamDelta: fx.team, fan: fx.fans, owner: fx.owner, reason, sourceId: `${id}:team`, spillover: false });
  const pulse = ensureSocial(s).pulse;
  pulse.chemistry = clamp(Math.round(pulse.chemistry + fx.chemistry));
  pulse.drama = clamp(Math.round(pulse.drama + fx.drama));
  pulse.fanScore = clamp(Math.round((pulse.fanScore ?? 60) + fx.fans));
  s.mediaTrust = clamp((s.mediaTrust ?? 50) + fx.media);
  // The named player, his captains and his position-mates.
  let reaction = null;
  if (player) {
    const why = `Press conference: ${follow.tone.toLowerCase()} (${follow.text})`.slice(0, 120);
    applyMood(s, { playerId: player.id, delta: pm, trust: pt, reason: why, sourceId: `${id}:player`, spillover: false });
    const leaders = s.roster.filter((p) => p.id !== player.id).sort((a, b) => leaderScore(b) - leaderScore(a)).slice(0, 3);
    if (captains)
      for (const q of leaders) applyMood(s, { playerId: q.id, delta: captains, trust: Math.sign(captains), reason: `Reaction to what you said about ${player.name}`, sourceId: `${id}:captain:${q.id}`, spillover: false });
    if (follow.id === "promise")
      for (const q of s.roster.filter((q) => q.pos === player.pos && q.starter && q.id !== player.id))
        applyMood(s, { playerId: q.id, delta: -3, trust: -2, reason: `You publicly promised ${player.name} more snaps`, sourceId: `${id}:rival:${q.id}`, spillover: false });
    if (follow.id === "compete")
      for (const q of s.roster.filter((q) => q.pos === player.pos && !q.starter && q.id !== player.id).slice(0, 2))
        applyMood(s, { playerId: q.id, delta: 2, reason: `You opened up the ${player.pos} job in public`, sourceId: `${id}:backup:${q.id}`, spillover: false });
    if (PUBLIC_CRITICISM.has(follow.id)) {
      dialogueConsequences(s, { person: player, tone: "Challenge", delta: pm, key: `press:${id}`, publicCriticism: true });
      reaction = ambitious(player)
        ? `${player.name} answers on social media: "Watch me." He has taken it as fuel, but the room noticed.`
        : (player.persona?.loyalty ?? 0.5) >= 0.65
          ? `${player.name} is hurt. "I'd have preferred to hear it face to face," he tells reporters at his locker.`
          : `${player.name} declines to comment. Teammates say he took it hard.`;
      events.push({ kind: "callout", text: reaction });
    }
    if (follow.id === "promise") {
      const cinema = (s.franchise.cinema ??= { history: [], promises: [], active: null });
      (cinema.promises ??= []).push({ playerId: player.id, name: player.name, year: s.year, week: s.week, due: s.week + 1, type: "Playing time", public: true, done: false });
      reaction = `${player.name} has been promised more snaps in public. Start him by week ${s.week + 2} or the promise is broken.`;
      events.push({ kind: "promise", text: reaction });
    }
    if (["back", "support", "commit"].includes(follow.id)) reaction = `${player.name} heard it. "That means a lot coming from him," he says.`;
    if (follow.id === "praise") reaction = `${player.name} grins at his locker when the quote is read back to him.`;
  }
  const after = snapshot(s, player?.id),
    d = (k) => Math.round(after[k] - before[k]);
  const summary = {
    key: c.key,
    id,
    type: c.type,
    year: s.year,
    week: s.week,
    tone,
    toneLabel: c.choicesMade[0]?.tone,
    quote: c.choicesMade[0]?.text || "",
    follow: follow ? { id: follow.id, tone: follow.tone, text: follow.text } : null,
    context: ctx,
    playerId: player?.id || null,
    playerName: player?.name || null,
    changes: {
      morale: d("morale"),
      chemistry: d("chemistry"),
      drama: d("drama"),
      fans: d("fans"),
      owner: d("owner"),
      media: d("media"),
      credibility: d("credibility"),
      ...(player ? { playerMorale: d("playerMorale"), playerTrust: d("playerTrust") } : {}),
    },
    notes,
    reaction,
    events,
  };
  room.entries.unshift(summary);
  room.entries = room.entries.slice(0, 40);
  // Inbox: something big happened (a player called out, a public promise, a broken claim).
  for (const e of events) {
    const subject = player?.name || "Your press conference";
    postMessage(s, `press-${id}-${e.kind}`, {
      title: e.kind === "callout" ? `${subject} reacts to your comments` : e.kind === "promise" ? `Public promise: more snaps for ${subject}` : "Your words come back to bite",
      summary: e.kind === "credibility" ? `"${e.text}" Then the team lost. Reporters noticed.` : e.text,
      body: `${e.kind === "credibility" ? `Earlier this week you said: "${e.text}". The result did not back it up.` : e.text}\n\nChanges: team morale ${fmt(summary.changes.morale)}, chemistry ${fmt(summary.changes.chemistry)}, drama ${fmt(summary.changes.drama)}, fan approval ${fmt(summary.changes.fans)}, owner patience ${fmt(summary.changes.owner)}${player ? `, ${player.name}: morale ${fmt(summary.changes.playerMorale)}, trust ${fmt(summary.changes.playerTrust)}` : ""}.`,
      category: "Interviews",
      source: "Media relations",
      priority: e.kind === "callout" ? "high" : "normal",
      playerId: player?.id,
      route: "Locker room",
      data: pressMessageData(e, summary, player),
    });
  }
  return summary;
}
const fmt = (n) => (n > 0 ? "+" : "") + n;
// Structured inbox card (ui/message-cards.mjs): your quote or the player's reaction, then the
// changes per group with the tone of each metric (drama up is bad).
export function pressMessageData(e, summary, player) {
  const c = summary?.changes || {},
    team = [["Team morale", c.morale], ["Chemistry", c.chemistry], ["Drama", c.drama], ["Fan approval", c.fans], ["Owner patience", c.owner], ["Media trust", c.media], ["Credibility", c.credibility]]
      .filter(([label, delta]) => Number.isFinite(delta) && (delta !== 0 || !["Media trust", "Credibility"].includes(label)))
      .map(([label, delta]) => ({ label, delta }));
  const groups = [{ name: "Team", rows: team }];
  if (player) groups.push({ name: player.name, playerId: player.id, rows: [{ label: "Morale", delta: c.playerMorale ?? 0 }, { label: "Trust", delta: c.playerTrust ?? 0 }] });
  return {
    kind: "effects",
    event: e.kind,
    claim: e.kind === "credibility" ? e.text : "",
    claimNote: e.kind === "credibility" ? "You said this before the game. The result did not back it up, and reporters noticed." : "",
    reaction: e.kind === "callout" && player ? { playerId: player.id, name: player.name, text: e.text } : null,
    lead: e.kind === "promise" ? e.text : "",
    groups,
  };
}

// Interview bookkeeping that the old answerInterview() did, without its fixed numbers:
// closes the pregame/postgame slot, keeps the media transcript and the club news line.
export function closeInterview(s, c, summary) {
  if (c.type === "pre" && s.live) s.live.interviewDone = true;
  if (c.type === "post") s.interviewPending = null;
  s.press ??= [];
  s.press.unshift({ type: c.type, quote: summary?.quote || c.choicesMade[0]?.text || "", follow: summary?.follow?.text || null, coach: s.coach?.name, year: s.year, week: s.week, morale: summary?.changes?.morale ?? 0, trust: summary?.changes?.media ?? 0 });
  s.press = s.press.slice(0, 60);
  if (Array.isArray(s.news)) s.news.unshift({ title: c.type === "pre" ? "Coach sets the tone" : "From the press room", body: summary?.quote || "", week: s.week });
  // A bold pregame promise gives the opponent bulletin-board material.
  if (c.type === "pre" && summary?.tone === "confident") s.franchise.bulletinBoard = { year: s.year, week: s.week, bonus: 1 };
}

// Lighter version for the one-question dashboard presser (depth-systems answerPress).
export function applyQuickPress(s, key, tone, result = "pre") {
  const room = ensurePressRoom(s);
  if (room.applied.includes(key)) return null;
  room.applied.push(key);
  const { fx } = toneEffects(tone, { result, losingStreak: 0, winningStreak: 0, rivalry: false }),
    half = (n) => (n > 0 ? Math.floor(n / 2) : Math.ceil(n / 2));
  applyMood(s, { teamDelta: half(fx.team), fan: half(fx.fans), owner: half(fx.owner), reason: "Press conference answer", sourceId: key + ":quick", spillover: false });
  const pulse = ensureSocial(s).pulse;
  pulse.chemistry = clamp(pulse.chemistry + half(fx.chemistry));
  s.mediaTrust = clamp((s.mediaTrust ?? 50) + half(fx.media));
  return { team: half(fx.team), chemistry: half(fx.chemistry), fans: half(fx.fans), owner: half(fx.owner), media: half(fx.media) };
}

// Rows for the outcome card: [label, delta, good-when-positive].
export function pressChangeRows(summary) {
  const c = summary?.changes || {},
    rows = [
      ["Team morale", c.morale, true],
      ["Chemistry", c.chemistry, true],
      ["Drama", c.drama, false],
      ["Fan approval", c.fans, true],
      ["Owner patience", c.owner, true],
      ["Media trust", c.media, true],
    ];
  if (summary?.playerName) rows.push([`${summary.playerName}: morale`, c.playerMorale, true], [`${summary.playerName}: trust`, c.playerTrust, true]);
  return rows.filter(([, v]) => Number.isFinite(v));
}

// Latest press conference for the locker room's "what is moving the room".
export function latestPress(s) {
  const e = s.franchise?.pressRoom?.entries?.[0];
  return e && e.year === s.year && s.week - e.week <= 2 ? e : null;
}
