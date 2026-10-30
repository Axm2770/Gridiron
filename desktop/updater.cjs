// In-game updates. Each tagged release publishes content-manifest.json (sha256 of every dist/
// file, a hash of the desktop shell, and the sha256 of each platform's app ZIP).
// - Content updates: the app downloads only the files that differ, verifies every hash, builds
//   the new version in userData/content/<version>, and switches the protocol root to it. A new
//   version must report healthy (renderer boot) or it is rolled back to the packaged game.
// - App updates (the release changed the desktop shell): the app downloads its platform's ZIP,
//   verifies it, extracts it to userData/app-update, and on restart a detached helper swaps the
//   installed app for the new one (keeping the old copy until the swap succeeds) and relaunches.
//   Where the install can't be replaced (dev runs, read-only folders, a translocated macOS app),
//   the player is sent to the release page instead.
const path = require('node:path');
const fs = require('node:fs/promises');
const crypto = require('node:crypto');
const { createHash } = crypto;
const { W_OK } = require('node:fs').constants;

const TEXT = new Set(['.html', '.js', '.mjs', '.cjs', '.css', '.json', '.svg', '.md', '.txt']);
const ALLOWED_HOSTS = new Set(['api.github.com', 'github.com', 'objects.githubusercontent.com', 'release-assets.githubusercontent.com', 'raw.githubusercontent.com']);
const MAX_FILE = 25 * 1024 * 1024;
const MAX_PACKAGE = 1024 * 1024 * 1024;
// Platform package keys match the ZIP names package-desktop.mjs produces.
const PACKAGE_NAME = /^Gridiron-Director-(\d+\.\d+\.\d+)-(macOS-arm64|macOS-x64|Windows-x64)\.zip$/;

// Git may check text files out with CRLF on Windows; hash them with LF so every platform agrees.
function contentHash(name, bytes) {
  const data = TEXT.has(path.extname(name).toLowerCase()) ? Buffer.from(bytes.toString('utf8').replace(/\r\n/g, '\n'), 'utf8') : bytes;
  return crypto.createHash('sha256').update(data).digest('hex');
}

async function listFiles(root, prefix = '') {
  const out = [];
  for (const entry of await fs.readdir(path.join(root, prefix), { withFileTypes: true })) {
    const rel = prefix ? `${prefix}/${entry.name}` : entry.name;
    if (entry.isDirectory()) {
      if (rel !== 'downloads') out.push(...(await listFiles(root, rel)));
    } else if (entry.isFile() && rel !== 'content-manifest.json') out.push(rel);
  }
  return out.sort();
}

async function hashTree(root) {
  const files = {};
  for (const rel of await listFiles(root)) {
    const bytes = await fs.readFile(path.join(root, rel));
    files[rel] = { sha256: contentHash(rel, bytes), size: bytes.length };
  }
  return files;
}

async function shellHash(shellDir) {
  const h = crypto.createHash('sha256');
  for (const name of (await fs.readdir(shellDir)).filter((n) => n.endsWith('.cjs')).sort()) {
    h.update(name);
    h.update(contentHash(name, await fs.readFile(path.join(shellDir, name))));
  }
  return h.digest('hex');
}

// sha256 and size of each platform ZIP in a folder, keyed by platform (e.g. "Windows-x64").
async function hashPackages(dir, version) {
  const packages = {};
  for (const name of (await fs.readdir(dir).catch(() => [])).sort()) {
    const match = PACKAGE_NAME.exec(name);
    if (!match || match[1] !== version) continue;
    const hash = createHash('sha256');
    let size = 0;
    const file = await fs.open(path.join(dir, name));
    try {
      for await (const chunk of file.createReadStream()) {
        hash.update(chunk);
        size += chunk.length;
      }
    } finally {
      await file.close().catch(() => {});
    }
    packages[match[2]] = { name, sha256: hash.digest('hex'), size };
  }
  return packages;
}

async function buildManifest({ distDir, shellDir, version, tag, packagesDir }) {
  const manifest = { schema: 1, version, tag: tag || `v${version}`, shell: await shellHash(shellDir), files: await hashTree(distDir) };
  if (packagesDir) manifest.packages = await hashPackages(packagesDir, version);
  return manifest;
}

function compareVersions(a, b) {
  const pa = String(a).replace(/^v/, '').split('.').map(Number),
    pb = String(b).replace(/^v/, '').split('.').map(Number);
  for (let i = 0; i < 3; i++) if ((pa[i] || 0) !== (pb[i] || 0)) return (pa[i] || 0) - (pb[i] || 0);
  return 0;
}

// Manifest paths are relative POSIX paths inside dist; anything else is rejected.
function safeRelative(rel) {
  return typeof rel === 'string' && rel.length > 0 && rel.length < 300 && !rel.includes('\\') && !rel.includes('\0') && !rel.startsWith('/') && !rel.split('/').some((part) => part === '' || part === '.' || part === '..');
}

function validateManifest(m) {
  if (!m || m.schema !== 1 || typeof m.version !== 'string' || !/^\d+\.\d+\.\d+$/.test(m.version) || typeof m.shell !== 'string' || !m.files || typeof m.files !== 'object') throw Error('The update manifest is malformed.');
  if (!m.files['index.html']) throw Error('The update manifest has no game entry point.');
  for (const [rel, f] of Object.entries(m.files)) {
    if (!safeRelative(rel)) throw Error(`Unsafe path in update manifest: ${rel}`);
    if (!/^[0-9a-f]{64}$/.test(f?.sha256 || '') || !Number.isInteger(f.size) || f.size < 0 || f.size > MAX_FILE) throw Error(`Bad file entry in update manifest: ${rel}`);
  }
  // Releases before 0.24.0 have no packages; they can only update content in-game.
  if (m.packages !== undefined) {
    if (!m.packages || typeof m.packages !== 'object') throw Error('The update manifest is malformed.');
    for (const [key, p] of Object.entries(m.packages)) {
      const match = PACKAGE_NAME.exec(p?.name || '');
      if (!match || match[1] !== m.version || match[2] !== key || !/^[0-9a-f]{64}$/.test(p.sha256 || '') || !Number.isInteger(p.size) || p.size <= 0 || p.size > MAX_PACKAGE) throw Error(`Bad app package in update manifest: ${key}`);
    }
  }
  return m;
}

// Quoting for the helper scripts: PowerShell single-quoted strings and POSIX sh single quotes.
const psQuote = (s) => `'${String(s).replace(/'/g, "''")}'`;
const shQuote = (s) => `'${String(s).replace(/'/g, `'\\''`)}'`;

// Windows: wait for the game to exit, move the old install aside, copy the new one into place,
// restore the old one if that fails, then relaunch. Saves live in AppData, not in the install.
function windowsInstallScript({ pid, source, installDir, exe, workDir, logFile }) {
  return [
    `$ErrorActionPreference = 'Continue'`,
    `$log = ${psQuote(logFile)}`,
    `function Note($text) { Add-Content -LiteralPath $log -Value ((Get-Date).ToString('o') + ' ' + $text) }`,
    `while (Get-Process -Id ${Number(pid)} -ErrorAction SilentlyContinue) { Start-Sleep -Milliseconds 300 }`,
    `Start-Sleep -Milliseconds 800`,
    `$dest = ${psQuote(installDir)}; $old = $dest + '.previous'; $src = ${psQuote(source)}`,
    `Remove-Item -LiteralPath $old -Recurse -Force -ErrorAction SilentlyContinue`,
    `$moved = $false`,
    `for ($i = 0; $i -lt 20 -and -not $moved; $i++) { try { Rename-Item -LiteralPath $dest -NewName (Split-Path $old -Leaf) -ErrorAction Stop; $moved = $true } catch { Start-Sleep -Milliseconds 500 } }`,
    `if ($moved) {`,
    `  robocopy $src $dest /E /R:3 /W:1 /NFL /NDL /NJH /NJS /NP | Out-Null`,
    `  if ($LASTEXITCODE -lt 8) { Note 'App update installed.'; Remove-Item -LiteralPath $old -Recurse -Force -ErrorAction SilentlyContinue }`,
    `  else { Note ('App update failed (robocopy ' + $LASTEXITCODE + '); restoring the previous version.'); Remove-Item -LiteralPath $dest -Recurse -Force -ErrorAction SilentlyContinue; Rename-Item -LiteralPath $old -NewName (Split-Path $dest -Leaf) }`,
    `} else {`,
    `  robocopy $src $dest /E /R:5 /W:1 /NFL /NDL /NJH /NJS /NP | Out-Null`,
    `  Note ('App update copied in place (robocopy ' + $LASTEXITCODE + ').')`,
    `}`,
    `Remove-Item -LiteralPath ${psQuote(workDir)} -Recurse -Force -ErrorAction SilentlyContinue`,
    `Start-Process -FilePath ${psQuote(exe)}`,
    '',
  ].join('\r\n');
}

// macOS: same swap for the .app bundle; quarantine is cleared so Gatekeeper treats it as before.
function macInstallScript({ pid, source, bundle, workDir, logFile }) {
  return [
    '#!/bin/sh',
    `log=${shQuote(logFile)}`,
    `while kill -0 ${Number(pid)} 2>/dev/null; do sleep 0.3; done`,
    'sleep 0.8',
    `app=${shQuote(bundle)}; src=${shQuote(source)}`,
    'rm -rf "$app.previous"',
    'if mv "$app" "$app.previous" && ditto "$src" "$app"; then',
    '  rm -rf "$app.previous"; echo "$(date) App update installed." >> "$log"',
    'else',
    '  rm -rf "$app"; mv "$app.previous" "$app"; echo "$(date) App update failed; restored the previous version." >> "$log"',
    'fi',
    'xattr -dr com.apple.quarantine "$app" 2>/dev/null',
    `rm -rf ${shQuote(workDir)}`,
    'open "$app"',
    '',
  ].join('\n');
}

// appInstall describes the running install when it can replace itself: { platform: "Windows-x64",
// installDir, exe } on Windows or { platform: "macOS-arm64", bundle } on macOS, plus pid. Null in
// development or when the install can't be replaced. extract(zip, dir) unpacks a ZIP and
// launch(command, args) starts the detached install helper.
function createUpdater({ packagedRoot, shellDir, userData, appVersion, repo = 'Axm2770/Gridiron', fetch = globalThis.fetch, log = () => {}, appInstall = null, extract = null, launch = null }) {
  const contentDir = path.join(userData, 'content'),
    pointerFile = path.join(contentDir, 'active.json'),
    appUpdateDir = path.join(userData, 'app-update');
  let active = null, // { version, root, verified, launches }
    state = { phase: 'idle', current: appVersion, latest: null, message: null, progress: 0 },
    pending = null, // checked release waiting to be downloaded
    staged = null; // downloaded app update waiting for a restart: { version, source }
  const listeners = new Set();
  const set = (patch) => {
    state = { ...state, ...patch };
    for (const fn of listeners) fn(state);
  };

  async function get(url, kind) {
    const host = new URL(url).hostname;
    if (new URL(url).protocol !== 'https:' || !ALLOWED_HOSTS.has(host)) throw Error(`Refusing update source ${host}.`);
    const res = await fetch(url, { headers: { Accept: kind === 'json' ? 'application/json' : '*/*', 'User-Agent': 'GridironDirector-Updater' }, redirect: 'follow' });
    if (!res.ok) throw Error(`Update server returned ${res.status}.`);
    if (res.url && !ALLOWED_HOSTS.has(new URL(res.url).hostname)) throw Error('Update redirected to an unexpected host.');
    return kind === 'json' ? res.json() : Buffer.from(await res.arrayBuffer());
  }

  // Streams a large download to disk, hashing as it goes and reporting progress.
  async function downloadTo(url, dest, expected) {
    const host = new URL(url).hostname;
    if (new URL(url).protocol !== 'https:' || !ALLOWED_HOSTS.has(host)) throw Error(`Refusing update source ${host}.`);
    const res = await fetch(url, { headers: { Accept: 'application/octet-stream', 'User-Agent': 'GridironDirector-Updater' }, redirect: 'follow' });
    if (!res.ok) throw Error(`Update server returned ${res.status}.`);
    if (res.url && !ALLOWED_HOSTS.has(new URL(res.url).hostname)) throw Error('Update redirected to an unexpected host.');
    const hash = createHash('sha256'),
      file = await fs.open(dest, 'w');
    let size = 0;
    try {
      const reader = res.body.getReader();
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        size += value.length;
        if (size > expected.size) throw Error('The download is larger than expected.');
        hash.update(value);
        await file.write(value);
        set({ progress: Math.min(99, Math.floor((size / expected.size) * 100)) });
      }
    } finally {
      await file.close().catch(() => {});
    }
    if (size !== expected.size || hash.digest('hex') !== expected.sha256) throw Error('The download failed verification.');
  }

  // The new app inside the extracted ZIP: the .app bundle, or the folder holding the .exe.
  async function findApp(dir) {
    const entries = await fs.readdir(dir, { withFileTypes: true });
    if (appInstall.bundle) {
      const app = entries.find((e) => e.isDirectory() && e.name === 'Gridiron Director.app');
      return app ? path.join(dir, app.name) : null;
    }
    if (entries.some((e) => e.isFile() && e.name === 'Gridiron Director.exe')) return dir;
    for (const e of entries.filter((x) => x.isDirectory())) {
      const inner = path.join(dir, e.name);
      if (await fs.stat(path.join(inner, 'Gridiron Director.exe')).then(() => true, () => false)) return inner;
    }
    return null;
  }

  // Self-install needs a packaged app and write access where it is installed.
  async function canReplaceApp() {
    if (!appInstall || !extract || !launch) return false;
    const target = appInstall.bundle ? path.dirname(appInstall.bundle) : path.dirname(appInstall.installDir);
    const own = appInstall.bundle || appInstall.installDir;
    return (await fs.access(target, W_OK).then(() => true, () => false)) && (await fs.access(own, W_OK).then(() => true, () => false));
  }

  async function writePointer(value) {
    await fs.mkdir(contentDir, { recursive: true });
    const tmp = pointerFile + '.tmp';
    await fs.writeFile(tmp, JSON.stringify(value, null, 2));
    await fs.rename(tmp, pointerFile);
  }

  async function removeOtherVersions(keep) {
    for (const entry of await fs.readdir(contentDir, { withFileTypes: true }).catch(() => []))
      if (entry.isDirectory() && entry.name !== keep) await fs.rm(path.join(contentDir, entry.name), { recursive: true, force: true });
  }

  // Called once at launch, before the window loads. Decides which root to serve.
  async function init() {
    // A finished app swap removes its download; anything left is from an interrupted one.
    await fs.rm(appUpdateDir, { recursive: true, force: true });
    let pointer = null;
    try {
      pointer = JSON.parse(await fs.readFile(pointerFile, 'utf8'));
    } catch {}
    const valid = pointer && typeof pointer.version === 'string' && safeRelative(pointer.version) && (await fs.stat(path.join(contentDir, pointer.version, 'index.html')).then(() => true, () => false));
    if (!valid || compareVersions(pointer.version, appVersion) <= 0) {
      // A newer full install supersedes downloaded content; stale or broken content is dropped.
      if (pointer) log(`Updater: using packaged game ${appVersion}${valid ? ` (installed build is newer than ${pointer.version})` : ''}.`);
      active = null;
      await fs.rm(pointerFile, { force: true });
      await removeOtherVersions(null);
    } else if (!pointer.verified && (pointer.launches || 0) >= 2) {
      log(`Updater: content ${pointer.version} failed to start twice; rolling back to the packaged game.`);
      await rollback(`Update ${pointer.version} didn't start correctly and was rolled back.`);
    } else {
      active = { ...pointer, launches: (pointer.launches || 0) + (pointer.verified ? 0 : 1) };
      await writePointer(active);
      set({ current: active.version });
    }
    return root();
  }

  const root = () => (active ? path.join(contentDir, active.version) : packagedRoot);

  async function markHealthy() {
    if (active && !active.verified) {
      active = { ...active, verified: true, launches: 0 };
      await writePointer(active);
      log(`Updater: content ${active.version} verified.`);
    }
  }

  async function rollback(message = 'Rolled back to the installed version.') {
    active = null;
    await fs.rm(pointerFile, { force: true });
    await removeOtherVersions(null);
    set({ phase: 'idle', current: appVersion, message });
  }

  async function check({ manual = false } = {}) {
    // A downloaded app update waits for the restart; re-checking would only offer it again.
    if (state.phase === 'checking' || state.phase === 'downloading' || staged) return state;
    set({ phase: 'checking', message: null, manual });
    try {
      const release = await get(`https://api.github.com/repos/${repo}/releases/latest`, 'json'),
        asset = (release.assets || []).find((a) => a.name === 'content-manifest.json');
      const current = active?.version ?? appVersion,
        latest = String(release.tag_name || '').replace(/^v/, '');
      if (!asset || !latest || compareVersions(latest, current) <= 0) {
        pending = null;
        set({ phase: 'up-to-date', latest: latest || current, checkedAt: Date.now() });
        return state;
      }
      const manifest = validateManifest(await get(asset.browser_download_url, 'json'));
      if (manifest.version !== latest) throw Error('The update manifest does not match the release.');
      if (manifest.shell !== (await shellHash(shellDir))) {
        // The desktop app itself changed: replace the whole app when this install allows it.
        const pkg = appInstall && manifest.packages?.[appInstall.platform],
          asset = pkg && (release.assets || []).find((a) => a.name === pkg.name);
        if (asset && (await canReplaceApp())) {
          pending = { kind: 'app', manifest, pkg, url: asset.browser_download_url };
          set({ phase: 'available', kind: 'app', latest, releaseUrl: release.html_url, files: 1, bytes: pkg.size, checkedAt: Date.now() });
          return state;
        }
        pending = null;
        set({ phase: 'shell-required', latest, releaseUrl: release.html_url, message: `Version ${latest} changes the desktop app itself. Download it once from the release page; later updates install in-game again.` });
        return state;
      }
      const have = await hashTree(root()),
        changed = Object.entries(manifest.files).filter(([rel, f]) => have[rel]?.sha256 !== f.sha256);
      pending = { kind: 'content', manifest, changed, tag: manifest.tag || release.tag_name, have };
      set({ phase: 'available', kind: 'content', latest, releaseUrl: release.html_url, files: changed.length, bytes: changed.reduce((n, [, f]) => n + f.size, 0), checkedAt: Date.now() });
    } catch (error) {
      log('Updater check: ' + error.message);
      set({ phase: 'error', message: `Couldn't check for updates: ${error.message}` });
    }
    return state;
  }

  async function downloadApp() {
    const { manifest, pkg, url } = pending,
      zip = path.join(appUpdateDir, pkg.name),
      extracted = path.join(appUpdateDir, 'extracted');
    set({ phase: 'downloading', progress: 0 });
    try {
      await fs.rm(appUpdateDir, { recursive: true, force: true });
      await fs.mkdir(extracted, { recursive: true });
      await downloadTo(url, zip, pkg);
      await extract(zip, extracted);
      await fs.rm(zip, { force: true });
      const source = await findApp(extracted);
      if (!source) throw Error('the download did not contain the game');
      staged = { version: manifest.version, source };
      pending = null;
      set({ phase: 'ready', kind: 'app', progress: 100, message: `Version ${manifest.version} is downloaded. Restart to finish updating.` });
      log(`Updater: app ${manifest.version} downloaded and verified; installs on restart.`);
    } catch (error) {
      await fs.rm(appUpdateDir, { recursive: true, force: true });
      log('Updater app download: ' + error.message);
      set({ phase: 'error', message: `The update couldn't be downloaded: ${error.message}. Your game is unchanged.` });
    }
    return state;
  }

  // Starts the detached helper that swaps in the downloaded app once this process exits. The
  // caller quits the app right after. Returns false when no app update is staged.
  async function installApp() {
    if (!staged || !appInstall) return false;
    const workDir = appUpdateDir,
      logFile = path.join(userData, 'app-update.log');
    if (appInstall.bundle) {
      const script = path.join(userData, 'app-update.sh');
      await fs.writeFile(script, macInstallScript({ pid: appInstall.pid, source: staged.source, bundle: appInstall.bundle, workDir, logFile }), { mode: 0o755 });
      launch('/bin/sh', [script]);
    } else {
      const script = path.join(userData, 'app-update.ps1');
      await fs.writeFile(script, windowsInstallScript({ pid: appInstall.pid, source: staged.source, installDir: appInstall.installDir, exe: appInstall.exe, workDir, logFile }));
      launch('powershell.exe', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-WindowStyle', 'Hidden', '-File', script]);
    }
    log(`Updater: installing app ${staged.version} after exit.`);
    staged = null;
    return true;
  }

  async function download() {
    if (!pending || state.phase !== 'available') throw Error('No update is ready to download.');
    if (pending.kind === 'app') return downloadApp();
    const { manifest, changed, tag, have } = pending,
      base = root(),
      target = path.join(contentDir, manifest.version),
      staging = target + '.staging';
    set({ phase: 'downloading', progress: 0 });
    try {
      await fs.rm(staging, { recursive: true, force: true });
      let done = 0;
      for (const [rel, f] of Object.entries(manifest.files)) {
        const dest = path.join(staging, ...rel.split('/'));
        await fs.mkdir(path.dirname(dest), { recursive: true });
        // Unchanged files are copied from the current root (read/write also works from an asar).
        if (have[rel]?.sha256 === f.sha256) await fs.writeFile(dest, await fs.readFile(path.join(base, ...rel.split('/'))));
        else {
          const bytes = await get(`https://raw.githubusercontent.com/${repo}/${encodeURIComponent(tag)}/dist/${rel.split('/').map(encodeURIComponent).join('/')}`, 'bytes');
          if (bytes.length > MAX_FILE || contentHash(rel, bytes) !== f.sha256) throw Error(`Downloaded ${rel} failed verification.`);
          await fs.writeFile(dest, bytes);
          set({ progress: Math.round((++done / Math.max(1, changed.length)) * 100) });
        }
      }
      await fs.writeFile(path.join(staging, 'content-manifest.json'), JSON.stringify(manifest));
      await fs.rm(target, { recursive: true, force: true });
      await fs.rename(staging, target);
      const previous = active?.version;
      active = { version: manifest.version, verified: false, launches: 0, installedAt: new Date().toISOString() };
      await writePointer(active);
      if (previous && previous !== manifest.version) await fs.rm(path.join(contentDir, previous), { recursive: true, force: true });
      pending = null;
      set({ phase: 'ready', current: manifest.version, progress: 100, message: `Version ${manifest.version} is installed. Reload to play it.` });
      log(`Updater: installed content ${manifest.version} (${changed.length} files downloaded).`);
    } catch (error) {
      await fs.rm(staging, { recursive: true, force: true });
      log('Updater download: ' + error.message);
      set({ phase: 'error', message: `The update couldn't be installed: ${error.message}. Your game is unchanged.` });
    }
    return state;
  }

  return { init, root, check, download, installApp, markHealthy, rollback, status: () => state, onChange: (fn) => (listeners.add(fn), () => listeners.delete(fn)), isUnverified: () => !!active && !active.verified, appUpdateStaged: () => !!staged };
}

module.exports = { createUpdater, buildManifest, hashTree, hashPackages, shellHash, contentHash, compareVersions, validateManifest, safeRelative, windowsInstallScript, macInstallScript };
