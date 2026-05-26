const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('eliteAPI', {
  restartServices: () => ipcRenderer.send('restart-services'),
  reloadHud: () => ipcRenderer.send('reload-hud'),
  hideToTray: () => ipcRenderer.send('elite-hide-to-tray'),
  showWindow: () => ipcRenderer.send('elite-show-window'),
  quitApp: () => ipcRenderer.send('elite-quit-app'),
  getRuntimeStatus: () => ipcRenderer.invoke('elite-runtime-status'),
  restartPaiPulse: () => ipcRenderer.invoke('elite-restart-pai-pulse'),
  openWidgetWindow: (widgetId, bounds) =>
    ipcRenderer.invoke('elite-open-widget-window', widgetId, bounds),
  closeWidgetWindow: (widgetId) =>
    ipcRenderer.invoke('elite-close-widget-window', widgetId),
  moveWidgetWindow: (widgetId, dx, dy) =>
    ipcRenderer.invoke('elite-move-widget-window', widgetId, dx, dy),
  resizeWidgetWindow: (w, h) =>
    ipcRenderer.invoke('elite-resize-widget-window', w, h),
  onWidgetWindowClosed: (callback) => {
    const handler = (_event, widgetId) => callback(widgetId);
    ipcRenderer.on('elite-widget-window-closed', handler);
    return () => ipcRenderer.removeListener('elite-widget-window-closed', handler);
  },
  openExternal: (url) => ipcRenderer.invoke('elite-open-external', url),
  openMissionControl: () => ipcRenderer.invoke('elite-open-mission-control'),
});
