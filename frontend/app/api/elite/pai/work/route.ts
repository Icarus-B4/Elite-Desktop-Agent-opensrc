import { NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';
import os from 'os';

const PULSE_BASE = process.env.PAI_PULSE_URL ?? 'http://127.0.0.1:31337';
const TIMEOUT_MS = 4000;

function workStateCandidates(): string[] {
  const home = os.homedir();
  const explicitRoot = process.env.PAI_HOME?.trim();
  const roots = [
    explicitRoot ? path.resolve(explicitRoot) : null,
    path.join(home, '.claude', 'PAI'),
    path.join(home, 'PAI'),
  ].filter(Boolean) as string[];

  return roots.flatMap((root) => [
    path.join(root, 'MEMORY', 'STATE', 'work.json'),
    path.join(root, 'USER', 'WORK', 'work.json'),
    path.join(root, 'USER', 'WORK', 'CURRENT_WORK.json'),
  ]);
}

function readLocalWorkState(): Record<string, unknown> | null {
  for (const candidate of workStateCandidates()) {
    try {
      if (!fs.existsSync(candidate)) continue;
      const raw = fs.readFileSync(candidate, 'utf8');
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed === 'object') {
        return {
          source: 'local',
          path: candidate,
          ...parsed,
        };
      }
    } catch {
      continue;
    }
  }
  return null;
}

export async function GET() {
  try {
    const loopRes = await fetch(`${PULSE_BASE}/api/loops/status`, {
      signal: AbortSignal.timeout(TIMEOUT_MS),
      cache: 'no-store',
    });
    if (loopRes.ok) {
      const status = await loopRes.json();
      return NextResponse.json({ source: 'pulse', ...status });
    }
  } catch {
    // fallback below
  }

  const local = readLocalWorkState();
  if (local) {
    return NextResponse.json(local);
  }

  return NextResponse.json({ error: 'work_state_unavailable' }, { status: 503 });
}

