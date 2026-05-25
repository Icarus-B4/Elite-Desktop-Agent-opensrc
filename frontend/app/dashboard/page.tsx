'use client';

import { useState, useEffect, ReactNode } from 'react';
import { Reorder, motion, AnimatePresence } from 'framer-motion';
import { GridBackground } from '@/components/grid-background';
import { HudDecorators } from '@/components/hud-decorators';
import { WidgetManagerProvider, useWidgetManager, WidgetId } from '@/components/dashboard/widget-manager';
import { WebcamWidget } from '@/components/dashboard/webcam-widget';
import { ImageGridWidget } from '@/components/dashboard/image-grid-widget';
import { ChatWidget } from '@/components/dashboard/chat-widget';
import { SystemMonitorWidget } from '@/components/dashboard/system-monitor-widget';
import { MusicWidget } from '@/components/dashboard/music-widget';
import { LogStreamWidget } from '@/components/dashboard/log-stream-widget';
import { TextEditorWidget } from '@/components/dashboard/text-editor-widget';
import { MediaPlayerWidget } from '@/components/dashboard/media-player-widget';
import { MissionControlWidget } from '@/components/dashboard/mission-control-widget';
import { CommandListWidget } from '@/components/dashboard/command-list-widget';
import { PaiPulseWidget } from '@/components/dashboard/pai-pulse-widget';
import { SettingsWidget } from '@/components/dashboard/settings-widget';
import { CadWidget } from '@/components/dashboard/cad-widget';
import { PrinterWidget } from '@/components/dashboard/printer-widget';
import { BrowserAgentWidget } from '@/components/dashboard/browser-agent-widget';
import { KasaWidget } from '@/components/dashboard/kasa-widget';
import { AuthLockWidget } from '@/components/dashboard/auth-lock-widget';
import { AdaCapabilitiesPanel } from '@/components/dashboard/ada-capabilities-panel';
import { WidgetFullscreenPortal } from '@/components/dashboard/widget-fullscreen-portal';
import { BottomToolbar } from '@/components/dashboard/bottom-toolbar';
import { WIDGET_HEADER_CLASS } from '@/components/dashboard/widget-shell';
import { Badge } from '@/components/ui/badge';
import { Mic, X, Settings, Bot, Terminal, Activity, Rocket, LayoutGrid, Zap } from 'lucide-react';

/**
 * Elite Desktop Agent Dashboard: Hauptseite mit allen Widgets.
 * Multi-Widget Layout mit dynamischer Sichtbarkeit.
 * Route: /dashboard
 */
export default function DashboardPage() {
  const [dateStr, setDateStr] = useState('');
  useEffect(() => { setDateStr(new Date().toLocaleDateString('de-DE')); }, []);

  return (
    <WidgetManagerProvider>
      <main className="relative flex h-screen w-full flex-col overflow-hidden bg-[#000b1a] text-white font-sans selection:bg-[#00f2ff]/30">
        {/* HUD Background */}
        <GridBackground />
        <HudDecorators />
        <div className="absolute inset-0 scanlines opacity-20 pointer-events-none" />

        {/* Top Bar */}
        <header className="relative z-20 flex items-center justify-between px-6 py-4 border-b border-white/5 bg-black/20 backdrop-blur-md">
          <div className="flex items-center gap-4">
            <a href="/" className="flex items-center gap-2 group">
              <div className="relative flex size-9 items-center justify-center rounded-xl bg-cyan-500/10 ring-1 ring-cyan-500/20 group-hover:bg-cyan-500/20 transition-all">
                <Settings className="size-4 text-cyan-400" />
                <div className="absolute inset-0 rounded-xl bg-cyan-400/10 blur-sm animate-pulse" />
              </div>
              <div>
                <h1 className="text-sm font-black tracking-wider text-white/80">
                  <span className="text-cyan-400">ELITE</span> Control Hub
                </h1>
                <p className="text-[8px] font-bold uppercase tracking-[0.3em] text-white/20">System Configuration & Soul Matrix</p>
              </div>
            </a>
          </div>
          <div className="flex items-center gap-3">
            <Badge variant="outline" className="gap-2 border-cyan-500/20 bg-cyan-500/5 text-cyan-400 text-[9px] px-3 py-1">
              Configuration Active
            </Badge>
            <div className="text-[9px] font-mono text-white/20">
              {dateStr}
            </div>
          </div>
        </header>

        {/* Settings Center Content */}
        <SettingsCenter />

        {/* Widgets Overlay (Zentraler Renderer für alle offenen Widgets) */}
        <DashboardWidgetOverlay />

        {/* Bottom Toolbar */}
        <BottomToolbar />
      </main>
    </WidgetManagerProvider>
  );
}

function renderDashboardWidget(id: WidgetId) {
  switch (id) {
    case 'commandList':
      return <CommandListWidget />;
    case 'webcam':
      return <WebcamWidget />;
    case 'chat':
      return <ChatWidget />;
    case 'music':
      return <MusicWidget />;
    case 'systemMonitor':
      return <SystemMonitorWidget />;
    case 'logStream':
      return <LogStreamWidget />;
    case 'imageGrid':
      return <ImageGridWidget />;
    case 'textEditor':
      return <TextEditorWidget onSend={() => {}} />;
    case 'missionControl':
      return <MissionControlWidget />;
    case 'paiPulse':
      return <PaiPulseWidget />;
    case 'settings':
      return <SettingsWidget />;
    case 'mediaPlayer':
      return <MediaPlayerWidget />;
    case 'cad':
      return <CadWidget />;
    case 'printer':
      return <PrinterWidget />;
    case 'browserAgent':
      return <BrowserAgentWidget />;
    case 'kasa':
      return <KasaWidget />;
    case 'authLock':
      return <AuthLockWidget />;
    default:
      return null;
  }
}

/** Zentraler Renderer für offene Widgets auf der Dashboard-Seite */
function DashboardWidgetOverlay() {
  const { getOpenWidgets, fullscreenWidget } = useWidgetManager();
  const openWidgets = getOpenWidgets();
  const inlineWidgets = fullscreenWidget
    ? openWidgets.filter((id) => id !== fullscreenWidget)
    : openWidgets;

  const [positions, setPositions] = useState<Record<string, { x: number; y: number }>>({});

  // Lade gespeicherte Positionen beim Start
  useEffect(() => {
    try {
      const saved = localStorage.getItem('elite-widget-positions');
      if (saved) {
        setPositions(JSON.parse(saved));
      }
    } catch { /* ignore */ }
  }, []);

  // Speichere Positionen bei Änderung
  const savePositions = (pos: Record<string, { x: number; y: number }>) => {
    try {
      localStorage.setItem('elite-widget-positions', JSON.stringify(pos));
    } catch { /* ignore */ }
  };

  // Gesten-Drag Event Handler
  useEffect(() => {
    const handleDrag = (detail: { widgetId: string; dx: number; dy: number }) => {
      if (!detail?.widgetId) return;

      setPositions((prev) => {
        const idx = inlineWidgets.indexOf(detail.widgetId as WidgetId);
        const defaultPos = getDefaultPosition(detail.widgetId as WidgetId, idx !== -1 ? idx : 0);
        const current = prev[detail.widgetId] || defaultPos;
        const next = {
          ...prev,
          [detail.widgetId]: {
            x: Math.max(10, Math.min(window.innerWidth - 150, current.x + detail.dx)),
            y: Math.max(80, Math.min(window.innerHeight - 150, current.y + detail.dy)),
          },
        };
        savePositions(next);
        return next;
      });
    };

    const onLocalGestureDrag = (e: Event) => {
      const detail = (e as CustomEvent<{ widgetId: string; dx: number; dy: number }>).detail;
      handleDrag(detail);
    };

    window.addEventListener('elite-gesture-drag', onLocalGestureDrag);

    return () => {
      window.removeEventListener('elite-gesture-drag', onLocalGestureDrag);
    };
  }, [inlineWidgets]);

  // Standardposition berechnen
  const getDefaultPosition = (widgetId: string, index: number) => {
    if (typeof window === 'undefined') return { x: 50, y: 120 };
    const cols = Math.max(1, Math.floor((window.innerWidth - 100) / 480));
    const col = index % cols;
    const row = Math.floor(index / cols);

    const width = 450;
    const height = 280;
    const gap = 30;

    const startX = 40;
    const startY = 100;

    return {
      x: startX + col * (width + gap),
      y: startY + row * (height + gap),
    };
  };

  if (openWidgets.length === 0) return null;

  return (
    <>
      <WidgetFullscreenPortal>{(id) => renderDashboardWidget(id)}</WidgetFullscreenPortal>
      {inlineWidgets.length > 0 && (
        <div className="fixed inset-0 z-[40] pointer-events-none">
          <AnimatePresence mode="popLayout">
            {inlineWidgets.map((id, index) => {
              const defaultPos = getDefaultPosition(id, index);
              const pos = positions[id] || defaultPos;

              return (
                <motion.div
                  key={id}
                  layout
                  initial={{ opacity: 0, scale: 0.9, x: pos.x, y: pos.y + 30 }}
                  animate={{ opacity: 1, scale: 1, x: pos.x, y: pos.y }}
                  exit={{ opacity: 0, scale: 0.9, x: pos.x, y: pos.y }}
                  transition={{ type: 'spring', stiffness: 300, damping: 30 }}
                  className="pointer-events-auto shadow-2xl fixed w-full max-w-lg"
                  style={{
                    left: 0,
                    top: 0,
                  }}
                  data-widget-id={id}
                >
                  <WidgetDragWrapper
                    widgetId={id}
                    onDrag={(dx, dy) => {
                      setPositions((prev) => {
                        const next = {
                          ...prev,
                          [id]: {
                            x: Math.max(10, Math.min(window.innerWidth - 150, pos.x + dx)),
                            y: Math.max(80, Math.min(window.innerHeight - 150, pos.y + dy)),
                          },
                        };
                        savePositions(next);
                        return next;
                      });
                    }}
                  >
                    {renderDashboardWidget(id)}
                  </WidgetDragWrapper>
                </motion.div>
              );
            })}
          </AnimatePresence>
        </div>
      )}
    </>
  );
}

// Hilfskomponente, um Maus-Drags auf dem Header zu fangen
function WidgetDragWrapper({
  children,
  widgetId,
  onDrag,
}: {
  children: ReactNode;
  widgetId: string;
  onDrag: (dx: number, dy: number) => void;
}) {
  const handleMouseDown = (e: React.MouseEvent) => {
    // Falls auf einen Button oder Input geklickt wird, kein Drag
    const target = e.target as HTMLElement;
    if (target.closest('button') || target.closest('input') || target.closest('textarea') || target.closest('a')) {
      return;
    }

    // Nur auf dem Header ziehen erlauben
    const header = target.closest(`.${WIDGET_HEADER_CLASS}`);
    if (!header) return;

    e.preventDefault();
    const startX = e.clientX;
    const startY = e.clientY;

    let lastX = startX;
    let lastY = startY;

    const handleMouseMove = (moveEvent: MouseEvent) => {
      const dx = moveEvent.clientX - lastX;
      const dy = moveEvent.clientY - lastY;
      lastX = moveEvent.clientX;
      lastY = moveEvent.clientY;
      onDrag(dx, dy);
    };

    const handleMouseUp = () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
  };

  return (
    <div onMouseDown={handleMouseDown} className="w-full h-full cursor-grab active:cursor-grabbing">
      {children}
    </div>
  );
}


/** Settings Center: Zentrale Konfiguration */
function SettingsCenter() {
  const [activeSettings, setActiveSettings] = useState<Record<string, number>>({
    "Soul Matrix": 0,
    "Voice Assistant": 1,
    "HUD Aesthetics": 0,
    "System Access": 1,
    "Security Link": 0,
    "Module Control": 0
  });
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    fetch('/api/elite/settings')
      .then(res => res.json())
      .then(data => {
        const mapped: Record<string, number> = {
          "Soul Matrix": data.soulMatrix ?? 0,
          "Voice Assistant": data.voiceAssistant ?? 1,
          "HUD Aesthetics": data.hudAesthetics ?? 0,
          "System Access": data.systemAccess ?? 1,
          "Security Link": data.securityLink ?? 0,
          "Module Control": data.moduleControl ?? 0
        };
        setActiveSettings(mapped);
      })
      .catch(err => console.error("Fehler beim Laden der Settings:", err));
  }, []);

  const { toggleWidget } = useWidgetManager();

  const handleOptionClick = async (title: string, index: number, isCommandTrigger?: boolean) => {
    if (isCommandTrigger) {
      toggleWidget('commandList');
      return;
    }
    const newSettings = { ...activeSettings, [title]: index };
    setActiveSettings(newSettings);
    
    // Automatisch speichern bei Änderung
    setIsSaving(true);
    try {
      await fetch('/api/elite/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          soulMatrix: newSettings["Soul Matrix"],
          voiceAssistant: newSettings["Voice Assistant"],
          hudAesthetics: newSettings["HUD Aesthetics"],
          systemAccess: newSettings["System Access"],
          securityLink: newSettings["Security Link"],
          moduleControl: newSettings["Module Control"]
        })
      });
      window.dispatchEvent(new CustomEvent('elite-settings-updated'));
    } catch (err) {
      console.error("Fehler beim Speichern:", err);
    } finally {
      setTimeout(() => setIsSaving(false), 500);
    }
  };

  const settings = [
    { 
      title: "Soul Matrix", 
      desc: "Tonfall-Overlay (SOUL.md bleibt Butler-Basis): Elite=knapp, Jarvis=proaktiver, Ghost=minimal", 
      icon: Bot, 
      options: ["Elite (Standard)", "Jarvis (Hilfsbereit)", "Ghost (Diskret)"],
    },
    { 
      title: "Voice Assistant", 
      desc: "0/3=nur „Elite/Jarvis“; 1/2=auch klare Befehle („Öffne …“); Chat immer ohne Wake-Word", 
      icon: Mic, 
      options: ["Rauschfilter (empfohlen)", "Hohe Empfindlichkeit", "Schnelle Antwort", "Ultra-Strict VAD (0.8)"],
    },
    { 
      title: "HUD Aesthetics", 
      desc: "Accent Colors & Transparenz-Level", 
      icon: LayoutGrid, 
      options: ["Cyan-Neon", "Amber-Retro", "Matrix-Green"],
    },
    { 
      title: "System Access", 
      desc: "Berechtigungen für File-Access & Shell", 
      icon: Terminal, 
      options: ["Read-Only", "Full-Control", "Restricted"],
    },
    { 
      title: "Security Link", 
      desc: "Verschlüsselung & Missions-Sync", 
      icon: Activity, 
      options: ["AES-256", "Live-Sync", "Local-Only"],
    },
    { 
      title: "Module Control", 
      desc: "Aktive Hintergrund-Prozesse", 
      icon: Rocket, 
      options: ["Optimized", "High-Performance", "Eco-Mode"],
    },
    {
      title: "Command Index",
      desc: "Liste aller verfügbaren Befehle",
      icon: Zap,
      options: ["Übersicht öffnen"],
      isCommandTrigger: true
    }
  ];

  return (
    <div className="relative z-10 flex-1 overflow-y-auto px-6 py-8 no-scrollbar">
      <div className="max-w-6xl mx-auto">
        <div className="flex items-center justify-between mb-8">
          <div className="flex items-center gap-4">
            <div className="size-2 rounded-full bg-primary animate-pulse shadow-[0_0_10px_var(--accent-glow)]" />
            <span className="text-[10px] font-black uppercase tracking-[0.4em] text-primary/70">Matrix Sync Status: {isSaving ? 'Synchronizing...' : 'Live'}</span>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          <AdaCapabilitiesPanel />
          {settings.map((s, i) => {
            const activeIndex = activeSettings[s.title];
            return (
              <motion.div
                key={s.title}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.1 }}
                className="group relative rounded-2xl bg-white/[0.03] p-6 ring-1 ring-white/5 hover:ring-primary/30 hover:bg-white/[0.06] transition-all duration-500 overflow-hidden"
              >
                {/* Decoration — dezent, nicht leuchtend */}
                <div className="absolute top-2 right-2 pointer-events-none opacity-[0.035] group-hover:opacity-[0.07] transition-opacity duration-500">
                  <s.icon className="size-9 text-white/25" strokeWidth={1.25} />
                </div>

                <div className="relative flex flex-col h-full">
                  <div className="flex items-center gap-3 mb-6">
                    <div className="p-2 rounded-lg bg-white/[0.04] text-white/40 ring-1 ring-white/8">
                      <s.icon className="size-4" strokeWidth={1.5} />
                    </div>
                    <div>
                      <h3 className="text-sm font-black uppercase tracking-wider text-white/90">{s.title}</h3>
                      <p className="text-[10px] text-white/30 font-medium">{s.desc}</p>
                    </div>
                  </div>

                  <div className="space-y-2 mt-auto">
                    {s.options.map((opt, oi) => (
                      <button
                        key={opt}
                        onClick={() => handleOptionClick(s.title, oi, (s as any).isCommandTrigger)}
                        className={`w-full flex items-center justify-between px-4 py-2.5 rounded-xl text-[10px] font-bold uppercase tracking-widest transition-all ${
                          oi === activeIndex && !(s as any).isCommandTrigger                          ? 'bg-primary text-black shadow-[0_0_20px_var(--accent-glow)]' 
                          : 'bg-white/5 text-white/40 hover:bg-white/10 hover:text-white'
                        }`}
                      >
                        {opt}
                        {oi === activeIndex && <Activity className="size-3" />}
                      </button>
                    ))}
                  </div>
                </div>
              </motion.div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
