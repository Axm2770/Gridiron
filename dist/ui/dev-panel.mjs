// Owner-only test console. Locked on every device until the owner's passphrase is entered with
// Ctrl/Cmd+Shift+Alt+D; only its SHA-256 lives here. While locked the module creates no DOM,
// adds no menu, command-search or global entry, and only keeps a small in-memory error log.
// Domain modules are imported lazily after unlock so players never load them for this.

export const UNLOCK_HASH = "64108317ca0701a58324e6ba7b29c5f4c2d3b8ebb473670ef6e8af738a24ca24";
export const STORAGE_KEY = "gridiron-dev";
const UI_KEY = "gridiron-dev-ui";
const SLOT_KEY = "gridiron-dev-slot-";
const SLOTS = 3;
const LOG_LIMIT = 400;

/* ------------------------------------------------------------------ pure helpers */

export function matchesUnlock(hexDigest) {
  return typeof hexDigest === "string" && hexDigest.trim().toLowerCase() === UNLOCK_HASH;
}

export async function sha256Hex(text) {
  const data = new TextEncoder().encode(String(text));
  const digest = await globalThis.crypto.subtle.digest("SHA-256", data);
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

export function isUnlocked(storage = globalThis.localStorage) {
  try {
    return matchesUnlock(storage?.getItem(STORAGE_KEY));
  } catch {
    return false;
  }
}

// Ctrl+Shift+Alt+D, or Cmd+Shift+Alt+D on a Mac. `code` is used because Alt changes `key` on macOS.
export function isShortcut(e) {
  return !!e && (e.ctrlKey || e.metaKey) && e.shiftKey && e.altKey && (e.code === "KeyD" || String(e.key).toLowerCase() === "d");
}

// Resolves "W.open" or "franchise.market.offers.0" against an object; undefined when any step is missing.
export function resolvePath(root, path) {
  if (root == null || typeof path !== "string") return undefined;
  const parts = path
    .trim()
    .replace(/\[(\d+)\]/g, ".$1")
    .split(".")
    .filter(Boolean);
  let value = root;
  for (const part of parts) {
    if (value == null) return undefined;
    try {
      value = value[part];
    } catch {
      return undefined;
    }
  }
  return value;
}

const SKIP_ROOTS = new Set(["this", "event", "if", "return", "typeof", "new", "void", "function", "await", "async", "for", "while"]);
// Identifier paths called by an inline handler: "closeModal();W.open('Roster')" → ["closeModal", "W.open"].
export function callTargets(code) {
  const out = [];
  const source = String(code || "").replace(/(["'`])(?:\\.|(?!\1).)*\1/g, '""');
  const re = /(^|[;{}\s(,!&|?:])([A-Za-z_$][\w$]*(?:\s*\.\s*[A-Za-z_$][\w$]*)*)\s*\(/g;
  let m;
  while ((m = re.exec(source))) {
    const path = m[2].replace(/\s+/g, "");
    if (!SKIP_ROOTS.has(path.split(".")[0]) && !out.includes(path)) out.push(path);
  }
  return out;
}

export function parseOpen(code) {
  const m = /W\.open\(\s*(['"])(.*?)\1(?:\s*,\s*(['"])(.*?)\3)?\s*\)/.exec(String(code || ""));
  return m ? { route: m[2], tab: m[4] } : null;
}

export const esc = (v) =>
  String(v ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);

/* ------------------------------------------------------------------ log capture */

export const devLog = [];
function pushLog(level, args) {
  try {
    const text = [...args]
      .map((a) => (a instanceof Error ? `${a.message}${a.stack ? "\n" + a.stack.split("\n").slice(1, 4).join("\n") : ""}` : typeof a === "string" ? a : (() => { try { return JSON.stringify(a); } catch { return String(a); } })()))
      .join(" ")
      .slice(0, 2000);
    devLog.push({ at: Date.now(), level, text });
    if (devLog.length > LOG_LIMIT) devLog.splice(0, devLog.length - LOG_LIMIT);
    logListener?.();
  } catch {}
}
let logListener = null;
let captureInstalled = false;
export function installLogCapture(target = globalThis) {
  if (captureInstalled || !target?.addEventListener || !target.console) return false;
  captureInstalled = true;
  for (const level of ["error", "warn"]) {
    const original = target.console[level];
    if (typeof original !== "function") continue;
    target.console[level] = function (...args) {
      pushLog(level, args);
      return original.apply(this, args);
    };
  }
  target.addEventListener("error", (e) => pushLog("window error", [e.error || e.message || "Script error", e.filename ? `@ ${e.filename}:${e.lineno}` : ""]));
  target.addEventListener("unhandledrejection", (e) => pushLog("rejection", [e.reason ?? "Unhandled rejection"]));
  return true;
}
// Cheap and DOM-free; installed at load in the browser even while locked.
if (typeof window !== "undefined" && typeof document !== "undefined") installLogCapture(window);

/* ------------------------------------------------------------------ game access */

const G = globalThis;
const getState = () => (typeof state !== "undefined" ? state : undefined); // eslint-disable-line no-undef
// `state` is game.js's script-scope binding; assigning it is how every UI module replaces the career.
function setState(next) {
  state = next; // eslint-disable-line no-undef
}
const call = (name, ...args) => (typeof G[name] === "function" ? G[name](...args) : undefined);
const store = {
  get(key) {
    try {
      return G.localStorage?.getItem(key) ?? null;
    } catch {
      return null;
    }
  },
  set(key, value) {
    G.localStorage.setItem(key, value);
  },
  remove(key) {
    try {
      G.localStorage?.removeItem(key);
    } catch {}
  },
};

let M = null; // lazily imported game modules
async function deps() {
  if (M) return M;
  const [S, Cal, News, Medical, Ratings, Saves, Compliance, World, Conversations, Cinema, Tours] = await Promise.all([
    import("../franchise/state.mjs"),
    import("../franchise/calendar-core.mjs"),
    import("../franchise/newsroom.mjs"),
    import("../franchise/medical.mjs"),
    import("../franchise/ratings.mjs"),
    import("../franchise/save-store.mjs"),
    import("../franchise/compliance.mjs"),
    import("../franchise/world.mjs"),
    import("../franchise/conversations.mjs"),
    import("../presentation/cinematics.mjs"),
    import("./tutorial-content.mjs"),
  ]);
  M = { S, Cal, News, Medical, Ratings, Saves, Compliance, World, Conversations, Cinema, Tours };
  return M;
}

/* ------------------------------------------------------------------ installer */

let ctx = { getSection: () => "", isBusy: () => false };
let panel = null;
let prompt = null;
let installed = false;
let ui = { open: false, tab: "State", dock: "right", x: 80, y: 80, w: 520, h: 640, path: "", auto: true };

export function installDevPanel(options = {}) {
  ctx = { ...ctx, ...options };
  if (installed || typeof document === "undefined" || !G.addEventListener) return false;
  installed = true;
  G.addEventListener(
    "keydown",
    (e) => {
      if (!isShortcut(e)) return;
      e.preventDefault();
      e.stopPropagation();
      if (isUnlocked()) togglePanel();
      else showPrompt();
    },
    true,
  );
  if (isUnlocked()) {
    try {
      ui = { ...ui, ...JSON.parse(store.get(UI_KEY) || "{}") };
    } catch {}
    if (ui.open) openPanel();
  }
  return true;
}

function host() {
  return document.querySelector("dialog[open]") || document.body;
}
function keepOnTop(el) {
  if (el && el.parentNode !== host()) host().appendChild(el);
}

/* --------------------------------------------------------------- passphrase prompt */

function showPrompt() {
  if (prompt) {
    prompt.querySelector("input")?.focus();
    return;
  }
  prompt = document.createElement("form");
  prompt.className = "gdv-prompt";
  prompt.setAttribute("autocomplete", "off");
  prompt.innerHTML = `<b>Access</b><input type="password" aria-label="Access" autocomplete="off" spellcheck="false"><small aria-live="polite"></small><div><button type="button" data-x="cancel" class="secondary small">Cancel</button><button type="submit" class="small">OK</button></div>`;
  keepOnTop(prompt);
  const input = prompt.querySelector("input"),
    note = prompt.querySelector("small");
  input.focus();
  const close = () => {
    prompt?.remove();
    prompt = null;
  };
  prompt.addEventListener("keydown", (e) => {
    e.stopPropagation();
    if (e.key === "Escape") close();
  });
  prompt.querySelector('[data-x="cancel"]').onclick = close;
  prompt.onsubmit = async (e) => {
    e.preventDefault();
    const value = input.value;
    input.value = "";
    note.textContent = "";
    let ok = false;
    try {
      ok = matchesUnlock(await sha256Hex(value));
    } catch {}
    if (!ok) {
      await new Promise((r) => setTimeout(r, 700));
      if (note.isConnected) note.textContent = "Not recognised";
      return;
    }
    try {
      store.set(STORAGE_KEY, UNLOCK_HASH);
    } catch {}
    close();
    openPanel();
  };
}

/* --------------------------------------------------------------------- panel shell */

const TABS = ["State", "Time", "Players", "Events", "Checks", "Saves", "Log"];
function saveUI() {
  try {
    store.set(UI_KEY, JSON.stringify(ui));
  } catch {}
}
function togglePanel() {
  panel && panel.isConnected && !panel.hidden ? closePanel() : openPanel();
}
function closePanel() {
  if (panel) panel.hidden = true;
  ui.open = false;
  saveUI();
}
async function openPanel() {
  if (!isUnlocked()) return;
  ui.open = true;
  saveUI();
  if (!panel) buildPanel();
  wireOnce();
  panel.hidden = false;
  keepOnTop(panel);
  applyGeometry();
  try {
    await deps();
  } catch (e) {
    report(e, "Loading game modules");
  }
  renderTab();
}

function buildPanel() {
  panel = document.createElement("section");
  panel.className = "gdv-panel";
  panel.setAttribute("aria-label", "Test console");
  panel.innerHTML = `<header class="gdv-head"><b>DEV</b><nav class="gdv-tabs">${TABS.map((t) => `<button type="button" data-tab="${t}">${t}</button>`).join("")}</nav><span class="gdv-tools"><button type="button" data-dock="left" title="Dock left">◧</button><button type="button" data-dock="float" title="Float">▢</button><button type="button" data-dock="right" title="Dock right">◨</button><button type="button" data-close title="Close (Ctrl/Cmd+Shift+Alt+D)">×</button></span></header><div class="gdv-status" role="status"></div><div class="gdv-body"></div><div class="gdv-confirm" hidden></div>`;
  keepOnTop(panel);
  panel.addEventListener("click", onClick);
  panel.addEventListener("change", onChange);
  panel.addEventListener("keydown", (e) => {
    if (isShortcut(e)) return;
    e.stopPropagation(); // game shortcuts must not fire while typing here
    if (e.key === "Enter" && e.target.dataset.enter) {
      e.preventDefault();
      act(e.target.dataset.enter, e.target);
    }
  });
  drag(panel.querySelector(".gdv-head"));
  if (G.ResizeObserver)
    new ResizeObserver(() => {
      if (panel.hidden) return;
      const r = panel.getBoundingClientRect();
      if (r.width > 50) {
        ui.w = Math.round(r.width);
        if (ui.dock === "float") ui.h = Math.round(r.height);
        saveUI();
      }
    }).observe(panel);
  // Batched so a burst of errors (or an error while drawing) cannot re-render in a loop.
  let queued = false;
  logListener = () => {
    if (queued || !panel || panel.hidden || ui.tab !== "Log") return;
    queued = true;
    setTimeout(() => {
      queued = false;
      if (panel && !panel.hidden && ui.tab === "Log") renderTab();
    }, 300);
  };
}

let wired = false;
function wireOnce() {
  if (wired) return;
  wired = true;
  // A modal <dialog> makes the rest of the page inert, so the panel follows it into the top layer.
  const modalEl = document.getElementById("modal");
  const follow = () => {
    if (panel) keepOnTop(panel);
    if (prompt) keepOnTop(prompt);
  };
  // modal(html) replaces the dialog's innerHTML, which would detach a panel living inside it.
  if (modalEl && G.MutationObserver) new MutationObserver(follow).observe(modalEl, { attributes: true, attributeFilter: ["open"], childList: true });
  modalEl?.addEventListener("close", follow);
  setInterval(() => {
    if (panel && !panel.hidden && ui.tab === "State") refreshSummary();
  }, 1500);
}

function applyGeometry() {
  const p = panel;
  p.dataset.dock = ui.dock;
  const vw = G.innerWidth || 1200,
    vh = G.innerHeight || 800;
  const w = Math.max(340, Math.min(ui.w, vw - 16));
  if (ui.dock === "float") {
    const h = Math.max(240, Math.min(ui.h, vh - 16));
    const x = Math.max(0, Math.min(ui.x, vw - 120)),
      y = Math.max(0, Math.min(ui.y, vh - 60));
    p.style.cssText = `left:${x}px;top:${y}px;width:${w}px;height:${h}px`;
  } else p.style.cssText = `${ui.dock}:0;top:0;width:${w}px;height:100vh`;
  p.querySelectorAll("[data-dock]").forEach((b) => b.classList.toggle("active", b.dataset.dock === ui.dock));
}

function drag(handle) {
  handle.addEventListener("pointerdown", (e) => {
    if (e.target.closest("button")) return;
    const r = panel.getBoundingClientRect(),
      dx = e.clientX - r.left,
      dy = e.clientY - r.top;
    if (ui.dock !== "float") {
      ui.dock = "float";
      ui.h = Math.min(ui.h, (G.innerHeight || 800) - 40);
    }
    handle.setPointerCapture?.(e.pointerId);
    const move = (ev) => {
      ui.x = Math.round(ev.clientX - dx);
      ui.y = Math.round(ev.clientY - dy);
      applyGeometry();
    };
    const up = () => {
      handle.removeEventListener("pointermove", move);
      handle.removeEventListener("pointerup", up);
      saveUI();
    };
    handle.addEventListener("pointermove", move);
    handle.addEventListener("pointerup", up);
  });
}

/* ---------------------------------------------------------- status, confirm, runner */

function status(text, kind = "ok") {
  const el = panel?.querySelector(".gdv-status");
  if (!el) return;
  el.className = "gdv-status " + kind;
  el.textContent = text;
}
function report(error, label = "Action") {
  const message = error?.message || String(error);
  pushLog("panel", [`${label}: ${message}`]);
  status(`${label} failed: ${message}`, "bad");
}
function confirmBox(message) {
  const box = panel.querySelector(".gdv-confirm");
  box.hidden = false;
  box.innerHTML = `<p>${esc(message)}</p><div><button type="button" class="secondary small" data-confirm="0">Cancel</button><button type="button" class="small gdv-danger" data-confirm="1">Confirm</button></div>`;
  return new Promise((resolve) => {
    box.onclick = (e) => {
      const b = e.target.closest("[data-confirm]");
      if (!b) return;
      e.stopPropagation();
      box.hidden = true;
      box.onclick = null;
      resolve(b.dataset.confirm === "1");
    };
  });
}
async function act(name, el) {
  const fn = ACTIONS[name];
  if (!fn) return;
  try {
    await deps();
    status("Working…", "info");
    const result = await fn(el);
    if (result !== undefined && result !== null) status(String(result), "ok");
    else status("Done.", "ok");
  } catch (e) {
    report(e, name);
  }
}
function onClick(e) {
  const t = e.target.closest("button,[data-act],[data-path]");
  if (!t || !panel.contains(t)) return;
  if (t.dataset.tab) {
    ui.tab = t.dataset.tab;
    saveUI();
    renderTab();
  } else if (t.dataset.dock) {
    ui.dock = t.dataset.dock;
    if (ui.dock === "float") ui.h = Math.min(ui.h, (G.innerHeight || 800) - 40);
    saveUI();
    applyGeometry();
  } else if (t.hasAttribute("data-close")) closePanel();
  else if (t.dataset.path !== undefined) {
    ui.path = t.dataset.path;
    renderTab();
  } else if (t.dataset.act) act(t.dataset.act, t);
}
function onChange(e) {
  const t = e.target;
  if (t.dataset.change) act(t.dataset.change, t);
  if (t.dataset.setting) {
    ui[t.dataset.setting] = t.type === "checkbox" ? t.checked : t.value;
    saveUI();
  }
}
const val = (name) => panel.querySelector(`[name="${name}"]`)?.value ?? "";
const num = (name, label = name) => {
  const n = Number(val(name));
  if (!Number.isFinite(n)) throw Error(`${label} must be a number.`);
  return n;
};

/* -------------------------------------------------------------------- mutations */

const busy = () => !!ctx.isBusy?.() || (typeof animating !== "undefined" && animating); // eslint-disable-line no-undef
// Every change goes through the same boundary as the game's own actions: S.transact clones the
// career, applies the change and runs validate(); the result replaces `state`, and render() calls
// save() → Career.autosave(), so the career library writes it like any other change.
function commit(label, fn) {
  if (busy()) throw Error("Wait for the current simulation or match to finish.");
  const s0 = getState();
  if (!s0?.franchise) throw Error("No career is loaded.");
  let out;
  const next = M.S.transact(s0, (s) => {
    out = fn(s);
    s.debugSave = true;
    s.franchise.audit ??= [];
    s.franchise.audit.unshift({ year: s.year, week: s.week, message: "dev: " + label });
    s.franchise.audit = s.franchise.audit.slice(0, 100);
  });
  setState(next);
  call("render");
  return out;
}
function replaceCareer(candidate) {
  const { S, Ratings } = M;
  S.migrate(candidate);
  S.validate(candidate);
  Ratings.ensureCareerRatings(candidate);
  if (busy()) throw Error("Wait for the current simulation or match to finish.");
  call("closeModal");
  setState(candidate);
  try {
    league = G.clubs?.[candidate.team]?.[3] ?? league; // eslint-disable-line no-undef
  } catch {}
  call("render");
}

/* ------------------------------------------------------------------ data helpers */

const teamName = (t) => (t === "fa" ? "Free agent" : t === "prospect" ? "Draft prospect" : G.clubs?.[t] ? `${G.clubs[t][1]} ${G.clubs[t][2]}` : `Team ${t}`);
const teamAbbr = (t) => (t === "fa" ? "FA" : t === "prospect" ? "PROS" : G.clubs?.[t]?.[0] || String(t));
function allPlayers(s) {
  const out = s.roster.map((p) => ({ p, team: s.team }));
  for (const c of s.franchise.clubs) if (c.id !== s.team) for (const p of c.players || []) out.push({ p, team: c.id });
  for (const p of s.agents || []) out.push({ p, team: "fa" });
  for (const p of s.prospects || []) out.push({ p, team: "prospect" });
  return out;
}
function locate(s, id) {
  const lists = [[s.roster, s.team], ...s.franchise.clubs.filter((c) => c.id !== s.team).map((c) => [c.players, c.id]), [s.agents, "fa"]];
  for (const [list, team] of lists) {
    const i = (list || []).findIndex((p) => p.id === id);
    if (i >= 0) return { list, team, index: i, p: list[i] };
  }
  return null;
}
function moveTo(s, id, dest) {
  const { S } = M;
  const from = locate(s, id);
  if (!from) throw Error("Player not found (draft prospects cannot be moved).");
  if (from.team === dest) return from.p;
  const p = from.list.splice(from.index, 1)[0];
  p.starter = false;
  p.protected = false;
  if (s.franchise.medical?.cases?.[id] && dest !== s.team) delete s.franchise.medical.cases[id];
  const c = s.franchise.contracts[id];
  if (dest === "fa") {
    if (c && !c.ended) {
      c.ended = true;
      c.transactions?.push({ type: "released", year: s.year, dev: true });
    }
    p.status = "active";
    s.agents.push(p);
  } else {
    dest = Number(dest);
    if (!s.franchise.clubs[dest]) throw Error("Unknown club.");
    if (!["active", "practice", "ir"].includes(p.status)) p.status = "active";
    if (c && !c.ended) c.team = dest;
    else s.franchise.contracts[id] = S.basicContract(p, dest, S.financeYear(s));
    (dest === s.team ? s.roster : s.franchise.clubs[dest].players).push(p);
  }
  S.log(s, "Developer move", `${p.name} moved to ${teamName(dest)} (test console).`);
  return p;
}
function pathValue(s, path) {
  return path ? resolvePath(s, path) : s;
}

/* ------------------------------------------------------------------------ views */

function summaryHTML() {
  const s = getState();
  if (!s?.franchise || !M) return `<p>No career loaded.</p>`;
  const { S, Cal } = M;
  let cap = null,
    date = "?";
  try {
    cap = S.capLedger(s);
  } catch {}
  try {
    date = Cal.ensureCalendar(s).date;
  } catch {}
  const counts = {};
  for (const p of s.roster) counts[p.status || "active"] = (counts[p.status || "active"] || 0) + 1;
  const rec = s.teams?.[s.team] || {};
  const saveText = document.getElementById("career-save-status")?.textContent || "—";
  const row = (k, v) => `<div><span>${esc(k)}</span><b>${v}</b></div>`;
  return `<div class="gdv-kv">${[
    row("Year / phase", `${s.year} · ${esc(s.phase)}${s.phase === "season" ? " · wk " + (s.week + 1) : ""}`),
    row("Date", esc(date)),
    row("Team", `${esc(teamName(s.team))} (#${s.team})`),
    row("Role", esc(s.franchise.role)),
    row("Cap room", cap ? `$${(cap.room / S.MILLION).toFixed(2)}M <small>of $${(cap.limit / S.MILLION).toFixed(1)}M</small>` : "?"),
    row("Record", `${rec.w ?? 0}-${rec.l ?? 0}${rec.t ? "-" + rec.t : ""}`),
    row("Roster", Object.entries(counts).map(([k, v]) => `${esc(k)} ${v}`).join(" · ") + ` · total ${s.roster.length}`),
    row("Free agents", (s.agents || []).length),
    row("Save", `${esc(G.Career?.currentId || "none")} · ${esc(saveText)}`),
    row("Section / busy", `${esc(ctx.getSection?.() || "")} · ${busy() ? "busy" : "idle"}`),
    row("Debug mode", s.franchise.debug ? "on" : "off"),
  ].join("")}</div>`;
}
function refreshSummary() {
  const el = panel?.querySelector(".gdv-summary");
  if (el) el.innerHTML = summaryHTML();
}

function jsonHTML() {
  const s = getState();
  if (!s) return "";
  const value = pathValue(s, ui.path);
  const crumbs = ui.path ? ui.path.split(".") : [];
  const crumbHTML = [`<button type="button" class="gdv-link" data-path="">state</button>`, ...crumbs.map((c, i) => `<button type="button" class="gdv-link" data-path="${esc(crumbs.slice(0, i + 1).join("."))}">${esc(c)}</button>`)].join(" / ");
  let keys = "";
  if (value && typeof value === "object") {
    const entries = Object.keys(value).slice(0, 300);
    keys = `<div class="gdv-keys">${entries
      .map((k) => {
        const v = value[k],
          type = Array.isArray(v) ? `[${v.length}]` : v && typeof v === "object" ? "{…}" : typeof v === "string" ? JSON.stringify(v).slice(0, 40) : String(v);
        return `<button type="button" data-path="${esc((ui.path ? ui.path + "." : "") + k)}"><b>${esc(k)}</b> <small>${esc(type)}</small></button>`;
      })
      .join("")}${Object.keys(value).length > 300 ? `<small>… ${Object.keys(value).length - 300} more keys</small>` : ""}</div>`;
  }
  let text;
  try {
    text = value === undefined ? "undefined (path not found)" : JSON.stringify(value, null, 2);
  } catch (e) {
    text = "Cannot serialise: " + e.message;
  }
  const big = text.length > 120000;
  return `<div class="gdv-crumbs">${crumbHTML}</div>${keys}<pre class="gdv-json">${esc(big ? text.slice(0, 120000) + "\n… truncated (" + text.length + " chars) — narrow the path or copy" : text)}</pre>`;
}

function stateTab() {
  return `<div class="gdv-summary">${summaryHTML()}</div>
  <div class="gdv-row"><input name="path" placeholder="Path, e.g. franchise.market" value="${esc(ui.path)}" data-enter="go-path"><button type="button" data-act="go-path" class="small">Go</button><button type="button" data-act="copy-json" class="secondary small">Copy JSON</button><button type="button" data-act="validate" class="secondary small">Validate state</button></div>
  <div class="gdv-results" data-out="validate"></div>
  ${jsonHTML()}`;
}

function timeTab() {
  const s = getState();
  let date = "";
  try {
    date = M.Cal.ensureCalendar(s).date;
  } catch {}
  return `<p class="gdv-note">Uses the game's calendar (<code>Calendar.start</code>), the same path as the Calendar screen's holiday. Today: <b>${esc(date)}</b> · ${esc(s?.phase || "")}</p>
  <label class="gdv-check"><input type="checkbox" data-setting="auto" ${ui.auto ? "checked" : ""}> Auto-answer decisions while simulating <small>(first option of urgent inbox decisions, press conferences and open conversations)</small></label>
  <h4>Advance</h4>
  <div class="gdv-row"><input name="days" type="number" min="1" max="730" value="7" style="width:80px"><button type="button" data-act="sim-days" class="small">Advance N days</button></div>
  <div class="gdv-row"><input name="date" type="date" value="${esc(date)}"><button type="button" data-act="sim-date" class="small">Sim to date</button></div>
  <h4>Milestones</h4>
  <div class="gdv-grid">
    <button type="button" data-act="sim-regular" class="small">End of regular season</button>
    <button type="button" data-act="sim-playoffs" class="small">End of playoffs</button>
    <button type="button" data-act="sim-offseason" class="small">Into the offseason</button>
    <button type="button" data-act="sim-draft" class="small">Draft day</button>
    <button type="button" data-act="sim-next" class="small">Next season (training camp)</button>
    <button type="button" data-act="sim-stop" class="secondary small">Stop simulation</button>
    <button type="button" data-act="answer-now" class="secondary small">Answer pending decisions now</button>
  </div>
  <div class="gdv-results" data-out="time"></div>`;
}

function playersTab() {
  const s = getState();
  const clubOptions = (sel) => `<option value="fa" ${sel === "fa" ? "selected" : ""}>Free agency</option>` + Array.from({ length: 32 }, (_, i) => `<option value="${i}" ${String(sel) === String(i) ? "selected" : ""}>${esc(teamAbbr(i))} · ${esc(teamName(i))}${i === s?.team ? " (you)" : ""}</option>`).join("");
  const POS = M?.S?.POS || ["QB"];
  return `<div class="gdv-row"><input name="q" placeholder="Search name or id (all clubs, FA, prospects)" value="${esc(ui.q || "")}" data-enter="search"><button type="button" data-act="search" class="small">Search</button></div>
  <div class="gdv-list" data-out="players">${ui.q !== undefined ? searchHTML(ui.q) : ""}</div>
  <div data-out="editor">${editorHTML()}</div>
  <h4>Squad-wide</h4>
  <div class="gdv-grid"><button type="button" data-act="heal" class="small">Heal all injuries (league-wide)</button></div>
  <h4>Debug cap adjustment</h4>
  <p class="gdv-note">Adds a ledger entry in <code>franchise.capAdjustments</code> (reason “Developer cap adjustment”) for your team this league year. Positive = more cap room.</p>
  <div class="gdv-row"><input name="capdelta" type="number" step="0.5" value="10" style="width:90px"> $M <button type="button" data-act="cap" class="small">Adjust cap room</button><button type="button" data-act="cap-clear" class="secondary small">Remove dev adjustments</button></div>
  <h4>Generate player</h4>
  <div class="gdv-row"><select name="genpos">${POS.filter((p, i) => POS.indexOf(p) === i).map((p) => `<option>${esc(p)}</option>`).join("")}</select><select name="gendest">${clubOptions(s?.team)}</select><label class="gdv-check"><input type="checkbox" name="genrookie"> rookie</label><button type="button" data-act="generate" class="small">Add generated player</button></div>
  <h4>Force transactions <small class="gdv-warn">(bypass AI acceptance, cap and role checks)</small></h4>
  <div class="gdv-row"><input name="tradegive" placeholder="Your player id" style="width:140px"><input name="tradeget" placeholder="Their player id" style="width:140px"><button type="button" data-act="force-trade" class="small gdv-danger">Force trade</button></div>
  <div class="gdv-row"><input name="signid" placeholder="Free agent id" style="width:140px"><button type="button" data-act="force-sign" class="small gdv-danger">Force signing to my club</button></div>`;
}
function searchHTML(q) {
  const s = getState();
  if (!s?.franchise) return "";
  q = String(q || "").trim().toLowerCase();
  const rows = allPlayers(s)
    .filter(({ p }) => !q || p.name?.toLowerCase().includes(q) || p.id?.toLowerCase() === q || p.id?.toLowerCase().includes(q))
    .slice(0, 40);
  if (!rows.length) return `<p class="gdv-note">No players match.</p>`;
  return `<table><tbody>${rows
    .map(({ p, team }) => `<tr class="${ui.sel === p.id ? "sel" : ""}"><td><button type="button" class="gdv-link" data-act="select" data-id="${esc(p.id)}">${esc(p.name)}</button><br><small>${esc(p.id)}</small></td><td>${esc(p.pos)}</td><td>${p.ovr}/${p.pot}</td><td>${p.age}</td><td>${esc(teamAbbr(team))}</td><td>${p.injury ? "inj " + p.injury : ""} ${esc(p.status || "")}</td></tr>`)
    .join("")}</tbody></table>`;
}
function editorHTML() {
  const s = getState();
  if (!ui.sel || !s?.franchise) return "";
  const found = allPlayers(s).find(({ p }) => p.id === ui.sel);
  if (!found) return `<p class="gdv-note">Selected player no longer exists.</p>`;
  const { p, team } = found;
  const statuses = ["active", "practice", "elevated", "ir", "waivers"];
  const input = (name, value, attrs = "") => `<label>${name}<input name="ed-${name}" type="number" value="${esc(value)}" ${attrs}></label>`;
  return `<fieldset class="gdv-editor"><legend>${esc(p.name)} · ${esc(p.pos)} · ${esc(teamName(team))}</legend>
  <div class="gdv-form">${input("ovr", p.ovr, 'min="1" max="99"')}${input("pot", p.pot, 'min="1" max="99"')}${input("age", p.age, 'min="18" max="50"')}${input("morale", p.morale ?? 75, 'min="0" max="100"')}${input("injury", p.injury || 0, 'min="0" max="52"')}<label>status<select name="ed-status">${statuses.map((v) => `<option ${v === (p.status || "active") ? "selected" : ""}>${v}</option>`).join("")}</select></label></div>
  <div class="gdv-row"><button type="button" data-act="save-player" class="small">Apply edits</button><button type="button" data-act="open-player" class="secondary small" ${team === "fa" || team === "prospect" ? "disabled" : ""}>Open profile</button></div>
  <div class="gdv-row"><select name="movedest">${`<option value="fa">Free agency</option>` + Array.from({ length: 32 }, (_, i) => `<option value="${i}">${esc(teamAbbr(i))} · ${esc(teamName(i))}${i === s.team ? " (you)" : ""}</option>`).join("")}</select><button type="button" data-act="move" class="small gdv-danger" ${team === "prospect" ? "disabled" : ""}>Move player</button></div></fieldset>`;
}

function eventsTab() {
  const scenes = Object.keys(M?.Cinema?.SCENES || {});
  const tours = M?.Tours?.TOURS || [];
  return `<h4>Cinematics &amp; pixel scenes <small>(Cinematics.preview)</small></h4>
  <div class="gdv-grid">${scenes.map((k) => `<button type="button" class="small" data-act="scene" data-kind="${esc(k)}">${esc(k)}${M.Cinema.SCENES[k].pixel ? " ▦" : ""}</button>`).join("")}</div>
  <h4>Arrivals &amp; news</h4>
  <div class="gdv-grid"><button type="button" class="small" data-act="arrival">Arrival: force-sign best free agent</button><button type="button" class="small" data-act="news">Post a news story</button><button type="button" class="small" data-act="press">Press conference (pending)</button></div>
  <h4>Inbox</h4>
  <div class="gdv-grid"><button type="button" class="small" data-act="msg-urgent">Urgent decision</button><button type="button" class="small" data-act="msg-injury">Injury report (injures a starter)</button><button type="button" class="small" data-act="msg-board">Board memo</button>${["Holdout", "Trade demand", "Locker room leak", "League investigation", "Ownership sale"].map((e) => `<button type="button" class="small" data-act="force-event" data-kind="${e}">World event: ${e}</button>`).join("")}<button type="button" class="secondary small" data-act="trim-preview">Office.trimPreview()</button></div>
  <p class="gdv-note">The boardroom module exposes no meeting trigger; “Board memo” posts an ownership decision message instead.</p>
  <h4>Tutorials</h4>
  <div class="gdv-grid">${tours.map((t) => `<button type="button" class="small" data-act="tour" data-id="${esc(t.id)}">${esc(t.title)}</button>`).join("")}<button type="button" class="secondary small gdv-danger" data-act="tour-reset">Reset tutorial progress</button></div>`;
}

let checkResults = null;
function checksTab() {
  const rows = checkResults || [];
  const pass = rows.filter((r) => r.ok === true).length,
    fail = rows.filter((r) => r.ok === false).length,
    warn = rows.filter((r) => r.ok === "warn").length;
  return `<p class="gdv-note">Opens every sidebar route through <code>W.open</code>, checks inline handlers resolve to functions, and walks every tutorial step's target. Your current screen is restored afterwards.</p>
  <div class="gdv-row"><button type="button" class="small" data-act="check-routes">Check routes</button><button type="button" class="small" data-act="check-tours">Check tutorial targets</button><button type="button" class="small" data-act="check-all">Run all</button><button type="button" class="secondary small" data-act="check-copy" ${rows.length ? "" : "disabled"}>Copy report</button></div>
  ${rows.length ? `<p><b class="gdv-ok">${pass} pass</b> · <b class="gdv-bad">${fail} fail</b> · <b class="gdv-warnc">${warn} warn</b></p>` : ""}
  <table class="gdv-checks"><tbody>${rows
    .map((r) => `<tr class="${r.ok === true ? "ok" : r.ok === false ? "bad" : "warn"}"><td>${r.ok === true ? "PASS" : r.ok === false ? "FAIL" : "WARN"}</td><td>${esc(r.name)}</td><td>${r.ms != null ? r.ms.toFixed(0) + "ms" : ""}</td><td>${esc(r.detail || "")}</td></tr>`)
    .join("")}</tbody></table>`;
}

function savesTab() {
  const slots = Array.from({ length: SLOTS }, (_, i) => {
    let meta = null;
    try {
      meta = JSON.parse(store.get(SLOT_KEY + (i + 1)) || "null");
    } catch {}
    return `<tr><td>Slot ${i + 1}</td><td>${meta ? `${esc(meta.label)}<br><small>${esc(new Date(meta.savedAt).toLocaleString())} · ${(meta.payload.length / 1024).toFixed(0)} KB</small>` : "<small>empty</small>"}</td><td><button type="button" class="small" data-act="slot-save" data-slot="${i + 1}">Snapshot</button> <button type="button" class="secondary small gdv-danger" data-act="slot-load" data-slot="${i + 1}" ${meta ? "" : "disabled"}>Restore</button> <button type="button" class="secondary small" data-act="slot-clear" data-slot="${i + 1}" ${meta ? "" : "disabled"}>Clear</button></td></tr>`;
  }).join("");
  return `<h4>Current career</h4>
  <div class="gdv-row"><button type="button" class="small" data-act="export">Export state JSON</button><label class="gdv-file small">Import JSON into this career<input type="file" accept=".json,application/json" data-change="import"></label><button type="button" class="secondary small" data-act="save-now">Save now (Career.save)</button></div>
  <p class="gdv-note">Import validates the file, then replaces the loaded career's state (the career library autosaves it).</p>
  <h4>Local snapshots <small>(localStorage on this device)</small></h4>
  <table><tbody>${slots}</tbody></table>
  <h4>Careers</h4>
  <div class="gdv-row"><select name="newteam">${Array.from({ length: 32 }, (_, i) => `<option value="${i}" ${i === getState()?.team ? "selected" : ""}>${esc(teamName(i))}</option>`).join("")}</select><button type="button" class="small" data-act="new-career">New test career</button><button type="button" class="secondary small" data-act="library">Open career library</button></div>
  <h4>Access</h4>
  <div class="gdv-row"><button type="button" class="small gdv-danger" data-act="lock">Lock this device</button></div>`;
}

function logTab() {
  const filter = ui.logFilter || "";
  const rows = devLog.filter((e) => !filter || e.level.includes(filter) || e.text.toLowerCase().includes(filter.toLowerCase())).slice(-200).reverse();
  return `<div class="gdv-row"><input name="logfilter" placeholder="Filter" value="${esc(filter)}" data-enter="log-filter"><button type="button" class="small" data-act="log-filter">Filter</button><button type="button" class="secondary small" data-act="log-copy">Copy</button><button type="button" class="secondary small gdv-danger" data-act="log-clear">Clear</button></div>
  <p class="gdv-note">${devLog.length} entries captured since load (console errors/warnings, window errors, unhandled rejections, panel failures).</p>
  <div class="gdv-log">${rows.map((e) => `<div class="lv-${esc(e.level.split(" ")[0])}"><small>${new Date(e.at).toLocaleTimeString()} · ${esc(e.level)}</small><pre>${esc(e.text)}</pre></div>`).join("") || "<p class='gdv-note'>Nothing captured.</p>"}</div>`;
}

function renderTab() {
  if (!panel) return;
  panel.querySelectorAll("[data-tab]").forEach((b) => b.classList.toggle("active", b.dataset.tab === ui.tab));
  const body = panel.querySelector(".gdv-body");
  const scroll = body.scrollTop;
  try {
    body.innerHTML = { State: stateTab, Time: timeTab, Players: playersTab, Events: eventsTab, Checks: checksTab, Saves: savesTab, Log: logTab }[ui.tab]();
  } catch (e) {
    body.innerHTML = `<p class="gdv-bad">Could not draw this tab: ${esc(e.message)}</p>`;
    report(e, "Render " + ui.tab);
  }
  body.scrollTop = scroll;
}
const out = (name, html) => {
  const el = panel.querySelector(`[data-out="${name}"]`);
  if (el) el.innerHTML = html;
};

/* -------------------------------------------------------------------- simulation */

let stopRequested = false;
function pendingWork(s) {
  const { News } = M;
  const urgent = News.ensureOffice(s).messages.filter((m) => m.status === "pending" && m.priority === "urgent" && m.team === s.team);
  return { urgent, interview: !!s.interviewPending, conversation: !!s.franchise.cinema?.active };
}
function answerPending() {
  const s = getState(),
    { News, Conversations } = M,
    work = pendingWork(s),
    done = [];
  for (const m of work.urgent) {
    const first = News.decisionOptions(m)[0];
    if (!first) continue;
    commit(`auto-answer ${m.id}`, (d) => News.respondMessage(d, m.id, first.id, { delegated: true }));
    done.push(`Answered “${m.title}” → ${first.text}`);
  }
  if (getState().interviewPending) {
    if (getState().lastMatch) {
      try {
        call("answerInterview", "post", 0);
      } catch {}
    }
    if (getState().interviewPending) commit("dismiss press conference", (d) => (d.interviewPending = null));
    done.push("Held the press conference (first answer)");
  }
  if (getState().franchise.cinema?.active) {
    commit("finish conversation", (d) => {
      for (let i = 0; i < 12 && d.franchise.cinema?.active; i++) {
        const r = Conversations.chooseResponse(d, 0);
        if (r?.complete) break;
      }
      if (d.franchise.cinema?.active) d.franchise.cinema.active = null;
    });
    done.push("Finished the open conversation (first choices)");
  }
  return done;
}
async function simTo(target, label) {
  const { Cal } = M;
  if (!G.Calendar?.start) throw Error("Calendar is not installed yet.");
  if (busy()) throw Error("A simulation or match is already running.");
  const log = [];
  stopRequested = false;
  const t0 = performance.now();
  for (let i = 0; i < 80 && !stopRequested; i++) {
    const before = Cal.ensureCalendar(getState()).date;
    if (before >= target) break;
    status(`${label}: simulating ${before} → ${target}…`, "info");
    if (ui.auto) log.push(...answerPending());
    await G.Calendar.start(target);
    const c = Cal.ensureCalendar(getState());
    if (c.date >= target) break;
    const msg = c.session?.message || "Simulation paused.";
    if (!ui.auto) {
      log.push(`Paused at ${c.date}: ${msg}`);
      break;
    }
    const answered = answerPending();
    log.push(...answered);
    if (!answered.length && c.date === before) {
      log.push(`Stopped at ${c.date}: ${msg}`);
      break;
    }
    if (!answered.length) log.push(`Paused at ${c.date}: ${msg} — retrying`);
  }
  const now = Cal.ensureCalendar(getState()).date;
  out("time", `<p><b>${esc(label)}</b>: now ${esc(now)} (${getState().phase}), ${((performance.now() - t0) / 1000).toFixed(1)}s</p>${log.length ? `<ul>${log.map((l) => `<li>${esc(l)}</li>`).join("")}</ul>` : ""}`);
  return now >= target ? `${label}: reached ${now}.` : `${label}: stopped at ${now} (target ${target}).`;
}
function milestones(s) {
  const { Cal } = M;
  const anchor = Cal.seasonAnchor(s.year),
    lastRegular = Cal.addDays(anchor, (s.schedule.length - 1) * 7 + 6),
    dates = Cal.leagueDates(s.year, s.schedule.length);
  return { lastRegular, championship: dates.championship, offseason: Cal.addDays(dates.championship, 1), draft: dates.draft, camp: dates.camp, beforeCamp: Cal.addDays(dates.camp, -1) };
}
async function simMilestone(key, label) {
  const s = getState();
  const m = milestones(s);
  const target = m[key];
  if (M.Cal.ensureCalendar(s).date >= target) return `${label}: already past ${target}.`;
  return simTo(target, label);
}

/* ----------------------------------------------------------------------- checks */

function visible(el) {
  return !!el && (el.getClientRects?.().length > 0 || el.offsetParent !== null);
}
// Inline handlers run in global scope; game.js declares its handlers as functions (window
// properties) and modules publish theirs on window, so window is the resolution root. No eval:
// the desktop CSP forbids it.
function globalResolves(path) {
  return typeof resolvePath(G, path) === "function";
}
function errorsSince(n) {
  return devLog.slice(n).filter((e) => e.level !== "warn");
}
async function checkRoutes() {
  if (busy()) throw Error("Wait for the current simulation or match to finish.");
  const results = [];
  const original = ctx.getSection?.() || "Overview";
  const nav = [...document.querySelectorAll("#nav [onclick]")];
  if (!nav.length) results.push({ name: "#nav", ok: false, detail: "No sidebar entries with onclick found." });
  const seenRoutes = new Set();
  const badHandlers = new Map();
  const scanHandlers = (scope, route) => {
    for (const el of document.querySelectorAll(`${scope} [onclick]`))
      for (const path of callTargets(el.getAttribute("onclick")))
        if (!globalResolves(path) && !badHandlers.has(path)) badHandlers.set(path, `${route}: ${el.getAttribute("onclick").slice(0, 80)}`);
  };
  scanHandlers("#nav", "sidebar");
  for (const el of nav) {
    const code = el.getAttribute("onclick");
    const target = parseOpen(code);
    if (!target) continue;
    const key = target.route + (target.tab ? " / " + target.tab : "");
    if (seenRoutes.has(key)) continue;
    seenRoutes.add(key);
    const logAt = devLog.length;
    const t0 = performance.now();
    let error = null;
    try {
      G.W.open(target.route, target.tab);
    } catch (e) {
      error = e;
    }
    await new Promise((r) => setTimeout(r, 0));
    const ms = performance.now() - t0;
    const later = errorsSince(logAt);
    const app = document.getElementById("app");
    const empty = !app || !app.textContent.trim();
    scanHandlers("#app", key);
    scanHandlers("dialog[open]", key);
    if (document.getElementById("modal")?.open) call("closeModal");
    results.push({
      name: "Route " + key,
      ms,
      ok: error || later.length ? false : empty ? "warn" : true,
      detail: error ? "Threw: " + error.message : later.length ? later.map((e) => e.text.split("\n")[0]).join(" | ").slice(0, 300) : empty ? "#app rendered empty" : "",
    });
  }
  for (const [path, where] of badHandlers) results.push({ name: "Handler " + path, ok: false, detail: "Does not resolve to a function · " + where });
  if (!badHandlers.size) results.push({ name: "Inline handlers", ok: true, detail: "All onclick call targets resolve" });
  try {
    G.W.open(original);
  } catch {}
  // The desktop sidebar must never scroll (presentation.mjs fitNavigation scales it to fit).
  const navBox = document.getElementById("nav");
  if (navBox && window.innerWidth > 900) {
    const fits = navBox.scrollHeight <= navBox.clientHeight + 1,
      scale = getComputedStyle(document.querySelector("aside")).getPropertyValue("--nav-scale") || "1";
    results.push({ name: "Sidebar fits", ok: fits, detail: `${window.innerWidth}×${window.innerHeight} · scale ${scale}${document.querySelector("aside.nav-folded") ? " · groups folded" : ""}${fits ? "" : ` · ${navBox.scrollHeight - navBox.clientHeight}px overflow`}` });
  }
  return results;
}
async function checkTours() {
  if (busy()) throw Error("Wait for the current simulation or match to finish.");
  const { Tours } = M;
  const results = [];
  const original = ctx.getSection?.() || "Overview";
  G.Tutorial?.stop?.();
  for (const tour of Tours.TOURS) {
    const t0 = performance.now();
    const missing = [];
    for (const [i, step] of tour.steps.entries()) {
      try {
        if (step.route) G.W.open(step.route);
        if (step.prepare) step.prepare();
      } catch (e) {
        missing.push(`#${i + 1} threw ${e.message}`);
        continue;
      }
      await new Promise((r) => setTimeout(r, 0));
      if (!step.target) continue;
      const sels = [].concat(step.target);
      const found = sels.some((sel) => {
        try {
          return [...document.querySelectorAll(sel)].some(visible);
        } catch {
          return false;
        }
      });
      if (!found) missing.push(`#${i + 1} ${sels.join(" | ")}`);
    }
    if (document.getElementById("modal")?.open) call("closeModal");
    results.push({ name: `Tour ${tour.id} (${tour.steps.length} steps)`, ms: performance.now() - t0, ok: !missing.length, detail: missing.length ? "Missing target: " + missing.join("; ") : "" });
  }
  try {
    G.W.open(original);
  } catch {}
  return results;
}

/* ---------------------------------------------------------------------- actions */

const POSITIONS = () => [...new Set(M.S.POS)];
function download(name, text) {
  const url = URL.createObjectURL(new Blob([text], { type: "application/json" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
async function copy(text) {
  await navigator.clipboard.writeText(text);
}
function slotAt(el) {
  return Number(el.dataset.slot);
}

const ACTIONS = {
  // State
  "go-path"() {
    ui.path = val("path").trim();
    saveUI();
    renderTab();
    return resolvePath(getState(), ui.path) === undefined && ui.path ? `Path “${ui.path}” not found.` : `Showing ${ui.path || "state"}.`;
  },
  async "copy-json"() {
    const text = JSON.stringify(pathValue(getState(), ui.path), null, 2);
    await copy(text);
    return `Copied ${(text.length / 1024).toFixed(1)} KB (${ui.path || "state"}).`;
  },
  validate() {
    const s = getState(),
      { S, Compliance } = M,
      lines = [];
    try {
      S.validate(structuredClone(s));
      lines.push(["ok", "validate(state): passed"]);
    } catch (e) {
      lines.push(["bad", "validate(state): " + e.message]);
    }
    try {
      for (const e of S.gameEligibility(s)) lines.push(["warn", "Game eligibility: " + e]);
    } catch (e) {
      lines.push(["bad", "gameEligibility threw: " + e.message]);
    }
    try {
      for (const i of Compliance.complianceReport(s).issues || []) lines.push(["warn", "Compliance: " + i.message]);
    } catch (e) {
      lines.push(["bad", "complianceReport threw: " + e.message]);
    }
    out("validate", `<ul>${lines.map(([k, t]) => `<li class="gdv-${k === "ok" ? "ok" : k === "bad" ? "bad" : "warnc"}">${esc(t)}</li>`).join("")}</ul>`);
    return lines.some(([k]) => k === "bad") ? "Validation found errors." : "Validation passed.";
  },
  // Time
  "sim-days"() {
    const n = Math.round(num("days", "Days"));
    if (n < 1 || n > 730) throw Error("Choose 1–730 days.");
    return simTo(M.Cal.addDays(M.Cal.ensureCalendar(getState()).date, n), `Advance ${n} days`);
  },
  "sim-date"() {
    const d = val("date");
    if (!/^\d{4}-\d{2}-\d{2}$/.test(d)) throw Error("Choose a date.");
    return simTo(d, "Sim to " + d);
  },
  "sim-regular": () => simMilestone("lastRegular", "End of regular season"),
  "sim-playoffs": () => simMilestone("championship", "End of playoffs"),
  "sim-offseason": () => simMilestone("offseason", "Into the offseason"),
  "sim-draft"() {
    if (getState().phase !== "offseason") return simMilestone("draft", "Draft day (via season end)");
    return simMilestone("draft", "Draft day");
  },
  async "sim-next"() {
    if (!(await confirmBox("Simulate to the end of this offseason and begin the next season? Unmade draft picks are auto-selected by the game's own Begin next season flow (F.confirmSeason)."))) return "Cancelled.";
    let s = getState();
    if (s.phase !== "offseason") await simMilestone("offseason", "Into the offseason");
    s = getState();
    if (s.phase !== "offseason") return "Did not reach the offseason; see the log above.";
    const m = milestones(s);
    if (M.Cal.ensureCalendar(s).date < m.beforeCamp) await simTo(m.beforeCamp, "Offseason");
    const year = getState().year;
    G.F.confirmSeason();
    return getState().year > year ? `Season ${getState().year} training camp is open.` : "Begin next season did not complete — check the toast/compliance messages.";
  },
  "sim-stop"() {
    stopRequested = true;
    G.Calendar?.stop?.();
    return "Stop requested.";
  },
  "answer-now"() {
    const done = answerPending();
    out("time", done.length ? `<ul>${done.map((l) => `<li>${esc(l)}</li>`).join("")}</ul>` : "<p>Nothing pending.</p>");
    return done.length ? `Answered ${done.length} item(s).` : "Nothing pending.";
  },
  // Players
  search() {
    ui.q = val("q");
    out("players", searchHTML(ui.q));
  },
  select(el) {
    ui.sel = el.dataset.id;
    out("editor", editorHTML());
    out("players", searchHTML(ui.q));
    return "Selected " + ui.sel;
  },
  "save-player"() {
    const id = ui.sel;
    const v = { ovr: num("ed-ovr", "OVR"), pot: num("ed-pot", "POT"), age: num("ed-age", "Age"), morale: num("ed-morale", "Morale"), injury: num("ed-injury", "Injury weeks"), status: val("ed-status") };
    if (v.ovr < 1 || v.ovr > 99 || v.pot < 1 || v.pot > 99) throw Error("Ratings must be 1–99.");
    const name = commit(`edit ${id}`, (s) => {
      const found = allPlayers(s).find(({ p }) => p.id === id);
      if (!found) throw Error("Player not found.");
      const p = found.p;
      // Ratings are recomputed from base + development + performance on load; shift the base so the edit sticks.
      if (p.ratings && Number.isFinite(p.ratings.base)) p.ratings.base += v.ovr - p.ovr;
      p.ovr = Math.round(v.ovr);
      p.pot = Math.max(Math.round(v.pot), p.ovr);
      p.age = Math.round(v.age);
      p.morale = Math.max(0, Math.min(100, Math.round(v.morale)));
      p.injury = Math.max(0, Math.round(v.injury));
      if (!p.injury && s.franchise.medical?.cases?.[id]) delete s.franchise.medical.cases[id];
      if (p.injury || p.status === "ir") p.starter = false;
      p.status = v.status;
      if (p.status !== "active" && p.status !== "elevated") p.starter = false;
      return p.name;
    });
    out("editor", editorHTML());
    return `Saved edits to ${name}.`;
  },
  "open-player"() {
    const s = getState(),
      found = locate(s, ui.sel);
    if (!found || found.team === "fa") throw Error("Profiles open for rostered players only.");
    G.W.player(ui.sel, found.team);
  },
  async move() {
    const dest = val("movedest");
    const s = getState(),
      found = locate(s, ui.sel);
    if (!found) throw Error("Player not found.");
    if (!(await confirmBox(`Move ${found.p.name} from ${teamName(found.team)} to ${teamName(dest === "fa" ? "fa" : Number(dest))}? Bypasses waivers, dead money and roster rules (validation still runs).`))) return "Cancelled.";
    const p = commit(`move ${ui.sel} → ${dest}`, (d) => moveTo(d, ui.sel, dest === "fa" ? "fa" : Number(dest)));
    out("editor", editorHTML());
    out("players", searchHTML(ui.q));
    return `Moved ${p.name} to ${teamName(dest === "fa" ? "fa" : Number(dest))}.`;
  },
  async heal() {
    const s = getState();
    const n = allPlayers(s).filter(({ p }) => p.injury > 0).length;
    if (!(await confirmBox(`Heal ${n} injured player(s) across the league and close their medical cases?`))) return "Cancelled.";
    commit("heal all", (d) => {
      for (const { p } of allPlayers(d))
        if (p.injury > 0 || p.status === "ir") {
          p.injury = 0;
          if (p.medical) p.medical = { ...p.medical, weeks: 0 };
        }
      if (d.franchise.medical?.cases) d.franchise.medical.cases = {};
    });
    return `Healed ${n} player(s). IR designations are unchanged (move players back from IR in Roster).`;
  },
  cap() {
    const m = num("capdelta", "Cap change");
    const cents = Math.round(m * M.S.MILLION);
    if (!cents) throw Error("Enter a non-zero amount.");
    commit(`cap adjustment ${m}M`, (s) => {
      (s.franchise.capAdjustments ??= []).push({ team: s.team, year: M.S.financeYear(s), amount: -cents, reason: "Developer cap adjustment" });
    });
    refreshSummary();
    return `Cap room ${m > 0 ? "+" : ""}${m}M. Room now $${(M.S.capLedger(getState()).room / M.S.MILLION).toFixed(2)}M.`;
  },
  async "cap-clear"() {
    if (!(await confirmBox("Remove every developer cap adjustment from this career?"))) return "Cancelled.";
    let n = 0;
    commit("clear dev cap adjustments", (s) => {
      const list = s.franchise.capAdjustments || [];
      n = list.filter((a) => a.reason === "Developer cap adjustment").length;
      s.franchise.capAdjustments = list.filter((a) => a.reason !== "Developer cap adjustment");
    });
    return `Removed ${n} adjustment(s).`;
  },
  generate() {
    const pos = val("genpos"),
      dest = val("gendest"),
      rookie = panel.querySelector('[name="genrookie"]').checked;
    const p = commit(`generate ${pos}`, (s) => {
      const id = `dev-${s.year}-${(s.franchise.spawnSerial = (s.franchise.spawnSerial || 0) + 1)}-${Date.now().toString(36)}`;
      const player = M.S.makePlayer(id, pos, Date.now() % 100000, rookie);
      M.Ratings.ensurePlayerRatings?.(player);
      s.agents.push(player);
      if (dest !== "fa") moveTo(s, id, Number(dest));
      return player;
    });
    ui.sel = p.id;
    ui.q = p.id;
    renderTab();
    return `Added ${p.name} (${p.pos}, ${p.ovr} OVR) to ${teamName(dest === "fa" ? "fa" : Number(dest))}.`;
  },
  async "force-trade"() {
    const give = val("tradegive").trim(),
      get = val("tradeget").trim(),
      s = getState();
    const a = locate(s, give),
      b = locate(s, get);
    if (!a || a.team !== s.team) throw Error("“Your player id” must be on your roster.");
    if (!b || b.team === s.team || b.team === "fa") throw Error("“Their player id” must be on another club.");
    if (!(await confirmBox(`FORCE TRADE (bypasses AI acceptance and cap checks): ${a.p.name} → ${teamName(b.team)} for ${b.p.name}?`))) return "Cancelled.";
    commit(`force trade ${give} ⇄ ${get}`, (d) => {
      moveTo(d, give, b.team);
      moveTo(d, get, d.team);
      M.S.log(d, "Trade agreed", `${b.p.name} acquired from the ${teamName(b.team)} for ${a.p.name} (test console).`);
    });
    return `Traded ${a.p.name} for ${b.p.name}.`;
  },
  async "force-sign"() {
    const id = val("signid").trim(),
      s = getState(),
      a = locate(s, id);
    if (!a || a.team !== "fa") throw Error("That id is not a free agent.");
    if (!(await confirmBox(`FORCE SIGN (bypasses player acceptance and cap checks): ${a.p.name} to your club on a basic 3-year contract?`))) return "Cancelled.";
    commit(`force sign ${id}`, (d) => moveTo(d, id, d.team));
    return `Signed ${a.p.name}.`;
  },
  // Events
  scene(el) {
    if (!G.Cinematics?.preview) throw Error("Cinematics are not installed.");
    G.Cinematics.preview(el.dataset.kind);
    return `Playing ${el.dataset.kind}.`;
  },
  async arrival() {
    const s = getState();
    const best = (s.agents || []).slice().sort((a, b) => b.ovr - a.ovr)[0];
    if (!best) throw Error("No free agents available.");
    if (!(await confirmBox(`Force-sign ${best.name} (${best.pos}, ${best.ovr}) to your club? The arrivals system picks up the move on the next render.`))) return "Cancelled.";
    commit(`arrival ${best.id}`, (d) => moveTo(d, best.id, d.team));
    return `${best.name} signed; arrival cards/news fire on render.`;
  },
  news() {
    commit("news story", (s) => M.News.postStory(s, "dev-" + Date.now(), { title: "Test bulletin from the front office", body: "A generated story to check the news feed, cards and unread counts.", category: "Team" }));
    return "Story posted (News).";
  },
  press() {
    const s = getState();
    if (!s.lastMatch) throw Error("A press conference needs a completed match (state.lastMatch). Play or sim a game first.");
    commit("press conference", (d) => (d.interviewPending = { type: "post", year: d.year, week: d.week }));
    G.Cinematics?.preview?.("PressConference");
    return "Press conference pending (Continue / Matchday will hold it).";
  },
  "msg-urgent"() {
    const s = getState();
    const p = s.roster.slice().sort((a, b) => b.ovr - a.ovr)[0];
    commit("urgent decision", (d) =>
      M.News.postMessage(d, "dev-urgent-" + Date.now(), { title: `Test: ${p?.name || "A player"} wants clarity on his role`, summary: "Generated urgent decision.", body: "Generated by the test console to exercise urgent decisions, calendar pausing and the inbox.", category: "Players", priority: "urgent", source: "Player liaison", playerId: p?.id, decision: "role", route: "Inbox" }),
    );
    return "Urgent decision posted (Inbox). Calendar sims will pause on it.";
  },
  "msg-injury"() {
    const s = getState();
    const p = s.roster.filter((x) => x.starter && !x.injury)[0] || s.roster.find((x) => !x.injury);
    if (!p) throw Error("No healthy player to injure.");
    commit(`injury report ${p.id}`, (d) => {
      const q = d.roster.find((x) => x.id === p.id);
      if (!q.injury) q.injury = 2;
      const c = M.Medical.openCase(d, q);
      q.starter = false;
      M.News.postMessage(d, "dev-injury-" + Date.now(), { title: `Medical update: ${q.name}`, summary: `${c.label} · ${q.injury} week(s) remaining at this report.`, body: "Generated by the test console. Review the case in Medical.", category: "Medical", source: "Medical team", playerId: q.id, route: "Medical" });
    });
    return `${p.name} injured; medical case opened and report posted.`;
  },
  "msg-board"() {
    commit("board memo", (d) =>
      M.News.postMessage(d, "dev-board-" + Date.now(), { title: "Ownership requests a meeting on expectations", summary: "Generated board memo.", body: "Generated by the test console. Set the expectation message for the season.", category: "Team", priority: "urgent", source: "Ownership", decision: "expectations", route: "Boardroom" }),
    );
    return "Board memo posted (Inbox).";
  },
  "force-event"(el) {
    commit(`world event ${el.dataset.kind}`, (d) => {
      M.World.forceEvent(d, el.dataset.kind);
      M.News.syncOffice(d);
    });
    return `${el.dataset.kind} forced (World.forceEvent) and synced to the inbox.`;
  },
  "trim-preview"() {
    if (!G.Office?.trimPreview) throw Error("Office is not installed.");
    G.Office.trimPreview();
  },
  tour(el) {
    if (!G.Tutorial?.start) throw Error("Tutorials are not installed.");
    G.Tutorial.start(el.dataset.id);
    return `Started tour ${el.dataset.id}.`;
  },
  async "tour-reset"() {
    if (!(await confirmBox("Reset tutorial progress on this device?"))) return "Cancelled.";
    G.Tutorial.reset();
    return "Tutorial progress reset.";
  },
  // Checks
  async "check-routes"() {
    checkResults = await checkRoutes();
    renderTab();
    return summaryLine();
  },
  async "check-tours"() {
    checkResults = await checkTours();
    renderTab();
    return summaryLine();
  },
  async "check-all"() {
    checkResults = [...(await checkRoutes()), ...(await checkTours())];
    renderTab();
    return summaryLine();
  },
  async "check-copy"() {
    await copy((checkResults || []).map((r) => `${r.ok === true ? "PASS" : r.ok === false ? "FAIL" : "WARN"}\t${r.name}\t${r.ms != null ? r.ms.toFixed(0) + "ms" : ""}\t${r.detail || ""}`).join("\n"));
    return "Report copied.";
  },
  // Saves
  export() {
    const s = getState();
    download(`gridiron-state-${s.year}-${s.phase}-${new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-")}.json`, M.Ratings.serializeCareer(s));
    return "Exported current state.";
  },
  async import(el) {
    const file = el.files?.[0];
    el.value = "";
    if (!file) return "No file chosen.";
    const parsed = M.Saves.parseCareerSave(await file.text());
    M.S.migrate(parsed.state);
    M.S.validate(parsed.state);
    if (!(await confirmBox(`Replace the loaded career's state with ${file.name} (${parsed.state.year}, ${teamName(parsed.state.team)})? The current state is overwritten on the next autosave.`))) return "Cancelled.";
    replaceCareer(parsed.state);
    return `Imported ${file.name} into the current career.`;
  },
  async "save-now"() {
    await G.Career?.save?.();
    return "Career.save() called.";
  },
  "slot-save"(el) {
    const s = getState(),
      payload = M.Ratings.serializeCareer(s);
    const meta = { savedAt: Date.now(), label: `${teamAbbr(s.team)} ${s.year} ${s.phase}${s.phase === "season" ? " wk" + (s.week + 1) : ""}`, payload };
    try {
      store.set(SLOT_KEY + slotAt(el), JSON.stringify(meta));
    } catch (e) {
      throw Error(`localStorage refused ${(payload.length / 1024 / 1024).toFixed(1)} MB (${e.message}). Use Export instead.`);
    }
    renderTab();
    return `Snapshot saved to slot ${slotAt(el)}.`;
  },
  async "slot-load"(el) {
    const meta = JSON.parse(store.get(SLOT_KEY + slotAt(el)) || "null");
    if (!meta) throw Error("Slot is empty.");
    if (!(await confirmBox(`Restore slot ${slotAt(el)} (${meta.label}) over the loaded career? Unsaved progress since then is lost.`))) return "Cancelled.";
    replaceCareer(M.Saves.parseCareerSave(meta.payload).state);
    return `Restored slot ${slotAt(el)}.`;
  },
  async "slot-clear"(el) {
    if (!(await confirmBox(`Clear snapshot slot ${slotAt(el)}?`))) return "Cancelled.";
    store.remove(SLOT_KEY + slotAt(el));
    renderTab();
    return `Cleared slot ${slotAt(el)}.`;
  },
  "new-career"() {
    if (!G.Career?.new) throw Error("Career manager is not installed.");
    G.Career.new(Number(val("newteam")));
    return "Career wizard opened (the current career stays in the library).";
  },
  library() {
    G.Career?.open?.();
  },
  async lock() {
    if (!(await confirmBox("Lock this device? The panel closes and needs the passphrase again."))) return "Cancelled.";
    store.remove(STORAGE_KEY);
    store.remove(UI_KEY);
    ui.open = false;
    panel.remove();
    panel = null;
    logListener = null;
    return null;
  },
  // Log
  "log-filter"() {
    ui.logFilter = val("logfilter");
    renderTab();
  },
  async "log-copy"() {
    await copy(devLog.map((e) => `${new Date(e.at).toISOString()} [${e.level}] ${e.text}`).join("\n"));
    return `Copied ${devLog.length} entries.`;
  },
  async "log-clear"() {
    if (!(await confirmBox("Clear the captured log?"))) return "Cancelled.";
    devLog.length = 0;
    renderTab();
    return "Log cleared.";
  },
};
function summaryLine() {
  const r = checkResults || [];
  return `${r.filter((x) => x.ok === true).length} pass, ${r.filter((x) => x.ok === false).length} fail, ${r.filter((x) => x.ok === "warn").length} warn.`;
}

// Domain helpers behind the Players and Time tabs, exposed for regression tests.
export const internals = { deps, moveTo, locate, allPlayers, milestones };
