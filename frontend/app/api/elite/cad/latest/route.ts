import { NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';

const getWritablePath = (rel: string) => {
  const base = process.env.LOCALAPPDATA || process.env.APPDATA;
  if (!base) return path.join(process.cwd(), '..', rel);
  return path.join(base, 'EliteDesktopAgent', rel);
};

function findLatestStl(dir: string): { path: string; mtime: number } | null {
  if (!fs.existsSync(dir)) return null;
  let best: { path: string; mtime: number } | null = null;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      const nested = findLatestStl(full);
      if (nested && (!best || nested.mtime > best.mtime)) best = nested;
    } else if (entry.isFile() && entry.name.toLowerCase().endsWith('.stl')) {
      const stat = fs.statSync(full);
      if (!best || stat.mtimeMs > best.mtime) {
        best = { path: full, mtime: stat.mtimeMs };
      }
    }
  }
  return best;
}

export async function GET() {
  const projectsRoot = getWritablePath('projects');
  const latest = findLatestStl(projectsRoot);
  if (!latest) {
    return NextResponse.json({ stlPath: null, prompt: null });
  }
  return NextResponse.json({
    stlPath: latest.path,
    prompt: path.basename(latest.path, '.stl'),
    updatedAt: latest.mtime,
  });
}
