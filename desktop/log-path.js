const fs = require('fs');
const os = require('os');
const path = require('path');

let cachedDesktopLog = null;
let cachedEliteLog = null;

function resolveDesktopDir() {
  if (process.env.ELITE_LOG_DIR?.trim()) {
    return process.env.ELITE_LOG_DIR.trim();
  }
  try {
    const { app } = require('electron');
    if (app?.getPath) {
      return app.getPath('desktop');
    }
  } catch {
    /* not in Electron main yet */
  }
  if (process.platform === 'win32') {
    const userProfile = process.env.USERPROFILE || os.homedir();
    const oneDriveDesktop = process.env.OneDrive
      ? path.join(process.env.OneDrive, 'Desktop')
      : null;
    if (oneDriveDesktop && fs.existsSync(oneDriveDesktop)) {
      return oneDriveDesktop;
    }
    return path.join(userProfile, 'Desktop');
  }
  return path.join(os.homedir(), 'Desktop');
}

/** Vollständiges Service-Log (Jarvis Core stdout inkl.). */
function getServicesLogPath() {
  if (cachedDesktopLog) return cachedDesktopLog;
  const override = process.env.ELITE_LOG_FILE?.trim();
  if (override) {
    cachedDesktopLog = override;
    return cachedDesktopLog;
  }
  cachedDesktopLog = path.join(resolveDesktopDir(), 'EliteAgent_services.log');
  return cachedDesktopLog;
}

/** Nur Elite/Electron/Hermes — ohne Next.js-HTTP-Spam. */
function getEliteOnlyLogPath() {
  if (cachedEliteLog) return cachedEliteLog;
  cachedEliteLog = path.join(resolveDesktopDir(), 'EliteAgent_elite.log');
  return cachedEliteLog;
}

function appendLogLine(filePath, line) {
  try {
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    fs.appendFileSync(filePath, line);
    return true;
  } catch (err) {
    console.error('[Log] Schreiben fehlgeschlagen:', filePath, err.message);
    return false;
  }
}

function rotateIfHuge(filePath, maxBytes = 2 * 1024 * 1024) {
  try {
    if (!fs.existsSync(filePath)) return;
    const stat = fs.statSync(filePath);
    if (stat.size < maxBytes) return;
    const backup = `${filePath}.old`;
    if (fs.existsSync(backup)) fs.unlinkSync(backup);
    fs.renameSync(filePath, backup);
  } catch (err) {
    console.warn('[Log] Rotation übersprungen:', err.message);
  }
}

module.exports = {
  resolveDesktopDir,
  getServicesLogPath,
  getEliteOnlyLogPath,
  appendLogLine,
  rotateIfHuge,
};
