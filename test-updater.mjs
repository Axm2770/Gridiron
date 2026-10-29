import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { mkdtemp, mkdir, writeFile, readFile, rm, cp } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
const require = createRequire(import.meta.url);
const { createUpdater, buildManifest, contentHash, compareVersions, validateManifest } = require("./desktop/updater.cjs");

// Line endings never change a text file's hash; binary files are hashed as-is.
assert.equal(contentHash("a.js", Buffer.from("x\r\ny\n")), contentHash("a.js", Buffer.from("x\ny\n")));
assert.notEqual(contentHash("a.png", Buffer.from("x\r\n")), contentHash("a.png", Buffer.from("x\n")));
assert(compareVersions("0.21.0", "0.20.9") > 0 && compareVersions("v1.0.0", "1.0.0") === 0 && compareVersions("0.9.0", "0.10.0") < 0);

// The real game builds a valid manifest that covers its entry point and skips downloads/.
const real = validateManifest(await buildManifest({ distDir: "dist", shellDir: "desktop", version: "9.9.9" }));
assert(real.files["index.html"] && real.files["bootstrap.mjs"] && real.files["ui/update-banner.mjs"]);
assert(!Object.keys(real.files).some((f) => f.startsWith("downloads/")));

for (const bad of ["../escape.js", "/abs.js", "a/../../b.js", "a\\b.js", "a//b.js"]) {
  const m = structuredClone(real);
  m.files[bad] = { sha256: "0".repeat(64), size: 1 };
  assert.throws(() => validateManifest(m), /Unsafe path/, bad);
}

const temp = await mkdtemp(path.join(os.tmpdir(), "gridiron-updater-"));
try {
  const packaged = path.join(temp, "packaged"),
    shell = path.join(temp, "shell"),
    next = path.join(temp, "next"),
    userData = path.join(temp, "user");
  await mkdir(path.join(packaged, "ui"), { recursive: true });
  await mkdir(shell);
  await writeFile(path.join(packaged, "index.html"), "<h1>Gridiron</h1>\r\n");
  await writeFile(path.join(packaged, "game.js"), "export const v = 1;\n");
  await writeFile(path.join(packaged, "ui", "logo.png"), Buffer.from([1, 2, 3, 4]));
  await writeFile(path.join(shell, "main.cjs"), "// shell\n");
  // Next release: game.js changed, a new file added; index.html identical apart from line endings.
  await cp(packaged, next, { recursive: true });
  await writeFile(path.join(next, "index.html"), "<h1>Gridiron</h1>\n");
  await writeFile(path.join(next, "game.js"), "export const v = 2;\n");
  await writeFile(path.join(next, "ui", "medical.mjs"), "export const m = true;\n");
  let manifest = await buildManifest({ distDir: next, shellDir: shell, version: "1.1.0" }),
    requests = [];
  const serve = (overrides = {}) => async (url) => {
    requests.push(url);
    const u = new URL(url),
      json = (v) => ({ ok: true, status: 200, url, json: async () => v });
    if (overrides[url]) return overrides[url]();
    if (u.pathname.endsWith("/releases/latest")) return json({ tag_name: "v1.1.0", html_url: "https://github.com/Axm2770/Gridiron/releases/tag/v1.1.0", assets: [{ name: "content-manifest.json", browser_download_url: "https://github.com/Axm2770/Gridiron/releases/download/v1.1.0/content-manifest.json" }] });
    if (u.pathname.endsWith("/content-manifest.json")) return json(manifest);
    const rel = decodeURIComponent(u.pathname.split("/v1.1.0/dist/")[1] || "");
    const bytes = await readFile(path.join(next, ...rel.split("/")));
    return { ok: true, status: 200, url, arrayBuffer: async () => bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.length) };
  };
  const make = (fetch, appVersion = "1.0.0") => createUpdater({ packagedRoot: packaged, shellDir: shell, userData, appVersion, fetch });

  // Fresh install serves the packaged game, finds the update, downloads only what changed.
  let u = make(serve());
  assert.equal(await u.init(), packaged);
  let s = await u.check();
  assert.equal(s.phase, "available");
  assert.equal(s.files, 2, "only the changed and new files are downloaded");
  requests = [];
  s = await u.download();
  assert.equal(s.phase, "ready", s.message);
  assert.equal(requests.filter((r) => r.includes("raw.githubusercontent.com")).length, 2);
  const root = u.root();
  assert.notEqual(root, packaged);
  assert.equal(await readFile(path.join(root, "game.js"), "utf8"), "export const v = 2;\n");
  assert.deepEqual([...(await readFile(path.join(root, "ui", "logo.png")))], [1, 2, 3, 4], "unchanged files carry over");
  assert(u.isUnverified());
  await u.markHealthy();
  assert(!u.isUnverified());

  // Next launch keeps serving the verified update and reports up to date.
  u = make(serve());
  assert.equal(await u.init(), root);
  assert.equal((await u.check()).phase, "up-to-date");

  // A newer full install supersedes downloaded content.
  u = make(serve(), "1.2.0");
  assert.equal(await u.init(), packaged);

  // A tampered download is rejected and nothing changes.
  u = make(serve({ "https://raw.githubusercontent.com/Axm2770/Gridiron/v1.1.0/dist/game.js": async () => ({ ok: true, status: 200, arrayBuffer: async () => new TextEncoder().encode("evil()").buffer }) }));
  await u.init();
  assert.equal((await u.check()).phase, "available");
  s = await u.download();
  assert.equal(s.phase, "error");
  assert.match(s.message, /verification/);
  assert.equal(u.root(), packaged);

  // Content that never reports healthy is rolled back after two launches.
  u = make(serve());
  await u.init();
  await u.check();
  await u.download();
  const installed = u.root();
  assert.equal(await make(serve()).init(), installed, "first launch after install tries the new content");
  assert.equal(await make(serve()).init(), installed);
  assert.equal(await make(serve()).init(), packaged, "two failed starts roll back to the packaged game");

  // A release that changes the desktop shell asks for a full download instead.
  manifest = { ...manifest, shell: "f".repeat(64) };
  u = make(serve());
  await u.init();
  s = await u.check();
  assert.equal(s.phase, "shell-required");
  assert.match(s.releaseUrl, /releases\/tag\/v1\.1\.0/);

  // Only GitHub hosts are contacted, and network failures leave the game untouched.
  u = createUpdater({ packagedRoot: packaged, shellDir: shell, userData, appVersion: "1.0.0", repo: "Axm2770/Gridiron", fetch: async () => { throw Error("offline"); } });
  await u.init();
  s = await u.check();
  assert.equal(s.phase, "error");
  assert.equal(u.root(), packaged);
  manifest = await buildManifest({ distDir: next, shellDir: shell, version: "1.1.0" });
  u = make(serve({ "https://api.github.com/repos/Axm2770/Gridiron/releases/latest": async () => ({ ok: true, status: 200, json: async () => ({ tag_name: "v1.1.0", assets: [{ name: "content-manifest.json", browser_download_url: "https://evil.example.com/m.json" }] }) }) }));
  await u.init();
  s = await u.check();
  assert.equal(s.phase, "error");
  assert.match(s.message, /Refusing/);
} finally {
  await rm(temp, { recursive: true, force: true });
}

const main = await readFile("desktop/main.cjs", "utf8"),
  preload = await readFile("desktop/preload.cjs", "utf8"),
  workflow = await readFile(".github/workflows/desktop.yml", "utf8");
assert(main.includes("appResponse(request,updater.root())"), "the protocol serves the active content root");
assert(main.includes("fromGame(event)"), "update IPC only accepts the game window");
assert(!preload.includes("require('node:"), "the preload exposes no Node APIs");
assert(workflow.includes("content-manifest.json"), "releases publish the update manifest");
console.log("PASS: in-game updates — delta download, hash verification, CRLF-safe hashing, rollback, shell gating and host allow-list.");
