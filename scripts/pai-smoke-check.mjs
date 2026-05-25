#!/usr/bin/env node
/* jshint esversion: 11, node: true */

const checks = [
  ['PAI Health', 'http://127.0.0.1:3000/api/elite/pai/health'],
  ['PAI Work', 'http://127.0.0.1:3000/api/elite/pai/work'],
  ['PAI Modules', 'http://127.0.0.1:3000/api/elite/pai/modules'],
  ['Hermes Overview', 'http://127.0.0.1:3000/api/hermes/overview'],
  ['Hermes PAI Bridge', 'http://127.0.0.1:3000/api/elite/pai/hermes-bridge'],
  ['System Status', 'http://127.0.0.1:3000/api/system-status'],
];

const REQUEST_TIMEOUT_MS = Number(process.env.PAI_SMOKE_TIMEOUT_MS || 5000);

async function fetchWithTimeout(url) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    return await fetch(url, { method: 'GET', signal: controller.signal });
  } finally {
    clearTimeout(timeout);
  }
}

async function run() {
  let failed = 0;
  for (const [name, url] of checks) {
    try {
      const res = await fetchWithTimeout(url);
      if (!res.ok) {
        failed += 1;
        console.error(`[FAIL] ${name}: HTTP ${res.status}`);
        continue;
      }
      const data = await res.json().catch(() => ({}));
      console.log(`[OK] ${name}: ${JSON.stringify(data).slice(0, 120)}`);
    } catch (err) {
      failed += 1;
      const message = err.name === 'AbortError' ? `timeout after ${REQUEST_TIMEOUT_MS}ms` : err.message;
      console.error(`[FAIL] ${name}: ${message}`);
    }
  }
  if (failed > 0) {
    process.exit(1);
  }
}

run();

