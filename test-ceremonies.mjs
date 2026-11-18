// League ceremonies: combine results, scouting/draft-stock effects, NFL Honors and the Hall of Fame,
// run through a full simulated season and offseason on the calendar (twice, so classes don't repeat).
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import * as S from "./dist/franchise/state.mjs";
import * as L from "./dist/franchise/lifecycle.mjs";
import * as P from "./dist/franchise/personnel.mjs";
import * as A from "./dist/franchise/awards.mjs";
import * as C from "./dist/franchise/ceremonies.mjs";
import * as DateBook from "./dist/franchise/calendar-core.mjs";
import * as Calendar from "./dist/franchise/calendar-operations.mjs";
import { attributeRanges, halfWidth, COMBINE_CONFIDENCE } from "./dist/franchise/scouting.mjs";
import { consensusBoard, prospectProfile } from "./dist/franchise/draft-room.mjs";
import { ensurePlayerRatings } from "./dist/franchise/ratings.mjs";
import { combineVisual, hofVisual, awardsVisual, combineSceneSVG } from "./dist/presentation/ceremony-scenes.mjs";
import { sceneData } from "./dist/presentation/pixel-art.mjs";

const ctx = { console, Math, Date, setTimeout() {}, localStorage: { getItem() { return null; }, setItem() {} }, document: { getElementById() { return { innerHTML: "", style: {}, showModal() {}, close() {} }; }, querySelector() { return {}; }, querySelectorAll() { return []; } } };
ctx.window = ctx;
ctx.addEventListener = () => {};
vm.createContext(ctx);
vm.runInContext(fs.readFileSync("dist/game.js", "utf8"), ctx);
vm.runInContext(fs.readFileSync("dist/match.js", "utf8"), ctx);
globalThis.clubs = JSON.parse(vm.runInContext("JSON.stringify(clubs)", ctx));
function fresh() {
  const s = JSON.parse(vm.runInContext("JSON.stringify(fresh())", ctx));
  s.coach = { name: "Ceremony QA", style: "Balanced", calling: "Manual" };
  S.migrate(s);
  DateBook.ensureCalendar(s);
  return s;
}
const median = (a) => a.slice().sort((x, y) => x - y)[a.length >> 1];
const corr = (xs, ys) => {
  const mx = xs.reduce((a, b) => a + b) / xs.length,
    my = ys.reduce((a, b) => a + b) / ys.length;
  let n = 0, dx = 0, dy = 0;
  xs.forEach((x, i) => ((n += (x - mx) * (ys[i] - my)), (dx += (x - mx) ** 2), (dy += (ys[i] - my) ** 2)));
  return n / Math.sqrt(dx * dy);
};

/* ------------------------------------------- combine distributions per position */
const pool = Array.from({ length: 1320 }, (_, i) => S.makePlayer(`prospect-2030-${i}`, S.POS[i % 22], 2030 * 967 + i, true));
const results = pool.map((p) => [p, C.combineResult(p, 2031)]);
const forty = (pos) => results.filter(([p, r]) => p.pos === pos && Number.isFinite(r.drills.forty)).map(([, r]) => r.drills.forty);
for (const [pos, lo, hi] of [["WR", 4.25, 4.75], ["CB", 4.25, 4.72], ["RB", 4.3, 4.8], ["OL", 4.85, 5.6], ["DL", 4.55, 5.35], ["QB", 4.45, 5.15]]) {
  const t = forty(pos);
  assert(t.length > 20, `${pos} runs the 40`);
  assert(t.every((v) => v >= lo && v <= hi), `${pos} 40 times stay in ${lo}–${hi} (got ${Math.min(...t)}–${Math.max(...t)})`);
}
assert(median(forty("WR")) >= 4.4 && median(forty("WR")) <= 4.58, "typical receiver runs about 4.5");
assert(median(forty("OL")) >= 5.1 && median(forty("OL")) <= 5.3, "typical lineman runs about 5.2");
assert(median(results.filter(([p, r]) => p.pos === "OL" && r.drills.bench).map(([, r]) => r.drills.bench)) > median(results.filter(([p, r]) => p.pos === "WR" && r.drills.bench).map(([, r]) => r.drills.bench)) + 6, "linemen out-bench receivers");
// Results are informative: tied to the hidden athletic attributes.
const wr = results.filter(([p, r]) => ["WR", "CB", "RB", "S"].includes(p.pos) && Number.isFinite(r.drills.forty));
assert(corr(wr.map(([p]) => ensurePlayerRatings(p).attributes.speed), wr.map(([, r]) => r.drills.forty)) < -0.6, "faster players run faster 40s");
const strong = results.filter(([p, r]) => Number.isFinite(r.drills.bench));
assert(corr(strong.map(([p]) => ensurePlayerRatings(p).attributes.strength), strong.map(([, r]) => r.drills.bench)) > 0.5, "stronger players bench more");
// Specialists and quarterbacks skip what they skip; some prospects are limited or excluded.
assert(results.filter(([p]) => ["K", "P"].includes(p.pos)).every(([, r]) => r.status === "specialist" && !Object.keys(r.drills).length));
assert(results.filter(([p]) => p.pos === "QB").every(([, r]) => !("bench" in r.drills)));
assert(results.some(([, r]) => r.status === "limited") && results.some(([, r]) => r.status === "medical" || r.status === "injured"), "some prospects skip drills or get hurt");
assert(results.filter(([p]) => p.pos === "QB").some(([, r]) => r.status === "full"), "a QB skipping only the bench still had a full workout");
// Deterministic.
assert.deepEqual(C.combineResult(pool[7], 2031), C.combineResult(structuredClone(pool[7]), 2031));
assert.notDeepEqual(C.combineResult(pool[7], 2031).drills, C.combineResult(pool[7], 2032).drills);

/* -------------------------------------------- a full season with stats */
let s = fresh();
const startYear = s.year,
  dates = DateBook.leagueDates(s.year, s.schedule.length);
const stories = () => s.franchise.office?.stories || [];
const events = (kind) => (s.franchise.eventLog?.events || []).filter((e) => e.kind === kind);
function seedStats(st) {
  for (let t = 0; t < 32; t++) {
    const list = S.roster(st, t);
    for (const [k, p] of list.filter((p) => p.status === "active").entries()) {
      const r = ((t * 37 + k * 11) % 23) / 22;
      p.stats ??= {};
      p.stats[st.year] =
        p.pos === "QB" ? { passYards: 3000 + r * 2200, passTD: 18 + r * 22, attempts: 520, completions: 340, interceptions: 12 - r * 8, snaps: 1000 }
        : ["RB", "WR", "TE"].includes(p.pos) ? { rushYards: p.pos === "RB" ? 500 + r * 1000 : 0, recYards: p.pos !== "RB" ? 400 + r * 900 : 150, recTD: r * 10, rushTD: p.pos === "RB" ? r * 12 : 0, receptions: 40 + r * 60, snaps: 800 }
        : ["DL", "LB", "CB", "S"].includes(p.pos) ? { tackles: 30 + r * 90, sacks: ["DL", "LB"].includes(p.pos) ? r * 14 : 0, defInterceptions: ["CB", "S"].includes(p.pos) ? r * 6 : 0, snaps: 800 }
        : { snaps: 300 };
    }
  }
}
function playSeason(withStats) {
  for (let w = 0; w < s.schedule.length; w++) {
    if (withStats && w === s.schedule.length - 1) seedStats(s);
    L.finishRound(s, s.schedule[w].map((g, i) => ({ ...g, score: (g.a + g.b + w + i) % 3 ? [27, 20] : [17, 24] })));
  }
  assert.equal(s.phase, "playoffs");
  for (let r = 0; r < 4; r++) {
    if (r === 3) {
      // NFL Honors is the Thursday before the championship: held once championship week begins.
      assert(C.ceremonyDone(s, `honors:${s.year}`), "honors are held before the championship game");
      assert(C.ceremonyDone(s, `hof-finalists:${s.year + 1}`), "Hall of Fame finalists are named in January");
    }
    L.finishRound(s, s.playoffs.rounds.at(-1).map((g) => ({ ...g, score: [24, 17] })));
  }
  assert.equal(s.phase, "offseason");
}
function holiday(target) {
  Calendar.beginCalendarHoliday(s, target);
  for (let guard = 0; guard < 400; guard++) {
    const a = Calendar.nextCalendarAction(s, target);
    if (a.kind === "done") break;
    // The first day goes through a transaction like the real holiday; the rest mutate in place for speed.
    if (guard === 0) s = S.transact(s, (q) => Calendar.advanceCalendarDay(q, a.date));
    else Calendar.advanceCalendarDay(s, a.date);
  }
  assert.equal(DateBook.ensureCalendar(s).date, target);
}

playSeason(true);
const year = startYear,
  ballot = s.franchise.awardBallots[year],
  honors = s.franchise.ceremonies.honors[year];
assert(honors, "NFL Honors ran before the championship");
assert.equal(honors.date, dates.honors, "Honors are dated the Thursday before the championship");
assert(honors.date < dates.championship);
// Winners match the sealed awards race and the announced awards.
for (const a of honors.awards) {
  const race = ballot.races[a.award];
  assert.equal(a.winner?.name ?? null, race.results.find((r) => r.winner)?.name ?? null, `${a.award} winner matches the ballot`);
  if (a.winner) assert(s.franchise.awards.some((x) => x.year === year && x.award === a.award && x.name === a.winner.name), `${a.award} winner is in the awards ledger`);
}
assert(honors.awards.find((a) => a.award === "MVP").winner, "an MVP is named");
assert(honors.allPro.length >= 20, "an All-Pro team is announced");
const honorsStories = stories().filter((x) => x.feature?.type === "awards");
assert(honorsStories.length >= 2 && honorsStories.every((x) => x.feature.data && x.title && x.body), "awards stories carry feature payloads");
assert(events("Honors").length <= 1);
if (honors.awards.some((a) => a.yours)) assert.equal(events("Honors").length, 1, "your finalist or winner gets the Honors ceremony");
// The Hall of Fame class was elected the same night.
const hofYear = year + 1,
  hof = s.franchise.ceremonies.hof[hofYear];
assert(hof.inductees.length >= 4 && hof.inductees.length <= 8, `class size 4–8 (got ${hof.inductees.length})`);
assert(hof.finalists.length >= hof.inductees.length && hof.finalists.length <= 15);
assert.equal(new Set(hof.inductees.map((x) => x.id)).size, hof.inductees.length, "no duplicate inductees");
assert(hof.inductees.every((x) => x.vote >= 80) && hof.finalists.filter((f) => !hof.inductees.some((i) => i.id === f.id)).every((x) => x.vote < 80));
const eligible = new Map(C.hallCandidates(s, hofYear).map((x) => [x.id, x]));
assert(C.hallCandidates(s, hofYear).every((x) => x.eligible <= hofYear), "candidates are five seasons retired");
assert(!C.hallCandidates(s, hofYear).some((x) => x.name === "Tom Brady"), "Brady (last season 2022) is not eligible for 2027");
assert(hof.inductees.every((x) => !s.franchise.hall.some((h) => h.id === x.id && h.inducted)), "not enshrined until the summer");
assert(stories().some((x) => x.feature?.type === "hof" && x.feature.data.kind === "class"));
void eligible;

/* ---------------------------------------------------- the offseason calendar */
const storyCount = stories().length;
// Re-running the hooks on the same day changes nothing.
C.runCeremonies(s);
C.holdHonors(s);
C.electHallClass(s);
assert.equal(stories().length, storyCount, "ceremonies are idempotent");
holiday(DateBook.addDays(dates.combine, -1));
assert(!C.ceremonyDone(s, `combine:${hofYear}`), "no combine before its date");
assert(s.prospects.every((p) => !p.combine), "results are lazily created");
// Fog before the combine: athletic ranges are wide.
const sampleId = s.prospects.find((p) => p.pos === "WR").id;
const before = attributeRanges(s, s.prospects.find((p) => p.id === sampleId), -2).find((r) => r.key === "speed");
holiday(DateBook.addDays(dates.combine, 1));
const combine = s.franchise.ceremonies.combine[hofYear],
  sample = s.prospects.find((p) => p.id === sampleId);
assert(combine && combine.date === dates.combine, "the combine ran on its calendar date");
assert(s.prospects.every((p) => p.combine?.year === hofYear), "every prospect has results");
assert.equal(events("Combine").length, 1, "one combine cutscene event");
const cs = stories().filter((x) => x.feature?.type === "combine");
assert(cs.length >= 2 && cs.every((x) => x.feature.data.year === hofYear), "combine news carries feature payloads");
assert(cs.some((x) => /forty/.test(x.title)), "the fastest 40 makes the news");
// Combine numbers narrow athletic fog and leave untested attributes alone.
if (Number.isFinite(sample.combine.drills.forty)) {
  const after = attributeRanges(s, sample, -2),
    speed = after.find((r) => r.key === "speed"),
    hands = after.find((r) => r.key === "catching");
  assert(speed.combine && speed.hi - speed.lo <= 2 * halfWidth(COMBINE_CONFIDENCE), "speed range narrows after the 40");
  assert(speed.hi - speed.lo < before.hi - before.lo);
  assert(speed.lo <= ensurePlayerRatings(sample).attributes.speed && speed.hi >= ensurePlayerRatings(sample).attributes.speed, "ranges still contain the truth");
  assert(!hands.combine && hands.hi - hands.lo > speed.hi - speed.lo, "catching is not measured at the combine");
}
// Draft stock: risers climb the consensus board, fallers slide.
const board = consensusBoard(s),
  riser = s.prospects.find((p) => p.id === combine.risers[0]),
  faller = s.prospects.find((p) => p.id === combine.fallers[0]);
assert(riser && riser.combine.stock >= 1.5 && faller && faller.combine.stock <= -1.5);
const rankWithout = (p) => 1 + s.prospects.filter((q) => q.id !== p.id && prospectProfile(q).consensusScore + (q.combine?.stock || 0) > prospectProfile(p).consensusScore).length;
const rankOf = (id) => board.find((x) => x.p.id === id).rank,
  movers = (ids) => ids.map((id) => s.prospects.find((p) => p.id === id));
assert(board.every((x) => Math.abs(x.score - prospectProfile(x.p).consensusScore - (x.p.combine?.stock || 0)) < 1e-9), "public grades include combine stock");
assert(movers(combine.risers).every((p) => rankOf(p.id) <= rankWithout(p)), "risers never drop");
assert(movers(combine.fallers).every((p) => rankOf(p.id) >= rankWithout(p)), "fallers never climb");
assert([...movers(combine.risers), ...movers(combine.fallers)].some((p) => rankOf(p.id) !== rankWithout(p)), "testing moves draft stock");
// The draft doesn't rerun it; drafted rookies keep their combine card.
P.beginDraft(s);
assert.equal(events("Combine").length, 1);
for (let guard = 0; s.franchise.draft.cursor < s.franchise.draft.picks.length && guard < 10; guard++) P.draftPick(s, s.prospects[0].id);
assert(S.roster(s).some((p) => p.combine?.year === hofYear), "rookies keep their combine results");
// Summer: enshrinement on its date, plaques join the Hall.
holiday(DateBook.addDays(dates.enshrinement, -1));
assert(!C.ceremonyDone(s, `hof-enshrine:${hofYear}`));
holiday(DateBook.addDays(dates.camp, -1));
assert.equal(s.franchise.ceremonies.hof[hofYear].enshrined, dates.enshrinement);
const plaques = s.franchise.hall.filter((h) => h.inducted && h.classYear === hofYear);
assert.equal(plaques.length, hof.inductees.length, "every inductee has a plaque");
assert(stories().some((x) => x.feature?.type === "hof" && x.feature.data.kind === "induction"));
const connected = hof.inductees.some((x) => x.teams.includes(s.team));
assert.equal(events("HallOfFame").length, connected ? 1 : 0, "the ceremony plays only for your club's people");

/* -------------------------------------- a second year: nothing repeats */
L.rollSeason(s);
P.trimRoster(s);
assert.equal(s.year, startYear + 1);
assert(s.prospects.every((p) => !p.combine), "the new class has not tested yet");
playSeason(false);
const d2 = DateBook.leagueDates(s.year, s.schedule.length);
holiday(DateBook.addDays(d2.camp, -1));
const hof2 = s.franchise.ceremonies.hof[s.year + 1];
assert(hof2.inductees.length >= 4 && hof2.inductees.length <= 8);
assert(!hof2.inductees.some((x) => hof.inductees.some((y) => y.id === x.id)), "no one is inducted twice");
assert(hof2.inductees.some((x) => x.name === "Tom Brady" || x.name === "J.J. Watt" || x.name === "Matt Ryan"), "newly eligible greats join the ballot");
L.rollSeason(s);
for (const kind of ["Combine", "HallOfFame", "Honors"]) {
  const keys = events(kind).map((e) => e.key);
  assert.equal(new Set(keys).size, keys.length, `${kind} fires once per year`);
  assert(keys.length <= 2);
}
assert.equal(events("Combine").length, 2, "one combine per offseason");
for (const key of [`combine:${startYear + 1}`, `combine:${startYear + 2}`, `honors:${startYear}`, `hof-class:${startYear + 1}`, `hof-enshrine:${startYear + 2}`]) assert(C.ceremonyDone(s, key), key);
assert(Object.keys(s.franchise.ceremonies.honors).length >= 1);

/* -------------------------------------- saves, visuals and scenes */
const reloaded = JSON.parse(JSON.stringify(s));
S.migrate(reloaded);
assert.deepEqual(reloaded.franchise.ceremonies.done, s.franchise.ceremonies.done, "ceremony ledger survives a save");
const legacy = fresh();
delete legacy.franchise.ceremonies;
assert.equal(C.ensureCeremonies(legacy).version, 1, "older saves initialise lazily");
for (const story of stories().filter((x) => x.feature)) {
  const fn = { combine: combineVisual, hof: hofVisual, awards: awardsVisual }[story.feature.type];
  assert(fn, story.feature.type);
  const full = fn(story.feature.data, story),
    compact = fn(story.feature.data, story, { compact: true });
  assert(typeof full === "string" && full.includes("cer-fv"), `${story.feature.type}/${story.feature.data.kind} visual`);
  assert(compact.includes("cer-poster"), `${story.feature.type}/${story.feature.data.kind} news-card poster`);
}
const ev = events("Combine")[0];
const scene = sceneData(ev, s);
assert.equal(scene.kind, "combine");
assert(scene.lines.length === 4 && scene.svg().startsWith("<svg"));
assert(combineSceneSVG({ name: "Test", playerId: "x", drills: { forty: 4.41, split: 1.53, bench: 18, vertical: 37 } }).includes("4.41"), "the stopwatch stops on the official time");
console.log("PASS: combine distributions/determinism, fog and draft stock, NFL Honors from the sealed ballot, Hall of Fame class size/eligibility/no repeats, one event per ceremony across two simulated offseasons, feature payloads and visuals.");
