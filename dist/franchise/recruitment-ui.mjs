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
import { locate, scoutRange } from "./scouting.mjs";
import { pixelFace } from "../ui/pixel-face.mjs";
// The scouting desk: search + filter bar, paged pixel result rows, the shortlist and the scout
// desk (assignments and filed reports). Styles: people.css (layout) over recruitment.css.
const PAGE_SIZES = [12, 25, 50];
const SHORT_PAGE = 6;
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
  if (typeof document !== "undefined" && typeof document.querySelector === "function" && !document.querySelector('link[href="people.css"]'))
    document.head?.insertAdjacentHTML?.("beforeend", '<link rel="stylesheet" href="people.css">');
  let filters = null,
    owner = null,
    page = 1,
    shortPage = 0,
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
      size: PAGE_SIZES[0],
      shortlist: [],
      saved: [],
      desk: 2,
    };
    const p = o.scouting;
    p.shortlist ??= [];
    p.saved ??= [];
    // The paged desk shows 12 rows by default; move the old default of 25 over once.
    if (p.desk !== 2) {
      if (p.size === 25) p.size = PAGE_SIZES[0];
      p.desk = 2;
    }
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
      case "rating": {
        const v = fog(e);
        return v
          ? `<span class="sc-fog" title="Scouted ${v.confidence}%: the true rating is inside this range">${esc(v.label)}</span>`
          : scorePill("rating", e.talent.rating, e.talent.ratingLabel);
      }
      case "potential": {
        const v = fog(e);
        return v
          ? `<span class="sc-fog" title="Scouted ${v.confidence}%">${v.pot[0] === v.pot[1] ? v.pot[0] : v.pot.join("–")}</span>`
          : scorePill(
              "potential",
              e.talent.potential,
              e.talent.potentialLabel,
            );
      }
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
  // Other clubs' players and free agents show your scouts' range until fully scouted
  // (the same fog of war as the scouting report). Prospects use the draft-board estimate.
  function fog(e) {
    if (e.team === state.team || e.team === -2) return null;
    const v = scoutRange(state, e.p, e.team);
    return v.exact ? null : v;
  }
  const known = (e) => {
    const v = e.team === -2 ? { confidence: e.talent.confidence } : e.team === state.team ? null : fog(e);
    if (!v) return "";
    const n = Math.round(v.confidence / 20);
    return `<span class="sc-known" title="${v.confidence}% scouted"><span class="pp-blocks ${v.confidence >= 80 ? "good" : v.confidence >= 50 ? "" : "warn"}">${Array.from({ length: 5 }, (_, i) => `<i class="${i < n ? "on" : ""}"></i>`).join("")}</span>${v.confidence}%</span>`;
  };
  function table() {
    const r = result(),
      p = prefs();
    return `<table class="finder-table sc-table" data-table-filtered="true"><thead><tr><th class="finder-player-col"><button class="link" onclick="Recruit.sort('name')">Player / team ${p.sort === "name" ? (p.direction === -1 ? "↓" : "↑") : ""}</button></th>${cols()
      .map(
        ([k, t]) =>
          `<th aria-sort="${p.sort === k ? (p.direction === -1 ? "descending" : "ascending") : "none"}" class="${p.sort === k ? "on" : ""}"><button class="link" onclick="Recruit.sort('${k}')">${t}${p.sort === k ? (p.direction === -1 ? " ↓" : " ↑") : ""}</button></th>`,
      )
      .join("")}<th aria-label="Player actions"></th></tr></thead><tbody>${
      r.rows
        .map((e) => {
          const starred = p.shortlist.includes(e.p.id);
          return `<tr><td class="finder-player-col"><div class="finder-player-cell sc-who"><button class="link shortlist-star sc-star ${starred ? "active" : ""}" onclick="Recruit.toggleShortlist('${e.p.id}')" aria-label="${starred ? "Remove" : "Add"} ${esc(e.p.name)} ${starred ? "from" : "to"} shortlist">${starred ? "★" : "☆"}</button><button class="link player-link sc-name" ${previewAttributes(e.p, e.team)} onclick="PlayerUI.open('${e.p.id}',${e.team})">${pixelFace(e.p, { size: 34, team: e.team >= 0 ? e.team : null })}<span><b>${esc(e.p.name)}</b><small>${e.team >= 0 ? logo(e.team) : ""}${esc(e.teamLabel)}${e.p.injury ? " · Injured" : e.p.holdout ? " · Holdout" : ""}</small></span></button>${known(e)}</div></td>${cols()
            .map(([k]) => `<td>${cell(e, k)}</td>`)
            .join("")}<td class="sc-acts"><button class="link player-peek-button sc-peek" onclick="PlayerUI.peek('${e.p.id}',${e.team},this)" aria-label="Preview ${esc(e.p.name)}">${icon("search")}</button>${e.team !== state.team ? `<button class="secondary small finder-report-button" onclick="Recruit.report('${e.p.id}')" aria-label="Scout ${esc(e.p.name)}">Report</button>` : '<span class="sc-own">Yours</span>'}</td></tr>`;
        })
        .join("") ||
      `<tr><td colspan="12"><div class="finder-empty sc-empty"><b>${error ? "Check your filters" : "No players match this search."}</b><p>${esc(error || "Remove a filter or choose another player pool.")}</p><button class="secondary small" onclick="Recruit.reset()">Reset filters</button></div></td></tr>`
    }</tbody></table>`;
  }
  function pager() {
    const r = result();
    return `<span><b>${r.from}–${r.to}</b> of ${r.total.toLocaleString()} players</span><span class="finder-page-controls sc-page-controls"><label class="pp-select"><span>Rows</span><select aria-label="Players per page" onchange="Recruit.size(this.value)">${[...new Set([...PAGE_SIZES, prefs().size])].sort((a, b) => a - b).map((v) => option(v, v, prefs().size)).join("")}</select></label><button class="secondary small" onclick="Recruit.page(-1)" ${r.page === 1 ? "disabled" : ""} aria-label="Previous player page">Previous</button><span class="sc-pageno">${r.page} / ${r.pages}</span><button class="secondary small" onclick="Recruit.page(1)" ${r.page === r.pages ? "disabled" : ""} aria-label="Next player page">Next</button></span>`;
  }
  // Shortlist rail: paged, with each player's current scouting view and a report shortcut.
  function shortlist() {
    const p = prefs(),
      found = p.shortlist.map((id) => locate(state, id)).filter(Boolean),
      pages = Math.max(1, Math.ceil(found.length / SHORT_PAGE));
    shortPage = Math.max(0, Math.min(shortPage, pages - 1));
    const rows = found
      .slice(shortPage * SHORT_PAGE, shortPage * SHORT_PAGE + SHORT_PAGE)
      .map(({ p: x, team }) => {
        const own = team === state.team,
          v = own ? null : scoutRange(state, x, team);
        return `<li>${pixelFace(x, { size: 32, team: team >= 0 ? team : null })}<button class="link sc-name" onclick="PlayerUI.open('${x.id}',${team})"><b>${esc(x.name)}</b><small><em class="pp-pos">${esc(x.pos)}</em>${team === -1 ? "Free agent" : team === -2 ? "Draft prospect" : esc(clubs[team]?.[2] || "")}</small></button><span class="sc-ovr ${v && !v.exact ? "fog" : ""}" title="${v && !v.exact ? v.confidence + "% scouted" : "True rating"}">${own ? x.ovr : esc(v.label)}</span><span class="sc-li-acts">${own ? "" : `<button class="secondary small" onclick="Recruit.report('${x.id}')">Report</button>`}<button class="link sc-unstar" onclick="Recruit.toggleShortlist('${x.id}')" aria-label="Remove ${esc(x.name)} from shortlist">×</button></span></li>`;
      })
      .join("");
    return `<div class="pp-panel-head"><h3>★ Shortlist</h3><small>${found.length} player${found.length === 1 ? "" : "s"}</small></div>${
      rows
        ? `<ul class="sc-list">${rows}</ul>${pages > 1 ? `<div class="pp-pager sc-mini-pager"><span>Page ${shortPage + 1} / ${pages}</span><button class="secondary small" ${shortPage ? "" : "disabled"} onclick="Recruit.shortPage(-1)">Prev</button><button class="secondary small" ${shortPage + 1 < pages ? "" : "disabled"} onclick="Recruit.shortPage(1)">Next</button></div>` : ""}${found.length ? `<button class="link sc-more" onclick="Recruit.shortlistView()">${filters.shortlistOnly ? "Show all players" : "Show only shortlisted in results"} →</button>` : ""}`
        : '<p class="pp-none">Star a player in the results to keep him here. The shortlist is saved with this career.</p>'
    }`;
  }
  // Scout desk: who is on assignment, when reports land, and the latest filed reports.
  function desk() {
    const f = state.franchise,
      d = f.scoutDesk || { requests: [], delivered: [] },
      requests = (d.requests || []).filter((r) => r.team === state.team),
      scouts = f.scouting?.scouts?.length ? f.scouting.scouts : [{ name: "Area scout" }, { name: "National scout" }],
      recent = (d.delivered || []).slice(0, 3);
    const scoutRows = scouts
      .map((s) => {
        const job = requests.find((r) => r.scout === s.name);
        return `<li class="${job ? "busy" : ""}"><span class="sc-led" aria-hidden="true"></span><span class="sc-scout"><b>${esc(s.name)}</b><small>${s.region ? esc(s.region) + " · " : ""}${Number.isFinite(s.skill) ? "skill " + s.skill : "scout"}</small></span>${job ? `<button class="link sc-job" onclick="Recruit.report('${job.playerId}')"><b>${esc(job.name)}</b><small>Report due ${esc(job.due)}</small></button>` : '<span class="pp-chip good">Available</span>'}</li>`;
      })
      .join("");
    const extra = requests.filter((r) => !scouts.some((s) => s.name === r.scout));
    return `<div class="pp-panel-head"><h3>Scout desk</h3><small>${requests.length} / ${scouts.length} on assignment</small></div><ul class="sc-list sc-scouts">${scoutRows}${extra.map((r) => `<li class="busy"><span class="sc-led"></span><span class="sc-scout"><b>${esc(r.scout)}</b><small>scout</small></span><button class="link sc-job" onclick="Recruit.report('${r.playerId}')"><b>${esc(r.name)}</b><small>Report due ${esc(r.due)}</small></button></li>`).join("")}</ul><span class="pp-label">Filed reports</span>${
      recent.length
        ? `<ul class="sc-list sc-filed">${recent.map((r) => `<li><button class="link sc-job" onclick="Recruit.report('${r.playerId}')"><b>${esc(r.name)}</b><small>${esc(r.date)}</small></button><span class="sc-conf">${r.from}% <i>→</i> <b>${r.to}%</b></span></li>`).join("")}</ul>`
        : '<p class="sc-hint">Open a player and request a report. Each report narrows his rating ranges; it arrives in your Inbox.</p>'
    }<button class="link sc-more" onclick="W.open('Draft room')">Hire or manage scouts in the Draft room →</button>`;
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
    const s = document.getElementById("sc-shortlist");
    if (s) s.innerHTML = shortlist();
    document
      .querySelectorAll("[data-finder-pool]")
      .forEach((b) => {
        const on = b.dataset.finderPool === filters.pool && !filters.shortlistOnly;
        b.classList.toggle("active", on);
        b.classList.toggle("on", on);
      });
  }
  function persist() {
    try {
      prefs().filters = normalizeSearch(filters);
      save();
    } catch {}
  }
  views.Scouting = () => {
    prefs();
    const r = result(),
      f = state.franchise,
      requests = (f.scoutDesk?.requests || []).filter((x) => x.team === state.team).length,
      scouts = f.scouting?.scouts?.length || 2,
      pts = f.scoutPoints ?? 0,
      visits = f.visits?.length ?? 0;
    const res = (label, value, sub, bar) => `<div class="sc-res"><small>${label}</small><b>${value}</b>${bar}<span>${sub}</span></div>`,
      bar = (v, max, n = 10, tone = "") => `<span class="pp-blocks ${tone}">${Array.from({ length: n }, (_, i) => `<i class="${i < Math.round((Math.min(max, Math.max(0, v)) / max) * n) ? "on" : ""}"></i>`).join("")}</span>`;
    return `<div class="pp-page sc-page"><section class="pp-panel sc-head"><div class="sc-resources">${res("Scouting points", pts, "Spent on prospect visits", bar(pts, Math.max(10, pts)))}${res("Private visits", `${visits}<i>/30</i>`, "Pre-draft workouts used", bar(visits, 30, 10, visits >= 27 ? "warn" : ""))}${res("Scouts out", `${requests}<i>/${scouts}</i>`, requests >= scouts ? "All on assignment" : `${scouts - requests} free for a report`, bar(requests, scouts, scouts, requests >= scouts ? "warn" : "good"))}</div></section><div class="sc-layout"><section class="pp-panel sc-finder finder-workspace"><div class="sc-pools"><div class="pp-seg" role="group" aria-label="Player pool">${["All players", "NFL", "Free agents", "Draft"].map((v) => `<button data-finder-pool="${v}" class="${filters.pool === v && !filters.shortlistOnly ? "active on" : ""}" onclick="Recruit.pool('${v}')">${v === "Draft" ? "Draft class" : v === "NFL" ? "NFL rosters" : v}</button>`).join("")}<button class="${filters.shortlistOnly ? "active on" : ""}" onclick="Recruit.shortlistView()">★ Shortlist <small id="finder-shortlist-total">${prefs().shortlist.length}</small></button></div><span class="finder-total sc-total"><b id="finder-result-total">${r.total.toLocaleString()}</b> found</span></div><div class="finder-main-tools sc-tools"><div class="finder-search sc-search">${icon("search")}<input type="search" placeholder="Search name, team, college or position…" aria-label="Search all players" value="${esc(filters.query)}" oninput="Recruit.query(this.value)"></div>${select("position", "Position", ["All positions", "QB", "RB", "WR", "TE", "OL", "DL", "LB", "CB", "S", "K", "P", "FB", "OT", "G", "C", "DE", "DT"], filters.position)}${select("team", "Team", [["All teams", "All teams"], ...clubs.map((c, i) => [i, c[1] + " " + c[2]]), [-1, "Free agents"], [-2, "Draft class"]], filters.team)}<details class="finder-filter-menu sc-filter-menu"><summary>${icon("filter")} Filters <b id="finder-filter-badge">${activeFilters().length || ""}</b></summary><div id="finder-filter-panel">${filterPanel()}</div></details></div><div class="finder-view-tools sc-tools sc-view-tools">${select("mode", "View", ["Recruitment", "Performance", "Physical", "Contracts", "Attributes"], prefs().mode, "Recruit.option")}${select("sort", "Sort by", Object.entries(SORTS), prefs().sort, "Recruit.option")}<button class="secondary small finder-direction" onclick="Recruit.reverse()" aria-label="Reverse player sort">${prefs().direction === -1 ? "↓" : "↑"}</button>${select(
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
    )}<span class="sc-saved"><select aria-label="Saved player searches" onchange="Recruit.loadSearch(this.value)"><option value="">Saved searches (${prefs().saved.length})</option>${prefs()
      .saved.map((v) => option(v.id, v.name, null))
      .join(
        "",
      )}</select><button class="secondary small" onclick="Recruit.saveSearch()">Save search</button><button class="secondary small finder-export" onclick="Recruit.export()" aria-label="Export filtered players">Export CSV</button></span></div><div id="finder-chips" class="finder-chips sc-chips">${chips()}</div><div id="finder-results" class="finder-results sc-results">${table()}</div><div id="finder-pagination" class="finder-pagination pp-pager sc-pager">${pager()}</div><div class="finder-legend sc-legend"><span>${scorePill("morale", 90)} Strong</span><span>${scorePill("morale", 70)} Good</span><span>${scorePill("morale", 55)} Watch</span><span>${scorePill("morale", 30)} Concern</span><span><span class="sc-fog">62–70</span> Scouted range</span><small>Ranges always contain the true rating. Honors: selected 2023–25 records + this save.</small></div></section><div class="sc-rail"><section class="pp-panel sc-shortlist" id="sc-shortlist">${shortlist()}</section><section class="pp-panel sc-desk">${desk()}</section></div></div></div>`;
  };
  window.Recruit = {
    // The desk pages instead of scrolling, so there is no results height to fit any more.
    fit() {
      const host = document.getElementById("finder-results");
      if (host) host.style.height = host.style.maxHeight = "";
    },
    shortPage(d) {
      shortPage = Math.max(0, shortPage + d);
      const s = document.getElementById("sc-shortlist");
      if (s) s.innerHTML = shortlist();
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
      const host = document.getElementById("finder-results");
      if (host?.getBoundingClientRect?.().top < 0) host.scrollIntoView({ block: "start" });
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
      Scout.open(id);
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
