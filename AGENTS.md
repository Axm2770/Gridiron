# Gridiron Director — coding-agent guide

Read `README.md`, `docs/handoff.md` and the module nearest your change before editing. This repository is the source of truth; game saves are local user data, not source files.

## Commands

- Node 24 LTS: `npm ci`.
- Web preview: `npm run serve` (http://localhost:4173).
- Regression checks: `npm test` (34 suites; renderer-installer covers the optional renderer download; ue-stream covers the embedded Unreal match view signalling; updater covers in-game updates; ops-systems covers medical, training, market and draft room; the overhaul added social-engine, depth-systems, recruiting-pipeline, presentation, ue-bridge, ue-telemetry and ue-relay).
- Desktop development: `npm start` on a desktop host.
- Mac archives (requires a Mac; signs and launch-tests the app and extracted ZIP): `npm run package:mac:arm64` and `npm run package:mac:x64`.
- macOS installer builds: `npm run dist:mac` on a Mac.
- Windows archive (requires Windows; launch-tests the app and extracted ZIP): `npm run package:windows`.
- Public downloads: push a `v*` tag matching `package.json`; `.github/workflows/desktop.yml` publishes the launch-tested Mac and Windows ZIPs as a GitHub Release.
- Full source export: `npm run source:archive`.

## Ownership and invariants

- Browser assets are in `dist/`; this is intentionally a buildless ESM/classic-script application. Keep existing script initialization order.
- The canonical career is the existing root state. Own-team players live in `state.roster`; other rosters live in `franchise.clubs`. Do not duplicate player records.
- Domain modules accept explicit state and work without the DOM. Keep view code in UI modules. Use existing transaction/validation boundaries for mutations.
- Money is integer cents. Preserve cap, roster, hiring, injury, position and role checks across manual, worker and delegated paths.
- Live and fast games share execution and rule reducers. Rendering must never change results.
- Migrate saves additively and idempotently. Never replace existing careers during startup or silently reset data after a load error.
- Exact calendar dates use UTC ISO strings. `calendar-core.mjs` is the clock authority. Round settlement is idempotent; do not add another seven-day tick.
- Delegation selects actual available staff, uses actual inbox/conversation/roster operations and records consequences. Never bypass compliance or fabricate successful actions.
- Preserve the Electron sandbox/context isolation and protocol path restrictions. Do not expose Node to renderer content.
- Keep gameplay in-universe. Research, implementation limitations and provenance belong in repository documentation.

## Validation and delivery

Run relevant suites for each change and `npm test` before release. Exercise actual views after UI changes. Update documentation for state changes and material limitations. Do not claim native macOS launch, code signing, external publishing or licenses unless verified. Avoid writing tests that merely duplicate implementation.

Do not commit `node_modules`, `release`, `.desktop-stage`, saves, tokens, signed upload links or environment secrets. `.openai/hosting.json` binds the existing Sites project; preserve that identifier for updates. Third-party asset licenses and provenance must remain intact. GitHub is a separate remote; never use a Sites credential to authenticate to GitHub.
