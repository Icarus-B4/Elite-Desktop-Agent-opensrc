'use client';

import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { Globe, X } from 'lucide-react';
import { useWidgetManager } from './widget-manager';
import {
  useWidgetFullscreen,
  WidgetFullscreenButton,
  WidgetPopOutButton,
  WIDGET_PANEL_CLASS,
  WIDGET_HEADER_CLASS,
  WIDGET_BODY_CLASS,
  WIDGET_TITLE_CLASS,
  WIDGET_SCROLL_CLASS,
} from './widget-shell';

interface AgentTurn {
  turn?: number;
  url?: string;
  summary?: string;
  screenshot_b64?: string;
}

export function BrowserAgentWidget() {
  const { closeWidget } = useWidgetManager();
  const { layout, getShellClass } = useWidgetFullscreen('browserAgent');
  const [turns, setTurns] = useState<AgentTurn[]>([]);

  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent<AgentTurn>).detail;
      if (detail) setTurns((prev) => [...prev, detail]);
    };
    window.addEventListener('elite-web-agent-turn', handler);
    return () => window.removeEventListener('elite-web-agent-turn', handler);
  }, []);

  const latest = turns[turns.length - 1];

  return (
    <motion.div
      key="browserAgent"
      layout={layout}
      initial={{ opacity: 0, scale: 0.95, y: 10 }}
      animate={{ opacity: 1, scale: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.95, y: 10 }}
      className={getShellClass(`${WIDGET_PANEL_CLASS} min-h-[360px]`)}
    >
      <div className={WIDGET_HEADER_CLASS}>
        <div className="flex items-center gap-2">
          <Globe className="size-4 text-sky-400" />
          <span className={WIDGET_TITLE_CLASS}>Web Agent</span>
        </div>
        <div className="flex items-center gap-1">
          <WidgetPopOutButton widgetId="browserAgent" />
          <WidgetFullscreenButton widgetId="browserAgent" />
          <button type="button" onClick={() => closeWidget('browserAgent')} className="p-1.5 rounded-lg hover:bg-white/10">
            <X className="size-3.5 text-white/50" />
          </button>
        </div>
      </div>
      <div className={`${WIDGET_BODY_CLASS} flex flex-col min-h-[280px]`}>
        <div className="flex-1 bg-black/30 p-2 min-h-[160px] flex items-center justify-center">
          {latest?.screenshot_b64 ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={`data:image/png;base64,${latest.screenshot_b64}`}
              alt="Agent screenshot"
              className="max-h-full max-w-full rounded-lg border border-white/10 object-contain"
            />
          ) : (
            <p className="text-xs text-white/35 px-4 text-center">Live-Screenshots erscheinen während run_web_agent.</p>
          )}
        </div>
        <div className={`${WIDGET_SCROLL_CLASS} max-h-32 p-3 space-y-2 border-t border-white/5`}>
          {turns.length === 0 ? (
            <p className="text-[10px] text-white/40">Noch keine Agent-Turns.</p>
          ) : (
            turns.map((t, i) => (
              <div key={i} className="text-[10px] font-mono text-white/65">
                <span className="text-sky-400/80">#{t.turn ?? i + 1}</span>{' '}
                {t.summary?.slice(0, 120) || t.url}
              </div>
            ))
          )}
        </div>
      </div>
    </motion.div>
  );
}
