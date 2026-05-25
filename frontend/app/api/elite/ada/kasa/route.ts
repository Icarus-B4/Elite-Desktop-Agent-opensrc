import { NextRequest, NextResponse } from 'next/server';
import { backendDir, runPython } from '@/lib/elite-python';

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const doScan = searchParams.get('scan') === 'true';

  const code = `
import json, sys, asyncio
sys.path.insert(0, ${JSON.stringify(backendDir())})
from kasa_service import discover_devices, get_kasa_devices
async def main():
    if ${doScan ? 'True' : 'False'}:
        devices = await discover_devices()
    else:
        devices = get_kasa_devices()
    print(json.dumps({"devices": devices}))
asyncio.run(main())
`;
  try {
    return NextResponse.json(JSON.parse(await runPython(code)));
  } catch (e) {
    return NextResponse.json({ devices: [], error: String(e) });
  }
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  const code = `
import json, sys, asyncio
sys.path.insert(0, ${JSON.stringify(backendDir())})
from kasa_service import control_device
body = json.loads(sys.stdin.read())
async def main():
    result = await control_device(body.get("host",""), body.get("action","toggle"), brightness=body.get("brightness"))
    print(json.dumps(result))
asyncio.run(main())
`;
  try {
    return NextResponse.json(JSON.parse(await runPython(code, JSON.stringify(body))));
  } catch (e) {
    return NextResponse.json({ success: false, message: String(e) }, { status: 500 });
  }
}
