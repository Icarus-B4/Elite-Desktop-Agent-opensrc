#!/usr/bin/env node
/**
 * Kopiert Frontend-Build-Artefakte in das electron-builder win-unpacked Verzeichnis (MSIX-Vorbereitung).
 * Hermes Agent wird NICHT gebündelt — Zielsystem: yarn install:hermes:wsl (WSL2).
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const DESKTOP = path.join(ROOT, 'desktop');

const outRoot =
  process.env.ELITE_MSIX_UNPACKED ||
  'C:/Users/ed/AppData/Local/Temp/elite-build/dist/win-unpacked';

const RES = path.join(outRoot, 'resources');

function cp(src, dest) {
  if (!fs.existsSync(src)) {
    console.warn(`[msix] Überspringe (fehlt): ${src}`);
    return;
  }
  fs.mkdirSync(dest, { recursive: true });
  for (const f of fs.readdirSync(src)) {
    fs.cpSync(path.join(src, f), path.join(dest, f), { recursive: true });
  }
}

console.log(`[msix] Stage → ${outRoot}`);
cp(path.join(DESKTOP, 'Assets'), path.join(outRoot, 'Assets'));
cp(path.join(ROOT, 'frontend/.next/standalone'), path.join(RES, 'frontend'));
cp(path.join(ROOT, 'frontend/.next/static'), path.join(RES, 'frontend/.next/static'));
cp(path.join(ROOT, 'frontend/public'), path.join(RES, 'frontend/public'));
console.log('[msix] Fertig. Hinweis: Hermes separat via WSL installieren (docs/HERMES_INTEGRATION.md).');
