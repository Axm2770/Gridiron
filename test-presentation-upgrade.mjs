import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import { searchKey } from "./dist/franchise/presentation.mjs";
import * as S from "./dist/franchise/state.mjs";
import * as P from "./dist/franchise/personnel.mjs";
import * as L from "./dist/franchise/lifecycle.mjs";
import * as DB from "./dist/franchise/database.mjs";
import {
  applyRealRosters,
  validateSnapshot,
} from "./dist/franchise/real-rosters.mjs";
import { simulateGame } from "./dist/franchise/fast-worker.mjs";
import { simulateExecution } from "./dist/engine/execution.mjs";
import {
  commentaryFor,
  CommentaryDirector,
  broadcastName,
} from "./dist/engine/commentary.mjs";
import { BroadcastVoice, rankVoice, speechText } from "./dist/engine/voice.mjs";
const data = JSON.parse(fs.readFileSync("dist/data/nfl-rosters.json"));
assert.equal(validateSnapshot(data).teams, 32);
assert(validateSnapshot(data).players > 2400);
assert.equal(data.season, 2026);
const nodes = {},
  context = {
    console,
    Date,
    Math,
    setTimeout: () => {},
    localStorage: { getItem: () => null, setItem: () => {} },
    document: {
      getElementById: (id) =>
        (nodes[id] ??= {
          innerHTML: "",
          style: {},
          showModal() {},
          close() {},
        }),
      querySelector: () => ({}),
    },
  };
vm.createContext(context);
vm.runInContext(fs.readFileSync("dist/game.js", "utf8"), context);
let s = JSON.parse(vm.runInContext("JSON.stringify(state)", context));
s.coach = { name: "Test coach" };
S.migrate(s);
applyRealRosters(s, data);
S.validate(s);
const dak = s.roster.find((p) => p.name === "Dak Prescott");
assert.equal(dak.jersey, "4");
assert.equal(dak.starter, true);
assert.equal(dak.pos, "QB");
assert(s.roster.find((p) => p.name === "CeeDee Lamb"));
assert(S.roster(s, 13).find((p) => p.name === "Patrick Mahomes"));
assert.equal(
  new Set(data.teams.flatMap((t) => S.roster(s, t.teamId).map((p) => p.id)))
    .size,
  data.teams.reduce((n, t) => n + S.roster(s, t.teamId).length, 0),
);
for (let t = 0; t < 32; t++) {
  let copy = { ...s, team: t, roster: S.roster(s, t) };
  assert.deepEqual(S.gameEligibility(copy), [], `team ${t} must be playable`);
  assert(S.capLedger(s, t).room > 0);
}
const pack = DB.exportPack(s);
assert(pack.source.includes("ESPN"));
let exported = pack.players.find((p) => p.id === dak.id);
assert.equal(exported.jersey, "4");
assert.equal(exported.realPlayer, true);
let imported = S.transact(s, (x) => DB.importPack(x, pack));
assert.equal(imported.roster.find((p) => p.id === dak.id).jersey, "4");
assert.throws(() => applyRealRosters({ ...s, live: {} }, data), /Finish/);
assert.throws(
  () => validateSnapshot({ ...data, teams: data.teams.slice(0, 31) }),
  /32-team/,
);
let qb = { id: dak.id, name: dak.name, jersey: dak.jersey, ovr: dak.ovr };
const exec = simulateExecution({
  seed: 42,
  playId: "roster-voice",
  spot: 25,
  call: "Quick pass",
  coverage: "Cover 2",
  offensePlayers: { QB: [qb] },
});
assert.equal(exec.actors[0].jersey, "4");
exec.context = {
  down: 3,
  toGo: 7,
  spot: 25,
  quarter: 4,
  clock: 60,
  team: "Cowboys",
};
let lines = commentaryFor(exec);
assert(lines[0].text.includes("Third and 7"));
assert(lines[0].text.includes("Prescott"));
assert(lines.some((l) => l.type === "Outcome"));
assert(
  !lines.some((l) => /yards of separation|selected a receiver/.test(l.text)),
);
assert.equal(broadcastName("Amon-Ra St. Brown"), "St. Brown");
assert.equal(broadcastName("Patrick Surtain II"), "Surtain");
let kick = {
  seed: 1,
  playId: "kick",
  duration: 3,
  actors: [{ name: "Dak Prescott" }],
  result: { kind: "fieldGoal", yards: 0 },
  events: [{ id: "kick", time: 1.6, type: "FieldGoalGood" }],
  context: { down: 4, toGo: 3, spot: 75 },
};
let kickLines = commentaryFor(kick);
assert(kickLines.some((l) => l.text.includes("42-yard")));
assert(!kickLines.some((l) => /runner|running room/.test(l.text)));
let spoken = [];
let director = new CommentaryDirector({
  speak: (text, line) => spoken.push({ text, line }),
});
director.enabled = true;
director.start(lines);
director.update(0);
director.update(99);
director.update(99);
assert.equal(spoken.length, 2);
director.start(lines, { replay: true });
director.update(99);
assert.equal(spoken.length, 2);
director.start(lines);
director.update(99, { seek: true });
assert.equal(spoken.length, 2);
const voices = [
  { name: "eSpeak", lang: "en-US", voiceURI: "robot" },
  { name: "Google US English", lang: "en-US", voiceURI: "natural" },
  { name: "Foreign", lang: "fr-FR", voiceURI: "fr" },
];
let utterances = [],
  cancels = 0;
const synth = {
  getVoices: () => voices,
  speak: (u) => utterances.push(u),
  cancel: () => cancels++,
};
class Utterance {
  constructor(text) {
    this.text = text;
  }
}
let voice = new BroadcastVoice({
  synth,
  Utterance,
  visible: () => true,
  volume: () => 0.7,
});
voice.speak("Prescott takes the snap.", { type: "Snap" });
voice.speak("Complete to Lamb.", { type: "Outcome" });
voice.speak("Touchdown, Lamb!", { type: "Outcome", excitement: 2 });
assert.equal(
  utterances.length,
  1,
  "do not interrupt a sentence for every event",
);
assert.equal(cancels, 0);
assert.equal(utterances[0].voice.voiceURI, "natural");
utterances[0].onend();
assert.equal(utterances.length, 2);
assert.equal(
  utterances[1].text,
  "Touchdown, Lamb!",
  "only the most recent queued result is retained",
);
voice.stop();
assert.equal(cancels, 1);
assert.equal(voice.current, null);
assert.equal(voice.queue.length, 0);
assert(rankVoice(voices[1]) > rankVoice(voices[0]));
assert(speechText("Tagovailoa throws to Achane.").includes("Ay-chan"));
const result = simulateGame({
  a: s.team,
  b: 13,
  home: s.roster,
  away: S.roster(s, 13),
  seed: 928,
  userTeam: s.team,
  directives: {},
});
assert(result.match.finished);
assert(result.stats.some((x) => x.id === dak.id));
const ownership = new Map([
  ...s.roster.map((p) => [p.id, s.team]),
  ...S.roster(s, 13).map((p) => [p.id, 13]),
]);
assert(
  result.stats.every((record) => ownership.get(record.id) === record.team),
  "every worker stat stays with the actor's real franchise",
);
assert(result.stats.find((record) => record.id === dak.id).attempts > 0);

console.log(
  "PASS: 32-team real-roster validation, 2,400+ player identities, all-team cap/lineup compliance, jersey identity, database round-trip, contextual commentary, kick facts, replay/seek silence, voice selection/queue/coalescing and a complete real-player game.",
);

// Real snapshots include IR/practice players; CPU rosters must make room for every draft round.
s.phase = "offseason";
s.franchise.calendar.leagueYear = s.year + 1;
P.beginDraft(s);
let picks = 0;
while (s.franchise.draft.cursor < s.franchise.draft.picks.length) {
  P.ensureDraftRoom(s);
  P.draftPick(s, s.prospects[0].id);
  assert(++picks < 20);
}
assert.equal(s.franchise.draft.log.length, 224);
L.rollSeason(s);
P.trimRoster(s);
assert(S.validate(s));
assert.equal(S.active(s).filter((p) => p.status === "active").length, 53);
console.log(
  "PASS: full real-roster seven-round draft, 90-player CPU openings, IR rollover and camp cuts.",
);

assert.equal(searchKey("Ja'Marr Chase"), searchKey("Jamarr Chase"));
assert.equal(searchKey("José"), searchKey("Jose"));
console.log("PASS: punctuation- and accent-insensitive player search.");
