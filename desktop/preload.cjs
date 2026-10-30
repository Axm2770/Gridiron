// Sandboxed preload: exposes only the in-game update channels. No Node APIs reach the renderer.
const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('gridironUpdates', {
  status: () => ipcRenderer.sendSync('updates:status'),
  check: () => ipcRenderer.invoke('updates:check'),
  download: () => ipcRenderer.invoke('updates:download'),
  reload: () => ipcRenderer.send('updates:reload'),
  ready: () => ipcRenderer.send('updates:ready'),
  openRelease: () => ipcRenderer.send('updates:open-release'),
  onStatus: (callback) => {
    if (typeof callback !== 'function') return;
    ipcRenderer.on('updates:status', (_event, status) => callback(status));
  },
});
