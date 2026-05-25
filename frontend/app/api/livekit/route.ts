import { AccessToken } from 'livekit-server-sdk';
import { NextRequest, NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';
import { getEliteEnv } from '@/lib/elite-env';

const getWritablePath = (relPath: string) => {
  const base = process.env.LOCALAPPDATA || process.env.APPDATA;
  if (!base) {
    // Fallback für Entwicklungsumgebung
    return path.join(process.cwd(), '..', relPath);
  }
  return path.join(base, 'EliteDesktopAgent', relPath);
};

export async function GET(req: NextRequest) {
  const room = req.nextUrl.searchParams.get('room');
  const identity = req.nextUrl.searchParams.get('identity');

  // Optionale Clerk-Metadaten für personalisierte Begrüßung
  const clerkUserId = req.nextUrl.searchParams.get('clerkUserId');
  const userName = req.nextUrl.searchParams.get('userName');

  if (!room) {
    return NextResponse.json({ error: 'Missing "room" query parameter' }, { status: 400 });
  } else if (!identity) {
    return NextResponse.json({ error: 'Missing "identity" query parameter' }, { status: 400 });
  }

  let livekitMode = 'cloud';
  try {
    const configPath = getWritablePath('backend/config.json');
    if (fs.existsSync(configPath)) {
      const data = JSON.parse(fs.readFileSync(configPath, 'utf8'));
      if (data.livekitMode) {
        livekitMode = data.livekitMode;
      }
    }
  } catch (e) {
    console.error("Failed to read livekitMode from config:", e);
  }

  let apiKey = getEliteEnv('LIVEKIT_API_KEY');
  let apiSecret = getEliteEnv('LIVEKIT_API_SECRET');
  let wsUrl = getEliteEnv('LIVEKIT_URL');

  if (livekitMode === 'local') {
    wsUrl = getEliteEnv('LIVEKIT_LOCAL_URL') || 'ws://127.0.0.1:7880';
    apiKey = 'devkey';
    apiSecret = 'secret';
  }

  if (!apiKey || !apiSecret || !wsUrl) {
    return NextResponse.json({ error: 'Server misconfigured' }, { status: 500 });
  }

  const at = new AccessToken(apiKey, apiSecret, {
    identity,
    // Metadata wird dem Agent als JSON-String übergeben
    metadata: JSON.stringify({
      clerkUserId: clerkUserId || null,
      userName: userName || null,
    }),
  });

  at.addGrant({
    room,
    roomJoin: true,
    canPublish: true,
    canSubscribe: true,
  });

  return NextResponse.json({ token: await at.toJwt(), serverUrl: wsUrl });
}
