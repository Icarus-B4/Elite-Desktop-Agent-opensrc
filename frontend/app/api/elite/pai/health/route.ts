import { NextResponse } from 'next/server';

const PULSE_BASE = process.env.PAI_PULSE_URL ?? 'http://127.0.0.1:31337';
const TIMEOUT_MS = 2500;

async function probe(url: string): Promise<Response | null> {
  try {
    return await fetch(url, { signal: AbortSignal.timeout(TIMEOUT_MS), cache: 'no-store' });
  } catch {
    return null;
  }
}

/** Server-side health probe for the local PAI Pulse daemon (avoids browser CORS/no-cors false positives). */
export async function GET() {
  const healthRes = await probe(`${PULSE_BASE}/api/pulse/health`);
  if (!healthRes?.ok) {
    return NextResponse.json({ online: false, reason: 'pulse_health_unreachable' }, { status: 503 });
  }

  let pulse: { status?: string } = {};
  try {
    pulse = await healthRes.json();
  } catch {
    return NextResponse.json({ online: false, reason: 'pulse_health_invalid' }, { status: 503 });
  }

  const rootRes = await probe(`${PULSE_BASE}/`);
  const online = pulse.status === 'ok' && Boolean(rootRes?.ok);

  return NextResponse.json({
    online,
    pulse,
    dashboardReady: Boolean(rootRes?.ok),
  });
}
