// Owner test console: loads without a DOM, unlocks only for the owner's passphrase hash, and
// leaves no trace (DOM, menu, command search) for players while locked.
import assert from "node:assert/strict";
import { createHash } from "node:crypto";

const panel = await import("./dist/ui/dev-panel.mjs"); // must not throw without a DOM
const { matchesUnlock, resolvePath, callTargets, parseOpen, isShortcut, sha256Hex, isUnlocked, installDevPanel, UNLOCK_HASH, STORAGE_KEY } = panel;

// Unlock check: only the known digest, case-insensitive hex; anything else is refused.
assert.equal(matchesUnlock("64108317ca0701a58324e6ba7b29c5f4c2d3b8ebb473670ef6e8af738a24ca24"), true);
assert.equal(matchesUnlock(UNLOCK_HASH.toUpperCase()), true);
assert.equal(matchesUnlock(createHash("sha256").update("wrong guess").digest("hex")), false);
assert.equal(matchesUnlock(UNLOCK_HASH.slice(0, -1) + "0"), false);
for (const bad of ["", null, undefined, 42, {}]) assert.equal(matchesUnlock(bad), false);
// The browser digest helper agrees with Node's SHA-256 (lowercase hex of UTF-8).
assert.equal(await sha256Hex("héllo"), createHash("sha256").update("héllo", "utf8").digest("hex"));
assert.equal(matchesUnlock(await sha256Hex("not the passphrase")), false);

// Path resolver used by the State inspector and the Checks tab.
const open = () => {};
const root = { W: { open }, franchise: { market: { offers: [{ id: "o1" }] } }, zero: 0 };
assert.equal(resolvePath(root, "W.open"), open);
assert.equal(resolvePath(root, "W.missing"), undefined);
assert.equal(resolvePath(root, "nope.deeper.still"), undefined);
assert.equal(resolvePath(root, "franchise.market.offers.0.id"), "o1");
assert.equal(resolvePath(root, "franchise.market.offers[0].id"), "o1");
assert.equal(resolvePath(root, "zero"), 0);
assert.equal(resolvePath(root, ""), root);
assert.equal(resolvePath(null, "W.open"), undefined);

// Inline handler parsing: call targets, ignoring strings, `this` and member calls on results.
assert.deepEqual(callTargets("closeModal();W.open('Roster')"), ["closeModal", "W.open"]);
assert.deepEqual(callTargets("F.action('debugRating',document.getElementById('x(').value)"), ["F.action", "document.getElementById"]);
assert.deepEqual(callTargets("event.stopPropagation();this.closest('a').remove()"), []);
assert.deepEqual(parseOpen("W.open('League desk', 'Transactions')"), { route: "League desk", tab: "Transactions" });
assert.deepEqual(parseOpen('W.open("Roster")'), { route: "Roster", tab: undefined });
assert.equal(parseOpen("W.group('Team', true)"), null);

// Shortcut: Ctrl or Cmd, plus Shift and Alt, plus D (by code, since Alt changes `key` on a Mac).
assert.ok(isShortcut({ ctrlKey: true, shiftKey: true, altKey: true, code: "KeyD", key: "D" }));
assert.ok(isShortcut({ metaKey: true, shiftKey: true, altKey: true, code: "KeyD", key: "∂" }));
assert.ok(!isShortcut({ ctrlKey: true, shiftKey: true, code: "KeyD", key: "D" }));
assert.ok(!isShortcut({ ctrlKey: true, key: "k", code: "KeyK" }));

// Locked device with a minimal DOM: installing adds no DOM, no globals, no command-search entry.
const storage = new Map();
const localStorage = { getItem: (k) => storage.get(k) ?? null, setItem: (k, v) => storage.set(k, String(v)), removeItem: (k) => storage.delete(k) };
const created = [],
  appended = [],
  listeners = {};
const node = () => ({ appendChild: (c) => appended.push(c), querySelector: () => null, addEventListener() {} });
globalThis.localStorage = localStorage;
globalThis.document = {
  body: node(),
  createElement: (t) => (created.push(t), { tagName: t, ...node(), set innerHTML(v) {}, setAttribute() {}, remove() {} }),
  querySelector: () => null,
  querySelectorAll: () => [],
  getElementById: () => null,
};
globalThis.addEventListener = (type, fn) => (listeners[type] ??= []).push(fn);
const search = () => "routes";
globalThis.W = { open() {}, search, command() {} };
const before = Object.keys(globalThis).sort();
assert.equal(isUnlocked(localStorage), false, "devices start locked");
assert.equal(installDevPanel({ getSection: () => "Overview", isBusy: () => false }), true);
assert.equal(installDevPanel(), false, "installs once");
assert.equal(created.length + appended.length, 0, "no DOM while locked");
assert.deepEqual(Object.keys(globalThis).sort(), before, "no new globals (no Dev/console API for players)");
assert.deepEqual(Object.keys(globalThis.W).sort(), ["command", "open", "search"], "no command-search or navigation entry is added");
assert.equal(globalThis.W.search, search);
assert.equal(listeners.keydown?.length, 1, "only the shortcut listener is registered");
// Ordinary keys (including Ctrl+K search) do nothing.
let prevented = 0;
const key = (e) => listeners.keydown[0]({ preventDefault: () => prevented++, stopPropagation() {}, ...e });
key({ ctrlKey: true, key: "k", code: "KeyK" });
key({ key: "d", code: "KeyD" });
assert.equal(created.length + appended.length + prevented, 0, "other keys leave the page untouched");
assert.equal(storage.has(STORAGE_KEY), false);

// A stored wrong value does not unlock; the exact hash does.
storage.set(STORAGE_KEY, "0".repeat(64));
assert.equal(isUnlocked(localStorage), false);
storage.set(STORAGE_KEY, UNLOCK_HASH);
assert.equal(isUnlocked(localStorage), true);
assert.equal(isUnlocked({ getItem() { throw Error("blocked"); } }), false, "blocked storage stays locked");


// Forced moves used by the Players tab keep a real career valid under the game's transact/validate.
const fs = await import("node:fs");
const vm = await import("node:vm");
const S = await import("./dist/franchise/state.mjs");
const { ensureCalendar } = await import("./dist/franchise/calendar-core.mjs");
const game = { console, Math, Date, setTimeout() {}, localStorage: { getItem: () => null, setItem() {} }, document: { getElementById: () => ({ innerHTML: "", style: {} }), querySelectorAll: () => [], querySelector: () => ({}) } };
game.window = game;
game.addEventListener = () => {};
vm.createContext(game);
vm.runInContext(fs.readFileSync("dist/game.js", "utf8"), game);
vm.runInContext(fs.readFileSync("dist/match.js", "utf8"), game);
globalThis.clubs = JSON.parse(vm.runInContext("JSON.stringify(clubs)", game));
const career = JSON.parse(vm.runInContext("JSON.stringify(fresh())", game));
career.coach = { name: "QA" };
S.migrate(career);
ensureCalendar(career);
const { internals } = panel;
await internals.deps();
const other = (career.team + 1) % 32,
  mine = career.roster[0].id,
  theirs = career.franchise.clubs[other].players[0].id,
  agent = career.agents[0].id,
  released = career.roster[1].id;
const after = S.transact(career, (d) => {
  internals.moveTo(d, mine, other);
  internals.moveTo(d, theirs, d.team);
  internals.moveTo(d, agent, d.team);
  internals.moveTo(d, released, "fa");
  d.agents.push(S.makePlayer("dev-test-1", "QB", 7, true));
  internals.moveTo(d, "dev-test-1", other);
});
assert.equal(internals.locate(after, mine).team, other, "a forced trade moves the player");
assert.equal(after.franchise.contracts[mine].team, other, "his contract follows him");
assert.equal(internals.locate(after, theirs).team, after.team);
assert.equal(internals.locate(after, agent).team, after.team, "a forced signing joins your roster");
assert.equal(after.franchise.contracts[agent].team, after.team, "and gets a contract");
assert.equal(internals.locate(after, released).team, "fa", "a release lands in free agency");
assert.equal(internals.locate(after, "dev-test-1").team, other, "generated players can be placed on any club");
assert.equal(internals.allPlayers(after).length, internals.allPlayers(career).length + 1, "no player is duplicated or lost");
assert.throws(() => internals.moveTo(structuredClone(career), "nobody", other), /not found/);
const m = internals.milestones(career);
assert.ok(m.lastRegular < m.championship && m.championship < m.offseason && m.offseason < m.draft && m.draft < m.camp, "milestones are in calendar order");

console.log("dev panel: ok");
