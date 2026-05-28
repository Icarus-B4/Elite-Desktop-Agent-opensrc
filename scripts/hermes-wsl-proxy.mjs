#!/usr/bin/env node
/**
 * Windows localhost bridge:
 * - 127.0.0.1:9119 -> WSL Hermes dashboard (0.0.0.0:9119)
 * - 127.0.0.1:8642 -> WSL Hermes gateway (0.0.0.0:8642)
 * WSL2 spiegelt localhost oft nicht — Browser bekommt sonst ERR_CONNECTION_REFUSED.
 */
import { spawnSync } from 'child_process';
import http from 'http';
import net from 'net';
import fs from 'fs';
import path from 'path';
import os from 'os';

const LISTEN_HOST = '127.0.0.1';
const DISTRO = process.env.HERMES_WSL_DISTRO || 'Ubuntu';
const PID_FILE = path.join(os.tmpdir(), 'elite-hermes-dashboard-proxy.pid');

const PORTS_TO_PROXY = [
  { listenPort: Number(process.env.HERMES_DASHBOARD_PROXY_PORT || 9119), targetPort: 9119, name: 'Dashboard' },
  { listenPort: Number(process.env.HERMES_GATEWAY_PROXY_PORT || 8642), targetPort: 8642, name: 'Gateway API' }
];

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
      try {
        process.kill(oldPid, 0);
        process.kill(oldPid);
        log(`Alter Proxy beendet (PID ${oldPid})`);
      } catch {
        /* ignore if already dead */
      }
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

function createProxyServer(listenPort, targetPort, wslIp, name) {
  const server = http.createServer((clientReq, clientRes) => {
    const headers = { ...clientReq.headers, host: `${wslIp}:${targetPort}` };
    const proxyReq = http.request(
      {
        hostname: wslIp,
        port: targetPort,
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
      clientRes.end(`Hermes ${name} proxy: ${err.message}`);
    });
    clientReq.pipe(proxyReq);
  });

  server.on('upgrade', (req, clientSocket, head) => {
    const upstream = net.connect(targetPort, wslIp, () => {
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
      log(`Port ${listenPort} belegt — vermutlich läuft Proxy bereits.`);
      process.exit(0);
    }
    log(`FATAL (${name}): ${err.message}`);
    process.exit(1);
  });

  return server;
}

async function main() {
  if (process.platform !== 'win32') {
    log('Nur unter Windows nötig — in WSL direkt 127.0.0.1:9119 nutzen.');
    process.exit(0);
  }

  stopPrevious();

  const wslIp = getWslIp();
  log(`WSL IP erkannt: ${wslIp}`);

  const servers = [];

  for (const config of PORTS_TO_PROXY) {
    const { listenPort, targetPort, name } = config;
    const targetUrl = `http://${wslIp}:${targetPort}/`;
    
    // Bei Gateway-Probe /v1/models nutzen, da / oft blockiert ist
    const probeUrl = targetPort === 8642 ? `http://${wslIp}:${targetPort}/v1/models` : targetUrl;
    
    if (!(await probeHttp(probeUrl))) {
      log(`${name} in WSL nicht erreichbar (${probeUrl}) — überspringe Proxy.`);
      continue;
    }

    const server = createProxyServer(listenPort, targetPort, wslIp, name);
    server.listen(listenPort, LISTEN_HOST, () => {
      log(`Proxy aktiv: http://${LISTEN_HOST}:${listenPort} -> http://${wslIp}:${targetPort} (${name})`);
    });
    servers.push(server);
  }

  if (servers.length === 0) {
    log('Keine aktiven WSL-Dienste für Proxy gefunden.');
    process.exit(1);
  }

  writePid();

  const shutdown = () => {
    try {
      fs.unlinkSync(PID_FILE);
    } catch {
      /* ignore */
    }
    let closed = 0;
    for (const server of servers) {
      server.close(() => {
        closed++;
        if (closed === servers.length) {
          process.exit(0);
        }
      });
    }
    setTimeout(() => process.exit(0), 1000);
  };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

main().catch((err) => {
  log(`Fehler: ${err.message}`);
  process.exit(1);
});
