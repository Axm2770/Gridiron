// Press conferences with consequences: tone and follow-up answers move the room, the fans, the
// owner, media trust and the named player; context changes the size; applied exactly once.
import assert from "node:assert/strict";
import { createConversation, chooseResponse, sceneChoices, reviewPromises } from "./dist/franchise/conversations.mjs";
import { applyPressConference, pressContext, pressTopic, toneEffects, pressChangeRows } from "./dist/franchise/press-consequences.mjs";
import { lockerReport } from "./dist/franchise/locker-room.mjs";
import { ensureSocial } from "./dist/franchise/social-engine.mjs";
import { pressConference, answerPress } from "./dist/franchise/depth-systems.mjs";
import { deriveRoundEvents } from "./dist/franchise/event-bus.mjs";

globalThis.clubs ??= Array.from({ length: 32 }, (_, i) => [`T${i}`, `City ${i}`, `Club${i}`, `Division ${Math.floor(i / 4)}`]);

const player = (id, pos, ovr, extra = {}) => ({ id, name: `${pos} Player ${id}`, pos, ovr, age: 27, morale: 70, coachTrust: 60, injury: 0, starter: true, stats: {}, persona: { leadership: 0.5, ambition: 0.4, loyalty: 0.5 }, ...extra });
function career({ score = [10, 24], opponent = 9, turnovers = 3 } = {}) {
  const s = {
    year: 2026,
    week: 3,
    phase: "season",
    team: 0,
    morale: 70,
    mediaTrust: 50,
    coach: { name: "Avery Coach" },
    news: [],
    roster: [
      player("qb", "QB", 84),
      player("wr", "WR", 80),
      player("cap", "LB", 78, { age: 33, persona: { leadership: 0.95, ambition: 0.3, loyalty: 0.8 } }),
      player("cb", "CB", 76),
      player("wr2", "WR", 81, { starter: false, persona: { leadership: 0.2, ambition: 0.9, loyalty: 0.3 } }),
    ],
    teams: Array.from({ length: 32 }, () => ({ w: 1, l: 1, pf: 40, pa: 40 })),
    schedule: Array.from({ length: 17 }, () => [{ a: 0, b: opponent, score: null }]),
    lastMatch: { a: 0, b: opponent, score, stats: [{ turnovers }, { turnovers: 0 }] },
    live: null,
    interviewPending: { type: "post", year: 2026, week: 2 },
    franchise: {
      role: "HC",
      career: { reputation: 55, xp: 0 },
      cinema: { history: [], promises: [], active: null },
      clubs: Array.from({ length: 32 }, (_, id) => ({ id, staff: [], fanApproval: 60, owner: { patience: 60 }, players: [] })),
      office: { stories: [], messages: [], seen: [], rounds: [], step: 0, moodHistory: [] },
      events: [],
    },
  };
  // Last week's game is already on the schedule (the postgame presser runs after settlement).
  s.schedule[2] = [{ a: 0, b: opponent, score: [...score] }];
  ensureSocial(s);
  return s;
}
const pulse = (s) => ensureSocial(s).pulse;
const byId = (s, id) => s.roster.find((p) => p.id === id);
function presser(s, type, first, second) {
  s.franchise.cinema.active = createConversation(s, type);
  const c = s.franchise.cinema.active;
  const firstIndex = typeof first === "number" ? first : sceneChoices(c).findIndex((x) => x.key === first);
  chooseResponse(s, firstIndex);
  const secondIndex = typeof second === "number" ? second : sceneChoices(c).findIndex((x) => x.id === second);
  assert(secondIndex >= 0, `follow-up ${second} is offered`);
  return { c, result: chooseResponse(s, secondIndex) };
}

// 1. After a loss the media ask about the quarterback who turned it over.
{
  const s = career();
  const ctx = pressContext(s, "post");
  assert.equal(ctx.result, "loss");
  const topic = pressTopic(s, "post", ctx);
  assert.equal(topic.kind, "struggle");
  assert.equal(topic.playerId, "qb");
  s.franchise.cinema.active = createConversation(s, "post");
  assert.equal(sceneChoices(s.franchise.cinema.active).length, 4, "four tones to choose from");
  assert.match(s.franchise.cinema.active.lines[1], /QB Player qb/);
}

// 2. Humble + backing the struggling player: the room, the player and the media warm up.
{
  const s = career(),
    before = { morale: s.morale, chem: pulse(s).chemistry, drama: pulse(s).drama, qb: byId(s, "qb").morale, trust: byId(s, "qb").coachTrust, media: s.mediaTrust, owner: s.franchise.clubs[0].owner.patience };
  const { result } = presser(s, "post", "humble", "back");
  assert(result.complete && result.press, "press summary returned");
  assert(s.morale > before.morale, "team morale rises");
  assert(pulse(s).chemistry > before.chem, "chemistry rises");
  assert(pulse(s).drama < before.drama, "drama falls");
  assert(byId(s, "qb").morale > before.qb, "the backed player feels it");
  assert(byId(s, "qb").coachTrust > before.trust, "and trusts the coach more");
  assert(s.mediaTrust > before.media);
  assert(s.franchise.clubs[0].owner.patience > before.owner, "accountability after a loss buys owner patience");
  assert.equal(s.interviewPending, null, "the postgame interview is closed");
  assert(s.press?.[0]?.quote, "transcript kept");
  assert(pressChangeRows(result.press).some(([label]) => /QB Player qb: trust/.test(label)), "card lists the named player's trust");
  assert(byId(s, "qb").moodLog?.some((e) => /Press conference/.test(e.reason)), "the player's profile shows why");
  const room = lockerReport(s).teamCauses.find((x) => /Press conference/.test(x.text));
  assert(room && room.tone === "good", "the locker room lists the press conference as a positive");
}

// 3. Deflecting and then publicly blaming the player: drama, rifts, captains and an inbox story.
{
  const s = career(),
    before = { morale: s.morale, chem: pulse(s).chemistry, drama: pulse(s).drama, qb: byId(s, "qb").morale, trust: byId(s, "qb").coachTrust, cap: byId(s, "cap").morale, fans: s.franchise.clubs[0].fanApproval, owner: s.franchise.clubs[0].owner.patience };
  const { result } = presser(s, "post", "deflect", "blame");
  assert(pulse(s).drama > before.drama + 8, "public blame after a loss sends drama up");
  assert(pulse(s).chemistry < before.chem, "chemistry falls");
  assert(s.franchise.clubs[0].fanApproval < before.fans, "deflecting a loss costs fan approval");
  assert(s.franchise.clubs[0].owner.patience < before.owner, "and owner patience");
  assert(byId(s, "qb").morale < before.qb - 5, "the blamed player's morale drops");
  assert(byId(s, "qb").coachTrust < before.trust - 8, "and his trust drops hard");
  assert(byId(s, "cap").morale < before.cap, "the captain does not like public blame");
  assert(s.franchise.relationshipRifts?.some((r) => r.personId === "qb" && r.active), "a relationship rift opens");
  const mail = s.franchise.office.messages.find((m) => /reacts to your comments/.test(m.title));
  assert(mail && mail.playerId === "qb" && mail.category === "Interviews", "the inbox gets the player's reaction");
  assert(result.press.reaction, "the outcome card has the reaction line");
  assert(lockerReport(s).teamCauses.find((x) => /Press conference/.test(x.text)).tone === "bad");
}

// 4. Context: the same confident answer lands differently after a win and after a loss.
{
  const win = toneEffects("confident", { result: "win", losingStreak: 0, winningStreak: 0, rivalry: false }).fx,
    loss = toneEffects("confident", { result: "loss", losingStreak: 0, winningStreak: 0, rivalry: false }).fx,
    streak = toneEffects("deflect", { result: "loss", losingStreak: 3, winningStreak: 0, rivalry: false }).fx,
    single = toneEffects("deflect", { result: "loss", losingStreak: 1, winningStreak: 0, rivalry: false }).fx,
    rival = toneEffects("confident", { result: "win", losingStreak: 0, winningStreak: 0, rivalry: true }).fx;
  assert(win.fans > 0 && loss.fans < 0, "confidence after a win pleases fans, after a loss it grates");
  assert(win.team > loss.team);
  assert(streak.fans < single.fans && streak.owner < single.owner, "a losing streak magnifies the damage");
  assert(rival.fans > win.fans && rival.drama > win.drama, "rivalry week amplifies");
  // End to end: confident after a win vs after a loss.
  const a = career({ score: [27, 10], turnovers: 0 }),
    b = career({ score: [10, 27], turnovers: 0 });
  const fa = a.franchise.clubs[0].fanApproval,
    fb = b.franchise.clubs[0].fanApproval;
  presser(a, "post", "confident", 0);
  presser(b, "post", "confident", 0);
  assert(a.franchise.clubs[0].fanApproval - fa > b.franchise.clubs[0].fanApproval - fb, "win context gives the bigger fan lift");
}

// 5. Applied exactly once: re-running the consequences (a re-render, a double click) changes nothing.
{
  const s = career();
  const { c, result } = presser(s, "post", "defiant", "back");
  const frozen = JSON.stringify(s);
  const again = applyPressConference(s, c);
  assert.equal(JSON.stringify(s), frozen, "no double application");
  assert.deepEqual(again.changes, result.press.changes, "returns the recorded summary");
  assert.throws(() => chooseResponse(s, 0), /expired/);
  assert.throws(() => createConversation(s, "post"), /not available|already complete/);
}

// 6. Promising snaps in public creates a tracked promise; teammates at the position react.
{
  const s = career();
  s.lastMatch = null;
  s.interviewPending = null;
  s.live = { a: 0, b: 9, interviewDone: false, score: [0, 0] };
  const topic = pressTopic(s, "pre");
  assert.equal(topic.kind, "snaps");
  assert.equal(topic.playerId, "wr2");
  const wr = byId(s, "wr").morale;
  presser(s, "pre", "humble", "promise");
  assert(s.live.interviewDone, "pregame interview closed");
  const promise = s.franchise.cinema.promises.find((p) => p.playerId === "wr2");
  assert(promise && promise.type === "Playing time" && !promise.done, "promise recorded");
  assert(byId(s, "wr").morale < wr, "the starter at his position feels threatened");
  // Broken: still on the bench two weeks later.
  const broken = structuredClone(s);
  broken.week += 2;
  const trust = byId(broken, "wr2").coachTrust;
  reviewPromises(broken);
  assert.equal(broken.franchise.cinema.promises[0].outcome, "Broken: still not starting");
  assert(byId(broken, "wr2").coachTrust < trust);
  // Kept: starting by the due week.
  const kept = structuredClone(s);
  kept.week += 1;
  byId(kept, "wr2").starter = true;
  reviewPromises(kept);
  assert.equal(kept.franchise.cinema.promises[0].outcome, "Kept: starting role");
}

// 7. Credibility: a bold pregame claim followed by a loss costs media trust and fans.
{
  const s = career({ score: [10, 24], turnovers: 0 });
  s.lastMatch = null;
  s.interviewPending = null;
  s.live = { a: 0, b: 9, interviewDone: false, score: [0, 0] };
  presser(s, "pre", "confident", 0);
  assert.equal(s.franchise.bulletinBoard?.week, 3, "a bold pregame claim motivates the opponent");
  const cred = s.franchise.pressRoom.credibility;
  // The game is lost and the week settles.
  s.live = null;
  s.week = 4;
  s.schedule[3] = [{ a: 0, b: 9, score: [10, 24] }];
  s.lastMatch = { a: 0, b: 9, score: [10, 24], stats: [{ turnovers: 0 }, { turnovers: 0 }] };
  s.interviewPending = { type: "post", year: 2026, week: 3 };
  const control = structuredClone(s);
  control.franchise.pressRoom.claims = [];
  const { result } = presser(s, "post", "humble", 0);
  const { result: base } = presser(control, "post", "humble", 0);
  assert(s.franchise.pressRoom.credibility < cred, "credibility drops");
  assert(result.press.changes.media < base.press.changes.media, "media trust pays for the broken claim");
  assert(result.press.changes.fans < base.press.changes.fans, "so do the fans");
  assert(result.press.notes.some((n) => /Credibility hit/.test(n)));
  assert(s.franchise.office.messages.some((m) => /come back to bite/.test(m.title)));
}

// 8. The quick dashboard presser also moves the room (at half weight), once.
{
  const s = career();
  deriveRoundEvents(s, [{ a: 0, b: 9, score: [10, 24] }], "r1");
  const p = pressConference(s);
  assert(p, "a dashboard presser exists");
  const fans = s.franchise.clubs[0].fanApproval,
    { effects } = answerPress(s, p.id, "deflect");
  assert(effects && effects.fans < 0, "deflecting a loss costs fans");
  assert(s.franchise.clubs[0].fanApproval < fans);
}

console.log("PASS: press conferences move morale, chemistry, drama, fans, owner and named players; context, credibility, promises and single application.");
