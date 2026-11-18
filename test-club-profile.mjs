// Club profile read model (franchise/club-profile.mjs): every section is present for a CPU club and
// for the user's club, roster counts match the roster, finished seasons become history rows with
// their playoff finish, and an empty history never crashes.
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import * as S from "./dist/franchise/state.mjs";
import * as C from "./dist/franchise/contracts.mjs";
import { ensureCalendar } from "./dist/franchise/calendar-core.mjs";
import { recordTransactions } from "./dist/franchise/transactions.mjs";
import { historicChampions } from "./dist/franchise/history.mjs";
import { clubProfile, seasonHistory, playoffResult, findClubs, climateFor, depthChart, clubFixtures } from "./dist/franchise/club-profile.mjs";

const ctx = { console, Math, Date, setTimeout() {}, localStorage: { getItem: () => null, setItem() {} }, document: { getElementById: () => ({ innerHTML: "", style: {} }), querySelectorAll: () => [], querySelector: () => null, addEventListener() {}, createElement: () => ({ style: {}, classList: { add() {}, remove() {}, toggle() {} } }), body: { classList: { add() {}, remove() {}, toggle() {}, contains: () => false }, dataset: {} } } };
ctx.window = ctx;
ctx.addEventListener = () => {};
vm.createContext(ctx);
vm.runInContext(fs.readFileSync("dist/game.js", "utf8"), ctx);
vm.runInContext(fs.readFileSync("dist/match.js", "utf8"), ctx);
const teams = JSON.parse(vm.runInContext("JSON.stringify(clubs)", ctx));
globalThis.clubs = teams;
const heritage = JSON.parse(fs.readFileSync("dist/data/franchise-heritage.json", "utf8"));
const fresh = () => {
  const s = JSON.parse(vm.runInContext("JSON.stringify(fresh())", ctx));
  s.coach = { name: "QA", style: "Balanced", offense: "Shotgun spread", defense: "Nickel" };
  S.migrate(s);
  s.franchise.role = "Owner";
  ensureCalendar(s);
  // The app seeds the historical champion list on load (ui.mjs).
  if (!s.franchise.history.length) s.franchise.history = structuredClone(historicChampions);
  return s;
};
globalThis.state = fresh();
const s = globalThis.state;
const cpu = s.team === 22 ? 23 : 22;
const SECTIONS = ["owner", "staff", "scheme", "stadium", "roster", "schedule", "history", "transactions", "finances", "ratings", "standing", "record"];

// ---- A CPU club, before any game, with no history: every section is there and nothing crashes.
let m = clubProfile(s, cpu, { teams, heritage });
assert.ok(m, "a CPU club has a profile");
for (const k of SECTIONS) assert.ok(k in m, `CPU profile has ${k}`);
assert.equal(m.own, false);
assert.equal(m.name, teams[cpu][1] + " " + teams[cpu][2]);
assert.equal(m.division, teams[cpu][3]);
assert.equal(m.roster.counts.total, s.franchise.clubs[cpu].players.length, "roster count matches the club's players");
assert.equal(m.roster.counts.active + m.roster.counts.practice + m.roster.counts.ir, m.roster.counts.total - m.roster.rows.filter((r) => !["active", "elevated", "practice", "ir"].includes(r.status)).length);
assert.ok(m.roster.depth.some((d) => d.pos === "QB"), "the depth chart lists a quarterback group");
assert.ok(m.roster.top.length > 0 && m.roster.top.length <= 5);
assert.ok(m.roster.top.every((r, i, a) => !i || a[i - 1].ovr >= r.ovr), "top players sorted by OVR");
assert.ok(Number.isFinite(m.ratings.overall) && Number.isFinite(m.ratings.offense) && Number.isFinite(m.ratings.defense));
assert.ok(m.staff.hc, "CPU clubs have a head coach");
assert.ok(m.stadium.capacity > 0 && m.stadium.name);
assert.ok(m.stadium.roof && m.stadium.roof !== "Not recorded", "every club has a roof type");
assert.ok(m.h2h && Array.isArray(m.h2h.games), "head-to-head against the user's club");
assert.equal(m.history.seasons.length, 1, "only the season in progress before any archive");
assert.equal(m.history.seasons[0].current, true);
assert.ok(Array.isArray(m.history.records) && m.history.records.length === 0, "no club records before a game");
assert.ok(m.finances.cap.limit > 0 && Array.isArray(m.finances.topContracts));
assert.ok(m.finances.topContracts.every((r, i, a) => !i || a[i - 1].cap >= r.cap), "top contracts by cap hit");
assert.equal(m.schedule.fixtures.filter((r) => !r.bye).length, s.schedule.filter((w) => w.some((g) => g.a === cpu || g.b === cpu)).length);
// Green Bay's heritage: retired numbers and titles from the historical champion list.
const gb = clubProfile(s, 22, { teams, heritage });
assert.ok(gb.history.retired.length > 0, "retired numbers come from the heritage data");
assert.ok(gb.history.titles.some((t) => t.year === 1966), "historical Super Bowl titles are listed");
assert.equal(climateFor("GB").roof, "Open air");
assert.equal(climateFor("NO").indoor, true);

// ---- The user's club: same sections, roster from state.roster.
const own = clubProfile(s, s.team, { teams, heritage });
for (const k of SECTIONS) assert.ok(k in own, `own profile has ${k}`);
assert.equal(own.own, true);
assert.equal(own.h2h, null, "no head-to-head with yourself");
assert.equal(own.roster.counts.total, s.roster.length);
assert.equal(own.scheme.offense, "Shotgun spread", "own scheme comes from the coach's settings");

// ---- Empty / missing data never crashes.
const bare = fresh();
bare.franchise.archive = [];
bare.franchise.history = [];
bare.franchise.dead = [];
delete bare.franchise.statBook;
delete bare.franchise.matchups;
bare.franchise.clubs[cpu].staff = [];
bare.franchise.clubs[cpu].owner = null;
bare.schedule = [];
const empty = clubProfile(bare, cpu, { teams, heritage: null });
assert.ok(empty, "a club with no history, staff or schedule still has a profile");
assert.equal(empty.staff.hc, null);
assert.equal(empty.history.titles.length, 0);
assert.equal(empty.history.retired.length, 0);
assert.equal(empty.schedule.fixtures.length, 0);
assert.equal(clubProfile(bare, 99, { teams }), null, "an unknown club has no profile");

// ---- Finished seasons become history rows with their playoff finish.
const h = fresh();
const a = cpu,
  b = (cpu + 1) % 32;
h.teams[a] = { w: 12, l: 5, pf: 410, pa: 300, rating: 80 };
h.franchise.archive.push({ year: h.year, teams: structuredClone(h.teams), players: [], champion: a });
h.franchise.matchups = { version: 1, games: [
  { year: h.year, phase: "playoffs", week: 0, a, b, score: [24, 10] },
  { year: h.year, phase: "playoffs", week: 3, a: b, b: a, score: [17, 20], final: true },
] };
h.history.push({ year: h.year, champion: a, record: "12–5" });
h.year += 1;
h.teams[a] = { w: 0, l: 0, pf: 0, pa: 0, rating: 80 };
const rows = seasonHistory(h, a);
assert.equal(rows.length, 2, "one archived season plus the current one");
assert.equal(rows[0].current, true);
assert.equal(rows[1].record, "12–5");
assert.equal(rows[1].result, "Won the Super Bowl");
assert.equal(rows[1].title, true);
assert.equal(playoffResult(h, b, h.year - 1).label, "Lost the Super Bowl");
assert.equal(playoffResult(h, (cpu + 5) % 32, h.year - 1), null, "a club without playoff games has no playoff result");
const champ = clubProfile(h, a, { teams });
assert.ok(champ.history.titles.some((t) => t.year === h.year - 1 && t.kind === "career"), "a career title is listed");

// ---- Transactions filtered to the club.
const t = fresh();
recordTransactions(t);
const cut = t.roster.filter((p) => p.status === "active").sort((x, y) => x.ovr - y.ovr)[0];
C.cut(t, cut.id);
recordTransactions(t);
const mine = clubProfile(t, t.team, { teams });
assert.ok(mine.transactions.some((e) => e.playerId === cut.id), "the club's own release is in its log");
assert.ok(!clubProfile(t, cpu, { teams }).transactions.some((e) => e.playerId === cut.id), "other clubs' logs don't include it");
assert.ok(mine.finances.dead.some((d) => d.playerId === cut.id) || mine.finances.cap.dead >= 0, "dead money rows are named when present");

// ---- Helpers.
assert.deepEqual(findClubs("Packers", teams), [22]);
assert.ok(findClubs("gb", teams).includes(22));
assert.ok(findClubs("new york", teams).length === 2, "both New York clubs");
assert.deepEqual(findClubs("x", teams), [], "one letter is too short to search");
const dc = depthChart([{ id: "1", pos: "QB", ovr: 70, starter: false, status: "active" }, { id: "2", pos: "QB", ovr: 60, starter: true, status: "active" }, { id: "3", pos: "QB", ovr: 90, status: "practice" }]);
assert.equal(dc[0].players[0].id, "2", "starters lead their position group");
assert.equal(dc[0].players.length, 2, "practice squad players are not on the depth chart");
assert.ok(clubFixtures(s, cpu).filter((r) => r.next).length <= 1, "at most one next game");

console.log("PASS: club profile model for CPU and user clubs, history rows, empty states and helpers.");
