const { BrowserWindow, globalShortcut, ipcMain } = require('electron');
const path = require('path');
const fs = require('fs');
const os = require('os');

let logWindow = null;
const logPath = path.join(os.homedir(), 'Desktop', 'EliteAgent_services.log');

// API für das Fenster bereitstellen
ipcMain.handle('read-log', async () => {
  if (fs.existsSync(logPath)) {
    return fs.readFileSync(logPath, 'utf8');
  }
  return 'Warte auf Log-Daten...';
});

function createLogWindow() {
  logWindow = new BrowserWindow({
    width: 900,
    height: 500,
    title: 'Elite System Terminal',
    backgroundColor: '#0a0a0a',
    show: false,
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false
    }
  });

  const htmlContent = `
    <html>
      <head>
        <style>
          body { background: #0a0a0a; color: #00f2ff; font-family: 'Consolas', monospace; padding: 20px; overflow-y: scroll; font-size: 13px; line-height: 1.5; }
          #output { white-space: pre-wrap; }
          h2 { color: #00ffaa; border-bottom: 1px solid #00f2ff; padding-bottom: 5px; font-size: 16px; margin-top: 0; }
        </style>
      </head>
      <body>
        <h2>> ELITE_SYSTEM_CORE_LOG</h2>
        <div id="output">Initialisiere Stream...</div>
        <script>
          const { ipcRenderer } = require('electron');
          const output = document.getElementById('output');
          async function updateLog() {
            const text = await ipcRenderer.invoke('read-log');
            if (output.innerText !== text) {
              output.innerText = text;
              window.scrollTo(0, document.body.scrollHeight);
            }
          }
          setInterval(updateLog, 1000);
          updateLog();
        </script>
      </body>
    </html>
  `;

  logWindow.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(htmlContent)}`);
  logWindow.setMenuBarVisibility(false);

  logWindow.on('closed', () => {
    logWindow = null;
  });
}

function toggleLogWindow() {
  if (!logWindow) {
    createLogWindow();
    logWindow.show();
  } else {
    if (logWindow.isVisible()) {
      logWindow.hide();
    } else {
      logWindow.show();
    }
  }
}

function setupTerminalToggle() {
  // Verhindere doppelte Registrierung
  try { globalShortcut.unregister('CommandOrControl+T'); } catch(e) {}
  
  globalShortcut.register('CommandOrControl+T', () => {
    toggleLogWindow();
  });
}

module.exports = { setupTerminalToggle, toggleLogWindow };
