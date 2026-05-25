'use client';

import { useCallback, useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ShieldCheck, ShieldX } from 'lucide-react';
import { useLocalParticipant, useDataChannel } from '@livekit/components-react';

interface PendingConfirm {
  id: string;
  tool: string;
  summary: string;
}

export function ToolConfirmationModal() {
  const { localParticipant } = useLocalParticipant();
  const [pending, setPending] = useState<PendingConfirm | null>(null);

  useDataChannel((packet) => {
    try {
      const data = JSON.parse(new TextDecoder().decode(packet.payload));
      if (data.type === 'tool_confirmation_request') {
        setPending({
          id: String(data.id),
          tool: String(data.tool || ''),
          summary: String(data.summary || ''),
        });
      }
    } catch {
      /* ignore */
    }
  });

  const respond = useCallback(
    (approved: boolean) => {
      if (!pending || !localParticipant) return;
      const payload = JSON.stringify({
        type: 'tool_confirmation_response',
        id: pending.id,
        approved,
      });
      localParticipant.publishData(new TextEncoder().encode(payload));
      setPending(null);
    },
    [pending, localParticipant],
  );

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!pending) return;
      if (e.key === 'Enter') respond(true);
      if (e.key === 'Escape') respond(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [pending, respond]);

  return (
    <AnimatePresence>
      {pending && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-[10050] flex items-center justify-center bg-black/60 backdrop-blur-sm pointer-events-auto"
        >
          <motion.div
            initial={{ scale: 0.92, y: 12 }}
            animate={{ scale: 1, y: 0 }}
            exit={{ scale: 0.92, y: 12 }}
            className="w-full max-w-md mx-4 rounded-2xl hud-widget-panel border border-amber-500/30 p-5 shadow-2xl"
          >
            <p className="text-[10px] font-black uppercase tracking-[0.2em] text-amber-400 mb-2">
              Tool-Bestätigung
            </p>
            <p className="text-sm text-white/90 font-mono mb-1">{pending.tool}</p>
            <p className="text-xs text-white/60 mb-5 leading-relaxed">{pending.summary}</p>
            <div className="flex gap-3 justify-end">
              <button
                type="button"
                onClick={() => respond(false)}
                className="flex items-center gap-2 px-4 py-2 rounded-xl bg-white/5 hover:bg-red-500/20 text-red-300 text-xs font-bold uppercase tracking-wider"
              >
                <ShieldX className="size-4" />
                Ablehnen
              </button>
              <button
                type="button"
                onClick={() => respond(true)}
                className="flex items-center gap-2 px-4 py-2 rounded-xl bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-300 text-xs font-bold uppercase tracking-wider"
              >
                <ShieldCheck className="size-4" />
                Erlauben
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
