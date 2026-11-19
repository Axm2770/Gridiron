// Regressions from the 0.30 → 0.31 field failure:
// 1. A leftover app-update folder (which couldn't be deleted inside Electron because of app.asar)
//    made init() throw before it read the installed-content pointer, so every launch fell back to
//    the packaged game and downloaded the same update again. Cleanup must never block init.
// 2. The Windows install helper was killed with the game, so nothing was installed. installApp()
//    now waits for launch() to confirm the helper started, and stays open when it didn't.
import assert from "node:assert/strict";
import { mkdtemp, mkdir, writeFile, readFile, readdir, rm } from "node:fs/promises";
import { existsSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { createUpdater } = require("./desktop/updater.cjs");

const temp = await mkdtemp(path.join(os.tmpdir(), "gd-upd-recovery-"));
try {
  const dist = path.join(temp, "dist"),
    shell = path.join(temp, "shell"),
    userData = path.join(temp, "user");
  await mkdir(dist, { recursive: true });
  await mkdir(shell, { recursive: true });
  await writeFile(path.join(dist, "index.html"), "packaged");
  // Installed content 1.2.0, verified, newer than the packaged 1.0.0.
  await mkdir(path.join(userData, "content", "1.2.0"), { recursive: true });
  await writeFile(path.join(userData, "content", "1.2.0", "index.html"), "installed");
  await writeFile(path.join(userData, "content", "active.json"), JSON.stringify({ version: "1.2.0", verified: true, launches: 0 }));
  // Leftovers from an interrupted app update: an extracted app with an asar, a moved-aside copy,
  // and the helper's log.
  await mkdir(path.join(userData, "app-update", "extracted", "Gridiron Director-win32-x64", "resources"), { recursive: true });
  await writeFile(path.join(userData, "app-update", "extracted", "Gridiron Director-win32-x64", "resources", "app.asar"), "asar");
  await mkdir(path.join(userData, "app-update.stale-123", "x"), { recursive: true });
  await writeFile(path.join(userData, "app-update.log"), "2026-11-18T00:00:00 App update installed.\r\n");

  const logs = [];
  const u = createUpdater({
    packagedRoot: dist,
    shellDir: shell,
    userData,
    appVersion: "1.0.0",
    fetch: async () => {
      throw Error("offline");
    },
    log: (m) => logs.push(m),
    appInstall: null,
    extract: async () => {},
    launch: () => true,
  });
  const root = await u.init();
  assert.equal(root, path.join(userData, "content", "1.2.0"), "init keeps using the installed content");
  assert.equal(u.status().current, "1.2.0");
  assert.equal(existsSync(path.join(userData, "app-update")), false, "the leftover app update is removed");
  assert.equal((await readdir(userData)).some((n) => n.startsWith("app-update.stale-")), false, "moved-aside copies are swept");
  assert(logs.some((l) => /Updater helper: .*App update installed/.test(l)), "the helper's result reaches the launch log");
  assert.equal(existsSync(path.join(userData, "app-update.log")), false);

  // init must survive a cleanup that cannot run at all (app-update is a file it can't recurse into
  // is fine; here the userData listing itself is unreadable for the sweep). Simulate by making the
  // pointer valid and the sweep target odd: a file named like a stale folder.
  await writeFile(path.join(userData, "app-update.stale-999"), "not a folder");
  const u2 = createUpdater({ packagedRoot: dist, shellDir: shell, userData, appVersion: "1.0.0", fetch: async () => ({}), log: () => {}, appInstall: null, extract: async () => {}, launch: () => true });
  assert.equal(await u2.init(), path.join(userData, "content", "1.2.0"));
  console.log("PASS: updater recovery — leftover app-update folders, stale copies and helper logs never stop init from using installed content.");
} finally {
  await rm(temp, { recursive: true, force: true });
}
