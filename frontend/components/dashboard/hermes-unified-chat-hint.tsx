'use client';

import { MessageSquare, Sparkles } from 'lucide-react';
import { UNIFIED_CHAT_PLACEHOLDER } from '@/lib/unified-chat-router';

type Props = {
  gatewayReady: boolean;
};

/** Hermes-Widget: kein zweites Eingabefeld — verweist auf Unified Chat unten. */
export function HermesUnifiedChatHint({ gatewayReady }: Props) {
  return (
    <div className="flex flex-col flex-1 min-h-0 justify-center gap-4 px-2 py-4">
      <div className="flex flex-col items-center text-center gap-3">
        <div className="p-3 rounded-2xl bg-violet-500/10 ring-1 ring-violet-400/20">
          <Sparkles className="size-6 text-violet-400" />
        </div>
        <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-violet-300/90">
          Ein Chat für Elite &amp; Hermes
        </p>
        <p className="text-[11px] text-white/50 leading-relaxed max-w-[280px]">
          Nutze das Eingabefeld unten im HUD. Für Hermes beginne mit{' '}
          <code className="text-violet-300">@hermes</code> — sonst geht der Befehl an Elite Core.
        </p>
      </div>

      <div className="rounded-xl bg-black/40 ring-1 ring-white/10 p-3 space-y-2">
        <div className="flex items-start gap-2 text-[10px] text-white/45">
          <MessageSquare className="size-3.5 shrink-0 mt-0.5 text-primary" />
          <span>
            <strong className="text-white/70">Elite:</strong> öffne Chrome, Wetter, Desktop…
          </span>
        </div>
        <div className="flex items-start gap-2 text-[10px] text-white/45">
          <MessageSquare className="size-3.5 shrink-0 mt-0.5 text-violet-400" />
          <span>
            <strong className="text-white/70">Hermes:</strong> @hermes Öffne webstark.org und
            erstelle ein PDF
          </span>
        </div>
      </div>

      <p className="text-[9px] text-center text-white/30">
        {gatewayReady
          ? 'Gateway bereit (8642) — @hermes antwortet direkt mit Streaming.'
          : 'Gateway offline — START_JARVIS.bat oder hermes gateway run'}
      </p>
      <p className="text-[8px] text-center text-white/20">{UNIFIED_CHAT_PLACEHOLDER}</p>
    </div>
  );
}
