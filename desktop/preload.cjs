// Sandboxed preload: exposes only the Unreal bridge channel. No Node APIs reach the renderer.
const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('gridironUE', {
  send: (message) => ipcRenderer.send('ue:send', message),
  status: () => ipcRenderer.sendSync('ue:status'),
  onMessage: (callback) => {
    if (typeof callback !== 'function') return;
    ipcRenderer.on('ue:message', (_event, message) => callback(message));
  },
});
