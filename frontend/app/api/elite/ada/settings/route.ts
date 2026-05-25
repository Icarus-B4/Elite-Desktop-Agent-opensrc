import { NextRequest, NextResponse } from 'next/server';
import { backendDir, runPython } from '@/lib/elite-python';

export async function GET() {
  const code = `
import json, sys
sys.path.insert(0, ${JSON.stringify(backendDir())})
from elite_settings import load_elite_settings
print(json.dumps(load_elite_settings()))
`;
  try {
    return NextResponse.json(JSON.parse(await runPython(code)));
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  const code = `
import json, sys
sys.path.insert(0, ${JSON.stringify(backendDir())})
from elite_settings import save_elite_settings
updates = json.loads(sys.stdin.read())
print(json.dumps(save_elite_settings(updates)))
`;
  try {
    return NextResponse.json(JSON.parse(await runPython(code, JSON.stringify(body))));
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
