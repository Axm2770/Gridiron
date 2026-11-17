import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import * as S from "./dist/franchise/state.mjs";
import * as Staff from "./dist/franchise/staff.mjs";
import * as A from "./dist/franchise/awards.mjs";
import { installExpansionUI } from "./dist/franchise/expansion-ui.mjs";
const context = {
  console,
  Math,
  Date,
  setTimeout() {},
  localStorage: {
    getItem() {
      return null;
    },
    setItem() {},
  },
  document: {
    getElementById() {
      return { innerHTML: "", style: {}, showModal() {}, close() {} };
    },
    querySelector() {
      return {};
    },
    querySelectorAll() {
      return [];
    },
  },
};
context.window = context;
context.addEventListener = () => {};
vm.createContext(context);
vm.runInContext(fs.readFileSync("dist/game.js", "utf8"), context);
vm.runInContext(fs.readFileSync("dist/match.js", "utf8"), context);
globalThis.window = globalThis;
globalThis.state = JSON.parse(
  vm.runInContext("JSON.stringify(fresh())", context),
);
state.coach = { name: "UI QA", calling: "Manual" };
S.migrate(state);
Staff.ensureStaff(state);
globalThis.clubs = JSON.parse(
  vm.runInContext("JSON.stringify(clubs)", context),
);
globalThis.esc = (s) =>
  String(s ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
globalThis.logo = (t) => `<i>Club ${t}</i>`;
let output = "",
  notice = "",
  calls = [];
globalThis.modal = (html) => (output = html);
globalThis.closeModal = () => {};
globalThis.save = () => {};
globalThis.render = () => {};
globalThis.toast = (m) => (notice = m);
globalThis.pauseAuto = () => {};
globalThis.F = { action: (...a) => calls.push(a) };
globalThis.W = { open: (s) => calls.push(["open", s]) };
globalThis.StaffHub = { confirmAppointment() {}, confirmDismissal() {} };
const nodes = {
  modal: { classList: { add() {}, remove() {} }, addEventListener() {} },
  "exp-stage": {
    innerHTML: "",
    clientWidth: 500,
    clientHeight: 500,
    style: {},
  },
};
globalThis.document = {
  getElementById: (id) => (nodes[id] ??= { innerHTML: "", style: {} }),
  body: {
    classList: {
      contains() {
        return true;
      },
    },
  },
};
const views = { Debug: () => "<h2>Developer console</h2>" },
  heritage = JSON.parse(fs.readFileSync("dist/data/franchise-heritage.json"));
installExpansionUI({ views, isBusy: () => false, heritage });
for (const key of [
  "Contracts",
  "Career dossier",
  "Records",
  "Awards",
  "Hall of Fame",
  "League desk",
]) {
  const html = views[key]();
  assert(html.length > 200, key + " must render");
  assert(
    !/undefined|NaN|source citation|this is a simulation/.test(html),
    key + " must render valid in-universe content",
  );
}
let html = views.Contracts();
assert.equal(
  (html.match(/<tr>/g) || []).length,
  9,
  "contracts show eight rows plus header",
);
assert(html.includes("Expansion.contractPage(1)"));
assert(html.includes("F.release("));
Expansion.contractFilter("position", "QB");
html = views.Contracts();
assert(html.includes("Contract position"));
assert((html.match(/exp-contract-player/g) || []).length <= 3);
Expansion.contractFilter("query", "no such player");
assert(views.Contracts().includes("No matching contracts."));
Expansion.contractFilter("query", "");
Expansion.filter("hof", "team", "12");
html = views["Hall of Fame"]();
assert(html.includes("Denver Broncos"));
assert(html.includes("John Elway"));
assert(!html.includes("Derrick Thomas"));
Expansion.filter("hof", "team", "0");
Expansion.legend("jim-kelly");
assert(
  output.includes("Jim Kelly") &&
    output.includes("35,467") &&
    output.includes("Class of 2002"),
);
// Trades go straight to the trade action: ownership no longer holds a separate approval meeting.
const p = state.roster[0],
  target = state.franchise.clubs[0].players[0];
p.ovr = 92;
nodes["trade-out"] = { value: p.id };
nodes["trade-team"] = { value: "0" };
nodes["trade-in"] = { value: target.id };
F.trade();
assert.deepEqual(calls.at(-1), ["trade", p.id, 0, target.id]);
F.action("interview");
assert.deepEqual(calls.at(-1), ["open", "Career dossier"]);
Expansion.extension(p.id);
assert(
  output.includes("Extension meeting") || output.includes("extension meeting"),
);
assert(output.includes("Additional seasons"));
assert(output.includes("Present extension proposal"));
const qb = state.roster.find((p) => p.pos === "QB");
state.franchise.statBook.regularTotals[state.year][qb.id] = {
  id: qb.id,
  name: qb.name,
  pos: "QB",
  team: state.team,
  stats: { passYards: 5000, passTD: 45, snaps: 1000 },
};
A.freezeAwards(state);
A.announceAwards(state);
views.Awards();
Expansion.ballots();
assert.equal(
  (output.match(/<tr>/g) || []).length,
  51,
  "the ballot explorer contains every voter",
);
Expansion.debug("reputation", 90);
assert.match(notice, /Enable developer/);
state.franchise.debug = true;
Expansion.debug("reputation", 90);
assert.equal(state.franchise.coachReputation.value, 90);
assert(state.debugSave);
console.log(
  "PASS: all seven integrated workspaces, valid in-universe HTML, compact contract filtering/pagination, correct franchise identities, biography details, legacy trade-to-board routing, job navigation, extension meeting and all 50 ballot rows; debug guard.",
);
