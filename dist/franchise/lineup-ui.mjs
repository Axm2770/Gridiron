import * as S from "./state.mjs";
import {
  LINEUP_UNITS,
  canEditUnit,
  changeLineup,
  lineupBoard,
  lineupSettings,
  slotChoices,
  weakestSlot,
} from "./lineup.mjs";

// Visual lineup for the Squad and Tactics screens: a pixel field with the unit's formation,
// a slot picker and the depth order beside it. Every change goes through changeLineup, the
// same mutation the sideline board uses, so it reaches quick sims and live games.

export const VIEW_KEY = "gridiron-lineup-view";
const UNIT_LABELS = { Offense: "Offense", Defense: "Defense", Specialists: "Special teams" };
const arg = (v) => esc(JSON.stringify(v));
const pct = (n) => Math.round(n ?? 100);
const condTone = (p) => (!p ? "" : p.injury ? "bad" : (p.fitness ?? 100) >= 80 ? "good" : (p.fitness ?? 100) >= 65 ? "warn" : "bad");
const lastName = (p) => String(p.name || "").split(" ").slice(1).join(" ") || p.name || "";

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

// Field positions (percent of the field box) for each slot. Offense attacks up from a line
// of scrimmage at 40%; defense lines up across it, facing down the field.
export function slotPositions(actors, unit, m = {}) {
  const LOS = 40;
  if (unit === "Specialists")
    return actors.map((a, i) => ({ ...a, left: i ? 64 : 36, top: i ? 70 : 58 }));
  const seen = {},
    nth = (role) => (seen[role] = (seen[role] ?? -1) + 1);
  if (unit === "Defense") {
    const dl = actors.filter((a) => a.role === "DL").length,
      lb = actors.filter((a) => a.role === "LB").length;
    const spread = (n, i, width) => 50 + (i - (n - 1) / 2) * (width / Math.max(1, n - 1 || 1));
    return actors.map((a) => {
      const i = nth(a.role);
      let x = 50,
        y = LOS + 6;
      if (a.role === "DL") [x, y] = [dl === 1 ? 50 : spread(dl, i, dl > 3 ? 36 : 26), LOS + 7];
      else if (a.role === "LB") [x, y] = [lb === 1 ? 50 : spread(lb, i, lb > 3 ? 48 : 34), LOS + 22];
      else if (a.role === "CB") [x, y] = [[8, 92, 22, 78][i] ?? 50, i < 2 ? LOS + 9 : LOS + 17];
      else if (a.role === "S")
        [x, y] = m.shell === "Single-High" ? [[50, 30][i] ?? 50, i ? LOS + 26 : LOS + 46] : m.shell === "Zero" ? [[32, 68][i] ?? 50, LOS + 24] : [[30, 70][i] ?? 50, LOS + 42];
      return { ...a, left: x, top: y };
    });
  }
  const formation = m.offense || "Shotgun spread",
    under = ["Singleback", "I formation"].includes(formation),
    ol = actors.filter((a) => a.role === "OL").length;
  return actors.map((a) => {
    const i = nth(a.role);
    let x = 50,
      y = LOS + 10;
    if (a.role === "OL") [x, y] = [50 + (i - (ol - 1) / 2) * 8.5, LOS + 6];
    else if (a.role === "QB") [x, y] = [50, under ? LOS + 17 : LOS + 27];
    else if (a.role === "RB") {
      if (formation === "Empty backfield") [x, y] = [[88, 12][i] ?? 50, LOS + 17];
      else if (formation === "I formation") [x, y] = [50, i ? LOS + 29 : LOS + 42];
      else if (formation === "Singleback") [x, y] = [[50, 36][i] ?? 50, LOS + 36];
      else [x, y] = [[64, 36][i] ?? 50, LOS + 27];
    } else if (a.role === "TE") [x, y] = [[75, 25, 84][i] ?? 50, LOS + 8];
    else if (a.role === "WR") [x, y] = [[7, 93, 20, 80, 33][i] ?? 50, i < 2 ? LOS + 4 : LOS + 11];
    else if (a.role === "K" || a.role === "P") [x, y] = [50, LOS + 30];
    return { ...a, left: x, top: y };
  });
}

export function installLineupUI({ isBusy = () => false } = {}) {
  if (typeof document !== "undefined" && document.head && !document.querySelector?.('link[href="lineup.css"]'))
    document.head.insertAdjacentHTML?.("beforeend", '<link rel="stylesheet" href="lineup.css">');
  let unit = "Offense",
    selected = null,
    suggested = null,
    error = "",
    focusAfter = null;
  const locked = () => isBusy() || (typeof animating !== "undefined" && animating);
  const editable = () => canEditUnit(state, unit) && !state.live?.finished;
  const refocus = (selector) => {
    focusAfter = selector;
    const run = () => {
      if (!focusAfter) return;
      document.querySelector(focusAfter)?.focus?.();
      focusAfter = null;
    };
    (globalThis.requestAnimationFrame || setTimeout)(run);
  };

  function assign(slot, id) {
    if (locked()) {
      toast("Wait for the current simulation to finish.");
      return;
    }
    let incoming = null;
    try {
      state = S.transact(state, (s) => {
        incoming = changeLineup(s, unit, slot, id);
      });
      save();
      error = "";
      selected = null;
      suggested = null;
      render();
      refocus(`[data-lu-slot="${slot}"]`);
      toast(`${incoming.name} is in the lineup at ${incoming.pos}.`);
    } catch (e) {
      error = e.message;
      render();
      refocus(".lu-picker [data-lu-focus]");
    }
  }

  const chip = (a) => {
    const p = a.p,
      label = p
        ? `${a.role} slot: number ${p.jersey || "unknown"}, ${p.name}, ${p.ovr} overall, condition ${pct(p.fitness)}%. Choose a replacement.`
        : `Vacant ${a.role} slot. Assign a player.`;
    return `<button type="button" class="lu-slot ${p ? "cond-" + condTone(p) : "vacant"} ${selected === a.index ? "selected" : ""}" style="--x:${a.left}%;--y:${a.top}%" data-lu-slot="${a.index}" aria-pressed="${selected === a.index}" aria-label="${esc(label)}" onclick="Lineup.select(${a.index})" ondragover="Lineup.over(event)" ondragleave="Lineup.leave(event)" ondrop="Lineup.drop(event,${a.index})"><span class="lu-jersey">${p ? esc(p.jersey ?? "–") : "+"}</span><span class="lu-chip-text"><b>${p ? esc(lastName(p)) : "Vacant"}</b><small>${a.role}${p ? " · " + p.ovr : ""}</small></span>${p ? `<i class="lu-cond" title="Condition ${pct(p.fitness)}%"></i>` : ""}</button>`;
  };
  const slotRow = (a) => {
    const p = a.p;
    return `<li><button type="button" class="lu-slot-row ${selected === a.index ? "selected" : ""}" data-lu-slot="${a.index}" aria-pressed="${selected === a.index}" onclick="Lineup.select(${a.index})"><span class="lu-pos-tag">${a.role}</span><span>${p ? `<b>${esc(p.name)}</b><small>#${esc(p.jersey ?? "–")} · ${pct(p.fitness)}% condition</small>` : "<b>Vacant</b><small>Assign a player</small>"}</span><strong>${p ? p.ovr : "—"}</strong></button></li>`;
  };

  function picker(board) {
    const c = slotChoices(state, unit, selected);
    if (!c.slot) return "";
    const cur = c.slot.p,
      can = editable() && !locked();
    return `<div class="lu-picker" role="region" aria-label="Choose a ${c.slot.role}" onkeydown="if(event.key==='Escape'){event.preventDefault();Lineup.close()}"><div class="lu-picker-head"><div><span class="gd-eyebrow">${UNIT_LABELS[unit]} · ${c.slot.role} slot</span><h3 tabindex="-1" ${can && c.eligible.length ? "" : "data-lu-focus"}>${cur ? esc(cur.name) : "Vacant slot"}</h3>${cur ? `<small>${cur.ovr} OVR · ${pct(cur.fitness)}% condition · ${pct(cur.morale ?? 75)}% morale <button type="button" class="link" onclick="W.player(${arg(cur.id)})">Profile →</button></small>` : ""}</div><button type="button" class="secondary small" onclick="Lineup.close()">← Depth chart</button></div>${error ? `<p class="lu-error" role="alert">${esc(error)}</p>` : ""}${editable() ? "" : `<p class="lu-note">${state.live?.finished ? "The game has finished. Review the result before changing personnel." : `In your ${esc(state.franchise.role)} role the ${UNIT_LABELS[unit].toLowerCase()} depth chart belongs to another coach.`}</p>`}<div class="lu-label">Eligible ${c.slot.role}s · best first <span>${c.eligible.length}</span></div><ul class="lu-cands">${
      c.eligible
        .map(
          (p, i) =>
            `<li><button type="button" class="lu-cand ${suggested === p.id ? "suggested" : ""}" ${can ? "" : "disabled"} ${i === 0 || suggested === p.id ? "data-lu-focus" : ""} draggable="${can}" ondragstart="Lineup.drag(event,${arg(p.id)})" onclick="Lineup.assign(${arg(p.id)})" aria-label="Start ${esc(p.name)}, ${p.ovr} overall, condition ${pct(p.fitness)}%, morale ${pct(p.morale ?? 75)}%"><span class="lu-jersey">${esc(p.jersey ?? "–")}</span><span class="lu-cand-name"><b>${esc(p.name)}</b><small>${p.starter ? "Starter" : "Reserve"} · ${p.age} yrs${p.status === "elevated" ? " · elevated" : ""}</small></span><span class="lu-stat"><small>OVR</small><b>${p.ovr}</b></span><span class="lu-stat cond-${condTone(p)}"><small>COND</small><b>${pct(p.fitness)}%</b></span><span class="lu-stat"><small>MOR</small><b>${pct(p.morale ?? 75)}%</b></span></button></li>`,
        )
        .join("") || `<li class="lu-empty">No healthy ${c.slot.role} is free. Players already on the field can't fill a second slot.</li>`
    }</ul>${
      c.unavailable.length
        ? `<div class="lu-label">Unavailable <span>${c.unavailable.length}</span></div><ul class="lu-cands">${c.unavailable
            .map(({ p, reason }) => `<li><div class="lu-cand out" aria-disabled="true"><span class="lu-jersey">${esc(p.jersey ?? "–")}</span><span class="lu-cand-name"><b>${esc(p.name)}</b><small>${esc(reason)}</small></span><span class="lu-stat"><small>OVR</small><b>${p.ovr}</b></span><span class="lu-flag">${p.injury ? "✚" : "⛔"}</span></div></li>`)
            .join("")}</ul>`
        : ""
    }</div>`;
  }

  function depthLists(board) {
    const can = editable() && !locked();
    return `<div class="lu-depth">${error ? `<p class="lu-error" role="alert">${esc(error)}</p>` : ""}${board.positions
      .map(
        (g) =>
          `<section class="lu-pos"><h4>${g.pos} <small>${g.slots} on field · ${g.depth.length} healthy</small></h4><ol>${g.depth
            .map(
              ({ p, rank, slot }) =>
                `<li><button type="button" class="lu-bench-row ${slot !== null ? "on-field" : ""}" ${slot === null && !can ? "disabled" : ""} draggable="${slot === null && can}" ondragstart="Lineup.drag(event,${arg(p.id)})" onclick="${slot !== null ? `Lineup.select(${slot})` : `Lineup.bench(${arg(p.id)})`}" aria-label="${esc(p.name)}, ${p.ovr} overall, depth ${rank}${slot !== null ? ", on the field. Open his slot." : ", bench. Choose a slot for him."}"><span class="lu-rank">${rank}</span><span class="lu-cand-name"><b>${esc(p.name)}</b><small>#${esc(p.jersey ?? "–")} · ${pct(p.fitness)}% · ${p.starter ? "starter" : "reserve"}</small></span><strong>${p.ovr}</strong><em>${slot !== null ? "On field" : "Bench"}</em></button></li>`,
            )
            .join("")}${g.unavailable
            .map(({ p, reason }) => `<li><div class="lu-bench-row out" aria-disabled="true"><span class="lu-rank">${p.injury ? "✚" : "–"}</span><span class="lu-cand-name"><b>${esc(p.name)}</b><small>${esc(reason)}</small></span><strong>${p.ovr}</strong></div></li>`)
            .join("")}${g.depth.length || g.unavailable.length ? "" : '<li class="lu-empty">Nobody at this position.</li>'}</ol></section>`,
      )
      .join("")}</div>`;
  }

  function board(screen) {
    const b = lineupBoard(state, unit),
      m = lineupSettings(state),
      points = slotPositions(b.actors, unit, m);
    if (selected !== null && !b.actors[selected]) selected = null;
    const healthy = b.actors.filter((a) => a.p),
      avg = Math.round(healthy.reduce((n, a) => n + (a.p.fitness ?? 100), 0) / Math.max(1, healthy.length)),
      scheme =
        unit === "Offense"
          ? `${m.offense || "Shotgun spread"} · ${m.personnel || "11"} personnel`
          : unit === "Defense"
            ? `${m.defense || "Nickel"} · ${m.shell || "2-High"} shell`
            : "Kicker and punter",
      canDepth = S.allowed(state, "coach") || S.allowed(state, "roster");
    return `<section class="panel lu-board" data-unit="${unit}" aria-label="Visual lineup"><div class="lu-toolbar"><div class="lu-units" role="group" aria-label="Unit">${Object.keys(LINEUP_UNITS)
      .map((u) => `<button type="button" class="${unit === u ? "active" : ""}" aria-pressed="${unit === u}" onclick="Lineup.unit('${u}')">${UNIT_LABELS[u]}</button>`)
      .join("")}</div><span class="lu-scheme">${esc(scheme)}</span><span class="lu-meta"><b>${b.filled}/${b.actors.length}</b> set · <b>${avg}%</b> avg condition</span>${screen === "tactics" ? `<button type="button" class="secondary small" onclick="F.depth()" ${canDepth && !locked() ? "" : "disabled"}>Optimize depth</button>` : ""}</div><div class="lu-layout"><div class="lu-field-wrap"><div class="lu-field" role="group" aria-label="${UNIT_LABELS[unit]} formation: ${esc(scheme)}"><span class="lu-endzone">${esc(clubs[state.team]?.[2] || "")}</span><span class="lu-dir" aria-hidden="true">${unit === "Defense" ? "DEFEND ▼" : "ATTACK ▲"}</span>${points.map(chip).join("")}</div><ol class="lu-slot-list" aria-label="${UNIT_LABELS[unit]} slots">${points.map(slotRow).join("")}</ol><p class="lu-note">Select a player on the field to pick his replacement, or drag a bench player onto a slot. The match engine uses this order for the next game and the next snap.</p></div><div class="lu-side">${selected !== null ? picker(b) : depthLists(b)}</div></div></section>`;
  }

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
    return `<section class="lu-tactics"><div class="lu-section-head"><div><span class="gd-eyebrow">Depth chart</span><h2>Starting lineup</h2></div>${toggle("tactics")}</div>${mode === "lineup" ? board("tactics") : depthTable()}</section>`;
  }

  window.Lineup = {
    unit(u) {
      if (!LINEUP_UNITS[u]) return;
      unit = u;
      selected = null;
      suggested = null;
      error = "";
      render();
    },
    select(i) {
      selected = selected === i ? null : i;
      suggested = null;
      error = "";
      render();
      refocus(selected === null ? `[data-lu-slot="${i}"]` : ".lu-picker [data-lu-focus]");
    },
    close() {
      const was = selected;
      selected = null;
      suggested = null;
      error = "";
      render();
      if (was !== null) refocus(`[data-lu-slot="${was}"]`);
    },
    assign(id) {
      if (selected === null) return;
      assign(selected, id);
    },
    // A bench player opens the slot he would most likely take (vacant or weakest starter).
    bench(id) {
      const slot = weakestSlot(state, unit, id);
      if (slot === null) {
        toast("This formation has no slot for his position.");
        return;
      }
      selected = slot;
      suggested = id;
      error = "";
      render();
      refocus(".lu-picker .suggested");
    },
    drag(e, id) {
      try {
        e.dataTransfer.setData("text/plain", id);
        e.dataTransfer.effectAllowed = "move";
      } catch {}
    },
    over(e) {
      e.preventDefault();
      e.currentTarget?.classList?.add("drop");
    },
    leave(e) {
      e.currentTarget?.classList?.remove("drop");
    },
    drop(e, slot) {
      e.preventDefault();
      const id = e.dataTransfer?.getData("text/plain");
      if (id) assign(slot, id);
    },
    view(screen, mode) {
      storeViewMode(screen, mode === "table" ? "table" : "lineup");
      selected = null;
      render();
    },
  };

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
