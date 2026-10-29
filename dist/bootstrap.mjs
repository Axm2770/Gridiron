import { migrate, validate } from "./franchise/state.mjs";
import { CareerStore, parseCareerSave } from "./franchise/save-store.mjs";
try {
  window.__gridironHadLegacy = !!localStorage.getItem("gridiron-v1");
} catch {}
const status = document.getElementById("startup-status");
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
  // Desktop only: confirm this content version booted, then offer in-game updates.
  if (window.gridironUpdates) {
    window.gridironUpdates.ready();
    import("./ui/update-banner.mjs").then((m) => m.installUpdateBanner(window.gridironUpdates)).catch((error) => console.error("Update banner:", error));
  }
} catch (error) {
  if (status) {
    status.innerHTML =
      "<h1>The workspace could not start.</h1><p>Refresh this page to try again. Your saved careers have not been changed.</p>";
    status.setAttribute("role", "alert");
  }
  console.error("Career startup:", error);
}
