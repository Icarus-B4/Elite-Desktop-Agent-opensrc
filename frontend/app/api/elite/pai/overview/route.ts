import { NextResponse } from 'next/server';

const PULSE_BASE = process.env.PAI_PULSE_URL ?? 'http://127.0.0.1:31337';
const TIMEOUT_MS = 4000;

/** Proxied Telos overview from the local PAI Pulse daemon (avoids browser CORS). */
export async function GET() {
  try {
    const res = await fetch(`${PULSE_BASE}/api/telos/overview`, {
      signal: AbortSignal.timeout(TIMEOUT_MS),
      cache: 'no-store',
    });
    if (!res.ok) {
      return NextResponse.json(
        { error: 'telos_overview_unreachable', status: res.status },
        { status: 502 },
      );
    }
    const data = await res.json();
    return NextResponse.json(data);
  } catch {
    return NextResponse.json({ error: 'telos_overview_failed' }, { status: 503 });
  }
}
