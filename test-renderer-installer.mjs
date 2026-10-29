import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { mkdtemp, writeFile, readFile, rm, mkdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import crypto from "node:crypto";
import os from "node:os";
import path from "node:path";
const require = createRequire(import.meta.url);
const { createRendererInstaller, validateManifest } = require("./desktop/renderer-installer.cjs");

const zipBytes = Buffer.from("PK fake renderer zip " + "x".repeat(5000));
const sha = (b) => crypto.createHash("sha256").update(b).digest("hex");
const manifestFor = (version, bytes = zipBytes) => ({ schema: 1, version, protocol: "gridiron.ue/1", zip: { name: `GridironRenderer-${version}-Win64.zip`, sha256: sha(bytes), size: bytes.length } });
// Fake GitHub: the "renderer" release with a manifest and a zip served in chunks.
function github({ manifest, zip = zipBytes, manifestUrl = "https://github.com/Axm2770/Gridiron/releases/download/renderer/renderer-manifest.json" }) {
  return async (url) => {
    const json = (v) => ({ ok: true, status: 200, url, json: async () => v });
    if (url.endsWith("/releases/tags/renderer")) return json({ assets: [{ name: "renderer-manifest.json", browser_download_url: manifestUrl }, { name: manifest.zip.name, browser_download_url: `https://github.com/Axm2770/Gridiron/releases/download/renderer/${manifest.zip.name}` }] });
    if (url.endsWith("renderer-manifest.json")) return json(manifest);
    return { ok: true, status: 200, url, body: (async function* () { for (let i = 0; i < zip.length; i += 1000) yield zip.subarray(i, i + 1000); })() };
  };
}
// Fake extractor: "unzips" by writing the files a real renderer zip contains.
const extract = async (_zip, dir) => {
  await writeFile(path.join(dir, "GridironDemo.exe"), "exe");
  await mkdir(path.join(dir, "GridironDemo", "Binaries", "Win64"), { recursive: true });
};

const temp = await mkdtemp(path.join(os.tmpdir(), "gridiron-renderer-"));
try {
  // Fresh install: available → downloaded, verified, extracted and swapped into place.
  let installer = createRendererInstaller({ userData: temp, fetch: github({ manifest: manifestFor("1.0.0") }), extract });
  let s = await installer.check();
  assert.equal(s.phase, "available");
  assert.equal(s.bytes, zipBytes.length);
  const seen = [];
  installer.onChange((st) => seen.push(st.phase));
  s = await installer.install();
  assert.equal(s.phase, "installed", s.message);
  assert.equal(s.installed, "1.0.0");
  assert(seen.includes("downloading") && seen.includes("installing"));
  assert(existsSync(path.join(temp, "renderer", "GridironDemo.exe")));
  assert(!existsSync(path.join(temp, "renderer.staging")) && !existsSync(path.join(temp, "renderer.previous")));
  assert.equal((await installer.check()).phase, "installed", "same version is not offered again");

  // A tampered or truncated download is rejected and the installed copy is untouched.
  for (const bad of [Buffer.from("PK tampered " + "y".repeat(5000)), zipBytes.subarray(0, 4000)]) {
    installer = createRendererInstaller({ userData: temp, fetch: github({ manifest: manifestFor("1.1.0"), zip: bad }), extract });
    s = await installer.install();
    assert.equal(s.phase, "error");
    assert.match(s.message, /verification|larger/);
    assert.equal(s.installed, "1.0.0", "previous renderer still installed");
  }

  // An upgrade replaces the old version.
  installer = createRendererInstaller({ userData: temp, fetch: github({ manifest: manifestFor("1.2.0") }), extract });
  assert.equal((await installer.install()).installed, "1.2.0");

  // Hostile hosts, other protocols and malformed manifests are refused.
  installer = createRendererInstaller({ userData: temp, fetch: github({ manifest: manifestFor("2.0.0"), manifestUrl: "https://evil.example.com/m.json" }), extract });
  assert.match((await installer.check()).message, /Refusing/);
  assert.throws(() => validateManifest({ ...manifestFor("2.0.0"), protocol: "gridiron.ue/2" }), /different version/);
  assert.throws(() => validateManifest({ ...manifestFor("2.0.0"), zip: { ...manifestFor("2.0.0").zip, name: "../evil.zip" } }), /invalid download/);
  // A zip without the renderer is not installed.
  installer = createRendererInstaller({ userData: temp, fetch: github({ manifest: manifestFor("3.0.0") }), extract: async () => {} });
  assert.match((await installer.install()).message, /did not contain/);
  assert.equal(installer.status().installed, "1.2.0");
} finally {
  await rm(temp, { recursive: true, force: true });
}
console.log("PASS: renderer download — verify, extract, swap, upgrade, tamper/truncation rejection, host allow-list, protocol check.");
