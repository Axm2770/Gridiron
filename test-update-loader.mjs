import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { runStartupUpdate, initialLoader, loaderReducer, loaderView, takeUpdatedNotice, autoUpdateEnabled, setAutoUpdate, AUTO_UPDATE_KEY, NOTICE_KEY } from "./dist/ui/update-loader.mjs";

const memory = (init = {}) => {
  const data = new Map(Object.entries(init));
  return { getItem: (k) => (data.has(k) ? data.get(k) : null), setItem: (k, v) => data.set(k, String(v)), removeItem: (k) => data.delete(k), data };
};
const available = { phase: "available", kind: "content", current: "0.29.0", latest: "0.30.0", files: 4, bytes: 4 * 1024 * 1024 };

// A fake desktop bridge: records the order of calls and replays a download.
function harness({ check = available, downloadSteps = null, saveError = null, startup = true, storage = memory(), downloadThrows = null } = {}) {
  const log = [],
    listeners = new Set(),
    shown = [],
    timers = [];
  const emit = (s) => listeners.forEach((fn) => fn(s));
  const api = {
    startupCheck: async () => (log.push("check"), check),
    download: async () => {
      log.push("download");
      if (downloadThrows) throw Error(downloadThrows);
      let last = null;
      for (const s of downloadSteps || [
        { phase: "downloading", stage: "download", progress: 0, doneFiles: 0, downloadedBytes: 0 },
        { phase: "downloading", stage: "download", progress: 50, doneFiles: 2, downloadedBytes: 2 * 1024 * 1024 },
        { phase: "downloading", stage: "install", progress: 100, doneFiles: 4, downloadedBytes: 4 * 1024 * 1024 },
        { phase: "ready", progress: 100 },
      ]) {
        emit(s);
        last = s;
      }
      return last;
    },
    reload: () => log.push("reload"),
  };
  const deps = {
    api,
    storage,
    isStartup: () => startup,
    save: async () => {
      log.push("save");
      if (saveError) throw Error(saveError);
    },
    loader: { show: (s) => (log.push("show"), shown.push(s)), update: (s) => shown.push(s) },
    subscribe: (fn) => (listeners.add(fn), () => listeners.delete(fn)),
    wait: async () => {},
    later: (fn, ms) => timers.push([fn, ms]),
  };
  return { deps, log, shown, timers, storage, emit };
}

// The happy path: save first, then download, then reload — and a notice for the next start.
{
  const h = harness();
  const { outcome, state } = await runStartupUpdate(h.deps);
  assert.equal(outcome, "applied");
  assert.deepEqual(h.log, ["check", "show", "save", "download", "reload"], "the career is saved before anything downloads");
  assert.equal(state.step, "restart");
  assert(h.shown.some((s) => s.step === "download" && s.progress === 50), "download progress reaches the loader");
  assert(h.shown.some((s) => s.step === "install"), "the install stage is shown");
  const notice = JSON.parse(h.storage.getItem(NOTICE_KEY));
  assert.equal(notice.to, "0.30.0");
  assert.equal(notice.from, "0.29.0");
  // If the reload never happens the loader explains and lets the player continue.
  assert.equal(h.timers.length, 1);
  h.timers[0][0]();
  assert.match(h.shown.at(-1).error, /didn't reload/);
  assert.equal(h.storage.getItem(NOTICE_KEY), null);
}

// Setting off: nothing is saved, downloaded or shown; the banner handles it as before.
{
  const h = harness({ storage: memory({ [AUTO_UPDATE_KEY]: "false" }) });
  assert.equal((await runStartupUpdate(h.deps)).outcome, "setting-off");
  assert.deepEqual(h.log, ["check"]);
}

// Save failure: no download, the loader shows why, and the update waits (banner).
{
  const h = harness({ saveError: "disk full" });
  const r = await runStartupUpdate(h.deps);
  assert.equal(r.outcome, "save-failed");
  assert.deepEqual(h.log, ["check", "show", "save"], "nothing downloads when the save fails");
  assert.match(r.state.error, /disk full/);
  assert.equal(loaderView(r.state).steps[0].state, "error");
  assert.equal(h.storage.getItem(NOTICE_KEY), null);
}

// Only at startup: an update found after the player started doing things keeps the banner.
{
  const h = harness({ startup: false });
  assert.equal((await runStartupUpdate(h.deps)).outcome, "too-late");
  assert.deepEqual(h.log, ["check"]);
}

// Up to date, a failed check, a disabled updater (smoke test / GRIDIRON_NO_UPDATES) or an older
// desktop shell without the launch check: nothing happens.
for (const [check, outcome] of [
  [{ phase: "up-to-date", current: "0.30.0" }, "no-update"],
  [{ phase: "error", message: "offline" }, "check-error"],
  [{ phase: "disabled" }, "disabled"],
]) {
  const h = harness({ check });
  assert.equal((await runStartupUpdate(h.deps)).outcome, outcome);
  assert.deepEqual(h.log, ["check"]);
}
assert.equal((await runStartupUpdate({ api: { status: () => ({}) } })).outcome, "unsupported");

// A check already running (e.g. from the Game menu) is awaited, not repeated.
{
  const h = harness({ check: { phase: "checking" } });
  const pending = runStartupUpdate(h.deps);
  await new Promise((r) => setTimeout(r, 0));
  h.emit(available);
  assert.equal((await pending).outcome, "applied");
  assert.equal(h.log.filter((x) => x === "check").length, 1);
}

// Download errors and verification failures never block play.
{
  const h = harness({ downloadSteps: [{ phase: "downloading", stage: "download", progress: 30 }, { phase: "error", message: "The update couldn't be installed: Downloaded game.js failed verification.. Your game is unchanged." }] });
  const r = await runStartupUpdate(h.deps);
  assert.equal(r.outcome, "error");
  assert(!h.log.includes("reload"));
  assert.match(r.state.error, /verification/);
  assert.equal(h.storage.getItem(NOTICE_KEY), null, "a failed update leaves no 'Updated to' notice");
  const v = loaderView(r.state);
  assert.equal(v.steps.find((s) => s.id === "download").state, "error");
  assert.equal(v.headline, "Update postponed");
}
{
  const h = harness({ downloadThrows: "offline" });
  const r = await runStartupUpdate(h.deps);
  assert.equal(r.outcome, "error");
  assert.match(r.state.error, /offline/);
}

// Loader state machine: steps only move forward, progress maps to an overall percent.
{
  let s = initialLoader({ ...available, kind: "app", bytes: 120 * 1024 * 1024 });
  let v = loaderView(s);
  assert.deepEqual(v.steps.map((x) => x.state), ["active", "pending", "pending", "pending", "pending"]);
  assert.equal(v.steps[4].label, "Restarting", "app updates restart");
  assert.equal(v.percent, 3);
  s = loaderReducer(s, { type: "saved" });
  assert.equal(s.step, "download");
  s = loaderReducer(s, { type: "status", status: { phase: "downloading", stage: "download", progress: 50, downloadedBytes: 60 * 1024 * 1024 } });
  v = loaderView(s);
  assert.equal(v.percent, 44);
  assert.equal(v.steps[0].state, "done");
  assert.equal(v.steps[1].detail, "60.0 MB of 120.0 MB");
  s = loaderReducer(s, { type: "status", status: { phase: "downloading", stage: "verify", progress: 99 } });
  assert.equal(s.step, "verify");
  // A late progress event can't move the step backwards.
  s = loaderReducer(s, { type: "status", status: { phase: "downloading", stage: "download", progress: 40 } });
  assert.equal(s.step, "verify");
  assert.equal(s.progress, 99);
  s = loaderReducer(s, { type: "status", status: { phase: "downloading", stage: "install" } });
  assert.equal(loaderView(s).percent, 93);
  s = loaderReducer(s, { type: "status", status: { phase: "ready" } });
  v = loaderView(s);
  assert.equal(v.percent, 100);
  assert.equal(v.headline, "Restarting into v0.30.0");
  assert.deepEqual(v.steps.map((x) => x.state), ["done", "done", "done", "done", "active"]);
  const frozen = loaderReducer({ ...s, error: "x" }, { type: "saved" });
  assert.equal(frozen.error, "x", "an error freezes the loader");
  const content = loaderView(loaderReducer(initialLoader(available), { type: "saved" }));
  assert.equal(content.steps[1].detail, "0/4 files · 0 KB of 4.0 MB");
  assert.equal(content.steps[4].label, "Reloading");
}

// The setting defaults to on and round-trips; a broken storage never blocks the update logic.
{
  const st = memory();
  assert.equal(autoUpdateEnabled(st), true);
  setAutoUpdate(st, false);
  assert.equal(autoUpdateEnabled(st), false);
  setAutoUpdate(st, true);
  assert.equal(autoUpdateEnabled(st), true);
  assert.equal(autoUpdateEnabled({ getItem: () => { throw Error("denied"); } }), true);
}

// "Updated to vX.Y.Z" appears once, only when the new version is really running.
{
  const now = Date.now();
  let st = memory({ [NOTICE_KEY]: JSON.stringify({ from: "0.29.0", to: "0.30.0", kind: "content", at: now }) });
  assert.deepEqual(takeUpdatedNotice(st, { current: "0.30.0" }, now + 1000), { from: "0.29.0", to: "0.30.0", kind: "content" });
  assert.equal(takeUpdatedNotice(st, { current: "0.30.0" }, now + 1000), null, "shown once");
  st = memory({ [NOTICE_KEY]: JSON.stringify({ to: "0.30.0", at: now }) });
  assert.equal(takeUpdatedNotice(st, { current: "0.29.0" }, now), null, "a rolled-back update isn't announced");
  st = memory({ [NOTICE_KEY]: JSON.stringify({ to: "0.30.0", at: now - 60 * 60 * 1000 }) });
  assert.equal(takeUpdatedNotice(st, { current: "0.30.0" }, now), null, "stale notices expire");
}

// Wiring: bootstrap starts the launch check and saves through the career manager; the banner
// stands aside while the loader is up; Settings has the toggle; the browser build is untouched.
const bootstrap = await readFile("dist/bootstrap.mjs", "utf8"),
  banner = await readFile("dist/ui/update-banner.mjs", "utf8"),
  office = await readFile("dist/franchise/office-ui.mjs", "utf8"),
  css = await readFile("dist/ui/update-loader.css", "utf8");
assert(bootstrap.includes("if (updates)") && bootstrap.includes("startAutoUpdate"), "only the desktop bridge triggers the auto-update");
assert(bootstrap.includes("window.Career.flush()"), "the career is flushed to the career store before updating");
assert(banner.includes("gd-updating") && banner.includes("gd-update-loader-closed"));
assert(office.includes("Update automatically when the game starts") && office.includes("gridiron-auto-update"));
assert(css.includes("prefers-reduced-motion") && css.includes("steps("), "pixel animation honours reduce-motion");
console.log("PASS: startup auto-update — save before download, setting/startup/save-failure gating, loader steps and progress, error handling, updated notice.");
