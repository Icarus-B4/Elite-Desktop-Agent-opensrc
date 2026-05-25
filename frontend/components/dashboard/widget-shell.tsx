'use client';

import { Maximize2, Minimize2, PictureInPicture2 } from 'lucide-react';
import { useWidgetManager, type WidgetId } from './widget-manager';
import { useIsElectron } from '@/hooks/use-is-electron';
import { POPOUTABLE_WIDGETS } from '@/lib/widget-sync';

/** Vollbild – deckend */
export const WIDGET_FULLSCREEN_CLASS =
  'flex flex-col rounded-2xl hud-widget-panel backdrop-blur-md shadow-[0_0_80px_rgba(0,0,0,0.92)] h-full w-full max-w-none min-h-0 overflow-hidden';

export const WIDGET_COMPACT_CLASS =
  'relative flex flex-col w-full min-h-[280px] max-h-[min(70vh,calc(100vh-11rem))]';

/** Panel – Akzent-Ring via CSS (--accent-border), kein weiß */
export const WIDGET_PANEL_CLASS =
  'hud-widget-panel rounded-2xl backdrop-blur-md overflow-hidden shadow-[0_12px_48px_rgba(0,0,0,0.88)]';

export const WIDGET_HEADER_CLASS =
  'hud-widget-header flex items-center justify-between px-4 py-3 shrink-0';

export const WIDGET_BODY_CLASS = 'flex-1 min-h-0 bg-[#040c14]/90';

export const WIDGET_SCROLL_CLASS =
  'overflow-y-auto overscroll-y-contain min-h-0 [scrollbar-width:thin] [scrollbar-color:rgba(var(--accent-color),0.35)_transparent]';

export const WIDGET_INNER_CARD_CLASS = 'hud-inner-surface rounded-xl';

export const WIDGET_STAT_CARD_CLASS =
  'hud-stat-card flex flex-col items-center gap-1 py-2 px-1 rounded-xl';

export const WIDGET_LIST_ROW_CLASS =
  'hud-list-row flex items-center gap-2 px-2.5 py-1.5 rounded-lg';

export const WIDGET_INNER_SURFACE_CLASS = 'hud-inner-surface rounded-xl p-2.5';

export const WIDGET_FOOTER_CLASS =
  'border-t border-[color:var(--accent-border)] bg-[rgba(var(--hud-surface-rgb),0.9)]';

export const WIDGET_TITLE_CLASS =
  'text-[10px] font-black uppercase tracking-[0.2em] text-orange-400';

export const WIDGET_SUBTITLE_CLASS =
  'text-[9px] font-mono text-white/50';

export const WIDGET_LABEL_MUTED_CLASS =
  'text-[8px] font-bold uppercase tracking-widest text-white/45';

export const WIDGET_TEXT_BODY_CLASS = 'text-[11px] text-white/80 leading-relaxed';

/** HUD-Chat – 88 % transparent (alpha 0.12), Akzent-Rand */
export const HUD_CHAT_AGENT_BUBBLE = 'hud-chat-agent';

export const HUD_CHAT_USER_BUBBLE = 'hud-chat-user';

export const HUD_CHAT_HERMES_BUBBLE = 'hud-chat-hermes';

export function useWidgetFullscreen(widgetId: WidgetId) {
  const { fullscreenWidget, toggleFullscreen } = useWidgetManager();
  const isFullscreen = fullscreenWidget === widgetId;

  const getShellClass = (compactClass: string, fullscreenClass = '') =>
    isFullscreen
      ? `${WIDGET_FULLSCREEN_CLASS} ${fullscreenClass}`.trim()
      : `${WIDGET_COMPACT_CLASS} ${compactClass}`.trim();

  return {
    isFullscreen,
    layout: !isFullscreen,
    toggle: () => toggleFullscreen(isFullscreen ? null : widgetId),
    getShellClass,
  };
}

export function WidgetFullscreenButton({
  widgetId,
  className = '',
  iconClassName = 'size-3.5',
}: {
  widgetId: WidgetId;
  className?: string;
  iconClassName?: string;
}) {
  const { fullscreenWidget, toggleFullscreen } = useWidgetManager();
  const isFullscreen = fullscreenWidget === widgetId;

  return (
    <button
      type="button"
      onPointerDown={(e) => e.stopPropagation()}
      onClick={(e) => {
        e.preventDefault();
        e.stopPropagation();
        toggleFullscreen(isFullscreen ? null : widgetId);
      }}
      className={`relative z-10 p-1.5 rounded-lg hover:bg-white/5 text-white/50 hover:text-primary transition-all ${className}`}
      title={isFullscreen ? 'Vollbild beenden' : 'Vollbild'}
      aria-label={isFullscreen ? 'Vollbild beenden' : 'Vollbild'}
    >
      {isFullscreen ? (
        <Minimize2 className={iconClassName} />
      ) : (
        <Maximize2 className={iconClassName} />
      )}
    </button>
  );
}

export function WidgetPopOutButton({
  widgetId,
  className = '',
  iconClassName = 'size-3.5',
}: {
  widgetId: WidgetId;
  className?: string;
  iconClassName?: string;
}) {
  const { popOutWidget } = useWidgetManager();
  const { isElectron, mounted } = useIsElectron();

  if (!mounted || !isElectron || !POPOUTABLE_WIDGETS.has(widgetId)) return null;

  return (
    <button
      type="button"
      onPointerDown={(e) => e.stopPropagation()}
      onClick={(e) => {
        e.preventDefault();
        e.stopPropagation();
        void popOutWidget(widgetId);
      }}
      className={`relative z-10 p-1.5 rounded-lg hover:bg-white/5 text-white/50 hover:text-violet-300 transition-all ${className}`}
      title="Ab trennen (eigenes Fenster)"
      aria-label="Widget abtrennen"
    >
      <PictureInPicture2 className={iconClassName} />
    </button>
  );
}
