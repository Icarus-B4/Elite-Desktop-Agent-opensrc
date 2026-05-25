'use client';

import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { Lightbulb, Power, X, RefreshCw } from 'lucide-react';
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

interface KasaDevice {
  alias?: string;
  host?: string;
  mock?: boolean;
}

export function KasaWidget() {
  const { closeWidget } = useWidgetManager();
  const { layout, getShellClass } = useWidgetFullscreen('kasa');
  const [devices, setDevices] = useState<KasaDevice[]>([]);
  const [busy, setBusy] = useState<string | null>(null);

  const refresh = async (forceScan = false) => {
    const url = forceScan ? '/api/elite/ada/kasa?scan=true' : '/api/elite/ada/kasa';
    const res = await fetch(url);
    const data = await res.json();
    setDevices(data.devices || []);
  };

  useEffect(() => {
    refresh(false);
  }, []);

  const control = async (host: string, action: string) => {
    setBusy(host);
    await fetch('/api/elite/ada/kasa', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ host, action }),
    });
    setBusy(null);
  };

  return (
    <motion.div
      key="kasa"
      layout={layout}
      initial={{ opacity: 0, scale: 0.95, y: 10 }}
      animate={{ opacity: 1, scale: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.95, y: 10 }}
      className={getShellClass(`${WIDGET_PANEL_CLASS} min-h-[280px]`)}
    >
      <div className={WIDGET_HEADER_CLASS}>
        <div className="flex items-center gap-2">
          <Lightbulb className="size-4 text-yellow-400" />
          <span className={WIDGET_TITLE_CLASS}>Kasa Smart Home</span>
        </div>
        <div className="flex items-center gap-1">
          <button type="button" onClick={() => refresh(true)} className="p-1.5 rounded-lg hover:bg-white/10" title="Netzwerk-Scan starten">
            <RefreshCw className="size-3.5 text-white/50" />
          </button>
          <WidgetPopOutButton widgetId="kasa" />
          <WidgetFullscreenButton widgetId="kasa" />
          <button type="button" onClick={() => closeWidget('kasa')} className="p-1.5 rounded-lg hover:bg-white/10">
            <X className="size-3.5 text-white/50" />
          </button>
        </div>
      </div>
      <div className={`${WIDGET_BODY_CLASS} p-3 space-y-2`}>
        {devices.length === 0 ? (
          <p className="text-xs text-white/40">Keine Geräte – Mock bis Kasa-Hardware da.</p>
        ) : (
          devices.map((d) => (
            <div key={d.host} className={`${WIDGET_LIST_ROW_CLASS} justify-between`}>
              <div className="flex items-center gap-2 min-w-0">
                <Lightbulb className="size-3.5 text-yellow-300 shrink-0" />
                <div className="min-w-0">
                  <p className="text-[11px] text-white/85 truncate">{d.alias}</p>
                  <p className="text-[9px] font-mono text-white/40">{d.host}{d.mock ? ' · mock' : ''}</p>
                </div>
              </div>
              <div className="flex gap-1 shrink-0">
                <button
                  type="button"
                  disabled={busy === d.host}
                  onClick={() => d.host && control(d.host, 'on')}
                  className="p-1.5 rounded-lg bg-emerald-500/15 hover:bg-emerald-500/25"
                >
                  <Power className="size-3 text-emerald-300" />
                </button>
                <button
                  type="button"
                  disabled={busy === d.host}
                  onClick={() => d.host && control(d.host, 'off')}
                  className="p-1.5 rounded-lg bg-red-500/15 hover:bg-red-500/25"
                >
                  <Power className="size-3 text-red-300 rotate-180" />
                </button>
              </div>
            </div>
          ))
        )}
      </div>
    </motion.div>
  );
}
