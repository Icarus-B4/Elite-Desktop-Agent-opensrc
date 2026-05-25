'use client';

import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { Printer, X, RefreshCw } from 'lucide-react';
import { useWidgetManager } from './widget-manager';
import {
  useWidgetFullscreen,
  WidgetFullscreenButton,
  WidgetPopOutButton,
  WIDGET_PANEL_CLASS,
  WIDGET_HEADER_CLASS,
  WIDGET_BODY_CLASS,
  WIDGET_TITLE_CLASS,
  WIDGET_LIST_ROW_CLASS,
} from './widget-shell';

interface PrinterEntry {
  name?: string;
  host?: string;
  mock?: boolean;
}

export function PrinterWidget() {
  const { closeWidget } = useWidgetManager();
  const { layout, getShellClass } = useWidgetFullscreen('printer');
  const [printers, setPrinters] = useState<PrinterEntry[]>([]);
  const [status, setStatus] = useState<{ state?: string; progress?: number; message?: string }>({});

  const refresh = async () => {
    try {
      const res = await fetch('/api/elite/ada/printers');
      const data = await res.json();
      setPrinters(data.printers || []);
      setStatus(data.status || {});
    } catch {
      setStatus({ message: 'Drucker-API nicht erreichbar.' });
    }
  };

  useEffect(() => {
    refresh();
    const handler = (e: Event) => {
      const detail = (e as CustomEvent).detail;
      if (detail) setStatus(detail);
    };
    window.addEventListener('elite-printer-update', handler);
    return () => window.removeEventListener('elite-printer-update', handler);
  }, []);

  return (
    <motion.div
      key="printer"
      layout={layout}
      initial={{ opacity: 0, scale: 0.95, y: 10 }}
      animate={{ opacity: 1, scale: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.95, y: 10 }}
      className={getShellClass(`${WIDGET_PANEL_CLASS} min-h-[280px]`)}
    >
      <div className={WIDGET_HEADER_CLASS}>
        <div className="flex items-center gap-2">
          <Printer className="size-4 text-violet-400" />
          <span className={WIDGET_TITLE_CLASS}>3D Drucker</span>
        </div>
        <div className="flex items-center gap-1">
          <button type="button" onClick={refresh} className="p-1.5 rounded-lg hover:bg-white/10">
            <RefreshCw className="size-3.5 text-white/50" />
          </button>
          <WidgetPopOutButton widgetId="printer" />
          <WidgetFullscreenButton widgetId="printer" />
          <button type="button" onClick={() => closeWidget('printer')} className="p-1.5 rounded-lg hover:bg-white/10">
            <X className="size-3.5 text-white/50" />
          </button>
        </div>
      </div>
      <div className={`${WIDGET_BODY_CLASS} p-3 space-y-2 overflow-y-auto`}>
        <div className="rounded-xl bg-white/5 p-3">
          <p className="text-[10px] text-white/45 uppercase tracking-wider mb-1">Status</p>
          <p className="text-xs text-white/80">{status.message || status.state || 'Unbekannt'}</p>
          {typeof status.progress === 'number' && (
            <div className="mt-2 h-1.5 rounded-full bg-white/10 overflow-hidden">
              <div className="h-full bg-violet-400" style={{ width: `${status.progress}%` }} />
            </div>
          )}
        </div>
        {printers.length === 0 ? (
          <p className="text-xs text-white/40 px-1">Keine Drucker – Mock bis Hardware konfiguriert.</p>
        ) : (
          printers.map((p) => (
            <div key={p.host} className={WIDGET_LIST_ROW_CLASS}>
              <Printer className="size-3.5 text-violet-300 shrink-0" />
              <div className="min-w-0 flex-1">
                <p className="text-[11px] text-white/85 truncate">{p.name}</p>
                <p className="text-[9px] font-mono text-white/40">{p.host}{p.mock ? ' · mock' : ''}</p>
              </div>
            </div>
          ))
        )}
      </div>
    </motion.div>
  );
}
