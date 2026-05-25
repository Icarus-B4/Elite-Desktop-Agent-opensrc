import { NextResponse } from 'next/server';

const PULSE_BASE = process.env.PAI_PULSE_URL ?? 'http://127.0.0.1:31337';
const TIMEOUT_MS = 5000;

export async function GET() {
  try {
    const res = await fetch(`${PULSE_BASE}/api/loops/status`, {
      signal: AbortSignal.timeout(TIMEOUT_MS),
      cache: 'no-store',
    });
    const data = await res.json().catch(() => ({}));
    return NextResponse.json(data, { status: res.status });
  } catch {
    return NextResponse.json({ error: 'loop_status_unreachable' }, { status: 503 });
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const res = await fetch(`${PULSE_BASE}/api/loops/control`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(TIMEOUT_MS),
      cache: 'no-store',
    });
    const data = await res.json().catch(() => ({}));
    return NextResponse.json(data, { status: res.status });
  } catch {
    return NextResponse.json({ error: 'loop_control_unreachable' }, { status: 503 });
  }
}

