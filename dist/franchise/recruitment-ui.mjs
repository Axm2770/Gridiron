import * as S from "./state.mjs";
import { ensureOffice } from "./newsroom.mjs";
import {
  configureCatalog,
  enrichPlayerBios,
  catalogEntries,
  filterCatalog,
  sortCatalog,
  paginate,
  normalizeSearch,
  DEFAULT_SEARCH,
  heightLabel,
} from "./player-catalog.mjs";
import {
  scorePill,
  playerFace,
  previewAttributes,
  positionBadge,
  honorLabel,
} from "./player-ui.mjs";
import { icon } from "./presentation.mjs";
import { csvText } from "./analysis.mjs";
const fmt = (n, d = 0) =>
  Number.isFinite(n)
    ? Number(n).toLocaleString("en-US", { maximumFractionDigits: d })
    : "—";
const h = (s) =>
  String(s)
    .replace(/([A-Z])/g, " $1")
    .replace(/^./, (c) => c.toUpperCase());
const SORTS = {
  rating: "Ability",
  potential: "Potential",
  name: "Name",
  team: "Team",
  position: "Position",
  age: "Age",
  height: "Height",
  weight: "Weight",
  morale: "Morale",
  condition: "Condition",
  form: "Form",
  training: "Training",
  cap: "Cap / asking base",
  expiry: "Contract expiry",
  awards: "Recorded honors",
  confidence: "Scouting confidence",
  snaps: "Snaps",
  passYards: "Passing yards",
  rushYards: "Rushing yards",
  recYards: "Receiving yards",
  speed: "Speed",
  awareness: "Awareness",
};
export function installRecruitmentUI({ views, isBusy, snapshot, reference }) {
  configureCatalog(snapshot, reference);
  enrichPlayerBios(state);
  let filters = null,
    owner = null,
    page = 1,
    filterTab = "Profile",
    memo = null,
    entries = [],
    error = "";
  function prefs() {
    const o = ensureOffice(state);
    o.scouting ??= {
      filters: { ...DEFAULT_SEARCH },
      mode: "Recruitment",
      sort: "rating",
      direction: -1,
      size: 25,
      shortlist: [],
      saved: [],
    };
    const p = o.scouting;
    p.shortlist ??= [];
    p.saved ??= [];
    if (owner !== o) {
      owner = o;
      try {
        filters = normalizeSearch(p.filters);
      } catch {
        filters = { ...DEFAULT_SEARCH };
      }
      page = 1;
    }
    return p;
  }
  function data() {
    prefs();
    if (memo !== state) {
      enrichPlayerBios(state);
      entries = catalogEntries(state);
      memo = state;
    }
    return entries;
  }
  function result() {
    const p = prefs();
    try {
      const list = sortCatalog(
        filterCatalog(data(), filters, state),
        p.sort,
        p.direction,
      );
      error = "";
      const res = paginate(list, page, p.size);
      page = res.page;
      return { ...res, all: list };
    } catch (e) {
      error = e.message;
      return { rows: [], all: [], total: 0, page: 1, pages: 1, from: 0, to: 0 };
    }
  }
  const option = (value, label, current) =>
    `<option value="${esc(String(value))}" ${String(value) === String(current) ? "selected" : ""}>${esc(label)}</option>`;
  const select = (id, label, options, current, handler = "Recruit.change") =>
    `<label><span>${label}</span><select aria-label="${label}" onchange="${handler}('${id}',this.value)">${options.map((x) => option(Array.isArray(x) ? x[0] : x, Array.isArray(x) ? x[1] : x, current)).join("")}</select></label>`;
  function numField(k, label, min, max, step = 1) {
    return `<label><span>${label}</span><input type="number" aria-label="${label}" min="${min}" max="${max}" step="${step}" placeholder="Any" value="${filters[k]}" oninput="Recruit.change('${k}',this.value)"></label>`;
  }
  const check = (k, label) =>
    `<label class="finder-check"><input type="checkbox" ${filters[k] ? "checked" : ""} onchange="Recruit.change('${k}',this.checked)"><span>${label}</span></label>`;
  function filterPanel() {
    const attrs = [
      "speed",
      "acceleration",
      "agility",
      "changeOfDirection",
      "strength",
      "awareness",
      "stamina",
      "injury",
      "throwPower",
      "throwAccuracyShort",
      "throwAccuracyMid",
      "throwAccuracyDeep",
      "catching",
      "shortRouteRunning",
      "carrying",
      "breakTackle",
      "passBlock",
      "runBlock",
      "tackle",
      "manCoverage",
      "zoneCoverage",
      "kickPower",
      "kickAccuracy",
    ];
    return `<div class="finder-filter-top"><b>Refine your search</b><button onclick="Recruit.closeFilters()" aria-label="Close search filters">×</button></div><div class="finder-filter-tabs">${["Profile", "Ability & performance", "Exclusions"].map((t) => `<button class="${t === filterTab ? "active" : ""}" onclick="Recruit.filterTab('${t}')">${t}</button>`).join("")}</div><div class="finder-filter-body">${
      filterTab === "Profile"
        ? `<div class="finder-range-grid">${select("availability", "Availability", ["Any availability", "Healthy", "Injured", "Holdout", "Practice squad"], filters.availability)}${numField("ageMin", "Minimum age", 18, 55)}${numField("ageMax", "Maximum age", 18, 55)}${numField("heightMin", "Minimum height (in)", 55, 95)}${numField("heightMax", "Maximum height (in)", 55, 95)}${numField("weightMin", "Minimum weight (lb)", 120, 450)}${numField("weightMax", "Maximum weight (lb)", 120, 450)}${numField("salaryMax", "Maximum cap / asking base ($M)", 0, 100, 0.1)}${numField("confidenceMin", "Minimum scout confidence (%)", 0, 100)}</div>`
        : filterTab === "Ability & performance"
          ? `<div class="finder-range-grid">${numField("ovrMin", "Minimum ability", 1, 99)}${numField("potMin", "Minimum potential", 1, 99)}${numField("moraleMin", "Minimum morale (%)", 0, 99)}${numField("conditionMin", "Minimum condition (%)", 0, 100)}${numField("formMin", "Minimum form", 0, 10, 0.1)}${numField("snapsMin", "Minimum recorded snaps", 0, 10000)}${select(
              "attr",
              "Attribute 1",
              attrs.map((k) => [k, h(k)]),
              filters.attr,
            )}${numField("attrMin", "Minimum attribute 1", 1, 99)}${select(
              "attr2",
              "Attribute 2",
              attrs.map((k) => [k, h(k)]),
              filters.attr2,
            )}${numField("attr2Min", "Minimum attribute 2", 1, 99)}</div>`
          : `<div class="finder-check-grid">${check("excludeOwn", "Exclude my franchise")}${check("excludeInjured", "Exclude injured players")}${check("excludeHoldouts", "Exclude holdouts")}${check("expiring", "Contract expires this season")}${check("awardWinner", "Has a recorded award")}${check("shortlistOnly", "Shortlisted players only")}</div><p class="finder-note">Unknown measurements or metrics do not match an active numeric filter. Unscouted prospect attributes remain masked.</p>`
    }</div><div class="finder-filter-bottom"><span id="finder-filter-count">${result().total} matching players</span><button class="secondary small" onclick="Recruit.reset()">Clear all</button><button class="small" onclick="Recruit.closeFilters()">Done</button></div>`;
  }
  const activeFilters = () =>
    Object.entries(filters).filter(
      ([k, v]) =>
        !["attr", "attr2", "query"].includes(k) && v !== DEFAULT_SEARCH[k],
    );
  function chips() {
    const labels = {
      pool: "Pool",
      position: "Position",
      team: "Team",
      availability: "Availability",
      ovrMin: "Ability ≥",
      potMin: "Potential ≥",
      ageMin: "Age ≥",
      ageMax: "Age ≤",
      heightMin: "Height ≥",
      heightMax: "Height ≤",
      weightMin: "Weight ≥",
      weightMax: "Weight ≤",
      moraleMin: "Morale ≥",
      conditionMin: "Condition ≥",
      formMin: "Form ≥",
      salaryMax: "Cap / base ≤",
      snapsMin: "Snaps ≥",
      confidenceMin: "Confidence ≥",
      excludeOwn: "Other franchises",
      excludeInjured: "Healthy only",
      excludeHoldouts: "No holdouts",
      expiring: "Expiring deals",
      awardWinner: "Award winners",
      shortlistOnly: "Shortlist",
      attrMin: h(filters.attr) + " ≥",
      attr2Min: h(filters.attr2) + " ≥",
    };
    return (
      activeFilters()
        .map(
          ([k, v]) =>
            `<button onclick="Recruit.clear('${k}')" aria-label="Remove ${esc(labels[k] || k)} filter">${esc(labels[k] || k)}${typeof v === "boolean" ? "" : ": " + esc(k === "team" ? (Number(v) < 0 ? (Number(v) === -1 ? "Free agents" : "Draft") : clubs[Number(v)]?.[0] || v) : v)} <span>×</span></button>`,
        )
        .join("") ||
      "<span>All players · add criteria to narrow your search</span>"
    );
  }
  const cols = () =>
    ({
      Recruitment: [
        ["position", "Pos"],
        ["age", "Age"],
        ["height", "Ht / Wt"],
        ["rating", "Ability"],
        ["potential", "Potential"],
        ["morale", "Morale"],
        ["condition", "Cond"],
        ["form", "Form"],
        ["awards", "Best recorded honor"],
      ],
      Performance: [
        ["position", "Pos"],
        ["snaps", "Snaps"],
        ["passYards", "Pass yd"],
        ["rushYards", "Rush yd"],
        ["recYards", "Rec yd"],
        ["form", "Form"],
        ["training", "Training"],
        ["morale", "Morale"],
      ],
      Physical: [
        ["position", "Pos"],
        ["age", "Age"],
        ["height", "Height"],
        ["weight", "Weight"],
        ["rating", "Ability"],
        ["potential", "Potential"],
        ["condition", "Condition"],
        ["awards", "Best recorded honor"],
      ],
      Contracts: [
        ["position", "Pos"],
        ["age", "Age"],
        ["rating", "Ability"],
        ["potential", "Potential"],
        ["cap", "Cap / base"],
        ["expiry", "Through"],
        ["morale", "Morale"],
        ["awards", "Best recorded honor"],
      ],
      Attributes: [
        ["position", "Pos"],
        ["rating", "Ability"],
        ["potential", "Potential"],
        ["speed", "Speed"],
        ["awareness", "Awareness"],
        ["condition", "Condition"],
        ["confidence", "Confidence"],
      ],
    })[prefs().mode];
  function cell(e, k) {
    const p = e.p;
    switch (k) {
      case "position":
        return positionBadge(p);
      case "age":
        return p.age;
      case "height":
        return prefs().mode === "Recruitment"
          ? `<span class="size-primary">${heightLabel(p)}</span><small>${e.weight ? fmt(e.weight) + " lb" : "—"}</small>`
          : heightLabel(p);
      case "weight":
        return e.weight ? fmt(e.weight) + " lb" : "—";
      case "rating":
        return scorePill("rating", e.talent.rating, e.talent.ratingLabel);
      case "potential":
        return scorePill(
          "potential",
          e.talent.potential,
          e.talent.potentialLabel,
        );
      case "morale":
        return scorePill(
          "morale",
          p.morale,
          Number.isFinite(p.morale) ? fmt(p.morale) + "%" : undefined,
        );
      case "condition":
        return scorePill(
          "condition",
          p.fitness,
          Number.isFinite(p.fitness) ? fmt(p.fitness) + "%" : undefined,
        );
      case "form":
      case "training":
        return scorePill(k, e.stats[k]);
      case "cap":
        return e.cap === null ? "—" : "$" + fmt(e.cap, 2) + "M";
      case "expiry":
        return e.expiry || "—";
      case "awards":
        return e.awards[0]
          ? `<span class="honor-chip" title="${esc(honorLabel(e))} · ${e.awards[0].kind}">✦ ${esc(e.awards[0].award.replace("Offensive Player of the Year", "OPOY").replace("Defensive Player of the Year", "DPOY"))}</span><small>${e.awards[0].year} · ${e.awards[0].kind}</small>`
          : '<span class="unrecorded">—</span>';
      case "confidence":
        return e.talent.confidence + "%";
      case "speed":
      case "awareness":
        return scorePill("attribute", e.attributes[k]);
      default:
        return fmt(e.stats[k]);
    }
  }
  function table() {
    const r = result(),
      p = prefs();
    return `<table class="finder-table" data-table-filtered="true"><thead><tr><th class="finder-player-col"><button onclick="Recruit.sort('name')">Player / team ${p.sort === "name" ? (p.direction === -1 ? "↓" : "↑") : ""}</button></th>${cols()
      .map(
        ([k, t]) =>
          `<th aria-sort="${p.sort === k ? (p.direction === -1 ? "descending" : "ascending") : "none"}"><button onclick="Recruit.sort('${k}')">${t}${p.sort === k ? (p.direction === -1 ? " ↓" : " ↑") : ""}</button></th>`,
      )
      .join("")}<th aria-label="Player actions"></th></tr></thead><tbody>${
      r.rows
        .map(
          (e) =>
            `<tr><td class="finder-player-col"><div class="finder-player-cell"><button class="shortlist-star ${p.shortlist.includes(e.p.id) ? "active" : ""}" onclick="Recruit.toggleShortlist('${e.p.id}')" aria-label="${p.shortlist.includes(e.p.id) ? "Remove" : "Add"} ${esc(e.p.name)} ${p.shortlist.includes(e.p.id) ? "from" : "to"} shortlist">${p.shortlist.includes(e.p.id) ? "★" : "☆"}</button><button class="player-link" ${previewAttributes(e.p, e.team)} onclick="PlayerUI.open('${e.p.id}',${e.team})">${playerFace(e.p)}<span><b>${esc(e.p.name)}</b><small>${e.team >= 0 ? logo(e.team) : ""}${esc(e.teamLabel)}${e.pool === "Draft" ? ` · ${e.talent.confidence}% known` : e.p.injury ? " · Injured" : e.p.holdout ? " · Holdout" : ""}</small></span></button></div></td>${cols()
              .map(([k]) => `<td>${cell(e, k)}</td>`)
              .join(
                "",
              )}<td><button class="player-peek-button" onclick="PlayerUI.peek('${e.p.id}',${e.team},this)" aria-label="Preview ${esc(e.p.name)}">${icon("search")}</button>${e.pool === "Draft" ? `<button class="finder-report-button" onclick="Recruit.report('${e.p.id}')" aria-label="Scout ${esc(e.p.name)}">Report</button>` : ""}</td></tr>`,
        )
        .join("") ||
      `<tr><td colspan="12"><div class="finder-empty"><b>${error ? "Check your filters" : "No players match this search."}</b><p>${esc(error || "Remove a filter or choose another player pool.")}</p><button class="secondary small" onclick="Recruit.reset()">Reset filters</button></div></td></tr>`
    }</tbody></table>`;
  }
  function pager() {
    const r = result();
    return `<span><b>${r.from}–${r.to}</b> of ${r.total.toLocaleString()} players</span><span class="finder-page-controls"><label>Rows <select aria-label="Players per page" onchange="Recruit.size(this.value)">${[25, 50, 100].map((v) => option(v, v, prefs().size)).join("")}</select></label><button class="secondary small" onclick="Recruit.page(-1)" ${r.page === 1 ? "disabled" : ""} aria-label="Previous player page">←</button><span>${r.page} / ${r.pages}</span><button class="secondary small" onclick="Recruit.page(1)" ${r.page === r.pages ? "disabled" : ""} aria-label="Next player page">→</button></span>`;
  }
  function redraw() {
    const sortSelect = document.querySelector('select[aria-label="Sort by"]');
    if (sortSelect) sortSelect.value = prefs().sort;
    const direction = document.querySelector(".finder-direction");
    if (direction) direction.textContent = prefs().direction === -1 ? "↓" : "↑";
    const shortlisted = document.getElementById("finder-shortlist-total");
    if (shortlisted) shortlisted.textContent = prefs().shortlist.length;
    document.getElementById("finder-results").innerHTML = table();
    document.getElementById("finder-pagination").innerHTML = pager();
    document.getElementById("finder-chips").innerHTML = chips();
    document.getElementById("finder-result-total").textContent =
      result().total.toLocaleString();
    const el = document.getElementById("finder-filter-count");
    if (el) el.textContent = result().total + " matching players";
    const b = document.getElementById("finder-filter-badge");
    if (b) b.textContent = activeFilters().length || "";
    document
      .querySelectorAll("[data-finder-pool]")
      .forEach((b) =>
        b.classList.toggle("active", b.dataset.finderPool === filters.pool),
      );
    window.Recruit?.fit();
  }
  function persist() {
    try {
      prefs().filters = normalizeSearch(filters);
      save();
    } catch {}
  }
  views.Scouting = () => {
    prefs();
    const r = result();
    return `<div class="finder-intro"><div><span class="eyebrow">PLAYER RECRUITMENT</span><h2>Find your next difference-maker.</h2><p>Search your entire football world. Hover a name for a snapshot.</p></div><div class="finder-budget"><span><b>${state.franchise.scoutPoints}</b> scouting points</span><span><b>${state.franchise.visits.length} / 30</b> private visits</span></div></div><section class="finder-workspace"><div class="finder-pool-tabs">${["All players", "NFL", "Free agents", "Draft"].map((v) => `<button data-finder-pool="${v}" class="${filters.pool === v ? "active" : ""}" onclick="Recruit.pool('${v}')">${v === "Draft" ? "Draft class" : v === "NFL" ? "NFL rosters" : v}</button>`).join("")}<button class="${filters.shortlistOnly ? "active" : ""}" onclick="Recruit.shortlistView()">★ Shortlist <small id="finder-shortlist-total">${prefs().shortlist.length}</small></button><span class="finder-total"><b id="finder-result-total">${r.total.toLocaleString()}</b> found</span></div><div class="finder-main-tools"><div class="finder-search">${icon("search")}<input type="search" placeholder="Search name, team, college or position…" aria-label="Search all players" value="${esc(filters.query)}" oninput="Recruit.query(this.value)"></div>${select("position", "Position", ["All positions", "QB", "RB", "WR", "TE", "OL", "DL", "LB", "CB", "S", "K", "P", "FB", "OT", "G", "C", "DE", "DT"], filters.position)}${select("team", "Team", [["All teams", "All teams"], ...clubs.map((c, i) => [i, c[1] + " " + c[2]]), [-1, "Free agents"], [-2, "Draft class"]], filters.team)}<details class="finder-filter-menu"><summary>${icon("filter")} Filters <b id="finder-filter-badge">${activeFilters().length || ""}</b></summary><div id="finder-filter-panel">${filterPanel()}</div></details></div><div class="finder-view-tools">${select("mode", "View", ["Recruitment", "Performance", "Physical", "Contracts", "Attributes"], prefs().mode, "Recruit.option")}${select("sort", "Sort by", Object.entries(SORTS), prefs().sort, "Recruit.option")}<button class="finder-direction" onclick="Recruit.reverse()" aria-label="Reverse player sort">${prefs().direction === -1 ? "↓" : "↑"}</button>${select(
      "preset",
      "Quick search",
      [
        ["", "Choose a focus…"],
        ["upside", "Young upside"],
        ["free", "Available free agents"],
        ["form", "In-form players"],
        ["expiring", "Expiring contracts"],
        ["honors", "Award winners"],
      ],
      null,
      "Recruit.presetSelect",
    )}<select aria-label="Saved player searches" onchange="Recruit.loadSearch(this.value)"><option value="">Saved searches (${prefs().saved.length})</option>${prefs()
      .saved.map((v) => option(v.id, v.name, null))
      .join(
        "",
      )}</select><button class="secondary small" onclick="Recruit.saveSearch()">Save search</button><button class="finder-export" onclick="Recruit.export()" aria-label="Export filtered players">Export CSV</button></div><div id="finder-chips" class="finder-chips">${chips()}</div><div id="finder-results" class="finder-results">${table()}</div><div id="finder-pagination" class="finder-pagination">${pager()}</div><div class="finder-legend"><span>${scorePill("morale", 90)} Strong</span><span>${scorePill("morale", 70)} Good</span><span>${scorePill("morale", 55)} Watch</span><span>${scorePill("morale", 30)} Concern</span><small>Prospect talent is estimated. Honors: selected 2023–25 records + this save.</small></div></section>`;
  };
  window.Recruit = {
    fit() {
      const host = document.getElementById("finder-results");
      if (!host) return;
      if (innerWidth <= 760) {
        host.style.height = "";
        host.style.maxHeight = "";
        return;
      }
      const room = Math.max(
        200,
        innerHeight - host.getBoundingClientRect().top - 94,
      );
      host.style.maxHeight = room + "px";
      host.style.height =
        Math.min(
          room,
          Math.max(200, host.querySelector("table")?.offsetHeight || 200),
        ) + "px";
    },

    change(k, v) {
      prefs();
      filters[k] = v;
      page = 1;
      persist();
      redraw();
    },
    query(v) {
      prefs();
      filters.query = v;
      page = 1;
      persist();
      redraw();
    },
    pool(v) {
      prefs();
      filters.pool = v;
      filters.shortlistOnly = false;
      page = 1;
      persist();
      render();
    },
    shortlistView() {
      prefs();
      filters.shortlistOnly = !filters.shortlistOnly;
      page = 1;
      persist();
      render();
    },
    clear(k) {
      filters[k] = DEFAULT_SEARCH[k];
      page = 1;
      persist();
      render();
    },
    reset() {
      filters = { ...DEFAULT_SEARCH };
      page = 1;
      persist();
      render();
    },
    option(k, v) {
      const p = prefs();
      p[k] = v;
      if (k === "sort")
        p.direction = ["name", "team", "position", "age"].includes(v) ? 1 : -1;
      save();
      render();
    },
    presetSelect(_, v) {
      if (v) Recruit.preset(v);
    },
    preset(v) {
      prefs();
      filters = {
        ...DEFAULT_SEARCH,
        ...({
          upside: { ageMax: 25, potMin: 85 },
          free: {
            pool: "Free agents",
            excludeInjured: true,
            excludeHoldouts: true,
          },
          form: { formMin: 7, snapsMin: 25 },
          expiring: { expiring: true, excludeOwn: true },
          honors: { awardWinner: true },
        }[v] || {}),
      };
      page = 1;
      persist();
      render();
    },
    sort(k) {
      const p = prefs();
      p.direction =
        p.sort === k
          ? -p.direction
          : ["name", "team", "position", "age", "height", "weight"].includes(k)
            ? 1
            : -1;
      p.sort = k;
      save();
      redraw();
    },
    reverse() {
      prefs().direction *= -1;
      save();
      render();
    },
    size(v) {
      prefs().size = Number(v);
      page = 1;
      save();
      redraw();
    },
    page(d) {
      page += d;
      redraw();
      document.getElementById("finder-results").scrollTop = 0;
    },
    filterTab(v) {
      filterTab = v;
      document.getElementById("finder-filter-panel").innerHTML = filterPanel();
    },
    closeFilters() {
      document.querySelector(".finder-filter-menu").open = false;
    },
    toggleShortlist(id) {
      if (isBusy()) {
        toast("Wait for the current simulation to finish.");
        return;
      }
      const p = prefs();
      p.shortlist = p.shortlist.includes(id)
        ? p.shortlist.filter((x) => x !== id)
        : [...p.shortlist, id];
      save();
      window.PlayerUI?.refresh();
      if (document.getElementById("finder-results")) redraw();
      else render();
      toast(
        p.shortlist.includes(id)
          ? "Player added to shortlist."
          : "Player removed from shortlist.",
      );
    },
    saveSearch() {
      modal(
        `<div class="save-search-modal"><span class="eyebrow">RECRUITMENT SEARCH</span><h2>Keep this search.</h2><p>Save these criteria with this coach's career.</p><label>Name<input id="finder-save-name" maxlength="40" placeholder="e.g. Young receiving backs"></label><div class="modal-actions"><button class="secondary" onclick="closeModal()">Cancel</button><button onclick="Recruit.confirmSaveSearch()">Save search</button></div>${
          prefs().saved.length
            ? "<h3>Saved searches</h3>" +
              prefs()
                .saved.map(
                  (v) =>
                    `<div class="saved-search-row"><span>${esc(v.name)}</span><button class="link" onclick="Recruit.removeSearch('${v.id}')">Remove</button></div>`,
                )
                .join("")
            : ""
        }</div>`,
      );
    },
    confirmSaveSearch() {
      const name = document.getElementById("finder-save-name").value.trim(),
        p = prefs();
      if (!name) {
        toast("Name this search.");
        return;
      }
      if (p.saved.length >= 8) {
        toast("Remove a saved search before adding another.");
        return;
      }
      let normalized;
      try {
        normalized = normalizeSearch(filters);
      } catch (e) {
        toast(e.message);
        return;
      }
      p.saved.push({
        id: String(Date.now()),
        name,
        filters: normalized,
        mode: p.mode,
        sort: p.sort,
        direction: p.direction,
      });
      save();
      closeModal();
      render();
    },
    loadSearch(id) {
      const v = prefs().saved.find((x) => x.id === id);
      if (!v) return;
      filters = normalizeSearch(v.filters);
      Object.assign(prefs(), {
        mode: v.mode,
        sort: v.sort,
        direction: v.direction,
      });
      page = 1;
      persist();
      render();
    },
    removeSearch(id) {
      prefs().saved = prefs().saved.filter((x) => x.id !== id);
      save();
      Recruit.saveSearch();
    },
    report(id) {
      const p = state.prospects.find((p) => p.id === id);
      if (!p) {
        toast("This prospect is no longer in the draft pool.");
        return;
      }
      const e = data().find((e) => e.p.id === id),
        r = state.franchise.reports[id];
      modal(
        `<div class="prospect-report"><div class="prospect-report-head">${playerFace(p)}<div><span class="eyebrow">DRAFT SCOUTING REPORT</span><h2>${esc(p.name)}</h2><p>${positionBadge(p)} ${p.age} years · ${heightLabel(p)} · ${p.weight || "—"} lb</p></div><button class="icon-button" onclick="closeModal()" aria-label="Close scouting report">×</button></div><div class="report-rating-row"><span>Estimated ability ${scorePill("rating", e.talent.rating, e.talent.ratingLabel)}</span><span>Potential range ${scorePill("potential", e.talent.potential, e.talent.potentialLabel)}</span><span><b>${e.talent.confidence}%</b> confidence</span></div><div class="report-notes">${(
          r?.notes || [
            "Regional interest only. Request a report to improve knowledge.",
          ]
        )
          .slice(-4)
          .map((n) => `<p>${esc(n)}</p>`)
          .join(
            "",
          )}</div><div class="report-request"><label>Scouting activity<select id="prospect-activity">${["Regional report", "Combine", "Pro day", "Medical check", "Private visit"].map((v) => `<option>${v}</option>`).join("")}</select></label><button ${S.allowed(state, "scout") && !isBusy() ? "" : "disabled"} onclick="Recruit.request('${id}')">Request report</button></div><p class="finder-note">Regional report: 1 point · Combine, Pro day, Medical: 2 · Private visit: 3. ${state.franchise.scoutPoints} available. ${S.allowed(state, "scout") ? "" : "Your GM handles scouting assignments in this career role."}</p></div>`,
      );
    },
    request(id) {
      const kind = document.getElementById("prospect-activity").value;
      if (F.action("scout", id, kind)) {
        memo = null;
        PlayerUI.refresh();
        Recruit.report(id);
      }
    },
    export() {
      const r = result();
      const fields = [["name", "Player"], ["team", "Team"], ...cols()];
      const rows = r.all.map((e) => [
        e.p.name,
        e.teamLabel,
        ...cols().map(([k]) =>
          k === "rating"
            ? e.talent.ratingLabel
            : k === "potential"
              ? e.talent.potentialLabel
              : k === "awards"
                ? honorLabel(e)
                : k === "height"
                  ? prefs().mode === "Recruitment"
                    ? heightLabel(e.p) +
                      " / " +
                      (e.weight ? fmt(e.weight) + " lb" : "—")
                    : heightLabel(e.p)
                  : k === "position"
                    ? e.p.realPosition || e.p.pos
                    : k === "age"
                      ? e.p.age
                      : k === "morale"
                        ? e.p.morale
                        : k === "condition"
                          ? e.p.fitness
                          : k === "weight"
                            ? e.weight
                            : k === "cap"
                              ? e.cap
                              : k === "expiry"
                                ? e.expiry
                                : k === "confidence"
                                  ? e.talent.confidence
                                  : (e.stats[k] ?? e.attributes[k] ?? ""),
        ),
      ]);
      const a = document.createElement("a");
      a.href = URL.createObjectURL(
        new Blob(
          [
            csvText(
              fields.map((x) => x[1]),
              rows,
            ),
          ],
          { type: "text/csv;charset=utf-8" },
        ),
      );
      a.download = "gridiron-player-search.csv";
      a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 1000);
    },
  };
}
