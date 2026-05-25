import { NextRequest, NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';
import { resolveScreenshotFile } from '@/lib/screenshots-path';

/**
 * GET /api/elite/gallery/image?file=webcam_123.jpg
 * Serves a physical image from the screenshots directory.
 */
export async function GET(req: NextRequest) {
  try {
    const fileName = new URL(req.url).searchParams.get('file');
    if (!fileName) {
      return NextResponse.json({ error: 'Missing file parameter' }, { status: 400 });
    }

    const filePath = resolveScreenshotFile(fileName);
    if (!filePath) {
      return NextResponse.json({ error: 'File not found' }, { status: 404 });
    }

    const ext = path.extname(filePath).toLowerCase();
    const contentType =
      ext === '.png' ? 'image/png' : ext === '.webp' ? 'image/webp' : 'image/jpeg';

    const fileBuffer = fs.readFileSync(filePath);
    return new NextResponse(fileBuffer, {
      headers: {
        'Content-Type': contentType,
        'Cache-Control': 'public, max-age=31536000, immutable',
      },
    });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
