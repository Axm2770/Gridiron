// Pixel player profile helpers (dist/franchise/player-ui.mjs): which stat columns a position
// shows, rating tones, the contract season bars and the season-table pager.
import assert from "node:assert/strict";
import fs from "node:fs";
import { statColumns, toneOf, contractSeasons, pageOf, STAT_LABELS } from "./dist/franchise/player-ui.mjs";

// Position columns first, then anything else he recorded, snaps last; never more than max.
assert.deepEqual(statColumns("WR"), ["receptions", "recYards", "recTD", "snaps"]);
assert.deepEqual(statColumns("OL"), ["snaps"]);
assert.deepEqual(statColumns("RB", [{ passYards: 12, tackles: 0 }]), ["rushYards", "rushTD", "receptions", "recYards", "passYards", "snaps"]);
assert.equal(statColumns("QB", [{ tackles: 3, sacks: 1, recYards: 9 }], 7).length, 7);
assert.equal(statColumns("QB", [{ tackles: 3 }], 7).at(-1), "snaps");
for (const k of statColumns("LB", [{ passYards: 1, rushYards: 2 }])) assert(STAT_LABELS[k], k);

// Tones follow the shared metric bands.
assert.equal(toneOf("rating", 92), "good");
assert.equal(toneOf("rating", 82), "accent");
assert.equal(toneOf("rating", 70), "warn");
assert.equal(toneOf("rating", 50), "bad");
assert.equal(toneOf("rating", null), "");

// One bar per contract season (void years included), scaled to the biggest cap hit.
const c = { start: 2025, years: 3, voidYears: 1 },
  hits = { 2025: 10, 2026: 20, 2027: 40, 2028: 5 },
  rows = contractSeasons(c, 2026, (_, y) => hits[y], 14);
assert.deepEqual(rows.map((r) => r.kind), ["past", "now", "future", "void"]);
assert.deepEqual(rows.map((r) => r.cells), [4, 7, 14, 2]);
assert.deepEqual(contractSeasons(null, 2026), []);

// Pager clamps to the available pages.
const list = Array.from({ length: 13 }, (_, i) => i);
assert.deepEqual(pageOf(list, 0, 6).rows, [0, 1, 2, 3, 4, 5]);
assert.deepEqual(pageOf(list, 9, 6), { rows: [12], page: 2, pages: 3 });
assert.deepEqual(pageOf([], 3, 6), { rows: [], page: 0, pages: 1 });

// The profile keeps its actions and handlers.
const src = fs.readFileSync("dist/franchise/player-ui.mjs", "utf8");
for (const s of ["Ops.tradeFor(", "F.offer(", "Recruit.report(", "Dev.player(", "CI.open('player'", "F.contract(", "W.depth(", "W.move(", "F.release(", "Office.compareToggle(", "Office.morale(", "Recruit.toggleShortlist(", "Nav?.playerMoves", "PlayerUI.tab("])
  assert(src.includes(s), `profile still offers ${s}`);
// Plain dialogs are framed by the shared helper and styled by ui/dialogs.css, linked after the other ui css.
const html = fs.readFileSync("dist/index.html", "utf8");
assert(html.indexOf("ui/dialogs.css") > html.indexOf("ui/tutorial.css"));
assert(/export function frameDialog/.test(fs.readFileSync("dist/franchise/presentation.mjs", "utf8")));

console.log("PASS: profile stat columns, tones, contract season bars, season pager, actions kept and dialog styles linked");
