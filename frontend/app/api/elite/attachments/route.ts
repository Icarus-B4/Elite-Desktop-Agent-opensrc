import { NextRequest, NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';
import { getScreenshotsDir, resolveScreenshotFile } from '@/lib/screenshots-path';

export const runtime = 'nodejs';

const PDF_TEXT_MAX = 4000;

const DOCX_MIME = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
const VIDEO_MIME = 'video/mp4';

const ALLOWED = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/gif',
  'application/pdf',
  DOCX_MIME,
  VIDEO_MIME,
]);

const EXT_BY_MIME: Record<string, string> = {
  'image/jpeg': '.jpg',
  'image/png': '.png',
  'image/webp': '.webp',
  'image/gif': '.gif',
  'application/pdf': '.pdf',
  [DOCX_MIME]: '.docx',
  [VIDEO_MIME]: '.mp4',
};

/**
 * POST /api/elite/attachments — PDF/DOCX/MP4 (und optional Bilder) per FormData speichern
 * GET  /api/elite/attachments?file=upload_123.pdf — Datei ausliefern
 */
export async function POST(req: NextRequest) {
  try {
    const form = await req.formData();
    const file = form.get('file');
    if (!file || !(file instanceof Blob)) {
      return NextResponse.json({ error: 'Keine Datei in der Anfrage' }, { status: 400 });
    }

    let mime = file.type || 'application/octet-stream';
    const fileName = (file as File).name || '';
    if (!ALLOWED.has(mime)) {
      const ext = path.extname(fileName).toLowerCase();
      if (ext === '.docx') mime = DOCX_MIME;
      else if (ext === '.mp4') mime = VIDEO_MIME;
      else if (ext === '.pdf') mime = 'application/pdf';
    }

    if (!ALLOWED.has(mime)) {
      return NextResponse.json(
        { error: 'Nur JPG, PNG, WebP, GIF, PDF, DOCX oder MP4 erlaubt' },
        { status: 400 },
      );
    }

    const ext = EXT_BY_MIME[mime] || path.extname(fileName) || '.bin';
    const safeBase = `upload_${Date.now()}`;
    const filename = `${safeBase}${ext}`;
    const dir = getScreenshotsDir();
    const buffer = Buffer.from(await file.arrayBuffer());
    fs.writeFileSync(path.join(dir, filename), buffer);

    const url =
      mime === 'application/pdf' || mime === DOCX_MIME || mime === VIDEO_MIME
        ? `/api/elite/attachments?file=${encodeURIComponent(filename)}`
        : `/api/elite/gallery/image?file=${encodeURIComponent(filename)}`;

    let textPreview: string | undefined;
    if (mime === 'application/pdf') {
      try {
        const pdfParse = (await import('pdf-parse')).default;
        const parsed = await pdfParse(buffer);
        const raw = (parsed.text || '').replace(/\s+/g, ' ').trim();
        if (raw) textPreview = raw.slice(0, PDF_TEXT_MAX);
      } catch (e) {
        console.warn('PDF text extraction failed:', e);
      }
    } else if (mime === DOCX_MIME) {
      try {
        const mammoth = await import('mammoth');
        const parsed = await mammoth.extractRawText({ buffer });
        const raw = (parsed.value || '').replace(/\s+/g, ' ').trim();
        if (raw) textPreview = raw.slice(0, PDF_TEXT_MAX);
      } catch (e) {
        console.warn('DOCX text extraction failed:', e);
      }
    }

    return NextResponse.json({
      name: fileName || filename,
      filename,
      mime,
      url,
      size: buffer.length,
      textPreview,
    });
  } catch (err) {
    console.error('Attachment upload error:', err);
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}

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
      ext === '.pdf'
        ? 'application/pdf'
        : ext === '.docx'
          ? DOCX_MIME
          : ext === '.mp4'
            ? VIDEO_MIME
            : ext === '.png'
              ? 'image/png'
              : ext === '.webp'
                ? 'image/webp'
                : ext === '.gif'
                  ? 'image/gif'
                  : 'image/jpeg';

    const fileBuffer = fs.readFileSync(filePath);
    return new NextResponse(fileBuffer, {
      headers: {
        'Content-Type': contentType,
        'Cache-Control': 'public, max-age=86400',
      },
    });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
