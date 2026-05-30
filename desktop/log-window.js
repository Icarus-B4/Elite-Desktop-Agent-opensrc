const { BrowserWindow, globalShortcut, ipcMain } = require('electron');
const fs = require('fs');
const path = require('path');
const { getTrayLogSections } = require('./log-path');

let logWindow = null;

function readHudThemeId() {
  try {
    const configPath = path.join(__dirname, '..', 'backend', 'config.json');
    const data = JSON.parse(fs.readFileSync(configPath, 'utf8'));
    const id = Number(data.hudAesthetics);
    return id === 1 || id === 2 ? id : 0;
  } catch {
    return 0;
  }
}

ipcMain.handle('read-log-sections', async () => ({
  sections: getTrayLogSections(),
  hudTheme: readHudThemeId(),
}));

function createLogWindow() {
  const preloadPath = path.join(__dirname, 'log-preload.js');
  const htmlPath = path.join(__dirname, 'log-viewer.html');

  logWindow = new BrowserWindow({
    width: 900,
    height: 640,
    minWidth: 520,
    minHeight: 360,
    title: 'Elite — System-Logs',
    backgroundColor: '#000b1a',
    show: false,
    autoHideMenuBar: true,
    webPreferences: {
      preload: preloadPath,
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  });

  logWindow.loadFile(htmlPath);
  logWindow.setMenuBarVisibility(false);

  logWindow.on('closed', () => {
    logWindow = null;
  });
}

function showLogWindow() {
  if (!logWindow) {
    createLogWindow();
  } else if (!logWindow.webContents.isLoading()) {
    logWindow.webContents.reloadIgnoringCache();
  }
  logWindow.show();
  logWindow.focus();
}

function toggleLogWindow() {
  if (!logWindow) {
    showLogWindow();
  } else if (logWindow.isVisible()) {
    logWindow.hide();
  } else {
    showLogWindow();
  }
}

function setupTerminalToggle() {
  try {
    globalShortcut.unregister('CommandOrControl+T');
  } catch {
    /* ignore */
  }

  globalShortcut.register('CommandOrControl+T', () => {
    toggleLogWindow();
  });
}

module.exports = { setupTerminalToggle, toggleLogWindow };
