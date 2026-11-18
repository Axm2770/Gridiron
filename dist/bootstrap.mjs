import { migrate, validate } from "./franchise/state.mjs";
import { CareerStore, parseCareerSave } from "./franchise/save-store.mjs";
import "./ui/pixel-theme.mjs";
try {
  window.__gridironHadLegacy = !!localStorage.getItem("gridiron-v1");
} catch {}
const status = document.getElementById("startup-status");
// Desktop only: ask for an update the moment the game starts. If one is out (and Settings →
// "Update automatically when the game starts" is on), ui/update-loader.mjs saves the career and
// installs it behind a full-screen loading page before the player can start doing things.
const updates = window.gridironUpdates;
let storage = null;
try {
  storage = window.localStorage;
} catch {}
let autoUpdate = Promise.resolve(null),
  updatedNotice = null,
  gameFailed = false;
// The whole active career (settings and office preferences are part of it) is written to the
// career store; resolves when there is nothing to save, throws if the save fails.
async function saveActiveCareer() {
  const deadline = Date.now() + 90000;
  while (!window.Career?.ready) {
    if (gameFailed || Date.now() > deadline) throw Error("the game didn't finish loading");
    await new Promise((resolve) => setTimeout(resolve, 150));
  }
  if (!window.Career.currentId) return;
  window.Career.autosave();
  await window.Career.flush();
}
if (updates) {
  const bootedAt = Date.now();
  let interacted = false;
  const mark = (event) => {
    if (!event.target?.closest?.(".gd-uload, .gd-uload-done")) interacted = true;
  };
  addEventListener("pointerdown", mark, true);
  addEventListener("keydown", mark, true);
  autoUpdate = import("./ui/update-loader.mjs")
    .then(async (loader) => {
      updatedNotice = loader.takeUpdatedNotice(storage, updates.status());
      const result = await loader.startAutoUpdate({
        api: updates,
        storage,
        // The startup window: before the first click or key press, and within three minutes.
        isStartup: () => !interacted && Date.now() - bootedAt < 180000,
        save: saveActiveCareer,
        onClose: () => dispatchEvent(new Event("gd-update-loader-closed")),
      });
      return { loader, result };
    })
    .catch((error) => {
      console.error("Startup update:", error);
      return null;
    });
}
try {
  const store = new CareerStore();
  await store.open();
  window.careerStore = store;
  const current = await store.current();
  if (current) {
    try {
      const candidate = parseCareerSave(current.payload).state;
      migrate(candidate);
      validate(candidate);
      window.__gridironLoadedState = candidate;
      window.__gridironCareerId = current.id;
    } catch (error) {
      window.careerLoadError = error.message;
    }
  }
} catch (error) {
  window.careerStorageError = error.message;
}
const script = (src) =>
  new Promise((resolve, reject) => {
    const element = document.createElement("script");
    element.src = src;
    element.onload = resolve;
    element.onerror = () => reject(Error("Could not load " + src));
    document.body.append(element);
  });
try {
  await script("game.js");
  await script("match.js");
  await script("atmosphere.js");
  await import("./stadium.js");
  // Desktop only: confirm this content version booted, then offer in-game updates. The corner
  // banner takes over once the startup update has decided (it covers updates found later).
  if (updates) {
    updates.ready();
    autoUpdate
      .then(async (started) => {
        if (updatedNotice && started && started.result?.outcome !== "applied") started.loader.showUpdatedCard(updates, updatedNotice);
        const banner = await import("./ui/update-banner.mjs");
        banner.installUpdateBanner(updates);
      })
      .catch((error) => console.error("Update banner:", error));
  }
} catch (error) {
  gameFailed = true;
  if (status) {
    status.innerHTML =
      "<h1>The workspace could not start.</h1><p>Refresh this page to try again. Your saved careers have not been changed.</p>";
    status.setAttribute("role", "alert");
  }
  console.error("Career startup:", error);
}
