import { NextResponse } from 'next/server';
import { execFile } from 'child_process';
import { promisify } from 'util';
import path from 'path';
import {
  HERMES_DASHBOARD_URL,
  HERMES_GATEWAY_URL,
  getHermesGatewayLogPath,
  getHermesHome,
  getHermesRuntimeInfo,
  isGatewayLogActive,
  probeHermesUrl,
  readMemoryFile,
  tailLogFile,
} from '@/lib/hermes-server';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

const execFileAsync = promisify(execFile);

async function fetchHermesStats(): Promise<{ sessionCount: number | null }> {
  const script = path.join(process.cwd(), '..', 'scripts', 'hermes_session_search.py');
  try {
    const { stdout } = await execFileAsync(
      process.env.PYTHON ?? 'python',
      [script, '--stats'],
      { timeout: 4000, cwd: path.join(process.cwd(), '..') },
    );
    const parsed = JSON.parse(stdout.trim());
    return { sessionCount: typeof parsed.sessionCount === 'number' ? parsed.sessionCount : null };
  } catch {
    return { sessionCount: null };
  }
}

async function probeWithRetry(url: string, attempts = 2, timeoutMs = 3500): Promise<boolean> {
  for (let i = 0; i < attempts; i++) {
    if (await probeHermesUrl(url, timeoutMs)) return true;
    if (i < attempts - 1) {
      await new Promise((r) => setTimeout(r, 800));
    }
  }
  return false;
}

export async function GET() {
  const warnings: string[] = [];
  let [gatewayReady, dashboardReady, stats] = await Promise.all([
    probeWithRetry(`${HERMES_GATEWAY_URL}/v1/models`),
    probeWithRetry(HERMES_DASHBOARD_URL, 2, 3000),
    fetchHermesStats(),
  ]);

  if (!gatewayReady && isGatewayLogActive()) {
    gatewayReady = true;
    warnings.push('gateway_wsl_log_active');
  }

  if (!gatewayReady) warnings.push('gateway_unreachable');
  if (!dashboardReady) warnings.push('dashboard_unreachable');

  const memory = readMemoryFile('MEMORY.md');
  const user = readMemoryFile('USER.md');
  const recentLogs = tailLogFile(getHermesGatewayLogPath(), 30);

  const isOnline = gatewayReady || dashboardReady;
  const runtime = getHermesRuntimeInfo();

  return NextResponse.json({
    isOnline,
    runtime,
    gatewayReady,
    dashboardReady,
    gatewayUrl: HERMES_GATEWAY_URL,
    dashboardUrl: HERMES_DASHBOARD_URL,
    hermesHome: getHermesHome(),
    memory: {
      chars: memory.chars,
      limit: 2200,
      preview: memory.content.slice(0, 400),
    },
    userProfile: {
      chars: user.chars,
      limit: 1375,
      preview: user.content.slice(0, 400),
    },
    sessionCount: stats.sessionCount,
    recentLogs,
    warnings,
    // Legacy MC widget fields (empty — Hermes has no Kanban)
    tasks: [],
    agents: [],
    webhookCount: 0,
    messageCount: 0,
    unreadMessageCount: 0,
  });
}
