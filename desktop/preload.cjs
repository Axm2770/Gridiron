// Sandboxed preload: exposes only the Unreal bridge and in-game update channels. No Node APIs reach the renderer.
const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('gridironUE', {
  send: (message) => ipcRenderer.send('ue:send', message),
  status: () => ipcRenderer.sendSync('ue:status'),
  onMessage: (callback) => {
    if (typeof callback !== 'function') return;
    ipcRenderer.on('ue:message', (_event, message) => callback(message));
  },
});
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
