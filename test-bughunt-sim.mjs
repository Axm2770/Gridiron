// Regression tests for simulation, roster, cap and save bugs found by long-career runs
// (5+ seasons through the calendar, draft, free agency and training camp).
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import * as S from "./dist/franchise/state.mjs";
import * as L from "./dist/franchise/lifecycle.mjs";
import * as P from "./dist/franchise/personnel.mjs";
import * as Ct from "./dist/franchise/contracts.mjs";
import * as W from "./dist/franchise/world.mjs";
import * as A from "./dist/franchise/awards.mjs";
import * as DateBook from "./dist/franchise/calendar-core.mjs";
import * as Calendar from "./dist/franchise/calendar-operations.mjs";
import { processDevelopment, offseasonDevelopment } from "./dist/franchise/development.mjs";
import { serializeCareer, ensureCareerRatings } from "./dist/franchise/ratings.mjs";
import { parseCareerSave, MAX_IMPORT_BYTES } from "./dist/franchise/save-store.mjs";
import { pendingDecisions } from "./dist/franchise/newsroom.mjs";
import { complianceReport } from "./dist/franchise/compliance.mjs";
import { roundJob } from "./dist/franchise/matchday-sim.mjs";
import { simulateGame } from "./dist/franchise/fast-worker.mjs";

const ctx = { console, Math, Date, setTimeout() {}, localStorage: { getItem: () => null, setItem() {} }, document: { getElementById: () => ({ innerHTML: "", style: {}, showModal() {}, close() {} }), querySelector: () => ({}), querySelectorAll: () => [] } };
ctx.window = ctx;
ctx.addEventListener = () => {};
vm.createContext(ctx);
vm.runInContext(fs.readFileSync("dist/game.js", "utf8"), ctx);
vm.runInContext(fs.readFileSync("dist/match.js", "utf8"), ctx);
globalThis.clubs = JSON.parse(vm.runInContext("JSON.stringify(clubs)", ctx));
const legacy = (team = 12) => JSON.parse(vm.runInContext(`JSON.stringify(fresh(${team}))`, ctx));
function fresh(team = 12, role = "GM") {
  const s = legacy(team);
  s.coach = { name: "Bughunt QA", style: "Balanced", calling: "Manual" };
  S.migrate(s);
  s.franchise.role = role;
  DateBook.ensureCalendar(s);
  return s;
}
const healthyActive = (s, t, pos) => S.roster(s, t).filter((p) => p.pos === pos && p.status === "active" && !p.injury && !p.holdout).length;
const activeCount = (s, t) => S.roster(s, t).filter((p) => p.status === "active").length;
function allIds(s) {
  const ids = [];
  for (let t = 0; t < 32; t++) for (const p of S.roster(s, t)) ids.push(p.id);
  return [...ids, ...s.agents.map((p) => p.id)];
}

/* 1. A CPU club at 53 that wins a free agent releases an *active* player, not a practice-squad one. */
{
  const s = fresh();
  // Every club's lowest-rated non-starters are practice-squad players: the old code cut one of them.
  for (let t = 0; t < 32; t++) {
    if (t === s.team) continue;
    assert.equal(activeCount(s, t), 53);
    for (let i = 0; i < 4; i++) {
      const p = S.makePlayer(`ps-${t}-${i}`, "WR", 9000 + t * 10 + i);
      p.ovr = 40;
      p.status = "practice";
      S.roster(s, t).push(p);
      s.franchise.contracts[p.id] = S.basicContract(p, t, s.year);
    }
  }
  const star = S.makePlayer("fa-star", "CB", 4242);
  star.ovr = 95;
  star.status = "free";
  s.agents.push(star);
  const c = S.basicContract(star, 3, s.year);
  s.franchise.market.offers = [{ id: "cpu-star", playerId: star.id, team: 3, contract: c, close: 0 }];
  s.franchise.market.phase = "Open";
  W.marketDay(s, { calendarManaged: true, compliance: false });
  const home = [...Array(32).keys()].find((x) => S.roster(s, x).some((p) => p.id === star.id));
  assert(home !== undefined && home !== s.team, "a CPU club signed him");
  for (let t = 0; t < 32; t++) {
    if (t === s.team) continue;
    assert(activeCount(s, t) <= 53, "a CPU signing at 53 keeps the active roster at 53");
    assert.equal(S.roster(s, t).filter((p) => p.status === "practice").length, 4, "the practice squad was left alone");
  }
}

/* 2. CPU roster upkeep: no club plays without a healthy QB or kicker, and none goes past 53. */
{
  const s = fresh();
  const t = 5,
    club = s.franchise.clubs[t];
  // Lose every QB and kicker, and stuff the roster past 53.
  for (const p of club.players.filter((p) => p.pos === "QB")) p.injury = 3;
  club.players = club.players.filter((p) => p.pos !== "K");
  for (let i = 0; i < 6; i++) {
    const p = S.makePlayer(`extra-${i}`, "LB", 7100 + i);
    club.players.push(p);
    s.franchise.contracts[p.id] = S.basicContract(p, t, s.year);
  }
  const fa = S.makePlayer("fa-kicker", "K", 5151);
  fa.status = "free";
  fa.ovr = 99;
  s.agents.push(fa);
  W.cpuRosterUpkeep(s);
  assert(healthyActive(s, t, "QB") >= 1 && healthyActive(s, t, "K") >= 1, "QB and K holes are filled");
  assert(club.players.some((p) => p.id === "fa-kicker"), "the free-agent kicker was signed first");
  assert(!s.agents.some((p) => p.id === "fa-kicker"));
  assert(activeCount(s, t) <= 53, "back to 53 active");
  for (const [pos, min] of Object.entries(W.CPU_DEPTH)) assert(healthyActive(s, t, pos) >= min, `${pos} depth`);
  for (const p of club.players) assert.equal(s.franchise.contracts[p.id]?.team, t, "every player has a club contract");
  const ids = allIds(s);
  assert.equal(new Set(ids).size, ids.length, "no player is in two places");
  assert(S.validate(s));
  // Idempotent once legal.
  const before = JSON.stringify(club.players.map((p) => [p.id, p.status]));
  W.cpuRosterUpkeep(s);
  assert.equal(JSON.stringify(club.players.map((p) => [p.id, p.status])), before);
}

/* 3. Cap hell: a club over the cap can still release or trade its way back under. */
{
  let s = fresh();
  const year = S.financeYear(s);
  s.franchise.rules.cap = S.capLedger(s).used - 20 * S.MILLION;
  assert(S.capLedger(s).room < 0);
  const byHit = s.roster.slice().sort((a, b) => S.capHit(s.franchise.contracts[b.id], year) - S.capHit(s.franchise.contracts[a.id], year));
  const before = S.capLedger(s).room;
  s = S.transact(s, (q) => Ct.cut(q, byHit[0].id));
  assert(S.capLedger(s).room > before, "a release that frees room is allowed while over the cap");
  // A release that adds dead money without saving anything is still refused.
  const p = s.roster.find((x) => !x.starter) || s.roster[0],
    c = s.franchise.contracts[p.id];
  c.guarantees[0] = c.base[0];
  c.bonus = 60 * S.MILLION;
  c.prorate = 3;
  assert(S.capLedger(s).room < 0);
  assert.throws(() => S.transact(s, (q) => Ct.cut(q, p.id)), /dead money/);
  assert.equal(S.capWorse(-5, -10), false);
  assert.equal(S.capWorse(-10, -5), true);
  assert.equal(S.capWorse(5, 10), false);
}

/* 3b. Coordinator careers: the front office fixes what an OC/DC is not allowed to touch. */
{
  for (const role of ["OC", "DC"]) {
    const s = fresh(12, role);
    assert.throws(() => P.trimRoster(s), /not yours/);
    for (const p of s.roster.filter((p) => p.pos === "QB" || p.pos === "K")) p.injury = 4;
    for (let i = 0; i < 3; i++) {
      const p = S.makePlayer(`camp-extra-${i}`, "LB", 8800 + i);
      s.roster.push(p);
      s.franchise.contracts[p.id] = S.basicContract(p, s.team, s.year);
    }
    s.franchise.rules.cap = S.capLedger(s).used - 3 * S.MILLION;
    assert.throws(() => complianceReport(s, { game: true }).ok || (() => { throw Error("blocked"); })(), /blocked/);
    const moves = W.frontOfficeUpkeep(s);
    assert(moves.length, "the general manager acted");
    const report = complianceReport(s, { game: true });
    assert(report.ok, `${role} career is no longer stuck: ${report.issues.map((i) => i.message).join("; ")}`);
    assert(s.franchise.events.some((e) => e.title === "Front office roster moves"), "the moves are reported");
    assert(S.validate(s));
  }
  // A role with roster authority still decides for itself.
  const s = fresh(12, "GM");
  for (const p of s.roster.filter((p) => p.pos === "QB")) p.injury = 4;
  assert.deepEqual(W.frontOfficeUpkeep(s), []);
  assert(!complianceReport(s, { game: true }).ok);
}

/* 3c. "Delegate reserve recruitment" at a full 53 fills an injury hole instead of doing nothing. */
{
  const s = fresh(12, "GM");
  assert.equal(activeCount(s, s.team), 53);
  const ol = s.roster.filter((p) => p.pos === "OL" && p.status === "active");
  for (const p of ol.slice(0, ol.length - 3)) p.injury = 5;
  assert(S.gameEligibility(s).some((m) => /healthy OL/.test(m)), "three healthy OL can't play");
  P.recruitDepth(s);
  assert.deepEqual(S.gameEligibility(s), [], "the club can play again");
  assert(activeCount(s, s.team) <= 53, "still 53 active");
  assert(s.roster.filter((p) => p.status === "practice").length <= s.franchise.rules.practice);
  assert(S.validate(s));
}

/* 4. The free-agent pool is bounded when camps open; shortlisted players stay. */
{
  const s = fresh();
  for (let i = 0; i < 900; i++) {
    const p = S.makePlayer(`pool-${i}`, S.POS[i % 22], 31000 + i);
    p.status = "free";
    if (i % 3 === 0) p.stats = { [s.year]: { snaps: 100 + i } };
    s.agents.push(p);
  }
  (s.franchise.office ??= {}).scouting = { shortlist: ["pool-1"] };
  const weakest = s.agents.slice().sort((a, b) => a.ovr - b.ovr)[0];
  if (weakest.id !== "pool-1") s.franchise.office.scouting.shortlist.push(weakest.id);
  const retiredBefore = (s.franchise.retired || []).length;
  const gone = W.pruneFreeAgents(s, s.year + 1);
  assert(s.agents.length <= W.FREE_AGENT_POOL + 2, "pool capped");
  assert(s.agents.some((p) => p.id === weakest.id), "a shortlisted player is never dropped");
  assert(gone.length > 400);
  assert.equal((s.franchise.retired || []).length - retiredBefore, gone.filter((p) => Object.keys(p.stats || {}).length).length, "players with a career get a retirement record");
  assert(Math.max(...gone.map((p) => p.ovr)) <= Math.max(...s.agents.map((p) => p.ovr)));
}

/* 5. Progression history keeps detail only for the last four reports. */
{
  const s = fresh();
  for (let w = 0; w < 10; w++) {
    s.week = w;
    processDevelopment(s, []);
  }
  const h = s.roster[0].progression.history;
  assert(h.length >= 8);
  assert(h.slice(0, -4).every((r) => !("reasons" in r) && !("attributeDirections" in r) && Number.isFinite(r.ovr)));
  assert(h.slice(-4).every((r) => Array.isArray(r.reasons)));
}

/* 5b. Aging: veterans past their prime decline each offseason (the old flat −0.18 kept 37-year-olds
   at 85+ and the league average climbed 75 → 82 in six seasons); young players don't. Rookies
   enter below the veteran range. */
{
  for (const [pos, age] of [["OL", 32], ["RB", 28], ["QB", 33]])
    for (let k = 0; k < 6; k++) {
      const p = S.makePlayer(`vet-${pos}-${k}`, pos, 900 + k);
      Object.assign(p, { ovr: 86, pot: 90, age });
      const trail = [p.ovr];
      for (let y = 0; y < 5; y++) {
        p.age++;
        offseasonDevelopment(p, 2027 + y, 0);
        trail.push(p.ovr);
      }
      assert(trail.every((v, i) => !i || v <= trail[i - 1]), `${pos} ratings never rise past the prime: ${trail}`);
      assert(trail[0] - trail.at(-1) >= 6, `${pos} from ${age} loses real ground in five seasons: ${trail}`);
      offseasonDevelopment(p, 2031, 0);
      assert.equal(p.ovr, trail.at(-1), "offseason development is once a year");
    }
  const young = S.makePlayer("young-wr", "WR", 77);
  Object.assign(young, { ovr: 80, pot: 90, age: 23 });
  offseasonDevelopment(young, 2027, 0);
  assert(young.ovr >= 80, "a pre-peak player does not decline");
  const rookies = Array.from({ length: 400 }, (_, i) => S.makePlayer(`r-${i}`, S.POS[i % 22], 5000 + i, true)),
    vets = Array.from({ length: 400 }, (_, i) => S.makePlayer(`v-${i}`, S.POS[i % 22], 5000 + i));
  const mean = (a) => a.reduce((n, p) => n + p.ovr, 0) / a.length;
  assert(Math.max(...rookies.map((p) => p.ovr)) <= 78 && mean(rookies) < mean(vets) - 4, "rookies start below veterans");
  // Draft classes are generated with consecutive seeds (year * 967 + i, as in rollSeason). They
  // used to be uniform (all 260 prospects within 3 OVR) and swing 52 ↔ 78 from year to year.
  const medians = [];
  for (const year of [2027, 2028, 2029, 2030, 2031]) {
    const cls = Array.from({ length: 260 }, (_, i) => S.makePlayer(`prospect-${year}-${i}`, S.POS[i % 22], year * 967 + i, true).ovr).sort((a, b) => a - b);
    assert(cls[234] - cls[26] >= 15, `${year} class has stars and long shots (${cls[26]}–${cls[234]})`);
    medians.push(cls[130]);
  }
  assert(Math.max(...medians) - Math.min(...medians) <= 5, `class strength is steady year to year (${medians})`);
}

/* 6. Draft order: playoff clubs pick after non-playoff clubs, the champion last. */
{
  const s = fresh();
  for (let w = 0; w < s.schedule.length; w++) L.finishRound(s, s.schedule[w].map((g, i) => ({ ...g, score: (g.a * 7 + g.b * 3 + w + i) % 3 ? [27, 20] : [17, 24] })));
  for (let r = 0; r < 4; r++) L.finishRound(s, s.playoffs.rounds.at(-1).map((g) => ({ ...g, score: [24, 17] })));
  assert.equal(s.phase, "offseason");
  const order = P.draftOrder(s),
    champion = s.history.at(-1).champion,
    playoffTeams = new Set(s.playoffs.rounds.flat().flatMap((g) => [g.a, g.b]));
  assert.equal(order.length, 32);
  assert.equal(new Set(order).size, 32);
  assert.equal(order.at(-1), champion, "the champion picks last");
  const final = s.playoffs.rounds.at(-1)[0];
  assert.equal(order.at(-2), final.a === champion ? final.b : final.a, "the runner-up picks 31st");
  assert(order.slice(0, 32 - playoffTeams.size).every((t) => !playoffTeams.has(t)), "non-playoff clubs pick first");
  for (let i = 1; i < 32 - playoffTeams.size; i++) assert(s.teams[order[i - 1]].w <= s.teams[order[i]].w, "worst record picks first");
  P.beginDraft(s);
  assert.equal(s.franchise.draft.picks[0].team, order[0]);
}

/* 7. Saves: export size cap, malformed files, round trips and idempotent migration. */
{
  assert(MAX_IMPORT_BYTES >= 150_000_000, "long careers (40–60 MB) can be imported again");
  for (const bad of ["", "{", "null", "42", '"text"', "[]", '{"format":"GridironCareer","state":null}', '{"format":"GridironCareer"}', '{"team":40,"year":2026,"schedule":[],"roster":[],"teams":[]}', '{"team":1,"year":"2026","schedule":[],"roster":[],"teams":[]}'])
    assert.throws(() => parseCareerSave(bad), (e) => e instanceof Error && !(e instanceof TypeError) && /career/i.test(e.message));
  // An old pre-franchise save migrates once; a second migrate changes nothing.
  const old = legacy(7);
  old.coach = { name: "Old save" };
  S.migrate(old);
  const once = JSON.stringify(old);
  S.migrate(old);
  assert.equal(JSON.stringify(old), once, "migrate is idempotent");
  assert(S.validate(old));
  const roundTrip = (s) => {
    const back = parseCareerSave(serializeCareer(s)).state;
    S.migrate(back);
    S.validate(back);
    ensureCareerRatings(back);
    return back;
  };
  // Through the draft and free agency, saving and reloading at each step, two seasons running.
  let s = fresh(12, "GM");
  for (let season = 0; season < 2; season++) {
    for (let w = 0; w < s.schedule.length; w++) {
      if (w === 8) s = roundTrip(s);
      L.finishRound(s, s.schedule[w].map((g, i) => ({ ...g, score: (g.a + g.b + w + i + season) % 3 ? [27, 20] : [17, 24] })));
    }
    while (s.phase === "playoffs") L.finishRound(s, s.playoffs.rounds.at(-1).map((g) => ({ ...g, score: [24, 17] })));
    s = roundTrip(s);
    const dates = DateBook.leagueDates(s.year, s.schedule.length);
    const holiday = (target) => {
      Calendar.beginCalendarHoliday(s, target);
      for (let guard = 0; guard < 400; guard++) {
        const a = Calendar.nextCalendarAction(s, target);
        if (a.kind === "done") return;
        for (const m of pendingDecisions(s)) m.status = "handled";
        Calendar.advanceCalendarDay(s, a.date);
      }
    };
    holiday(DateBook.addDays(dates.freeAgency, 1));
    s = roundTrip(s); // mid free agency
    holiday(DateBook.addDays(dates.draft, -1));
    for (const m of pendingDecisions(s)) m.status = "handled";
    P.beginDraft(s);
    s = roundTrip(s); // mid draft (user on the clock or picks pending)
    while (s.franchise.draft.cursor < s.franchise.draft.picks.length) {
      P.ensureDraftRoom(s);
      P.draftPick(s, s.prospects.slice().sort((a, b) => b.ovr - a.ovr)[0].id);
    }
    holiday(DateBook.addDays(dates.camp, -1));
    for (const m of pendingDecisions(s)) m.status = "handled";
    s = S.transact(s, (q) => L.rollSeason(q));
    P.trimRoster(s);
    s = roundTrip(s);
    // Camp invariants for every CPU club.
    for (let t = 0; t < 32; t++) {
      if (t === s.team) continue;
      assert(activeCount(s, t) <= 53, `team ${t} active ${activeCount(s, t)}`);
      for (const [pos, min] of Object.entries({ QB: 1, RB: 1, WR: 2, TE: 1, OL: 5, DL: 3, LB: 2, CB: 2, S: 2, K: 1 }))
        assert(healthyActive(s, t, pos) >= min, `team ${t} needs ${min} healthy ${pos}`);
    }
    const ids = allIds(s);
    assert.equal(new Set(ids).size, ids.length, "no duplicate players after camp");
    assert(s.agents.length <= W.FREE_AGENT_POOL + 20, `free-agent pool bounded (${s.agents.length})`);
  }
  assert.equal(s.year, 2028);
  assert(Object.keys(s.franchise.statBook.lastTotals).every((k) => Number(k.split(":")[0]) >= s.year - 1), "stat diff snapshots from finished seasons are dropped");
  // Old award ballots drop their candidate snapshot once announced; the races are kept.
  s.franchise.awardBallots[2026] ??= { year: 2026, announced: true, snapshot: { players: [] }, races: {} };
  s.franchise.awardBallots[2026].announced = true;
  s.franchise.awardBallots[2026].snapshot ??= { players: [] };
  A.freezeAwards(s);
  assert(!("snapshot" in s.franchise.awardBallots[2026]), "an announced ballot from an earlier season is compacted");
  assert(s.franchise.awardBallots[2026].races, "its results stay");
  assert(s.franchise.awardBallots[s.year].snapshot, "the open ballot keeps its snapshot");
}

/* 8. A save made at halftime of a live game finishes with exactly the same result after a reload. */
{
  const s = fresh(12, "HC");
  ensureCareerRatings(s);
  const g = s.schedule[0].find((x) => x.a === s.team || x.b === s.team);
  const half = simulateGame({ ...roundJob(s, g), target: "halftime" });
  assert(!half.completed && half.match.halftime, "stopped at halftime");
  s.live = structuredClone(half.match);
  const back = parseCareerSave(serializeCareer(s)).state;
  S.migrate(back);
  S.validate(back);
  ensureCareerRatings(back);
  const direct = simulateGame(roundJob(s, g, { live: s.live })),
    reloaded = simulateGame(roundJob(back, g, { live: back.live }));
  assert(direct.completed && reloaded.completed);
  assert.deepEqual(reloaded.score, direct.score, "reloading mid-game does not change the result");
  assert.equal(reloaded.plays, direct.plays);
}

console.log("PASS: CPU signings free active spots, CPU depth upkeep, coordinator front-office moves, reserve recruitment at a full 53, veteran decline, rookie range and spread-out draft classes, halftime save/reload determinism, cap-hell releases/trades, bounded free-agent pool, compact progression history, NFL draft order, import size/malformed saves, idempotent migration and two-season save round trips through FA, the draft and camp.");
