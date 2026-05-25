import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

const PULSE_BASE = process.env.PAI_PULSE_URL ?? 'http://127.0.0.1:31337';
const HERMES_GATEWAY = process.env.HERMES_GATEWAY_URL ?? 'http://127.0.0.1:8642';
const HERMES_DASHBOARD = process.env.HERMES_DASHBOARD_URL ?? 'http://127.0.0.1:9119';

const MODULE_GROUPS = [
  {
    wave: 'A',
    name: 'Core',
    modules: ['Agents', 'Algorithm', 'Tools', 'Security', 'Observability', 'Notifications'],
  },
  {
    wave: 'B',
    name: 'Execution',
    modules: ['Delegation', 'Skills', 'Memory', 'Pulse', 'Hooks', 'Config'],
  },
  {
    wave: 'C',
    name: 'Domain',
    modules: ['ISA', 'LifeOs', 'Fabric', 'Feed', 'Arbol'],
  },
];

async function probe(url: string): Promise<boolean> {
  try {
    const res = await fetch(url, {
      signal: AbortSignal.timeout(2000),
      cache: 'no-store',
    });
    return res.ok;
  } catch {
    return false;
  }
}

export async function GET() {
  const [pulseOk, loopsOk, hermesGatewayOk, hermesDashboardOk, backendOk] = await Promise.all([
    probe(`${PULSE_BASE}/api/pulse/health`),
    probe(`${PULSE_BASE}/api/loops/status`),
    probe(`${HERMES_GATEWAY}/v1/models`),
    probe(HERMES_DASHBOARD),
    probe('http://127.0.0.1:7861'),
  ]);

  const hermes = hermesGatewayOk || hermesDashboardOk;

  const runtime = {
    pulse: pulseOk,
    loops: loopsOk,
    hermes,
    hermesGateway: hermesGatewayOk,
    hermesDashboard: hermesDashboardOk,
    missionControl: hermes,
    backend: backendOk,
  };

  const completion = {
    coreReady: Number(runtime.backend) + Number(runtime.hermes) + Number(runtime.pulse),
    executionReady: Number(runtime.loops) + Number(runtime.pulse),
    domainReady: Number(runtime.pulse),
  };

  return NextResponse.json({
    groups: MODULE_GROUPS,
    runtime,
    completion,
    updatedAt: new Date().toISOString(),
  });
}
