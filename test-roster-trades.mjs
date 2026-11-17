// Trades, free agency, scouting fog of war and market windows: valid deals go through, refused
// actions explain themselves with a fix, and scouting reports arrive by date and narrow ranges.
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import * as S from "./dist/franchise/state.mjs";
import * as C from "./dist/franchise/contracts.mjs";
import * as P from "./dist/franchise/personnel.mjs";
import { ensurePickLedger, ownedPicks, evaluateTrade, executeTrade, tradeBlockers, suggestPackage, marketWindows, estimatedAsk } from "./dist/franchise/market.mjs";
import { scoutRange, requestReport, reportBlocker, attributeRanges, locate, draftProjection, REPORT_DAYS } from "./dist/franchise/scouting.mjs";
import { ensureCalendar, advanceDate, addDays } from "./dist/franchise/calendar-core.mjs";
import { ensureOffice } from "./dist/franchise/newsroom.mjs";
import { settleMarketRound } from "./dist/franchise/world.mjs";

const ctx = { console, Math, Date, setTimeout() {}, localStorage: { getItem: () => null, setItem() {} }, document: { getElementById: () => ({ innerHTML: "", style: {} }), querySelectorAll: () => [], querySelector: () => ({}) } };
ctx.window = ctx;
ctx.addEventListener = () => {};
vm.createContext(ctx);
vm.runInContext(fs.readFileSync("dist/game.js", "utf8"), ctx);
vm.runInContext(fs.readFileSync("dist/match.js", "utf8"), ctx);
globalThis.clubs = JSON.parse(vm.runInContext("JSON.stringify(clubs)", ctx));
const fresh = () => {
  const s = JSON.parse(vm.runInContext("JSON.stringify(fresh())", ctx));
  s.coach = { name: "QA" };
  S.migrate(s);
  s.franchise.role = "Owner";
  ensureCalendar(s);
  return s;
};
const partner = (s) => (s.team + 1) % 32;
const activeCount = (s) => s.roster.filter((p) => !p.status || p.status === "active").length;

// A fair pick-for-pick deal is accepted and executed; ownership changes hands.
let s = fresh();
ensurePickLedger(s);
let mine = ownedPicks(s, s.team),
  theirs = ownedPicks(s, partner(s));
const fair = { partner: partner(s), give: [mine.find((p) => p.round === 1).id], get: [theirs.find((p) => p.round === 3).id] };
assert.equal(tradeBlockers(s, fair).length, 0, "nothing blocks a fair in-window deal");
assert.equal(evaluateTrade(s, fair).accept, true, "a fair deal is accepted");
executeTrade(s, fair);
assert(ownedPicks(s, s.team).some((p) => p.id === fair.get[0]), "the acquired pick is ours");

// Star players are no longer hard-blocked behind an ownership request: value decides.
s = fresh();
const star = s.roster.slice().sort((a, b) => b.ovr - a.ovr)[0],
  theirStar = S.roster(s, partner(s)).slice().sort((a, b) => b.ovr - a.ovr)[0],
  swap = { partner: partner(s), give: [star.id], get: [theirStar.id] };
assert(!tradeBlockers(s, swap).some((b) => /Ownership/i.test(b.reason)), "88+ players are not gated by the boardroom");

// The same partner can't be called again for a week, and the reason says when.
s = fresh();
ensurePickLedger(s);
mine = ownedPicks(s, s.team);
theirs = ownedPicks(s, partner(s));
executeTrade(s, { partner: partner(s), give: [mine.find((p) => p.round === 1).id], get: [theirs.find((p) => p.round === 3).id] });
const again = tradeBlockers(s, { partner: partner(s), give: [mine.find((p) => p.round === 2).id], get: [theirs.find((p) => p.round === 4).id] });
assert(again.some((b) => /takes calls again in 7 days/.test(b.reason) && b.fix), "trade cooldown is explained with a fix");

// A lopsided offer is refused with the point gap and a counter that would close it.
s = fresh();
ensurePickLedger(s);
mine = ownedPicks(s, s.team);
theirs = ownedPicks(s, partner(s));
const lop = evaluateTrade(s, { partner: partner(s), give: [mine.find((p) => p.round === 7).id], get: [theirs.find((p) => p.round === 2).id] });
assert.equal(lop.accept, false);
assert(lop.reasons.some((r) => /want \d+\. Add about \d+ points/.test(r)), "refusal states the gap");
assert(lop.counter, "a counter pick closes the gap");
assert.throws(() => executeTrade(s, { partner: partner(s), give: [mine.find((p) => p.round === 7).id], get: [theirs.find((p) => p.round === 2).id] }), /Add about/);

// After the deadline, trading is closed with the date it closed and when it reopens.
s = fresh();
ensurePickLedger(s);
s.week = s.franchise.rules.tradeDeadline || 9;
const closed = tradeBlockers(s, { partner: partner(s), give: [ownedPicks(s, s.team)[0].id], get: [ownedPicks(s, partner(s))[0].id] });
assert(closed.some((b) => /Trading is closed\. The deadline passed on \d{4}-\d\d-\d\d\. Trading reopens after the championship \(\d{4}-\d\d-\d\d\)/.test(b.reason)));
assert.equal(marketWindows(s).trade.open, false);

// Taking on salary beyond the cap names the shortfall and a concrete fix.
s = fresh();
ensurePickLedger(s);
const expensive = S.roster(s, partner(s)).slice().sort((a, b) => S.capHit(s.franchise.contracts[b.id], S.financeYear(s)) - S.capHit(s.franchise.contracts[a.id], S.financeYear(s)))[0];
s.franchise.rules.cap = S.capLedger(s).used + 1000;
const cap = tradeBlockers(s, { partner: partner(s), give: [ownedPicks(s, s.team)[0].id], get: [expensive.id] });
const capBlock = cap.find((b) => /short of cap space/.test(b.reason));
assert(capBlock && /^Fix: (release|restructure)|No single release/.test(capBlock.fix), "cap shortfall suggests a release or restructure");
assert(cap.some((b) => /active roster would be/.test(b.reason)) === activeCount(s) + 1 > 53);

// A no-trade clause and a non-roster career role are both explained.
s = fresh();
ensurePickLedger(s);
s.franchise.contracts[s.roster[3].id].noTrade = true;
assert(tradeBlockers(s, { partner: partner(s), give: [s.roster[3].id], get: [ownedPicks(s, partner(s))[0].id] }).some((b) => /no-trade clause/.test(b.reason) && /Remove him/.test(b.fix)));
s.franchise.role = "HC";
assert(tradeBlockers(s, { partner: partner(s), give: [ownedPicks(s, s.team)[0].id], get: [ownedPicks(s, partner(s))[0].id] }).some((b) => /HC role delegates trades/.test(b.reason) && /Career dossier/.test(b.fix)));

// The suggested package covers our own estimate of what they want.
s = fresh();
const target = S.roster(s, partner(s)).find((p) => !p.starter && p.ovr >= 65);
const pkg = suggestPackage(s, partner(s), [target.id]);
assert(pkg.covered && pkg.total >= pkg.target && pkg.give.length >= 1);

// Fog of war: depth players at other clubs show ranges that contain the truth; stars do not.
s = fresh();
const depth = S.roster(s, partner(s)).find((p) => !p.starter && p.ovr < 80),
  first = scoutRange(s, depth, partner(s));
assert.equal(first.exact, false, "a depth player is unscouted");
assert(first.ovr[0] <= depth.ovr && depth.ovr <= first.ovr[1], "the range contains his true overall");
assert(attributeRanges(s, depth, partner(s)).every((a) => a.lo <= a.hi && a.value == null));
assert(scoutRange(s, s.roster[0], s.team).exact, "own players are exact");
const ask = estimatedAsk(s, partner(s), [depth.id]);
assert(!ask.exact && ask.low <= ask.high, "trade estimates use the scouted range");

// A report takes REPORT_DAYS on the calendar, lands in the Inbox and narrows the range.
const request = requestReport(s, depth.id);
assert.equal(request.due, addDays(ensureCalendar(s).date, REPORT_DAYS));
assert(/already on the way/.test(reportBlocker(s, depth.id).reason), "a second request is explained");
advanceDate(s, addDays(ensureCalendar(s).date, REPORT_DAYS - 1));
assert(scoutRange(s, depth, partner(s)).pending, "no report before the due date");
advanceDate(s, request.due);
const second = scoutRange(s, depth, partner(s));
assert(second.confidence > first.confidence && !second.pending);
assert(second.ovr[0] >= first.ovr[0] && second.ovr[1] <= first.ovr[1] && second.ovr[1] - second.ovr[0] < first.ovr[1] - first.ovr[0], "ranges narrow");
assert(second.ovr[0] <= depth.ovr && depth.ovr <= second.ovr[1]);
const mail = ensureOffice(s).messages.find((m) => m.category === "Scouting" && m.playerId === depth.id);
assert(mail && /formal report/.test(mail.body) && /→/.test(mail.body), "the formal report is in the Inbox");
for (let i = 0; i < 3 && !scoutRange(s, depth, partner(s)).exact; i++) {
  const r = requestReport(s, depth.id);
  advanceDate(s, r.due);
}
assert.equal(scoutRange(s, depth, partner(s)).label, String(depth.ovr), "full scouting reveals the true rating");

// Prospects share the draft room's confidence, and only about a round's worth are 1st-rounders.
const prospect = s.prospects[0];
assert.equal(locate(s, prospect.id).team, -2);
const pr = requestReport(s, prospect.id);
advanceDate(s, pr.due);
assert(s.franchise.reports[prospect.id].confidence >= 60, "prospect reports raise draft-room confidence");
const firsts = s.prospects.filter((p) => draftProjection(s, p).label === "1st-round talent").length;
assert(firsts <= 32 && firsts >= Math.min(20, s.prospects.length), "1st-round projections match a round");

// Scouts are a limited resource: the reason names the date the next one is free.
s = fresh();
const pool = S.roster(s, partner(s)).filter((p) => !p.starter && p.ovr < 80);
requestReport(s, pool[0].id);
requestReport(s, pool[1].id);
assert(/All 2 scouts are on assignment\. The next one is free on \d{4}-\d\d-\d\d/.test(reportBlocker(s, pool[2].id).reason));

// Free-agent offers explain a full roster before the meeting, and settle with the game week.
s = fresh();
const agent = s.agents.slice().sort((a, b) => a.salary - b.salary)[0];
while (s.roster.filter((p) => p.status === "active").length < 53) s.roster.push({ ...s.roster.find((p) => p.status === "active" && !p.starter), id: "pad-" + s.roster.length, starter: false });
const full = C.offerBlockers(s, agent.id);
assert(full.some((b) => /active roster would be 54\/53/.test(b.reason) && /practice squad/.test(b.fix)));
assert.throws(() => C.offer(s, agent.id, { annual: agent.salary, years: 1, bonus: 0, guaranteed: 0 }), /54\/53/);
s = fresh();
const cheap = s.agents.slice().sort((a, b) => a.salary - b.salary)[0];
while (s.roster.filter((p) => p.status === "active").length > 52) P.movePlayer(s, s.roster.find((p) => p.status === "active" && !p.starter).id, "practice") ?? null;
assert.equal(C.offerBlockers(s, cheap.id).length, 0);
C.offer(s, cheap.id, { annual: Math.max(0.8, cheap.salary * 3), years: 2, bonus: cheap.salary, guaranteed: cheap.salary });
s.franchise.market.phase = "Open";
settleMarketRound(s, "round-test");
assert(!s.franchise.market.offers.some((o) => o.playerId === cheap.id), "in-season offers are decided with the round");
assert(s.roster.some((p) => p.id === cheap.id) || s.franchise.events.some((e) => /Free agent signed elsewhere/.test(e.title)), "the user learns the outcome either way");
settleMarketRound(s, "round-test");

// Roster moves explain themselves.
s = fresh();
const starter = s.roster.find((p) => p.starter && p.status === "active");
assert.throws(() => P.movePlayer(s, starter.id, "practice"), /is a starter\. Put someone else in his depth-chart slot/);

// The draft window states its date; Next Generation is gone from the navigation.
s = fresh();
assert.match(marketWindows(s).draft.detail, /draft is on \d{4}-04-\d\d/);
// Only the retired-route table may still name it, and it must send old links to the Draft room.
const presentationSource = fs.readFileSync("dist/franchise/presentation.mjs", "utf8"),
  aliases = presentationSource.match(/export const ROUTE_ALIASES = \{[\s\S]*?\n\};/)?.[0] ?? "";
assert(!presentationSource.replace(aliases, "").includes("Next generation"));
assert.match(aliases, /"Next generation": \["Draft"\]/);
assert(!fs.readFileSync("dist/franchise/career-scenes.mjs", "utf8").includes('views["Next generation"]'));

console.log("PASS: valid trades, star trades without boardroom gating, explained cooldown/deadline/cap/roster/no-trade/role blockers, refusal gaps and counters, suggested packages, scouted ranges and estimates, dated Inbox reports that narrow ranges, scout capacity, prospect projections, free-agent blockers and in-season settlement, roster-move reasons, windows and Next Generation removal.");
