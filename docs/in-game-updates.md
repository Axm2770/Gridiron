# In-game updates

The desktop app updates the game's content without a reinstall.

**Release side.** For every `v*` tag, the release job runs `scripts/content-manifest.mjs`, which writes `content-manifest.json`: the version, the sha256 and size of every `dist/` file, and a hash of the desktop shell (`desktop/*.cjs`). That file is published as a release asset next to the ZIPs. Text files are hashed with LF line endings, so Windows checkouts produce the same hashes.

**App side** (`desktop/updater.cjs`, wired in `desktop/main.cjs`):

1. **Check.** Eight seconds after launch, then every six hours, or from **Game → Check for updates**, the app reads `releases/latest` from the GitHub API, then fetches and validates the manifest. Paths must be relative and inside `dist/`, sizes are capped, and only GitHub hosts are contacted.
2. **Shell changes.** If the release's shell hash differs from the running app, the banner offers the release page instead. Changes to Electron, the preload or the protocol still need a one-time download.
3. **Download.** Only files whose hash differs are downloaded, from `raw.githubusercontent.com/<repo>/<tag>/dist/…`. Each one is verified against the manifest. Unchanged files are copied from the current version into `userData/content/<version>.staging`, and the staging folder is renamed into place only when everything checks out.
4. **Switch.** `content/active.json` points at the new version, and the `gridiron://` protocol serves from `updater.root()`. **Reload now** applies the update, and saves are untouched. The previous downloaded version is deleted.
5. **Rollback.** New content must call `gridironUpdates.ready()` (from `bootstrap.mjs`) within 45 seconds of a reload. If it doesn't, the app restores the packaged game. A version that fails to start on two launches is also dropped. If a newer full install is put in place, it replaces any downloaded content.

The renderer only sees `window.gridironUpdates` (status, check, download, reload, ready, open release page), which goes through the sandboxed preload. Set `GRIDIRON_NO_UPDATES=1` to disable the automatic checks.

The trust anchor is HTTPS to GitHub plus the per-file hashes in the manifest. The manifest itself is not signed.

**First install.** Copies installed before 0.21.0 don't have the updater, so they need one more manual download.
