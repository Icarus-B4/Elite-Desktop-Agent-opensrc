import { NextResponse } from 'next/server';
import { getHermesGatewayLogPath, tailLogFile } from '@/lib/hermes-server';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const maxLines = Math.min(Number(searchParams.get('lines') ?? 60) || 60, 200);
  const logPath = getHermesGatewayLogPath();
  const lines = tailLogFile(logPath, maxLines);

  return NextResponse.json({
    ok: true,
    path: logPath,
    lines,
  });
}
