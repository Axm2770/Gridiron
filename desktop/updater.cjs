// In-game content updates. Each tagged release publishes content-manifest.json (sha256 of every
// dist/ file plus a hash of the desktop shell). The app downloads only the files that differ,
// verifies every hash, builds the new version in userData/content/<version>, and switches the
// protocol root to it. If the release changed the shell itself, a full download is required.
// A new version must report healthy (renderer boot) or it is rolled back to the packaged game.
const path = require('node:path');
const fs = require('node:fs/promises');
const crypto = require('node:crypto');

const TEXT = new Set(['.html', '.js', '.mjs', '.cjs', '.css', '.json', '.svg', '.md', '.txt']);
const ALLOWED_HOSTS = new Set(['api.github.com', 'github.com', 'objects.githubusercontent.com', 'release-assets.githubusercontent.com', 'raw.githubusercontent.com']);
const MAX_FILE = 25 * 1024 * 1024;

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

async function buildManifest({ distDir, shellDir, version, tag }) {
  return { schema: 1, version, tag: tag || `v${version}`, shell: await shellHash(shellDir), files: await hashTree(distDir) };
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
  return m;
}

function createUpdater({ packagedRoot, shellDir, userData, appVersion, repo = 'Axm2770/Gridiron', fetch = globalThis.fetch, log = () => {} }) {
  const contentDir = path.join(userData, 'content'),
    pointerFile = path.join(contentDir, 'active.json');
  let active = null, // { version, root, verified, launches }
    state = { phase: 'idle', current: appVersion, latest: null, message: null, progress: 0 },
    pending = null; // checked release waiting to be downloaded
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
    if (state.phase === 'checking' || state.phase === 'downloading') return state;
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
        pending = null;
        set({ phase: 'shell-required', latest, releaseUrl: release.html_url, message: `Version ${latest} changes the desktop app itself. Download it once from the release page; later updates install in-game again.` });
        return state;
      }
      const have = await hashTree(root()),
        changed = Object.entries(manifest.files).filter(([rel, f]) => have[rel]?.sha256 !== f.sha256);
      pending = { manifest, changed, tag: manifest.tag || release.tag_name, have };
      set({ phase: 'available', latest, releaseUrl: release.html_url, files: changed.length, bytes: changed.reduce((n, [, f]) => n + f.size, 0), checkedAt: Date.now() });
    } catch (error) {
      log('Updater check: ' + error.message);
      set({ phase: 'error', message: `Couldn't check for updates: ${error.message}` });
    }
    return state;
  }

  async function download() {
    if (!pending || state.phase !== 'available') throw Error('No update is ready to download.');
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

  return { init, root, check, download, markHealthy, rollback, status: () => state, onChange: (fn) => (listeners.add(fn), () => listeners.delete(fn)), isUnverified: () => !!active && !active.verified };
}

module.exports = { createUpdater, buildManifest, hashTree, shellHash, contentHash, compareVersions, validateManifest, safeRelative };
