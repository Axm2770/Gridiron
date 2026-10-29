// Optional download of the Unreal match view (Windows). The renderer is built on a developer
// machine (unreal/Tools/publish-renderer.ps1) and attached to the GitHub release tagged
// "renderer" as GridironRenderer-<version>-Win64.zip plus renderer-manifest.json. The app checks
// that release, streams the zip to disk while hashing it, refuses anything that does not match
// the manifest, extracts it into a staging folder and swaps it into userData/renderer.
const path = require('node:path');
const fs = require('node:fs');
const fsp = require('node:fs/promises');
const crypto = require('node:crypto');

const ALLOWED_HOSTS = new Set(['api.github.com', 'github.com', 'objects.githubusercontent.com', 'release-assets.githubusercontent.com']);
const MAX_ZIP = 4 * 1024 * 1024 * 1024;
const PROTOCOL = 'gridiron.ue/1';

function validateManifest(m) {
  if (!m || m.schema !== 1 || typeof m.version !== 'string' || !/^\d+\.\d+\.\d+$/.test(m.version)) throw Error('The renderer manifest is malformed.');
  if (m.protocol !== PROTOCOL) throw Error('This renderer needs a different version of the game.');
  const z = m.zip;
  if (!z || typeof z.name !== 'string' || !/^GridironRenderer-[\d.]+-Win64\.zip$/.test(z.name) || !/^[0-9a-f]{64}$/.test(z.sha256 || '') || !Number.isSafeInteger(z.size) || z.size <= 0 || z.size > MAX_ZIP) throw Error('The renderer manifest lists an invalid download.');
  return m;
}

function createRendererInstaller({ userData, repo = 'Axm2770/Gridiron', fetch = globalThis.fetch, extract, log = () => {} }) {
  const target = path.join(userData, 'renderer'),
    staging = target + '.staging',
    previous = target + '.previous',
    versionFile = path.join(target, 'renderer-version.json');
  let state = { phase: 'idle', progress: 0, message: null },
    pending = null;
  const listeners = new Set();
  const set = (patch) => {
    state = { ...state, ...patch };
    for (const fn of listeners) fn(status());
  };
  const installedVersion = () => {
    try {
      return JSON.parse(fs.readFileSync(versionFile, 'utf8')).version || null;
    } catch {
      return fs.existsSync(path.join(target, 'GridironDemo.exe')) ? 'local' : null;
    }
  };
  const status = () => ({ ...state, installed: installedVersion() });

  async function get(url) {
    const host = new URL(url).hostname;
    if (new URL(url).protocol !== 'https:' || !ALLOWED_HOSTS.has(host)) throw Error(`Refusing download source ${host}.`);
    const res = await fetch(url, { headers: { 'User-Agent': 'GridironDirector-Renderer' }, redirect: 'follow' });
    if (!res.ok) throw Error(`Download server returned ${res.status}.`);
    if (res.url && !ALLOWED_HOSTS.has(new URL(res.url).hostname)) throw Error('Download redirected to an unexpected host.');
    return res;
  }

  async function check() {
    set({ phase: 'checking', message: null });
    try {
      const release = await (await get(`https://api.github.com/repos/${repo}/releases/tags/renderer`)).json(),
        asset = (name) => (release.assets || []).find((a) => a.name === name);
      const manifestAsset = asset('renderer-manifest.json');
      if (!manifestAsset) throw Error('No renderer has been published yet.');
      const manifest = validateManifest(await (await get(manifestAsset.browser_download_url)).json()),
        zip = asset(manifest.zip.name);
      if (!zip) throw Error('The renderer download is missing from the release.');
      pending = { manifest, url: zip.browser_download_url };
      const installed = installedVersion();
      set({ phase: installed === manifest.version ? 'installed' : 'available', latest: manifest.version, bytes: manifest.zip.size });
    } catch (error) {
      log('Renderer check: ' + error.message);
      set({ phase: 'error', message: error.message });
    }
    return status();
  }

  async function install() {
    if (!pending) await check();
    if (!pending) return status();
    const { manifest, url } = pending,
      zipPath = path.join(userData, manifest.zip.name + '.partial');
    set({ phase: 'downloading', progress: 0, message: null });
    try {
      await fsp.mkdir(userData, { recursive: true });
      const res = await get(url),
        hash = crypto.createHash('sha256'),
        out = fs.createWriteStream(zipPath);
      let received = 0;
      for await (const chunk of res.body) {
        received += chunk.length;
        if (received > manifest.zip.size) throw Error('The download is larger than the manifest says.');
        hash.update(chunk);
        if (!out.write(chunk)) await new Promise((r) => out.once('drain', r));
        set({ progress: Math.floor((received / manifest.zip.size) * 100) });
      }
      await new Promise((resolve, reject) => out.end((e) => (e ? reject(e) : resolve())));
      if (received !== manifest.zip.size || hash.digest('hex') !== manifest.zip.sha256) throw Error('The download failed verification.');

      set({ phase: 'installing' });
      await fsp.rm(staging, { recursive: true, force: true });
      await fsp.mkdir(staging, { recursive: true });
      await extract(zipPath, staging);
      if (!fs.existsSync(path.join(staging, 'GridironDemo.exe'))) throw Error('The download did not contain the renderer.');
      await fsp.writeFile(path.join(staging, 'renderer-version.json'), JSON.stringify({ version: manifest.version, sha256: manifest.zip.sha256 }));
      // Swap: keep the old copy until the new one is in place.
      await fsp.rm(previous, { recursive: true, force: true });
      if (fs.existsSync(target)) await fsp.rename(target, previous);
      await fsp.rename(staging, target);
      await fsp.rm(previous, { recursive: true, force: true });
      set({ phase: 'installed', progress: 100, message: `Unreal match view ${manifest.version} installed.` });
      log(`Renderer ${manifest.version} installed`);
    } catch (error) {
      log('Renderer install: ' + error.message);
      if (!fs.existsSync(target) && fs.existsSync(previous)) await fsp.rename(previous, target).catch(() => {});
      await fsp.rm(staging, { recursive: true, force: true }).catch(() => {});
      set({ phase: 'error', message: `The Unreal match view couldn't be installed: ${error.message}` });
    } finally {
      await fsp.rm(zipPath, { force: true }).catch(() => {});
    }
    return status();
  }

  return { check, install, status, onChange: (fn) => (listeners.add(fn), () => listeners.delete(fn)) };
}

module.exports = { createRendererInstaller, validateManifest, PROTOCOL };
