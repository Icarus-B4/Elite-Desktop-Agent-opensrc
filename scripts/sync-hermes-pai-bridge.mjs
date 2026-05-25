#!/usr/bin/env node
/** Mirror Hermes MEMORY.md + USER.md into PAI KNOWLEDGE (no Next.js required). */
import fs from 'fs';
import path from 'path';
import os from 'os';
import { spawnSync } from 'child_process';

function shouldUseWsl() {
  if (process.platform !== 'win32') return false;
  const mode = (process.env.ELITE_HERMES_MODE || 'auto').toLowerCase();
  if (mode === 'native') return false;
  try {
    return spawnSync('wsl.exe', ['--status'], { encoding: 'utf8' }).status === 0;
  } catch {
    return false;
  }
}

function getWslDistro() {
  return process.env.HERMES_WSL_DISTRO?.trim() || 'Ubuntu';
}

function getHermesHome() {
  if (process.env.HERMES_HOME) return process.env.HERMES_HOME;
  if (process.platform === 'win32' && shouldUseWsl()) {
    const r = spawnSync(
      'wsl.exe',
      ['-d', getWslDistro(), '-e', 'bash', '-lc', 'printf %s "$HOME/.hermes"'],
      { encoding: 'utf8' },
    );
    const linux = (r.stdout || '').trim();
    if (linux) {
      const rel = linux.replace(/^\//, '').replace(/\//g, '\\');
      return `\\\\wsl.localhost\\${getWslDistro()}\\${rel}`;
    }
  }
  if (process.platform === 'win32') {
    return path.join(process.env.LOCALAPPDATA || path.join(os.homedir(), 'AppData', 'Local'), 'hermes');
  }
  return path.join(os.homedir(), '.hermes');
}

function readMem(name) {
  const p = path.join(getHermesHome(), 'memories', name);
  if (!fs.existsSync(p)) return '';
  return fs.readFileSync(p, 'utf8');
}

const paiHome = process.env.PAI_HOME?.trim() || path.join(os.homedir(), '.claude', 'PAI');
const out = path.join(paiHome, 'USER', 'KNOWLEDGE', 'HERMES_MEMORY_BRIDGE.md');
const memory = readMem('MEMORY.md');
const user = readMem('USER.md');
const stamp = new Date().toISOString();

const body = [
  '# Hermes Agent Memory Bridge',
  '',
  `Synced: ${stamp}`,
  `Hermes home: ${getHermesHome()}`,
  '',
  '## MEMORY.md (Hermes)',
  memory || '(leer)',
  '',
  '## USER.md (Hermes)',
  user || '(leer)',
  '',
].join('\n');

fs.mkdirSync(path.dirname(out), { recursive: true });
fs.writeFileSync(out, body, 'utf8');
console.log(`[sync] Written ${out}`);
