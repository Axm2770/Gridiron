import { installRecruitmentUI } from "./dist/franchise/recruitment-ui.mjs";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import * as S from "./dist/franchise/state.mjs";
import { applyRealRosters } from "./dist/franchise/real-rosters.mjs";
import {
  configureRatings,
  ensureCareerRatings,
  serializeCareer,
} from "./dist/franchise/ratings.mjs";
import {
  configureCatalog,
  enrichPlayerBios,
  catalogEntries,
  filterCatalog,
  sortCatalog,
  paginate,
  DEFAULT_SEARCH,
  heightInches,
  heightLabel,
  metricTone,
  normalizeSearch,
  talentView,
  playerAwards,
} from "./dist/franchise/player-catalog.mjs";
import { generatedPhysique } from "./dist/franchise/newgens.mjs";
import * as DB from "./dist/franchise/database.mjs";
const nodes = {},
  ctx = {
    console,
    Date,
    Math,
    setTimeout: () => {},
    localStorage: { getItem: () => null, setItem() {} },
    document: {
      getElementById: (id) =>
        (nodes[id] ??= {
          innerHTML: "",
          style: {},
          showModal() {},
          close() {},
        }),
      querySelector: () => ({}),
      querySelectorAll: () => [],
    },
  };
ctx.window = ctx;
ctx.addEventListener = () => {};
vm.createContext(ctx);
vm.runInContext(fs.readFileSync("dist/game.js", "utf8"), ctx);
vm.runInContext(fs.readFileSync("dist/match.js", "utf8"), ctx);
const s = JSON.parse(vm.runInContext("JSON.stringify(fresh())", ctx));
s.coach = { name: "Scout Test" };
S.migrate(s);
const snapshot = JSON.parse(
    fs.readFileSync("dist/data/nfl-rosters.json", "utf8"),
  ),
  honors = JSON.parse(fs.readFileSync("dist/data/player-honors.json", "utf8"));
configureRatings(
  JSON.parse(fs.readFileSync("dist/data/madden-ratings.json", "utf8")),
  JSON.parse(fs.readFileSync("dist/data/player-production.json", "utf8")),
);
applyRealRosters(s, snapshot);
for (let i = 0; i < 32; i++)
  s.franchise.clubs[i].identity = {
    name:
      ctx.clubs?.[i]?.[2] || snapshot.teams.find((t) => t.teamId === i).abbr,
    city: i === 13 ? "Kansas City" : "City",
  };
configureCatalog(snapshot, honors);
enrichPlayerBios(s);
ensureCareerRatings(s);
let entries = catalogEntries(s);
assert(entries.length > 2400);
assert.equal(new Set(entries.map((e) => e.p.id)).size, entries.length);
const allen = entries.find((e) => e.p.name === "Josh Allen");
assert.equal(heightInches(allen.p), 77);
assert.equal(allen.p.weight, 237);
assert.equal(heightLabel(allen.p), "6′ 5″");
assert.equal(heightInches({ height: "unknown" }), null);
assert.equal(heightInches({ height: "6' 15\"" }), null);
assert.equal(heightInches({ height: "5′ 11″" }), 71);
assert(
  allen.awards.some(
    (a) => a.year === 2024 && a.kind === "Historical" && a.award === "NFL MVP",
  ),
);
const mahomes = entries.find((e) => e.p.name === "Patrick Mahomes");
assert.equal(
  filterCatalog(entries, { query: "mahomes kansas" }, s)[0].p.id,
  mahomes.p.id,
);
const nfl = filterCatalog(entries, { pool: "NFL" }, s),
  free = filterCatalog(entries, { pool: "Free agents" }, s),
  draft = filterCatalog(entries, { pool: "Draft" }, s);
assert(nfl.every((e) => e.team >= 0));
assert(free.every((e) => e.team === -1));
assert(draft.every((e) => e.team === -2));
assert(draft.length >= 24);
let filtered = filterCatalog(
  entries,
  {
    position: "WR",
    ageMax: 26,
    potMin: 85,
    excludeOwn: true,
    excludeInjured: true,
  },
  s,
);
assert(
  filtered.every(
    (e) =>
      e.p.pos === "WR" &&
      e.p.age <= 26 &&
      e.talent.potential >= 85 &&
      e.team !== s.team &&
      !e.p.injury,
  ),
);
assert(
  filterCatalog(entries, { heightMin: 77, weightMin: 230 }, s).every(
    (e) => e.height >= 77 && e.weight >= 230,
  ),
);
assert.throws(() => normalizeSearch({ ageMin: 35, ageMax: 22 }), /minimum/);
assert.throws(() => normalizeSearch({ heightMin: "bad" }), /outside/);
assert.throws(() => normalizeSearch({ potMin: 105 }), /outside/);
const unknown = {
  ...allen,
  p: { ...allen.p, height: undefined, weight: null },
  height: null,
  weight: null,
};
assert.equal(filterCatalog([unknown], { heightMin: 70 }, s).length, 0);
const prospect = draft[0];
prospect.p.pot = 40;
const hiddenBefore = talentView(s, prospect.p, -2);
prospect.p.pot = 99;
assert.deepEqual(
  talentView(s, prospect.p, -2),
  hiddenBefore,
  "unscouted potential cannot leak through filtering or sorting",
);
assert.equal(Object.keys(prospect.attributes).length, 0);
assert.equal(
  filterCatalog([prospect], { attr: "speed", attrMin: 1 }, s).length,
  0,
);
s.franchise.reports[prospect.p.id] = {
  confidence: 100,
  estimate: prospect.p.ovr,
  notes: [],
};
assert.equal(talentView(s, prospect.p, -2).potential, 99);
assert.equal(talentView(s, prospect.p, -2).known, true);
const ranks = sortCatalog([allen, mahomes, unknown], "height", -1);
assert.equal(ranks.at(-1).height, null);
assert.equal(
  sortCatalog([allen, mahomes, unknown], "height", 1).at(-1).height,
  null,
);
assert.equal(sortCatalog([allen, mahomes], "name", 1)[0].p.name, "Josh Allen");
const pg = paginate(entries, 99999, 25);
assert.equal(pg.page, pg.pages);
assert(pg.rows.length <= 25);
assert.equal(paginate([], 1, 25).from, 0);
assert.equal(paginate(entries, 1, 25).rows.length, 25);
s.franchise.office = {
  scouting: {
    shortlist: [allen.p.id],
    saved: [{ id: "1", name: "QB focus", filters: { position: "QB" } }],
  },
};
assert.deepEqual(
  filterCatalog(entries, { shortlistOnly: true }, s).map((e) => e.p.id),
  [allen.p.id],
);
s.franchise.awards.push({ playerId: allen.p.id, award: "MVP", year: 2027 });
assert(playerAwards(s, allen.p).some((a) => a.kind === "This save"));
const restored = JSON.parse(serializeCareer(s));
assert.equal(restored.franchise.office.scouting.shortlist[0], allen.p.id);
assert.equal(
  restored.franchise.office.scouting.saved[0].filters.position,
  "QB",
);
assert.equal(metricTone("morale", 90), "excellent");
assert.equal(metricTone("condition", 40), "poor");
assert.equal(metricTone("form", 7.7), "excellent");
assert.equal(metricTone("form", null), "unknown");
for (const pos of ["QB", "WR", "OL", "CB"]) {
  const p = generatedPhysique("same-id", pos);
  assert.deepEqual(p, generatedPhysique("same-id", pos));
  assert(heightInches(p) >= 55 && heightInches(p) <= 95);
  assert(p.weight > 120 && p.weight < 450);
}
const pack = DB.exportPack(s),
  exported = pack.players.find((p) => p.id === allen.p.id);
assert.equal(exported.height, allen.p.height);
assert.equal(exported.weight, 237);
console.log(
  "PASS: all-player pool/deduplication, combined/exclusion/range/token filters, unknown metrics, hidden draft talent, missing-last stable sorts, pagination bounds, historical/save award distinction, saved search/shortlist round-trip, physical data/backfill/export, deterministic generated physiques and semantic color thresholds.",
);

// Render the real recruitment view against a populated career, without browser globals leaking into the model.
globalThis.state = s;
globalThis.clubs = JSON.parse(vm.runInContext("JSON.stringify(clubs)", ctx));
globalThis.esc = (v) =>
  String(v)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll('"', "&quot;");
globalThis.logo = (i) => '<img alt="Team ' + i + '">';
globalThis.window = globalThis;
delete s.franchise.office.scouting;
const views = {};
installRecruitmentUI({
  views,
  isBusy: () => false,
  snapshot,
  reference: honors,
});
const html = views.Scouting();
assert(html.includes("Search all players"));
assert(html.includes("finder-pagination"));
assert.equal((html.match(/<tr>/g) || []).length, 26);
assert(html.includes("data-player-id="));
console.log(
  "PASS: actual recruitment HTML renders a paginated, searchable, preview-enabled player directory.",
);
