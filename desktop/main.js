const {
  app,
  BrowserWindow,
  systemPreferences,
  session,
  globalShortcut,
  net,
  shell,
  ipcMain,
} = require('electron');
const path = require('path');

/** MSIX/GUI-Start ohne Konsole: stdout-Pipe fehlt → console.log wirft sonst EPIPE. */
function patchConsoleForHeadless() {
  for (const method of ['log', 'info', 'warn', 'error', 'debug']) {
    const original = console[method].bind(console);
    console[method] = (...args) => {
      try {
        original(...args);
      } catch (err) {
        if (err?.code !== 'EPIPE') throw err;
      }
    };
  }
}
patchConsoleForHeadless();

const { startServices, stopServices, restartPaiPulse, getRuntimeStatus } = require('./services');
const { setupTerminalToggle } = require('./log-window');
const { setupWidgetWindowIpc, setMainWindow } = require('./widget-window');
// Sofort registrieren — Renderer-Reload (F5) darf nicht vor Handler-Setup invoke'n
setupWidgetWindowIpc();
const { setupTray, hideToTray, showFromTray, destroyTray } = require('./tray');
const { startEliteBridge } = require('./elite-bridge');
let registerAutostart = () => false;
let isAutostartRegistered = () => false;
try {
  ({ registerAutostart, isAutostartRegistered } = require('./win-autostart'));
} catch (err) {
  console.warn('[Main] win-autostart nicht verfügbar:', err.message);
}

const isDev = process.env.NODE_ENV === 'development';
const FRONTEND_URL = process.env.ELITE_FRONTEND_URL || 'http://127.0.0.1:3000';
const FALLBACK_HTML = path.join(__dirname, 'fallback.html');

app.name = 'Elite Desktop Agent';

if (process.platform === 'win32') {
  app.setAppUserModelId('com.webstark.eliteagent');
}

app.commandLine.appendSwitch('disable-http-cache');
app.commandLine.appendSwitch('no-sandbox');
app.commandLine.appendSwitch('autoplay-policy', 'no-user-gesture-required');
app.commandLine.appendSwitch(
  'disable-features',
  [
    'HardwareMediaKeyHandling',
    'MediaSessionService',
    'AudioServiceOutOfProcess',
    'AudioServiceSandbox',
    'WinMediaFoundationAudioCapture',
  ].join(',')
);
app.commandLine.appendSwitch(
  'unsafely-treat-insecure-origin-as-secure',
  'http://127.0.0.1:3000,http://127.0.0.1:8642,http://127.0.0.1:9119'
);
app.commandLine.appendSwitch('allow-insecure-localhost', 'true');
app.commandLine.appendSwitch('disable-renderer-backgrounding');

if (!isDev) {
  app.commandLine.appendSwitch('disable-devtools');
}

let mainWindow = null;
let isQuitting = false;
let bridgeServer = null;

/** Prüft ob das Next.js-Frontend antwortet */
function checkFrontend(url) {
  return new Promise((resolve) => {
    console.log(`[Main] Prüfe Frontend: ${url}...`);
    const request = net.request({ method: 'GET', url });
    const timeout = setTimeout(() => {
      request.abort();
      console.log(
        `[Main] Frontend Check Timeout für ${url} — ist Next.js auf :3000? (Zombie auf 3000 → Next weicht auf :3001 aus)`,
      );
      resolve(false);
    }, 8000);

    request.on('response', (response) => {
      clearTimeout(timeout);
      const ok = response.statusCode >= 200 && response.statusCode < 500;
      console.log(`[Main] Frontend Antwort: ${response.statusCode} (OK: ${ok})`);
      resolve(ok);
    });
    request.on('error', (err) => {
      clearTimeout(timeout);
      console.log(`[Main] Frontend Check Fehler: ${err.message}`);
      resolve(false);
    });
    request.end();
  });
}

async function requestMediaAccess() {
  // askForMediaAccess existiert nur auf macOS
  if (process.platform !== 'darwin') return;
  try {
    await systemPreferences.askForMediaAccess('camera');
    await systemPreferences.askForMediaAccess('microphone');
  } catch (error) {
    console.error('[Main] Media Permission Error:', error);
  }
}

function setupSessionPermissions() {
  const ses = session.defaultSession;

  ses.setPermissionCheckHandler((_wc, permission) => {
    if (['media', 'microphone', 'camera'].includes(permission)) return true;
    return true;
  });

  ses.setPermissionRequestHandler((_wc, permission, callback) => {
    if (['media', 'microphone', 'camera'].includes(permission)) {
      callback(true);
      return;
    }
    callback(true);
  });
}

function attachRendererLogging(win) {
  win.webContents.on('console-message', (_e, _level, message) => {
    console.log(`[Renderer] ${message}`);
  });

  win.webContents.on('render-process-gone', (_e, details) => {
    console.error('[Renderer] Prozess beendet:', details.reason, details.exitCode);
  });

  win.webContents.on('did-fail-load', (_e, code, desc, url) => {
    console.error('[Main] did-fail-load:', code, desc, url);
  });
}

async function loadHud(win) {
  // Zeige sofort das Fallback/Loading an
  await win.loadFile(FALLBACK_HTML);
  
  const isAutostart = process.argv.includes('--autostart') || process.env.ELITE_AUTOSTART === '1';
  const targetUrl = isAutostart ? `${FRONTEND_URL}/?autostart=true` : FRONTEND_URL;
  console.log(`[Main] Start-Modus: ${isAutostart ? 'Autostart (Lock Screen übersprungen)' : 'Manueller Start (Lock Screen aktiv)'}`);

  // Endlosschleife bis das Frontend bereit ist
  let ready = false;
  while (!ready) {
    console.log(`[Main] Warte auf Frontend (URL: ${FRONTEND_URL})...`);
    ready = await checkFrontend(FRONTEND_URL);
    
    if (ready) {
      console.log('[Main] Frontend bereit! Lade HUD URL:', targetUrl);
      try {
        await win.loadURL(targetUrl);
        return;
      } catch (e) {
        console.error('[Main] Fehler beim Laden der HUD URL:', e.message);
        ready = false; // Zurück zum Warten
      }
    }
    
    // Warte 5 Sekunden vor dem nächsten Versuch
    await new Promise(r => setTimeout(r, 5000));
  }
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 1280,
    minHeight: 720,
    title: 'Elite Desktop Agent',
    frame: false,
    transparent: true,
    roundedCorners: process.platform === 'win32',
    backgroundColor: '#00000000',
    paintWhenInitiallyHidden: true,
    show: true, // Sofort zeigen für Elite-Feeling
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: false,
      backgroundThrottling: false,
      devTools: isDev,
      webSecurity: false,
      preload: path.join(__dirname, 'preload.js'),
    },
  });

  attachRendererLogging(mainWindow);

  // ── Externe Navigation: OAuth/CAPTCHA-Links im System-Browser öffnen ──
  const ALLOWED_INTERNAL = ['127.0.0.1:3000', '127.0.0.1:8642', '127.0.0.1:9119', 'localhost'];
  const isExternalUrl = (url) => url.startsWith('http') && !ALLOWED_INTERNAL.some(h => url.includes(h));

  mainWindow.webContents.on('will-navigate', (event, url) => {
    if (isExternalUrl(url)) {
      event.preventDefault();
      shell.openExternal(url);
      console.log(`[Main] Externer Link (will-navigate): ${url}`);
    }
  });

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (isExternalUrl(url)) {
      shell.openExternal(url);
      console.log(`[Main] Externes Fenster: ${url}`);
    }
    return { action: 'deny' };
  });

  loadHud(mainWindow).catch((err) => {
    console.error('[Main] loadHud Fehler:', err);
    mainWindow?.loadFile(FALLBACK_HTML);
  });

  mainWindow.webContents.on('did-finish-load', () => {
    if (!mainWindow) return;

    // Windows 11: Acrylic-HUD ohne leeres Fenster
    if (process.platform === 'win32' && typeof mainWindow.setBackgroundMaterial === 'function') {
      try {
        mainWindow.setBackgroundMaterial('acrylic');
      } catch {
        /* ältere Windows-Version */
      }
    }
  });

  mainWindow.once('ready-to-show', () => {
    if (!mainWindow) return;
    mainWindow.focus();

    if (isDev) {
      mainWindow.webContents.openDevTools({ mode: 'detach' });
    }
  });

  mainWindow.on('close', (event) => {
    // Standard: Fenster schließen beendet die App (kein Tray-Hänger).
    // ELITE_MINIMIZE_ON_CLOSE=1 → altes Verhalten (in Systemleiste minimieren).
    if (!isQuitting && process.env.ELITE_MINIMIZE_ON_CLOSE === '1') {
      event.preventDefault();
      hideToTray();
      return;
    }
    isQuitting = true;
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });

  const reload = async () => {
    if (!mainWindow) return;
    const ok = await checkFrontend(FRONTEND_URL);
    if (ok) {
      mainWindow.loadURL(FRONTEND_URL);
    } else {
      mainWindow.loadFile(FALLBACK_HTML);
    }
  };

  globalShortcut.register('F5', reload);
  globalShortcut.register('CommandOrControl+R', reload);
  globalShortcut.register('CommandOrControl+W', () => hideToTray());

  if (isDev) {
    globalShortcut.register('F1', () => {
      if (!mainWindow) return;
      if (mainWindow.webContents.isDevToolsOpened()) {
        mainWindow.webContents.closeDevTools();
      } else {
        mainWindow.webContents.openDevTools({ mode: 'detach' });
      }
    });
  }
}

app.whenReady().then(async () => {
  if (
    process.platform === 'win32' &&
    !app.isPackaged &&
    process.env.ELITE_SKIP_AUTOSTART_REGISTER !== '1'
  ) {
    try {
      const projectRoot = path.resolve(__dirname, '..');
      if (!isAutostartRegistered()) {
        registerAutostart(projectRoot);
        console.log('[Main] Windows-Autostart registriert (Registry Run, Dev).');
      }
    } catch (e) {
      console.warn('[Main] Autostart-Registrierung fehlgeschlagen:', e.message);
    }
  }

  // Dienste starten (inkl. Docker/LiveKit Bootstrap)
  await startServices();

  setupSessionPermissions();
  await requestMediaAccess();
  
  createWindow();
  setMainWindow(mainWindow);

  setupTray({
    getWindow: () => mainWindow,
    onQuitRequested: () => {
      isQuitting = true;
      app.quit();
    },
  });

  bridgeServer = startEliteBridge({ hideToTray, showFromTray });

  // Terminal-Toggle aktivieren (Strg+T)
  setupTerminalToggle();

  app.on('activate', () => {

    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

ipcMain.handle('elite-open-external', async (_event, url) => {
  if (typeof url === 'string' && url.startsWith('http')) {
    shell.openExternal(url);
    console.log(`[Main] IPC-open-external: ${url}`);
    return { ok: true };
  }
  return { ok: false, error: 'invalid url' };
});

ipcMain.on('restart-services', async () => {
  console.log('[IPC] Restarting services...');
  await stopServices();
  await startServices();
});

ipcMain.on('reload-hud', async (event) => {
  const ok = await checkFrontend(FRONTEND_URL);
  if (ok) {
    mainWindow?.loadURL(FRONTEND_URL);
  } else {
    event.reply('hud-not-ready');
  }
});

ipcMain.on('elite-hide-to-tray', () => hideToTray());
ipcMain.on('elite-show-window', () => showFromTray());
ipcMain.on('elite-quit-app', () => {
  isQuitting = true;
  app.quit();
});

ipcMain.handle('elite-runtime-status', async () => {
  return getRuntimeStatus();
});

ipcMain.handle('elite-restart-pai-pulse', async () => {
  const ok = await restartPaiPulse();
  return { ok };
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('before-quit', () => {
  isQuitting = true;
});

app.on('will-quit', () => {
  bridgeServer?.stop();
  destroyTray();
  void stopServices();
  globalShortcut.unregisterAll();
});
