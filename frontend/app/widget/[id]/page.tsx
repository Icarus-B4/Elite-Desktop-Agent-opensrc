'use client';

import { useEffect, useRef, useState } from 'react';
import { useParams } from 'next/navigation';
import { WidgetManagerProvider, useWidgetManager, WidgetId } from '@/components/dashboard/widget-manager';
import { WebcamWidget } from '@/components/dashboard/webcam-widget';
import { ImageGridWidget } from '@/components/dashboard/image-grid-widget';
import { SystemMonitorWidget } from '@/components/dashboard/system-monitor-widget';
import { MusicWidget } from '@/components/dashboard/music-widget';
import { LogStreamWidget } from '@/components/dashboard/log-stream-widget';
import { TextEditorWidget } from '@/components/dashboard/text-editor-widget';
import { MissionControlWidget } from '@/components/dashboard/mission-control-widget';
import { CommandListWidget } from '@/components/dashboard/command-list-widget';
import { PaiPulseWidget } from '@/components/dashboard/pai-pulse-widget';
import { MediaPlayerWidget } from '@/components/dashboard/media-player-widget';
import { CadWidget } from '@/components/dashboard/cad-widget';
import { PrinterWidget } from '@/components/dashboard/printer-widget';
import { BrowserAgentWidget } from '@/components/dashboard/browser-agent-widget';
import { KasaWidget } from '@/components/dashboard/kasa-widget';
import { TerminalWidget } from '@/components/dashboard/terminal-widget';
import { ArrowLeft } from 'lucide-react';

const VALID_IDS = new Set<string>([
  'webcam', 'imageGrid', 'systemMonitor', 'music', 'logStream',
  'textEditor', 'commandList', 'missionControl', 'paiPulse', 'mediaPlayer',
  'cad', 'printer', 'browserAgent', 'kasa', 'terminal',
]);

function renderPopoutWidget(id: WidgetId) {
  switch (id) {
    case 'webcam':       return <WebcamWidget />;
    case 'imageGrid':    return <ImageGridWidget />;
    case 'systemMonitor': return <SystemMonitorWidget />;
    case 'music':        return <MusicWidget />;
    case 'logStream':    return <LogStreamWidget />;
    case 'textEditor':   return <TextEditorWidget />;
    case 'missionControl': return <MissionControlWidget />;
    case 'commandList':  return <CommandListWidget />;
    case 'paiPulse':     return <PaiPulseWidget />;
    case 'mediaPlayer':  return <MediaPlayerWidget />;
    case 'cad':          return <CadWidget />;
    case 'printer':      return <PrinterWidget />;
    case 'browserAgent': return <BrowserAgentWidget />;
    case 'kasa':         return <KasaWidget />;
    case 'terminal':     return <TerminalWidget />;
    default:             return null;
  }
}

function PopoutShell() {
  const params = useParams();
  const rawId = typeof params.id === 'string' ? params.id : '';
  const widgetId = VALID_IDS.has(rawId) ? (rawId as WidgetId) : null;
  const { openWidget, attachWidget } = useWidgetManager();
  const shellRef = useRef<HTMLDivElement>(null);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  // Transparentes html/body
  useEffect(() => {
    document.documentElement.classList.add('elite-widget-popout');
    document.body.classList.add('elite-widget-popout');
    return () => {
      document.documentElement.classList.remove('elite-widget-popout');
      document.body.classList.remove('elite-widget-popout');
    };
  }, []);

  // Widget im lokalen Context öffnen
  useEffect(() => {
    if (widgetId) openWidget(widgetId);
  }, [widgetId, openWidget]);

  // Electron-Fenstergröße automatisch an Widget-Inhalt anpassen
  useEffect(() => {
    if (widgetId === 'terminal') return; // Terminal-Fenster soll manuell vergrößerbar sein
    if (!shellRef.current) return;
    const resize = window.eliteAPI?.resizeWidgetWindow;
    if (!resize) return; // Nicht in Electron oder Handler fehlt → still überspringen

    let lastSize = '';
    const syncWindowSize = () => {
      if (!shellRef.current) return;
      const rect = shellRef.current.getBoundingClientRect();
      const w = Math.ceil(rect.width);
      const h = Math.ceil(rect.height);
      const nextSize = `${w}x${h}`;
      if (h < 100 || w < 100 || nextSize === lastSize) return;
      lastSize = nextSize;
      resize(w, h).catch(() => {
        // Handler nicht verfügbar (alter Electron-Prozess) → ignorieren
      });
    };

    const ro = new ResizeObserver(() => {
      requestAnimationFrame(syncWindowSize);
    });
    ro.observe(shellRef.current);
    requestAnimationFrame(syncWindowSize);
    return () => ro.disconnect();
  }, [widgetId]);

  const handleReturnToHud = () => {
    if (!widgetId) return;
    attachWidget(widgetId);
    window.eliteAPI?.closeWidgetWindow?.(widgetId);
  };

  if (!widgetId) {
    return (
      <div className="flex h-screen items-center justify-center text-white/50 text-sm">
        Unbekanntes Widget
      </div>
    );
  }

  const isTerminal = widgetId === 'terminal';

  if (!mounted) {
    return (
      <div
        className={`relative bg-transparent ${isTerminal ? 'h-screen w-screen' : 'min-h-[200px] w-full'}`}
        aria-hidden
      />
    );
  }

  return (
    <div
      ref={shellRef}
      className={`relative ${isTerminal ? 'h-screen w-screen flex flex-col' : 'inline-flex w-full flex-col'} bg-transparent text-white overflow-hidden`}
    >

      {/* ── Drag-Handle (einzige ziehbare Zone) ──────────────────────── */}
      <div
        className="flex items-center justify-between px-3 py-1.5 shrink-0 select-none cursor-grab active:cursor-grabbing"
        style={{ WebkitAppRegion: 'drag' } as React.CSSProperties}
      >
        <span className="text-[8px] font-black uppercase tracking-[0.35em] text-orange-400 pointer-events-none">
          Elite · {widgetId}
        </span>
        {/* Zurück-Button muss no-drag sein, sonst click blockiert */}
        <div style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}>
          <button
            type="button"
            onClick={handleReturnToHud}
            className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[9px] font-bold uppercase tracking-wider text-white/80 hover:text-primary bg-yellow-800/100 hover:bg-blue-500/50 backdrop-blur-md ring-1 ring-white/10 transition-all"
          >
            <ArrowLeft className="size-3" />
            HUD
          </button>
        </div>
      </div>

      {/* ── Widget-Inhalt ───────────────── */}
      <div
        className={`px-2 pb-2 rounded-b-xl overflow-hidden ${isTerminal ? 'flex-1 min-h-0 flex flex-col' : ''}`}
        style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}
      >
        <div
          className={`overflow-hidden ${
            isTerminal
              ? 'flex-1 min-h-0 flex flex-col bg-transparent shadow-none ring-0 rounded-xl overflow-hidden'
              : 'rounded-xl shadow-[0_20px_60px_rgba(0,0,0,0.55)] ring-1 ring-white/10'
          }`}
        >
          {renderPopoutWidget(widgetId)}
        </div>
      </div>
    </div>
  );
}

export default function WidgetPopoutPage() {
  return (
    <WidgetManagerProvider>
      <PopoutShell />
    </WidgetManagerProvider>
  );
}
