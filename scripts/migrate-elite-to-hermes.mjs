#!/usr/bin/env node
/**
 * Elite → Hermes migration: stage SOUL/USER/AGENTS, optional `hermes claw migrate`.
 * Windows: prefers WSL2 when available (ELITE_HERMES_MODE=auto|wsl|native).
 */
import { spawnSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');

function getHermesRuntimeMode() {
  const raw = (process.env.ELITE_HERMES_MODE || 'auto').trim().toLowerCase();
  if (raw === 'wsl' || raw === 'native' || raw === 'auto') return raw;
  return 'auto';
}

function isWslAvailable() {
  if (process.platform !== 'win32') return false;
  try {
    const r = spawnSync('wsl.exe', ['--status'], { encoding: 'utf8', shell: false });
    return r.status === 0;
  } catch {
    return false;
  }
}

function getWslDistro() {
  const override = process.env.HERMES_WSL_DISTRO?.trim();
  if (override) return override;
  try {
    const r = spawnSync('wsl.exe', ['-l', '-q'], { encoding: 'utf16le', shell: false });
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
  if (mode === 'wsl') return isWslAvailable();
  return isWslAvailable();
}

function linuxPathToWslUnc(distro, linuxPath) {
  const rel = linuxPath.replace(/^\//, '').replace(/\//g, '\\');
  return `\\\\wsl.localhost\\${distro}\\${rel}`;
}

function resolveWslHermesHome() {
  const distro = getWslDistro();
  const r = spawnSync(
    'wsl.exe',
    ['-d', distro, '-e', 'bash', '-lc', 'printf %s "$HOME/.hermes"'],
    { encoding: 'utf8', shell: false },
  );
  const linuxPath = (r.stdout || '').trim();
  if (!linuxPath || r.status !== 0) return null;
  return linuxPathToWslUnc(distro, linuxPath);
}

function hermesHome() {
  if (process.env.HERMES_HOME) return process.env.HERMES_HOME;
  if (process.platform === 'win32' && shouldUseWsl()) {
    const wsl = resolveWslHermesHome();
    if (wsl) return wsl;
  }
  if (process.platform === 'win32') {
    return path.join(
      process.env.LOCALAPPDATA || path.join(os.homedir(), 'AppData', 'Local'),
      'hermes',
    );
  }
  return path.join(os.homedir(), '.hermes');
}

function paiUserDir() {
  const candidates = [
    path.join(os.homedir(), '.claude', 'PAI', 'USER'),
    path.join(os.homedir(), 'PAI', 'USER'),
  ];
  return candidates.find((d) => fs.existsSync(d)) || candidates[0];
}

function ensureDir(p) {
  fs.mkdirSync(p, { recursive: true });
}

function copyIfExists(src, dest) {
  if (!fs.existsSync(src)) return false;
  ensureDir(path.dirname(dest));
  fs.copyFileSync(src, dest);
  return true;
}

function appendUserNote(memoriesDir) {
  const userPath = path.join(memoriesDir, 'USER.md');
  const note =
    '\n§Nutzer spricht oft Schweizerdeutsch — phonetische STT-Toleranz (chönntsch, lueg, isch, nöd).\n';
  if (!fs.existsSync(userPath)) {
    fs.writeFileSync(userPath, `# USER PROFILE (Elite migration)\n${note}`, 'utf8');
    return;
  }
  const existing = fs.readFileSync(userPath, 'utf8');
  if (existing.includes('Schweizerdeutsch')) return;
  fs.appendFileSync(userPath, note, 'utf8');
}

function stageContextFiles(home) {
  const workspace = path.join(home, 'workspace');
  const memories = path.join(home, 'memories');
  ensureDir(workspace);
  ensureDir(memories);

  const soulSrc = path.join(ROOT, 'agents', 'elite-agent', 'SOUL.md');
  const agentsSrc = path.join(ROOT, 'AGENTS.md');
  const paiUser = paiUserDir();
  const userSrc = path.join(paiUser, 'USER.md');

  copyIfExists(soulSrc, path.join(workspace, 'SOUL.md'));
  copyIfExists(agentsSrc, path.join(workspace, 'AGENTS.md'));
  copyIfExists(userSrc, path.join(memories, 'USER.md'));
  appendUserNote(memories);

  console.log(`[migrate] Staged context under ${home}`);
}

function runHermesCli(args) {
  if (shouldUseWsl()) {
    const distro = getWslDistro();
    const cmd = ['hermes', ...args].map((a) => JSON.stringify(a)).join(' ');
    return spawnSync('wsl.exe', ['-d', distro, '--', 'bash', '-lc', cmd], {
      encoding: 'utf8',
      cwd: ROOT,
      shell: false,
    });
  }
  const hermes = process.env.HERMES_CLI || 'hermes';
  return spawnSync(hermes, args, {
    encoding: 'utf8',
    cwd: ROOT,
    shell: process.platform === 'win32',
  });
}

function runHermesMigrate() {
  const check = runHermesCli(['--version']);
  if (check.status !== 0) {
    console.warn('[migrate] Hermes CLI nicht gefunden.');
    if (shouldUseWsl()) {
      console.warn('  WSL2: curl -fsSL https://hermes-agent.nousresearch.com/install.sh | bash');
      console.warn('  Dann in WSL: hermes setup');
    } else {
      console.warn(
        '  Windows native (Beta): iex (irm https://raw.githubusercontent.com/NousResearch/hermes-agent/main/scripts/install.ps1)',
      );
      console.warn('  Empfohlen: WSL2 installieren und ELITE_HERMES_MODE=wsl setzen.');
    }
    return false;
  }
  console.log(
    `[migrate] Hermes ${(check.stdout || '').trim()} (runtime=${shouldUseWsl() ? 'wsl' : 'native'})`,
  );
  const dry = runHermesCli(['claw', 'migrate', '--dry-run']);
  console.log(dry.stdout || dry.stderr || '');
  const run = runHermesCli([
    'claw',
    'migrate',
    '--workspace-target',
    path.join(hermesHome(), 'workspace').replace(/\\/g, '/'),
  ]);
  if (run.status === 0) {
    console.log('[migrate] hermes claw migrate OK');
    return true;
  }
  console.warn('[migrate] claw migrate übersprungen — gestagte Dateien in Hermes home/workspace');
  return false;
}

const runtime = shouldUseWsl() ? 'wsl' : process.platform === 'win32' ? 'native' : 'linux';
const home = hermesHome();
console.log(`[migrate] Hermes home: ${home} (runtime=${runtime})`);
stageContextFiles(home);
runHermesMigrate();
console.log('[migrate] Fertig. Gateway: hermes gateway start (via Electron oder WSL)');
