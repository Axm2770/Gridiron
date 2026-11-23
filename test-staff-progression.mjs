// Staff progression: coaches age, progress and retire once a season; the user's coach grows from
// results; the new-career wizard enforces realistic limits. Also a 12-season balance check.
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import * as S from "./dist/franchise/state.mjs";
import * as Staff from "./dist/franchise/staff.mjs";
import * as L from "./dist/franchise/lifecycle.mjs";
import * as P from "./dist/franchise/staff-progression.mjs";
import * as CP from "./dist/franchise/coach-profile.mjs";
import { generateJobOffers, userCoachRating } from "./dist/franchise/career-systems.mjs";
import { trendBadge, whyLine, coachGrowthPanel, staffReviewStrip } from "./dist/franchise/staff-progression-ui.mjs";

const context = {
  console,
  Math,
  Date,
  setTimeout() {},
  localStorage: { getItem: () => null, setItem() {} },
  document: { getElementById: () => ({ innerHTML: "", style: {}, showModal() {}, close() {} }), querySelector: () => ({}), querySelectorAll: () => [] },
};
context.window = context;
context.addEventListener = () => {};
vm.createContext(context);
vm.runInContext(fs.readFileSync("dist/game.js", "utf8"), context);
vm.runInContext(fs.readFileSync("dist/match.js", "utf8"), context);
function fresh(attrs = null) {
  const s = JSON.parse(vm.runInContext("JSON.stringify(fresh())", context));
  s.coach = { name: "Progression QA", calling: "Manual" };
  S.migrate(s);
  const coach = CP.defaultCoach(s.team);
  if (attrs) coach.attributes = { ...attrs };
  CP.applyCoach(s, coach);
  Staff.ensureStaff(s);
  return s;
}
// A finished season with chosen results (wins per team) so rollover has something to judge.
function finishSeason(s, wins = () => 8, champion = null) {
  const f = s.franchise,
    games = f.rules.regularGames || 17;
  for (let t = 0; t < 32; t++) {
    const w = Math.max(0, Math.min(games, wins(t)));
    s.teams[t].w = w;
    s.teams[t].l = games - w;
  }
  const rank = (ids) => ids.slice().sort((a, b) => s.teams[b].w - s.teams[a].w || a - b);
  const seeds = [0, 1].map((conf) => {
    const ids = Array.from({ length: 16 }, (_, i) => i + conf * 16),
      winners = Array.from({ length: 4 }, (_, i) => rank(ids.slice(i * 4, i * 4 + 4))[0]);
    return [...rank(winners), ...rank(ids.filter((t) => !winners.includes(t))).slice(0, 3)];
  });
  f.postseason = { seeds, round: 3 };
  const champ = champion ?? seeds[0][0],
    other = seeds[1][0] === champ ? seeds[1][1] : seeds[1][0];
  s.playoffs = { rounds: [[{ a: champ, b: other, score: [27, 20] }]] };
  s.history.push({ year: s.year, champion: champ });
  s.phase = "offseason";
  f.calendar.leagueYear = s.year + 1;
}
const allStaff = (s) => [...s.franchise.clubs.flatMap((c) => c.staff), ...s.franchise.staffPool];

/* ---------- old-save migration ---------- */
{
  const s = fresh();
  for (const c of allStaff(s)) for (const k of ["age", "experience", "history", "talent", "poolSince"]) delete c[k];
  delete s.franchise.staffProgression;
  const a = structuredClone(s),
    b = structuredClone(s);
  Staff.ensureStaff(a);
  Staff.ensureStaff(b);
  for (const c of allStaff(a)) {
    if (c.userControlled) continue;
    assert(Number.isInteger(c.age) && c.age >= 28 && c.age <= 70, `derived age for ${c.id}: ${c.age}`);
    assert(Number.isInteger(c.experience) && c.experience >= 1 && c.experience < c.age);
    assert(Array.isArray(c.history) && Number.isInteger(c.talent));
  }
  assert.deepEqual(allStaff(a).map((c) => c.age), allStaff(b).map((c) => c.age), "derived ages are deterministic");
  assert(a.franchise.staffProgression?.base?.ovr && Object.keys(a.franchise.staffProgression.base.ovr).length > 1000, "a player baseline is taken for old saves");
  const hc = a.franchise.clubs[a.team].staff.find((c) => c.role === "HC");
  assert.equal(hc.age, a.franchise.userCoach.age, "your own staff entry uses your coach's age");
  const roles = Object.groupBy(allStaff(a).filter((c) => !c.userControlled), (c) => c.role),
    avg = (r) => roles[r].reduce((n, c) => n + c.age, 0) / roles[r].length;
  assert(avg("HC") > avg("QB"), "head coaches are older on average than position coaches");
  S.validate(a);
}

/* ---------- idempotency, bounds, ageing ---------- */
{
  const s = fresh();
  finishSeason(s, (t) => 4 + (t % 10));
  const before = new Map(allStaff(s).map((c) => [c.id, { rating: c.rating, age: c.age }]));
  const once = P.progressStaff(s);
  assert(once && once.changed > 400, "every coach is reviewed");
  const snapshot = JSON.stringify(allStaff(s).map((c) => [c.id, c.rating, c.age]));
  assert.equal(P.progressStaff(s), null, "a second pass in the same season is a no-op");
  assert.equal(JSON.stringify(allStaff(s).map((c) => [c.id, c.rating, c.age])), snapshot);
  for (const c of allStaff(s)) {
    assert(c.rating >= P.STAFF_RATING.min && c.rating <= P.STAFF_RATING.max, `rating in bounds: ${c.rating}`);
    const was = before.get(c.id);
    if (!was || c.userControlled) continue;
    assert(Math.abs(c.rating - was.rating) <= P.STAFF_RATING.change, `change capped at ±4 for ${c.id}`);
    assert.equal(c.age, was.age + 1, "everyone ages a year");
    const last = c.history.at(-1);
    assert.equal(last.y, s.year);
    assert.equal(last.d, c.rating - was.rating);
    assert(last.why.length <= 3 && last.why.every((w) => typeof w.label === "string"));
  }
  // Only the latest entry keeps reasons (small saves).
  assert(allStaff(s).every((c) => c.history.slice(0, -1).every((h) => !h.why)));
  // Extremes stay inside 40–99.
  const hot = { id: "x-hot", role: "HC", rating: 98, age: 33, tenure: 8, scheme: "Balanced", talent: 12, history: [] },
    cold = { id: "x-cold", role: "QB", rating: 41, age: 70, tenure: 0, scheme: "Balanced", talent: -10, history: [], pendingDismissal: true };
  const big = { employed: true, season: { games: 17, wins: 16, expected: 7, champion: true, playoffWins: 4, qualified: true, division: true }, dev: 6, league: 0, fit: 0.6 },
    awful = { employed: true, season: { games: 17, wins: 1, expected: 10, champion: false, playoffWins: 0, qualified: false, division: false }, dev: -6, league: 0, fit: -0.6 };
  const dHot = P.staffRatingChange(hot, P.staffChangeFactors(hot, big, 2030)),
    dCold = P.staffRatingChange(cold, P.staffChangeFactors(cold, awful, 2030));
  assert(hot.rating + dHot <= 99 && dHot <= 4);
  assert(cold.rating + dCold >= 40 && dCold >= -4);
}

/* ---------- getting older is not always decline ---------- */
{
  const old = { id: "veteran-oc", role: "OC", rating: 76, age: 64, tenure: 7, scheme: "Vertical offense", talent: 2, history: [] };
  const winning = { employed: true, season: { games: 17, wins: 13, expected: 8.5, champion: false, playoffWins: 2, qualified: true, division: true }, dev: 2.6, league: 0.2, fit: 0.4 };
  const losing = { employed: true, season: { games: 17, wins: 4, expected: 8.5, champion: false, playoffWins: 0, qualified: false, division: false }, dev: -1.5, league: 0.2, fit: 0 };
  const ups = [],
    downs = [];
  for (let y = 2030; y < 2050; y++) {
    ups.push(P.staffRatingChange(old, P.staffChangeFactors(old, winning, y)));
    downs.push(P.staffRatingChange(old, P.staffChangeFactors(old, losing, y)));
  }
  assert(ups.every((d) => d > 0), `a 64-year-old on a winning, developing unit improves: ${ups}`);
  assert(downs.every((d) => d < 0), `the same coach on a losing, regressing unit declines: ${downs}`);
  const why = P.topReasons(P.staffChangeFactors(old, winning, 2030), 2).map((r) => r.label).join(" | ");
  assert(/Won 13/.test(why) && /Offense \+[0-9.]+ OVR vs league/.test(why), why);
  // Integration: the same story through progressStaff on a real save.
  const s = fresh();
  const t = 5,
    club = s.franchise.clubs[t],
    oc = club.staff.find((c) => c.role === "OC");
  Object.assign(oc, { age: 64, rating: 76, tenure: 7, talent: 2 });
  const base = s.franchise.staffProgression.base.ovr;
  for (const p of S.roster(s, t)) if (["QB", "RB", "WR", "TE", "OL"].includes(p.pos)) base[p.id] = p.ovr - 3;
  s.franchise.preseasonExpectations[s.year] = { year: s.year, teams: s.teams.map((_, i) => ({ team: i, expectedWins: 8.5 })) };
  finishSeason(s, (x) => (x === t ? 14 : 8), t);
  P.progressStaff(s);
  assert(oc.rating > 76, `veteran OC improved after a title run with his offense up 3 OVR: ${oc.rating}`);
  assert.equal(oc.age, 65);
  assert(/championship|Won 14|Offense \+/i.test(oc.history.at(-1).why.map((w) => w.label).join(" ")));
  // The UI shows the age, arrow and the why.
  assert(trendBadge(oc).includes("▲") && trendBadge(oc).includes(`+${oc.history.at(-1).d}`));
  assert(whyLine(oc).includes("sp-why") && whyLine(oc).includes(`in ${s.year}`) && whyLine(oc).includes("▲"));
}

/* ---------- retirement ---------- */
{
  const c = (age, extra = {}) => ({ id: "r" + age, age, role: "OC", employer: 1, ...extra });
  assert.equal(P.retirementChance(c(50)), 0);
  assert(P.retirementChance(c(66)) > P.retirementChance(c(61)));
  assert(P.retirementChance(c(66), -2) > P.retirementChance(c(66), 0), "poor seasons raise the chance");
  assert(P.retirementChance(c(66), 2) < P.retirementChance(c(66), 0), "winners stay on");
  assert(P.retirementChance(c(66, { employer: null })) > P.retirementChance(c(66)), "unemployed veterans retire sooner");
  assert.equal(P.retirementChance(c(70, { userControlled: true })), 0, "your own coach never retires");
  assert(P.retirementChance(c(77)) >= 0.85);
  // A retiring member of your staff leaves an inbox note and (non-HC) a vacancy; notable league
  // retirements reach the news.
  const s = fresh();
  const mine = s.franchise.clubs[s.team].staff.find((x) => x.role === "DC"),
    star = s.franchise.clubs[3].staff.find((x) => x.role === "OC");
  Object.assign(mine, { age: 80 });
  Object.assign(star, { age: 80, rating: 90 });
  finishSeason(s);
  const out = P.progressStaff(s);
  assert(out.retired.some((r) => r.id === mine.id) && out.retired.some((r) => r.id === star.id));
  assert(!s.franchise.clubs[s.team].staff.some((x) => x.role === "DC"), "your vacancy stays open for you to fill");
  assert(s.franchise.clubs[3].staff.some((x) => x.role === "OC"), "CPU clubs appoint a replacement");
  const office = s.franchise.office;
  assert(office.messages.some((m) => m.id === `mail-staff-retire-${s.year}-${mine.id}`), "inbox note for your staff");
  assert(office.stories.some((m) => m.id === `story-staff-retire-${s.year}-${star.id}`), "news story for a notable coach");
  assert(!office.stories.some((m) => /staff-retire/.test(m.id) && m.id.includes(mine.id)) || mine.rating >= 85);
}

/* ---------- firings feed in ---------- */
{
  const s = fresh();
  s.franchise.role = "Owner";
  const qb = s.franchise.clubs[s.team].staff.find((c) => c.role === "QB");
  s.franchise.clubs[s.team].cash = 1e12;
  Staff.fireStaff(s, qb.id);
  const pooled = s.franchise.staffPool.find((c) => c.id === qb.id);
  assert(pooled.pendingDismissal && pooled.poolSince === s.year);
  const f = P.staffChangeFactors(pooled, { employed: false }, s.year);
  assert(f.some((x) => x.key === "dismissed" && x.value < 0), "a dismissed coach takes a hit at the next review");
}

/* ---------- multi-season rollover: balance, pool, idempotency ---------- */
{
  const s = fresh();
  let seed = 7;
  const rnd = () => (seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648;
  const rows = [];
  for (let i = 0; i < 12; i++) {
    const exp = s.franchise.preseasonExpectations?.[s.year]?.teams;
    finishSeason(s, (t) => {
      let w = 0;
      for (let g = 0; g < 17; g++) if (rnd() < (exp?.[t]?.expectedWins ?? 8.5) / 17) w++;
      return w;
    }, Math.floor(rnd() * 32));
    L.rollSeason(s);
    const y = s.year - 1;
    assert(s.franchise.staffProgression.seen.includes(y), "rollover runs the staff review");
    rows.push(s.franchise.staffProgression.seasons[y]);
    for (const club of s.franchise.clubs)
      if (club.id !== s.team) for (const r of ["HC", "OC", "DC", "QB"]) assert(club.staff.some((c) => c.role === r), `CPU ${club.id} keeps a ${r}`);
    assert(s.franchise.staffPool.length >= 40, "the staff pool never drains");
    assert(s.franchise.staffPool.some((c) => c.rookie && c.age <= 40), "new young candidates appear");
  }
  const means = rows.map((r) => r.employed.mean),
    elites = rows.map((r) => r.elite),
    retirements = rows.map((r) => r.retirements);
  assert(Math.max(...means) - Math.min(...means) < 4, `league mean stays stable: ${means}`);
  assert(means.every((m) => m > 68 && m < 82), `league mean in a sensible band: ${means}`);
  assert(rows.every((r) => r.employed.sd > 4 && r.employed.sd < 9), "spread is kept (no collapse to one value)");
  assert(elites.every((n) => n >= 10 && n <= 90), `85+ coaches stay a minority but exist: ${elites}`);
  assert(rows.every((r) => r.max <= 99 && r.min >= 40));
  assert(retirements.reduce((a, b) => a + b, 0) >= 30 && retirements.every((n) => n <= 45), `retirements per year: ${retirements}`);
  const young = rows.at(-1).bands["≤40"].n,
    old = rows.at(-1).bands["65+"].n;
  assert(young >= 20 && old < young * 2, `the age structure keeps renewing: ≤40 ${young}, 65+ ${old}`);
  // Your coach grew over a decade (balanced HC growth), capped and recorded.
  const g = s.franchise.coachGrowth.history;
  assert.equal(g.length, 12);
  assert(CP.coachRating(s.franchise.userCoach.attributes) > 65);
  assert(Object.values(s.franchise.userCoach.attributes).every((v) => v >= 1 && v <= 20));
  assert.equal(s.franchise.userCoach.age, 38 + 12);
  assert.equal(s.franchise.clubs[s.team].staff.find((c) => c.userControlled).rating, CP.coachRating(s.franchise.userCoach.attributes), "HC rating is recomputed from attributes");
  CP.validateCoach(s.franchise.userCoach);
  S.validate(s);
  const size = Buffer.byteLength(JSON.stringify(allStaff(s)) + JSON.stringify(s.franchise.staffProgression));
  assert(size < 400_000, `staff data stays small: ${size}`);
  assert(staffReviewStrip(s).includes("review") && coachGrowthPanel(s).includes("Season reviews"));
  console.log(`  balance: mean ${means.map((m) => m.toFixed(1)).join(" ")} | 85+ ${elites.join(" ")} | retired ${retirements.join(" ")}`);
}

/* ---------- your coach grows ---------- */
{
  const s = fresh();
  s.franchise.preseasonExpectations[s.year] = { year: s.year, teams: s.teams.map((_, i) => ({ team: i, expectedWins: 8.5 })) };
  finishSeason(s, (t) => (t === s.team ? 14 : 8), s.team);
  const before = { ...s.franchise.userCoach.attributes },
    rating = CP.coachRating(before);
  const entry = P.progressUserCoach(s, { season: null });
  const gained = Object.values(entry.changes).reduce((a, b) => a + b, 0);
  assert(gained >= 2 && gained <= P.COACH_GROWTH_MAX_PER_SEASON, `a title season earns 2–3 points: ${gained}`);
  assert(entry.reasons.some((r) => /championship/i.test(r)));
  assert.equal(entry.ratingBefore, rating);
  assert.equal(entry.ratingAfter, CP.coachRating(s.franchise.userCoach.attributes));
  assert.equal(P.progressUserCoach(s, {}), null, "one review per season");
  const msg = s.franchise.office.messages.find((m) => m.id === `mail-coach-growth-${s.year}-${s.team}`);
  assert(msg && /^Season review: /.test(msg.title) && msg.data.kind === "effects", "season review message with the changes");
  assert(msg.title.includes(P.coachGrowthLabel(entry.changes)));
  // Role weights: an OC grows offense far more often than defense.
  let off = 0,
    def = 0;
  for (let y = 0; y < 40; y++) {
    const o = fresh();
    o.franchise.role = "OC";
    o.franchise.userCoach.name = "OC " + y;
    finishSeason(o, (t) => (t === o.team ? 13 : 8));
    const e = P.progressUserCoach(o, {});
    off += e.changes.offense || 0;
    def += e.changes.defense || 0;
  }
  assert(off > def * 3, `OC growth leans offense: offense ${off}, defense ${def}`);
  // Attributes never pass 20.
  const maxed = fresh(Object.fromEntries(CP.COACH_ATTRIBUTES.map((k) => [k, 20])));
  finishSeason(maxed, (t) => (t === maxed.team ? 15 : 8), maxed.team);
  P.progressUserCoach(maxed, {});
  assert(Object.values(maxed.franchise.userCoach.attributes).every((v) => v <= 20));
  // Late in a long career, a bad year can cost a point (rarely); never below 1.
  let declines = 0;
  for (let y = 0; y < 40; y++) {
    const v = fresh();
    Object.assign(v.franchise.userCoach, { age: 68, name: "Veteran " + y });
    v.franchise.coachGrowth = { seen: [], history: Array.from({ length: 10 }, (_, i) => ({ year: 2000 + i, changes: {} })) };
    finishSeason(v, (t) => (t === v.team ? 2 : 9));
    const e = P.progressUserCoach(v, {});
    if (Object.values(e.changes).some((d) => d < 0)) declines++;
    assert(Object.values(e.changes).every((d) => d <= 0), "no growth from a 2-win season at 68");
  }
  assert(declines > 3 && declines < 30, `declines are occasional: ${declines}/40`);
  // Job offers use the updated rating.
  const lo = fresh(),
    hi = fresh({ offense: 18, defense: 18, tactics: 17, development: 17, motivation: 17, discipline: 16, medical: 14, adaptability: 16 });
  for (const x of [lo, hi]) {
    x.phase = "offseason";
    x.franchise.coachReputation.value = 80;
    generateJobOffers(x);
  }
  assert(userCoachRating(hi) > userCoachRating(lo));
  assert(hi.franchise.coachReputation.jobOffers[0].salary > lo.franchise.coachReputation.jobOffers[0].salary, "a stronger coach commands a bigger offer");
}

/* ---------- wizard validation ---------- */
{
  const ok = CP.defaultCoach(4);
  assert.deepEqual(CP.coachCreationIssues(ok), []);
  CP.validateNewCoach(ok);
  const issue = (patch, field) => {
    const c = { ...structuredClone(ok), ...patch };
    const list = CP.coachCreationIssues(c);
    assert(list.some((x) => x.field === field), `${JSON.stringify(patch)} should flag ${field}: ${JSON.stringify(list)}`);
    assert.throws(() => CP.validateNewCoach(c), (e) => Array.isArray(e.issues) && e.issues.length > 0);
    return list.find((x) => x.field === field);
  };
  issue({ name: "" }, "name");
  issue({ name: "   " }, "name");
  issue({ name: "A" }, "name");
  issue({ name: "x".repeat(41) }, "name");
  issue({ name: "<script>" }, "name");
  issue({ name: "Coach 42" }, "name");
  assert.deepEqual(CP.coachCreationIssues({ ...ok, name: "  Seán  O'Brien-Smith Jr. " }), [], "accents, apostrophes, hyphens, spaces are fine");
  assert.match(issue({ age: 29, role: "HC" }, "age").message, /head coach must be 30–75/);
  assert.deepEqual(CP.coachCreationIssues({ ...ok, age: 29, role: "OC" }), [], "a 29-year-old coordinator is realistic");
  issue({ age: 27, role: "OC" }, "age");
  issue({ age: 76 }, "age");
  issue({ age: "4o" }, "age");
  issue({ age: 40.5 }, "age");
  issue({ age: "" }, "age");
  issue({ nationality: "  " }, "nationality");
  issue({ appearance: { ...ok.appearance, height: 150 } }, "height");
  issue({ appearance: { ...ok.appearance, height: 230 } }, "height");
  issue({ appearance: { ...ok.appearance, height: 180.5 } }, "height");
  issue({ attributes: { ...ok.attributes, offense: 20 } }, "attributes");
  issue({ attributes: { ...ok.attributes, medical: 4 } }, "attributes");
  issue({ attributes: { ...ok.attributes, offense: 15, defense: 15 } }, "attributes"); // 106 points
  assert.match(issue({ attributes: { ...ok.attributes, offense: 15, defense: 15 } }, "attributes").message, /106 of 104/);
  issue({ saveName: " " }, "saveName");
  // You cannot max everything: 8 × 18 is far over budget.
  issue({ attributes: Object.fromEntries(CP.COACH_ATTRIBUTES.map((k) => [k, 18])) }, "attributes");
  // Presets fit the creation limits.
  for (const attrs of Object.values(CP.BACKGROUNDS)) assert.deepEqual(CP.coachCreationIssues({ ...ok, attributes: { ...attrs } }), []);
  // Each issue names the wizard step that fixes it.
  assert.equal(issue({ name: "" }, "name").step, 1);
  assert.equal(issue({ appearance: { ...ok.appearance, height: 150 } }, "height").step, 2);
  assert.equal(issue({ attributes: { ...ok.attributes, offense: 20 } }, "attributes").step, 3);
  // Soft notes for unusual but valid ages.
  assert.equal(CP.coachCreationNotes({ age: 45 }).length, 0);
  assert.equal(CP.coachCreationNotes({ age: 31 }).length, 1);
  assert.equal(CP.coachCreationNotes({ age: 70 }).length, 1);
  // Loaded careers keep the wider bounds: a coach who aged and grew still loads.
  assert.equal(CP.validateCoach({ ...ok, age: 81, attributes: Object.fromEntries(CP.COACH_ATTRIBUTES.map((k) => [k, 20])) }), true);
}
console.log("staff progression tests passed");
