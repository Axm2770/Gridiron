// Gridiron Journal articles: body copy for every story kind, milestone/event detection (once per
// key), the feature-visual hook and its fallback, and stories saved before articles existed.
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import * as S from "./dist/franchise/state.mjs";
import { ensureOffice, syncOffice, postStory, processNewsRound } from "./dist/franchise/newsroom.mjs";
import { ensureRecordBook } from "./dist/franchise/records.mjs";
import {
  articleCopy,
  storyKind,
  milestoneStories,
  leagueEventStories,
  featureVisual,
  relatedStories,
  matchData,
  STORY_KINDS,
} from "./dist/franchise/news-articles.mjs";
import { articleView, articleHero, cardArt } from "./dist/franchise/news-article-ui.mjs";

const ctx = {
  console,
  Date,
  Math,
  setTimeout: () => {},
  localStorage: { getItem: () => null, setItem() {} },
  document: { getElementById: () => ({ innerHTML: "", style: {}, showModal() {}, close() {} }), querySelector: () => ({}), querySelectorAll: () => [] },
};
ctx.window = ctx;
ctx.addEventListener = () => {};
vm.createContext(ctx);
vm.runInContext(fs.readFileSync("dist/game.js", "utf8"), ctx);
vm.runInContext(fs.readFileSync("dist/match.js", "utf8"), ctx);
const fresh = () => {
  const s = JSON.parse(vm.runInContext("JSON.stringify(fresh())", ctx));
  s.coach = { name: "Test Coach", calling: "Manual" };
  S.migrate(s);
  syncOffice(s);
  return s;
};
const BAD = /\b(undefined|NaN|null)\b|\[object Object\]/;
const textOf = (c) => [c.headline, c.deck, c.lead, ...c.paragraphs, c.quote?.text || "", c.quote?.by || "", c.kicker, c.byline.name, c.dateline.text].join(" ");
function checkCopy(s, a, label) {
  const c = articleCopy(s, a);
  assert(c.lead && c.lead.length > 10, `${label}: lead`);
  assert(c.paragraphs.length >= 2 && c.paragraphs.length <= 5, `${label}: 2–5 body paragraphs (got ${c.paragraphs.length})`);
  assert(!BAD.test(textOf(c)), `${label}: no undefined/NaN in copy: ${textOf(c).match(BAD)?.[0]} — ${textOf(c).slice(0, 300)}`);
  const html = articleView(s, a, { list: [a], all: ensureOffice(s).stories });
  assert(html.includes('id="na-reader"') && html.includes("na-headline"), `${label}: reader renders`);
  assert(!/\bNaN\b|>undefined<|"undefined"/.test(html), `${label}: no NaN/undefined in markup`);
  cardArt(s, a);
  return c;
}

let s = fresh();
const year = s.year,
  me = s.team,
  opp = (me + 1) % 32,
  wr = s.roster.find((p) => p.pos === "WR") || s.roster[0],
  qb = s.roster.find((p) => p.pos === "QB") || s.roster[1];

/* ---------------------------------------------------------------- every kind */
const box = {
  a: me,
  b: opp,
  score: [27, 24],
  match: { periodScores: [[7, 3], [10, 7], [0, 7], [10, 7]], stats: [{ yards: 380, pass: 260, rush: 120, first: 22, turnovers: 1, plays: 64 }, { yards: 341, pass: 230, rush: 111, first: 19, turnovers: 2, plays: 61 }] },
  stats: [{ id: qb.id, team: me, attempts: 30, completions: 21, passYards: 260, passTD: 2 }, { id: wr.id, team: me, receptions: 7, recYards: 112, recTD: 1 }],
};
const stories = {
  match: { title: "Test match", body: "Final score: 27–24.", kind: "match", otherTeam: opp, data: matchData(s, box, 0, `${year}:season:3:0`) },
  result: { title: "Test result", body: "x 27–24 y.", kind: "result", team: opp, otherTeam: (me + 2) % 32, data: matchData(s, { ...box, a: opp, b: (me + 2) % 32 }, 0, `${year}:season:3:0`) },
  milestonePlayer: { title: "M", body: "b", kind: "milestone", playerId: wr.id, data: { type: "player", playerId: wr.id, name: wr.name, team: me, metric: "recYards", threshold: 5000, value: 5012, next: 6000, record: { value: 22895, name: "Jerry Rice", year: 2004 } } },
  milestoneSeason: { title: "M", body: "b", kind: "milestone", playerId: wr.id, data: { type: "season", playerId: wr.id, name: wr.name, team: me, metric: "recYards", threshold: 1000, value: 1012 } },
  milestoneGames: { title: "M", body: "b", kind: "milestone", playerId: qb.id, data: { type: "games", playerId: qb.id, name: qb.name, team: me, metric: "games", threshold: 100, value: 100 } },
  milestoneRecord: { title: "M", body: "b", kind: "milestone", playerId: wr.id, data: { type: "record", league: false, scope: "season", playerId: wr.id, name: wr.name, team: me, metric: "recYards", value: 1900, previous: 1800, previousHolder: "Old Star", previousYear: year - 3 } },
  milestoneStreak: { title: "M", body: "b", kind: "milestone", data: { type: "streak", team: me, length: 5, losing: false, form: ["W", "W", "W", "W", "W"], week: 5 } },
  milestoneSkid: { title: "M", body: "b", kind: "milestone", data: { type: "streak", team: me, length: 4, losing: true, week: 5 } },
  milestoneTen: { title: "M", body: "b", kind: "milestone", data: { type: "wins10", team: me } },
  milestoneCoach: { title: "M", body: "b", kind: "milestone", data: { type: "coach", metric: "wins", threshold: 50, team: me, wins: 50, losses: 30, ties: 0, playoffWins: 2, titles: 0 } },
  milestoneCoachPlayoff: { title: "M", body: "b", kind: "milestone", data: { type: "coach", metric: "playoffWins", threshold: 1, team: me, wins: 12, losses: 5, playoffWins: 1, titles: 0 } },
  eventDeadline: { title: "E", body: "b", kind: "event", team: null, data: { event: "deadline", week: 9, trades: 2, mine: 1, rows: [{ name: wr.name, pos: "WR", ovr: 80, to: opp, from: me, playerId: wr.id }] } },
  eventDeadlineQuiet: { title: "E", body: "b", kind: "event", team: null, data: { event: "deadline", week: 9, trades: 0, mine: 0, rows: [] } },
  eventFA: { title: "E", body: "b", kind: "event", team: null, data: { event: "free-agency", count: 120, rows: [{ name: "Free Agent", pos: "CB", ovr: 77, age: 29, playerId: "fa-x" }] } },
  eventDraft: { title: "E", body: "b", kind: "event", team: null, data: { event: "draft", picks: 224, rounds: 7, mine: 7, rows: [{ overall: 1, round: 1, team: opp, name: "", pos: "", playerId: null }] } },
  eventAwards: { title: "E", body: "b", kind: "event", team: null, data: { event: "awards", mine: 1, rows: [{ award: "MVP", label: "Most Valuable Player", name: qb.name, team: me, playerId: qb.id }, { award: "COTY", label: "Coach of the Year", name: "Test Coach", team: me, playerId: null }] } },
  eventBracket: { title: "E", body: "b", kind: "event", team: null, data: { event: "bracket", mySeed: 2, myDivision: true, rows: [{ conf: 0, seed: 1, team: opp, record: "13-4", division: true }, { conf: 0, seed: 2, team: me, record: "12-5", division: true }] } },
  eventChampion: { title: "E", body: "b", kind: "event", team: me, otherTeam: opp, data: { event: "champion", team: me, opp, score: [31, 17] } },
  eventAnniversary: { title: "E", body: "b", kind: "event", team: me, data: { event: "anniversary", wins: 22, losses: 12, ties: 0, playoffWins: 1, titles: 0, seasons: 2 } },
  injury: { title: `Availability watch: ${wr.name}`, body: "The player is unavailable.", kind: "injury", category: "Medical", playerId: wr.id, data: { playerId: wr.id, diagnosis: "Hamstring strain", weeks: 4, part: "hamstring" } },
  transaction: { title: `${wr.name} joins`, body: "A signing.", category: "Players", source: "Transactions wire", playerId: wr.id, card: { type: "jersey", team: me, playerId: wr.id, name: wr.name, pos: wr.pos, via: "free-agency" } },
  tradeAgreed: { title: "Trade agreed", body: "A is exchanged for B.", category: "Players" },
  player: { title: "By the numbers", body: "A closer look.", kind: "player", category: "Players", playerId: qb.id },
  coach: { title: "New coach", body: "A coaching hire.", category: "League", card: { type: "coach", team: opp, name: "Coach Z" } },
  interview: { title: "Press room", body: "The coach spoke.", category: "Interviews" },
  scouting: { title: "Scouting trip", body: "Scouts travel.", category: "Scouting" },
  general: { title: "A general note", body: "Something happened in the building.", category: "Team" },
  feature: { title: "Combine star", body: "Fast forty.", category: "Scouting", feature: { type: "combine", data: { forty: 4.31 } } },
};
const posted = {};
for (const [k, item] of Object.entries(stories)) posted[k] = postStory(s, "t-" + k, item);
const kindsSeen = new Set();
for (const [k, a] of Object.entries(posted)) {
  const c = checkCopy(s, a, k);
  kindsSeen.add(c.kind);
}
for (const k of STORY_KINDS) assert(kindsSeen.has(k), `covered story kind ${k}`);
const m = articleCopy(s, posted.match);
assert(m.paragraphs.some((p) => /third|fourth|first|second/.test(p)) && m.paragraphs.some((p) => /380 yards/.test(p)), "match recap uses the quarter line and box score");
assert(articleHero(s, posted.match).includes("na-ls") && articleView(s, posted.match, { list: [posted.match] }).includes("na-tb"), "match recap has a line score and team stat bars");
assert(articleHero(s, posted.injury).includes("na-body"), "injury story has a body diagram");
assert(/a hamstring strain/.test(articleCopy(s, posted.injury).lead), "diagnosis reads mid-sentence");
assert(articleHero(s, posted.eventBracket).includes("na-seeds"), "bracket story has the seed table");
assert(storyKind(posted.tradeAgreed) === "transaction" && storyKind(posted.coach) === "coach", "classified from older fields");

/* ---------------------------------------------------------------- feature hook */
const feat = posted.feature;
assert.equal(storyKind(feat), "feature");
assert.equal(featureVisual(feat, undefined), null, "no registry: fallback");
assert.equal(featureVisual(feat, { combine: "nope" }), null, "non-function: fallback");
assert.equal(featureVisual(feat, { combine: () => { throw Error("boom"); } }), null, "throwing visual: fallback");
assert.equal(featureVisual(feat, { combine: () => "" }), null, "empty visual: fallback");
let seen = null;
const html = articleHero(s, feat, articleCopy(s, feat), { combine: (d, a) => ((seen = [d, a.id]), `<div class="hook">40 · ${d.forty}</div>`) });
assert(html.includes('class="hook"') && html.includes("4.31"), "registered visual becomes the hero");
assert.deepEqual(seen, [{ forty: 4.31 }, feat.id], "called with (feature.data, article)");
const fallback = articleHero(s, feat, articleCopy(s, feat), {});
assert(!fallback.includes("hook"), "fallback hero when no visual is registered");
globalThis.GDFeatureVisuals = { combine: () => '<i class="global-hook"></i>' };
assert(articleView(s, feat, { list: [feat] }).includes("global-hook"), "reader reads window.GDFeatureVisuals");
delete globalThis.GDFeatureVisuals;

/* ---------------------------------------------------------------- related */
const rel = relatedStories(ensureOffice(s).stories, posted.milestoneSeason, 4);
assert(rel.length && rel[0].playerId === wr.id, "related: same player first");

/* ---------------------------------------------------------------- old saves */
const old = fresh();
const o = ensureOffice(old);
const legacy = [
  { id: "story-match-2026:season:2:0", title: "Cowboys handle the Giants 24–17", body: "Final score: 24–17. Third-down execution made the difference. The Cowboys are 2-1.", category: "Team", source: "Sunday Review", year: old.year, week: 3, team: old.team, read: false, bookmarked: false },
  { id: "story-league-x-0", title: "Upset", body: "Bills 10–31 Jets. Standings have been updated.", category: "League", source: "League desk", year: old.year, week: 3, team: 2, otherTeam: 3, read: false, bookmarked: false },
  { id: "story-injury-1", title: `Availability watch: ${old.roster[0].name}`, body: "The player is unavailable with Knee sprain. The staff will manage recovery.", category: "Medical", source: "Team communications", playerId: old.roster[0].id, year: old.year, week: 2, team: old.team },
  { id: "story-event-1", title: "A record falls", body: "Somebody: passing yards · 5,600 sets a new mark.", category: "Team", source: "Gridiron Wire", year: old.year, week: 4, team: old.team },
  { id: "story-player-action-1", title: "Extra work, shared standards", body: "A player stayed after practice.", category: "Players", playerId: old.roster[2].id, year: old.year, week: 4, team: old.team },
  { id: "story-gone", title: "Departed player feature", body: "He has since left.", category: "Players", playerId: "no-such-player", year: old.year, week: 1, team: old.team },
];
o.stories.unshift(...legacy);
const reloaded = JSON.parse(JSON.stringify(old));
for (const a of ensureOffice(reloaded).stories.slice(0, legacy.length)) checkCopy(reloaded, a, "legacy " + a.id);
assert.equal(storyKind(legacy[0]), "match");
assert(/24–17|17–24/.test(articleCopy(reloaded, legacy[0]).lead), "old match story keeps its score");

/* ---------------------------------------------------------------- milestones fire once */
const ms = fresh();
ensureRecordBook(ms);
const b = ms.franchise.statBook,
  p = ms.roster.find((x) => x.pos === "WR" && !x.realPlayer) || ms.roster.find((x) => x.pos === "WR");
p.realPlayer = false;
b.regularTotals[ms.year] ??= {};
b.regularTotals[ms.year][p.id] = { id: p.id, name: p.name, pos: p.pos, team: ms.team, stats: { recYards: 1010, receptions: 60, games: 9 } };
(p.stats ??= {})[ms.year] = { recYards: 1010, receptions: 60 };
const round = (key) => [{ a: ms.team, b: (ms.team + 1) % 32, score: [20, 10], stats: [{ id: p.id, team: ms.team, recYards: 40, receptions: 3, snaps: 30 }] }];
const first = milestoneStories(ms, round(), `${ms.year}:season:8:0`);
const keys = first.map(([k]) => k);
assert(keys.includes(`ms-${p.id}-recYards-1000`), "career 1,000 receiving yards fires: " + keys.join(","));
assert(keys.includes(`ms-season-${ms.year}-${p.id}-recYards-1000`), "season 1,000 receiving yards fires");
for (const [, item] of first) assert(!BAD.test(item.title + item.body), "milestone headline is clean: " + item.title);
assert.deepEqual(milestoneStories(ms, round(), `${ms.year}:season:8:0`), [], "same round twice: nothing");
const again = milestoneStories(ms, round(), `${ms.year}:season:9:0`).map(([k]) => k);
assert(!again.some((k) => keys.includes(k)), "a crossed threshold never fires twice");
// Through the newsroom: the story is posted once and survives a save reload.
const nr = fresh();
ensureRecordBook(nr);
const q = nr.roster.find((x) => x.pos === "WR") || nr.roster[0];
q.realPlayer = false;
nr.franchise.statBook.regularTotals[nr.year] ??= {};
nr.franchise.statBook.regularTotals[nr.year][q.id] = { id: q.id, name: q.name, pos: q.pos, team: nr.team, stats: { recYards: 1005, games: 9 } };
(q.stats ??= {})[nr.year] = { recYards: 1005 };
const res = [{ a: nr.team, b: (nr.team + 1) % 32, score: [21, 14], stats: [{ id: q.id, team: nr.team, recYards: 30, snaps: 20 }] }];
processNewsRound(nr, res, `${nr.year}:season:8:0`);
const count = () => ensureOffice(nr).stories.filter((a) => a.kind === "milestone" && a.data?.playerId === q.id && a.data.metric === "recYards").length;
const once1 = count();
assert(once1 >= 1, "milestone story posted");
processNewsRound(nr, res, `${nr.year}:season:8:0`);
const reload = JSON.parse(JSON.stringify(nr));
processNewsRound(reload, res, `${nr.year}:season:9:0`);
assert.equal(ensureOffice(reload).stories.filter((a) => a.kind === "milestone" && a.data?.playerId === q.id && a.data.metric === "recYards").length, once1, "no duplicate after a repeat round or a reload");

// Streaks: three straight wins posts once.
const st = fresh();
st.franchise.matchups = { version: 1, games: [0, 1, 2].map((w) => ({ year: st.year, phase: "season", week: w, a: st.team, b: (st.team + 3) % 32, score: [24, 10] })) };
const streak = milestoneStories(st, [], `${st.year}:season:2:0`).filter(([k]) => k.startsWith("streak-"));
assert.equal(streak.length, 1, "three straight wins: one streak story");
assert.equal(milestoneStories(st, [], `${st.year}:season:2:1`).filter(([k]) => k.startsWith("streak-")).length, 0, "streak not repeated");

/* ---------------------------------------------------------------- league events once */
const ev = fresh();
ev.week = ev.franchise.rules?.tradeDeadline || 9;
const e1 = leagueEventStories(ev).map(([k]) => k);
assert(e1.includes(`deadline-${ev.year}`), "trade deadline event");
assert.deepEqual(leagueEventStories(ev), [], "deadline posts once");
syncOffice(ev);
const snap = JSON.stringify(ev.franchise.office);
syncOffice(ev);
assert.equal(JSON.stringify(ev.franchise.office), snap, "render sync stays idempotent with events");
// Champion + bracket in the offseason.
ev.phase = "offseason";
ev.history = [...(ev.history || []), { year: ev.year, champion: ev.team, record: "13–4" }];
ev.franchise.postseason = { seeds: [Array.from({ length: 7 }, (_, i) => i), Array.from({ length: 7 }, (_, i) => 16 + i)], round: 3 };
const e2 = leagueEventStories(ev).map(([k]) => k);
assert(e2.includes(`champion-${ev.year}`) && e2.includes(`bracket-${ev.year}`), "champion and bracket events: " + e2.join(","));
ev.franchise.awards = [{ year: ev.year, award: "MVP", name: "Star QB", team: 3, playerId: null }];
assert(leagueEventStories(ev).some(([k]) => k === `awards-${ev.year}`), "awards event");
const evStory = leagueEventStories(fresh());
for (const [, item] of [...evStory]) assert(item.team === null || Number.isInteger(item.team), "events name a club or none");

console.log("PASS: news articles — copy for every story kind (2–5 paragraphs, no undefined/NaN), match/injury/bracket visuals, feature hook + fallback, related, legacy stories, milestones and streaks once, league events once and idempotent sync.");
