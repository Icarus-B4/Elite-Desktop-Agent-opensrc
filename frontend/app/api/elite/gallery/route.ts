import { NextRequest, NextResponse } from 'next/server';
import { loadMergedGallery } from '@/lib/screenshots-path';

export const runtime = 'nodejs';
import {
  appendGalleryEntry,
  saveFrameFile,
  readPrimaryGallery,
  type GalleryEntry,
} from '@/lib/gallery-persist';

/**
 * GET /api/elite/gallery — merged gallery.json (AppData + legacy repo).
 * POST /api/elite/gallery — save frame + metadata (persistent, no DB required).
 */
export async function GET() {
  try {
    const merged = loadMergedGallery();
    return NextResponse.json(merged);
  } catch (err) {
    console.error('Gallery fetch error:', err);
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const frame = typeof body.frame === 'string' ? body.frame : '';
    if (!frame.startsWith('data:image/')) {
      return NextResponse.json({ error: 'Kein gültiges Bild (data URL) in der Anfrage' }, { status: 400 });
    }

    const prefix = typeof body.prefix === 'string' ? body.prefix.replace(/[^a-z0-9_-]/gi, '') : 'webcam';
    const filename = saveFrameFile(frame, prefix || 'webcam');

    const labels = Array.isArray(body.labels)
      ? body.labels.filter((l: unknown) => typeof l === 'string')
      : ['Kamera-Scan'];

    const analysisIn = body.analysis && typeof body.analysis === 'object' ? body.analysis : {};
    const entry: GalleryEntry = {
      id: `img_${Date.now()}`,
      timestamp: Date.now(),
      src: `/api/elite/gallery/image?file=${filename}`,
      labels: labels.length > 0 ? labels : ['Kamera-Scan'],
      confidence: typeof body.confidence === 'number' ? body.confidence : 0.85,
      analysis: {
        description: typeof analysisIn.description === 'string' ? analysisIn.description : undefined,
        face_count: typeof analysisIn.face_count === 'number' ? analysisIn.face_count : 0,
        object_count: typeof analysisIn.object_count === 'number' ? analysisIn.object_count : 0,
        brightness: typeof analysisIn.brightness === 'number' ? analysisIn.brightness : 0,
        resolution: typeof analysisIn.resolution === 'string' ? analysisIn.resolution : '',
        filename,
        face_report: typeof analysisIn.face_report === 'string' ? analysisIn.face_report : undefined,
      },
    };

    appendGalleryEntry(entry);
    return NextResponse.json(entry);
  } catch (err) {
    console.error('Gallery save error:', err);
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}

export async function PUT(req: NextRequest) {
  try {
    const body = await req.json();
    const { id, face_report } = body;
    if (!id || typeof face_report !== 'string') {
      return NextResponse.json({ error: 'Ungültige Parameter: id und face_report erforderlich' }, { status: 400 });
    }

    const gallery = readPrimaryGallery();
    const entry = gallery.find((e) => e.id === id);
    if (!entry) {
      return NextResponse.json({ error: `Eintrag mit ID ${id} nicht gefunden` }, { status: 404 });
    }

    // Update face_report
    if (!entry.analysis) {
      entry.analysis = {};
    }
    entry.analysis.face_report = face_report;

    // Save back to gallery.json
    appendGalleryEntry(entry);

    return NextResponse.json(entry);
  } catch (err) {
    console.error('Gallery update error:', err);
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
