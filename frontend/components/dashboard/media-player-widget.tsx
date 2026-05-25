'use client';

import { useRef, useEffect } from 'react';
import { motion } from 'framer-motion';
import { Play, X } from 'lucide-react';
import { useWidgetManager } from './widget-manager';
import {
  useWidgetFullscreen,
  WidgetFullscreenButton,
  WidgetPopOutButton,
  WIDGET_PANEL_CLASS,
  WIDGET_HEADER_CLASS,
  WIDGET_BODY_CLASS,
  WIDGET_TITLE_CLASS,
} from './widget-shell';

export function MediaPlayerWidget() {
  const { closeWidget, mediaPlayerUrl, mediaPlayerName } = useWidgetManager();
  const { layout, getShellClass } = useWidgetFullscreen('mediaPlayer');
  const videoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    const el = videoRef.current;
    if (!el || !mediaPlayerUrl) return;
    el.load();
    void el.play().catch(() => {
      /* Autoplay blockiert – User startet manuell */
    });
  }, [mediaPlayerUrl]);

  return (
    <motion.div
      key="mediaPlayer"
      layout={layout}
      initial={{ opacity: 0, scale: 0.97, y: 8 }}
      animate={{ opacity: 1, scale: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.97, y: 8 }}
      transition={{ type: 'spring', stiffness: 300, damping: 28 }}
      className={getShellClass(`flex flex-col ${WIDGET_PANEL_CLASS} min-h-[240px]`)}
    >
      <div className={WIDGET_HEADER_CLASS}>
        <div className="flex items-center gap-2 min-w-0">
          <Play className="size-3.5 text-violet-400 shrink-0" />
          <span className={`${WIDGET_TITLE_CLASS} truncate`}>Media Player</span>
          {mediaPlayerName && (
            <span className="text-[9px] text-white/25 truncate hidden sm:inline">
              · {mediaPlayerName}
            </span>
          )}
        </div>
        <div className="flex items-center gap-1">
          <WidgetPopOutButton widgetId="mediaPlayer" iconClassName="size-3" />
          <WidgetFullscreenButton widgetId="mediaPlayer" iconClassName="size-3" />
          <button
            type="button"
            onClick={() => closeWidget('mediaPlayer')}
            className="p-1.5 rounded-lg hover:bg-white/5 text-white/40 hover:text-red-400 transition-all"
            title="Schließen"
          >
            <X className="size-3.5" />
          </button>
        </div>
      </div>

      <div className={`${WIDGET_BODY_CLASS} flex items-center justify-center p-3`}>
        {mediaPlayerUrl ? (
          <video
            ref={videoRef}
            src={mediaPlayerUrl}
            controls
            playsInline
            className="w-full max-h-[min(60vh,480px)] rounded-xl bg-black ring-1 ring-white/10"
          />
        ) : (
          <p className="text-[11px] text-white/30 uppercase tracking-widest">
            Kein Video geladen
          </p>
        )}
      </div>
    </motion.div>
  );
}
