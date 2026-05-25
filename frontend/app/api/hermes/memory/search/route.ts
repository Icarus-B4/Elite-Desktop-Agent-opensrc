import { NextResponse } from 'next/server';
import { execFile } from 'child_process';
import { promisify } from 'util';
import path from 'path';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

const execFileAsync = promisify(execFile);

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const query = (searchParams.get('q') ?? '').trim();
  const limit = Math.min(Number(searchParams.get('limit') ?? 20) || 20, 50);

  if (!query) {
    return NextResponse.json({ ok: false, error: 'missing_query', results: [] }, { status: 400 });
  }

  const script = path.join(process.cwd(), '..', 'scripts', 'hermes_session_search.py');
  try {
    const { stdout } = await execFileAsync(
      process.env.PYTHON ?? 'python',
      [script, query, '--limit', String(limit)],
      { timeout: 8000, cwd: path.join(process.cwd(), '..') },
    );
    const data = JSON.parse(stdout.trim());
    return NextResponse.json(data);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'search_failed';
    return NextResponse.json({ ok: false, error: message, results: [] }, { status: 503 });
  }
}
