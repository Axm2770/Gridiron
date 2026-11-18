import assert from "node:assert/strict";
import { playoffPicture, remainingGames, rankTeams, recentForm, streak } from "./dist/franchise/league-table.mjs";

// A 32-club league where every club plays one game a week against a fixed partner.
function league(weeks, played) {
  const s = { phase: "season", teams: Array.from({ length: 32 }, () => ({ w: 0, l: 0, pf: 0, pa: 0 })), schedule: [], franchise: {} };
  for (let w = 0; w < weeks; w++) {
    const games = [];
    for (let t = 0; t < 32; t += 2) games.push({ a: t, b: t + 1, score: null });
    s.schedule.push(games);
  }
  for (let w = 0; w < played; w++)
    for (const g of s.schedule[w]) {
      // Lower ids win, except club 2 who loses to club 3.
      const aWins = g.a !== 2;
      g.score = aWins ? [21, 10] : [10, 21];
      const [win, lose] = aWins ? [g.a, g.b] : [g.b, g.a];
      s.teams[win].w++;
      s.teams[lose].l++;
      s.teams[win].pf += 21; s.teams[win].pa += 10;
      s.teams[lose].pf += 10; s.teams[lose].pa += 21;
    }
  return s;
}

let s = league(4, 0);
let p = playoffPicture(s);
assert.equal(p.conferences.length, 2);
assert.equal(p.conferences[0].seeds.length, 7, "seven seeds per conference");
assert(Object.values(p.marks).every((m) => m === null), "nothing is decided before a game is played");
assert.deepEqual(remainingGames(s).slice(0, 2), [4, 4]);

s = league(4, 4);
p = playoffPicture(s);
// Clubs 0, 3 (beat club 2), 4, 6 ... are 4–0: eight unbeaten clubs per conference, so none is safe.
assert.equal(p.marks[0], null, "eight unbeaten clubs for seven seeds: nobody has clinched");
assert.equal(p.marks[1], "e", "an 0–4 club behind seven 4–0 clubs with no games left is eliminated");
assert.deepEqual(rankTeams(s, [1, 0]), [0, 1]);
assert.equal(p.conferences[0].seeds.length, 7);
assert(p.conferences[0].seeds.every((t) => t < 16) && p.conferences[1].seeds.every((t) => t >= 16));

// One club far ahead with one game left clinches its division; three clear of the field clinch a berth.
s = league(10, 9);
s.teams.forEach((r, t) => { r.w = t === 0 ? 9 : t === 4 || t === 8 || t === 12 ? 8 : 2; r.l = 9 - r.w; });
p = playoffPicture(s);
assert.equal(p.marks[0], "y", "nine wins against division rivals capped at three clinches the division");
assert.equal(p.marks[4], "y");
assert.equal(p.marks[5], null, "a 2–7 club can still reach a wildcard while only four clubs are out of reach");
s = league(10, 9);
s.teams.forEach((r, t) => { r.w = [0, 1, 4].includes(t) ? 9 : 2; r.l = 9 - r.w; });
p = playoffPicture(s);
assert.equal(p.marks[0], "x", "tied for the division but only two others can reach nine wins: berth clinched");
assert.equal(p.marks[1], "x");

s = league(6, 3);
p = playoffPicture(s);
assert.equal(p.marks[1], null, "an 0–3 club with three games left is still alive");

// After the regular season the stored seeds decide the marks.
s = league(2, 2);
s.phase = "playoffs";
s.franchise.postseason = { seeds: [[0, 4, 8, 12, 3, 6, 10], [16, 20, 24, 28, 18, 22, 26]] };
p = playoffPicture(s);
assert.equal(p.marks[0], "y");
assert.equal(p.marks[3], "x");
assert.equal(p.marks[1], "e");

assert.deepEqual(recentForm(league(3, 3), 2), ["L", "L", "L"]);
assert.equal(streak(["W", "L", "W", "W"]), "W2");
assert.equal(streak([]), "");
console.log("PASS: league table seeds, conservative clinch/elimination marks, postseason seeds, form and streaks.");
