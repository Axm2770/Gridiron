// Realistic scores for the user's club in every career role, and a realistic league-wide score
// distribution, through the same round-settlement inputs the calendar/holiday sim uses.
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import { fileURLToPath } from "node:url";
const dir = fileURLToPath(new URL(".", import.meta.url));
const root = new URL(".", import.meta.url).pathname;
const S = await import(root + "/dist/franchise/state.mjs");
const L = await import(root + "/dist/franchise/lifecycle.mjs");
const { roundJob } = await import(root + "/dist/franchise/matchday-sim.mjs");
const { simulateGame } = await import(root + "/dist/franchise/fast-worker.mjs");
const PC = await import(root + "/dist/franchise/play-calling.mjs");
const { applyRealRosters } = await import(root + "/dist/franchise/real-rosters.mjs");
const { configureRatings, ensureCareerRatings } = await import(root + "/dist/franchise/ratings.mjs");
const c = {
  console,
  Math,
  Date,
  setTimeout() {},
  localStorage: { getItem: () => null, setItem() {} },
  document: {
    getElementById: () => ({ innerHTML: "", style: {}, showModal() {}, close() {} }),
    querySelector: () => ({}),
    querySelectorAll: () => [],
  },
};
c.window = c;
c.addEventListener = () => {};
vm.createContext(c);
vm.runInContext(fs.readFileSync(dir + "/dist/game.js", "utf8"), c);
vm.runInContext(fs.readFileSync(dir + "/dist/match.js", "utf8"), c);
configureRatings(
  JSON.parse(fs.readFileSync(dir + "/dist/data/madden-ratings.json")),
  JSON.parse(fs.readFileSync(dir + "/dist/data/player-production.json")),
);
const rosters = JSON.parse(fs.readFileSync(dir + "/dist/data/nfl-rosters.json"));
const DEN = 12;
function career(role, team = DEN) {
  const s = JSON.parse(vm.runInContext(`JSON.stringify(fresh(${team}))`, c));
  s.coach = { name: "Test coach", calling: "Manual", style: "Balanced" };
  S.migrate(s);
  applyRealRosters(s, rosters);
  ensureCareerRatings(s);
  s.franchise.role = role;
  return s;
}
// One league round exactly as settleRound builds it (roundJob), then the lifecycle settlement.
function settle(s) {
  const results = s.schedule[s.week].map((g) => (g.score ? { ...g } : simulateGame(roundJob(s, g))));
  L.finishRound(s, results);
  return results;
}
const mean = (x) => x.reduce((a, b) => a + b, 0) / x.length;

// 1. The user's club scores like everyone else in every career role.
for (const role of ["HC", "OC", "DC"]) {
  const s = career(role),
    us = [],
    league = [];
  for (let w = 0; w < 4; w++)
    for (const r of settle(s)) {
      league.push(...r.score);
      if (r.a === s.team || r.b === s.team) us.push(r.score[r.a === s.team ? 0 : 1]);
    }
  assert.equal(us.length, 4);
  assert(mean(us) >= 12 && mean(us) <= 38, `${role}: user club averages ${mean(us)} points`);
  assert(Math.abs(mean(us) - mean(league)) <= 14, `${role}: user ${mean(us)} vs league ${mean(league)}`);
  assert(us.every((x) => x > 0), `${role}: the user club was shut out (${us})`);
}

// 2. A selected punt or field goal is a one-snap call; "Repeat selected play" never repeats it,
//    and fourth down is the staff's decision unless the call was picked for that snap.
{
  const live = { down: 1, call: "Punt", plays: 7 };
  assert.equal(PC.manualCall(live), null);
  assert.equal(PC.manualCall({ ...live, call: "Field goal" }), null);
  assert.equal(PC.manualCall({ ...live, call: "Inside run" }), "Inside run");
  assert.equal(PC.manualCall({ ...live, call: "Inside run", down: 4 }), null);
  assert.equal(PC.manualCall({ ...live, down: 4, callSerial: 7 }), "Punt");
  const s = career("OC");
  const g = s.schedule[0].find((x) => x.a === s.team || x.b === s.team);
  const base = { ...roundJob(s, g), tactics: { calling: "Manual", style: "Balanced" } };
  // A quick sim from kickoff with Punt left selected on the call sheet.
  const start = simulateGame({ ...base, target: "play" }).match;
  start.call = "Punt";
  const r = simulateGame({ ...base, live: start });
  const k = g.a === s.team ? 0 : 1;
  assert(r.score[k] >= 7, `a stuck punt call must not stop the offense: ${r.score}`);
  const userPunts = r.decisions.filter((d) => d.team === s.team && d.call === "Punt");
  assert(userPunts.every((d) => d.down === 4), "punts only on fourth down");
  // Old saves with a stuck special-teams call are repaired on load.
  const save = career("OC");
  save.live = { ...start, call: "Field goal" };
  S.migrate(save);
  assert.equal(save.live.call, PC.DEFAULT_CALL);
}

// 3. Halftime directives and tempo belong to the user's offense only.
{
  const s = career("HC", 16);
  const g = s.schedule[0].find((x) => x.a !== s.team && x.b !== s.team);
  const job = roundJob(s, g);
  const plain = simulateGame({ ...job, directives: {} }),
    directed = simulateGame({ ...job, directives: { halftime: true } });
  assert.deepEqual(directed.score, plain.score, "CPU-vs-CPU games ignore the user's halftime directive");
  const m = { tempo: "Hurry-up" };
  let seen;
  PC.withPossessionTempo(m, false, (x) => ((seen = x.tempo), { ...x }));
  assert.equal(seen, "Normal");
  assert.equal(m.tempo, "Hurry-up");
  // Saves left exhausted by the old live-coaching drain recover once.
  const tired = career("OC");
  delete tired.franchise.repairs;
  tired.roster.forEach((p) => (p.fitness = 45));
  S.migrate(tired);
  assert(tired.roster.every((p) => p.fitness >= 85));
  tired.roster[0].fitness = 50;
  S.migrate(tired);
  assert.equal(tired.roster[0].fitness, 50, "the fatigue repair runs once");
}

// 4. League-wide distribution over a full regular season.
{
  const s = career("HC", 16),
    games = [];
  while (s.phase === "season") games.push(...settle(s).map((r) => r.score));
  const points = games.flat(),
    margins = games.map(([a, b]) => Math.abs(a - b)),
    avg = mean(points),
    blowouts = margins.filter((m) => m > 35).length / games.length,
    wide = margins.filter((m) => m > 28).length / games.length,
    shutouts = points.filter((x) => x === 0).length / points.length,
    max = Math.max(...points);
  assert.equal(games.length, 272);
  assert(avg >= 18 && avg <= 27, `mean points per team-game ${avg}`);
  assert(max < 70, `a team scored ${max}`);
  assert(points.filter((x) => x >= 50).length / points.length < 0.01, "50-point games are very rare");
  assert(blowouts < 0.03, `margins over 35 in ${(blowouts * 100).toFixed(1)}% of games`);
  assert(wide < 0.08, `margins over 28 in ${(wide * 100).toFixed(1)}% of games`);
  assert(shutouts < 0.03, `shutouts in ${(shutouts * 100).toFixed(1)}% of team-games`);
  console.log(
    `PASS: user club scoring for HC/OC/DC careers; one-snap special-teams calls; user-only tempo and halftime directives; save repairs; season of ${games.length} games: ${avg.toFixed(1)} points per team, max ${max}, ${(wide * 100).toFixed(1)}% margins over 28, ${(blowouts * 100).toFixed(1)}% over 35, ${(shutouts * 100).toFixed(1)}% shutouts.`,
  );
}
