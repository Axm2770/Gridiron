// Sandboxed preload: exposes only the Unreal bridge and in-game update channels. No Node APIs reach the renderer.
const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('gridironUE', {
  send: (message) => ipcRenderer.send('ue:send', message),
  status: () => ipcRenderer.sendSync('ue:status'),
  onMessage: (callback) => {
    if (typeof callback !== 'function') return;
    ipcRenderer.on('ue:message', (_event, message) => callback(message));
  },
  // Embedded match view (Pixel Streaming): the page is the WebRTC player; signalling goes via IPC.
  stream: {
    available: () => ipcRenderer.sendSync('stream:available'),
    start: () => ipcRenderer.invoke('stream:start'),
    open: () => ipcRenderer.send('stream:open'),
    send: (message) => ipcRenderer.send('stream:send', message),
    close: () => ipcRenderer.send('stream:close'),
    stop: () => ipcRenderer.send('stream:stop'),
    onMessage: (callback) => {
      if (typeof callback !== 'function') return;
      ipcRenderer.on('stream:message', (_event, message) => callback(message));
    },
    onStatus: (callback) => {
      if (typeof callback !== 'function') return;
      ipcRenderer.on('stream:status', (_event, status) => callback(status));
    },
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
