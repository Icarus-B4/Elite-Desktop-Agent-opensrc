import { NextRequest, NextResponse } from 'next/server';
import fs from 'fs/promises';
import path from 'path';
import { fuzzyScore } from '@/lib/file-explorer-utils';

const PROJECT_ROOT = path.resolve(process.cwd(), '..');
const MAX_READ_BYTES = 512_000;
const SEARCH_MAX = 80;
const TEXT_EXT = new Set([
  'ts', 'tsx', 'js', 'jsx', 'mjs', 'json', 'md', 'txt', 'py', 'rs', 'go',
  'css', 'scss', 'html', 'htm', 'svg', 'yaml', 'yml', 'toml', 'sh', 'bat',
  'ps1', 'sql', 'env', 'gitignore', 'dockerfile', 'xml', 'csv', 'log',
]);

function resolveSafePath(relativePath: string): string {
  const normalized = (relativePath || '.').replace(/\\/g, '/').replace(/^\/+/, '');
  const resolved = path.resolve(PROJECT_ROOT, normalized);
  const rootWithSep = PROJECT_ROOT.endsWith(path.sep) ? PROJECT_ROOT : PROJECT_ROOT + path.sep;
  if (resolved !== PROJECT_ROOT && !resolved.startsWith(rootWithSep)) {
    throw new Error('Ungültiger Pfad');
  }
  return resolved;
}

function toRelative(abs: string): string {
  const rel = path.relative(PROJECT_ROOT, abs);
  return rel === '' ? '.' : rel.replace(/\\/g, '/');
}

async function listDir(relativePath: string) {
  const abs = resolveSafePath(relativePath);
  const stat = await fs.stat(abs);
  if (!stat.isDirectory()) {
    return NextResponse.json({ success: false, error: 'Kein Verzeichnis' }, { status: 400 });
  }
  const names = await fs.readdir(abs, { withFileTypes: true });
  const entries = await Promise.all(
    names
      .filter((d) => !d.name.startsWith('.') || d.name === '.env.example')
      .map(async (d) => {
        const childAbs = path.join(abs, d.name);
        const childRel = toRelative(childAbs);
        try {
          const s = await fs.stat(childAbs);
          return {
            name: d.name,
            path: childRel,
            isDirectory: s.isDirectory(),
            size: s.isFile() ? s.size : undefined,
            modified: s.mtime.toISOString(),
          };
        } catch {
          return {
            name: d.name,
            path: childRel,
            isDirectory: d.isDirectory(),
          };
        }
      }),
  );
  entries.sort((a, b) => {
    if (a.isDirectory !== b.isDirectory) return a.isDirectory ? -1 : 1;
    return a.name.localeCompare(b.name, undefined, { sensitivity: 'base' });
  });
  return NextResponse.json({
    success: true,
    root: toRelative(PROJECT_ROOT),
    path: relativePath === '.' ? '.' : relativePath.replace(/\\/g, '/'),
    entries,
  });
}

async function readFile(relativePath: string) {
  const abs = resolveSafePath(relativePath);
  const stat = await fs.stat(abs);
  if (stat.isDirectory()) {
    return NextResponse.json({ success: false, error: 'Ist ein Ordner' }, { status: 400 });
  }
  if (stat.size > MAX_READ_BYTES) {
    return NextResponse.json({
      success: false,
      error: `Datei zu groß (max ${MAX_READ_BYTES / 1024} KB)`,
    }, { status: 413 });
  }
  const ext = path.extname(abs).slice(1).toLowerCase();
  const base = path.basename(abs).toLowerCase();
  const isText =
    TEXT_EXT.has(ext) ||
    base === 'dockerfile' ||
    base.startsWith('.env') ||
    !ext;
  if (!isText) {
    return NextResponse.json({
      success: true,
      path: relativePath,
      binary: true,
      content: null,
      size: stat.size,
    });
  }
  const content = await fs.readFile(abs, 'utf8');
  return NextResponse.json({
    success: true,
    path: relativePath,
    binary: false,
    content,
    size: stat.size,
  });
}

async function searchFiles(query: string) {
  const results: Array<{ name: string; path: string; isDirectory: boolean; score: number }> = [];

  async function walk(dirRel: string, depth: number) {
    if (results.length >= SEARCH_MAX || depth > 8) return;
    let abs: string;
    try {
      abs = resolveSafePath(dirRel);
    } catch {
      return;
    }
    let entries;
    try {
      entries = await fs.readdir(abs, { withFileTypes: true });
    } catch {
      return;
    }
    for (const ent of entries) {
      if (results.length >= SEARCH_MAX) break;
      if (ent.name.startsWith('.') && ent.name !== '.env.example') continue;
      if (['node_modules', '.git', '.next', 'target', 'dist', 'build', '__pycache__'].includes(ent.name)) {
        continue;
      }
      const childRel = dirRel === '.' ? ent.name : `${dirRel}/${ent.name}`;
      const score = fuzzyScore(query, childRel) ?? fuzzyScore(query, ent.name);
      if (score != null) {
        results.push({
          name: ent.name,
          path: childRel.replace(/\\/g, '/'),
          isDirectory: ent.isDirectory(),
          score,
        });
      }
      if (ent.isDirectory()) {
        await walk(childRel, depth + 1);
      }
    }
  }

  await walk('.', 0);
  results.sort((a, b) => b.score - a.score);
  return NextResponse.json({
    success: true,
    query,
    entries: results.slice(0, SEARCH_MAX).map(({ score: _s, ...e }) => e),
  });
}

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const action = searchParams.get('action') || 'list';
    const filePath = searchParams.get('path') || '.';

    if (action === 'read') {
      return readFile(filePath);
    }
    if (action === 'search') {
      const q = searchParams.get('q') || '';
      if (!q.trim()) {
        return NextResponse.json({ success: true, query: q, entries: [] });
      }
      return searchFiles(q);
    }
    return listDir(filePath);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ success: false, error: message }, { status: 400 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const action = body.action as string;

    if (action === 'rename') {
      const from = resolveSafePath(body.from);
      const to = resolveSafePath(body.to);
      await fs.rename(from, to);
      return NextResponse.json({ success: true, path: toRelative(to) });
    }

    if (action === 'mkdir') {
      const abs = resolveSafePath(body.path);
      await fs.mkdir(abs, { recursive: !!body.recursive });
      return NextResponse.json({ success: true, path: toRelative(abs) });
    }

    if (action === 'delete') {
      const abs = resolveSafePath(body.path);
      const stat = await fs.stat(abs);
      if (stat.isDirectory()) {
        await fs.rm(abs, { recursive: true });
      } else {
        await fs.unlink(abs);
      }
      return NextResponse.json({ success: true });
    }

    if (action === 'touch') {
      const abs = resolveSafePath(body.path);
      await fs.mkdir(path.dirname(abs), { recursive: true });
      await fs.writeFile(abs, body.content ?? '', 'utf8');
      return NextResponse.json({ success: true, path: toRelative(abs) });
    }

    return NextResponse.json({ success: false, error: 'Unbekannte Aktion' }, { status: 400 });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ success: false, error: message }, { status: 400 });
  }
}
