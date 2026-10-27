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
    profileTab = "Overview";
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
  const facts = (e) =>
    `<div class="preview-facts"><span><small>Age</small><b>${e.p.age}</b></span><span><small>Height</small><b>${heightLabel(e.p)}</b></span><span><small>Weight</small><b>${e.weight ? fmt(e.weight) + " lb" : "—"}</b></span><span><small>Experience</small><b>${e.p.experience ?? "—"} yr</b></span></div>`;
  const readiness = (e) =>
    `<div class="preview-readiness"><span>Morale ${scorePill("morale", e.p.morale, Number.isFinite(e.p.morale) ? fmt(e.p.morale) + "%" : undefined)}</span><span>Condition ${scorePill("condition", e.p.fitness, Number.isFinite(e.p.fitness) ? fmt(e.p.fitness) + "%" : undefined)}</span><span>Form ${scorePill("form", e.stats.form)}</span></div>`;
  function peek(id, team, el) {
    const e = find(id, team);
    if (!e) return;
    hide();
    anchor = el;
    const holder = document.getElementById("modal").open
      ? document.getElementById("modal")
      : document.body;
    card = document.createElement("section");
    card.className = "player-hover-card";
    card.id = "player-hover-card";
    card.setAttribute("role", "dialog");
    card.setAttribute("aria-label", e.p.name + " preview");
    card.innerHTML = `<div class="preview-card-head"><span>${e.pool === "Draft" ? "SCOUTING SNAPSHOT" : "PLAYER SNAPSHOT"}</span><button onclick="PlayerUI.hide()" aria-label="Close player preview">×</button></div><div class="preview-player-identity">${playerFace(e.p)}<div><h3>${esc(e.p.name)}</h3><p>${positionBadge(e.p)} ${esc(e.teamLabel)}</p><small>${esc(e.p.college || "College not recorded")}</small></div></div><div class="preview-ability"><div>${scorePill("rating", e.talent.rating, e.talent.ratingLabel)}<span>${e.pool === "Draft" ? "Estimated ability" : "Overall"}</span></div><div>${scorePill("potential", e.talent.potential, e.talent.potentialLabel)}<span>${e.pool === "Draft" ? "Estimated ceiling" : "Potential"}</span></div><div><b class="${e.p.injury || e.p.holdout ? "negative" : "positive"}">${e.p.injury ? e.p.injury + "w" : e.p.holdout ? "Out" : "Ready"}</b><span>${e.p.injury ? "Injury" : e.p.holdout ? "Holdout" : "Availability"}</span></div></div>${facts(e)}${readiness(e)}${e.pool !== "Draft" ? `<p class="preview-reputation">${Math.round(reputationView(state, e.p).recognition)} reputation · ${reputationView(state, e.p).label}</p>` : ""}<div class="preview-honor">✦ <span>${esc(honorLabel(e))}<small>${e.awards[0]?.kind || "Selected historical honors + this save"}</small></span></div>${e.pool === "Draft" ? `<p class="preview-data-note">${e.talent.confidence}% scouting confidence · ranges are estimates</p>` : ""}<div class="preview-card-actions"><button onclick="PlayerUI.open('${e.p.id}',${e.team})">Open profile ↗</button><button class="secondary" onclick="Recruit.toggleShortlist('${e.p.id}')">${state.franchise.office?.scouting?.shortlist?.includes(e.p.id) ? "★ Shortlisted" : "☆ Shortlist"}</button></div>`;
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
  function profileHTML(e) {
    const p = e.p,
      c = state.franchise.contracts[p.id],
      own = e.team === state.team;
    const data =
      e.pool === "Draft"
        ? "Scouted estimates · " + e.talent.confidence + "% confidence"
        : "Current assessment";
    let content = "";
    if (profileTab === "Attributes")
      content = e.talent.known
        ? `<div class="compact-attribute-grid">${Object.entries(e.attributes)
            .map(
              ([k, v]) =>
                `<div><span>${esc(k.replace(/([A-Z])/g, " $1").replace(/^./, (s) => s.toUpperCase()))}</span>${scorePill("attribute", v)}</div>`,
            )
            .join("")}</div>`
        : '<div class="scout-unknown"><h3>Further scouting required.</h3><p>Individual attributes remain masked until a full report is complete. Use the scouting actions to improve confidence.</p></div>';
    else if (profileTab === "Production") {
      const columns = [
        ["Passing yards", e.stats.passYards],
        ["Pass TD", e.stats.passTD],
        ["Attempts", e.stats.attempts],
        ["Completions", e.stats.completions],
        ["Rushing yards", e.stats.rushYards],
        ["Rush TD", e.stats.rushTD],
        ["Receiving yards", e.stats.recYards],
        ["Receptions", e.stats.receptions],
        ["Receiving TD", e.stats.recTD],
        ["Tackles", e.stats.tackles],
        ["Sacks", e.stats.sacks],
        ["Recorded snaps", e.stats.snaps],
      ];
      content = `<p class="profile-tab-note">${state.year} season production. — indicates no recorded sample.</p><div class="compact-production">${columns.map(([k, v]) => `<div><span>${k}</span><b>${fmt(v)}</b></div>`).join("")}</div>`;
    } else
      content = `${facts(e)}${readiness(e)}${e.pool !== "Draft" ? `<p class="preview-reputation">${Math.round(reputationView(state, e.p).recognition)} reputation · ${reputationView(state, e.p).label}</p>` : ""}<div class="compact-profile-grid"><section><h3>Player information</h3><dl><div><dt>Team / pool</dt><dd>${esc(e.teamLabel)}</dd></div><div><dt>Positions</dt><dd>${esc(p.realPosition || p.pos)}${p.realPosition && p.realPosition !== p.pos ? " · " + p.pos : ""}</dd></div><div><dt>College</dt><dd>${esc(p.college || "—")}</dd></div><div><dt>Roster / role</dt><dd>${e.pool === "Draft" ? "Draft prospect" : esc(p.status || "Free agent")}${p.starter ? " · Starter" : ""}</dd></div><div><dt>Cap / asking base</dt><dd>${Number.isFinite(e.cap) ? "$" + fmt(e.cap, 2) + "M" : "—"}</dd></div><div><dt>Contract through</dt><dd>${e.expiry || "—"}</dd></div></dl></section><section><h3>Honors & development</h3><div class="compact-honors">${
        e.awards
          .slice(0, 4)
          .map(
            (a) =>
              `<div><span>✦</span><b>${a.year} ${esc(a.award)}<small>${esc(a.kind)}</small></b></div>`,
          )
          .join("") || "<p>No honors recorded.</p>"
      }</div><dl><div><dt>Training</dt><dd>${scorePill("training", e.stats.training)}</dd></div><div><dt>Reputation</dt><dd>${Math.round(reputationView(state, p).recognition)} · ${reputationView(state, p).label}</dd></div><div><dt>Current esteem</dt><dd>${reputationView(state, p).esteem} / 99</dd></div><div><dt>Coach trust</dt><dd>${scorePill("morale", p.coachTrust ?? 60, fmt(p.coachTrust ?? 60) + "%")}</dd></div></dl></section></div>`;
    return `<div class="compact-player-profile"><div class="compact-profile-top"><div class="compact-profile-player">${playerFace(p)}<div><span class="eyebrow">${esc(e.teamLabel)} · #${esc(p.jersey || "—")}</span><h2>${esc(p.name)}</h2><p>${positionBadge(p)} ${esc(p.archetype || "")}<small>${data}</small></p></div></div><div class="compact-rating-pair">${scorePill("rating", e.talent.rating, e.talent.ratingLabel)}<small>OVR</small>${scorePill("potential", e.talent.potential, e.talent.potentialLabel)}<small>POT</small></div><button class="icon-button" onclick="closeModal()" aria-label="Close player profile">×</button></div><div class="compact-profile-tabs">${["Overview", "Attributes", "Production"].map((t) => `<button class="${profileTab === t ? "active" : ""}" onclick="PlayerUI.tab('${t}')">${t}</button>`).join("")}</div><div class="compact-profile-body">${content}</div><div class="compact-profile-actions">${own ? `<button onclick="closeModal();Dev.player('${p.id}')">Development & medical</button><button class="secondary" onclick="closeModal();CI.open('player','${p.id}')">Speak with player</button><button class="secondary" onclick="closeModal();F.contract('${p.id}')">Contract</button><button class="secondary" onclick="W.depth('${p.id}')">${p.starter ? "Move to reserve" : "Promote"}</button><details class="action-menu"><summary>More ⌄</summary><div><button onclick="Office.compareToggle('${p.id}',${e.team});closeModal()">Compare player</button><button onclick="Office.morale('${p.id}')">Morale history</button><button onclick="W.move('${p.id}','practice')">Practice squad</button><button onclick="W.move('${p.id}','active')">Active roster</button>${p.injury ? `<button onclick="W.move('${p.id}','ir')">Injured reserve</button>` : ""}<button onclick="closeModal();F.release('${p.id}')">Waive player</button></div></details>` : e.team === -1 ? `<button ${S.allowed(state, "finance") ? "" : "disabled"} onclick="closeModal();F.offer('${p.id}')">Make contract offer</button>` : e.team === -2 ? `<button onclick="Recruit.report('${p.id}')">Scouting report</button>` : `<button onclick="closeModal();W.open('Market')">Trade centre</button>`}<button class="secondary" onclick="Recruit.toggleShortlist('${p.id}')">${state.franchise.office?.scouting?.shortlist?.includes(p.id) ? "★ Shortlisted" : "☆ Shortlist"}</button></div></div>`;
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
    showProfile();
  }
  function showProfile() {
    const e = find(profile.id, profile.team);
    if (!e) {
      closeModal();
      return;
    }
    modal(profileHTML(e));
    document.getElementById("modal").classList.add("directory-profile");
  }
  window.PlayerUI = {
    open,
    peek,
    hide,
    tab(v) {
      profileTab = v;
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
