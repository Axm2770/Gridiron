import * as S from "./state.mjs";
import { textNotice } from "../ui/notice.mjs";
import { pixelFace } from "../ui/pixel-face.mjs";
import { teamColors } from "../presentation/pixel-art.mjs";
import "./fixes.mjs";
import {
  LINEUP_UNITS,
  applyLineupMove,
  canEditUnit,
  lineupBoard,
  lineupSettings,
  lineupSnapshot,
  restoreLineup,
  weakestSlot,
} from "./lineup.mjs";
import { FIELD, formationLayout } from "./lineup-layout.mjs";

// Visual lineup for the Squad and Tactics screens and the matchday Team lineup: a pixel field
// with the unit's formation and a depth panel beside it.
//
// State model: the depth chart (each player's depthPriority + starter flag) is the only source
// of truth. Slots are derived from it on every render (lineupBoard → the engine's buildActors),
// every change goes through one write path (applyLineupMove: replace or trade places) and one
// redraw, so the board, the depth lists, quick sims and the live engine can't disagree.
// UI state here is only what is selected, which position tab and page is open, and the undo stack.

export const VIEW_KEY = "gridiron-lineup-view";
const UNIT_LABELS = { Offense: "Offense", Defense: "Defense", Specialists: "Special teams" };
// Rows per page in the depth panel; the live matchday board is shorter so the page never scrolls.
const PAGE = 7,
  MATCH_PAGE = 4;
const arg = (v) => esc(JSON.stringify(v));
const pct = (n) => Math.round(n ?? 100);
const condTone = (p) => (!p ? "" : p.injury ? "bad" : (p.fitness ?? 100) >= 80 ? "good" : (p.fitness ?? 100) >= 65 ? "warn" : "bad");
const quality = (ovr) => (ovr >= 85 ? "elite" : ovr >= 75 ? "good" : ovr >= 65 ? "avg" : "low");
const pips = (p) => {
  const f = p?.fitness ?? 100,
    n = f >= 90 ? 4 : f >= 75 ? 3 : f >= 60 ? 2 : 1;
  return `<span class="lu-pips cond-${condTone(p)}" aria-hidden="true">${"<i></i>".repeat(n)}${"<i class=off></i>".repeat(4 - n)}</span>`;
};
const lastName = (p) => String(p.name || "").split(" ").slice(1).join(" ") || p.name || "";
const focusQuiet = (el) => {
  try {
    el?.focus?.({ preventScroll: true });
  } catch {
    el?.focus?.();
  }
};

// Per-device choice between the visual lineup and the table, per screen.
export function viewMode(screen) {
  try {
    const v = JSON.parse(globalThis.localStorage?.getItem(VIEW_KEY) || "{}")?.[screen];
    return v === "table" ? "table" : "lineup";
  } catch {
    return "lineup";
  }
}
function storeViewMode(screen, mode) {
  try {
    const all = JSON.parse(globalThis.localStorage?.getItem(VIEW_KEY) || "{}") || {};
    all[screen] = mode;
    globalThis.localStorage?.setItem(VIEW_KEY, JSON.stringify(all));
  } catch {}
}

// Field positions (percent of the field box, token top-left) for each slot.
export function slotPositions(actors, unit, m = {}) {
  const tokens = formationLayout(actors, unit, m).tokens;
  return actors.map((a, i) => ({ ...a, left: tokens[i].left, top: tokens[i].top, label: tokens[i].label }));
}

function schemeOf(unit, m) {
  if (unit === "Offense") return [m.offense || "Shotgun spread", `${m.personnel || "11"}${m.personnel === "Goal Line" ? "" : " personnel"}`];
  if (unit === "Defense") return [m.defense || "Nickel", `${m.shell || "2-High"} shell`];
  return ["Special teams", "Kicker · punter"];
}

// One controller per page (the Squad/Tactics board and the matchday board share it).
let controller = null;
export function lineupController({ isBusy } = {}) {
  controller ??= createController([]);
  if (isBusy && !controller.busyChecks.includes(isBusy)) controller.busyChecks.push(isBusy);
  if (typeof window !== "undefined") window.Lineup = controller;
  return controller;
}

function createController(busyChecks) {
  let unit = "Offense",
    sel = null, // { index, id, role }
    suggested = null,
    posTab = null,
    page = 0,
    error = "",
    flash = [],
    undoStack = [],
    last = { screen: "squad", opts: {} },
    working = false;
  const locked = () => busyChecks.some((f) => f()) || (typeof animating !== "undefined" && animating);
  const editable = () => canEditUnit(state, unit) && !state.live?.finished;
  const fingerprint = () => JSON.stringify(lineupSnapshot(state));

  // Redraw: data changes go through the screen's own render (the matchday modal redraws its
  // dialog); selection/tab/page changes patch just the board in place, so nothing else on the
  // page re-renders, flickers or jumps.
  function redraw(full, focusSel) {
    const el = typeof document !== "undefined" ? document.querySelector?.("[data-lu-board]") : null;
    if (!full && el && el.outerHTML !== undefined) {
      const html = board(last.screen, last.opts);
      const tpl = document.createElement("template");
      tpl.innerHTML = html;
      el.replaceWith(tpl.content.firstElementChild || tpl.content);
    } else if (last.opts.redraw) last.opts.redraw();
    else if (typeof render === "function") render();
    if (focusSel) (globalThis.requestAnimationFrame || setTimeout)(() => focusQuiet(document.querySelector?.(focusSel)));
  }

  // The one write path: put player `id` into `slot` (replace, or trade places with a teammate).
  function move(slot, id) {
    if (working) return;
    if (locked()) {
      toast("Wait for the current play or simulation to finish.");
      return;
    }
    let result = null;
    const before = lineupSnapshot(state);
    working = true;
    try {
      state = S.transact(state, (s) => {
        result = applyLineupMove(s, unit, slot, id);
      });
    } catch (e) {
      error = e.message;
      working = false;
      redraw(false);
      return;
    }
    working = false;
    sel = null;
    suggested = null;
    error = "";
    if (result.kind === "none") {
      redraw(false, `[data-lu-slot="${slot}"]`);
      return;
    }
    undoStack.push({ unit, before, after: fingerprint() });
    undoStack = undoStack.slice(-10);
    const other = lineupBoard(state, unit).actors.find((a) => a.p && result.outgoing && a.id === result.outgoing.id);
    flash = [slot, other?.index].filter((n) => Number.isInteger(n));
    save();
    redraw(true, `[data-lu-slot="${slot}"]`);
    flash = [];
    toast(
      result.kind === "swap"
        ? `${result.incoming.name} and ${result.outgoing.name} trade places at ${result.incoming.pos}.`
        : `${result.incoming.name} is in the lineup at ${result.incoming.pos}${result.outgoing ? `, replacing ${result.outgoing.name}` : ""}.`,
    );
  }

  function undo() {
    const top = undoStack.at(-1);
    if (!top || locked()) return;
    if (top.after !== fingerprint()) {
      undoStack = [];
      toast("The depth chart changed elsewhere since that edit, so there is nothing to undo.");
      redraw(false);
      return;
    }
    undoStack.pop();
    try {
      state = S.transact(state, (s) => restoreLineup(s, top.before));
    } catch (e) {
      error = e.message;
      redraw(false);
      return;
    }
    unit = top.unit;
    sel = null;
    error = "";
    save();
    redraw(true);
    toast("Last lineup change undone.");
  }

  // ---------- markup ----------
  function token(t, a, team) {
    const p = a.p,
      isSel = sel?.index === a.index,
      label = p
        ? `Select ${p.name} at ${a.role} (${t.label}): number ${p.jersey ?? "unknown"}, ${p.ovr} overall, condition ${pct(p.fitness)}%.${isSel ? " Selected." : ""}`
        : `Select vacant ${t.label} slot. Assign a player.`;
    return `<button type="button" class="lu-tok ${p ? "q-" + quality(p.ovr) + " cond-" + condTone(p) : "vacant"}${isSel ? " selected" : ""}${sel && !isSel && sel.role === a.role && a.p && editable() ? " lu-can-swap" : ""}${flash.includes(a.index) ? " flash" : ""}" style="left:${t.left}%;top:${t.top}%;width:${t.width}%;height:${t.height}%" data-lu-slot="${a.index}" data-lu-role="${a.role}" data-x="${t.x.toFixed(1)}" data-y="${t.y.toFixed(1)}" ${p ? `data-lu-player="${esc(p.id)}" data-lu-drag` : ""} aria-pressed="${isSel}" aria-label="${esc(label)}" onclick="Lineup.select(${a.index})">${
      p
        ? `<span class="lu-tok-top"><span class="lu-face">${pixelFace(p, { size: 40, team, label: "" })}</span><span class="lu-num">${esc(p.jersey ?? "–")}</span></span><span class="lu-tok-name">${esc(lastName(p))}</span><span class="lu-tok-meta"><i>${t.label}</i><b class="lu-ovr">${p.ovr}</b></span>${pips(p)}`
        : `<span class="lu-tok-top"><span class="lu-face lu-face-empty">+</span></span><span class="lu-tok-name">Vacant</span><span class="lu-tok-meta"><i>${t.label}</i></span>`
    }</button>`;
  }

  function turf(unit, m, team) {
    const live = state.live && !state.live.finished ? state.live : null,
      offView = unit !== "Defense",
      toGo = live ? Math.min(10, Math.max(1, live.toGo || 10)) : 10,
      fdTop = FIELD.los - toGo * 0.75,
      yards = [];
    for (let y = FIELD.los + FIELD.row, n = 1; y < FIELD.zone - 1; y += FIELD.row, n++) yards.push([y, n]);
    const crest = typeof logo === "function" ? logo(team) : "",
      name = clubs[team]?.[2] || "",
      down = live ? `${["1ST", "2ND", "3RD", "4TH"][Math.max(0, (live.down || 1) - 1)] || "1ST"} & ${live.goal ? "GOAL" : toGo}` : "1ST & 10",
      ball = live && typeof fieldPosition === "function" ? ` · ${fieldPosition(live)}` : "";
    return `<span class="lu-turf" aria-hidden="true"></span><span class="lu-sideline left" aria-hidden="true">${yards.map(([y, n]) => (n % 2 ? "" : `<b style="top:${((y / FIELD.H) * 100).toFixed(2)}%">${n * 5 >= 50 ? 50 : 50 - n * 5}</b>`)).join("")}</span><span class="lu-sideline right" aria-hidden="true">${yards.map(([y, n]) => (n % 2 ? "" : `<b style="top:${((y / FIELD.H) * 100).toFixed(2)}%">${n * 5 >= 50 ? 50 : 50 - n * 5}</b>`)).join("")}</span>${yards.map(([y]) => `<span class="lu-yard" style="top:${((y / FIELD.H) * 100).toFixed(2)}%" aria-hidden="true"></span>`).join("")}<span class="lu-hash l" aria-hidden="true"></span><span class="lu-hash r" aria-hidden="true"></span>${offView && unit === "Offense" ? `<span class="lu-fd" style="top:${((fdTop / FIELD.H) * 100).toFixed(2)}%" aria-hidden="true"></span>` : ""}<span class="lu-los" style="top:${((FIELD.los / FIELD.H) * 100).toFixed(2)}%" aria-hidden="true"></span><span class="lu-tag lu-tag-los" style="top:${(((FIELD.los - 3.4) / FIELD.H) * 100).toFixed(2)}%">LOS${esc(ball)}</span><span class="lu-tag lu-tag-dir" style="top:${(((FIELD.los - 3.4) / FIELD.H) * 100).toFixed(2)}%">${unit === "Defense" ? "▼ DEFEND" : unit === "Offense" ? "▲ ATTACK · " + down : "KICKING UNIT"}</span><span class="lu-endzone" style="top:${((FIELD.zone / FIELD.H) * 100).toFixed(2)}%">${crest ? `<span class="lu-crest">${crest}</span>` : ""}<b>${esc(name)}</b>${crest ? `<span class="lu-crest">${crest}</span>` : ""}</span>`;
  }

  function sidePanel(b, labels, can) {
    const groups = b.positions,
      tab = groups.find((g) => g.pos === posTab) || groups[0];
    if (!tab) return "";
    const selActor = sel ? b.actors[sel.index] : null,
      cur = selActor?.p,
      slotLabel = (i) => labels[i] || b.actors[i]?.role,
      picking = selActor && selActor.role === tab.pos,
      // Picking a replacement: the current occupant, then bench players best fit first (OVR,
      // then condition), then teammates he could trade places with. Otherwise: depth order.
      fit = (x, y) => y.p.ovr - x.p.ovr || (y.p.fitness ?? 100) - (x.p.fitness ?? 100),
      healthyRows = tab.depth.map(({ p, rank, slot }) => ({ p, rank, slot, out: "" })),
      ordered = picking
        ? [
            ...healthyRows.filter((r) => r.slot === sel.index),
            ...healthyRows.filter((r) => r.slot === null).sort(fit),
            ...healthyRows.filter((r) => r.slot !== null && r.slot !== sel.index),
          ]
        : healthyRows,
      rows = [
        ...ordered,
        ...tab.unavailable.map(({ p, reason }) => ({ p, rank: p.injury ? "✚" : "–", slot: null, out: reason })),
      ],
      per = last.screen === "match" ? MATCH_PAGE : PAGE,
      pages = Math.max(1, Math.ceil(rows.length / per));
    page = Math.min(page, pages - 1);
    const shown = rows.slice(page * per, page * per + per),
      pickingHere = picking;
    const row = ({ p, rank, slot, out }) => {
      const onField = slot !== null,
        mine = onField && sel?.index === slot,
        action = out ? "" : pickingHere ? (mine ? "Current" : onField ? "Trade" : "Swap in") : onField ? slotLabel(slot) : "Bench",
        delta = pickingHere && cur && !mine ? p.ovr - cur.ovr : null,
        deltaChip = delta === null ? "" : `<i class="lu-delta ${delta > 0 ? "up" : delta < 0 ? "down" : "even"}" title="OVR versus ${esc(cur.name)}">${delta > 0 ? "+" : delta < 0 ? "−" : "±"}${Math.abs(delta)}</i>`,
        tone = out ? "out" : mine ? "mine" : onField ? "on-field" : "bench";
      if (out)
        return `<li><div class="lu-row out" aria-disabled="true"><span class="lu-rank">${rank}</span>${pixelFace(p, { size: 28, team: state.team, label: "" })}<span class="lu-row-name"><b>${esc(p.name)}</b><small>${esc(out)}</small></span><b class="lu-ovr q-${quality(p.ovr)}">${p.ovr}</b><em class="lu-row-tag bad">${p.injury ? "Injured" : "Out"}</em></div></li>`;
      return `<li><button type="button" class="lu-row ${tone}${suggested === p.id ? " suggested" : ""}" data-lu-player="${esc(p.id)}" data-lu-pos="${p.pos}" data-lu-at="${onField ? slot : ""}" ${can ? "data-lu-drag" : ""} ${!can && !onField ? "disabled" : ""} aria-label="${esc(`${p.name}, ${p.ovr} overall, condition ${pct(p.fitness)}%, depth ${rank}. ${pickingHere && !mine ? (onField ? "Trade places with the selected slot." : "Put him in the selected slot.") : onField ? "On the field at " + slotLabel(slot) + "." : "Bench. Choose a slot for him."}`)}" onclick="Lineup.row(${arg(p.id)})"><span class="lu-rank">${rank}</span>${pixelFace(p, { size: 28, team: state.team, label: "" })}<span class="lu-row-name"><b>${esc(p.name)}</b><small>#${esc(p.jersey ?? "–")} · <span class="cond-${condTone(p)}">${pct(p.fitness)}%</span> · ${p.age} yrs${p.status === "elevated" ? " · elevated" : ""}</small></span><span class="lu-ovr-cell"><b class="lu-ovr q-${quality(p.ovr)}">${p.ovr}</b>${deltaChip}</span><em class="lu-row-tag ${tone}">${esc(action)}</em></button></li>`;
    };
    const head = cur
      ? `<div class="lu-sel has-face">${pixelFace(cur, { size: 44, team: state.team, label: "" })}<div><span class="lu-kicker">Replacing · ${esc(slotLabel(sel.index))}</span><h3 tabindex="-1" data-lu-focus>${esc(cur.name)}</h3><span class="lu-sel-stats"><b class="lu-ovr q-${quality(cur.ovr)}">${cur.ovr}</b>${pips(cur)}<small>${pct(cur.fitness)}% cond · ${pct(cur.morale ?? 75)}% morale</small></span><button type="button" class="link" onclick="W.player(${arg(cur.id)})">Profile →</button></div><button type="button" class="secondary small" onclick="Lineup.close()">Cancel</button></div>`
      : selActor
        ? `<div class="lu-sel"><div><span class="lu-kicker">Filling · ${esc(slotLabel(sel.index))}</span><h3 tabindex="-1" data-lu-focus>Vacant slot</h3><small>Pick a healthy ${selActor.role} below.</small></div><button type="button" class="secondary small" onclick="Lineup.close()">Cancel</button></div>`
        : `<div class="lu-sel idle"><div><span class="lu-kicker">${esc(tab.pos)} depth order</span><small>${tab.slots} on the field · ${tab.depth.length} healthy${tab.unavailable.length ? ` · ${tab.unavailable.length} out` : ""}</small></div></div>`;
    return `<div class="lu-side" role="region" aria-label="Depth chart">${
      groups.length > 1
        ? `<div class="lu-pos-tabs" role="tablist" aria-label="Position">${groups
            .map((g) => `<button type="button" role="tab" aria-selected="${g === tab}" class="${g === tab ? "active" : ""}" onclick="Lineup.tab('${g.pos}')">${g.pos}<small>${g.slots}</small></button>`)
            .join("")}</div>`
        : ""
    }${head}${error ? textNotice(error, { cls: "lu-notice" }) : ""}${
      editable() ? "" : `<p class="lu-note">${state.live?.finished ? "The game has finished. Review the result before changing personnel." : `In your ${esc(state.franchise.role)} role the ${UNIT_LABELS[unit].toLowerCase()} depth chart belongs to another coach.`}</p>`
    }<div class="lu-label">${pickingHere ? "Available replacements" : "Depth order"} <span>${rows.length}</span></div><ol class="lu-rows">${shown.map(row).join("") || `<li class="lu-empty">Nobody at ${tab.pos}.</li>`}</ol>${
      pages > 1
        ? `<div class="lu-pager"><button type="button" class="secondary small" onclick="Lineup.page(-1)" ${page ? "" : "disabled"} aria-label="Previous page">◀ Prev</button><span>${page + 1} / ${pages}</span><button type="button" class="secondary small" onclick="Lineup.page(1)" ${page < pages - 1 ? "" : "disabled"} aria-label="Next page">Next ▶</button></div>`
        : ""
    }</div>`;
  }

  function board(screen = "squad", opts = {}) {
    last = { screen, opts };
    const b = lineupBoard(state, unit),
      m = lineupSettings(state),
      layout = formationLayout(b.actors, unit, m),
      labels = layout.tokens.map((t) => t.label),
      team = state.team,
      can = editable() && !locked();
    // Keep the selection on the same player (or at least the same position) when the
    // formation or personnel changes underneath it; otherwise drop it.
    if (sel) {
      const same = sel.id ? b.actors.find((a) => a.p && a.id === sel.id) : null,
        at = b.actors[sel.index];
      if (same) sel = { index: same.index, id: same.id, role: same.role };
      else sel = !sel.id && at && at.role === sel.role && !at.p ? sel : null;
      if (!sel) suggested = null;
    }
    if (!posTab || !LINEUP_UNITS[unit].includes(posTab)) posTab = LINEUP_UNITS[unit][0];
    if (sel) posTab = sel.role;
    const colors = teamColors(team),
      [formation, personnel] = schemeOf(unit, m),
      healthy = b.actors.filter((a) => a.p),
      avg = Math.round(healthy.reduce((n, a) => n + (a.p.fitness ?? 100), 0) / Math.max(1, healthy.length)),
      canDepth = S.allowed(state, "coach") || S.allowed(state, "roster");
    return `<section class="panel lu-board${can ? "" : " readonly"}" data-lu-board="${screen}" data-unit="${unit}" style="--lu-team:${colors.primary};--lu-team-2:${colors.secondary};--lu-team-3:${colors.dark}" aria-label="Visual lineup"><div class="lu-bar"><div class="lu-units" role="tablist" aria-label="Unit">${Object.keys(LINEUP_UNITS)
      .map((u) => `<button type="button" role="tab" class="${unit === u ? "active" : ""}" aria-selected="${unit === u}" onclick="Lineup.unit('${u}')">${UNIT_LABELS[u]}</button>`)
      .join("")}</div>${opts.head || `<div class="lu-title"><b>${esc(formation)}</b><span>${esc(personnel)}</span></div>`}<span class="lu-meta"><b>${b.filled}/${b.actors.length}</b> set · <b>${avg}%</b> cond</span><button type="button" class="secondary small lu-undo" onclick="Lineup.undo()" ${undoStack.length && !locked() ? "" : "disabled"} title="Undo the last lineup change">↶ Undo</button>${
      screen === "tactics" ? `<button type="button" class="secondary small" onclick="F.depth()" ${canDepth && !locked() ? "" : "disabled"}>Optimize depth</button>` : ""
    }${opts.tools || ""}</div><div class="lu-layout"><div class="lu-pitch"><div class="lu-field" role="group" aria-label="${UNIT_LABELS[unit]} formation: ${esc(formation)} · ${esc(personnel)}">${turf(unit, m, team)}${layout.tokens
      .map((t, i) => token(t, b.actors[i], team))
      .join("")}</div><ol class="lu-slot-list" aria-label="${UNIT_LABELS[unit]} slots">${b.actors
      .map((a, i) => {
        const p = a.p;
        return `<li><button type="button" class="lu-slot-row ${sel?.index === a.index ? "selected" : ""}" data-lu-slot="${a.index}" data-lu-role="${a.role}" aria-pressed="${sel?.index === a.index}" onclick="Lineup.select(${a.index})"><span class="lu-pos-tag">${labels[i]}</span>${p ? pixelFace(p, { size: 28, team, label: "" }) : '<span class="lu-face-empty">+</span>'}<span class="lu-row-name">${p ? `<b>${esc(p.name)}</b><small>#${esc(p.jersey ?? "–")} · ${pct(p.fitness)}% condition</small>` : "<b>Vacant</b><small>Assign a player</small>"}</span>${p ? `<b class="lu-ovr q-${quality(p.ovr)}">${p.ovr}</b>` : "<b>—</b>"}</button></li>`;
      })
      .join("")}</ol><p class="lu-note">Click a player, then a replacement — or drag one onto another. Same-position starters trade places. Esc cancels. Used from the next snap and the next game.</p></div>${sidePanel(b, labels, can)}</div></section>`;
  }

  // ---------- actions ----------
  const api = {
    board,
    unit(u) {
      if (!LINEUP_UNITS[u]) return;
      unit = u;
      sel = null;
      suggested = null;
      posTab = null;
      page = 0;
      error = "";
      redraw(false);
    },
    setUnit(u) {
      if (LINEUP_UNITS[u] && u !== unit) {
        unit = u;
        sel = null;
        suggested = null;
        posTab = null;
        page = 0;
      }
      error = "";
    },
    current: () => ({ unit, selected: sel?.index ?? null }),
    select(i) {
      const b = lineupBoard(state, unit),
        a = b.actors[i];
      if (!a) return;
      // A second slot at the same position while one is selected: trade places.
      if (sel && sel.index !== i && sel.role === a.role && a.p && b.actors[sel.index]?.p && editable()) {
        move(sel.index, a.id);
        return;
      }
      sel = sel?.index === i ? null : { index: i, id: a.p ? a.id : null, role: a.role };
      suggested = null;
      error = "";
      page = 0;
      redraw(false, sel ? `[data-lu-slot="${i}"]` : `[data-lu-slot="${i}"]`);
    },
    close() {
      const was = sel?.index;
      sel = null;
      suggested = null;
      error = "";
      redraw(false, Number.isInteger(was) ? `[data-lu-slot="${was}"]` : null);
    },
    // A row in the depth panel: fill the selected slot, open his own slot, or (bench player)
    // open the slot he would most likely take with him highlighted.
    row(id) {
      const p = state.roster.find((q) => q.id === id);
      if (!p) return;
      const b = lineupBoard(state, unit),
        on = b.actors.find((a) => a.p && a.id === id);
      if (sel && sel.role === p.pos) {
        if (on && on.index === sel.index) return api.close();
        move(sel.index, id);
        return;
      }
      if (on) return api.select(on.index);
      const slot = weakestSlot(state, unit, id);
      if (slot === null) {
        toast("This formation has no slot for his position.");
        return;
      }
      if (suggested === id && sel?.index === slot) return move(slot, id);
      sel = { index: slot, id: b.actors[slot]?.p ? b.actors[slot].id : null, role: p.pos };
      suggested = id;
      error = "";
      const bench = (b.positions.find((g) => g.pos === p.pos)?.depth || []).filter((r) => r.slot === null).sort((x, y) => y.p.ovr - x.p.ovr || (y.p.fitness ?? 100) - (x.p.fitness ?? 100)),
        at = bench.findIndex((r) => r.p.id === id) + (b.actors[slot]?.p ? 1 : 0);
      page = Math.max(0, Math.floor(at / (last.screen === "match" ? MATCH_PAGE : PAGE)));
      redraw(false, `.lu-row.suggested`);
    },
    assign(id) {
      if (sel) move(sel.index, id);
    },
    move,
    undo,
    tab(pos) {
      posTab = pos;
      page = 0;
      if (sel && sel.role !== pos) sel = null;
      redraw(false, `.lu-pos-tabs .active`);
    },
    page(d) {
      page = Math.max(0, page + d);
      redraw(false, d > 0 ? `.lu-pager button:last-child` : `.lu-pager button:first-child`);
    },
    view(screen, mode) {
      storeViewMode(screen, mode === "table" ? "table" : "lineup");
      sel = null;
      if (typeof render === "function") render();
    },
    locked,
    editable,
    busyChecks,
    // Back-compat with the old HTML5 drag handlers (no longer emitted).
    drag() {},
    over(e) {
      e?.preventDefault?.();
    },
    leave() {},
    drop(e) {
      e?.preventDefault?.();
    },
  };
  if (typeof window !== "undefined") window.Lineup = api;
  installPointerDrag(api);
  return api;
}

// ---------- pointer drag & drop ----------
// Pointer events on the document (so a re-render mid-drag can't orphan the drag), a 6px
// threshold (mouse/pen) or a long press (touch) before a drag starts, a pixel ghost that
// follows the pointer, hit-testing with elementFromPoint (viewport coordinates, so CSS zoom and
// --ui-scale don't matter), highlighted valid targets, drop elsewhere or Escape to cancel.
export function dropTargetValid(src, target) {
  if (!src || !target || !src.id) return false;
  if (target.kind === "slot") return target.role === src.pos && target.index !== src.at && !(target.player && target.player === src.id);
  if (target.kind === "row") return target.pos === src.pos && target.player !== src.id && (src.at !== null || target.at !== null);
  return false;
}
// What dropping `src` on `target` does: { slot, id } for applyLineupMove.
export function dropMove(src, target) {
  if (!dropTargetValid(src, target)) return null;
  if (target.kind === "slot") return { slot: target.index, id: src.id };
  if (target.at !== null) return { slot: target.at, id: src.id };
  return { slot: src.at, id: target.player };
}
const describe = (el) => {
  if (!el) return null;
  if (el.matches?.("[data-lu-slot].lu-tok"))
    return { kind: "slot", index: Number(el.dataset.luSlot), role: el.dataset.luRole, player: el.dataset.luPlayer || null };
  if (el.matches?.(".lu-row[data-lu-player]")) return { kind: "row", player: el.dataset.luPlayer, pos: el.dataset.luPos, at: el.dataset.luAt === "" ? null : Number(el.dataset.luAt) };
  return null;
};
function sourceOf(el) {
  const t = describe(el);
  if (!t) return null;
  if (t.kind === "slot") return t.player ? { id: t.player, pos: t.role, at: t.index } : null;
  return { id: t.player, pos: t.pos, at: t.at };
}

function installPointerDrag(api) {
  if (typeof document === "undefined" || !document.addEventListener || globalThis.__luPointer) return;
  globalThis.__luPointer = true;
  let pending = null,
    drag = null,
    swallowClick = false;
  const reduce = () => globalThis.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches;
  const targets = () => [...document.querySelectorAll("[data-lu-board] .lu-tok[data-lu-slot], [data-lu-board] .lu-row[data-lu-player]")];
  const decorate = () => {
    const board = document.querySelector("[data-lu-board]");
    board?.classList.add("lu-dragging");
    for (const el of targets()) {
      const ok = dropTargetValid(drag.src, describe(el));
      el.classList.toggle("lu-drop-ok", ok);
      el.classList.toggle("lu-drag-src", !!(drag.src.at !== null ? el.dataset.luSlot === String(drag.src.at) && el.classList.contains("lu-tok") : el.dataset.luPlayer === drag.src.id));
    }
  };
  const clear = () => {
    document.querySelector("[data-lu-board]")?.classList.remove("lu-dragging");
    for (const el of document.querySelectorAll(".lu-drop-ok, .lu-drop-over, .lu-drag-src")) el.classList.remove("lu-drop-ok", "lu-drop-over", "lu-drag-src");
  };
  const end = () => {
    if (pending?.timer) clearTimeout(pending.timer);
    pending = null;
    if (drag) {
      drag.ghost?.remove();
      drag = null;
      clear();
    }
  };
  const ghostFor = (el) => {
    const g = document.createElement("div");
    g.className = "lu-ghost" + (reduce() ? " still" : "");
    g.setAttribute("aria-hidden", "true");
    const face = el.querySelector(".gd-pixel-face")?.outerHTML || "",
      name = el.querySelector(".lu-tok-name, .lu-row-name b")?.textContent || "",
      num = el.querySelector(".lu-num")?.textContent || "",
      ovr = el.querySelector(".lu-ovr")?.textContent || "";
    g.innerHTML = `<span class="lu-ghost-face">${face}</span><span class="lu-ghost-text"><b>${esc(name.split(" ").at(-1))}</b><small>${esc(num ? "#" + num + " · " : "")}${esc(ovr)}</small></span>`;
    document.body.appendChild(g);
    return g;
  };
  const place = (x, y) => {
    if (drag?.ghost) drag.ghost.style.transform = `translate(${Math.round(x + 10)}px, ${Math.round(y + 10)}px)`;
  };
  const start = (e) => {
    if (!pending) return;
    if (api.locked() || !api.editable()) {
      toast(api.locked() ? "Wait for the current play or simulation to finish." : "This depth chart belongs to another coach in your role.");
      end();
      return;
    }
    const src = sourceOf(pending.el);
    if (!src) return end();
    drag = { src, ghost: ghostFor(pending.el), over: null, pointerId: pending.pointerId };
    try {
      pending.el.setPointerCapture?.(pending.pointerId);
    } catch {}
    pending = null;
    decorate();
    place(e.clientX, e.clientY);
  };
  document.addEventListener("pointerdown", (e) => {
    if (e.button !== 0 || drag) return;
    const el = e.target?.closest?.("[data-lu-board] [data-lu-drag]");
    if (!el || el.disabled) return;
    pending = { el, x: e.clientX, y: e.clientY, pointerId: e.pointerId, touch: e.pointerType === "touch" };
    if (pending.touch) pending.timer = setTimeout(() => pending && start({ clientX: pending.x, clientY: pending.y }), 320);
  });
  document.addEventListener("pointermove", (e) => {
    if (pending && !drag) {
      const d = Math.hypot(e.clientX - pending.x, e.clientY - pending.y);
      if (pending.touch) {
        if (d > 8) end(); // a swipe: let the page scroll
      } else if (d > 6) start(e);
      return;
    }
    if (!drag) return;
    place(e.clientX, e.clientY);
    if (!document.querySelector(".lu-drop-ok") && !document.querySelector(".lu-drag-src")) decorate(); // the board re-rendered mid-drag
    const hit = document.elementFromPoint?.(e.clientX, e.clientY)?.closest?.("[data-lu-board] .lu-tok[data-lu-slot], [data-lu-board] .lu-row[data-lu-player]");
    const ok = hit && dropTargetValid(drag.src, describe(hit)) ? hit : null;
    if (drag.over !== ok) {
      drag.over?.classList?.remove("lu-drop-over");
      ok?.classList.add("lu-drop-over");
      drag.over = ok;
    }
    drag.ghost.classList.toggle("bad", !ok);
  });
  document.addEventListener("pointerup", (e) => {
    if (pending) {
      end();
      return;
    }
    if (!drag) return;
    const hit = document.elementFromPoint?.(e.clientX, e.clientY)?.closest?.("[data-lu-board] .lu-tok[data-lu-slot], [data-lu-board] .lu-row[data-lu-player]"),
      mv = dropMove(drag.src, describe(hit));
    swallowClick = true;
    setTimeout(() => (swallowClick = false), 0);
    end();
    if (mv) api.move(mv.slot, mv.id);
  });
  document.addEventListener("pointercancel", end);
  globalThis.addEventListener?.("blur", end);
  // While a touch drag is active the page must not scroll.
  document.addEventListener(
    "touchmove",
    (e) => {
      if (drag) e.preventDefault();
    },
    { passive: false },
  );
  document.addEventListener(
    "click",
    (e) => {
      if (!swallowClick) return;
      swallowClick = false;
      e.stopPropagation();
      e.preventDefault();
    },
    true,
  );
  document.addEventListener("contextmenu", (e) => {
    if (drag || pending?.touch) e.preventDefault();
  });
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && (drag || pending)) {
      e.preventDefault();
      e.stopPropagation();
      end();
      return;
    }
    const inBoard = e.target?.closest?.("[data-lu-board]");
    if (!inBoard) return;
    if (e.key === "Escape" && api.current().selected !== null) {
      e.preventDefault();
      e.stopPropagation();
      api.close();
      return;
    }
    // Arrow keys move between players on the field, by position on the grid.
    const tok = e.target.closest?.(".lu-tok");
    if (!tok || !["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(e.key)) return;
    e.preventDefault();
    const x0 = +tok.dataset.x,
      y0 = +tok.dataset.y,
      [dx, dy] = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] }[e.key];
    let best = null,
      bestScore = Infinity;
    for (const el of inBoard.querySelectorAll(".lu-tok")) {
      if (el === tok) continue;
      const vx = +el.dataset.x - x0,
        vy = +el.dataset.y - y0,
        along = vx * dx + vy * dy;
      if (along <= 0.5) continue;
      const score = along + 2.5 * Math.abs(vx * dy + vy * dx);
      if (score < bestScore) [best, bestScore] = [el, score];
    }
    focusQuiet(best);
  });
}

export function installLineupUI({ isBusy = () => false } = {}) {
  if (typeof document !== "undefined" && document.head && !document.querySelector?.('link[href="lineup.css"]'))
    document.head.insertAdjacentHTML?.("beforeend", '<link rel="stylesheet" href="lineup.css">');
  const ctl = lineupController({ isBusy });
  const board = (screen) => ctl.board(screen);

  const toggle = (screen) => {
    const mode = viewMode(screen);
    return `<div class="lu-view-toggle" role="group" aria-label="Lineup or table view">${[
      ["lineup", "▦ Lineup"],
      ["table", "☷ Table"],
    ]
      .map(([v, l]) => `<button type="button" class="${mode === v ? "active" : ""}" aria-pressed="${mode === v}" onclick="Lineup.view('${screen}','${v}')">${l}</button>`)
      .join("")}</div>`;
  };

  // Depth chart as a table for the Tactics screen. Rows are in depth order, so header sorting is off.
  function depthTable() {
    const rows = Object.keys(LINEUP_UNITS)
      .flatMap((u) =>
        lineupBoard(state, u).positions.flatMap((g) => [
          ...g.depth.map(({ p, rank, slot }) => ({ p, rank, status: slot !== null ? "On field" : "Bench", tone: slot !== null ? "good" : "" })),
          ...g.unavailable.map(({ p, reason }) => ({ p, rank: "—", status: reason, tone: "bad" })),
        ]),
      )
      .map(
        ({ p, rank, status, tone }) =>
          `<tr><td><span class="lu-pos-tag">${p.pos}</span></td><td>${rank}</td><td><button type="button" class="link" onclick="W.player(${arg(p.id)})">${esc(p.name)}</button><small> #${esc(p.jersey ?? "–")}</small></td><td><b>${p.ovr}</b></td><td class="cond-${condTone(p)}">${pct(p.fitness)}%</td><td>${pct(p.morale ?? 75)}%</td><td>${p.starter ? "Starter" : "Reserve"}</td><td><span class="lu-status ${tone}">${esc(status)}</span></td></tr>`,
      )
      .join("");
    return `<section class="panel lu-table"><div class="scroll"><table class="office-data-table" data-no-sort="true"><thead><tr><th>Pos</th><th>Depth</th><th>Player</th><th>OVR</th><th>Condition</th><th>Morale</th><th>Role</th><th>Lineup</th></tr></thead><tbody>${rows}</tbody></table></div><p class="lu-note">Rows follow the depth order used in games. Switch to Lineup to change it.</p></section>`;
  }
  function tacticsSection() {
    const mode = viewMode("tactics");
    return `<section class="lu-tactics"><div class="lu-section-head"><div><span class="gd-eyebrow">Depth chart</span><h2>Starting lineup</h2></div>${toggle("tactics")}</div>${mode === "lineup" ? ctl.board("tactics") : depthTable()}</section>`;
  }

  // Tactics is the legacy "Game plan" route, whose renderer (window.plan) is replaced after this
  // module installs; wrap whichever renderer is current just before each render.
  const wrapPlan = () => {
    const base = window.plan;
    if (typeof base !== "function" || base.__lineup) return;
    const wrapped = function (...args) {
      const html = String(base.apply(this, args));
      return /<\/div>\s*$/.test(html) ? html.replace(/<\/div>\s*$/, tacticsSection() + "</div>") : html + tacticsSection();
    };
    wrapped.__lineup = true;
    window.plan = wrapped;
  };
  if (typeof render === "function") {
    const previousRender = render;
    render = function (...args) {
      wrapPlan();
      return previousRender.apply(this, args);
    };
  }
  wrapPlan();

  return { board, toggle, mode: viewMode, depthTable, tacticsSection };
}
