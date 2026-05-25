/**
 * Lokale Bridge: Backend (Python) → Electron (Tray, Fenster).
 */
const http = require('http');
const fs = require('fs');
const path = require('path');
const os = require('os');

const BRIDGE_PORT = 17862;

function getFlagPath() {
  const base = process.env.LOCALAPPDATA || path.join(os.homedir(), 'AppData', 'Local');
  return path.join(base, 'EliteDesktopAgent', 'hide_to_tray.flag');
}

function startEliteBridge({ hideToTray, showFromTray }) {
  const flagPath = getFlagPath();
  const flagDir = path.dirname(flagPath);

  const checkFlag = () => {
    try {
      if (fs.existsSync(flagPath)) {
        fs.unlinkSync(flagPath);
        hideToTray();
      }
    } catch {
      /* ignore */
    }
  };

  const flagInterval = setInterval(checkFlag, 400);

  const server = http.createServer((req, res) => {
    const url = req.url || '';
    if (req.method === 'POST' && url === '/hide-to-tray') {
      hideToTray();
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: true }));
      return;
    }
    if (req.method === 'POST' && url === '/show') {
      showFromTray();
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: true }));
      return;
    }
    res.writeHead(404);
    res.end();
  });

  server.listen(BRIDGE_PORT, '127.0.0.1', () => {
    console.log(`[Bridge] http://127.0.0.1:${BRIDGE_PORT}`);
  });

  try {
    fs.mkdirSync(flagDir, { recursive: true });
  } catch {
    /* ignore */
  }

  return {
    stop: () => {
      clearInterval(flagInterval);
      server.close();
    },
  };
}

module.exports = { startEliteBridge, getFlagPath, BRIDGE_PORT };
