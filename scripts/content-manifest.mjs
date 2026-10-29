// Writes the in-game update manifest for a release: sha256 of every dist/ file plus the desktop
// shell hash. Usage: node scripts/content-manifest.mjs <out.json> <tag such as v1.2.3>
import { createRequire } from 'node:module';
import { writeFile, readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const require = createRequire(import.meta.url),
  { buildManifest } = require('../desktop/updater.cjs'),
  root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..'),
  [out = 'content-manifest.json', tag] = process.argv.slice(2),
  pkg = JSON.parse(await readFile(path.join(root, 'package.json'), 'utf8')),
  version = tag ? tag.replace(/^v/, '') : pkg.version;
if (version !== pkg.version) throw Error(`Tag ${tag} does not match package.json version ${pkg.version}.`);
const manifest = await buildManifest({ distDir: path.join(root, 'dist'), shellDir: path.join(root, 'desktop'), version, tag: tag || `v${version}` });
await writeFile(out, JSON.stringify(manifest, null, 1));
console.log(`content manifest ${version}: ${Object.keys(manifest.files).length} files, shell ${manifest.shell.slice(0, 12)}`);
