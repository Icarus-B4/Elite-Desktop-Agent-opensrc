/**
 * Windows: Docker Desktop starten, auf Daemon warten, optional LiveKit-Container.
 */
const { exec } = require('child_process');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { promisify } = require('util');

const execAsync = promisify(exec);

const DOCKER_DESKTOP_PATHS = [
  path.join(process.env.ProgramFiles || 'C:\\Program Files', 'Docker', 'Docker', 'Docker Desktop.exe'),
  path.join(process.env['ProgramFiles(x86)'] || 'C:\\Program Files (x86)', 'Docker', 'Docker', 'Docker Desktop.exe'),
  path.join(process.env.LOCALAPPDATA || '', 'Docker', 'Docker Desktop.exe'),
];

const LIVEKIT_RUN_CMD =
  'docker run -d --name livekit-server -p 7880:7880 -p 7881:7881 -p 7882:7882/udp livekit/livekit-server --dev --bind 0.0.0.0';

function logFn(logger) {
  return (msg) => {
    const line = `[Docker] ${msg}`;
    if (logger) logger(line);
    else console.log(line);
  };
}

function getEliteConfig() {
  const base = process.env.LOCALAPPDATA || process.env.APPDATA;
  if (!base) return { livekitMode: 'cloud' };
  const configPath = path.join(base, 'EliteDesktopAgent', 'backend', 'config.json');
  try {
    if (fs.existsSync(configPath)) {
      return JSON.parse(fs.readFileSync(configPath, 'utf8'));
    }
  } catch {
    /* ignore */
  }
  return { livekitMode: 'cloud' };
}

async function dockerInfoOk() {
  try {
    await execAsync('docker info', { timeout: 8000, windowsHide: true });
    return true;
  } catch {
    return false;
  }
}

function findDockerDesktop() {
  return DOCKER_DESKTOP_PATHS.find((p) => p && fs.existsSync(p)) || null;
}

async function startDockerDesktop(logger) {
  const log = logFn(logger);
  const exe = findDockerDesktop();
  if (!exe) {
    log('Docker Desktop nicht gefunden (Installation prüfen).');
    return false;
  }
  log(`Starte Docker Desktop: ${exe}`);
  await execAsync(
    `powershell -NoProfile -Command "Start-Process -FilePath '${exe.replace(/'/g, "''")}'"`,
    { windowsHide: true, timeout: 15000 },
  );
  return true;
}

async function waitForDocker(maxMs, logger) {
  const log = logFn(logger);
  const deadline = Date.now() + maxMs;
  let attempt = 0;
  while (Date.now() < deadline) {
    attempt += 1;
    if (await dockerInfoOk()) {
      log(`Docker Daemon bereit (Versuch ${attempt}).`);
      return true;
    }
    log(`Warte auf Docker… (${attempt})`);
    await new Promise((r) => setTimeout(r, 5000));
  }
  log('Timeout: Docker Daemon nicht erreichbar.');
  return false;
}

async function localLivekitReachable() {
  try {
    const controller = new AbortController();
    const t = setTimeout(() => controller.abort(), 2000);
    const resp = await fetch('http://127.0.0.1:7880', { signal: controller.signal });
    clearTimeout(t);
    return resp.status > 0;
  } catch {
    return false;
  }
}

async function ensureLivekitContainer(logger) {
  const log = logFn(logger);
  try {
    const { stdout: running } = await execAsync(
      'docker ps --filter "name=livekit-server" --filter "status=running" --format "{{.Names}}"',
      { timeout: 15000, windowsHide: true },
    );
    if (running.includes('livekit-server') && (await localLivekitReachable())) {
      log('LiveKit-Container läuft bereits (Port 7880).');
      return true;
    }

    const { stdout: exists } = await execAsync(
      'docker ps -a --filter "name=livekit-server" --format "{{.Names}}"',
      { timeout: 15000, windowsHide: true },
    );
    if (exists.includes('livekit-server')) {
      log('Starte vorhandenen livekit-server Container…');
      await execAsync('docker start livekit-server', { timeout: 30000, windowsHide: true });
      if (await localLivekitReachable()) {
        log('LiveKit-Container bereit (Port 7880).');
        return true;
      }
      log('Container reagiert nicht – erstelle neu…');
      await execAsync('docker rm -f livekit-server', { timeout: 30000, windowsHide: true });
    }

    log('Starte livekit-server Container…');
    await execAsync(LIVEKIT_RUN_CMD, { timeout: 120000, windowsHide: true });
    log('LiveKit-Container läuft (Port 7880).');
    return true;
  } catch (e) {
    log(`LiveKit-Container Fehler: ${e.message || e}`);
    return false;
  }
}

/**
 * @param {{ logger?: (msg: string) => void, maxWaitMs?: number }} opts
 */
async function ensureDockerReady(opts = {}) {
  if (process.platform !== 'win32') return true;

  const log = logFn(opts.logger);
  const config = getEliteConfig();
  const needLivekit = config.livekitMode === 'local';

  // Cloud-Modus: Docker nicht anfassen (vermeidet Docker-Desktop-Crash beim App-Start)
  if (!needLivekit) {
    log('LiveKit Cloud-Modus – Docker-Start übersprungen.');
    return true;
  }

  const maxWait = opts.maxWaitMs ?? 180000;

  if (await dockerInfoOk()) {
    log('Docker läuft bereits.');
  } else {
    const started = await startDockerDesktop(log);
    if (!started) return false;
    const ready = await waitForDocker(maxWait, log);
    if (!ready) return false;
  }

  return ensureLivekitContainer(log);
}

module.exports = {
  ensureDockerReady,
  dockerInfoOk,
  getEliteConfig,
};
