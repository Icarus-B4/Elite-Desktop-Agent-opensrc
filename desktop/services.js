const { spawn, exec } = require('child_process');
const path = require('path');
const { app } = require('electron');
const fs = require('fs');
const os = require('os');
const kill = require('tree-kill');
const { promisify } = require('util');
const {
  getPaiRoot,
  getPulseManagerScript,
  buildPulseCommand,
  createPulseProcess,
} = require('./pai-runtime');
const {
  getHermesGatewayUrl,
  getHermesDashboardUrl,
  buildHermesStackStartCommand,
  createHermesGatewayProcess,
  getHermesRuntimeInfo,
} = require('./hermes-runtime');

let buildServiceEnv;
let getAppDataBackendDir;
try {
  ({ buildServiceEnv, getAppDataBackendDir } = require('./env-bootstrap'));
} catch (err) {
  console.warn('[Services] env-bootstrap nicht verfügbar:', err.message);
  buildServiceEnv = (_root, baseEnv = process.env) => ({ ...baseEnv });
  getAppDataBackendDir = () => null;
}

const execAsync = promisify(exec);
const {
  getServicesLogPath,
  getEliteOnlyLogPath,
  getMaxLogBytes,
  appendLogLine,
  trimAllEliteLogs,
} = require('./log-path');

let ensureDockerReady = async () => true;
try {
  ({ ensureDockerReady } = require('./docker-bootstrap'));
} catch (err) {
  console.warn('[Services] docker-bootstrap nicht verfügbar:', err.message);
}

let ROOT;
let logFile;
let eliteLogFile;
let processes = [];
let isShuttingDown = false;
const WATCHED_SERVICES = new Set(['Jarvis Core', 'Frontend', 'PTY Server', 'Hermes Stack']);
const restartAttempts = new Map();
let lastServiceCommands = [];
let lastSpawnContext = null;
let repairInFlight = false;
const MAX_RESTARTS = 3;
const RESTART_DELAYS_MS = [5000, 15000, 30000];
let readiness = {
  backend: false,
  hermes: false,
  hermesDashboard: false,
  missionControl: false,
  frontend: false,
  pulse: false,
};

const ELITE_PORTS = [7861, 8001, 3000, 3001, 31337, 8642, 9119, 8643];
const FRONTEND_URL = process.env.ELITE_FRONTEND_URL || 'http://127.0.0.1:3000';

function initPaths() {
  if (ROOT) return;
  ROOT = path.resolve(__dirname, '..');
  logFile = getServicesLogPath();
  eliteLogFile = getEliteOnlyLogPath();
  trimAllEliteLogs();
}

function shouldLogJarvisCoreLine(text) {
  const t = text.trim();
  if (!t) return false;
  if (/error|failed|FATAL|ECONNREFUSED|Exception|Traceback/i.test(t)) return true;
  if (/WARN|WARNING/i.test(t)) return true;
  if (/Compil|Ready|started|listening|agent\.py|LiveKit|Backend|worker.*registered/i.test(t)) {
    return true;
  }
  if (/^\s*(GET|POST|PUT|DELETE)\s/i.test(t)) return false;
  if (/health|heartbeat|polling|\/api\//i.test(t)) return false;
  return false;
}

function shouldLogFrontendLine(text) {
  const t = text.trim();
  if (!t) return false;
  if (/error|failed|FATAL|ECONNREFUSED|⨯|Critical/i.test(t)) return true;
  if (/compiled|ready in|started server/i.test(t)) return true;
  if (/^\s*(GET|POST|PUT|DELETE)\s/i.test(t)) return false;
  if (/hmr|webpack|Fast Refresh/i.test(t)) return false;
  return false;
}

function shouldLogServiceLine(serviceName, text) {
  if (serviceName === 'Jarvis Core') return shouldLogJarvisCoreLine(text);
  if (serviceName === 'Frontend') return shouldLogFrontendLine(text);
  if (serviceName.endsWith('-Error')) return true;
  if (/error|failed|FATAL|Exception|Traceback|KRITISCH/i.test(text)) return true;
  if (serviceName === 'PTY Server' || serviceName === 'Hermes Stack' || serviceName === 'PAI Pulse') {
    return /error|warn|started|ready|listening|failed/i.test(text);
  }
  return false;
}

function log(msg, { eliteOnly = false } = {}) {
  const line = `[${new Date().toISOString()}] ${msg}\n`;
  if (logFile) appendLogLine(logFile, line);
  const isEliteLine =
    eliteOnly ||
    msg.includes('[Services]') ||
    msg.includes('[Hermes') ||
    msg.includes('[PAI Pulse]') ||
    msg.includes('[Docker]') ||
    msg.includes('KRITISCHER') ||
    msg.includes('FATAL') ||
    msg.includes('-Error]');
  if (eliteLogFile && isEliteLine) appendLogLine(eliteLogFile, line);
}

function logProcessOutput(serviceName, text) {
  const chunk = text.toString().trim();
  if (!chunk) return;
  for (const part of chunk.split(/\r?\n/)) {
    if (!part.trim()) continue;
    if (!shouldLogServiceLine(serviceName, part)) continue;
    log(`[${serviceName}] ${part}`);
  }
}

async function checkHttpReady(url, timeoutMs = 2500) {
  try {
    await execAsync(
      `powershell.exe -NoProfile -Command "(Invoke-WebRequest -UseBasicParsing -Uri '${url}' -TimeoutSec 2).StatusCode"`,
      { windowsHide: true, timeout: timeoutMs },
    );
    return true;
  } catch {
    return false;
  }
}

async function waitForFrontend(maxMs = 120000) {
  const start = Date.now();
  while (Date.now() - start < maxMs) {
    if (await checkHttpReady(FRONTEND_URL, 4000)) {
      log(`[Services] Frontend bereit: ${FRONTEND_URL}`, { eliteOnly: true });
      return true;
    }
    await new Promise((r) => setTimeout(r, 2000));
  }
  log(
    `[Services] WARNUNG: Frontend nicht erreichbar (${FRONTEND_URL}). ` +
      'Prüfe EliteAgent_services.log — oft blockiert ein Zombie-Prozess Port 3000.',
    { eliteOnly: true },
  );
  return false;
}

async function checkPulseReady() {
  return checkHttpReady(`${process.env.PAI_PULSE_URL || 'http://127.0.0.1:31337'}/api/pulse/health`);
}

async function checkHermesGatewayReady() {
  const base = getHermesGatewayUrl();
  // /v1/health braucht keinen API-Key (Gateway akzeptiert Health-Checks ohne Auth)
  return checkHttpReady(`${base}/v1/health`, 2000);
}

async function checkHermesDashboardReady() {
  return checkHttpReady(getHermesDashboardUrl(), 2000);
}

async function setReadinessSnapshot() {
  const hermes = await checkHermesGatewayReady();
  const hermesDashboard = await checkHermesDashboardReady();
  readiness = {
    backend: await checkHttpReady('http://127.0.0.1:7861', 2000),
    hermes,
    hermesDashboard,
    missionControl: hermes || hermesDashboard,
    frontend: await checkHttpReady(FRONTEND_URL, 2000),
    pulse: await checkPulseReady(),
  };
}

async function freePort(port) {
  try {
    const { stdout } = await execAsync(
      `powershell.exe -NoProfile -Command "Get-NetTCPConnection -LocalPort ${port} -State Listen -ErrorAction SilentlyContinue | Select-Object -ExpandProperty OwningProcess"`,
      { windowsHide: true, timeout: 8000 },
    );
    const pids = new Set();
    for (const line of stdout.split(/\r?\n/)) {
      const pid = line.trim();
      if (/^\d+$/.test(pid)) pids.add(pid);
    }
    for (const pid of pids) {
      log(`[Services] Port ${port}: beende PID ${pid}`);
      try {
        await execAsync(`taskkill /F /PID ${pid}`, { windowsHide: true, timeout: 5000 });
      } catch {
        /* bereits beendet */
      }
    }
  } catch {
    /* Port frei */
  }
}

async function cleanupOldInstances() {
  if (process.env.ELITE_SKIP_PRESTART === '1') {
    log('[Services] Cleanup übersprungen (elite-prestart bereits gelaufen).', { eliteOnly: true });
    return;
  }
  log('[Services] Cleanup: Elite-Python, LiveKit-Worker, Elite-Ports…');
  const psScript = `
    try {
      $ProgressPreference = 'SilentlyContinue'
      $ErrorActionPreference = 'SilentlyContinue'
      $patterns = @('agent.py', 'frame_analyzer.py', 'livekit.agents', '_run_worker')
      Get-CimInstance Win32_Process -Filter "Name = 'python.exe'" -ErrorAction SilentlyContinue |
        Where-Object { $p = $_.CommandLine; $p -and ($patterns | Where-Object { $p -like "*$_*" }) } |
        ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }
      Get-Process -Name 'UiAutomationGRPC.Server' -ErrorAction SilentlyContinue |
        Stop-Process -Force -ErrorAction SilentlyContinue
    } catch {}
    exit 0
  `.trim();
  const encoded = Buffer.from(psScript, 'utf16le').toString('base64');
  try {
    await execAsync(`powershell.exe -NoProfile -EncodedCommand ${encoded}`, {
      windowsHide: true,
      timeout: 20000,
    });
    log('[Services] Elite-Prozesse bereinigt.');
  } catch (e) {
    log(`[Services] Cleanup Python: ${e.message}`);
  }

  await Promise.all(ELITE_PORTS.map((port) => freePort(port)));
  await new Promise((r) => setTimeout(r, 800));
}

function buildBaseServiceEnv(eliteFileEnv, isPackaged, paiRoot, pulseApi, hermesInfo) {
  return {
    ...eliteFileEnv,
    BROWSER: 'none',
    NODE_ENV: isPackaged ? 'production' : 'development',
    NODE_PATH: path.join(ROOT, 'node_modules'),
    DOTNET_BUNDLE_EXTRACT_BASE_DIR: path.join(os.tmpdir(), 'elite-agent-dotnet'),
    PAI_HOME: paiRoot,
    PAI_PULSE_URL: pulseApi,
    HERMES_GATEWAY_URL: getHermesGatewayUrl(),
    HERMES_DASHBOARD_URL: getHermesDashboardUrl(),
    HERMES_HOME: hermesInfo.home,
    ELITE_HERMES_RUNTIME: hermesInfo.active,
    ELITE_HERMES_DASHBOARD_INSECURE: process.env.ELITE_HERMES_DASHBOARD_INSECURE || '1',
    API_SERVER_ENABLED: eliteFileEnv.API_SERVER_ENABLED || 'true',
    PYTHONUTF8: '1',
    PYTHONIOENCODING: 'utf-8',
  };
}

function resolveSpawnArgs(service, ptyExe) {
  let cmd;
  let args;
  const useStableCore = process.env.ELITE_AGENT_MODE === 'start';
  if (service.name === 'UI Automation') {
    cmd = path.join(ROOT, 'lib', 'automation', 'UiAutomationGRPC.Server.exe');
    args = [];
  } else if (service.name === 'PAI Pulse') {
    const pulse = buildPulseCommand('start');
    cmd = pulse.cmd;
    args = pulse.args;
  } else if (service.hermesStack) {
    const stack = buildHermesStackStartCommand();
    cmd = stack.cmd;
    args = stack.args;
  } else if (service.hermes) {
    const { buildHermesGatewayCommand } = require('./hermes-runtime');
    const hermes = buildHermesGatewayCommand('start');
    cmd = hermes.cmd;
    args = hermes.args;
  } else if (service.name === 'Jarvis Core' && process.platform === 'win32') {
    cmd = process.env.ComSpec || 'cmd.exe';
    const yarnScript = useStableCore ? 'yarn run start:core-stable' : 'yarn run start:core';
    args = ['/d', '/s', '/c', yarnScript];
  } else if (service.name === 'Frontend' && process.platform === 'win32') {
    cmd = process.env.ComSpec || 'cmd.exe';
    args = ['/d', '/s', '/c', 'yarn run dev'];
  } else if (service.name === 'PTY Server') {
    cmd = ptyExe;
    args = [];
  } else {
    const parts = service.cmd.split(' ');
    cmd = parts[0];
    args = parts.slice(1);
  }

  const useShell =
    service.name !== 'UI Automation' &&
    service.name !== 'Jarvis Core' &&
    service.name !== 'Frontend' &&
    service.name !== 'PTY Server' &&
    !service.hermes &&
    !service.hermesStack;

  return { cmd, args, useShell };
}

function scheduleServiceRestart(service, spawnContext) {
  if (isShuttingDown || !WATCHED_SERVICES.has(service.name)) return;
  const attempts = restartAttempts.get(service.name) || 0;
  if (attempts >= MAX_RESTARTS) {
    log(`[${service.name}] Max. Neustarts (${MAX_RESTARTS}) erreicht — kein weiterer Versuch.`);
    return;
  }
  const delay = RESTART_DELAYS_MS[attempts] || RESTART_DELAYS_MS[RESTART_DELAYS_MS.length - 1];
  restartAttempts.set(service.name, attempts + 1);
  log(`[${service.name}] Neustart in ${delay / 1000}s (Versuch ${attempts + 1}/${MAX_RESTARTS})…`);
  setTimeout(() => {
    if (isShuttingDown) return;
    spawnManagedService(service, spawnContext);
  }, delay);
}

function spawnManagedService(service, ctx) {
  const { cmd, args, useShell } = resolveSpawnArgs(service, ctx.ptyExe);

  log(`[Services] Starte ${service.name} in ${service.cwd}...`);

  const proc = spawn(cmd, args, {
    cwd: service.cwd,
    shell: useShell,
    windowsHide: true,
    env: buildBaseServiceEnv(ctx.eliteFileEnv, ctx.isPackaged, ctx.paiRoot, ctx.pulseApi, ctx.hermesInfo),
  });

  proc.stdout.on('data', (data) => logProcessOutput(service.name, data));
  proc.stderr.on('data', (data) => logProcessOutput(`${service.name}-Error`, data));
  proc.on('error', (err) => log(`[${service.name}] FATAL Error: ${err.message}`));
  proc.on('exit', (code) => {
    log(`[${service.name}] Beendet mit Code ${code}`);
    processes = processes.filter((p) => p !== proc);
    if (code !== 0 && code !== null) {
      scheduleServiceRestart(service, ctx);
    }
  });

  processes.push(proc);
  return proc;
}

async function startServices() {
  try {
    isShuttingDown = false;
    initPaths();
    log('====================================================', { eliteOnly: true });
    log(`[Services] START - Root: ${ROOT}`, { eliteOnly: true });
    const maxKb = Math.round(getMaxLogBytes() / 1024);
    log(`[Services] Log-Dateien (max. ${maxKb} KB je): ${logFile}`, { eliteOnly: true });
    log(`[Services] Elite-Log: ${eliteLogFile}`, { eliteOnly: true });

    if (process.platform === 'win32') {
      log('[Services] Docker/LiveKit Bootstrap (nur bei livekitMode=local)…');
      const dockerOk = await ensureDockerReady({
        logger: (msg) => log(`[Services] ${msg}`),
        maxWaitMs: 120000,
      });
      if (!dockerOk) {
        log(
          '[Services] WARNUNG: Docker/LiveKit nicht bereit. ' +
            'Einstellungen → LiveKit „Cloud“ oder scripts/repair-docker-inference.ps1 ausführen.',
        );
      }
    }

    await cleanupOldInstances();

    log('[Services] Warte 1s auf Port-Freigabe…');
    await new Promise((r) => setTimeout(r, 1000));

    const isPackaged = ROOT.includes('WindowsApps') || ROOT.includes('Program Files');

    const debugExe = path.join(ROOT, 'backend', 'pty-server', 'target', 'debug', 'elite-pty-server.exe');
    const releaseExe = path.join(ROOT, 'backend', 'pty-server', 'target', 'release', 'elite-pty-server.exe');
    const ptyExe = fs.existsSync(releaseExe) ? releaseExe : debugExe;
    log(`[Services] PTY Server Exe Pfad: ${ptyExe}`);

    let serviceCommands = [];

    const pulseManagerScript = getPulseManagerScript();
    const pulseApi = process.env.PAI_PULSE_URL || 'http://127.0.0.1:31337';
    const paiRoot = getPaiRoot();
    const hermesStack = buildHermesStackStartCommand();
    const hermesInfo = getHermesRuntimeInfo();
    log(
      `[Services] Hermes runtime=${hermesInfo.active}` +
        (hermesInfo.distro ? ` distro=${hermesInfo.distro}` : '') +
        ` home=${hermesInfo.home} (Gateway 8642 + Dashboard 9119)`,
    );

    if (!isPackaged) {
      log('[Services] Dev-Modus: Jarvis Core + Frontend + Hermes + PAI Pulse + PTY Server');
      serviceCommands = [
        { name: 'Jarvis Core', cmd: 'yarn run start:core', cwd: ROOT },
        { name: 'Frontend', cmd: 'yarn run dev', cwd: path.join(ROOT, 'frontend') },
        {
          name: 'Hermes Stack',
          cmd: `${hermesStack.cmd} ${hermesStack.args.join(' ')}`,
          cwd: ROOT,
          hermesStack: true,
        },
        {
          name: 'PAI Pulse',
          cmd: `powershell.exe -NoProfile -ExecutionPolicy Bypass -File "${pulseManagerScript}" start`,
          cwd: ROOT,
        },
        {
          name: 'PTY Server',
          cmd: ptyExe,
          cwd: path.join(ROOT, 'backend', 'pty-server'),
        },
      ];
    } else {
      log('[Services] Prod-Modus: Hermes (Gateway+Dashboard) + Backend + Frontend + Pulse + PTY Server');
      serviceCommands = [
        {
          name: 'Hermes Stack',
          cmd: `${hermesStack.cmd} ${hermesStack.args.join(' ')}`,
          cwd: ROOT,
          hermesStack: true,
        },
        { name: 'Backend Agent', cmd: 'python agent.py start', cwd: path.join(ROOT, 'backend') },
        { name: 'Frame Analyzer', cmd: 'python frame_analyzer.py', cwd: path.join(ROOT, 'backend') },
        {
          name: 'Frontend',
          cmd: 'node server.js',
          cwd: path.join(ROOT, 'frontend'),
        },
        {
          name: 'UI Automation',
          cmd: `"${path.join(ROOT, 'lib', 'automation', 'UiAutomationGRPC.Server.exe')}"`,
          cwd: ROOT,
        },
        {
          name: 'PAI Pulse',
          cmd: `powershell.exe -NoProfile -ExecutionPolicy Bypass -File "${pulseManagerScript}" start`,
          cwd: ROOT,
        },
        {
          name: 'PTY Server',
          cmd: ptyExe,
          cwd: path.join(ROOT, 'backend', 'pty-server'),
        },
      ];
    }

    const eliteFileEnv = buildServiceEnv(ROOT);
    log(
      `[Services] Env: OPENAI_API_KEY=${eliteFileEnv.OPENAI_API_KEY ? 'gesetzt' : 'FEHLT'}, ` +
        `LIVEKIT_URL=${eliteFileEnv.LIVEKIT_URL || '(leer)'}, HERMES_GATEWAY=${getHermesGatewayUrl()}, ` +
        `AppData=${getAppDataBackendDir() || 'n/a'}`,
    );

    const spawnContext = {
      eliteFileEnv,
      isPackaged,
      paiRoot,
      pulseApi,
      hermesInfo,
      ptyExe,
    };

    restartAttempts.clear();
    lastServiceCommands = serviceCommands;
    lastSpawnContext = spawnContext;
    serviceCommands.forEach((service) => {
      spawnManagedService(service, spawnContext);
    });

    await new Promise((r) => setTimeout(r, 1200));
    await waitForFrontend(90000);
    await setReadinessSnapshot();
    log(`[Services] Alle Dienste wurden gestartet. Readiness=${JSON.stringify(readiness)}`);
  } catch (err) {
    log(`[Services] KRITISCHER FEHLER in startServices: ${err.message}\n${err.stack}`);
  }
}

async function stopServices() {
  isShuttingDown = true;
  log(`[Services] Beende alle Dienste (${processes.length})...`);
  const stopping = processes.map(
    (proc) =>
      new Promise((resolve) => {
        if (!proc.pid) {
          resolve();
          return;
        }
        kill(proc.pid, 'SIGKILL', () => resolve());
      }),
  );
  await Promise.all(stopping);
  processes = [];

  try {
    const hermesStop = createHermesGatewayProcess('stop', { cwd: ROOT || process.cwd() });
    await new Promise((resolve) => {
      hermesStop.once('exit', () => resolve());
      hermesStop.once('error', () => resolve());
    });
    log('[Services] Hermes Gateway gestoppt.');
  } catch (e) {
    log(`[Services] Hermes stop: ${e.message}`);
  }

  try {
    const pulseStop = createPulseProcess('stop', { cwd: ROOT });
    await new Promise((resolve) => {
      pulseStop.once('exit', () => resolve());
      pulseStop.once('error', () => resolve());
    });
    log('[Services] PAI Pulse Daemon gestoppt.');
  } catch (e) {
    log(`[Services] Fehler beim Beenden von PAI Pulse: ${e.message}`);
  }

  await cleanupOldInstances();
  readiness = {
    backend: false,
    hermes: false,
    hermesDashboard: false,
    missionControl: false,
    frontend: false,
    pulse: false,
  };
}

async function restartPaiPulse() {
  try {
    const stopProc = createPulseProcess('stop', { cwd: ROOT || process.cwd() });
    await new Promise((resolve) => {
      stopProc.once('exit', resolve);
      stopProc.once('error', resolve);
    });
    const startProc = createPulseProcess('start', { cwd: ROOT || process.cwd() });
    await new Promise((resolve) => {
      startProc.once('exit', resolve);
      startProc.once('error', resolve);
    });
    await new Promise((r) => setTimeout(r, 500));
    readiness.pulse = await checkPulseReady();
    return readiness.pulse;
  } catch {
    readiness.pulse = false;
    return false;
  }
}

async function getRuntimeStatus() {
  if (!ROOT) {
    initPaths();
  }
  await setReadinessSnapshot();
  return {
    ...readiness,
    pulseManagerScript: getPulseManagerScript(),
    paiHome: getPaiRoot(),
    hermesGatewayUrl: getHermesGatewayUrl(),
    hermesDashboardUrl: getHermesDashboardUrl(),
    hermesRuntime: getHermesRuntimeInfo(),
  };
}

function findServiceDefinition(name) {
  return lastServiceCommands.find((s) => s.name === name);
}

function repairSpawnService(name, repairs) {
  if (isShuttingDown || !lastSpawnContext) return;
  const service = findServiceDefinition(name);
  if (!service) return;
  restartAttempts.delete(name);
  spawnManagedService(service, lastSpawnContext);
  repairs.push(name);
}

/**
 * Prüft HTTP-Readiness und startet fehlende Kern-Dienste neu (Tray-Wake / Hintergrund-Poll).
 */
async function ensureRuntimeHealthy({ reason = 'unknown', force = false } = {}) {
  if (isShuttingDown) return { ...readiness, repaired: [] };
  if (repairInFlight && !force) return { ...readiness, repaired: [] };

  initPaths();
  if (!lastServiceCommands.length || !lastSpawnContext) {
    log(`[Services] ensureRuntimeHealthy(${reason}): keine aktive Service-Liste.`, {
      eliteOnly: true,
    });
    return { ...readiness, repaired: [] };
  }

  repairInFlight = true;
  try {
    if (force) restartAttempts.clear();

    await setReadinessSnapshot();
    const repairs = [];

    if (!readiness.frontend) {
      repairSpawnService('Frontend', repairs);
    }

    if (!readiness.backend) {
      if (findServiceDefinition('Jarvis Core')) {
        repairSpawnService('Jarvis Core', repairs);
      } else if (findServiceDefinition('Backend Agent')) {
        repairSpawnService('Backend Agent', repairs);
      }
    }

    if (!readiness.hermes) {
      repairSpawnService('Hermes Stack', repairs);
    }

    if (!readiness.pulse) {
      restartAttempts.delete('PAI Pulse');
      const pulseOk = await restartPaiPulse();
      if (pulseOk) {
        repairs.push('PAI Pulse');
      } else {
        repairSpawnService('PAI Pulse', repairs);
      }
    }

    if (repairs.length) {
      await new Promise((r) => setTimeout(r, 4000));
      await setReadinessSnapshot();
      log(
        `[Services] ensureRuntimeHealthy(${reason}): repariert=[${repairs.join(', ')}] readiness=${JSON.stringify(readiness)}`,
        { eliteOnly: true },
      );
    }

    return { ...readiness, repaired: repairs };
  } finally {
    repairInFlight = false;
  }
}

module.exports = {
  startServices,
  stopServices,
  restartPaiPulse,
  getRuntimeStatus,
  ensureRuntimeHealthy,
};
