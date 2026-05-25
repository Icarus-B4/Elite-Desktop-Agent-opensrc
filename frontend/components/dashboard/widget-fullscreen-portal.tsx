'use client';

import { useEffect, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { useWidgetManager, type WidgetId } from './widget-manager';

/**
 * Renders the active fullscreen widget above all HUD chrome (drag bar, toolbar).
 * Must be used inside WidgetManagerProvider.
 */
export function WidgetFullscreenPortal({ children }: { children: (widgetId: WidgetId) => ReactNode }) {
  const { fullscreenWidget, widgets, toggleFullscreen } = useWidgetManager();
  const [mounted, setMounted] = useState(false);

  useEffect(() => setMounted(true), []);

  if (!mounted || !fullscreenWidget || !widgets[fullscreenWidget]) return null;

  return createPortal(
    <>
      <button
        type="button"
        className="fixed inset-0 z-[20000] bg-black/55 border-0 p-0 cursor-default"
        aria-label="Vollbild beenden"
        onClick={() => toggleFullscreen(null)}
      />
      <div
        className={`fixed z-[20001] flex items-stretch justify-center pointer-events-none ${
          fullscreenWidget === 'webcam' ? 'inset-0' : 'inset-4'
        }`}
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="pointer-events-auto h-full w-full max-w-6xl mx-auto min-h-0 flex flex-col">
          {children(fullscreenWidget)}
        </div>
      </div>
    </>,
    document.body,
  );
}
