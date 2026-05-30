const { Tray, Menu, nativeImage } = require('electron');
const path = require('path');

let tray = null;
let getMainWindow = () => null;
let onQuit = () => {};

function getTrayIcon() {
  const iconPath = path.join(__dirname, 'Assets', 'app.ico');
  try {
    return nativeImage.createFromPath(iconPath);
  } catch {
    return nativeImage.createEmpty();
  }
}

function setupTray({ getWindow, onQuitRequested }) {
  getMainWindow = getWindow;
  onQuit = onQuitRequested;

  if (tray) return tray;

  const icon = getTrayIcon();
  tray = new Tray(icon.isEmpty() ? nativeImage.createEmpty() : icon);
  tray.setToolTip('Elite Desktop Agent');

  const rebuildMenu = () => {
    tray.setContextMenu(
      Menu.buildFromTemplate([
        {
          label: 'Elite öffnen',
          click: () => showFromTray(),
        },
        {
          label: 'In Systemleiste minimieren',
          click: () => hideToTray(),
        },
        { type: 'separator' },
        {
          label: 'Logdatei anzeigen',
          click: () => {
            const { toggleLogWindow } = require('./log-window');
            toggleLogWindow();
          },
        },
        {
          label: 'Dienste neu starten',
          click: () => {
            const { ensureRuntimeHealthy } = require('./services');
            void ensureRuntimeHealthy({ reason: 'tray-menu', force: true }).then(
              notifyRuntimeRepaired,
            );
          },
        },
        {
          label: 'Developer Tools',
          click: () => {
            const win = getMainWindow();
            if (!win) return;
            if (win.webContents.isDevToolsOpened()) {
              win.webContents.closeDevTools();
            } else {
              win.webContents.openDevTools({ mode: 'detach' });
            }
          },
        },
        { type: 'separator' },
        {
          label: 'Beenden',
          click: () => onQuit(),
        },
      ]),
    );
  };

  rebuildMenu();
  tray.on('double-click', () => showFromTray());
  return tray;
}

function hideToTray() {
  const win = getMainWindow();
  if (!win) return;
  if (!tray) return;
  win.hide();
}

function notifyRuntimeRepaired(status) {
  const win = getMainWindow();
  if (!win || win.isDestroyed()) return;
  try {
    win.webContents.send('elite-runtime-repaired', status);
  } catch {
    /* Fenster gerade geschlossen */
  }
}

function showFromTray() {
  const win = getMainWindow();
  if (!win) return;
  if (win.isMinimized()) win.restore();
  win.show();
  win.focus();

  try {
    const { ensureRuntimeHealthy } = require('./services');
    void ensureRuntimeHealthy({ reason: 'tray-show' }).then(notifyRuntimeRepaired);
  } catch (err) {
    console.warn('[Tray] ensureRuntimeHealthy:', err.message);
  }
}

function destroyTray() {
  if (tray) {
    tray.destroy();
    tray = null;
  }
}

module.exports = {
  setupTray,
  hideToTray,
  showFromTray,
  destroyTray,
};
