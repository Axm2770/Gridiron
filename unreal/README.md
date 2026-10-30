# Gridiron UE5 renderer: quickstart

Get the Unreal Engine 5 match renderer running in a greybox level. The game decides every play; Unreal only draws it. Architecture, message formats and the full roadmap are in [docs/ue5-engine-plan.md](../docs/ue5-engine-plan.md).

| Folder | What it is |
| --- | --- |
| `GridironBridge/` | The UE5 plugin (C++): network receiver, match director, athletes, broadcast cameras, sequence manager, flow state machine |
| `GridironDemo/` | A minimal UE5 project that hosts the plugin and the greybox level |
| `Tools/setup.ps1` | One-command setup: finds UE and Visual Studio, links the plugin, compiles it and builds the greybox level |
| `Tools/build_greybox.py` | Editor Python that builds `/Game/Gridiron/Maps/Greybox` from engine content only |

## 1. Install (one time, about 1–3 hours mostly downloading)

1. **Epic Games Launcher** → sign in → *Unreal Engine* → *Library* → install **UE 5.4 or newer** (about 60 GB; verified on 5.8). Pick the Windows engine in the launcher: Epic's separate Linux download has no Windows editor.
2. **Visual Studio 2022** (Community is free) with the workloads **Desktop development with C++** and **Game development with C++**.
3. **Node.js 24** for the replay tool (the repository already uses it for `npm test`).

## 2. Set up (one command)

From the repository root:

```bash
npm run ue:setup
```

This finds UE 5.3+ and Visual Studio, points the demo project at the installed engine version, links `GridironBridge` into `GridironDemo/Plugins`, compiles the plugin with RunUAT (several minutes the first time), copies the engine's mannequin character into the project (it is not committed to git), and builds the greybox level. If compilation fails, the error names the file and line; paste it back to Claude to fix.

Options: `-SkipBuild` (link and greybox only), `-EngineDir "D:\Epic\UE_5.4"` (custom install), `-Open` (open the editor afterwards).

## 3. Stream plays into Unreal

You can drive the renderer without the game:

```bash
npm run ue:replay
```

This hosts the same loopback relay as the desktop app and streams a simulated play every 8 seconds (play call, player frames, collisions, plus a cinematic trigger every sixth play). Open `unreal/GridironDemo/GridironDemo.uproject` and press **Play**.

Options: `--home 5 --away 0` (any matchup), `--time Afternoon|Dusk|Night`, `--weather Clear|Rain|Snow|Fog`, `--seed 46` (seeds 47, 48 and 59 contain big tackles), `--every 4` (seconds between plays).

To drive it from the real game instead, launch the desktop app with the bridge on: set `GRIDIRON_UE=1` before `npm start`, or tick **Game → Unreal Engine bridge**. Then play a match.

## 4. What you should see (Phases 1–6)

- 22 team-coloured mannequins line up and run each play in sync: idle at the snap, jogging and sprinting with real strides, and no pops between frame chunks. Without the mannequin content they fall back to coloured capsules.
- The ball travels the right arc; the player carrying it is the one the play's result names.
- Big tackles knock the ball carrier down (ragdoll). He gets back up on his spot within about 2.5 s. The log shows `Athlete N (role) goes down`.
- Cameras cut: wide before the snap → behind the offense → cable cam on passes → tight on the runner → a punch-in on big hits. No two cuts come within a second of each other. Lock a camera from the console (`~`) with `Gridiron.Camera All22` (or `Director`, `OffenseFocus`, `DefenseFocus`, `Sideline`, `CableCam`).
- The stadium dresses for the match: end zones and stand trim take the home and away colours, and dusk or night turns on the four tower lights. About 6,700 instanced spectators fill the bowl (home fans along the sidelines, away fans in the -X end and corners); the `crowd` percentage thins them out. Rain and snow fall around the camera (`--weather Rain` or `Snow`). Players wear team-coloured helmets and shoulder pads. The log shows `Stadium: home N, away N, <time>, <weather>` and `Weather: Rain (12000 particles)`.
- Big moments play a cutscene. Every sixth replay play triggers a clutch finish: the broadcast cuts to a camera move on the Star (team colour) and the head coach (grey) behind the home end zone, then hands back to the game. The log shows `Cinematic LS_Walkoff_Mob started … finished`. Skip one from the console with `Gridiron.SkipCinematic`.
- The Output Log shows `LogGridiron` lines: `Gridiron bridge connected`, then `Play <id>: <call> vs <coverage>, 22 players` and `Play <id> finished` for each snap. The replay terminal prints `[unreal] ue.ready`.

## 5. Package the 3D match view (Windows)

```bash
npm run ue:package -- -Install
```

**Embedded in the game (Windows desktop):** once the renderer is installed, the Matchday 3D panel shows Unreal's broadcast instead of the Three.js stadium. The desktop app starts the renderer off-screen and streams it into the panel with Pixel Streaming 2 (WebRTC over loopback). `desktop/pixel-stream.cjs` handles signalling, mirroring Epic's native signalling server, and the page connects through the sandboxed preload. The panel's **Classic 3D** button switches back to Three.js and the choice is remembered. Mac, the browser version, and PCs without the renderer keep the Three.js view. Check the whole path with `npm run ue:check-stream`: it starts the replay, relay and renderer, waits for decoded frames, and saves a capture.

**Getting it to players:** players on Windows without the renderer see **Unreal match view available (… MB) — Download** above the match panel. The app downloads the renderer from the GitHub release tagged `renderer`, checks its size and sha256 against `renderer-manifest.json`, extracts it with Windows' `tar`, and switches the embedded view on without a reload (`desktop/renderer-installer.cjs`). To publish a new renderer from this PC, after `npm run ue:package`:

```bash
npm run ue:publish -- -Version 1.0.0
```

That zips `unreal/Build/Windows`, writes the manifest, and uploads both with the GitHub CLI (`gh auth login` once). The `renderer` release is a pre-release on purpose, so the in-game updater's `releases/latest` keeps pointing at real game versions. Use `-NoUpload` to only build the files.

This builds a standalone `GridironDemo.exe` (Development; add `-Shipping` for a release build without console or logs) into `unreal/Build/Windows`. With `-Install` it also copies it to `%APPDATA%\Gridiron Director\renderer`. In the desktop app, **Game → Open 3D match view (Unreal)** then turns on the bridge and launches it beside the game. Set `GRIDIRON_UE_EXE` to use a build somewhere else.

Packaging stages a copy of the project in `%LOCALAPPDATA%\GridironUE`, because the build's intermediate paths can exceed Windows' 260-character limit when the repository is cloned deep in a folder tree. GitHub's CI cannot build it (no Unreal on its runners), so the renderer ships separately from the desktop ZIPs.

Cooking compiles thousands of shaders. By default `package.ps1` caps that at a quarter of the CPU threads at below-normal priority (`-ShaderThreads 16` for a faster, heavier cook), because a full-speed cook hard-froze a test machine. The first cook takes the longest; later ones reuse the shader cache.

## Troubleshooting

- **"Visual C++ redistributable version … is outdated" dialog:** run `Engine\Extras\Redist\en-us\vc_redist.x64.exe` from your UE install (5.8 needs 14.50 or newer).
- **Bridge log says `Bad protocol ''`:** the URL in `Config/DefaultGame.ini` must stay quoted. Unreal's config parser treats `//` as a comment, so an unquoted `ws://…` is cut to `ws:`.
- **Black view:** rerun `npm run ue:setup -- -SkipBuild` to rebuild the greybox lights.
- **Packaged renderer crashes at startup with `Failed to create pipeline … 8007000e`:** keep `r.PSOPrecaching=0` in `Config/DefaultEngine.ini`. Precaching made D3D12 pipeline creation run out of memory in cooked builds on UE 5.8 with NVIDIA.
- **Packaged build shows capsules or skips every cutscene (`no template, skipped`):** assets loaded by path aren't referenced by the map, so they must be in `+DirectoriesToAlwaysCook` in `Config/DefaultGame.ini`. `/Game/Characters/Mannequins` and `/Game/Gridiron/Cinematics` are listed there; add any new runtime-loaded folder too.
- **PC freezes while packaging:** lower `-ShaderThreads` (default: a quarter of the threads). On 13th/14th-gen Intel Core i9 CPUs, also make sure the motherboard BIOS has Intel's stability microcode update.

## 6. Next phases

Phases 2–3 run on the engine mannequin until the MetaHuman players are built. `Tools/metahumans.ps1` uses the engine's MetaHuman Creator to build nine bodies (skill, mid and big builds in three skin tones), rigged and textured by Epic's MetaHuman cloud service, and paints a uniform on each with `M_PlayerUniform`. The uniform has a team-coloured jersey and socks, pants and cleats, masked by reference-pose position, so there's no cloth simulation. `GridironAthlete` then picks a body by each player's mass and jersey number and falls back to the mannequin when none are built. The script needs the "MetaHuman Creator Core Data" optional engine content (Epic Games Launcher → UE 5.8 → Options) and an Epic sign-in in the browser the first time. Run it from a normal terminal: it writes through a short junction (`%LOCALAPPDATA%\GD`) because MetaHuman assembly exceeds 260-character paths. The built assets (about 2 GB) stay out of git like the rest of `Content/`. `-UniformsOnly` redoes only the uniforms. For other art, set `BodyMesh` (and clear `MetaHumans`), or use a Blueprint subclass of `GridironAthlete` with its own Animation Blueprint and get-up montages. Phases 4–5 run on the greybox venue; real stadium art can replace the stands and towers as long as it reads `MPC_Gridiron` and keeps the `GridironStadiumLight` tags. Phase 6 has generated camera-move templates for every cinematic the game triggers; MetaHuman performers and authored animation replace them later under the same template names. Phase 7 packages the renderer and launches it from the desktop app. The plan doc lists the pass criteria for each.
