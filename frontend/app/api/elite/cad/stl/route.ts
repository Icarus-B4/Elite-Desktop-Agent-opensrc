import { NextRequest, NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';

const getWritablePath = (rel: string) => {
  const base = process.env.LOCALAPPDATA || process.env.APPDATA;
  if (!base) return path.join(process.cwd(), '..', rel);
  return path.join(base, 'EliteDesktopAgent', rel);
};

export async function GET(req: NextRequest) {
  const filePath = req.nextUrl.searchParams.get('path') || '';
  if (!filePath) {
    return NextResponse.json({ error: 'path required' }, { status: 400 });
  }

  const projectsRoot = path.resolve(getWritablePath('projects'));
  const appRoot = path.resolve(getWritablePath(''));
  const resolved = path.resolve(filePath);
  const within = (root: string) =>
    process.platform === 'win32'
      ? resolved.toLowerCase().startsWith(root.toLowerCase())
      : resolved.startsWith(root);
  if (!within(projectsRoot) && !within(appRoot)) {
    return NextResponse.json({ error: 'Forbidden path' }, { status: 403 });
  }
  if (!fs.existsSync(resolved)) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  const buf = fs.readFileSync(resolved);
  return new NextResponse(buf, {
    headers: {
      'Content-Type': 'model/stl',
      'Content-Disposition': `inline; filename="${path.basename(resolved)}"`,
    },
  });
}
