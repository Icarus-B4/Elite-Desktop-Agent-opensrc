import { NextRequest, NextResponse } from 'next/server';
import fs from 'fs';
import { resolveScreenshotFile } from '@/lib/screenshots-path';

const ANALYZER_URL = process.env.FRAME_ANALYZER_URL || 'http://localhost:8001';

/**
 * POST /api/elite/analyze-face
 * Gesichtsästhetik-Report (GPT-4o Vision + Editorial-Prompt)
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();

    if (!body.frame) {
      return NextResponse.json({ error: 'Kein Frame in der Anfrage' }, { status: 400 });
    }

    let frameData = body.frame;

    // Falls es sich um eine relative Galerie-URL handelt, lade das Bild vom Dateisystem
    if (typeof frameData === 'string' && (frameData.startsWith('/') || frameData.includes('file='))) {
      try {
        let fileName: string | null = null;
        if (frameData.includes('file=')) {
          const url = new URL(frameData, 'http://localhost');
          fileName = url.searchParams.get('file');
        } else {
          // Extrahiere Dateinamen am Ende des Pfads
          fileName = frameData.split('/').pop() || null;
        }

        if (fileName) {
          const filePath = resolveScreenshotFile(fileName);
          if (filePath && fs.existsSync(filePath)) {
            const fileBuffer = fs.readFileSync(filePath);
            frameData = `data:image/jpeg;base64,${fileBuffer.toString('base64')}`;
          }
        }
      } catch (parseErr) {
        console.warn('[AnalyzeFace] Fehler beim Auflösen der lokalen Bild-URL:', parseErr);
      }
    }

    const response = await fetch(`${ANALYZER_URL}/analyze-face`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ frame: frameData }),
      signal: AbortSignal.timeout(120000),
    });

    const result = await response.json();

    if (!response.ok) {
      return NextResponse.json(result, { status: response.status });
    }

    return NextResponse.json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);

    if (message.includes('ECONNREFUSED') || message.includes('fetch failed')) {
      return NextResponse.json(
        {
          error:
            'Face-Analyzer nicht erreichbar. Starte: python backend/frame_analyzer.py (Port 8001)',
        },
        { status: 503 },
      );
    }

    return NextResponse.json({ error: message }, { status: 500 });
  }
}
