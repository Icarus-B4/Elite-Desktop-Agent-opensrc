#!/usr/bin/env node
/**
 * Windows localhost bridge: 127.0.0.1:9119 -> WSL Hermes dashboard (0.0.0.0:9119).
 * WSL2 spiegelt localhost oft nicht — Browser bekommt sonst ERR_CONNECTION_REFUSED (-102).
 */
import { spawnSync } from 'child_process';
import http from 'http';
import net from 'net';
import fs from 'fs';
import path from 'path';
import os from 'os';

const LISTEN_HOST = '127.0.0.1';
const LISTEN_PORT = Number(process.env.HERMES_DASHBOARD_PROXY_PORT || 9119);
const TARGET_PORT = LISTEN_PORT;
const DISTRO = process.env.HERMES_WSL_DISTRO || 'Ubuntu';
const PID_FILE = path.join(os.tmpdir(), 'elite-hermes-dashboard-proxy.pid');

function log(msg) {
  console.log(`[Hermes Proxy] ${msg}`);
}

function getWslIp() {
  const r = spawnSync('wsl.exe', ['-d', DISTRO, 'hostname', '-I'], {
    encoding: 'utf8',
    windowsHide: true,
  });
  const ip = (r.stdout || '').trim().split(/\s+/)[0];
  if (!/^\d+\.\d+\.\d+\.\d+$/.test(ip)) {
    throw new Error(`Keine WSL-IP (Distro: ${DISTRO})`);
  }
  return ip;
}

function probeHttp(url, timeoutMs = 2500) {
  return new Promise((resolve) => {
    const req = http.get(url, { timeout: timeoutMs }, (res) => {
      res.resume();
      resolve(res.statusCode >= 200 && res.statusCode < 500);
    });
    req.on('error', () => resolve(false));
    req.on('timeout', () => {
      req.destroy();
      resolve(false);
    });
  });
}

function writePid() {
  fs.writeFileSync(PID_FILE, String(process.pid));
}

function stopPrevious() {
  if (!fs.existsSync(PID_FILE)) return;
  try {
    const oldPid = parseInt(fs.readFileSync(PID_FILE, 'utf8').trim(), 10);
    if (oldPid > 0) {
      process.kill(oldPid, 0);
      process.kill(oldPid);
      log(`Alter Proxy beendet (PID ${oldPid})`);
    }
  } catch {
    /* nicht mehr aktiv */
  }
  try {
    fs.unlinkSync(PID_FILE);
  } catch {
    /* ignore */
  }
}

async function main() {
  if (process.platform !== 'win32') {
    log('Nur unter Windows nötig — in WSL direkt 127.0.0.1:9119 nutzen.');
    process.exit(0);
  }

  if (await probeHttp(`http://${LISTEN_HOST}:${LISTEN_PORT}/`)) {
    log(`http://${LISTEN_HOST}:${LISTEN_PORT} antwortet bereits — kein Proxy nötig.`);
    process.exit(0);
  }

  stopPrevious();

  const wslIp = getWslIp();
  const targetBase = `http://${wslIp}:${TARGET_PORT}`;

  if (!(await probeHttp(`${targetBase}/`))) {
    log(`Dashboard in WSL nicht erreichbar (${targetBase}) — Proxy übersprungen.`);
    process.exit(1);
  }

  const server = http.createServer((clientReq, clientRes) => {
    const headers = { ...clientReq.headers, host: `${wslIp}:${TARGET_PORT}` };
    const proxyReq = http.request(
      {
        hostname: wslIp,
        port: TARGET_PORT,
        path: clientReq.url,
        method: clientReq.method,
        headers,
      },
      (proxyRes) => {
        clientRes.writeHead(proxyRes.statusCode || 502, proxyRes.headers);
        proxyRes.pipe(clientRes);
      },
    );
    proxyReq.on('error', (err) => {
      clientRes.writeHead(502, { 'Content-Type': 'text/plain; charset=utf-8' });
      clientRes.end(`Hermes proxy: ${err.message}`);
    });
    clientReq.pipe(proxyReq);
  });

  server.on('upgrade', (req, clientSocket, head) => {
    const upstream = net.connect(TARGET_PORT, wslIp, () => {
      let raw = `${req.method} ${req.url} HTTP/1.1\r\n`;
      for (const [key, value] of Object.entries(req.headers)) {
        raw += `${key}: ${value}\r\n`;
      }
      raw += '\r\n';
      upstream.write(raw);
      if (head.length) upstream.write(head);
      clientSocket.pipe(upstream);
      upstream.pipe(clientSocket);
    });
    upstream.on('error', () => clientSocket.destroy());
    clientSocket.on('error', () => upstream.destroy());
  });

  server.on('error', (err) => {
    if (err.code === 'EADDRINUSE') {
      log(`Port ${LISTEN_PORT} belegt — vermutlich läuft Proxy bereits.`);
      process.exit(0);
    }
    log(`FATAL: ${err.message}`);
    process.exit(1);
  });

  server.listen(LISTEN_PORT, LISTEN_HOST, () => {
    writePid();
    log(`http://${LISTEN_HOST}:${LISTEN_PORT} -> ${targetBase}`);
  });

  const shutdown = () => {
    try {
      fs.unlinkSync(PID_FILE);
    } catch {
      /* ignore */
    }
    server.close(() => process.exit(0));
  };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

main().catch((err) => {
  log(`Fehler: ${err.message}`);
  process.exit(1);
});
