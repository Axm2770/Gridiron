// Transaction log: every roster move (release, signing, waiver claim, trade, draft pick,
// retirement) is recorded once with the right clubs and contract, and older saves start clean.
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import * as S from "./dist/franchise/state.mjs";
import * as C from "./dist/franchise/contracts.mjs";
import { ensurePickLedger, ownedPicks, executeTrade } from "./dist/franchise/market.mjs";
import { ensureCalendar } from "./dist/franchise/calendar-core.mjs";
import { recordTransactions, transactionsFor, describeTransaction, ensureTransactions } from "./dist/franchise/transactions.mjs";

const ctx = { console, Math, Date, setTimeout() {}, localStorage: { getItem: () => null, setItem() {} }, document: { getElementById: () => ({ innerHTML: "", style: {} }), querySelectorAll: () => [], querySelector: () => null, addEventListener() {}, createElement: () => ({ style: {}, classList: { add() {}, remove() {}, toggle() {} } }), body: { classList: { add() {}, remove() {}, toggle() {}, contains: () => false }, dataset: {} } } };
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
const name = (t) => globalThis.clubs[t][2];

const s = fresh();
assert.deepEqual(recordTransactions(s), [], "the first call records a baseline only");
assert.equal(recordTransactions(s).length, 0, "nothing moved, nothing recorded");

// Release: the player leaves the roster for waivers or free agency.
const cutting = s.roster.filter((p) => p.status === "active").sort((a, b) => a.ovr - b.ovr)[0];
C.cut(s, cutting.id);
let moves = recordTransactions(s);
assert.equal(moves.length, 1, "one release is one transaction");
assert.ok(["released", "waived"].includes(moves[0].type), "a cut is a release or waiver");
assert.equal(moves[0].from, s.team);
assert.equal(moves[0].to, null);

// Free-agent signing (the market resolves accepted offers by moving the player onto the roster).
const agent = s.agents[0];
s.agents = s.agents.filter((p) => p.id !== agent.id);
s.roster.push(agent);
s.franchise.contracts[agent.id] = S.basicContract(agent, s.team, S.financeYear(s));
moves = recordTransactions(s);
assert.equal(moves.length, 1);
assert.equal(moves[0].type, "signed");
assert.equal(moves[0].to, s.team);
assert.ok(moves[0].contract && moves[0].contract.capHit > 0, "the signing carries its contract");
assert.match(describeTransaction(moves[0], name), /signed .* as a free agent/);

// A real player trade through the market engine: both sides recorded, grouped as one deal.
ensurePickLedger(s);
const partner = (s.team + 1) % 32;
const give = s.roster.filter((p) => p.status === "active" && p.id !== agent.id).sort((a, b) => b.ovr - a.ovr)[3];
const get = s.franchise.clubs[partner].players.sort((a, b) => a.ovr - b.ovr)[0];
executeTrade(s, { partner, give: [give.id, ownedPicks(s, s.team).find((p) => p.round === 1).id], get: [get.id] });
moves = recordTransactions(s);
const traded = moves.filter((m) => m.type === "traded");
assert.equal(traded.length, 2, "both players in the deal are logged");
assert.equal(new Set(traded.map((m) => m.group)).size, 1, "players in one deal share a trade group");
const out = traded.find((m) => m.playerId === give.id);
assert.equal(out.from, s.team);
assert.equal(out.to, partner);
assert.match(describeTransaction(out, name, s.team), /^Traded /, "outgoing trades read from your side");

// Draft pick and retirement.
const prospect = { ...agent, id: "prospect-tx", name: "Draft Kid" };
s.prospects = [...(s.prospects || []), prospect];
recordTransactions(s);
s.prospects = s.prospects.filter((p) => p.id !== prospect.id);
s.franchise.clubs[partner].players.push(prospect);
const retiring = s.franchise.clubs[partner].players.find((p) => p.id !== prospect.id && p.id !== give.id);
s.franchise.clubs[partner].players = s.franchise.clubs[partner].players.filter((p) => p.id !== retiring.id);
(s.franchise.retired ??= []).push({ id: retiring.id, name: retiring.name, pos: retiring.pos });
moves = recordTransactions(s);
assert.equal(moves.find((m) => m.playerId === prospect.id)?.type, "drafted");
assert.equal(moves.find((m) => m.playerId === retiring.id)?.type, "retired");

// A contract that ran its full term is an expiry, not a release.
const veteran = s.roster.find((p) => p.status === "active" && s.franchise.contracts[p.id] && p.id !== agent.id);
const deal = s.franchise.contracts[veteran.id];
deal.start = s.year - deal.years;
deal.ended = true;
s.roster = s.roster.filter((p) => p.id !== veteran.id);
s.agents.push(veteran);
moves = recordTransactions(s);
assert.equal(moves.find((m) => m.playerId === veteran.id)?.type, "expired");
assert.match(describeTransaction(moves.find((m) => m.playerId === veteran.id), name), /contract with the .* expired/);

// Moves settled with a round carry the week that was played.
const late = s.roster.filter((p) => p.status === "active").sort((a, b) => a.ovr - b.ovr)[0];
C.cut(s, late.id);
const stamped = recordTransactions(s, { week: 3, phase: "season" });
assert.equal(stamped[0].week, 3);

// Queries, persistence and save compatibility.
assert.ok(transactionsFor(s, { team: s.team }).length >= 3, "your club's moves are queryable");
assert.equal(transactionsFor(s, { playerId: give.id })[0].type, "traded");
const reloaded = JSON.parse(JSON.stringify(s));
assert.equal(recordTransactions(reloaded).length, 0, "a reloaded save does not re-log old moves");
assert.equal(transactionsFor(reloaded).length, transactionsFor(s).length, "the log survives a save round trip");
const old = fresh();
delete old.franchise.transactionLog;
assert.equal(ensureTransactions(old).entries.length, 0, "older saves start with an empty log");
console.log("transactions ok");
