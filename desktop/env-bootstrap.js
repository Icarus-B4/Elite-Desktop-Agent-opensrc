const fs = require('fs');
const path = require('path');

function getAppDataBackendDir() {
  const base = process.env.LOCALAPPDATA || process.env.APPDATA;
  if (!base) return null;
  return path.join(base, 'EliteDesktopAgent', 'backend');
}

function parseDotEnv(content) {
  const out = {};
  for (const raw of content.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    const eq = line.indexOf('=');
    if (eq <= 0) continue;
    const key = line.slice(0, eq).trim();
    let value = line.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    out[key] = value;
  }
  return out;
}

function listEnvFilePaths(rootDir) {
  const appBackend = getAppDataBackendDir();
  const bundledBackend = rootDir ? path.join(rootDir, 'backend') : null;
  const names = ['.env', '.env.local'];
  const paths = [];
  for (const base of [appBackend, bundledBackend]) {
    if (!base) continue;
    for (const name of names) {
      const p = path.join(base, name);
      if (fs.existsSync(p)) paths.push(p);
    }
  }
  return paths;
}

/**
 * MSIX: Secrets liegen in AppData. Beim ersten Start Vorlage aus backend/.env.example kopieren.
 */
function ensureAppDataEnvFile(rootDir, logger = () => {}) {
  const appBackend = getAppDataBackendDir();
  if (!appBackend) return null;

  const target = path.join(appBackend, '.env.local');
  if (fs.existsSync(target)) return target;

  fs.mkdirSync(appBackend, { recursive: true });
  const sources = [
    rootDir && path.join(rootDir, 'backend', '.env.local'),
    rootDir && path.join(rootDir, 'backend', '.env'),
    rootDir && path.join(rootDir, 'backend', '.env.example'),
  ].filter(Boolean);

  for (const src of sources) {
    if (fs.existsSync(src)) {
      fs.copyFileSync(src, target);
      logger(`[Env] Vorlage kopiert: ${src} -> ${target}`);
      return target;
    }
  }

  logger(
    '[Env] WARNUNG: Keine .env.local in AppData. Cloud-Modus braucht OPENAI_API_KEY unter ' +
      target,
  );
  return null;
}

function loadEliteEnvIntoObject(rootDir) {
  const merged = {};
  for (const filePath of listEnvFilePaths(rootDir)) {
    try {
      Object.assign(merged, parseDotEnv(fs.readFileSync(filePath, 'utf8')));
    } catch {
      /* ignore */
    }
  }
  return merged;
}

function buildServiceEnv(rootDir, baseEnv = process.env) {
  let appendLogLine;
  try {
    ({ appendLogLine, getServicesLogPath } = require('./log-path'));
  } catch {
    appendLogLine = null;
  }
  ensureAppDataEnvFile(rootDir, (msg) => {
    try {
      const line = `[${new Date().toISOString()}] ${msg}\n`;
      if (appendLogLine && getServicesLogPath) {
        appendLogLine(getServicesLogPath(), line);
      }
    } catch {
      /* ignore */
    }
  });
  const fileEnv = loadEliteEnvIntoObject(rootDir);
  return { ...fileEnv, ...baseEnv };
}

module.exports = {
  ensureAppDataEnvFile,
  loadEliteEnvIntoObject,
  buildServiceEnv,
  getAppDataBackendDir,
};
