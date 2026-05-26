const { BrowserWindow, ipcMain, screen } = require('electron');
const path = require('path');

const FRONTEND_URL = process.env.ELITE_FRONTEND_URL || 'http://127.0.0.1:3000';
const MISSION_CONTROL_PATH = '/hermes/mission-control';

/** @type {import('electron').BrowserWindow | null} */
let missionControlWindow = null;

function getDefaultBounds() {
  const { width, height } = screen.getPrimaryDisplay().workAreaSize;
  return {
    width: Math.min(1440, Math.round(width * 0.88)),
    height: Math.min(920, Math.round(height * 0.88)),
    x: Math.round(width * 0.06),
    y: Math.round(height * 0.05),
  };
}

function createMissionControlWindow() {
  if (missionControlWindow && !missionControlWindow.isDestroyed()) {
    missionControlWindow.show();
    missionControlWindow.focus();
    return missionControlWindow;
  }

  const bounds = getDefaultBounds();
  const win = new BrowserWindow({
    ...bounds,
    minWidth: 960,
    minHeight: 640,
    title: 'Hermes Mission Control',
    frame: true,
    transparent: false,
    backgroundColor: '#15151f',
    show: false,
    autoHideMenuBar: true,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: false,
      backgroundThrottling: false,
      webSecurity: false,
      preload: path.join(__dirname, 'preload.js'),
    },
  });

  missionControlWindow = win;
  const url = `${FRONTEND_URL}${MISSION_CONTROL_PATH}`;

  win.loadURL(url).catch((err) => {
    console.error('[MissionControlWindow] load failed:', err.message);
  });

  win.once('ready-to-show', () => {
    if (!win.isDestroyed()) win.show();
  });

  win.on('closed', () => {
    missionControlWindow = null;
  });

  console.log(`[MissionControlWindow] opened ${url}`);
  return win;
}

const IPC_CHANNEL = 'elite-open-mission-control';

function setupMissionControlWindowIpc() {
  try {
    ipcMain.removeHandler(IPC_CHANNEL);
  } catch {
    /* first registration */
  }

  ipcMain.handle(IPC_CHANNEL, () => {
    try {
      createMissionControlWindow();
      return { ok: true };
    } catch (err) {
      return { ok: false, error: err?.message || 'open_failed' };
    }
  });

  console.log('[MissionControlWindow] IPC handler registered');
}

module.exports = {
  setupMissionControlWindowIpc,
  createMissionControlWindow,
};
