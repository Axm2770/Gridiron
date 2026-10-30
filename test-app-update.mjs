// Full app updates: when a release changes the desktop shell, the game downloads its platform ZIP,
// verifies it against the release manifest, stages it, and a helper swaps the install on restart.
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { mkdtemp, mkdir, writeFile, readFile, rm, stat } from "node:fs/promises";
import { execFileSync } from "node:child_process";
import crypto from "node:crypto";
import os from "node:os";
import path from "node:path";
const require = createRequire(import.meta.url);
const { createUpdater, buildManifest, validateManifest, windowsInstallScript, macInstallScript } = require("./desktop/updater.cjs");

const sha = (b) => crypto.createHash("sha256").update(b).digest("hex");
const exists = (p) => stat(p).then(() => true, () => false);
const temp = await mkdtemp(path.join(os.tmpdir(), "gridiron-app-update-"));
try {
  // The release job records every platform ZIP; anything that isn't a release ZIP is ignored.
  const zips = path.join(temp, "downloads");
  await mkdir(zips);
  const winZip = Buffer.from("PK windows build 1.1.0");
  await writeFile(path.join(zips, "Gridiron-Director-1.1.0-Windows-x64.zip"), winZip);
  await writeFile(path.join(zips, "Gridiron-Director-1.1.0-macOS-arm64.zip"), Buffer.from("PK mac arm"));
  await writeFile(path.join(zips, "Gridiron-Director-1.1.0-macOS-x64.zip"), Buffer.from("PK mac x64"));
  await writeFile(path.join(zips, "Gridiron-Director-1.0.0-Windows-x64.zip"), Buffer.from("old"));
  await writeFile(path.join(zips, "notes.txt"), "x");
  const shell = path.join(temp, "shell"),
    nextShell = path.join(temp, "next-shell"),
    dist = path.join(temp, "dist");
  for (const d of [shell, nextShell, dist]) await mkdir(d);
  await writeFile(path.join(shell, "main.cjs"), "// shell 1.0.0\n");
  await writeFile(path.join(nextShell, "main.cjs"), "// shell 1.1.0\n");
  await writeFile(path.join(dist, "index.html"), "<h1>Gridiron</h1>\n");
  const manifest = validateManifest(await buildManifest({ distDir: dist, shellDir: nextShell, version: "1.1.0", packagesDir: zips }));
  assert.deepEqual(Object.keys(manifest.packages).sort(), ["Windows-x64", "macOS-arm64", "macOS-x64"]);
  assert.deepEqual(manifest.packages["Windows-x64"], { name: "Gridiron-Director-1.1.0-Windows-x64.zip", sha256: sha(winZip), size: winZip.length });
  for (const [key, bad] of [["Windows-x64", { name: "Gridiron-Director-1.0.0-Windows-x64.zip" }], ["macOS-x64", { name: "Gridiron-Director-1.1.0-Windows-x64.zip" }], ["Windows-x64", { sha256: "nope" }], ["Windows-x64", { size: 0 }]]) {
    const m = structuredClone(manifest);
    Object.assign(m.packages[key], bad);
    assert.throws(() => validateManifest(m), /Bad app package/, JSON.stringify(bad));
  }

  // A Windows install the game can write to.
  const installDir = path.join(temp, "Games", "Gridiron Director-win32-x64"),
    userData = path.join(temp, "user");
  await mkdir(installDir, { recursive: true });
  const launches = [];
  let served = winZip;
  const releaseUrl = "https://github.com/Axm2770/Gridiron/releases/tag/v1.1.0",
    zipUrl = "https://github.com/Axm2770/Gridiron/releases/download/v1.1.0/Gridiron-Director-1.1.0-Windows-x64.zip";
  const fetch = async (url) => {
    const u = new URL(url);
    if (u.pathname.endsWith("/releases/latest"))
      return { ok: true, status: 200, url, json: async () => ({ tag_name: "v1.1.0", html_url: releaseUrl, assets: [{ name: "content-manifest.json", browser_download_url: "https://github.com/Axm2770/Gridiron/releases/download/v1.1.0/content-manifest.json" }, { name: "Gridiron-Director-1.1.0-Windows-x64.zip", browser_download_url: zipUrl }] }) };
    if (u.pathname.endsWith("/content-manifest.json")) return { ok: true, status: 200, url, json: async () => manifest };
    if (url === zipUrl) {
      const bytes = served;
      // Arrives in two chunks, like a real stream, from the CDN host GitHub redirects to.
      return { ok: true, status: 200, url: "https://release-assets.githubusercontent.com/x", body: { getReader: () => { const parts = [bytes.subarray(0, 5), bytes.subarray(5)]; return { read: async () => (parts.length ? { done: false, value: parts.shift() } : { done: true }) }; } } };
    }
    throw Error("unexpected " + url);
  };
  const extract = async (zip, dir) => {
    // Stands in for tar.exe: the Windows ZIP holds one folder with the game in it.
    assert.equal(sha(await readFile(zip)), sha(served));
    await mkdir(path.join(dir, "Gridiron Director-win32-x64", "resources"), { recursive: true });
    await writeFile(path.join(dir, "Gridiron Director-win32-x64", "Gridiron Director.exe"), "new exe");
  };
  const make = (appInstall) => createUpdater({ packagedRoot: dist, shellDir: shell, userData, appVersion: "1.0.0", fetch, appInstall, extract, launch: (command, args) => launches.push([command, args]) });

  // Without an install it can replace (development, read-only folder), it falls back to the release page.
  const dev = make(null);
  await dev.init();
  assert.equal((await dev.check()).phase, "shell-required");

  const appInstall = { platform: "Windows-x64", installDir, exe: path.join(installDir, "Gridiron Director.exe"), pid: 999999 };
  const u = make(appInstall);
  await u.init();
  let s = await u.check();
  assert.equal(s.phase, "available");
  assert.equal(s.kind, "app");
  assert.equal(s.bytes, winZip.length);

  // A tampered download is rejected and nothing is staged.
  served = Buffer.from("PK windows build 1.1.X");
  s = await u.download();
  assert.equal(s.phase, "error");
  assert.match(s.message, /verification/);
  assert.equal(await exists(path.join(userData, "app-update")), false);
  assert.equal(u.appUpdateStaged(), false);

  served = winZip;
  await u.check();
  s = await u.download();
  assert.equal(s.phase, "ready", s.message);
  assert.equal(s.kind, "app");
  assert(u.appUpdateStaged());
  // While an update waits for the restart, periodic checks leave it alone.
  assert.equal((await u.check()).phase, "ready");

  // Restarting writes the helper and starts it detached; the old install is untouched until then.
  assert.equal(await u.installApp(), true);
  assert.equal(launches.length, 1);
  const [command, args] = launches[0];
  assert.equal(command, "powershell.exe");
  const script = await readFile(args.at(-1), "utf8");
  assert(script.includes("Get-Process -Id 999999") && script.includes(installDir) && script.includes("robocopy"));
  assert.equal(await u.installApp(), false, "a staged update installs once");

  // Paths with quotes stay inside their string literals.
  const odd = windowsInstallScript({ pid: 1, source: "C:\\a'b", installDir: "C:\\Games\\O'Neil", exe: "C:\\Games\\O'Neil\\x.exe", workDir: "C:\\w", logFile: "C:\\l" });
  assert(odd.includes("'C:\\Games\\O''Neil'") && odd.includes("'C:\\a''b'"));
  const mac = macInstallScript({ pid: 1, source: "/tmp/it's.app", bundle: "/Applications/Gridiron Director.app", workDir: "/tmp/w", logFile: "/tmp/l" });
  assert(mac.includes(`'/tmp/it'\\''s.app'`) && mac.includes('mv "$app" "$app.previous"'));
  if (process.platform !== "win32") execFileSync("sh", ["-n"], { input: mac });

  // On Windows, run the real helper against a fake install: it must swap the files and relaunch.
  if (process.platform === "win32") {
    const live = path.join(temp, "live"),
      fresh = path.join(temp, "fresh"),
      work = path.join(temp, "work"),
      marker = path.join(temp, "relaunched.txt"),
      log = path.join(temp, "update.log");
    await mkdir(path.join(live, "resources"), { recursive: true });
    await mkdir(path.join(fresh, "resources"), { recursive: true });
    await mkdir(work);
    await writeFile(path.join(live, "resources", "app.asar"), "old");
    await writeFile(path.join(fresh, "resources", "app.asar"), "new");
    const relaunch = path.join(fresh, "relaunch.cmd");
    await writeFile(relaunch, `@echo relaunched> "${marker}"\r\n`);
    const helper = path.join(temp, "helper.ps1");
    await writeFile(helper, windowsInstallScript({ pid: 999999, source: fresh, installDir: live, exe: path.join(live, "relaunch.cmd"), workDir: work, logFile: log }));
    execFileSync("powershell.exe", ["-NoProfile", "-ExecutionPolicy", "Bypass", "-File", helper], { stdio: "ignore", windowsHide: true });
    for (let i = 0; i < 50 && !(await exists(marker)); i++) await new Promise((r) => setTimeout(r, 100));
    assert.equal(await readFile(path.join(live, "resources", "app.asar"), "utf8"), "new");
    assert.equal(await exists(live + ".previous"), false, "the old install is removed after a good swap");
    assert.equal(await exists(work), false, "the download folder is cleaned up");
    assert(await exists(marker), "the game is relaunched");
    assert.match(await readFile(log, "utf8"), /App update installed/);
  }
  console.log("PASS: app updates — package manifest, verified download, staging, restart helper" + (process.platform === "win32" ? " (Windows swap run for real)" : ""));
} finally {
  await rm(temp, { recursive: true, force: true });
}
