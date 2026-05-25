const { BrowserWindow, ipcMain, screen } = require('electron');
const path = require('path');

const FRONTEND_URL = process.env.ELITE_FRONTEND_URL || 'http://127.0.0.1:3000';

/** @type {Map<string, import('electron').BrowserWindow>} */
const widgetWindows = new Map();

let mainWindowRef = null;

function setMainWindow(win) {
  mainWindowRef = win;
}

function broadcastToAllWindows(channel, ...args) {
  if (mainWindowRef && !mainWindowRef.isDestroyed()) {
    mainWindowRef.webContents.send(channel, ...args);
  }
  for (const win of widgetWindows.values()) {
    if (win && !win.isDestroyed()) {
      win.webContents.send(channel, ...args);
    }
  }
}

function getDefaultBounds(widgetId) {
  const { width, height } = screen.getPrimaryDisplay().workAreaSize;
  const sizes = {
    systemMonitor: { width: 440, height: 420 },
    missionControl: { width: 440, height: 460 },
    commandList: { width: 460, height: 500 },
    textEditor: { width: 520, height: 460 },
    logStream: { width: 560, height: 420 },
    imageGrid: { width: 520, height: 460 },
    paiPulse: { width: 480, height: 460 },
    mediaPlayer: { width: 560, height: 380 },
    music: { width: 420, height: 430 },
    terminal: { width: 900, height: 550 },
  };
  const size = sizes[widgetId] || { width: 440, height: 420 };

  return {
    x: Math.round(width * 0.15),
    y: Math.round(height * 0.12),
    width: size.width,
    height: size.height,
  };
}

function applyWidgetWindowChrome(win) {
  if (!win || win.isDestroyed()) return;
  win.setMenuBarVisibility(false);
}

function createWidgetWindow(widgetId, bounds = {}) {
  if (widgetWindows.has(widgetId)) {
    const existing = widgetWindows.get(widgetId);
    if (existing && !existing.isDestroyed()) {
      existing.show();
      existing.focus();
      return existing;
    }
    widgetWindows.delete(widgetId);
  }

  const defaults = getDefaultBounds(widgetId);
  const win = new BrowserWindow({
    width: bounds.width || defaults.width,
    height: bounds.height || defaults.height,
    minWidth: 320,
    minHeight: 220,
    x: bounds.x ?? defaults.x,
    y: bounds.y ?? defaults.y,
    title: `Elite – ${widgetId}`,
    frame: false,
    transparent: true,
    roundedCorners: process.platform === 'win32',
    backgroundColor: '#00000000',
    paintWhenInitiallyHidden: true,
    show: false,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: false,
      backgroundThrottling: false,
      webSecurity: false,
      preload: path.join(__dirname, 'preload.js'),
    },
  });

  widgetWindows.set(widgetId, win);

  const url = `${FRONTEND_URL}/widget/${encodeURIComponent(widgetId)}`;
  win.loadURL(url).catch((err) => {
    console.error(`[WidgetWindow] load failed for ${widgetId}:`, err.message);
  });

  win.webContents.on('did-finish-load', () => {
    applyWidgetWindowChrome(win);
  });

  win.once('ready-to-show', () => {
    if (!win.isDestroyed()) {
      applyWidgetWindowChrome(win);
      win.show();
    }
  });

  win.on('closed', () => {
    widgetWindows.delete(widgetId);
    if (mainWindowRef && !mainWindowRef.isDestroyed()) {
      mainWindowRef.webContents.send('elite-widget-window-closed', widgetId);
    }
  });

  return win;
}

function closeWidgetWindow(widgetId) {
  const win = widgetWindows.get(widgetId);
  if (win && !win.isDestroyed()) {
    win.close();
  }
  widgetWindows.delete(widgetId);
}

function setupWidgetWindowIpc() {
  ipcMain.removeHandler('elite-open-widget-window');
  ipcMain.removeHandler('elite-close-widget-window');
  ipcMain.removeHandler('elite-resize-widget-window');

  ipcMain.handle('elite-open-widget-window', (_event, widgetId, bounds) => {
    if (!widgetId || typeof widgetId !== 'string') {
      return { ok: false, error: 'invalid widgetId' };
    }
    createWidgetWindow(widgetId, bounds || {});
    return { ok: true };
  });

  ipcMain.handle('elite-close-widget-window', (_event, widgetId) => {
    closeWidgetWindow(widgetId);
    return { ok: true };
  });

  ipcMain.handle('elite-move-widget-window', (_event, widgetId, dx, dy) => {
    if (!widgetId || typeof widgetId !== 'string') return { ok: false, error: 'invalid widgetId' };
    const win = widgetWindows.get(widgetId);
    if (win && !win.isDestroyed()) {
      const [x, y] = win.getPosition();
      win.setPosition(Math.round(x + dx), Math.round(y + dy));
      return { ok: true };
    }
    return { ok: false, error: 'window not found' };
  });

  // Renderer meldet echte Inhaltsgröße → Fenster anpassen
  ipcMain.handle('elite-resize-widget-window', (event, w, h) => {
    const win = BrowserWindow.fromWebContents(event.sender);
    if (!win || win.isDestroyed()) return { ok: false };
    const clampedW = Math.max(320, Math.min(w, 900));
    const clampedH = Math.max(220, Math.min(h, 800));
    win.setContentSize(clampedW, clampedH, true);
    return { ok: true };
  });
  console.log('[WidgetWindow] IPC handlers registered');
}

module.exports = {
  setMainWindow,
  setupWidgetWindowIpc,
  createWidgetWindow,
  closeWidgetWindow,
};
