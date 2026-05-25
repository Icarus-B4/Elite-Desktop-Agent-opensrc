import { NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';
import os from 'os';
import {
  getHermesMemoriesDir,
  HERMES_DASHBOARD_URL,
  HERMES_GATEWAY_URL,
  probeHermesUrl,
  readMemoryFile,
} from '@/lib/hermes-server';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

const PULSE_BASE = process.env.PAI_PULSE_URL ?? 'http://127.0.0.1:31337';

function getPaiKnowledgeDir(): string {
  const paiHome = process.env.PAI_HOME?.trim() || path.join(os.homedir(), '.claude', 'PAI');
  return path.join(paiHome, 'USER', 'KNOWLEDGE');
}

/** Expose Hermes MEMORY/USER snippets for Pulse observatory + HUD consumers. */
export async function GET() {
  const memory = readMemoryFile('MEMORY.md');
  const user = readMemoryFile('USER.md');
  const [gatewayReady, dashboardReady, pulseOk] = await Promise.all([
    probeHermesUrl(`${HERMES_GATEWAY_URL}/v1/models`),
    probeHermesUrl(HERMES_DASHBOARD_URL),
    probeHermesUrl(`${PULSE_BASE}/api/pulse/health`),
  ]);

  return NextResponse.json({
    hermesHome: getHermesMemoriesDir().replace(/[/\\]memories$/, ''),
    gatewayUrl: HERMES_GATEWAY_URL,
    dashboardUrl: HERMES_DASHBOARD_URL,
    gatewayReady,
    dashboardReady,
    pulseReady: pulseOk,
    memoryPreview: memory.content.slice(0, 1200),
    userPreview: user.content.slice(0, 800),
    memoryChars: memory.chars,
    userChars: user.chars,
    updatedAt: new Date().toISOString(),
  });
}

/** Mirror Hermes memory snippets into PAI KNOWLEDGE for Observatory file watchers. */
export async function POST() {
  const memory = readMemoryFile('MEMORY.md');
  const user = readMemoryFile('USER.md');
  const knowledgeDir = getPaiKnowledgeDir();

  try {
    fs.mkdirSync(knowledgeDir, { recursive: true });
    const stamp = new Date().toISOString();
    const hermesNote = [
      '# Hermes Agent Memory Bridge',
      '',
      `Synced: ${stamp}`,
      '',
      '## MEMORY.md (Hermes)',
      memory.content || '(leer)',
      '',
      '## USER.md (Hermes)',
      user.content || '(leer)',
      '',
    ].join('\n');

    fs.writeFileSync(path.join(knowledgeDir, 'HERMES_MEMORY_BRIDGE.md'), hermesNote, 'utf8');
    return NextResponse.json({ ok: true, path: path.join(knowledgeDir, 'HERMES_MEMORY_BRIDGE.md') });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'sync_failed';
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
