export const CAREER_DB = "gridiron-careers-v1";
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
