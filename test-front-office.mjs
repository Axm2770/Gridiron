import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import * as S from "./dist/franchise/state.mjs";
import { historicChampions } from "./dist/franchise/history.mjs";
import {
  hubPreferences,
  toggleStored,
  teamNeeds,
  draftBoard,
  fixtures,
  fixtureSummary,
  championshipArchive,
  socialFeed,
  publicStories,
} from "./dist/franchise/front-office.mjs";
import { installHubUI } from "./dist/franchise/hub-ui.mjs";
const ctx = {
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
    querySelectorAll() {
      return [];
    },
    querySelector() {
      return {};
    },
  },
};
ctx.window = ctx;
ctx.addEventListener = () => {};
vm.createContext(ctx);
vm.runInContext(fs.readFileSync("dist/game.js", "utf8"), ctx);
vm.runInContext(fs.readFileSync("dist/match.js", "utf8"), ctx);
const s = JSON.parse(vm.runInContext("JSON.stringify(fresh())", ctx));
s.coach = { name: "QA" };
S.migrate(s);
s.franchise.history = structuredClone(historicChampions);
s.franchise.staffPool = [
  {
    id: "qa-staff",
    name: "QA Coordinator",
    role: "OC",
    rating: 80,
    salary: S.MILLION,
    years: 2,
    scheme: "Balanced",
  },
];
const clubs = JSON.parse(vm.runInContext("JSON.stringify(clubs)", ctx));
// Injury/holdout depth, hidden scouting values and board order are independent concerns.
const qb = s.roster.find((p) => p.pos === "QB");
const beforeNeed = teamNeeds(s).find((n) => n.pos === "QB");
qb.injury = 7;
assert.equal(
  teamNeeds(s).find((n) => n.pos === "QB").available,
  beforeNeed.available - 1,
);
const prospect = s.prospects[0];
const before = draftBoard(s).find((x) => x.p.id === prospect.id).potential;
prospect.pot = 99;
assert.equal(
  draftBoard(s).find((x) => x.p.id === prospect.id).potential,
  before,
  "draft board must not leak hidden potential",
);
toggleStored(s, "board", prospect.id);
assert.equal(draftBoard(s, { pinned: true })[0].p.id, prospect.id);
assert.equal(
  draftBoard(s, { pinned: true, position: "NOT A POSITION" }).length,
  0,
);
toggleStored(s, "board", prospect.id);
assert.equal(draftBoard(s, { pinned: true }).length, 0);
// Ties, away perspective, bye and playoff stages must survive the fixture read model.
s.schedule = [
  [{ a: s.team, b: 1, score: [24, 24] }],
  [{ a: 2, b: s.team, score: [10, 30] }],
  [],
  [{ a: s.team, b: 3, score: null }],
];
s.week = 3;
s.playoffs = { rounds: [[{ a: s.team, b: 4, score: [14, 21] }]] };
const fsx = fixtures(s);
assert.equal(fsx[0].result, "T");
assert.equal(fsx[1].for, 30);
assert.equal(fsx[1].result, "W");
assert(fsx[2].bye);
assert(fsx[3].current);
assert.equal(fsx[4].stage, "Wild Card");
assert.deepEqual(fixtureSummary(fsx), {
  wins: 1,
  losses: 1,
  ties: 1,
  pf: 68,
  pa: 55,
  remaining: 1,
});
s.history = [{ year: 2026, champion: s.team, record: "11–6" }];
const archive = championshipArchive(s, clubs);
assert.equal(archive[0].kind, "This save");
assert.equal(archive.filter((h) => h.kind === "Historical").length, 60);
assert.equal(archive.find((h) => h.year === 2025).winner, "SEA");
const o = hubPreferences(s),
  office = s.franchise.office;
office.stories = [
  {
    id: "public",
    title: "A statement on the field",
    body: "Dallas wins 28–14.",
    category: "Team",
    source: "Sunday Review",
    year: 2026,
    week: 3,
    team: s.team,
  },
  {
    id: "secret",
    title: "Conversation: private role discussion",
    body: "PRIVATE",
    category: "Players",
    year: 2026,
    week: 3,
    team: s.team,
  },
  {
    id: "private-response",
    title: "Player meeting",
    body: "PRIVATE2",
    messageId: "private-mail",
    year: 2026,
    week: 3,
    team: s.team,
  },
];
office.messages = [
  { id: "private-mail", decision: "contract", response: "Private promises" },
];
assert.equal(publicStories(s).length, 1);
const feed = socialFeed(s, clubs);
assert(feed.some((p) => p.storyId === "public"));
assert(!JSON.stringify(feed).includes("PRIVATE"));
assert.deepEqual(
  feed,
  socialFeed(s, clubs),
  "social generation must be stable, not random at each render",
);
const comp = feed.find((p) => p.pair);
assert(comp);
assert(
  comp.pair.every((p) => p.value === null),
  "unrecorded stats must be unknown rather than fabricated zeros",
);
const socialId = feed[0].id,
  snapshot = JSON.stringify(s.roster.map((p) => [p.morale, p.ovr]));
toggleStored(s, "socialLikes", socialId);
assert(hubPreferences(s).socialLikes.includes(socialId));
toggleStored(s, "socialLikes", socialId);
assert(!hubPreferences(s).socialLikes.includes(socialId));
assert.equal(
  JSON.stringify(s.roster.map((p) => [p.morale, p.ovr])),
  snapshot,
  "reactions do not grant farmable morale or ratings",
);
assert.throws(() => toggleStored(s, "contracts", "x"));
toggleStored(s, "socialSaved", socialId);
assert(
  hubPreferences(JSON.parse(JSON.stringify(s))).socialSaved.includes(socialId),
);
const comparison = socialFeed(s, clubs).find((p) => p.pair);
toggleStored(s, "socialSaved", comparison.id, comparison);
s.week++;
const savedComparison = socialFeed(s, clubs).find(
  (p) => p.id === comparison.id,
);
assert(
  savedComparison,
  "saved comparisons remain visible after the calendar advances",
);
assert.equal(savedComparison.week, comparison.week);
assert.equal(savedComparison.pair[0].value, comparison.pair[0].value);
toggleStored(s, "socialSaved", comparison.id);
assert(
  !socialFeed(s, clubs).some((p) => p.id === comparison.id),
  "unsaving removes the archived snapshot",
);
// Exercise the actual view functions on a populated career and validate action wiring.
Object.assign(globalThis, {
  state: s,
  clubs,
  window: globalThis,
  esc: (v) =>
    String(v)
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll('"', "&quot;"),
  logo: (t) => `<img class="team-logo" alt="${clubs[t]?.[0] || t}">`,
  cname: (t) => clubs[t].slice(1, 3).join(" "),
  calendar: null,
  render() {},
  save() {},
  toast() {},
  document: { activeElement: null },
});
const views = {
  Club: () => "<p>Legacy facility controls</p>",
  News: () => "<p>Legacy newsroom</p>",
};
installHubUI({
  views,
  isBusy: () => false,
  tradeView: () => "<p>Trade controls</p>",
});
for (const key of ["Draft", "Market", "Club", "Archives", "News"]) {
  const html = views[key]();
  assert(!html.includes("NaN"));
  assert(!html.includes("undefined"));
  assert(html.length > (key === "News" ? 100 : 500), key + " should render");
}
assert(views.Draft().includes("data-player-id="));
assert(views.Draft().includes("1–" + Math.min(25, s.prospects.length) + " of"));
assert(views.Market().includes("tone-"), "ability grades use semantic color");
assert(globalThis.calendar().includes("hub-fixture-grid"));
Hub.scheduleScope("Results");
Hub.scheduleLayout("List");
assert(calendar().includes("24–24"));
Hub.clubTab("Facilities");
assert(views.Club().includes("Legacy facility controls"));
Hub.clubTab("Staff");
assert(views.Club().includes("Hire staff"));
Hub.marketTab("Trade center");
assert(views.Market().includes("Trade controls"));
Hub.mediaTab("Fan network");
assert(views.News().includes("Two QBs"));
assert(!views.News().includes("PRIVATE"));
Hub.react(socialId, "socialLikes");
assert(hubPreferences(s).socialLikes.includes(socialId));
console.log(
  "PASS: draft uncertainty/order/depth, fixtures/ties/byes/playoffs, historical/save archives, deterministic social threads, private-content exclusion, missing-stat semantics, reaction/save roundtrip, no farmable morale, all revamped view renderers and legacy transaction controls.",
);
