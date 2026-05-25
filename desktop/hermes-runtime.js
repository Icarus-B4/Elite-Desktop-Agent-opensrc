const { spawn, spawnSync } = require('child_process');
const path = require('path');
const os = require('os');
const fs = require('fs');

/** @typedef {'auto' | 'wsl' | 'native'} HermesRuntimeMode */

/**
 * Windows: prefer WSL2 (battle-tested, full dashboard PTY).
 * Override: ELITE_HERMES_MODE=wsl|native|auto (default auto on win32).
 */
function getHermesRuntimeMode() {
  const raw = (process.env.ELITE_HERMES_MODE || 'auto').trim().toLowerCase();
  if (raw === 'wsl' || raw === 'native' || raw === 'auto') return raw;
  return 'auto';
}

function isWslAvailableSync() {
  if (process.platform !== 'win32') return false;
  try {
    const r = spawnSync('wsl.exe', ['--status'], {
      windowsHide: true,
      encoding: 'utf8',
      timeout: 8000,
    });
    return r.status === 0;
  } catch {
    return false;
  }
}

function getWslDistro() {
  const override = process.env.HERMES_WSL_DISTRO?.trim();
  if (override) return override;
  try {
    const r = spawnSync('wsl.exe', ['-l', '-q'], {
      windowsHide: true,
      encoding: 'utf16le',
      timeout: 8000,
    });
    const first = (r.stdout || '')
      .split(/\r?\n/)
      .map((s) => s.replace(/\0/g, '').trim())
      .filter((s) => s && !s.startsWith('Windows'));
    return first[0] || 'Ubuntu';
  } catch {
    return 'Ubuntu';
  }
}

function shouldUseWsl() {
  if (process.platform !== 'win32') return false;
  const mode = getHermesRuntimeMode();
  if (mode === 'native') return false;
  if (mode === 'wsl') return isWslAvailableSync();
  return isWslAvailableSync();
}

function linuxPathToWslUnc(distro, linuxPath) {
  const rel = linuxPath.replace(/^\//, '').replace(/\//g, '\\');
  const hosts = [
    `\\\\wsl.localhost\\${distro}\\${rel}`,
    `\\\\wsl$\\${distro}\\${rel}`,
  ];
  for (const unc of hosts) {
    if (fs.existsSync(unc)) return unc;
  }
  return hosts[0];
}

function resolveWslHermesHomeSync() {
  const distro = getWslDistro();
  try {
    const r = spawnSync(
      'wsl.exe',
      ['-d', distro, '-e', 'bash', '-lc', 'printf %s "$HOME/.hermes"'],
      { windowsHide: true, encoding: 'utf8', timeout: 15000 },
    );
    const linuxPath = (r.stdout || '').trim();
    if (!linuxPath || r.status !== 0) return null;
    return linuxPathToWslUnc(distro, linuxPath);
  } catch {
    return null;
  }
}

function getNativeHermesHome() {
  const local = process.env.LOCALAPPDATA || path.join(os.homedir(), 'AppData', 'Local');
  return path.join(local, 'hermes');
}

/** Hermes data directory (WSL UNC on Windows when WSL mode active). */
function getHermesHome() {
  const override = process.env.HERMES_HOME?.trim();
  if (override) return override;
  if (process.platform === 'win32' && shouldUseWsl()) {
    const wslHome = resolveWslHermesHomeSync();
    if (wslHome) return wslHome;
  }
  if (process.platform === 'win32') {
    return getNativeHermesHome();
  }
  return path.join(os.homedir(), '.hermes');
}

function getHermesCli() {
  return process.env.HERMES_CLI?.trim() || 'hermes';
}

function getHermesGatewayUrl() {
  return (process.env.HERMES_GATEWAY_URL || 'http://127.0.0.1:8642').replace(/\/$/, '');
}

function getHermesDashboardUrl() {
  return (process.env.HERMES_DASHBOARD_URL || 'http://127.0.0.1:9119').replace(/\/$/, '');
}

function getHermesStateDbPath() {
  return path.join(getHermesHome(), 'state.db');
}

function getHermesGatewayLogPath() {
  const home = getHermesHome();
  const candidates = [
    path.join(home, 'logs', 'gateway.log'),
    path.join(home, 'gateway.log'),
  ];
  for (const p of candidates) {
    if (fs.existsSync(p)) return p;
  }
  return candidates[0];
}

function resolveHermesExecutable() {
  const cli = getHermesCli();
  if (path.isAbsolute(cli) && fs.existsSync(cli)) return cli;
  if (process.platform === 'win32' && !shouldUseWsl()) {
    const localHermes = path.join(getNativeHermesHome(), 'bin', 'hermes.exe');
    if (fs.existsSync(localHermes)) return localHermes;
  }
  return cli;
}

function buildHermesGatewayCommand(action = 'start') {
  const gatewaySubcmd =
    shouldUseWsl() && (action === 'start' || action === 'run') ? 'run' : action;

  if (shouldUseWsl()) {
    const distro = getWslDistro();
    const shellCmd = `export PATH="$HOME/.local/bin:$HOME/.hermes/node/bin:$PATH"; hermes gateway ${gatewaySubcmd}`;
    return {
      cmd: 'wsl.exe',
      args: ['-d', distro, '--', 'bash', '-lc', shellCmd],
      runtime: 'wsl',
      distro,
      gatewaySubcmd,
    };
  }
  const exe = resolveHermesExecutable();
  return {
    cmd: exe,
    args: ['gateway', gatewaySubcmd],
    runtime: 'native',
    gatewaySubcmd,
  };
}

/** Startet Gateway + Dashboard via Repo-Skript (WSL bash oder Windows PowerShell). */
function buildHermesStackStartCommand() {
  const repoRoot = path.resolve(__dirname, '..');
  if (process.platform === 'win32') {
    const ps1 = path.join(repoRoot, 'scripts', 'start-hermes-gateway.ps1');
    return {
      cmd: 'powershell.exe',
      args: ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', ps1],
      runtime: shouldUseWsl() ? 'wsl' : 'native',
      hermesStack: true,
    };
  }
  const sh = path.join(repoRoot, 'scripts', 'start-hermes-gateway.sh');
  return {
    cmd: 'bash',
    args: [sh],
    runtime: 'linux',
    hermesStack: true,
  };
}

function createHermesGatewayProcess(action = 'start', options = {}) {
  const built = buildHermesGatewayCommand(action);
  const env = { ...process.env };
  if (built.runtime === 'wsl') {
    env.ELITE_HERMES_RUNTIME = 'wsl';
    env.HERMES_WSL_DISTRO = built.distro;
  } else {
    env.HERMES_HOME = getHermesHome();
    env.ELITE_HERMES_RUNTIME = 'native';
  }
  return spawn(built.cmd, built.args, {
    ...options,
    shell: false,
    windowsHide: true,
    env,
  });
}

function getHermesRuntimeInfo() {
  return {
    mode: getHermesRuntimeMode(),
    active: shouldUseWsl() ? 'wsl' : process.platform === 'win32' ? 'native' : 'linux',
    wslAvailable: isWslAvailableSync(),
    distro: shouldUseWsl() ? getWslDistro() : null,
    home: getHermesHome(),
    gatewayUrl: getHermesGatewayUrl(),
    dashboardUrl: getHermesDashboardUrl(),
  };
}

module.exports = {
  getHermesRuntimeMode,
  isWslAvailableSync,
  getWslDistro,
  shouldUseWsl,
  getHermesHome,
  getHermesCli,
  getHermesGatewayUrl,
  getHermesDashboardUrl,
  getHermesStateDbPath,
  getHermesGatewayLogPath,
  resolveHermesExecutable,
  buildHermesGatewayCommand,
  buildHermesStackStartCommand,
  createHermesGatewayProcess,
  getHermesRuntimeInfo,
};
