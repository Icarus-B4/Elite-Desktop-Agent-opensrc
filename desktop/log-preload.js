const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('logViewer', {
  readSections: () => ipcRenderer.invoke('read-log-sections'),
});
