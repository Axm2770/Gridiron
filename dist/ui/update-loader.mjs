// Desktop startup auto-update: when the game starts and a new version is out, save the career,
// download and verify the update behind a full-screen pixel loading page, then reload (content
// update) or restart (app update) straight back into the same career. Updates found later in a
// session keep the corner banner (update-banner.mjs). The browser build never loads this file.
//
// The pure parts (setting, notice, loader state machine, runStartupUpdate) take their
// dependencies as arguments so test-update-loader.mjs can run them in Node without a DOM.

export const AUTO_UPDATE_KEY = "gridiron-auto-update";
export const NOTICE_KEY = "gridiron-auto-update-notice";
const NOTICE_TTL = 15 * 60 * 1000;
const MB = 1024 * 1024;

// "Update automatically when the game starts" (Settings → Interface). On unless turned off.
export function autoUpdateEnabled(storage) {
  try {
    return storage?.getItem(AUTO_UPDATE_KEY) !== "false";
  } catch {
    return true;
  }
}
export function setAutoUpdate(storage, on) {
  try {
    storage?.setItem(AUTO_UPDATE_KEY, on ? "true" : "false");
  } catch {}
}

// Written just before an update downloads, read once on the next start to say "Updated to …".
function writeNotice(storage, notice) {
  try {
    storage?.setItem(NOTICE_KEY, JSON.stringify(notice));
  } catch {}
}
function clearNotice(storage) {
  try {
    storage?.removeItem(NOTICE_KEY);
  } catch {}
}
// Returns { to, from } when the game now runs the version the last auto-update installed, and
// forgets the notice either way (a rolled-back update must not claim success).
export function takeUpdatedNotice(storage, status, now = Date.now()) {
  let notice = null;
  try {
    notice = JSON.parse(storage?.getItem(NOTICE_KEY) || "null");
  } catch {}
  if (!notice) return null;
  clearNotice(storage);
  if (typeof notice.to !== "string" || !(now - Number(notice.at) < NOTICE_TTL)) return null;
  return status?.current === notice.to ? { to: notice.to, from: notice.from || null, kind: notice.kind || "content" } : null;
}

// ------------------------------------------------------------------ loader state machine
export const STEP_IDS = ["save", "download", "verify", "install", "restart"];
const STAGE_STEP = { download: "download", verify: "verify", install: "install" };

export function initialLoader(status) {
  return {
    step: "save",
    kind: status?.kind === "app" ? "app" : "content",
    from: status?.current || null,
    to: status?.latest || null,
    files: Number(status?.files) || 0,
    bytes: Number(status?.bytes) || 0,
    progress: 0,
    doneFiles: 0,
    downloadedBytes: 0,
    error: null,
  };
}

// Pure reducer: events are { type: "saved" }, { type: "status", status } (updater status) and
// { type: "fail", message }. The step only moves forward; an error freezes it where it failed.
export function loaderReducer(state, event) {
  if (!state || state.error || state.step === "done") return state;
  const at = (step) => Math.max(STEP_IDS.indexOf(state.step), STEP_IDS.indexOf(step));
  switch (event?.type) {
    case "saved":
      return { ...state, step: "download" };
    case "fail":
      return { ...state, error: String(event.message || "The update stopped.") };
    case "status": {
      const s = event.status || {};
      if (s.phase === "error") return { ...state, error: s.message || "The update couldn't be installed. Your game is unchanged." };
      if (s.phase === "ready") return { ...state, step: "restart", progress: 100, doneFiles: state.files, downloadedBytes: state.bytes };
      if (s.phase !== "downloading") return state;
      const step = STEP_IDS[at(STAGE_STEP[s.stage] || "download")];
      return {
        ...state,
        step,
        progress: Math.max(state.progress, Number(s.progress) || 0),
        doneFiles: Math.max(state.doneFiles, Number(s.doneFiles) || 0),
        downloadedBytes: Math.max(state.downloadedBytes, Number(s.downloadedBytes) || 0),
      };
    }
    default:
      return state;
  }
}

const size = (n) => (n >= MB ? (n / MB).toFixed(1) + " MB" : Math.max(n ? 1 : 0, Math.round(n / 1024)) + " KB");

// What the loading page shows for a state: overall percent, the five steps and their status.
export function loaderView(state) {
  const index = STEP_IDS.indexOf(state.step),
    app = state.kind === "app",
    download = Math.min(100, state.progress);
  const percent = state.step === "save" ? 3 : state.step === "download" ? 6 + Math.round(download * 0.76) : state.step === "verify" ? 86 : state.step === "install" ? 93 : 100;
  const detail = {
    save: index > 0 ? "Saved" : "Saving…",
    download: app
      ? `${size(Math.min(state.downloadedBytes, state.bytes))} of ${size(state.bytes)}`
      : `${Math.min(state.doneFiles, state.files)}/${state.files} file${state.files === 1 ? "" : "s"} · ${size(Math.min(state.downloadedBytes, state.bytes))} of ${size(state.bytes)}`,
    verify: index > 2 ? "All files match" : "",
    install: index > 3 ? "Done" : "",
    restart: "",
  };
  const label = {
    save: "Saving your career",
    download: "Downloading",
    verify: "Verifying",
    install: "Installing",
    restart: app ? "Restarting" : "Reloading",
  };
  return {
    percent: state.error ? Math.min(percent, 99) : percent,
    error: state.error,
    from: state.from,
    to: state.to,
    headline: state.error ? "Update postponed" : state.step === "restart" ? (app ? "Restarting into" : "Reloading into") + ` v${state.to}` : "Updating Gridiron Director",
    steps: STEP_IDS.map((id, i) => ({
      id,
      label: label[id],
      detail: i <= index || (id === "download" && index > 1) ? detail[id] : "",
      state: i < index ? "done" : i === index ? (state.error ? "error" : "active") : "pending",
    })),
  };
}

// ------------------------------------------------------------------ the startup flow
// Waits until the updater leaves "checking" (another check may already be running).
function settled(status, subscribe, timeout = 60000) {
  if (!status || status.phase !== "checking") return Promise.resolve(status);
  return new Promise((resolve) => {
    let done = false;
    const finish = (s) => {
      if (done) return;
      done = true;
      off?.();
      clearTimeout(timer);
      resolve(s);
    };
    const off = subscribe((s) => s.phase !== "checking" && finish(s));
    const timer = setTimeout(() => finish({ phase: "error", message: "The update check timed out." }), timeout);
  });
}

// Returns { outcome } — one of unsupported, disabled, no-update, check-error, setting-off,
// too-late, save-failed, error, applied — so the caller and tests can see what happened.
// deps: api (window.gridironUpdates), storage, isStartup(), save(), loader ({ show, update }),
// subscribe(fn) → unsubscribe, wait(ms), later(fn, ms).
export async function runStartupUpdate({ api, storage, isStartup, save, loader, subscribe, wait = (ms) => new Promise((r) => setTimeout(r, ms)), later = (fn, ms) => setTimeout(fn, ms) }) {
  if (!api || typeof api.startupCheck !== "function") return { outcome: "unsupported" };
  let status;
  try {
    status = await settled(await api.startupCheck(), subscribe);
  } catch (error) {
    return { outcome: "check-error", message: error.message };
  }
  if (!status || status.phase === "disabled") return { outcome: "disabled" };
  if (status.phase === "error") return { outcome: "check-error", message: status.message };
  if (status.phase !== "available") return { outcome: "no-update", status };
  if (!autoUpdateEnabled(storage)) return { outcome: "setting-off", status };
  if (!isStartup()) return { outcome: "too-late", status };

  let state = initialLoader(status);
  const push = (event) => {
    const next = loaderReducer(state, event);
    if (next !== state) {
      state = next;
      loader.update(state);
    }
  };
  loader.show(state);
  try {
    await save();
  } catch (error) {
    push({ type: "fail", message: `Your career couldn't be saved (${error?.message || error}), so the update waits until next time. Nothing has changed.` });
    return { outcome: "save-failed", state };
  }
  push({ type: "saved" });
  writeNotice(storage, { from: status.current, to: status.latest, kind: state.kind, at: Date.now() });
  const off = subscribe((s) => push({ type: "status", status: s }));
  let result;
  try {
    result = await api.download();
  } catch (error) {
    result = { phase: "error", message: `The update couldn't be installed: ${error?.message || error}. Your game is unchanged.` };
  }
  off?.();
  push({ type: "status", status: result || { phase: "error" } });
  if (state.error || result?.phase !== "ready") {
    clearNotice(storage);
    if (!state.error) push({ type: "fail", message: "The update couldn't be installed. Your game is unchanged." });
    return { outcome: "error", state };
  }
  // Long enough for the touchdown and the lights-down "See you at kickoff" frame (it starts at 1.6s).
  await wait(2600);
  api.reload();
  // A restart that never happens (the install helper couldn't start) must not trap the player.
  later(() => {
    clearNotice(storage);
    push({ type: "fail", message: `Version ${status.latest} is downloaded but the game didn't ${state.kind === "app" ? "restart" : "reload"}. Close and reopen Gridiron Director to finish; your career is saved.` });
  }, state.kind === "app" ? 30000 : 20000);
  return { outcome: "applied", state };
}

// ------------------------------------------------------------------ pixel art
// The night-stadium scene lives in update-loader-art.mjs (canvas, integer-scaled). This file
// keeps the flow and the readable HUD: title, steps, progress, tip or error and its buttons.
import { createStage, sceneModel, trophySVG } from "./update-loader-art.mjs";

const TIPS = [
  "Your career was saved before anything changed.",
  "Every file is checked against the release before it is used.",
  "If an update ever fails to start, the game rolls back on its own.",
  "Turn this off in Settings → Interface → Update automatically.",
  "Updates found while you play wait for you in the corner.",
];

// ------------------------------------------------------------------ DOM
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
const GLYPH = { done: "✓", active: "▶", pending: "", error: "✕" };
const SAY = { done: "done", active: "in progress", error: "stopped", pending: "waiting" };

function ensureStyles() {
  if (document.querySelector("link[data-gd-uload]")) return;
  const link = document.createElement("link");
  link.rel = "stylesheet";
  link.href = new URL("./update-loader.css", import.meta.url).href;
  link.dataset.gdUload = "";
  document.head.append(link);
}

// Keeps a modal dialog above every other dialog the game opens while it is up (the career
// library opens with showModal() as the workspace finishes loading).
function keepOnTop(dialog) {
  const observer = new MutationObserver((records) => {
    if (!dialog.open) return;
    if (records.some((r) => r.target !== dialog && r.target.tagName === "DIALOG" && r.target.open)) {
      dialog.close();
      dialog.showModal();
    }
  });
  observer.observe(document.body, { attributes: true, attributeFilter: ["open"], subtree: true });
  return () => observer.disconnect();
}

// The HUD along the bottom of the stadium. Built once per tone (working / error); every
// progress tick afterwards only touches the text and attributes that changed.
function hudMarkup(v, err) {
  const steps = v.steps
    .map((s) => `<li data-step="${s.id}"><span class="gd-uload-glyph" aria-hidden="true"></span><span class="gd-uload-label">${esc(s.label)}<span class="gd-uload-sr"></span></span><small></small></li>`)
    .join("");
  return `<div class="gd-uload-hud-main"><div class="gd-uload-bar"><span class="gd-uload-kicker"><i></i>${err ? "Update paused" : "Game update"}</span><span class="gd-uload-versions"><b>v${esc(v.from)}</b><span aria-hidden="true">→</span><b>v${esc(v.to)}</b></span></div><h1 id="gd-uload-title" class="gd-uload-title"></h1>${
    err ? `<p class="gd-uload-error" role="alert"></p>` : `<p class="gd-uload-tip"><span>Tip</span><em></em></p>`
  }</div><div class="gd-uload-hud-side"><ol class="gd-uload-steps">${steps}</ol>${
    err
      ? `<div class="gd-uload-actions"><button type="button" class="secondary" data-act="release">Release notes</button><button type="button" data-act="continue">Continue playing</button></div>`
      : `<p class="gd-uload-now" aria-live="polite"></p><div class="gd-uload-meter" role="progressbar" aria-label="Update progress" aria-valuemin="0" aria-valuemax="100"><span class="gd-uload-segs">${"<i></i>".repeat(20)}</span><b class="gd-uload-pct"></b></div>`
  }</div>`;
}
const setText = (el, s) => {
  if (el && el.textContent !== s) el.textContent = s;
};

// The full-screen loading page. show(state) opens it, update(state) repaints it.
export function createLoaderUI({ api, onClose = () => {} } = {}) {
  let dialog = null,
    hud = null,
    stage = null,
    release = null,
    tipTimer = null,
    tip = 0,
    painted = null;
  const close = () => {
    clearInterval(tipTimer);
    release?.();
    stage?.stop();
    stage = null;
    if (dialog?.open) dialog.close();
    dialog?.remove();
    dialog = null;
    document.body.classList.remove("gd-updating");
    onClose();
  };
  const paint = (state) => {
    const v = loaderView(state),
      err = !!v.error;
    if (painted !== err) {
      painted = err;
      dialog.dataset.tone = err ? "warn" : "info";
      hud.innerHTML = hudMarkup(v, err);
      setText(hud.querySelector(".gd-uload-tip em"), TIPS[tip % TIPS.length]);
      stage?.resize();
      if (err) dialog.querySelector('[data-act="continue"]')?.focus();
    }
    dialog.dataset.step = err ? "error" : state.step;
    setText(hud.querySelector(".gd-uload-title"), v.headline);
    const meter = hud.querySelector(".gd-uload-meter");
    if (meter && meter.getAttribute("aria-valuenow") !== String(v.percent)) {
      meter.setAttribute("aria-valuenow", String(v.percent));
      setText(meter.querySelector(".gd-uload-pct"), v.percent + "%");
      const lit = Math.round(v.percent / 5);
      meter.querySelectorAll(".gd-uload-segs i").forEach((seg, i) => seg.classList.toggle("on", i < lit));
    }
    const items = hud.querySelectorAll(".gd-uload-steps li");
    v.steps.forEach((s, i) => {
      const li = items[i];
      if (!li) return;
      if (li.dataset.state !== s.state) {
        li.dataset.state = s.state;
        setText(li.querySelector(".gd-uload-glyph"), GLYPH[s.state]);
        setText(li.querySelector(".gd-uload-sr"), " — " + SAY[s.state]);
      }
      setText(li.querySelector("small"), s.detail);
    });
    const now = v.steps.find((s) => s.state === "active");
    setText(hud.querySelector(".gd-uload-now"), now ? now.label + (now.detail ? " · " + now.detail : "…") : "");
    setText(hud.querySelector(".gd-uload-error"), v.error || "");
    stage?.set(sceneModel(v));
  };
  return {
    show(state) {
      ensureStyles();
      dialog = document.createElement("dialog");
      dialog.className = "gd-uload";
      dialog.setAttribute("aria-labelledby", "gd-uload-title");
      dialog.innerHTML = `<canvas class="gd-uload-stage" aria-hidden="true"></canvas><div class="gd-uload-hud"></div>`;
      hud = dialog.querySelector(".gd-uload-hud");
      dialog.addEventListener("cancel", (e) => {
        e.preventDefault();
        if (dialog.dataset.tone === "warn") close();
      });
      dialog.addEventListener("click", (e) => {
        const act = e.target.closest("[data-act]")?.dataset.act;
        if (act === "continue") close();
        else if (act === "release") api?.openRelease?.();
      });
      document.body.append(dialog);
      document.body.classList.add("gd-updating");
      dialog.showModal();
      try {
        stage = createStage(dialog.querySelector(".gd-uload-stage"), dialog, { inset: hud });
      } catch {
        stage = null; // no canvas: the HUD alone still tells the whole story
      }
      paint(state);
      stage?.start();
      release = keepOnTop(dialog);
      tipTimer = setInterval(() => {
        tip++;
        setText(dialog?.querySelector(".gd-uload-tip em"), TIPS[tip % TIPS.length]);
      }, 6000);
    },
    update(state) {
      if (dialog) paint(state);
    },
    close,
  };
}

// After a reload/restart: a short pixel card, "Updated to vX.Y.Z", with a link to the notes.
export function showUpdatedCard(api, notice, { timeout = 12000 } = {}) {
  ensureStyles();
  const dialog = document.createElement("dialog");
  dialog.className = "gd-uload-done";
  dialog.setAttribute("aria-labelledby", "gd-uload-done-title");
  const from = notice.from ? `<span class="gd-uload-versions"><b>v${esc(notice.from)}</b><span aria-hidden="true">→</span><b>v${esc(notice.to)}</b></span>` : "";
  dialog.innerHTML = `<div class="gd-uload-bar"><span class="gd-uload-kicker"><i></i>Update installed</span>${from}</div><div class="gd-uload-done-body"><div class="gd-uload-done-art" aria-hidden="true">${trophySVG()}</div><div class="gd-uload-done-text"><h2 id="gd-uload-done-title">Updated to v${esc(notice.to)}</h2><p>Your career is saved and right where you left it.</p></div></div><div class="gd-uload-actions"><button type="button" class="secondary" data-act="release">What's new</button><button type="button" data-act="ok">Play</button></div><i class="gd-uload-timer" style="animation-duration:${timeout}ms" aria-hidden="true"></i>`;
  let timer = null,
    release = null;
  const close = () => {
    clearTimeout(timer);
    release?.();
    if (dialog.open) dialog.close();
    dialog.remove();
  };
  dialog.addEventListener("click", (e) => {
    const act = e.target.closest("[data-act]")?.dataset.act;
    if (act === "release") api?.openRelease?.();
    if (act) close();
  });
  dialog.addEventListener("cancel", (e) => {
    e.preventDefault();
    close();
  });
  document.body.append(dialog);
  dialog.showModal();
  release = keepOnTop(dialog);
  timer = setTimeout(close, timeout);
  dialog.addEventListener("pointerenter", () => clearTimeout(timer), { once: true });
  return close;
}

// Wires the flow into the page. Started by bootstrap.mjs as soon as the page begins loading.
export function startAutoUpdate({ api, storage = globalThis.localStorage, isStartup, save, onClose }) {
  ensureStyles();
  const listeners = new Set();
  api.onStatus((s) => listeners.forEach((fn) => fn(s)));
  const subscribe = (fn) => (listeners.add(fn), () => listeners.delete(fn));
  const loader = createLoaderUI({ api, onClose });
  return runStartupUpdate({ api, storage, isStartup, save, loader, subscribe });
}
