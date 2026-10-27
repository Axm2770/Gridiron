import { boardFingerprint } from "./dist/franchise/boardroom.mjs";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import * as S from "./dist/franchise/state.mjs";
import * as Staff from "./dist/franchise/staff.mjs";
import * as C from "./dist/franchise/contracts.mjs";
import * as W from "./dist/franchise/world.mjs";
import * as L from "./dist/franchise/lifecycle.mjs";
import * as P from "./dist/franchise/personnel.mjs";
import {
  complianceReport,
  assertCanAdvance,
} from "./dist/franchise/compliance.mjs";
import { developWeek } from "./dist/franchise/development.mjs";
import { progressionView } from "./dist/franchise/progression-view.mjs";
import { installStaffUI } from "./dist/franchise/staff-ui.mjs";
import { installDevelopmentUI } from "./dist/franchise/development-ui.mjs";
import { migrateImmersion } from "./dist/franchise/immersion.mjs";
import { serializeCareer } from "./dist/franchise/ratings.mjs";
const context = {
  console,
  Math,
  Date,
  setTimeout() {},
  localStorage: {
    getItem() {
      return null;
    },
    setItem() {},
  },
  document: {
    getElementById() {
      return { innerHTML: "", style: {}, showModal() {}, close() {} };
    },
    querySelector() {
      return {};
    },
    querySelectorAll() {
      return [];
    },
  },
};
context.window = context;
context.addEventListener = () => {};
vm.createContext(context);
vm.runInContext(fs.readFileSync("dist/game.js", "utf8"), context);
vm.runInContext(fs.readFileSync("dist/match.js", "utf8"), context);
function fresh() {
  const s = JSON.parse(vm.runInContext("JSON.stringify(fresh())", context));
  s.coach = { name: "Operations QA", calling: "Manual" };
  S.migrate(s);
  Staff.ensureStaff(s);
  return s;
}
function interview(s, role, c, mode = "inPerson") {
  Staff.startStaffInterview(s, role, c.id, mode);
  Staff.answerStaffInterview(s, role, c.id, 0, 1);
  Staff.answerStaffInterview(s, role, c.id, 1, 0);
}
function available(s, role) {
  return Staff.staffCandidates(s, role)
    .filter((c) => c.employer === null && c.role === role)
    .sort((a, b) => Number(b.minority) - Number(a.minority));
}
const raw = JSON.parse(vm.runInContext("JSON.stringify(fresh())", context));
Staff.ensureStaff(raw);
assert(
  raw.franchise.staffHubVersion,
  "staff initialization must support new career renders before franchise initialization",
);
let s = fresh();
assert(S.validate(s));
assert(Staff.STAFF_ROLES.Medical);
assert(
  [
    ...s.franchise.staffPool,
    ...s.franchise.clubs.flatMap((c) => c.staff),
  ].every((c) => Number.isSafeInteger(c.salary)),
  "staff salaries must be integer cents",
);
assert(
  s.franchise.clubs.every(
    (c) =>
      c.staff.some((q) => q.role === "STC") &&
      c.staff.some((q) => q.role === "QB"),
  ),
);
const seeded = JSON.stringify(s.franchise.clubs);
Staff.ensureStaff(s);
assert.equal(
  JSON.stringify(s.franchise.clubs),
  seeded,
  "migration must not create duplicate staff",
);
const old = s.franchise.clubs[s.team].staff.find((c) => c.role === "OC"),
  candidates = available(s, "OC"),
  chosen = candidates.at(-1);
assert.throws(
  () => W.hire(s, chosen),
  /search/,
  "legacy direct-hire entry point must use the new gate",
);
Staff.openStaffSearch(s, "OC");
assert.equal(Staff.searchCompliance(s, "OC").required, 2);
assert.throws(() => Staff.hireStaff(s, "OC", chosen.id), /interview/i);
Staff.startStaffInterview(s, "OC", candidates[0].id);
Staff.answerStaffInterview(s, "OC", candidates[0].id, 0, 0);
assert.equal(
  Staff.searchCompliance(s, "OC").completed,
  0,
  "a started interview must not count",
);
const saved = JSON.parse(serializeCareer(s));
assert.equal(Staff.currentSearch(saved, "OC").drafts[candidates[0].id].step, 1);
assert.throws(
  () => Staff.answerStaffInterview(s, "OC", candidates[0].id, 0, 1),
  /no longer/,
  "double click must not consume the next answer",
);
Staff.answerStaffInterview(s, "OC", candidates[0].id, 1, 1);
assert.equal(Staff.searchCompliance(s, "OC").completed, 1);
assert.throws(
  () => Staff.startStaffInterview(s, "OC", candidates[0].id),
  /already/,
);
assert.throws(() => Staff.hireStaff(s, "OC", chosen.id), /interview/);
interview(s, "OC", candidates[1]);
interview(s, "OC", chosen);
assert(Staff.searchCompliance(s, "OC").ok);
const beforeCash = s.franchise.clubs[s.team].cash;
const hired = S.transact(s, (x) => {
  boardPermit(x, "OC", chosen.id);
  Staff.hireStaff(x, "OC", chosen.id);
});
assert.equal(
  hired.franchise.clubs[s.team].staff.find((c) => c.role === "OC").id,
  chosen.id,
);
assert.equal(
  s.franchise.clubs[s.team].staff.find((c) => c.role === "OC").id,
  old.id,
  "transactions must leave input untouched",
);
assert.equal(
  beforeCash - hired.franchise.clubs[s.team].cash,
  chosen.salary + Math.round(old.salary * old.years * 0.5),
);
assert(!hired.franchise.staffPool.some((c) => c.id === chosen.id));
assert(
  hired.franchise.staffPool.some((c) => c.id === old.id && c.employer === null),
);
assert.throws(() => Staff.hireStaff(hired, "OC", chosen.id), /search/);
// A new vacancy starts its own search; previous interviews cannot unlock it.
boardPermit(hired, "OC", null, chosen.id);
Staff.fireStaff(hired, chosen.id);
Staff.openStaffSearch(hired, "OC");
assert(
  hired.franchise.staffSearchArchive.length,
  "completed searches must remain in the archive",
);
assert.equal(Staff.searchCompliance(hired, "OC").completed, 0);
const reserve = available(hired, "OC")[0];
interview(hired, "OC", reserve);
assert.equal(Staff.searchCompliance(hired, "OC").completed, 1);
// Role, live, null references, budget, stale employment and in-person policies.
for (const role of ["OC", "DC"]) {
  const r = fresh();
  r.franchise.role = role;
  assert.throws(() => Staff.openStaffSearch(r, "OC"), /delegates/);
}
s = fresh();
s.franchise.role = "HC";
assert.throws(() => Staff.openStaffSearch(s, "HC"), /delegates/);
Staff.openStaffSearch(s, "QB");
assert.equal(Staff.searchCompliance(s, "QB").required, 1);
s.live = {};
assert.throws(
  () => Staff.startStaffInterview(s, "QB", available(s, "QB")[0].id),
  /game/,
);
s.live = null;
s = fresh();
Staff.openStaffSearch(s, "HC");
const two = available(s, "HC").slice(0, 2);
for (const c of two) interview(s, "HC", c, "virtual");
assert.equal(
  Staff.searchCompliance(s, "HC").completed,
  0,
  "virtual HC interviews cannot satisfy in-person requirement",
);
for (const c of two) interview(s, "HC", c);
assert.equal(Staff.searchCompliance(s, "HC").completed, 2);
let next = S.transact(s, (x) => {
  boardPermit(x, "HC", two[0].id);
  Staff.hireStaff(x, "HC", two[0].id);
});
assert.equal(
  next.coach.name,
  "Operations QA",
  "owner appointments must not overwrite the human coach profile",
);
s.franchise.clubs[s.team].cash = 0;
assert.throws(
  () => S.transact(s, (x) => Staff.hireStaff(x, "HC", two[0].id)),
  /fund/,
);
s = fresh();
Staff.openStaffSearch(s, "QB");
let q = available(s, "QB")[0];
Staff.startStaffInterview(s, "QB", q.id);
q.employer = 1;
s.franchise.staffPool = s.franchise.staffPool.filter((c) => c.id !== q.id);
s.franchise.clubs[1].staff.push(q);
assert.throws(
  () => Staff.answerStaffInterview(s, "QB", q.id, 0, 0),
  /window|employ/,
);
s = fresh();
Staff.openStaffSearch(s, "QB");
s.year++;
assert.throws(
  () => Staff.startStaffInterview(s, "QB", available(s, "QB")[0].id),
  /search/,
);
// Contracted lateral moves are blocked; real promotions respect the round-level hiring window.
s = fresh();
const lateral = s.franchise.clubs[1].staff.find((c) => c.role === "OC"),
  position = s.franchise.clubs[1].staff.find((c) => c.role === "QB");
assert.match(Staff.interviewWindow(s, lateral, "OC").reason, /lateral/);
assert(!Staff.interviewWindow(s, position, "OC").ok);
s.phase = "playoffs";
s.franchise.postseason = {
  round: 0,
  seeds: [
    [0, 1, 2, 3, 4, 5, 6],
    [16, 17, 18, 19, 20, 21, 22],
  ],
};
s.playoffs = {
  rounds: [
    [
      { a: 1, b: 6 },
      { a: 2, b: 5 },
    ],
  ],
};
assert(!Staff.interviewWindow(s, lateral, "HC", "virtual").ok);
s.franchise.postseason.round = 1;
assert(Staff.interviewWindow(s, lateral, "HC", "virtual").ok);
assert(!Staff.interviewWindow(s, lateral, "HC").ok);
s.franchise.postseason.round = 2;
s.playoffs.rounds.push([{ a: 2, b: 3 }]);
assert(Staff.interviewWindow(s, lateral, "HC").ok);
s.phase = "offseason";
assert(Staff.interviewWindow(s, position, "OC").ok);
assert(!Staff.interviewWindow(s, lateral, "OC").ok);
// Compensation: employer departure, explicit minority metadata, uninterrupted service, no duplicates.
s = fresh();
s.phase = "offseason";
s.franchise.calendar.leagueYear = s.year + 1;
let candidate = s.franchise.clubs[1].staff.find((c) => c.role === "OC");
candidate.minority = true;
candidate.tenure = 2;
let picks = Staff.awardStaffCompensation(s, candidate, 1, s.team, "HC");
assert.deepEqual(
  picks.map((p) => [p.year, p.round]),
  [
    [2027, 3],
    [2028, 3],
  ],
);
assert.equal(
  Staff.awardStaffCompensation(s, candidate, 1, s.team, "HC").length,
  0,
);
assert.equal(s.franchise.futurePicks.length, 2);
let exec = s.franchise.clubs[1].staff.find((c) => c.role === "Scout");
exec.minority = true;
exec.tenure = 3;
Staff.awardStaffCompensation(s, exec, 1, 2, "GM");
assert.equal(
  s.franchise.futurePicks.length,
  3,
  "HC and primary-executive departures produce three consecutive drafts",
);
let denied = { ...candidate, id: "short-tenure", tenure: 1 };
assert.equal(Staff.awardStaffCompensation(s, denied, 1, 3, "HC").length, 0);
assert.equal(
  Staff.awardStaffCompensation(s, candidate, null, 3, "HC").length,
  0,
);
assert.equal(
  Staff.awardStaffCompensation(s, { ...candidate, minority: false }, 1, 3, "HC")
    .length,
  0,
);
s = fresh();
s.phase = "offseason";
s.franchise.calendar.leagueYear = 2027;
s.franchise.draft = { year: 2026, picks: [], cursor: 0 };
candidate = s.franchise.clubs[1].staff.find((c) => c.role === "OC");
candidate.minority = true;
candidate.tenure = 2;
assert.deepEqual(
  Staff.awardStaffCompensation(s, candidate, 1, 2, "HC").map((p) => p.year),
  [2028, 2029],
);
// Real carousel records its destination, transfers the actual employee, and completes a qualifying search.
s = fresh();
s.phase = "offseason";
s.franchise.calendar.leagueYear = 2027;
for (const club of s.franchise.clubs) {
  for (const c of club.staff) c.rating = 70;
  club.staff.find((c) => c.role === "HC").years = 3;
}
s.franchise.clubs[2].staff.find((c) => c.role === "HC").years = 1;
candidate = s.franchise.clubs[1].staff.find((c) => c.role === "OC");
candidate.rating = 95;
candidate.minority = true;
candidate.tenure = 3;
const humanTeam = s.team;
Staff.runStaffCarousel(s);
assert.equal(s.team, humanTeam);
assert.equal(s.franchise.role, "Owner");
assert(!s.franchise.clubs[1].staff.some((c) => c.id === candidate.id));
assert(
  s.franchise.clubs[2].staff.some(
    (c) => c.id === candidate.id && c.role === "HC",
  ),
);
assert.equal(Staff.searchCompliance(s, "HC", 2).completed, 2);
assert(s.franchise.futurePicks.some((p) => p.team === 1));
// Calendar gates must not mutate the calendar or resolve games in an invalid registration.
s = fresh();
assert(complianceReport(s).ok);
s.franchise.rules.cap = 1;
s.franchise.debug = true;
const snapshot = JSON.stringify(s);
for (const action of [
  () => W.marketDay(s),
  () => L.finishRound(s, []),
  () => L.rollSeason(s),
  () => P.beginDraft(s),
])
  assert.throws(action, /Clear/);
assert.equal(JSON.stringify(s), snapshot);
assert(!complianceReport(s).ok, "debug does not bypass registration");
s = fresh();
const extra = S.makePlayer("extra-54", "WR", 33);
s.roster.push(extra);
s.franchise.contracts[extra.id] = S.basicContract(extra, s.team, s.year);
assert(complianceReport(s).issues.some((i) => i.code === "ROSTER_ACTIVE"));
assert(complianceReport(s, { camp: true }).ok);
s.phase = "offseason";
assert(complianceReport(s).ok);
s.phase = "season";
s.roster.pop();
delete s.franchise.contracts[extra.id];
s.roster[0].injury = 4;
assert(complianceReport(s).ok);
assert(
  complianceReport(s, { game: true }).issues.some(
    (i) => i.code === "MATCH_PERSONNEL",
  ) || S.active(s).filter((p) => p.pos === "QB" && !p.injury).length >= 1,
);
for (const corrupt of [
  (c) => (c.bonus = NaN),
  (c) => (c.guarantees[0] = c.base[0] + 1),
  (c) => (c.prorate = 6),
  (c) => c.roster.pop(),
  (c) => (c.incentives = [{ year: s.year, type: "WRONG", amount: 1 }]),
  (c) => (c.restructureBonuses = [{ year: s.year, term: 9, amount: 1 }]),
]) {
  const d = fresh();
  corrupt(d.franchise.contracts[d.roster[0].id]);
  assert(!complianceReport(d).ok);
}
assert.throws(
  () =>
    C.proposal(fresh(), fresh().agents[0], {
      years: 3,
      annual: 2,
      bonus: 0,
      guaranteed: 0,
      roster: -1,
    }),
  /Invalid/,
);
// Directional reporting comes from actual per-week attribute changes, including injury decline.
s = fresh();
let p = s.roster[0];
p.age = 22;
p.pot = 99;
p.injury = 0;
p.starter = true;
p.progression = undefined;
developWeek(p, {
  year: s.year,
  week: 0,
  roundKey: "new",
  teamRoster: s.roster,
  played: true,
});
let v = progressionView(p);
assert.equal(v.status, "Improving");
assert(v.attributes.some((a) => a.direction === "up"));
assert(!Object.hasOwn(v, "delta"));
p = S.makePlayer("injury-test", "QB", 55);
p.age = 26;
p.injury = 8;
p.medical = { bodyPart: "shoulder", weeks: 8 };
developWeek(p, {
  year: s.year,
  week: 0,
  roundKey: "injury",
  teamRoster: [],
  played: false,
});
v = progressionView(p);
assert.equal(v.status, "Declining");
assert(v.attributes.some((a) => a.key === "throwPower" && a.arrow === "▼"));
s.news = [
  {
    title: "A real roster. Your own story.",
    body: "Real NFL identities across all 32 teams. Matched ratings use the EA snapshot with career adjustments; contracts, personalities and future events are simulated.",
  },
];
migrateImmersion(s);
assert(!/simulated|snapshot|EA/.test(s.news[0].body));
console.log(
  "PASS: staff migration, vacancy-specific interviews/resume/stale/duplicate guards, Rooney counts/formats, promotion and postseason windows, permissions/budget/severance, canonical legacy gate, actual carousel and JC-2A picks; strict calendar/cap/roster/contract registration; directional injury/training reports; legacy immersion migration.",
);

const uiNodes = {};
globalThis.window = globalThis;
globalThis.state = hired;
globalThis.esc = (v) =>
  String(v ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll('"', "&quot;");
globalThis.clubs = JSON.parse(
  vm.runInContext("JSON.stringify(clubs)", context),
);
globalThis.logo = (t) => "<span>Club " + t + "</span>";
globalThis.save = () => {};
globalThis.toast = () => {};
globalThis.document = {
  getElementById: (id) =>
    (uiNodes[id] ??= { innerHTML: "", textContent: "", disabled: false }),
};
let output = "";
const views = {};
globalThis.render = () => {};
globalThis.modal = (html) => {
  output = html;
};
globalThis.closeModal = () => {};
installStaffUI({ views, isBusy: () => false });
assert.match(views.Staff(), /Coaching|people behind the playbook/);
StaffHub.tab("Search records");
const recordsHTML = views.Staff();
assert.match(
  recordsHTML,
  /appointed/,
  "a replaced search must remain visible in the real records view",
);
assert.match(recordsHTML, /2 \/ 2 qualifying/);
StaffHub.tab("Recruitment");
assert.match(views.Staff(), /staff-role-rail/);
StaffHub.tab("Compliance");
assert.match(views.Staff(), /Salary cap/);
installDevelopmentUI({ views, isBusy: () => false });
const developmentHTML = views.Development();
assert.match(developmentHTML, /Overall \/ status/);
assert(!developmentHTML.includes("Recorded ability change"));
Dev.query(state.roster[0].name);
assert.equal(uiNodes["development-next"].disabled, true);
assert.equal(uiNodes["development-page"].textContent, "Page 1");
Dev.player(state.roster[0].id);
Dev.tab("Report");
assert(
  !/Recorded ability change|Underlying ability [+-]|[+-]0\.\d/.test(output),
);
console.log(
  "PASS: actual staff/team/recruitment/archive/compliance and compact directional development HTML, search pagination controls and report modal.",
);

function boardPermit(
  s,
  role,
  replacement,
  id = s.franchise.clubs[s.team].staff.find((c) => c.role === role)?.id,
) {
  if (!id) return;
  const payload = { id, replacement, role };
  (s.franchise.boardroom ??= {
    serial: 0,
    active: null,
    requests: [],
    permits: [],
  }).permits.push({
    id: "staff-law-fixture",
    team: s.team,
    kind: "Staff change",
    fingerprint: boardFingerprint("Staff change", payload),
    scope: "Approved",
    until: s.franchise.clock.day + 30,
    used: false,
  });
}
