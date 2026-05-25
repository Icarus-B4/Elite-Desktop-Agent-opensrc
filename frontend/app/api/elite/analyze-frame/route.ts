import { NextRequest, NextResponse } from 'next/server';

/**
 * /api/elite/analyze-frame
 * Bridge: Empfängt Base64-Frame vom Frontend-Widget,
 * leitet ihn an den Python Frame Analyzer (Port 8001) weiter.
 */

const ANALYZER_URL = process.env.FRAME_ANALYZER_URL || 'http://localhost:8001';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();

    if (!body.frame) {
      return NextResponse.json({ error: 'Kein Frame in der Anfrage' }, { status: 400 });
    }

    // Frame an Python-Backend weiterleiten
    const response = await fetch(`${ANALYZER_URL}/analyze`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ frame: body.frame }),
      // Timeout nach 10 Sekunden
      signal: AbortSignal.timeout(45000),
    });

    if (!response.ok) {
      const error = await response.text();
      return NextResponse.json(
        { error: `Analyzer-Fehler: ${response.status} – ${error}` },
        { status: 502 }
      );
    }

    const result = await response.json();
    return NextResponse.json(result);

  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);

    // Wenn der Analyzer nicht läuft, sinnvolle Fehlermeldung zurückgeben
    if (message.includes('ECONNREFUSED') || message.includes('fetch failed')) {
      return NextResponse.json(
        { error: 'Frame Analyzer nicht erreichbar. Starte: python backend/frame_analyzer.py' },
        { status: 503 }
      );
    }

    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function GET() {
  try {
    const response = await fetch(`${ANALYZER_URL}/health`, {
      signal: AbortSignal.timeout(2000),
    });
    const data = await response.json();
    return NextResponse.json(data);
  } catch {
    return NextResponse.json({ status: 'offline' }, { status: 503 });
  }
}
