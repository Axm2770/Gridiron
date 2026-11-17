// Simulator preferences persist per device and only change presentation; the intro reads state.
import assert from "node:assert/strict";
const store = {};
globalThis.localStorage = { getItem: (k) => store[k] ?? null, setItem: (k, v) => (store[k] = String(v)) };
const O = await import("./dist/presentation/sim-options.mjs");
const { introCard, introHTML, introKey } = await import("./dist/presentation/match-intro.mjs");
const { simulateExecution } = await import("./dist/engine/execution.mjs");

assert.deepEqual(O.simOptions(), O.SIM_DEFAULTS);
O.setSimOption("gameSpeed", "1.5");
O.setSimOption("replays", false);
O.setSimOption("captions", "Key plays");
assert.deepEqual(JSON.parse(store["gridiron-sim-options"]), { ...O.SIM_DEFAULTS, gameSpeed: 1.5, replays: false, captions: "Key plays" });
assert.deepEqual(O.normalizeSimOptions({ gameSpeed: 9, captions: "Loud", replays: "false", replaySpeed: "0.25" }), { ...O.SIM_DEFAULTS, replays: false, replaySpeed: 0.25 });
assert.throws(() => O.setSimOption("score", 99));
assert.equal(O.captionAllowed({ type: "Snap" }, "Key plays"), false);
assert.equal(O.captionAllowed({ type: "Outcome" }, "Key plays"), true);
assert.equal(O.captionAllowed({ type: "Outcome" }, "Off"), false);
const html = O.simOptionsControls({ compact: true, voices: [{ voiceURI: 'x"y', name: "Ava", lang: "en-US" }] });
for (const label of ["Instant replays", "Replay speed", "Game speed", "Matchday intro", "Spoken commentary", "Commentator voice", "Captions"]) assert.ok(html.includes(label), label);
assert.ok(html.includes("x&quot;y"), "voice names are escaped");

// Instant replays pick out the plays worth seeing again.
const exec = (call, seed) => ({ execution: simulateExecution({ seed, playId: "o" + seed, spot: 40, call, coverage: "Cover 2" }) });
let picked = 0;
for (let s = 0; s < 60; s++) {
  const last = exec(s % 2 ? "Deep pass" : "Inside run", s),
    r = last.execution.result;
  const expected = ["touchdown", "interception", "sack"].includes(r.kind) || r.yards >= 20 || (r.yards >= 8 && last.execution.events.some((e) => e.type === "BrokenTackle"));
  assert.equal(O.bigPlay(last), expected);
  picked += expected;
}
assert.ok(picked > 0 && picked < 60);
assert.equal(O.bigPlay({ penalty: true, execution: exec("Deep pass", 1).execution }), false);
assert.equal(O.bigPlay({ text: "no execution" }), false);

// Intro card: teams, venue, weather, records; no writes to state.
const clubList = Array.from({ length: 32 }, (_, i) => [`T${i}`, `City ${i}`, `Team ${i}`]);
const s = { year: 2026, week: 3, team: 4, teams: Array.from({ length: 32 }, (_, i) => ({ w: i % 5, l: 2, rating: 70 + i })), franchise: { clubs: { 4: { stadium: { name: "Harbor Field <1>" } } } } };
const frozen = JSON.stringify(s),
  m = { a: 4, b: 9, weather: "Rain" },
  card = introCard(m, s, clubList);
assert.equal(card.venue, "Harbor Field <1>");
assert.equal(card.home.record, "4–2");
assert.equal(card.away.name, "Team 9");
assert.ok(card.home.yours && !card.away.yours);
assert.equal(card.week, "WEEK 4");
assert.match(card.weather, /Rain/);
const page = introHTML(card);
assert.ok(page.includes("Harbor Field &lt;1&gt;") && page.includes("KICKOFF") && page.includes("Skip intro"));
assert.equal(JSON.stringify(s), frozen);
assert.notEqual(introKey(m, s), introKey({ ...m, b: 10 }, s));
console.log("PASS: simulator options persist and validate, caption verbosity, instant-replay selection, matchday intro card");
