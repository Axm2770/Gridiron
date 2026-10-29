import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import * as S from "./dist/franchise/state.mjs";
import { ensureMedical, openCase, treatmentOutlook, recommendedTreatment, chooseTreatment, processMedicalWeek, medicalBoard, physioCandidates, hirePhysio } from "./dist/franchise/medical.mjs";
import { weekPlan, setSchedule, applyTemplate, setDrill, processTrainingWeek, changePosition, efficiency } from "./dist/franchise/training.mjs";
import { teamMode, signingFactors, ensurePickLedger, ownedPicks, pickValue, evaluateTrade, executeTrade, slotValue } from "./dist/franchise/market.mjs";
import { prospectProfile, scoutedView, consensusBoard, ensureScouting, processScoutingWeek, startLiveDraft, onTheClock, simToUserPick, makeUserPick, tradeUpQuote } from "./dist/franchise/draft-room.mjs";

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
  return s;
};

// Medical: existing injuries are baselined, new ones open a decision with an estimate range.
let s = fresh();
s.roster[0].injury = 3;
ensureMedical(s);
assert.equal(medicalBoard(s).decisions.length, 0, "pre-existing injuries never flood the decision queue");
const hurt = s.roster[5];
hurt.injury = 2;
hurt.medical = { bodyPart: "knee" };
const c = openCase(s, hurt);
assert.equal(c.status, "decision");
assert(c.estimate[0] <= c.trueWeeks && c.trueWeeks <= c.estimate[1], "the doctor's range contains the true timeline");
const outlooks = c.options.map((o) => treatmentOutlook(s, c, o));
assert(outlooks.every((o) => o.weeksOut >= 0 && o.reinjuryRisk > 0));
const pick = recommendedTreatment(s, c);
assert(c.options.includes(pick));
assert.throws(() => chooseTreatment(s, hurt.id, "not-a-treatment"), /appropriate/);
s.franchise.clubs[s.team].cash = 1e12;
chooseTreatment(s, hurt.id, pick);
assert.notEqual(ensureMedical(s).cases[hurt.id].status, "decision");
assert.throws(() => chooseTreatment(s, hurt.id, pick), /no pending/);
const before = processMedicalWeek(s, "r-med-1");
assert.deepEqual(processMedicalWeek(s, "r-med-1"), [], "medical tick is idempotent per round");
assert(Array.isArray(before));
const physio = physioCandidates(s)[0];
if (physio) hirePhysio(s, physio.id);

// Training: schedule drives intensity, needs a rest day, and grows targeted attributes.
s = fresh();
assert.throws(() => setSchedule(s, ["Padded", "Padded", "Padded", "Padded", "Padded", "Conditioning"]), /recovery or off day/);
const physical = applyTemplate(s, "Physical"),
  recovery = applyTemplate(s, "Recovery week");
assert(physical.intensity > recovery.intensity && physical.risk > recovery.risk);
assert.equal(s.franchise.preparation.intensity, recovery.intensity, "the schedule feeds the existing intensity knob");
applyTemplate(s, "Game-plan heavy");
setDrill(s, "offense", "Route timing");
assert.throws(() => setDrill(s, "offense", "Nope"), /drill/);
const wr = s.roster.find((p) => p.pos === "WR" && !p.injury);
assert(efficiency(s, wr) > 0.5);
const devBefore = wr.ratings?.development ?? 0;
const week = processTrainingWeek(s, "r-train-1");
assert(week && week.familiarity >= 20);
assert.equal(processTrainingWeek(s, "r-train-1"), null, "training tick is idempotent per round");
assert.equal(s.franchise.preparation.familiarity, s.franchise.training.familiarity);
assert((wr.ratings?.development ?? 0) >= devBefore);
const cb = s.roster.find((p) => p.pos === "CB");
const ovr = cb.ovr;
changePosition(s, cb.id, "S");
assert.equal(cb.pos, "S");
assert(cb.ovr <= ovr, "a position change costs rating up front");
assert.throws(() => changePosition(s, s.roster.find((p) => p.pos === "OL").id, "QB"), /won't move/);

// Market: signing factors are bounded, picks are owned, and trades must balance on value.
s = fresh();
assert(["Contender", "Rebuilding", "Middle"].includes(teamMode(s, 3)));
const fa = s.roster[10],
  sf = signingFactors(s, fa, s.team);
assert(sf.total >= 0.75 && sf.total <= 1.3 && sf.factors.length >= 4);
ensurePickLedger(s);
const mine = ownedPicks(s, s.team),
  partner = (s.team + 1) % 32,
  theirs = ownedPicks(s, partner);
assert(mine.length >= 7 && theirs.length >= 7, "each club owns its own picks for two drafts");
assert(pickValue(s, mine.find((p) => p.round === 1)) > pickValue(s, mine.find((p) => p.round === 7)));
assert(slotValue(1) > slotValue(32) && slotValue(32) > slotValue(224));
const lopsided = evaluateTrade(s, { partner, give: [mine.find((p) => p.round === 7).id], get: [theirs.find((p) => p.round === 1).id] });
assert.equal(lopsided.accept, false);
assert(lopsided.reasons.some((r) => /points/.test(r)));
const fair = evaluateTrade(s, { partner, give: [mine.find((p) => p.round === 1).id], get: [theirs.find((p) => p.round === 3).id] });
assert(fair.receives >= fair.sends);
if (fair.accept) {
  s.phase = "offseason";
  executeTrade(s, { partner, give: [mine.find((p) => p.round === 1).id], get: [theirs.find((p) => p.round === 3).id] });
  assert(ownedPicks(s, s.team).some((p) => p.id === theirs.find((x) => x.round === 3).id));
}

// Scouting: profiles are deterministic and hidden until confidence reveals them.
s = fresh();
const prospect = s.prospects[0];
assert.deepEqual(prospectProfile(prospect), prospectProfile(prospect));
s.franchise.reports = { [prospect.id]: { confidence: 10 } };
const fog = scoutedView(s, prospect);
assert.equal(fog.medical, null, "low confidence hides the medical file");
ensureScouting(s);
for (let i = 0; i < 12; i++) processScoutingWeek(s, `r-scout-${i}`);
assert(consensusBoard(s).length > 0);

// Live draft: CPU picks run until you're on the clock; your pick lands on your roster.
s = fresh();
s.phase = "offseason";
for (const t of s.teams) Object.assign(t, { w: 8, l: 9 });
startLiveDraft(s);
assert(s.franchise.draft.live);
simToUserPick(s);
const clock = onTheClock(s);
assert.equal(clock.team, s.team);
assert(s.franchise.draft.ticker.length === s.franchise.draft.cursor, "every CPU pick reaches the ticker");
while (s.roster.length >= 90) s.roster.pop();
const best = s.prospects[0];
makeUserPick(s, best.id);
assert(s.roster.some((p) => p.id === best.id));
const q = tradeUpQuote(s, s.franchise.draft.cursor);
assert(q === null || q.value >= q.cost);

console.log("ops systems: medical, training, market, scouting and live draft checks passed");
