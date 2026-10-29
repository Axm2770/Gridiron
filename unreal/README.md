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

This finds UE 5.3+ and Visual Studio, points the demo project at the installed engine version, links `GridironBridge` into `GridironDemo/Plugins`, compiles the plugin with RunUAT (several minutes the first time), and builds the greybox level. If compilation fails, the error names the file and line; paste it back to Claude to fix.

Options: `-SkipBuild` (link and greybox only), `-EngineDir "D:\Epic\UE_5.4"` (custom install), `-Open` (open the editor afterwards).

## 3. Stream plays into Unreal

You can drive the renderer without the game:

```bash
npm run ue:replay
```

This hosts the same loopback relay as the desktop app and streams a simulated play every 8 seconds (play call, player frames, collisions, plus a cinematic trigger every sixth play). Open `unreal/GridironDemo/GridironDemo.uproject` and press **Play**.

To drive it from the real game instead, launch the desktop app with the bridge on: set `GRIDIRON_UE=1` before `npm start`, or tick **Game → Unreal Engine bridge**. Then play a match.

## 4. What you should see (Phase 1 acceptance)

- 22 team-coloured capsules line up and move through each play in sync, with no pops between frame chunks.
- The ball travels the right arc; the capsule carrying it is the one the play's result names.
- Cameras cut: wide before the snap → behind the offense → cable cam on passes → tight on the runner → a punch-in on big hits.
- The Output Log shows `LogGridiron` lines: `Gridiron bridge connected`, then `Play <id>: <call> vs <coverage>, 22 players` and `Play <id> finished` for each snap. The replay terminal prints `[unreal] ue.ready`.

## Troubleshooting

- **"Visual C++ redistributable version … is outdated" dialog:** run `Engine\Extras\Redist\en-us\vc_redist.x64.exe` from your UE install (5.8 needs 14.50 or newer).
- **Bridge log says `Bad protocol ''`:** the URL in `Config/DefaultGame.ini` must stay quoted. Unreal's config parser treats `//` as a comment, so an unquoted `ws://…` is cut to `ws:`.
- **Black view:** rerun `npm run ue:setup -- -SkipBuild` to rebuild the greybox lights.

## 5. Next phases

Swap the capsules for a skeletal mesh and AnimBP (Phase 2), author the `HitReact` physical-animation profile (Phase 3), then the stadium, cinematics and packaging (Phases 4–7). The plan doc lists the pass criteria for each.
