import { NextRequest, NextResponse } from 'next/server';
import { backendDir, runPython } from '@/lib/elite-python';

export async function GET() {
  const code = `
import json, sys
sys.path.insert(0, ${JSON.stringify(backendDir())})
import face_auth_service as f
print(json.dumps(f.get_auth_status()))
`;
  try {
    return NextResponse.json(JSON.parse(await runPython(code)));
  } catch (e) {
    return NextResponse.json({ enabled: false, authenticated: true, error: String(e) });
  }
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  const code = `
import json, sys, base64
sys.path.insert(0, ${JSON.stringify(backendDir())})
import face_auth_service as f
body = json.loads(sys.stdin.read())
action = body.get("action")
image = body.get("image", "")
if action == "enroll":
    raw = image.split(",", 1)[-1]
    ok, msg = f.save_reference_image(base64.b64decode(raw))
    print(json.dumps({"success": ok, "authenticated": ok, "message": msg}))
elif action == "set_authenticated":
    auth = body.get("authenticated", True)
    f.set_auth_state(auth, 1.0)
    print(json.dumps({"success": True, "authenticated": auth, "message": "Auth-Status gesetzt."}))
else:
    print(json.dumps(f.verify_frame(image)))
`;
  try {
    return NextResponse.json(JSON.parse(await runPython(code, JSON.stringify(body))));
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
