import { NextResponse } from 'next/server';
import { backendDir, runPython } from '@/lib/elite-python';

export async function GET() {
  const code = `
import json, sys, asyncio
sys.path.insert(0, ${JSON.stringify(backendDir())})
from printer_service import discover_printers, get_print_status
async def main():
    printers = discover_printers()
    status = await get_print_status()
    print(json.dumps({"printers": printers, "status": status}))
asyncio.run(main())
`;
  try {
    return NextResponse.json(JSON.parse(await runPython(code)));
  } catch (e) {
    return NextResponse.json({ printers: [], status: { message: String(e) } });
  }
}
