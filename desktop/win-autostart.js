/**
 * Windows Autostart: Registry Run-Eintrag für Elite Boot-Script.
 */
const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const RUN_KEY = 'HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Run';
const VALUE_NAME = 'EliteDesktopAgent';

function getBootScriptPath(projectRoot) {
  return path.join(projectRoot, 'scripts', 'elite-autostart.ps1');
}

function isAutostartRegistered() {
  if (process.platform !== 'win32') return false;
  try {
    const out = execSync(`reg query "${RUN_KEY}" /v "${VALUE_NAME}"`, {
      encoding: 'utf8',
      windowsHide: true,
    });
    return out.includes(VALUE_NAME);
  } catch {
    return false;
  }
}

function registerAutostart(projectRoot) {
  if (process.platform !== 'win32') return false;
  const ps1 = getBootScriptPath(projectRoot);
  if (!fs.existsSync(ps1)) {
    throw new Error(`Boot-Script fehlt: ${ps1}`);
  }
  const cmd = `powershell.exe -NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File "${ps1}"`;
  const escaped = cmd.replace(/'/g, "''");
  execSync(
    `powershell -NoProfile -Command "Set-ItemProperty -Path 'HKCU:\\Software\\Microsoft\\Windows\\CurrentVersion\\Run' -Name '${VALUE_NAME}' -Value '${escaped}' -Force"`,
    { windowsHide: true },
  );
  return true;
}

function unregisterAutostart() {
  if (process.platform !== 'win32') return false;
  try {
    execSync(`reg delete "${RUN_KEY}" /v "${VALUE_NAME}" /f`, { windowsHide: true });
    return true;
  } catch {
    return false;
  }
}

module.exports = {
  isAutostartRegistered,
  registerAutostart,
  unregisterAutostart,
  getBootScriptPath,
};
