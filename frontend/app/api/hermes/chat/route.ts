import { NextResponse } from 'next/server';
import { forwardHermesChat, type HermesChatMessage } from '@/lib/hermes-gateway';
import { probeHermesUrl, HERMES_GATEWAY_URL } from '@/lib/hermes-server';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

type ChatRequestBody = {
  messages?: HermesChatMessage[];
  stream?: boolean;
  sessionId?: string | null;
};

function extractAssistantText(data: {
  choices?: Array<{ message?: { content?: string | unknown } }>;
}): string {
  const content = data.choices?.[0]?.message?.content;
  if (typeof content === 'string') return content;
  if (Array.isArray(content)) {
    return content
      .map((block) =>
        typeof block === 'object' && block && 'text' in block
          ? String((block as { text?: string }).text ?? '')
          : '',
      )
      .join('');
  }
  return '';
}

export async function GET() {
  const ready = await probeHermesUrl(`${HERMES_GATEWAY_URL}/v1/models`);
  return NextResponse.json({
    ok: ready,
    gatewayUrl: HERMES_GATEWAY_URL,
    model: process.env.HERMES_MODEL_NAME ?? 'hermes-agent',
  });
}

export async function POST(request: Request) {
  const gatewayOk = await probeHermesUrl(`${HERMES_GATEWAY_URL}/v1/models`, 2500);
  if (!gatewayOk) {
    return NextResponse.json(
      {
        error: 'hermes_gateway_offline',
        message:
          'Hermes Gateway nicht erreichbar (Port 8642). START_JARVIS.bat oder: hermes gateway run',
      },
      { status: 503 },
    );
  }

  let body: ChatRequestBody;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'invalid_json' }, { status: 400 });
  }

  const messages = body.messages ?? [];
  if (!Array.isArray(messages) || messages.length === 0) {
    return NextResponse.json({ error: 'missing_messages' }, { status: 400 });
  }

  const stream = Boolean(body.stream);
  const sessionId = body.sessionId ?? null;

  let upstream: Response;
  try {
    upstream = await forwardHermesChat(messages, { stream, sessionId });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'upstream_failed';
    return NextResponse.json({ error: message }, { status: 502 });
  }

  if (!upstream.ok) {
    const errText = await upstream.text();
    return NextResponse.json(
      { error: 'hermes_error', status: upstream.status, detail: errText.slice(0, 800) },
      { status: upstream.status >= 500 ? 502 : upstream.status },
    );
  }

  if (stream && upstream.body) {
    return new Response(upstream.body, {
      status: 200,
      headers: {
        'Content-Type': 'text/event-stream; charset=utf-8',
        'Cache-Control': 'no-cache, no-transform',
        Connection: 'keep-alive',
        ...(upstream.headers.get('x-hermes-session-id')
          ? { 'X-Hermes-Session-Id': upstream.headers.get('x-hermes-session-id')! }
          : {}),
      },
    });
  }

  const data = await upstream.json();
  const content = extractAssistantText(data);
  const newSession =
    upstream.headers.get('x-hermes-session-id') ||
    upstream.headers.get('X-Hermes-Session-Id') ||
    sessionId;

  return NextResponse.json({
    ok: true,
    content,
    sessionId: newSession,
    model: data.model,
    usage: data.usage,
  });
}
