import { reputationView } from "./reputation.mjs";
import * as S from "./state.mjs";
import { faceSVG } from "./newgens.mjs";
import {
  catalogEntries,
  enrichPlayerBios,
  heightLabel,
  metricTone,
} from "./player-catalog.mjs";
import { icon } from "./presentation.mjs";
import { seasonStats } from "./analysis.mjs";
import { attributeRanges } from "./scouting.mjs";
import { blockCount, contractTimeline, deadIfReleased } from "./cap-sheet.mjs";
import { pixelFace } from "../ui/pixel-face.mjs";
import { stepChart } from "../ui/pixel-chart.mjs";
import { teamColors } from "../presentation/pixel-art.mjs";
const fmt = (n, d = 0) =>
  Number.isFinite(n)
    ? Number(n).toLocaleString("en-US", { maximumFractionDigits: d })
    : "—";
export const scorePill = (kind, n, label) =>
  `<span class="metric-pill tone-${metricTone(kind, n)}" title="${esc(kind)}: ${Number.isFinite(n) ? n : "not recorded"}">${esc(label ?? (Number.isFinite(n) ? fmt(n, kind === "form" || kind === "training" ? 1 : 0) : "—"))}</span>`;
export const playerFace = (p) =>
  `<span class="player-avatar">${faceSVG(p)}${/^https:\/\//.test(p.headshot || "") ? `<img src="${esc(p.headshot)}" alt="${esc(p.name)}" loading="lazy" onerror="this.remove()">` : ""}</span>`;
export const previewAttributes = (p, team) =>
  `data-player-id="${esc(p.id)}" data-player-team="${team}"`;
export const miniBio = (p) =>
  `${heightLabel(p)} · ${Number.isFinite(p.weight) && p.weight > 0 ? fmt(p.weight) + " lb" : "— lb"}`;
export const honorLabel = (e) =>
  e.awards[0]
    ? `${e.awards[0].year} ${e.awards[0].award}`
    : "No recorded honors";
const units = (p) =>
  ["QB", "RB", "WR", "TE", "OL"].includes(p.pos)
    ? "offense"
    : ["DL", "LB", "CB", "S"].includes(p.pos)
      ? "defense"
      : "special";
export const positionBadge = (p) =>
  `<span class="position-chip ${units(p)}">${esc(p.realPosition || p.pos)}</span>`;

// ---------------------------------------------------------------------------------------------
// Pixel player profile (the W.player dialog) and the hover snapshot. Same family as the trade desk,
// scout report and cap sheet: a club-coloured header bar with a pixel face, square OVR/POT badges,
// segmented tabs, block meters and paged tables. Styles: ui/dialogs.css (gp-*).
// Pure helpers below are exported for tests (test-player-profile.mjs).
export const STAT_LABELS = {
  passYards: "Pass yds",
  passTD: "Pass TD",
  completions: "Comp",
  attempts: "Att",
  rushYards: "Rush yds",
  rushTD: "Rush TD",
  receptions: "Rec",
  recYards: "Rec yds",
  recTD: "Rec TD",
  tackles: "Tackles",
  sacks: "Sacks",
  snaps: "Snaps",
};
const POS_STATS = {
  QB: ["passYards", "passTD", "completions", "attempts", "rushYards"],
  RB: ["rushYards", "rushTD", "receptions", "recYards"],
  WR: ["receptions", "recYards", "recTD"],
  TE: ["receptions", "recYards", "recTD"],
  DL: ["tackles", "sacks"],
  LB: ["tackles", "sacks"],
  CB: ["tackles"],
  S: ["tackles"],
};
// The stat columns worth showing for a position: its own numbers first, then anything else he has
// actually recorded in `rows` (season stat objects), then snaps. At most `max` columns.
export function statColumns(pos, rows = [], max = 7) {
  const base = POS_STATS[pos] || [],
    extra = Object.keys(STAT_LABELS).filter(
      (k) => k !== "snaps" && !base.includes(k) && rows.some((r) => Number(r?.[k]) > 0),
    );
  return [...base, ...extra].slice(0, max - 1).concat("snaps");
}
// Design-token tone for a rating-like value (metricTone bands → good / accent / warn / bad).
export function toneOf(kind, n) {
  return { excellent: "good", good: "accent", caution: "warn", poor: "bad" }[metricTone(kind, n)] || "";
}
// One row per contract season (void years included) with its cap hit and a block count scaled to
// the largest season, for the profile's season-by-season bars.
export function contractSeasons(c, year, hit = S.capHit, cells = 14) {
  if (!c) return [];
  const rows = contractTimeline(c, year).map((r) => ({ ...r, hit: hit(c, r.year) || 0 })),
    top = Math.max(0, ...rows.map((r) => r.hit));
  return rows.map((r) => ({ ...r, cells: blockCount(r.hit, top, cells) }));
}
// Slice of `rows` for page `page` (clamped) with `size` rows per page.
export function pageOf(rows, page, size) {
  const pages = Math.max(1, Math.ceil(rows.length / size)),
    at = Math.max(0, Math.min(pages - 1, page | 0));
  return { rows: rows.slice(at * size, at * size + size), page: at, pages };
}
const attrLabel = (k) => k.replace(/([A-Z])/g, " $1").replace(/^./, (s) => s.toUpperCase());
// Square block meter. Hatched "fog" blocks cover a scouted range (lo..hi).
const gpBlocks = (value, max, cells = 10, tone = "", hi = null) => {
  const on = blockCount(value, max, cells),
    fog = hi == null ? on : Math.max(on, blockCount(hi, max, cells));
  return `<span class="gp-blocks ${tone}" aria-hidden="true">${Array.from({ length: cells }, (_, i) => `<i${i < on ? ' class="on"' : i < fog ? ' class="fog"' : ""}></i>`).join("")}</span>`;
};

export function installPlayerUI({ isBusy }) {
  let entries = [],
    lookup = new Map(),
    memo = null,
    stamp = "",
    hoverTimer,
    closeTimer,
    card = null,
    anchor = null,
    profile = null,
    profileTab = "Overview",
    shownTab = null,
    statsPage = 0;
  function refresh() {
    const key = `${state.year}:${state.week}:${state.phase}:${state.franchise.awards.length}:${state.roster.length}:${state.agents.length}:${state.prospects.length}`;
    if (memo !== state || stamp !== key) {
      enrichPlayerBios(state);
      entries = catalogEntries(state);
      lookup = new Map(entries.map((e) => [e.p.id, e]));
      memo = state;
      stamp = key;
    }
    return entries;
  }
  const find = (id, team) => {
    refresh();
    const e = lookup.get(id);
    return e && (team == null || e.team === Number(team))
      ? e
      : entries.find((e) => e.p.id === id) || null;
  };
  function hide() {
    clearTimeout(hoverTimer);
    clearTimeout(closeTimer);
    if (anchor) {
      anchor.removeAttribute("aria-details");
      anchor.setAttribute("aria-expanded", "false");
    }
    card?.remove();
    card = null;
    anchor = null;
  }
  const STATUS = { active: "Active roster", practice: "Practice squad", ir: "Injured reserve", elevated: "Elevated for game day", free: "Free agent" };
  const money = (n) => "$" + (n / S.MILLION).toFixed(2) + "M";
  const shortlisted = (id) => !!state.franchise.office?.scouting?.shortlist?.includes(id);
  const chip = (text, tone = "") => `<span class="gp-chip ${tone}">${text}</span>`;
  const club = (e) => (e.team >= 0 ? e.team : null);
  const clubColour = (e) => {
    try {
      return e.team >= 0 ? teamColors(e.team).primary : "";
    } catch {
      return "";
    }
  };
  const panel = (title, body, extra = "", cls = "") =>
    `<section class="gp-panel ${cls}"><div class="gp-panel-head"><h3>${title}</h3>${extra ? `<div>${extra}</div>` : ""}</div><div class="gp-panel-body">${body}</div></section>`;
  const tile = (label, value, sub = "", tone = "") =>
    `<div class="gp-tile ${tone}"><small>${label}</small><b>${value}</b>${sub ? `<span>${sub}</span>` : ""}</div>`;
  const meterRow = (label, value, max, text, kind) =>
    `<div class="gp-meter"><span>${label}</span>${gpBlocks(value, max, 10, Number.isFinite(value) ? toneOf(kind, value) : "")}<b class="${Number.isFinite(value) ? toneOf(kind, value) : ""}">${Number.isFinite(value) ? text : "—"}</b></div>`;
  const badge = (label, text, kind, n) =>
    `<div class="gp-badge ${toneOf(kind, n)} ${String(text).length > 3 ? "range" : ""}"><b>${esc(text)}</b><small>${label}</small></div>`;
  const ordinal = (n) => n + (n % 100 >= 11 && n % 100 <= 13 ? "th" : ["th", "st", "nd", "rd"][n % 10] || "th");

  // Hover snapshot: a small pixel card next to the name.
  function peekHTML(e) {
    const p = e.p,
      draft = e.pool === "Draft",
      rep = draft ? null : reputationView(state, p),
      status = p.injury ? chip(`Injured ${p.injury}w`, "bad") : p.holdout ? chip("Holdout", "bad") : chip("Ready", "good");
    return `<div class="gp-peek-head" style="--gp-club:${clubColour(e) || "var(--gd-border-strong)"}"><span>${draft ? "Scouting snapshot" : "Player snapshot"}</span><button class="gp-x" onclick="PlayerUI.hide()" aria-label="Close player preview">×</button></div><div class="gp-peek-id">${pixelFace(p, { size: 56, team: club(e) })}<div><h3>${esc(p.name)}</h3><p><em class="gp-pos">${esc(p.realPosition || p.pos)}</em>${esc(e.teamLabel)}</p><small>${esc(p.college || "College not recorded")}</small></div><div class="gp-peek-badges">${badge(draft ? "EST" : "OVR", e.talent.ratingLabel, "rating", e.talent.rating)}${badge(draft ? "CEIL" : "POT", e.talent.potentialLabel, "potential", e.talent.potential)}</div></div><div class="gp-peek-facts"><span><small>Age</small><b>${p.age}</b></span><span><small>Height</small><b>${heightLabel(p)}</b></span><span><small>Weight</small><b>${e.weight ? fmt(e.weight) + " lb" : "—"}</b></span><span><small>Status</small>${status}</span></div><div class="gp-peek-meters">${meterRow("Morale", p.morale, 100, fmt(p.morale) + "%", "morale")}${meterRow("Condition", p.fitness, 100, fmt(p.fitness) + "%", "condition")}${meterRow("Form", e.stats.form, 10, fmt(e.stats.form, 1), "form")}</div><p class="gp-peek-note">${draft ? `${e.talent.confidence}% scouting confidence · ranges are estimates` : `✦ ${esc(honorLabel(e))} · ${Math.round(rep.recognition)} reputation, ${esc(rep.label)}`}</p><div class="gp-peek-actions"><button class="small" onclick="PlayerUI.open('${e.p.id}',${e.team})">Open profile</button><button class="secondary small" onclick="Recruit.toggleShortlist('${e.p.id}')">${shortlisted(e.p.id) ? "★ Shortlisted" : "☆ Shortlist"}</button></div>`;
  }
  function peek(id, team, el) {
    const e = find(id, team);
    if (!e) return;
    hide();
    anchor = el;
    const holder = document.getElementById("modal").open
      ? document.getElementById("modal")
      : document.body;
    card = document.createElement("section");
    card.className = "player-hover-card gp-peek";
    card.id = "player-hover-card";
    card.setAttribute("role", "dialog");
    card.setAttribute("aria-label", e.p.name + " preview");
    card.innerHTML = peekHTML(e);
    holder.append(card);
    const r = el.getBoundingClientRect(),
      w = card.offsetWidth,
      h = card.offsetHeight;
    card.style.left =
      Math.max(
        10,
        Math.min(
          innerWidth - w - 10,
          r.right + w + 16 < innerWidth ? r.right + 12 : r.left - w - 12,
        ),
      ) + "px";
    card.style.top =
      Math.max(10, Math.min(innerHeight - h - 10, r.top - 25)) + "px";
    el.setAttribute("aria-details", card.id);
    el.setAttribute("aria-expanded", "true");
    card.addEventListener("pointerenter", () => clearTimeout(closeTimer));
    card.addEventListener("pointerleave", () => {
      closeTimer = setTimeout(hide, 180);
    });
  }

  // ---- Overview: tiles, readiness meters, role + best attributes, honours.
  function overviewTab(e) {
    const p = e.p,
      draft = e.pool === "Draft",
      rep = draft ? null : reputationView(state, p);
    let depth = "";
    if (e.team >= 0) {
      const group = S.roster(state, e.team).filter((q) => q.pos === p.pos && q.status !== "practice" && q.status !== "ir").sort((a, b) => (b.starter - a.starter) || b.ovr - a.ovr);
      const at = group.findIndex((q) => q.id === p.id);
      depth = at >= 0 ? `${esc(p.pos)} · ${ordinal(at + 1)} of ${group.length} on the depth chart${p.starter ? " · starter" : ""}` : `${esc(p.pos)} · not on the game-day depth chart`;
    } else depth = e.team === -1 ? "Unsigned · available to any club" : "College prospect · enters the draft";
    const best = e.talent.known
      ? Object.entries(e.attributes || {})
          .filter(([, v]) => Number.isFinite(v))
          .sort((a, b) => b[1] - a[1])
          .slice(0, 4)
      : [];
    const tiles = `<div class="gp-tiles">${tile("Age", p.age, `${p.experience ?? "—"} yr${p.experience === 1 ? "" : "s"} in the league`)}${tile("Build", heightLabel(p), e.weight ? fmt(e.weight) + " lb" : "Weight not recorded")}${tile(e.team === -1 ? "Asking base" : "Cap hit", Number.isFinite(e.cap) ? "$" + fmt(e.cap, 2) + "M" : "—", e.expiry ? `Contract through ${e.expiry}` : draft ? "Rookie scale after the draft" : e.team === -1 ? "Per season" : "No active contract")}${draft ? tile("Scouted", e.talent.confidence + "%", "Report confidence", e.talent.known ? "good" : "warn") : tile("Reputation", Math.round(rep.recognition), `${esc(rep.label)} · esteem ${rep.esteem}/99`, "accent")}</div>`;
    const readiness = panel(
      "Readiness",
      `<div class="gp-meters">${meterRow("Morale", p.morale, 100, fmt(p.morale) + "%", "morale")}${meterRow("Condition", p.fitness, 100, fmt(p.fitness) + "%", "condition")}${meterRow("Form", e.stats.form, 10, fmt(e.stats.form, 1), "form")}${meterRow("Training", e.stats.training, 10, fmt(e.stats.training, 1), "training")}${draft ? "" : meterRow("Coach trust", p.coachTrust ?? 60, 100, fmt(p.coachTrust ?? 60) + "%", "morale")}</div>`,
      p.injury ? chip(`Injured ${p.injury}w`, "bad") : p.holdout ? chip("Holdout", "bad") : chip("Available", "good"),
    );
    const role = panel(
      "Role",
      `<div class="gp-role"><b>${depth}</b><small>${esc(STATUS[p.status] || (e.team === -1 ? "Free agent" : draft ? "Draft prospect" : p.status || ""))}${p.realPosition && p.realPosition !== p.pos ? ` · plays ${esc(p.realPosition)}` : ""}${p.college ? ` · ${esc(p.college)}` : ""}</small></div>${
        best.length
          ? `<span class="gp-label">Best attributes</span><div class="gp-meters">${best.map(([k, v]) => `<div class="gp-meter"><span>${esc(attrLabel(k))}</span>${gpBlocks(v, 99, 10, toneOf("attribute", v))}<b class="${toneOf("attribute", v)}">${v}</b></div>`).join("")}</div>`
          : `<p class="gp-note">Attributes stay masked until your scouts finish a full report.</p>`
      }`,
      `<button class="link" onclick="PlayerUI.tab('Scouting')">All attributes →</button>`,
    );
    const honours = e.awards.length
      ? `<div class="gp-honours">${e.awards
          .slice(0, 4)
          .map((a) => `<div><i aria-hidden="true">✦</i><span><b>${a.year} ${esc(a.award)}</b><small>${esc(a.kind)}</small></span></div>`)
          .join("")}</div>`
      : `<p class="gp-note">No honours yet. Awards, Pro Bowls and records appear here as he earns them.</p>`;
    return `${tiles}<div class="gp-grid">${readiness}${role}</div>${panel("Honours", honours, e.awards.length > 4 ? `<small>${e.awards.length} in total</small>` : "", "gp-honour-panel")}`;
  }

  // ---- Stats: this season's tiles, a step chart of his headline number and a paged season table.
  function statsTab(e) {
    const p = e.p,
      seasons = Object.entries(p.stats || {})
        .filter(([y, v]) => /^\d{4}$/.test(y) && v && typeof v === "object")
        .sort(([a], [b]) => b - a),
      cols = statColumns(p.pos, seasons.map(([, v]) => v).concat(e.stats)),
      now = cols.map((k) => tile(STAT_LABELS[k], fmt(e.stats[k]), "", Number(e.stats[k]) > 0 ? "accent" : "")).join("");
    let body = `<div class="gp-tiles gp-tiles-stats">${now}</div>`;
    if (!seasons.length)
      return body + panel("By season", `<p class="gp-note">No games recorded yet. His season lines appear here after he plays.</p>`);
    const lead = cols.find((k) => seasons.some(([, v]) => Number(v[k]) > 0)) || cols[0],
      asc = seasons.slice().reverse(),
      chart =
        asc.length >= 2
          ? `<div class="gp-chart"><span class="gp-label">${esc(STAT_LABELS[lead])} by season</span>${stepChart([{ label: STAT_LABELS[lead], values: asc.map(([, v]) => (Number.isFinite(v[lead]) ? v[lead] : null)), tone: "accent" }], { h: 64, labels: asc.map(([y]) => y), title: `${STAT_LABELS[lead]} by season` })}</div>`
          : "";
    const pg = pageOf(seasons, statsPage, 6),
      career = seasonStats(p, "Career"),
      table = `<div class="gp-table-wrap"><table class="gp-table"><thead><tr><th>Season</th>${cols.map((k) => `<th class="num">${STAT_LABELS[k]}</th>`).join("")}</tr></thead><tbody>${pg.rows
        .map(([y, v]) => `<tr class="${Number(y) === state.year ? "now" : ""}"><td>${y}</td>${cols.map((k) => `<td class="num">${fmt(v[k])}</td>`).join("")}</tr>`)
        .join("")}</tbody><tfoot><tr><td>Career</td>${cols.map((k) => `<td class="num">${fmt(career[k])}</td>`).join("")}</tr></tfoot></table></div>${
        pg.pages > 1
          ? `<div class="gp-pager"><span>${seasons.length} seasons</span><div><button class="secondary small" onclick="PlayerUI.statsPage(${pg.page - 1})" ${pg.page ? "" : "disabled"}>◀ Prev</button><b>${pg.page + 1} / ${pg.pages}</b><button class="secondary small" onclick="PlayerUI.statsPage(${pg.page + 1})" ${pg.page >= pg.pages - 1 ? "disabled" : ""}>Next ▶</button></div></div>`
          : ""
      }`;
    return body + panel("By season", chart + table, `<small>${state.year} season · — means no recorded sample</small>`);
  }

  // ---- Contract: tiles, season-by-season cap bars, dead money if cut, transaction history.
  function contractTab(e) {
    const p = e.p,
      c = state.franchise.contracts[p.id],
      year = S.financeYear(state),
      moves = window.Nav?.playerMoves?.(p.id) || "",
      history = moves
        ? `<section class="gp-panel gp-moves">${moves}</section>`
        : panel("Transaction history", `<p class="gp-note">No recorded moves yet. Signings, trades, waivers and releases are logged here.</p>`);
    if (!(c && !c.ended))
      return `<div class="gp-tiles">${tile("Status", e.team === -1 ? "Free agent" : e.pool === "Draft" ? "Prospect" : "No contract", e.team === -1 ? "Can sign with any club" : e.pool === "Draft" ? "Signs a rookie deal when drafted" : "")}${Number.isFinite(e.cap) ? tile("Asking base", "$" + fmt(e.cap, 2) + "M", "Per season") : ""}</div>${history}`;
    const hit = S.capHit(c, year),
      end = c.start + c.years - 1,
      left = Math.max(0, end - Math.max(year, c.start) + 1),
      guaranteed = (c.guarantees || []).reduce((n, v) => n + (v || 0), 0),
      dead = deadIfReleased(c, year),
      rows = contractSeasons(c, year)
        .map(
          (r) =>
            `<div class="gp-season ${r.kind}"><span>${r.year}<small>${r.kind === "now" ? "This season" : r.kind === "void" ? "Void year" : r.kind === "past" ? "Paid" : "Future"}</small></span>${gpBlocks(r.cells, 14, 14, r.kind === "now" ? "" : r.kind === "void" ? "warn" : r.kind === "past" ? "muted" : "future")}<b>${money(r.hit)}</b></div>`,
        )
        .join("");
    return `<div class="gp-tiles">${tile(`Cap hit · ${year}`, money(hit), `Signed ${c.start} · ${esc(clubs[c.team]?.[2] || e.teamLabel)}`, "accent")}${tile("Years left", left, `Through ${end}${c.voidYears ? ` + ${c.voidYears} void` : ""}`, left <= 1 ? "warn" : "")}${tile("Guaranteed", money(guaranteed), `Signing bonus ${money(c.bonus || 0)}`)}${tile("Dead money if cut", money(dead), dead > 0 ? `Saves ${money(Math.max(0, hit - dead))} this season` : "Free to release", dead > 0 ? "bad" : "good")}</div><div class="gp-grid gp-grid-wide">${panel("Season by season", `<div class="gp-seasons">${rows}</div>`, `${c.noTrade ? chip("No-trade clause", "warn") : chip("Tradeable", "")}`)}${history}</div>`;
  }

  // ---- Scouting: every attribute as a block bar; hatched blocks are the range scouts can't rule out.
  function scoutingTab(e) {
    const p = e.p,
      known = e.talent.known;
    let rows = [];
    if (known) rows = Object.entries(e.attributes || {}).filter(([, v]) => Number.isFinite(v)).map(([k, v]) => ({ key: k, lo: v, hi: v, value: v }));
    else
      try {
        rows = attributeRanges(state, p, e.team).map((r) => ({ key: r.key, lo: r.value ?? r.lo, hi: r.value ?? r.hi, value: r.value }));
      } catch {
        rows = [];
      }
    const grid = rows.length
      ? `<div class="gp-attrs">${rows
          .map((r) => `<div><span>${esc(attrLabel(r.key))}</span>${gpBlocks(r.lo, 99, 12, r.value == null ? "" : toneOf("attribute", r.value), r.value == null ? r.hi : null)}<b class="${r.value == null ? "fog" : toneOf("attribute", r.value)}">${r.value == null ? `${r.lo}–${r.hi}` : r.value}</b></div>`)
          .join("")}</div>`
      : `<p class="gp-note">Individual attributes remain masked until a full report is complete.</p>`;
    const conf = Math.round(e.talent.confidence ?? 100),
      head = known ? chip(e.team === state.team ? "Your player · exact" : "Exact ratings", "good") : chip(`${conf}% confidence`, "warn"),
      foot = known
        ? ""
        : `<div class="gp-scout-foot"><span>${gpBlocks(conf, 100, 10, "warn")} Hatched blocks are the range your scouts can't yet rule out. A full report narrows it.</span>${window.Scout?.open ? `<button class="secondary small" onclick="Scout.open('${p.id}')">Open scouting report</button>` : ""}</div>`;
    return panel(known ? "Attributes" : "Scouted attributes", grid + foot, head);
  }

  function profileHTML(e) {
    const p = e.p,
      own = e.team === state.team,
      draft = e.pool === "Draft";
    const content =
      profileTab === "Scouting" ? scoutingTab(e) : profileTab === "Contract" ? contractTab(e) : profileTab === "Stats" ? statsTab(e) : overviewTab(e);
    const chips = [
      chip(esc(STATUS[p.status] || (e.team === -1 ? "Free agent" : draft ? "Draft prospect" : p.status || "Roster"))),
      p.starter ? chip("Starter", "accent") : "",
      p.injury ? chip(`Injured · ${p.injury}w`, "bad") : p.holdout ? chip("Holdout", "bad") : "",
      draft ? chip(`${e.talent.confidence}% scouted`, e.talent.known ? "good" : "warn") : "",
      shortlisted(p.id) ? chip("★ Shortlisted", "accent") : "",
    ].join("");
    const tabs = ["Overview", "Stats", "Contract", "Scouting"]
      .map((t) => `<button role="tab" aria-selected="${profileTab === t}" class="${profileTab === t ? "on active" : ""}" onclick="PlayerUI.tab('${t}')">${t}</button>`)
      .join("");
    const actions = own
      ? `<button onclick="closeModal();Dev.player('${p.id}')">Development & medical</button><button class="secondary" onclick="closeModal();CI.open('player','${p.id}')">Speak with player</button><button class="secondary" onclick="closeModal();F.contract('${p.id}')">Contract</button>${p.status === "practice" ? `<button class="secondary" onclick="W.move('${p.id}','active')">Move to active roster</button>` : `<button class="secondary" onclick="W.depth('${p.id}')">${p.starter ? "Move to bench" : "Make starter"}</button>`}<details class="action-menu gp-more"><summary>More ▾</summary><div><button onclick="Office.compareToggle('${p.id}',${e.team});closeModal()">Compare player</button><button onclick="Office.morale('${p.id}')">Morale history</button><button onclick="W.move('${p.id}','practice')">Practice squad</button><button onclick="W.move('${p.id}','active')">Active roster</button>${p.injury ? `<button onclick="W.move('${p.id}','ir')">Injured reserve</button>` : ""}<button class="gp-danger" onclick="closeModal();F.release('${p.id}')">Waive player</button></div></details>`
      : e.team === -1
        ? `<button ${S.allowed(state, "finance") ? "" : "disabled"} onclick="closeModal();F.offer('${p.id}')">Make contract offer</button>`
        : e.team === -2
          ? `<button onclick="Recruit.report('${p.id}')">Scouting report</button>`
          : `<button title="Open the trade builder with ${esc(p.name)} selected and a suggested package" onclick="if(window.Ops?.tradeFor)Ops.tradeFor('${p.id}',${e.team});else{closeModal();W.open('Market')}">Trade for ${esc(p.name)}</button>`;
    const jumps = `${own ? `<button class="link" onclick="closeModal();W.open('Roster')">Squad</button><button class="link" onclick="closeModal();W.open('Development')">Development</button><button class="link" onclick="closeModal();W.open('Contracts')">Contracts</button>` : `<button class="link" onclick="closeModal();W.open('Market')">Market</button>`}<button class="link" onclick="closeModal();W.open('Statistics')">Statistics</button><button class="link" onclick="closeModal();W.open('Scouting')">Scouting</button>`;
    const colour = clubColour(e);
    return `<div class="gp-profile" ${colour ? `style="--gp-club:${colour}"` : ""}><div class="gp-head">${pixelFace(p, { size: 88, team: club(e), cls: "gp-face" })}<div class="gp-id"><span class="gp-kicker">${esc((e.teamFullLabel || e.teamLabel).trim())}${p.jersey ? ` · #${esc(p.jersey)}` : ""}</span><h2>${esc(p.name)}</h2><p><em class="gp-pos">${esc(p.realPosition || p.pos)}</em>${esc(p.archetype || p.pos)} · Age ${p.age} · ${heightLabel(p)}${e.weight ? ` · ${fmt(e.weight)} lb` : ""}</p><div class="gp-chips">${chips}</div></div><div class="gp-badges">${badge(draft ? "Est. OVR" : "OVR", e.talent.ratingLabel, "rating", e.talent.rating)}${badge(draft ? "Ceiling" : "POT", e.talent.potentialLabel, "potential", e.talent.potential)}</div><button class="gp-x" onclick="closeModal()" aria-label="Close player profile">×</button></div><div class="gp-tabs" role="tablist" aria-label="Profile sections">${tabs}</div><div class="gp-body" role="tabpanel">${content}</div><div class="gp-foot"><div class="gp-actions">${actions}<button class="secondary" onclick="Recruit.toggleShortlist('${p.id}')">${shortlisted(p.id) ? "★ Shortlisted" : "☆ Shortlist"}</button></div><div class="gp-jumps"><span>Open in</span>${jumps}</div></div></div>`;
  }
  function open(id, team) {
    const e = find(id, team);
    if (!e) {
      toast("This player is no longer available in the current database.");
      return;
    }
    hide();
    profile = { id, team: e.team };
    profileTab = "Overview";
    statsPage = 0;
    showProfile();
  }
  function showProfile() {
    const e = find(profile.id, profile.team);
    if (!e) {
      closeModal();
      return;
    }
    const body = document.querySelector("#modal.directory-profile .gp-body"),
      keep = body && document.getElementById("modal").open && shownTab === profileTab ? body.scrollTop : 0;
    shownTab = profileTab;
    modal(profileHTML(e));
    document.getElementById("modal").classList.add("directory-profile");
    const next = document.querySelector("#modal .gp-body");
    if (next && keep) next.scrollTop = keep;
  }
  window.PlayerUI = {
    open,
    peek,
    hide,
    tab(v) {
      profileTab = v;
      showProfile();
    },
    statsPage(n) {
      statsPage = Math.max(0, n | 0);
      showProfile();
    },
    refresh() {
      hide();
      memo = null;
      refresh();
      if (
        profile &&
        document.getElementById("modal").open &&
        document.getElementById("modal").classList.contains("directory-profile")
      )
        showProfile();
    },
    entry: find,
  };
  W.player = open;
  const oldModal = modal;
  modal = function (html) {
    hide();
    document.getElementById("modal").classList.remove("directory-profile");
    oldModal(html);
  };
  const oldClose = closeModal;
  closeModal = function () {
    hide();
    oldClose();
    document.getElementById("modal").classList.remove("directory-profile");
  };
  function decorate(root = document.getElementById("app")) {
    if (!root) return;
    refresh();
    for (const el of root.querySelectorAll(
      'button[onclick*="W.player("],button[onclick*="PlayerUI.open("],button[onclick*="Dev.player("],button[onclick*="CI.rating("]',
    )) {
      const m = el
        .getAttribute("onclick")
        .match(
          /(?:W\.player|PlayerUI\.open|Dev\.player|CI\.rating)\('([^']+)'(?:,\s*(-?\d+))?/,
        );
      if (!m) continue;
      const e = find(m[1], m[2]);
      if (!e || !el.textContent.includes(e.p.name)) continue;
      el.dataset.playerId = e.p.id;
      el.dataset.playerTeam = e.team;
      el.title = "Hover for a player snapshot · click for profile";
    }
    const nameMap = new Map();
    for (const e of entries) {
      if (!nameMap.has(e.p.name)) nameMap.set(e.p.name, e);
      else nameMap.set(e.p.name, null);
    }
    for (const td of root.querySelectorAll("table tbody tr td:first-child")) {
      if (td.querySelector("[data-player-id],button,a,input")) continue;
      const name = (
          td.querySelector("b")?.textContent ||
          [...td.childNodes]
            .filter((n) => n.nodeType === 3)
            .map((n) => n.textContent)
            .join("")
        ).trim(),
        e = nameMap.get(name);
      if (!e) continue;
      td.dataset.playerId = e.p.id;
      td.dataset.playerTeam = e.team;
      td.tabIndex = 0;
      td.classList.add("preview-name-cell");
      td.title = "Hover for snapshot · click for profile";
    }
    for (const table of root.querySelectorAll("table")) {
      const heads = [...(table.tHead?.rows[0]?.cells || [])];
      for (const [i, th] of heads.entries()) {
        const t = th.textContent.toLowerCase().trim(),
          kind = /morale|trust/.test(t)
            ? "morale"
            : /condition|fitness/.test(t)
              ? "condition"
              : /^form$/.test(t)
                ? "form"
                : /^training$/.test(t)
                  ? "training"
                  : /^(ovr|overall|rating)/.test(t)
                    ? "rating"
                    : /^(pot|potential)/.test(t)
                      ? "potential"
                      : null;
        if (!kind) continue;
        for (const tr of table.tBodies[0]?.rows || []) {
          const td = tr.cells[i];
          if (
            !td ||
            td.querySelector("input,button,select") ||
            td.querySelector(".metric-pill")
          )
            continue;
          const n = parseFloat(td.textContent);
          td.dataset.scoreTone = metricTone(
            kind,
            Number.isFinite(n) ? n : null,
          );
        }
      }
    }
  }
  document.addEventListener("pointerover", (e) => {
    const el = e.target.closest("[data-player-id]");
    if (!el || el.contains(e.relatedTarget) || e.pointerType === "touch")
      return;
    clearTimeout(closeTimer);
    clearTimeout(hoverTimer);
    hoverTimer = setTimeout(
      () => peek(el.dataset.playerId, el.dataset.playerTeam, el),
      260,
    );
  });
  document.addEventListener("pointerout", (e) => {
    const el = e.target.closest("[data-player-id]");
    if (!el || el.contains(e.relatedTarget) || card?.contains(e.relatedTarget))
      return;
    clearTimeout(hoverTimer);
    closeTimer = setTimeout(hide, 180);
  });
  document.addEventListener("focusin", (e) => {
    const el = e.target.closest("[data-player-id]");
    if (el) {
      clearTimeout(closeTimer);
      clearTimeout(hoverTimer);
      hoverTimer = setTimeout(
        () => peek(el.dataset.playerId, el.dataset.playerTeam, el),
        260,
      );
    }
  });
  document.addEventListener("focusout", (e) => {
    if (card?.contains(e.relatedTarget)) return;
    clearTimeout(hoverTimer);
    closeTimer = setTimeout(hide, 180);
  });
  document.addEventListener("click", (e) => {
    const cell = e.target.closest(".preview-name-cell");
    if (cell && !e.target.closest("button,a,input"))
      open(cell.dataset.playerId, cell.dataset.playerTeam);
  });
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") {
      hide();
      document
        .querySelectorAll(".finder-filter-menu[open],.action-menu[open]")
        .forEach((d) => (d.open = false));
    }
    const cell = e.target.closest(".preview-name-cell");
    if (cell && (e.key === "Enter" || e.key === " ")) {
      e.preventDefault();
      open(cell.dataset.playerId, cell.dataset.playerTeam);
    }
  });
  let outsideStart = false;
  const dialog = document.getElementById("modal");
  const outside = (e) => {
    const r = dialog.getBoundingClientRect();
    return (
      e.target === dialog &&
      (e.clientX < r.left ||
        e.clientX > r.right ||
        e.clientY < r.top ||
        e.clientY > r.bottom)
    );
  };
  document.addEventListener("pointerdown", (e) => {
    if (card && !card.contains(e.target) && !anchor?.contains(e.target)) hide();
    document
      .querySelectorAll(".finder-filter-menu[open],.action-menu[open]")
      .forEach((d) => {
        if (!d.contains(e.target)) d.open = false;
      });
    outsideStart = dialog.open && outside(e);
  });
  document.addEventListener("pointerup", (e) => {
    if (outsideStart && dialog.open && outside(e)) {
      outsideStart = false;
      if (
        (dialog.classList.contains("career-modal") ||
          dialog.classList.contains("wizard-modal")) &&
        window.Career?.canDismiss?.() === false
      )
        return;
      closeModal();
    }
    outsideStart = false;
  });
  document.addEventListener(
    "scroll",
    (e) => {
      if (card && !card.contains(e.target)) hide();
    },
    true,
  );
  window.addEventListener("resize", () => {
    hide();
    window.Recruit?.fit();
  });
  dialog.addEventListener("close", hide);
  let pending = false;
  new MutationObserver(() => {
    if (pending) return;
    pending = true;
    queueMicrotask(() => {
      pending = false;
      decorate();
    });
  }).observe(document.getElementById("app"), {
    childList: true,
    subtree: true,
  });
  const oldRender = render;
  render = function () {
    ensureMatchState();
    S.migrate(state);
    hide();
    memo = null;
    enrichPlayerBios(state);
    oldRender();
    decorate();
    window.Recruit?.fit();
  };
  decorate();
}
