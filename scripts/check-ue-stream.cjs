// End-to-end check of the embedded Unreal match view on Windows (needs the packaged renderer:
// npm run ue:package -- -Install). Runs under Electron:
//   npx electron scripts/check-ue-stream.cjs
// It starts the replay telemetry, the real signalling relay (desktop/pixel-stream.cjs) and the
// renderer off-screen, opens a window with the real preload and the real WebRTC player
// (dist/bridge/ue-view.mjs), waits for decoded video frames, saves a capture, and exits 0/1.
const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('node:path');
const fs = require('node:fs');
const os = require('node:os');
const { spawn } = require('node:child_process');
const { pathToFileURL } = require('node:url');
const { createSignalling } = require('../desktop/pixel-stream.cjs');

const root = path.resolve(__dirname, '..');
const renderer = process.env.GRIDIRON_UE_EXE || path.join(process.env.APPDATA || '', 'Gridiron Director', 'renderer', 'GridironDemo.exe');
const inner = (() => { const dir = path.join(path.dirname(renderer), 'GridironDemo', 'Binaries', 'Win64'); try { const n = fs.readdirSync(dir).find((f) => /^GridironDemo(-Win64-[A-Za-z]+)?\.exe$/.test(f)); return n ? path.join(dir, n) : renderer; } catch { return renderer; } })();
const capture = path.join(os.tmpdir(), 'gridiron-ue-stream.png');
const children = [];
let exitCode = 1;
const finish = (code, message) => {
  exitCode = code;
  console.log(message);
  for (const c of children) if (c.pid) spawn('taskkill', ['/PID', String(c.pid), '/T', '/F'], { stdio: 'ignore' });
  setTimeout(() => app.exit(exitCode), 1500);
};

app.whenReady().then(async () => {
  if (!fs.existsSync(renderer)) return finish(1, `FAIL: renderer not installed at ${renderer}`);
  const win = new BrowserWindow({ width: 1280, height: 760, show: true, webPreferences: { preload: path.join(root, 'desktop', 'preload.cjs'), sandbox: true, contextIsolation: true, nodeIntegration: false } });
  const signalling = createSignalling({ port: 47821, log: (m) => console.log('[signalling] ' + m), trace: (dir, msg) => console.log('[trace] ' + dir + ' ' + msg.type + (msg.playerId ? ' p' + msg.playerId : '')), onPlayerMessage: (msg) => win.webContents.send('stream:message', msg), onStatus: (s) => win.webContents.send('stream:status', s) });
  await signalling.start();
  ipcMain.on('stream:available', (e) => { e.returnValue = true; });
  ipcMain.on('stream:open', () => signalling.openPlayer());
  ipcMain.on('stream:send', (_e, msg) => signalling.playerMessage(msg));
  ipcMain.on('stream:close', () => signalling.closePlayer());
  ipcMain.on('ue:status', (e) => { e.returnValue = { connected: false }; });

  children.push(spawn(process.env.NODE || 'node', ['scripts/ue-replay.mjs', '--every', '6', '--seed', '46'], { cwd: root, stdio: 'ignore', shell: false }));
  children.push(spawn(inner, ['-RenderOffScreen', '-PixelStreamingConnectionURL=' + signalling.url(), '-ResX=1280', '-ResY=720', '-ForceRes', '-Unattended', '-NoSplash'], { stdio: 'ignore', shell: false }));

  const page = path.join(os.tmpdir(), 'gridiron-ue-stream-check.html');
  const module = pathToFileURL(path.join(root, 'dist', 'bridge', 'ue-view.mjs')).href;
  fs.writeFileSync(page, `<!doctype html><meta charset="utf-8"><body style="margin:0;background:#000">
<video id="v" muted autoplay playsinline style="width:100vw;height:100vh;object-fit:cover"></video>
<script type="module">
import { createStreamPlayer } from ${JSON.stringify(module)};
const v = document.getElementById('v');
createStreamPlayer(window.gridironUE.stream, v, { onState: (s) => console.log('STATE ' + s) });
let last = 0, advancing = 0;
setInterval(() => { if (v.videoWidth && v.currentTime > last) { advancing++; last = v.currentTime; } if (advancing >= 4) console.log('FRAMES ' + v.videoWidth + 'x' + v.videoHeight); }, 500);
</script>`);
  let done = false;
  win.webContents.on('console-message', async (_e, ...args) => {
    const message = typeof args[0] === 'object' ? args[0].message : args[1];
    if (message?.startsWith('STATE')) console.log('[page] ' + message);
    if (!done && message?.startsWith('FRAMES')) {
      done = true;
      await new Promise((r) => setTimeout(r, 6000)); // let a play run
      fs.writeFileSync(capture, (await win.webContents.capturePage()).toPNG());
      finish(0, `PASS: Unreal stream decoding ${message.slice(7)}; capture saved to ${capture}`);
    }
  });
  win.loadFile(page);
  setTimeout(() => !done && finish(1, 'FAIL: no video frames within 120 s'), 120000);
});
