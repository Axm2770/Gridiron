export const CAREER_DB = "gridiron-careers-v1";
// Long careers export 40–60 MB (a 40 MB cap rejected backups of six-season careers).
export const MAX_IMPORT_BYTES = 200_000_000;
export class CareerStore {
  constructor(indexedDB = globalThis.indexedDB) {
    this.indexedDB = indexedDB;
    this.db = null;
  }
  async open() {
    if (this.db) return this;
    if (!this.indexedDB)
      throw Error("This browser does not provide career storage.");
    this.db = await new Promise((resolve, reject) => {
      const request = this.indexedDB.open(CAREER_DB, 1);
      request.onupgradeneeded = () => {
        for (const name of ["careers", "metadata", "settings"])
          if (!request.result.objectStoreNames.contains(name))
            request.result.createObjectStore(name, { keyPath: "id" });
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
      request.onblocked = () =>
        reject(Error("Close older Gridiron tabs to open career storage."));
    });
    this.db.onversionchange = () => {
      this.db.close();
      this.db = null;
    };
    return this;
  }
  read(store, id) {
    return new Promise((resolve, reject) => {
      const request = this.db.transaction(store).objectStore(store).get(id);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }
  list() {
    return new Promise((resolve, reject) => {
      const request = this.db
        .transaction("metadata")
        .objectStore("metadata")
        .getAll();
      request.onsuccess = () =>
        resolve(request.result.sort((a, b) => b.updatedAt - a.updatedAt));
      request.onerror = () => reject(request.error);
    });
  }
  get(id) {
    return this.read("careers", id);
  }
  async current() {
    const setting = await this.read("settings", "active");
    return setting?.value ? this.get(setting.value) : null;
  }
  put(id, payload, metadata, { active = false } = {}) {
    return new Promise((resolve, reject) => {
      const tx = this.db.transaction(
        ["careers", "metadata", "settings"],
        "readwrite",
      );
      try {
        tx.objectStore("careers").put({ id, payload });
        tx.objectStore("metadata").put({ ...metadata, id });
        if (active) tx.objectStore("settings").put({ id: "active", value: id });
      } catch (error) {
        tx.abort();
        reject(error);
        return;
      }
      tx.oncomplete = () => resolve(metadata);
      tx.onerror = () =>
        reject(tx.error || Error("Career could not be saved."));
      tx.onabort = () =>
        reject(tx.error || Error("Career save was interrupted."));
    });
  }
  setActive(id) {
    return this.setting("active", id);
  }
  setting(id, value) {
    return new Promise((resolve, reject) => {
      const tx = this.db.transaction("settings", "readwrite");
      tx.objectStore("settings").put({ id, value });
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  }
  // Permanently removes a career (payload and metadata) in one transaction. If it was the active
  // career, the most recently played remaining non-archived career becomes active; with none
  // left the active setting is cleared. Resolves to { active } — the active id afterwards.
  async delete(id) {
    const metadata = await this.read("metadata", id),
      payload = await this.read("careers", id);
    if (!metadata && !payload) throw Error("Career not found.");
    return new Promise((resolve, reject) => {
      const tx = this.db.transaction(
        ["careers", "metadata", "settings"],
        "readwrite",
      );
      let active = null;
      try {
        const settings = tx.objectStore("settings"),
          meta = tx.objectStore("metadata");
        tx.objectStore("careers").delete(id);
        meta.delete(id);
        settings.get("active").onsuccess = (e) => {
          const current = e.target.result?.value ?? null;
          if (current !== id) {
            active = current;
            return;
          }
          meta.getAll().onsuccess = (r) => {
            const next = r.target.result
              .filter((m) => m.id !== id && !m.archived)
              .sort((a, b) => b.updatedAt - a.updatedAt)[0];
            active = next?.id ?? null;
            if (active) settings.put({ id: "active", value: active });
            else settings.delete("active");
          };
        };
      } catch (error) {
        tx.abort();
        reject(error);
        return;
      }
      tx.oncomplete = () => resolve({ active });
      tx.onerror = () =>
        reject(tx.error || Error("Career could not be deleted."));
      tx.onabort = () =>
        reject(tx.error || Error("Career deletion was interrupted."));
    });
  }
  async archive(id, archived = true) {
    const metadata = await this.read("metadata", id);
    if (!metadata) throw Error("Career not found.");
    return new Promise((resolve, reject) => {
      const tx = this.db.transaction("metadata", "readwrite");
      tx.objectStore("metadata").put({ ...metadata, archived });
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  }
}
export function parseCareerSave(text) {
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    throw Error("This is not a readable career JSON file.");
  }
  // `null`, numbers or strings are valid JSON too; they used to throw a TypeError here.
  if (!data || typeof data !== "object" || Array.isArray(data))
    throw Error("This file is not a supported Gridiron career save.");
  const state = data.format === "GridironCareer" ? data.state : data;
  if (
    !state ||
    !Number.isInteger(state.team) ||
    state.team < 0 ||
    state.team > 31 ||
    !Number.isInteger(state.year) ||
    !Array.isArray(state.schedule) ||
    !Array.isArray(state.roster) ||
    !Array.isArray(state.teams) ||
    state.teams.length !== 32
  )
    throw Error("This file is not a supported Gridiron career save.");
  return {
    state,
    name:
      data.format === "GridironCareer"
        ? String(data.name || "Imported career").slice(0, 60)
        : "Imported career",
  };
}
export function saveMetadata(
  s,
  { id, name, createdAt = Date.now(), archived = false } = {},
) {
  return {
    id,
    name: String(name || s.coach?.name + " — Career")
      .trim()
      .slice(0, 60),
    coach: s.coach?.name || "Head coach",
    team: s.team,
    year: s.year,
    week: s.week,
    phase: s.phase,
    record: s.teams[s.team].w + "–" + s.teams[s.team].l,
    role: s.franchise?.role || "HC",
    avatar: s.franchise?.userCoach?.appearance || null,
    createdAt,
    updatedAt: Date.now(),
    archived,
    version: 2,
  };
}

export function careerId() {
  if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID();
  const bytes = new Uint32Array(4);
  if (globalThis.crypto?.getRandomValues)
    globalThis.crypto.getRandomValues(bytes);
  else
    for (let i = 0; i < 4; i++)
      bytes[i] = Math.floor(Math.random() * 0xffffffff);
  return (
    "career-" +
    Date.now().toString(36) +
    "-" +
    Array.from(bytes, (n) => n.toString(36)).join("-")
  );
}
