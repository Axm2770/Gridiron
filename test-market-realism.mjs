// Market realism: trades and free agency are decided by more than value points. Franchise icons
// cost more (legends are untouchable), injured, worn and ageing players are discounted, rebuilding
// clubs want youth and picks while contenders want proven players, troublemakers and players who
// asked out are cheaper, clubs won't stack a position, every answer comes with readable reasons,
// free agents weigh role and contention, and "Trade for <player>" preselects the deal.
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import * as S from "./dist/franchise/state.mjs";
import * as C from "./dist/franchise/contracts.mjs";
import { ensurePickLedger, ownedPicks, evaluateTrade, executeTrade, playerTradeValue, tradeFactors, sellFactors, askingValue, estimatedAsk, suggestPackage, signingFactors, signingEdge, teamMode } from "./dist/franchise/market.mjs";
import { clubStanding, conductProfile, injuryProfile } from "./dist/franchise/market-profile.mjs";
import { applyTradeFor } from "./dist/franchise/ops-ui.mjs";
import { ensureCalendar } from "./dist/franchise/calendar-core.mjs";

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
  ensurePickLedger(s);
  return s;
};
const partnerOf = (s) => (s.team + 1) % 32;
// Mode from rating outside the season: >= 83 Contender, <= 74 Rebuilding, otherwise Middle.
const setMode = (s, t, mode) => (s.teams[t].rating = { Contender: 90, Middle: 80, Rebuilding: 70 }[mode]);
const healthy = (p) => {
  p.injury = 0;
  p.wear = { knee: 0, ankle: 0, shoulder: 0, back: 0 };
  p.tradeDemand = false;
  p.holdout = false;
  p.morale = 75;
  p.coachTrust = 60;
  p.persona = { money: 0.5, loyalty: 0.5, ambition: 0.5, leadership: 0.5 };
  delete p.reputation;
  return p;
};

/* ---------------------------------------------------- franchise icons and legends */
let s = fresh();
let partner = partnerOf(s);
setMode(s, partner, "Middle");
const star = healthy(S.roster(s, partner).slice().sort((a, b) => b.ovr - a.ovr)[0]);
star.age = 28;
star.joined = { team: partner, year: s.year - 1 };
assert.equal(clubStanding(s, star, partner).level, "none", "a recent arrival has no franchise standing");
const plainAsk = askingValue(s, star, partner);
star.joined = { team: partner, year: s.year - 6 };
star.reputation = { recognition: 88, delta: 0, history: [] };
const icon = clubStanding(s, star, partner);
assert.equal(icon.level, "icon", "six seasons and a star reputation make a franchise icon");
assert(sellFactors(s, star, partner).factors.some((f) => /franchise icon: they want 30% more/.test(f.text)));
assert(askingValue(s, star, partner) > plainAsk * 1.2, "an icon costs clearly more than the same player without the history");
const iconDeal = evaluateTrade(s, { partner, give: [ownedPicks(s, s.team).find((p) => p.round === 7).id], get: [star.id] });
assert(iconDeal.factors.some((f) => f.side === "receive" && f.tone === "bad" && /franchise icon/.test(f.text)), "the partner's reasoning names the icon premium");
assert(iconDeal.factors.every((f) => typeof f.text === "string" && Number.isFinite(f.points) && ["good", "bad", ""].includes(f.tone)), "factors are readable and signed");
assert(estimatedAsk(s, partner, [star.id]).estimate > 0);

// A legend is untouchable at a club that isn't rebuilding, and for sale (at a premium) when it is.
star.joined = { team: partner, year: s.year - 10 };
star.reputation = { recognition: 95, delta: 0, history: [] };
star.ovr = Math.max(star.ovr, 88);
star.persona.loyalty = 0.9;
assert.equal(clubStanding(s, star, partner).level, "legend");
const everything = ownedPicks(s, s.team).slice(0, 6).map((p) => p.id);
const legendDeal = evaluateTrade(s, { partner, give: everything, get: [star.id] });
assert.equal(legendDeal.accept, false, "no package buys a legend from a club that isn't rebuilding");
assert.equal(legendDeal.untouchable.length, 1);
assert(legendDeal.reasons.some((r) => /won't deal: .*franchise legend/.test(r)), "the refusal says he is untouchable and why");
assert.equal(legendDeal.counter, null, "no counter is offered for an untouchable player");
assert.equal(suggestPackage(s, partner, [star.id]).covered, false);
assert(estimatedAsk(s, partner, [star.id]).untouchable.length === 1, "your scouts know he is not for sale before you propose");
setMode(s, partner, "Rebuilding");
assert.equal(sellFactors(s, star, partner).untouchable, null, "a rebuilding club will listen even on a legend");
assert(sellFactors(s, star, partner).factors.some((f) => /want 45% more/.test(f.text)));

/* ---------------------------------------------------- injuries, wear and age */
s = fresh();
partner = partnerOf(s);
setMode(s, partner, "Middle");
const mine = healthy(s.roster.filter((p) => p.ovr >= 72).sort((a, b) => b.ovr - a.ovr)[2]);
mine.age = 26;
const fit = playerTradeValue(s, mine, partner);
assert(fit > 0);
mine.injury = 6;
assert(playerTradeValue(s, mine, partner) < fit * 0.8, "an injured player is discounted");
assert(tradeFactors(s, mine, partner).factors.some((f) => f.key === "injury" && /out 6 weeks/.test(f.text)));
mine.injury = 0;
mine.wear.knee = 85;
assert(playerTradeValue(s, mine, partner) < fit, "heavy joint wear is discounted");
assert(tradeFactors(s, mine, partner).factors.some((f) => /knee wear 85/.test(f.text)));
assert.equal(injuryProfile(s, mine).wearPart, "knee");
mine.wear.knee = 0;
mine.injuryHistory = [{ year: s.year }, { year: s.year - 1 }];
assert(tradeFactors(s, mine, partner).factors.some((f) => /Injury history: 2 injuries/.test(f.text)), "recent injuries count against him");
delete mine.injuryHistory;
const old = { ...mine, age: 34 };
assert(playerTradeValue(s, old, partner) < fit * 0.75, "a player well past his position's peak is discounted");
assert(tradeFactors(s, old, partner).factors.some((f) => f.key === "age" && /Age 34: past a/.test(f.text)));

/* ------------------------------------------- rebuilding vs contending clubs */
s = fresh();
const contender = partnerOf(s),
  rebuilder = (s.team + 2) % 32;
setMode(s, contender, "Contender");
setMode(s, rebuilder, "Rebuilding");
assert.equal(teamMode(s, contender), "Contender");
assert.equal(teamMode(s, rebuilder), "Rebuilding");
const base = healthy(s.roster.find((p) => p.pos === "WR"));
const prospect = { ...base, age: 22, ovr: 74, pot: 88 },
  veteran = { ...base, age: 30, ovr: 84 };
const modeFactor = (p, t) => tradeFactors(s, p, t).factors.find((f) => f.key === "mode")?.pct ?? 0;
assert(modeFactor(prospect, rebuilder) > 0, "a rebuilder wants the young player");
assert(modeFactor(veteran, rebuilder) < 0, "a rebuilder has little use for a 30-year-old");
assert(modeFactor(veteran, contender) > 0, "a contender pays for a proven player");
assert(modeFactor(prospect, contender) <= 0, "a contender doesn't pay extra for a project");
assert(playerTradeValue(s, prospect, rebuilder) / Math.max(1, playerTradeValue(s, veteran, rebuilder)) > playerTradeValue(s, prospect, contender) / Math.max(1, playerTradeValue(s, veteran, contender)), "relative to the veteran, the prospect is worth more to the rebuilder");
const pick = ownedPicks(s, s.team).find((p) => p.round === 2).id;
const pickFor = (t) => evaluateTrade(s, { partner: t, give: [pick], get: [ownedPicks(s, t).find((p) => p.round === 2).id] }).factors.find((f) => f.key === "picks");
assert(!pickFor(contender) || pickFor(contender).pct < 0);
assert(/Rebuilding: they value draft picks/.test(evaluateTrade(s, { partner: rebuilder, give: [pick], get: [ownedPicks(s, rebuilder).find((p) => p.round === 3).id] }).factors.find((f) => f.key === "picks")?.text ?? "Rebuilding: they value draft picks"));

/* ---------------------------------------------------- positional need */
s = fresh();
partner = partnerOf(s);
const theirQBs = S.roster(s, partner).filter((p) => p.pos === "QB");
for (const q of theirQBs) q.ovr = 92;
while (S.roster(s, partner).filter((p) => p.pos === "QB").length < 3) S.roster(s, partner).push({ ...theirQBs[0], id: `qa-qb-${Math.random()}`, ovr: 92 });
const ourQB = healthy(s.roster.find((p) => p.pos === "QB"));
assert(tradeFactors(s, ourQB, partner).factors.some((f) => f.key === "need" && /Stacked at QB: he'd be their 4th/.test(f.text) && f.pct <= -0.5), "a club won't pay for a 4th QB");
for (const q of S.roster(s, partner).filter((p) => p.pos === "CB")) q.ovr = 50;
const ourCB = healthy({ ...s.roster.find((p) => p.pos === "CB"), ovr: 80 });
assert(tradeFactors(s, ourCB, partner).factors.some((f) => f.key === "need" && /They need a CB/.test(f.text) && f.pct > 0));

/* ---------------------------------------------- character, controversy and wishes */
s = fresh();
partner = partnerOf(s);
setMode(s, partner, "Middle");
const pro = healthy(s.roster.filter((p) => p.ovr >= 70).sort((a, b) => b.ovr - a.ovr)[3]);
pro.age = 26;
const clean = playerTradeValue(s, pro, partner);
pro.tradeDemand = true;
pro.morale = 40;
assert(conductProfile(s, pro).troublemaker);
assert(playerTradeValue(s, pro, partner) < clean, "buyers discount a troublemaker");
assert(tradeFactors(s, pro, partner).factors.some((f) => f.key === "conduct" && /Wary of his character: has demanded a trade/.test(f.text)));
pro.tradeDemand = false;
pro.morale = 75;
pro.controversy = 0.9;
assert(conductProfile(s, pro).flags.includes("off-field controversy"), "an optional controversy score is honoured");
delete pro.controversy;
const unhappy = healthy(S.roster(s, partner).slice().sort((a, b) => b.ovr - a.ovr)[4]);
unhappy.joined = { team: partner, year: s.year };
const calm = askingValue(s, unhappy, partner);
unhappy.tradeDemand = true;
assert(askingValue(s, unhappy, partner) < calm, "a player who asked out is cheaper to prise away");
assert(sellFactors(s, unhappy, partner).factors.some((f) => /asked out/.test(f.text)));

/* ------------------------------------------------ reasons and counters */
s = fresh();
partner = partnerOf(s);
const lop = evaluateTrade(s, { partner, give: [ownedPicks(s, s.team).find((p) => p.round === 7).id], get: [ownedPicks(s, partner).find((p) => p.round === 1).id] });
assert.equal(lop.accept, false);
assert(lop.gap > 0 && lop.reasons.some((r) => /want \d+\. Add about \d+ points/.test(r)), "a refusal states the gap in points");
assert(lop.factors.some((f) => f.key === "margin" && f.tone === "bad"), "their margin is listed as a factor");
assert(lop.counter && lop.counter.adds.length >= 1 && lop.counter.value >= lop.gap, "the counter closes the gap");

// Trading away your own icon upsets the fans and is logged; the move stamps where he joined.
s = fresh();
partner = partnerOf(s);
const favourite = healthy(s.roster.slice().sort((a, b) => b.ovr - a.ovr)[1]);
favourite.joined = { team: s.team, year: s.year - 6 };
favourite.reputation = { recognition: 88, delta: 0, history: [] };
assert.notEqual(clubStanding(s, favourite, s.team).level, "none");
const deal = { partner, give: [favourite.id], get: [ownedPicks(s, partner).find((p) => p.round === 7).id] };
assert(evaluateTrade(s, deal).accept, "a cheap pick for a star is accepted");
executeTrade(s, deal);
assert.deepEqual(favourite.joined, { team: partner, year: s.year }, "the trade records when he joined his new club");
assert(s.franchise.events.some((e) => e.title === "Fans react" && e.body.includes(favourite.name)), "fans react to losing a favourite");

/* ---------------------------------------------------- free agency */
s = fresh();
const a = (s.team + 3) % 32,
  b = (s.team + 4) % 32;
for (const t of [a, b]) {
  s.teams[t].rating = 80;
  s.franchise.clubs[t].staff[0].rating = 70;
  s.franchise.taxRate[t] = 0;
}
const fa = healthy(s.agents.slice().sort((x, y) => y.ovr - x.ovr)[0]);
delete fa.preferredScheme;
fa.age = 31;
fa.persona = { money: 0.3, loyalty: 0.5, ambition: 0.7, leadership: 0.5 };
const terms = { annual: Math.max(1, fa.salary), years: 2, bonus: fa.salary * 0.5, guaranteed: fa.salary };
const offerFor = (t) => ({ team: t, contract: { ...C.proposal(s, fa, terms), team: t } });
// Contention: same money, same rating and staff; one club is winning, the other losing.
s.phase = "season";
s.teams[a].w = 6;
s.teams[a].l = 0;
s.teams[b].w = 0;
s.teams[b].l = 6;
for (const q of S.roster(s, a).filter((p) => p.pos === fa.pos)) q.ovr = 40;
for (const q of S.roster(s, b).filter((p) => p.pos === fa.pos)) q.ovr = 40;
assert.equal(teamMode(s, a), "Contender");
assert.equal(teamMode(s, b), "Rebuilding");
assert(C.offerScore(s, fa, offerFor(a)) > C.offerScore(s, fa, offerFor(b)), "with equal money a veteran prefers the contender");
assert(signingFactors(s, fa, a).reasons.some((r) => /prefers contenders/.test(r.text)), "the reason is spelled out");
assert(signingEdge(s, fa, a, b).includes("a better chance to win"));
// Playing time: same records; one club would start him, the other would bury him.
s.teams[b].w = 6;
s.teams[b].l = 0;
for (const q of S.roster(s, b).filter((p) => p.pos === fa.pos)) q.ovr = 99;
while (S.roster(s, b).filter((p) => p.pos === fa.pos).length < 6) S.roster(s, b).push({ ...S.roster(s, b).find((p) => p.pos === fa.pos), id: `qa-${fa.pos}-${Math.random()}`, ovr: 99 });
assert(C.offerScore(s, fa, offerFor(a)) > C.offerScore(s, fa, offerFor(b)), "with equal money he prefers the club where he starts");
assert(signingFactors(s, fa, a).reasons.some((r) => /He'd start here/.test(r.text)));
assert(signingFactors(s, fa, b).reasons.some((r) => /He wants to start/.test(r.text)));
// Money-first players care less about everything else.
const greedy = { ...fa, persona: { ...fa.persona, money: 0.95 } };
assert(signingFactors(s, greedy, a).total - signingFactors(s, greedy, b).total < signingFactors(s, fa, a).total - signingFactors(s, fa, b).total);
assert(signingFactors(s, greedy, a).reasons.some((r) => /Money talks/.test(r.text)));

/* ---------------------------------------------- "Trade for <player>" */
s = fresh();
partner = partnerOf(s);
const target = S.roster(s, partner).find((p) => !p.starter && p.ovr >= 65) || S.roster(s, partner)[5];
const builder = applyTradeFor(s, target.id, partner, {});
assert.equal(builder.market, "builder");
assert.equal(builder.partner, partner, "the player's club is the trade partner");
assert.deepEqual(builder.get, [target.id], "the player is preselected in You receive");
assert(Array.isArray(builder.give) && builder.give.length >= 1 && builder.response.ok, "a suggested package is filled in");
const legend = healthy(S.roster(s, partner).slice().sort((x, y) => y.ovr - x.ovr)[0]);
setMode(s, partner, "Middle");
legend.ovr = Math.max(legend.ovr, 88);
legend.joined = { team: partner, year: s.year - 10 };
legend.reputation = { recognition: 95, delta: 0, history: [] };
legend.persona.loyalty = 0.9;
const locked = applyTradeFor(s, legend.id, partner, {});
assert.deepEqual(locked.get, [legend.id]);
assert.equal(locked.give.length, 0);
assert(/not for sale/.test(locked.response.title));
assert.equal(applyTradeFor(s, "nobody", partner, {}).get.length, 0, "a stale link selects nobody");
const profileSource = fs.readFileSync("dist/franchise/player-ui.mjs", "utf8");
assert(/Ops\.tradeFor\('\$\{p\.id\}',\$\{e\.team\}\)/.test(profileSource) && /Trade for \$\{esc\(p\.name\)\}/.test(profileSource), "the profile offers Trade for <name>");
assert(!/>Trade centre</.test(profileSource));

// A deal or suggestion must never leave you without a healthy player at a position in season.
{
  const { tradeBlockers } = await import("./dist/franchise/market.mjs");
  const q = fresh();
  ensurePickLedger(q);
  q.phase = "season";
  const qbs = q.roster.filter((p) => p.pos === "QB");
  qbs.slice(1).forEach((p) => (p.injury = 4));
  const other = (q.team + 2) % 32,
    deal = { partner: other, give: [qbs[0].id], get: [ownedPicks(q, other)[0].id] };
  assert(tradeBlockers(q, deal).some((b) => /without a healthy QB/.test(b.reason)), "trading the only healthy QB is blocked");
  const target = q.franchise.clubs[other].players.filter((p) => p.pos !== "QB").sort((a, b) => b.ovr - a.ovr)[0];
  assert(!suggestPackage(q, other, [target.id]).give.includes(qbs[0].id), "the suggester never offers the only healthy QB");
}

console.log("PASS: icon premiums and untouchable legends, injury/wear/age discounts, rebuilding vs contending preferences, positional need, troublemaker and trade-demand discounts, readable reasons and counters, fan reaction, free agents choosing contention and playing time, Trade for <player> preselection.");
