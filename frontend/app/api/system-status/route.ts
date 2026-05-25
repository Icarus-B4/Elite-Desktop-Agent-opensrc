import { NextResponse } from 'next/server';
import { exec } from 'child_process';
import { promisify } from 'util';
import os from 'os';
import fs from 'fs';
import path from 'path';

const execAsync = promisify(exec);

export const dynamic = 'force-dynamic';
export const revalidate = 0;

type AgentStatus = 'RUNNING' | 'STOPPED';
type ServiceStatus = 'ready' | 'down';

interface WeatherData {
  temp: string;
  condition: string;
  location: string;
}

interface SystemStatusPayload {
  cpu_percent: number;
  ram_used_gb: number;
  ram_total_gb: number;
  ram_percent: number;
  disk_percent: number;
  uptime_hours: number;
  process_count: number;
  weather: WeatherData;
  agent_status: AgentStatus;
  livekit_status: ServiceStatus;
  pulse_status: ServiceStatus;
  mission_control_status: ServiceStatus;
  hermes_status: ServiceStatus;
  configured_llm_mode: string | null;
  effective_llm_mode: string | null;
  llm_fallback_reason: string | null;
  elite_ready: boolean;
  status?: 'fallback';
  _cache?: 'hit' | 'miss';
}

const DEFAULT_WEATHER: WeatherData = {
  temp: '22.4°C',
  condition: 'Clear Sky',
  location: 'Biel',
};

let cachedMetrics = {
  cpu_percent: 5,
  disk_percent: 30,
  process_count: 150,
  agent_status: 'STOPPED' as AgentStatus,
};

let lastCpuInfo: { user: number; sys: number; idle: number; total: number } | null = null;

/**
 * Berechnet die CPU-Auslastung des Systems in Echtzeit durch Vergleich der CPU-Ticks (Deutsch).
 */
function getCpuUsage(): number {
  const cpus = os.cpus();
  if (!cpus || cpus.length === 0) return 5.0;

  let user = 0;
  let sys = 0;
  let idle = 0;

  for (const cpu of cpus) {
    user += cpu.times.user;
    sys += cpu.times.sys;
    idle += cpu.times.idle;
  }

  const total = user + sys + idle;

  if (!lastCpuInfo) {
    lastCpuInfo = { user, sys, idle, total };
    return 5.0;
  }

  const deltaIdle = idle - lastCpuInfo.idle;
  const deltaTotal = total - lastCpuInfo.total;

  lastCpuInfo = { user, sys, idle, total };

  if (deltaTotal <= 0) return 0;

  const cpuPercent = ((deltaTotal - deltaIdle) / deltaTotal) * 100;
  return Math.min(100, Math.max(0, Math.round(cpuPercent * 10) / 10));
}

let lastMetricsUpdate = 0;
let isMetricsUpdating = false;

/**
 * Aktualisiert die rechenintensiven PowerShell-Metriken im Hintergrund (Deutsch).
 */
async function updatePowerShellMetricsInBackground() {
  if (isMetricsUpdating) return;
  const now = Date.now();
  if (now - lastMetricsUpdate < 30_000) return; // maximal alle 30 Sekunden

  isMetricsUpdating = true;
  try {
    const res = await fetchPowerShellMetrics();
    cachedMetrics.disk_percent = res.disk_percent;
    cachedMetrics.process_count = res.process_count;
    cachedMetrics.agent_status = res.agent_status;
    lastMetricsUpdate = Date.now();
  } catch (err) {
    try {
      const agent_status = await detectAgentStatusFast();
      cachedMetrics.agent_status = agent_status;
    } catch {}
    console.error("[System-Status] Fehler beim asynchronen Abruf der PowerShell-Metriken:", err);
  } finally {
    isMetricsUpdating = false;
  }
}

let cachedServices = {
  livekit_status: 'down' as ServiceStatus,
  pulse_status: 'down' as ServiceStatus,
  mission_control_status: 'down' as ServiceStatus,
  hermes_status: 'down' as ServiceStatus,
};
let lastServicesUpdate = 0;
let isServicesUpdating = false;

/**
 * Aktualisiert den Status der verschiedenen Netzdienste im Hintergrund (Deutsch).
 */
async function updateServicesInBackground() {
  if (isServicesUpdating) return;
  const now = Date.now();
  if (now - lastServicesUpdate < 15_000) return; // maximal alle 15 Sekunden

  isServicesUpdating = true;
  try {
    const res = await fetchServiceStatuses();
    cachedServices = res;
    lastServicesUpdate = Date.now();
  } catch (err) {
    console.error("[System-Status] Fehler beim asynchronen Abruf der Netzdienste:", err);
  } finally {
    isServicesUpdating = false;
  }
}

let cachedWeather = DEFAULT_WEATHER;
let lastWeatherUpdate = 0;
let isWeatherUpdating = false;

/**
 * Aktualisiert die Wetterdaten im Hintergrund (Deutsch).
 */
async function updateWeatherInBackground() {
  if (isWeatherUpdating) return;
  const now = Date.now();
  if (now - lastWeatherUpdate < 30 * 60 * 1000) return; // maximal alle 30 Minuten

  isWeatherUpdating = true;
  try {
    const res = await fetchWeather();
    cachedWeather = res;
    lastWeatherUpdate = Date.now();
  } catch (err) {
    console.error("[System-Status] Fehler beim asynchronen Abruf des Wetters:", err);
  } finally {
    isWeatherUpdating = false;
  }
}

// =============================================================================
// Hilfsfunktionen (Deutsch)
// =============================================================================

const getWritableConfigPath = () => {
  const base = process.env.LOCALAPPDATA || process.env.APPDATA;
  if (!base) {
    return path.join(process.cwd(), '..', 'backend', 'config.json');
  }
  return path.join(base, 'EliteDesktopAgent', 'backend', 'config.json');
};

function readLivekitMode(): 'local' | 'cloud' {
  try {
    const configPath = getWritableConfigPath();
    if (fs.existsSync(configPath)) {
      const data = JSON.parse(fs.readFileSync(configPath, 'utf8'));
      if (data.livekitMode === 'local') return 'local';
    }
  } catch {
    /* ignore */
  }
  return 'cloud';
}

function readAgentRuntimeState(): {
  configuredLlmMode?: string;
  effectiveLlmMode?: string;
  llmFallbackReason?: string | null;
} {
  try {
    const base = process.env.LOCALAPPDATA || process.env.APPDATA;
    if (!base) return {};
    const runtimePath = path.join(base, 'EliteDesktopAgent', 'backend', 'agent_runtime.json');
    if (!fs.existsSync(runtimePath)) return {};
    return JSON.parse(fs.readFileSync(runtimePath, 'utf8'));
  } catch {
    return {};
  }
}

async function detectAgentStatusFast(): Promise<AgentStatus> {
  try {
    const { stdout } = await execAsync(
      'netstat -ano | findstr :7861 | findstr LISTENING',
      { timeout: 1500 },
    );
    return stdout.trim() ? 'RUNNING' : 'STOPPED';
  } catch {
    return 'STOPPED';
  }
}

async function fetchPowerShellMetrics(): Promise<{ disk_percent: number; process_count: number; agent_status: AgentStatus }> {
  try {
    const psScript = `
      try {
        $disk = Get-CimInstance Win32_LogicalDisk -Filter "DriveType=3" -ErrorAction SilentlyContinue | Select-Object -First 1
        $procCount = (Get-Process).Count
        $agentProc = Get-CimInstance Win32_Process -Filter "Name LIKE 'python%' AND CommandLine LIKE '%agent.py%'" -ErrorAction SilentlyContinue
        $agentStatus = if ($agentProc) { "RUNNING" } else { "STOPPED" }
        $size = if ($disk) { $disk.Size } else { 1 }
        $free = if ($disk) { $disk.FreeSpace } else { 0 }
        Write-Output "$size|$free|$procCount|$agentStatus"
      } catch {
        Write-Output "1|1|0|STOPPED"
      }
    `.trim();

    const buffer = Buffer.from(psScript, 'utf16le');
    const encodedCommand = buffer.toString('base64');

    const { stdout } = await execAsync(
      `powershell.exe -NoProfile -EncodedCommand ${encodedCommand}`,
      { timeout: 4000, env: { ...process.env, NO_COLOR: '1' } }
    );

    const parts = stdout.trim().split('|');
    const totalDisk = parseFloat(parts[0]) || 1;
    const freeDisk = parseFloat(parts[1]) || 0;
    const diskPercent = ((totalDisk - freeDisk) / totalDisk) * 100;
    const processCount = parseInt(parts[2]) || 0;
    let agentStatus = (parts[3]?.trim() || 'STOPPED') as AgentStatus;
    if (agentStatus !== 'RUNNING') {
      agentStatus = await detectAgentStatusFast();
    }
    return { disk_percent: Math.round(diskPercent), process_count: processCount, agent_status: agentStatus };
  } catch (e) {
    const agentStatus = await detectAgentStatusFast();
    return { disk_percent: 15, process_count: 80, agent_status: agentStatus };
  }
}

async function checkLocalLivekitServer(): Promise<ServiceStatus> {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 2000);
    const resp = await fetch('http://127.0.0.1:7880', { signal: controller.signal });
    clearTimeout(timeout);
    return resp.status > 0 && resp.status < 600 ? 'ready' : 'down';
  } catch {
    return 'down';
  }
}

async function checkLivekitServer(): Promise<ServiceStatus> {
  const mode = readLivekitMode();
  if (mode === 'cloud') {
    const hasCloud =
      Boolean(process.env.LIVEKIT_URL) &&
      Boolean(process.env.LIVEKIT_API_KEY) &&
      Boolean(process.env.LIVEKIT_API_SECRET);
    return hasCloud ? 'ready' : 'down';
  }
  return checkLocalLivekitServer();
}

async function checkService(url: string): Promise<ServiceStatus> {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 2000);
    const resp = await fetch(url, { signal: controller.signal, cache: 'no-store' });
    clearTimeout(timeout);
    return resp.status > 0 && resp.status < 600 ? 'ready' : 'down';
  } catch {
    return 'down';
  }
}

async function fetchServiceStatuses(): Promise<{
  livekit_status: ServiceStatus;
  pulse_status: ServiceStatus;
  mission_control_status: ServiceStatus;
  hermes_status: ServiceStatus;
}> {
  const livekit = await checkLivekitServer();
  const pulse = await checkService(`${process.env.PAI_PULSE_URL ?? 'http://127.0.0.1:31337'}/api/pulse/health`);
  const hermesGateway = await checkService(`${process.env.HERMES_GATEWAY_URL ?? 'http://127.0.0.1:8642'}/v1/models`);
  const mc = hermesGateway; // Mission Control is replaced by Hermes
  
  return {
    livekit_status: livekit,
    pulse_status: pulse,
    mission_control_status: mc,
    hermes_status: hermesGateway,
  };
}

async function fetchWeather(): Promise<WeatherData> {
  let weather = DEFAULT_WEATHER;
  try {
    const weatherResp = await fetch('https://wttr.in/Biel,Switzerland?format=%t|%C|%l', {
      next: { revalidate: 3600 },
      signal: AbortSignal.timeout(4000)
    });
    if (weatherResp.ok) {
      const text = await weatherResp.text();
      const [t, c, l] = text.split('|');
      weather = {
        temp: t.trim(),
        condition: c.trim(),
        location: l.trim().split(',')[0] || "Biel"
      };
    }
  } catch (e) {
    console.error("[System-Status] Weather fetch failed:", e);
  }
  return weather;
}

// =============================================================================
// API GET Handler
// =============================================================================

export async function GET() {
  // Starte alle langwierigen Abfragen asynchron im Hintergrund (kein await)
  void updatePowerShellMetricsInBackground();
  void updateServicesInBackground();
  void updateWeatherInBackground();

  // Berechne Echtzeit-Werte (CPU/RAM) direkt und sofort in Node.js
  const liveCpu = getCpuUsage();
  const totalRam = os.totalmem();
  const usedRam = totalRam - os.freemem();

  const agentRuntime = readAgentRuntimeState();

  const elite_ready =
    cachedMetrics.agent_status === 'RUNNING' &&
    cachedServices.livekit_status === 'ready' &&
    cachedServices.pulse_status === 'ready';

  const payload: SystemStatusPayload = {
    cpu_percent: liveCpu,
    ram_used_gb: usedRam / (1024 ** 3),
    ram_total_gb: totalRam / (1024 ** 3),
    ram_percent: (usedRam / totalRam) * 100,
    disk_percent: cachedMetrics.disk_percent,
    uptime_hours: os.uptime() / 3600,
    process_count: cachedMetrics.process_count,
    weather: cachedWeather,
    agent_status: cachedMetrics.agent_status,
    livekit_status: cachedServices.livekit_status,
    pulse_status: cachedServices.pulse_status,
    mission_control_status: cachedServices.mission_control_status,
    hermes_status: cachedServices.hermes_status,
    configured_llm_mode: agentRuntime.configuredLlmMode ?? null,
    effective_llm_mode: agentRuntime.effectiveLlmMode ?? null,
    llm_fallback_reason: agentRuntime.llmFallbackReason ?? null,
    elite_ready,
    _cache: 'hit',
  };

  return NextResponse.json(payload, {
    headers: {
      'Cache-Control': 'private, max-age=0, no-cache',
      'X-System-Status-Cache': 'hit',
    },
  });
}
