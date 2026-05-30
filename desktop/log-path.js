const fs = require('fs');
const os = require('os');
const path = require('path');

let cachedDesktopLog = null;
let cachedEliteLog = null;

/** Standard ~400 KB pro Datei — über ELITE_LOG_MAX_BYTES überschreibbar (Bytes). */
const DEFAULT_MAX_LOG_BYTES = 400 * 1024;

function getMaxLogBytes() {
  const raw = process.env.ELITE_LOG_MAX_BYTES?.trim();
  if (!raw) return DEFAULT_MAX_LOG_BYTES;
  const n = Number.parseInt(raw, 10);
  return Number.isFinite(n) && n >= 64 * 1024 ? n : DEFAULT_MAX_LOG_BYTES;
}

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

const TRUNCATE_BANNER =
  '[Elite] Ältere Logzeilen wurden entfernt (Größenlimit). Nur der letzte Abschnitt bleibt erhalten.\n\n';

/**
 * Behält nur die letzten maxBytes Bytes; löscht .old-Backups am gleichen Pfad.
 */
function trimLogFileIfNeeded(filePath, maxBytes = getMaxLogBytes()) {
  try {
    if (!fs.existsSync(filePath)) return;
    const stat = fs.statSync(filePath);
    if (stat.size <= maxBytes) return;

    const keepBytes = Math.floor(maxBytes * 0.85);
    const fd = fs.openSync(filePath, 'r');
    const start = Math.max(0, stat.size - keepBytes);
    const buf = Buffer.alloc(Math.min(keepBytes, stat.size));
    fs.readSync(fd, buf, 0, buf.length, start);
    fs.closeSync(fd);

    let tail = buf.toString('utf8');
    const firstNl = tail.indexOf('\n');
    if (firstNl >= 0 && firstNl < 200) {
      tail = tail.slice(firstNl + 1);
    }

    fs.writeFileSync(filePath, TRUNCATE_BANNER + tail, 'utf8');

    const backup = `${filePath}.old`;
    if (fs.existsSync(backup)) {
      try {
        fs.unlinkSync(backup);
      } catch {
        /* ignore */
      }
    }
  } catch (err) {
    console.warn('[Log] Trim übersprungen:', filePath, err.message);
  }
}

/** @deprecated — nutzt trimLogFileIfNeeded (kein separates .old mehr). */
function rotateIfHuge(filePath, maxBytes = getMaxLogBytes()) {
  trimLogFileIfNeeded(filePath, maxBytes);
}

function appendLogLine(filePath, line) {
  try {
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    fs.appendFileSync(filePath, line);
    trimLogFileIfNeeded(filePath);
    return true;
  } catch (err) {
    console.error('[Log] Schreiben fehlgeschlagen:', filePath, err.message);
    return false;
  }
}

/** Letzte maxBytes einer Logdatei für Anzeige (Tray-Terminal). */
function readLogTail(filePath, maxBytes = 48 * 1024) {
  try {
    if (!fs.existsSync(filePath)) {
      return `(Datei nicht vorhanden: ${filePath})\n`;
    }
    const stat = fs.statSync(filePath);
    if (stat.size <= maxBytes) {
      return fs.readFileSync(filePath, 'utf8');
    }
    const fd = fs.openSync(filePath, 'r');
    const buf = Buffer.alloc(maxBytes);
    fs.readSync(fd, buf, 0, maxBytes, stat.size - maxBytes);
    fs.closeSync(fd);
    let tail = buf.toString('utf8');
    const firstNl = tail.indexOf('\n');
    if (firstNl >= 0) tail = tail.slice(firstNl + 1);
    return `… (${Math.round(stat.size / 1024)} KB gesamt, letzte ${Math.round(maxBytes / 1024)} KB)\n\n${tail}`;
  } catch (err) {
    return `(Lesefehler ${filePath}: ${err.message})\n`;
  }
}

function trimAllEliteLogs() {
  trimLogFileIfNeeded(getServicesLogPath());
  trimLogFileIfNeeded(getEliteOnlyLogPath());
}

function getRepoRoot() {
  return path.resolve(__dirname, '..');
}

/** NDJSON-Agent-Debug (Hermes verweist darauf). */
function getDebugAgentLogPath() {
  const override = process.env.ELITE_DEBUG_LOG_FILE?.trim();
  if (override) return override;
  return path.join(getRepoRoot(), 'debug-8d8747.log');
}

function getHermesGatewayLogPath() {
  try {
    const { getHermesGatewayLogPath: hermesPath } = require('./hermes-runtime');
    return hermesPath();
  } catch {
    const home = process.env.HERMES_HOME || path.join(os.homedir(), '.hermes');
    return path.join(home, 'logs', 'gateway.log');
  }
}

const TRAY_LOG_TAIL_BYTES = 64 * 1024;
const GATEWAY_SPAM_RE = /API server rejected invalid API key/i;

function getFileMeta(filePath) {
  try {
    if (!fs.existsSync(filePath)) {
      return { exists: false, sizeKb: 0 };
    }
    const stat = fs.statSync(filePath);
    return { exists: true, sizeKb: Math.round(stat.size / 1024) };
  } catch {
    return { exists: false, sizeKb: 0 };
  }
}

function compressRepeatingLines(text, pattern, maxShow = 3) {
  const lines = text.split(/\r?\n/);
  let hidden = 0;
  let shown = 0;
  const out = [];
  for (const line of lines) {
    if (!line.trim()) {
      out.push(line);
      continue;
    }
    if (pattern.test(line)) {
      if (shown < maxShow) {
        out.push(line);
        shown += 1;
      } else {
        hidden += 1;
      }
      continue;
    }
    out.push(line);
  }
  if (hidden > 0) {
    out.push(
      `[… ${hidden} gleichartige Zeilen ausgeblendet — meist harmlose Healthchecks, kein Fehler für dich.]`,
    );
  }
  return out.join('\n');
}

function formatDebugLogText(raw) {
  const lines = raw.split(/\r?\n/).filter((l) => l.trim());
  const formatted = [];
  for (const line of lines) {
    try {
      const o = JSON.parse(line);
      const ts = o.timestamp ? new Date(o.timestamp).toLocaleString('de-DE') : '';
      const loc = o.location || '';
      const msg = o.message || '';
      const hyp = o.hypothesisId ? `[${o.hypothesisId}] ` : '';
      formatted.push(`${ts} ${hyp}${loc}: ${msg}`);
    } catch {
      formatted.push(line);
    }
  }
  return formatted.join('\n');
}

function readSectionContent(filePath, { tailBytes = TRAY_LOG_TAIL_BYTES, kind = 'plain' } = {}) {
  const meta = getFileMeta(filePath);
  if (!meta.exists) {
    return {
      content: `(Datei existiert nicht)\n\nPfad:\n${filePath}`,
      meta,
    };
  }
  let content = readLogTail(filePath, tailBytes);
  if (kind === 'debug') {
    content = formatDebugLogText(content);
  }
  if (kind === 'gateway') {
    content = compressRepeatingLines(content, GATEWAY_SPAM_RE);
  }
  return { content, meta };
}

/** Standard-Logfenster: eine Datei pro Tab, lesbar aufbereitet. */
function getTrayLogSections() {
  const sections = [
    {
      id: 'debug',
      tab: 'Debug',
      label: 'Debug (debug-8d8747.log)',
      path: getDebugAgentLogPath(),
      hint: 'Agent-Diagnose — das meint Hermes mit „Debug-Log“.',
      kind: 'debug',
    },
    {
      id: 'elite',
      tab: 'Elite',
      label: 'Elite (EliteAgent_elite.log)',
      path: getEliteOnlyLogPath(),
      hint: 'Electron, Dienste, Hermes — ohne HTTP-Spam.',
      kind: 'plain',
    },
    {
      id: 'services',
      tab: 'Services',
      label: 'Services (EliteAgent_services.log)',
      path: getServicesLogPath(),
      hint: 'Jarvis Core, Frontend, Prozess-Ausgabe.',
      kind: 'plain',
    },
    {
      id: 'gateway',
      tab: 'Gateway',
      label: 'Hermes Gateway (gateway.log)',
      path: getHermesGatewayLogPath(),
      hint: 'Hermes Gateway — wiederholte API-Key-Warnungen werden gekürzt.',
      kind: 'gateway',
    },
  ];

  return sections.map((s) => {
    const { content, meta } = readSectionContent(s.path, {
      tailBytes: TRAY_LOG_TAIL_BYTES,
      kind: s.kind,
    });
    return {
      id: s.id,
      tab: s.tab,
      label: s.label,
      path: s.path,
      hint: s.hint,
      content,
      sizeKb: meta.sizeKb,
      exists: meta.exists,
    };
  });
}

/** @deprecated — nutze getTrayLogSections() */
function readAllTrayLogs() {
  return getTrayLogSections()
    .map((s) => `=== ${s.label} ===\n${s.path}\n\n${s.content}\n`)
    .join('\n');
}

module.exports = {
  resolveDesktopDir,
  getRepoRoot,
  getServicesLogPath,
  getEliteOnlyLogPath,
  getDebugAgentLogPath,
  getHermesGatewayLogPath,
  getMaxLogBytes,
  appendLogLine,
  rotateIfHuge,
  trimLogFileIfNeeded,
  trimAllEliteLogs,
  readLogTail,
  readAllTrayLogs,
  getTrayLogSections,
  TRAY_LOG_TAIL_BYTES,
};
