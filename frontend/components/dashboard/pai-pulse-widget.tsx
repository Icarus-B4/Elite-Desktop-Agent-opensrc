'use client';

import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  Activity, X, RotateCw, BookOpen, Sparkles, Save, Check, 
  Shield, Music, Sliders, Calendar, User, Zap, Lock, Terminal,
  ExternalLink
} from 'lucide-react';
import { useWidgetManager } from './widget-manager';
import {
  WIDGET_PANEL_CLASS,
  WIDGET_HEADER_CLASS,
  WIDGET_COMPACT_CLASS,
  WIDGET_BODY_CLASS,
  WIDGET_SCROLL_CLASS,
  WIDGET_TITLE_CLASS,
  WidgetPopOutButton,
} from './widget-shell';
import { useToast } from './toast-provider';

type ActiveTab = 'pulse' | 'telos' | 'idealState';

interface PaiData {
  telos?: string;
  idealState?: string;
  soul?: string;
  user?: string;
  accessPolicy?: string;
  heartbeat?: string;
}

interface TelosProblem {
  id: string;
  title: string;
  note?: string;
  severity?: string;
  affects?: string[];
}

interface TelosMission {
  id: string;
  title: string;
  active?: boolean;
  addresses?: string[];
}

interface TelosGoal {
  id: string;
  title: string;
  pct?: number;
}

interface TelosOverview {
  problems?: TelosProblem[];
  missions?: TelosMission[];
  goals?: TelosGoal[];
}

interface PaiWorkState {
  active?: boolean;
  running?: boolean;
  phase?: string;
  step?: string;
  progress?: number | string;
  objective?: string;
  task?: string;
}

interface ModuleGroup {
  wave: string;
  name: string;
  modules: string[];
}

export function PaiPulseWidget() {
  const { closeWidget } = useWidgetManager();
  const [activeTab, setActiveTab] = useState<ActiveTab>('pulse');
  const [refreshKey, setRefreshKey] = useState(0);
  const [isServerOnline, setIsServerOnline] = useState(false);
  const [pulseCheckDone, setPulseCheckDone] = useState(false);
  const [telosOverview, setTelosOverview] = useState<TelosOverview | null>(null);
  const [overviewLoading, setOverviewLoading] = useState(false);
  const [overviewError, setOverviewError] = useState(false);
  const [workState, setWorkState] = useState<PaiWorkState | null>(null);
  const [workStateError, setWorkStateError] = useState(false);
  const [moduleGroups, setModuleGroups] = useState<ModuleGroup[]>([]);

  const PULSE_IFRAME_URL =
    process.env.NEXT_PUBLIC_PAI_PULSE_URL ?? 'http://localhost:31337';

  // States für die Identitäts-Dateien
  const [telos, setTelos] = useState('');
  const [idealState, setIdealState] = useState('');
  const [paiData, setPaiData] = useState<PaiData>({});
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);

  // States für den custom Prompt Dialog (Ersatz für window.prompt)
  const [promptOpen, setPromptOpen] = useState(false);
  const [promptType, setPromptType] = useState<'ideate' | 'optimize' | 'algorithm' | null>(null);
  const [promptValue, setPromptValue] = useState('');
  const [promptTitle, setPromptTitle] = useState('');
  const [promptPlaceholder, setPromptPlaceholder] = useState('');

  // Health-Check via Next.js-Proxy (kein no-cors — sonst zählt auch 404 als „online“)
  useEffect(() => {
    if (activeTab !== 'pulse') return;

    let cancelled = false;
    setPulseCheckDone(false);

    const checkServer = async () => {
      try {
        const res = await fetch('/api/elite/pai/health', { cache: 'no-store' });
        const data = await res.json();
        if (!cancelled) {
          setIsServerOnline(Boolean(data.online));
        }
      } catch {
        if (!cancelled) setIsServerOnline(false);
      } finally {
        if (!cancelled) setPulseCheckDone(true);
      }
    };

    checkServer();
    return () => {
      cancelled = true;
    };
  }, [refreshKey, activeTab]);

  // Telos-Übersicht vom Pulse-Daemon (kompakte Widget-Ansicht)
  useEffect(() => {
    if (activeTab !== 'pulse' || !pulseCheckDone || !isServerOnline) return;

    let cancelled = false;
    setOverviewLoading(true);
    setOverviewError(false);

    fetch('/api/elite/pai/overview', { cache: 'no-store' })
      .then((res) => {
        if (!res.ok) throw new Error('overview failed');
        return res.json();
      })
      .then((data: TelosOverview) => {
        if (!cancelled) setTelosOverview(data);
      })
      .catch(() => {
        if (!cancelled) {
          setOverviewError(true);
          setTelosOverview(null);
        }
      })
      .finally(() => {
        if (!cancelled) setOverviewLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [activeTab, pulseCheckDone, isServerOnline, refreshKey]);

  // Aktueller Loop-/Work-State für Observability
  useEffect(() => {
    if (activeTab !== 'pulse') return;
    let cancelled = false;
    const fetchWork = async () => {
      try {
        const res = await fetch('/api/elite/pai/work', { cache: 'no-store' });
        if (!res.ok) throw new Error('work status failed');
        const data = (await res.json()) as PaiWorkState;
        if (!cancelled) {
          setWorkState(data);
          setWorkStateError(false);
        }
      } catch {
        if (!cancelled) {
          setWorkState(null);
          setWorkStateError(true);
        }
      }
    };
    fetchWork();
    const interval = setInterval(fetchWork, 5000);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [activeTab, refreshKey]);

  useEffect(() => {
    if (activeTab !== 'pulse') return;
    fetch('/api/elite/pai/modules', { cache: 'no-store' })
      .then((res) => (res.ok ? res.json() : null))
      .then((payload) => {
        if (Array.isArray(payload?.groups)) {
          setModuleGroups(payload.groups);
        }
      })
      .catch(() => undefined);
  }, [activeTab, refreshKey]);

  // Daten laden bei Profilauswahl oder Initialisierung
  useEffect(() => {
    setLoading(true);
    fetch('/api/elite/pai')
      .then((res) => res.json())
      .then((data) => {
        setPaiData(data);
        setTelos(data.telos || '');
        setIdealState(data.idealState || '');
        setLoading(false);
      })
      .catch((err) => {
        console.error('[PAI Widget] Fehler beim Laden:', err);
        setLoading(false);
      });
  }, [refreshKey]);

  // Speichern in der PAI-Struktur
  const handleSave = async () => {
    setSaving(true);
    setSaveSuccess(false);
    try {
      const res = await fetch('/api/elite/pai', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ telos, idealState }),
      });
      if (res.ok) {
        setSaveSuccess(true);
        setTimeout(() => setSaveSuccess(false), 3000);
      }
    } catch (err) {
      console.error('[PAI Widget] Fehler beim Speichern:', err);
    } finally {
      setSaving(false);
    }
  };

  const handleReload = () => {
    setRefreshKey((prev) => prev + 1);
  };

  const severityClass = (severity?: string) => {
    switch (severity?.toLowerCase()) {
      case 'high':
      case 'critical':
        return 'text-rose-400 border-rose-500/20 bg-rose-950/30';
      case 'low':
        return 'text-cyan-400 border-cyan-500/20 bg-cyan-950/30';
      default:
        return 'text-amber-400 border-amber-500/20 bg-amber-950/30';
    }
  };

  const { showToast } = useToast();

  const handleTriggerCommand = (type: 'ideate' | 'optimize' | 'algorithm') => {
    const elite = (window as any).elite;
    if (!elite || (!elite.sendChatMessage && !elite.executeCommand)) {
      showToast({
        type: 'error',
        title: 'Verbindung offline',
        message: 'Elite Assistant ist offline. Bitte aktivieren Sie die Sitzung über den Start-Button.'
      });
      return;
    }

    setPromptType(type);
    setPromptValue('');
    setPromptOpen(true);

    if (type === 'ideate') {
      setPromptTitle('Ideate Loop starten');
      setPromptPlaceholder('Geben Sie das Thema / Problem für den Ideenfindungs-Loop ein:');
    } else if (type === 'optimize') {
      setPromptTitle('Optimize Loop starten');
      setPromptPlaceholder('Geben Sie das Thema / Problem für den Optimierungs-Loop ein:');
    } else if (type === 'algorithm') {
      setPromptTitle('7-Phasen-Algorithmus');
      setPromptPlaceholder('Geben Sie optional die Aufgabe für den wissenschaftlichen Lösungszyklus ein (kann leer gelassen werden):');
    }
  };

  const handlePromptCancel = () => {
    setPromptOpen(false);
    setPromptType(null);
    setPromptValue('');
  };

  const handlePromptSubmit = async () => {
    const elite = (window as any).elite;
    if (!elite || (!elite.sendChatMessage && !elite.executeCommand)) return;

    let command = '';
    const trimmed = promptValue.trim();

    if (promptType === 'ideate') {
      if (!trimmed) {
        showToast({
          type: 'error',
          title: 'Fehler',
          message: 'Bitte geben Sie ein gültiges Thema ein.'
        });
        return;
      }
      command = `ideate ${trimmed}`;
    } else if (promptType === 'optimize') {
      if (!trimmed) {
        showToast({
          type: 'error',
          title: 'Fehler',
          message: 'Bitte geben Sie ein gültiges Thema ein.'
        });
        return;
      }
      command = `optimize ${trimmed}`;
    } else if (promptType === 'algorithm') {
      if (trimmed) {
        command = `run the Algorithm on my next task: ${trimmed}`;
      } else {
        command = `run the Algorithm on my next task`;
      }
    }

    setPromptOpen(false);
    setPromptType(null);
    setPromptValue('');

    if (command) {
      try {
        if (elite.sendChatMessage) {
          await elite.sendChatMessage(command);
        } else {
          await elite.executeCommand(command);
        }
        showToast({
          type: 'success',
          title: 'Befehl gesendet',
          message: `Befehl "${command}" wurde an den Elite Agenten übermittelt.`
        });
      } catch (err) {
        console.error('[PAI Widget] Fehler beim Senden des Befehls:', err);
        showToast({
          type: 'error',
          title: 'Fehler',
          message: 'Befehl konnte nicht gesendet werden.'
        });
      }
    }
  };

  // Hilfsfunktion zum Extrahieren eines Wertes nach einem bestimmten Label (z.B. "**Name:**", "Modus:")
  const extractValue = (mdText?: string, labelPattern?: string, fallback: string = ''): string => {
    if (!mdText) return fallback;
    const lines = mdText.split('\n');
    for (const line of lines) {
      const trimmed = line.trim();
      if (trimmed.toLowerCase().includes(labelPattern?.toLowerCase() || '')) {
        // Extrahiere alles nach dem Label und bereinige Markdown-Formatierungen
        const cleanLine = trimmed
          .replace(new RegExp(`.*?${labelPattern}\\s*`, 'i'), '')
          .replace(/^[\*\-\:\s\>\#]+/, '')
          .replace(/\*\*$/, '')
          .trim();
        if (cleanLine) return cleanLine;
      }
    }
    return fallback;
  };

  // Hilfsfunktion zum Extrahieren von Bulletpoints aus einer bestimmten Sektion
  const getSectionBulletpoints = (mdText?: string, sectionHeader?: string, count: number = 3): string[] => {
    if (!mdText) return [];
    const lines = mdText.split('\n');
    let inSection = !sectionHeader;
    const points: string[] = [];
    
    for (const line of lines) {
      const trimmed = line.trim();
      if (sectionHeader && trimmed.toLowerCase().includes(sectionHeader.toLowerCase())) {
        inSection = true;
        continue;
      }
      if (inSection) {
        // Bei der nächsten Überschrift aufhören
        if (sectionHeader && trimmed.startsWith('#') && !trimmed.toLowerCase().includes(sectionHeader.toLowerCase())) {
          break;
        }
        if (trimmed.startsWith('*') || trimmed.startsWith('-')) {
          const cleanPoint = trimmed.replace(/^[\*\-]\s+/, '').trim();
          if (cleanPoint) points.push(cleanPoint);
        }
      }
    }
    return points.length > 0 ? points.slice(0, count) : [];
  };

  // PAI Dashboard im neuen Fenster öffnen (statt eingebetteten Fullscreen)
  const handleOpenInNewWindow = () => {
    // Electron: eliteAPI.openExternal nutzen (window.open wird vom setWindowOpenHandler blockiert)
    const api = (window as any).eliteAPI;
    if (api?.openExternal) {
      api.openExternal(PULSE_IFRAME_URL);
    } else {
      window.open(PULSE_IFRAME_URL, '_blank', 'noopener,noreferrer');
    }
  };

  return (
    <motion.div
      key="paiPulse"
      layout
      initial={{ opacity: 0, scale: 0.97, y: 8 }}
      animate={{ opacity: 1, scale: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.97, y: 8 }}
      transition={{ type: 'spring', stiffness: 300, damping: 28 }}
      className={`${WIDGET_COMPACT_CLASS} flex flex-col min-h-0 ${WIDGET_PANEL_CLASS}`}
    >
      {/* Header */}
      <div className={WIDGET_HEADER_CLASS}>
        <div className="flex items-center gap-2">
          <Activity className="size-3.5 text-cyan-400 animate-pulse shadow-[0_0_10px_rgba(6,182,212,0.4)]" />
          <span className={`${WIDGET_TITLE_CLASS} hidden sm:inline`}>
            PAI Core Pulse
          </span>
        </div>

        {/* HUD-Tab-Leiste */}
        <div className="flex items-center bg-black/40 border border-white/5 rounded-lg p-0.5 mx-2">
          <button
            onClick={() => setActiveTab('pulse')}
            className={`px-3 py-1 rounded-md text-[9.5px] font-bold uppercase tracking-wider transition-all ${
              activeTab === 'pulse'
                ? 'bg-cyan-500/20 text-cyan-400 border border-cyan-500/10'
                : 'text-white/30 hover:text-white/60 border border-transparent'
            }`}
          >
            Dashboard
          </button>
          <button
            onClick={() => setActiveTab('telos')}
            className={`px-3 py-1 rounded-md text-[9.5px] font-bold uppercase tracking-wider transition-all flex items-center gap-1.5 ${
              activeTab === 'telos'
                ? 'bg-cyan-500/20 text-cyan-400 border border-cyan-500/10'
                : 'text-white/30 hover:text-white/60 border border-transparent'
            }`}
          >
            <BookOpen className="size-3" />
            Telos
          </button>
          <button
            onClick={() => setActiveTab('idealState')}
            className={`px-3 py-1 rounded-md text-[9.5px] font-bold uppercase tracking-wider transition-all flex items-center gap-1.5 ${
              activeTab === 'idealState'
                ? 'bg-cyan-500/20 text-cyan-400 border border-cyan-500/10'
                : 'text-white/30 hover:text-white/60 border border-transparent'
            }`}
          >
            <Sparkles className="size-3" />
            Ideal State
          </button>
        </div>

        <div className="flex items-center gap-1">
          {/* Speicher-Button (wird nur in Telos/IdealState angezeigt) */}
          {activeTab !== 'pulse' && (
            <button
              onClick={handleSave}
              disabled={saving}
              className={`flex h-7 px-3 gap-1.5 items-center justify-center rounded-lg text-[9px] uppercase tracking-wider font-bold transition-all border ${
                saveSuccess
                  ? 'bg-emerald-500/15 text-emerald-400 border-emerald-500/20 shadow-[0_0_10px_rgba(16,185,129,0.15)]'
                  : 'bg-cyan-500/10 text-cyan-400 border-cyan-500/20 hover:bg-cyan-500/20'
              }`}
            >
              {saveSuccess ? (
                <>
                  <Check className="size-3" />
                  Gespeichert
                </>
              ) : (
                <>
                  <Save className={`size-3 ${saving ? 'animate-spin' : ''}`} />
                  Speichern
                </>
              )}
            </button>
          )}

          {/* Reload Button */}
          <button
            onClick={handleReload}
            title={activeTab === 'pulse' ? "Status aktualisieren" : "Profildaten aktualisieren"}
            className="flex h-7 w-7 items-center justify-center rounded-lg text-white/25 hover:text-white/60 hover:bg-white/5 transition-all"
          >
            <RotateCw className="size-3" />
          </button>
          
          {/* Pop-out (Electron) oder externes PAI-Fenster */}
          <WidgetPopOutButton widgetId="paiPulse" iconClassName="size-3" />
          <button
            onClick={handleOpenInNewWindow}
            title="PAI Dashboard in neuem Fenster öffnen"
            className="flex h-7 w-7 items-center justify-center rounded-lg text-white/25 hover:text-cyan-400 hover:bg-cyan-500/10 transition-all"
          >
            <ExternalLink className="size-3" />
          </button>
          
          {/* Schließen */}
          <button
            onClick={() => closeWidget('paiPulse')}
            className="flex h-7 w-7 items-center justify-center rounded-lg text-white/20 hover:text-red-400 hover:bg-red-500/5 transition-all ml-1"
          >
            <X className="size-3.5" />
          </button>
        </div>
      </div>

      {/* PAI Actions Bar */}
      <div className="flex items-center justify-between px-4 py-2 border-b border-white/5 bg-cyan-950/15 backdrop-blur-md gap-2 flex-wrap">
        <div className="flex items-center gap-1.5">
          <Terminal className="size-3 text-cyan-400" />
          <span className="text-[9.5px] font-bold uppercase tracking-wider text-white/50">Loops & Algorithmen:</span>
        </div>
        <div className="flex items-center gap-1.5 sm:gap-2">
          <button
            onClick={() => handleTriggerCommand('ideate')}
            className="px-2.5 py-1 rounded-lg bg-cyan-500/10 hover:bg-cyan-500/20 hover:text-cyan-300 hover:shadow-[0_0_12px_rgba(6,182,212,0.25)] border border-cyan-500/20 text-[9px] font-bold uppercase tracking-wider transition-all duration-300 flex items-center gap-1 active:scale-95"
            title="Ideenfindung (9-Phasen-Kreativitäts-Algorithmus)"
          >
            <Sparkles className="size-2.5 text-cyan-400" />
            Ideate Loop
          </button>
          <button
            onClick={() => handleTriggerCommand('optimize')}
            className="px-2.5 py-1 rounded-lg bg-cyan-500/10 hover:bg-cyan-500/20 hover:text-cyan-300 hover:shadow-[0_0_12px_rgba(6,182,212,0.25)] border border-cyan-500/20 text-[9px] font-bold uppercase tracking-wider transition-all duration-300 flex items-center gap-1 active:scale-95"
            title="Verfeinerung und Optimierung bestehender Konzepte"
          >
            <Sliders className="size-2.5 text-cyan-400" />
            Optimize Loop
          </button>
          <button
            onClick={() => handleTriggerCommand('algorithm')}
            className="px-2.5 py-1 rounded-lg bg-cyan-500/10 hover:bg-cyan-500/20 hover:text-cyan-300 hover:shadow-[0_0_12px_rgba(6,182,212,0.25)] border border-cyan-500/20 text-[9px] font-bold uppercase tracking-wider transition-all duration-300 flex items-center gap-1 active:scale-95"
            title="Wissenschaftlicher Lösungszyklus (7-Phasen-Arbeitsablauf)"
          >
            <Zap className="size-2.5 text-cyan-400" />
            Algorithm Run
          </button>
        </div>
      </div>

      {/* Interface Area — min-h-0 + Scroll statt feste Mindesthöhe (verhindert leeren Rasterbereich) */}
      <div className={`relative flex-1 min-h-0 flex flex-col ${WIDGET_BODY_CLASS}`}>
        <AnimatePresence mode="wait">
          {activeTab === 'pulse' ? (
            !pulseCheckDone ? (
              <motion.div
                key="pulse-checking"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="flex-1 flex flex-col items-center justify-center gap-2 text-white/30 text-[10px] uppercase tracking-wider font-bold"
              >
                <RotateCw className="size-5 text-cyan-500 animate-spin" />
                PAI Pulse wird geprüft…
              </motion.div>
            ) : isServerOnline ? (
              <motion.div
                key="pulse-online-dashboard"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className={`flex-1 min-h-0 flex flex-col ${WIDGET_SCROLL_CLASS} p-4 md:p-5 gap-4`}
              >
                <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 bg-cyan-950/25 border border-cyan-500/15 rounded-2xl p-3 backdrop-blur-md shrink-0">
                  <div className="flex items-center gap-3">
                    <span className="relative flex h-2 w-2">
                      <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
                      <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500" />
                    </span>
                    <div>
                      <div className="text-[10px] uppercase font-black text-emerald-400 tracking-widest">
                        PAI Pulse Live
                      </div>
                      <div className="text-[8px] font-bold text-white/40 uppercase">
                        Telos-Übersicht · Port 31337
                      </div>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={handleOpenInNewWindow}
                    className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg border border-cyan-500/20 bg-cyan-500/10 text-[9px] font-bold uppercase tracking-wider text-cyan-400 hover:bg-cyan-500/20 transition-all"
                  >
                    <ExternalLink className="size-2.5" />
                    Vollständiges Dashboard
                  </button>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 shrink-0">
                  <div className="rounded-lg border border-cyan-500/15 bg-black/35 px-3 py-2">
                    <div className="text-[8px] uppercase tracking-wider text-white/35">Loop Active</div>
                    <div className="text-[10px] font-bold text-cyan-300 mt-0.5">
                      {Boolean(workState?.active ?? workState?.running) ? 'Ja' : 'Nein'}
                    </div>
                  </div>
                  <div className="rounded-lg border border-cyan-500/15 bg-black/35 px-3 py-2">
                    <div className="text-[8px] uppercase tracking-wider text-white/35">Phase</div>
                    <div className="text-[10px] font-bold text-cyan-300 mt-0.5">
                      {workState?.phase || workState?.step || 'n/a'}
                    </div>
                  </div>
                  <div className="rounded-lg border border-cyan-500/15 bg-black/35 px-3 py-2">
                    <div className="text-[8px] uppercase tracking-wider text-white/35">Fortschritt</div>
                    <div className="text-[10px] font-bold text-cyan-300 mt-0.5">
                      {String(workState?.progress ?? 'n/a')}
                    </div>
                  </div>
                </div>
                {workStateError && (
                  <p className="text-[9px] text-amber-300/80">
                    Loop-Status aktuell nicht erreichbar. Fallback auf lokale Profile weiterhin aktiv.
                  </p>
                )}
                {moduleGroups.length > 0 && (
                  <div className="rounded-lg border border-white/10 bg-black/30 px-3 py-2">
                    <div className="text-[8px] uppercase tracking-wider text-white/35 mb-1.5">PAI Modul-Wellen</div>
                    <div className="flex flex-wrap gap-1.5">
                      {moduleGroups.map((group) => (
                        <span
                          key={group.wave}
                          className="text-[8px] px-2 py-1 rounded-md border border-cyan-500/20 bg-cyan-500/10 text-cyan-300"
                        >
                          {group.wave}: {group.name} ({group.modules.length})
                        </span>
                      ))}
                    </div>
                  </div>
                )}

                {overviewLoading ? (
                  <div className="flex flex-col items-center justify-center gap-2 py-8 text-white/30 text-[10px] uppercase tracking-wider font-bold">
                    <RotateCw className="size-5 text-cyan-500 animate-spin" />
                    Telos-Daten werden geladen…
                  </div>
                ) : overviewError ? (
                  <motion.div className="rounded-xl border border-amber-500/20 bg-amber-950/20 p-4 text-[10px] text-amber-200/80">
                    Telos-Übersicht nicht erreichbar. Nutzen Sie „Vollständiges Dashboard“ oder prüfen Sie den Pulse-Daemon.
                  </motion.div>
                ) : (
                  <>
                    {(telosOverview?.problems?.length ?? 0) > 0 && (
                      <section className="flex flex-col gap-2">
                        <h3 className="text-[9px] font-black uppercase tracking-[0.2em] text-white/45">
                          Probleme ({telosOverview?.problems?.length})
                        </h3>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 auto-rows-fr">
                          {telosOverview?.problems?.map((problem) => (
                            <article
                              key={problem.id}
                              className="bg-black/50 border border-white/5 hover:border-cyan-500/25 rounded-xl p-3 flex flex-col gap-2 transition-colors"
                            >
                              <div className="flex items-start justify-between gap-2">
                                <span className="text-[10px] font-bold text-white/85 leading-snug line-clamp-2">
                                  {problem.title}
                                </span>
                                <span
                                  className={`shrink-0 text-[7px] font-mono uppercase px-1.5 py-0.5 rounded border ${severityClass(problem.severity)}`}
                                >
                                  {problem.severity ?? 'med'}
                                </span>
                              </div>
                              {problem.note && (
                                <p className="text-[9px] text-white/50 leading-relaxed line-clamp-4">
                                  {problem.note}
                                </p>
                              )}
                              <span className="text-[8px] text-white/25 font-mono">
                                addresses {problem.affects?.length ?? 0} missions
                              </span>
                            </article>
                          ))}
                        </div>
                      </section>
                    )}

                    {(telosOverview?.missions?.length ?? 0) > 0 && (
                      <section className="flex flex-col gap-2">
                        <h3 className="text-[9px] font-black uppercase tracking-[0.2em] text-white/45">
                          Missionen ({telosOverview?.missions?.length})
                        </h3>
                        <ul className="flex flex-col gap-2">
                          {telosOverview?.missions?.slice(0, 5).map((mission) => (
                            <li
                              key={mission.id}
                              className="flex items-start gap-2 rounded-lg border border-white/5 bg-black/35 px-3 py-2"
                            >
                              <span
                                className={`mt-1 size-1.5 rounded-full shrink-0 ${mission.active ? 'bg-cyan-400' : 'bg-white/20'}`}
                              />
                              <span className="text-[9px] text-white/70 leading-relaxed line-clamp-2">
                                {mission.title}
                              </span>
                            </li>
                          ))}
                        </ul>
                      </section>
                    )}

                    {(telosOverview?.goals?.length ?? 0) > 0 && (
                      <section className="flex flex-col gap-2">
                        <h3 className="text-[9px] font-black uppercase tracking-[0.2em] text-white/45">
                          Ziele ({telosOverview?.goals?.length})
                        </h3>
                        <ul className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                          {telosOverview?.goals?.slice(0, 4).map((goal) => (
                            <li
                              key={goal.id}
                              className="rounded-lg border border-white/5 bg-black/35 px-3 py-2 text-[9px] text-white/60 line-clamp-2"
                            >
                              {goal.title}
                            </li>
                          ))}
                        </ul>
                      </section>
                    )}

                    {!telosOverview?.problems?.length &&
                      !telosOverview?.missions?.length &&
                      !telosOverview?.goals?.length && (
                        <p className="text-[10px] text-white/35 text-center py-6">
                          Keine Telos-Einträge gefunden.
                        </p>
                      )}
                  </>
                )}
              </motion.div>
            ) : (
              // Wenn offline -> Traumhaftes lokales Cyber-HUD Dashboard rendern!
              <motion.div
                key="pulse-offline-dashboard"
                initial={{ opacity: 0, scale: 0.99 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0 }}
                className={`flex-1 min-h-0 flex flex-col gap-4 p-4 md:p-6 ${WIDGET_SCROLL_CLASS}`}
              >
                {/* Status Bar / Pulse Line */}
                <div className="flex flex-col md:flex-row items-center justify-between gap-4 bg-cyan-950/20 border border-cyan-500/10 rounded-2xl p-4 backdrop-blur-md">
                  <div className="flex items-center gap-3">
                    <span className="relative flex h-2 w-2">
                      <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-cyan-400 opacity-75"></span>
                      <span className="relative inline-flex rounded-full h-2 w-2 bg-cyan-500"></span>
                    </span>
                    <div>
                      <div className="text-[10px] uppercase font-black text-cyan-400 tracking-widest">PAI Daemon Core</div>
                      <div className="text-[8px] font-bold text-white/40 uppercase">Offline Mirroring Active</div>
                    </div>
                  </div>

                  {/* Pulsierende EKG Pulse Line */}
                  <div className="h-8 w-full md:w-64 opacity-75 flex items-center justify-center">
                    <svg className="h-full w-full text-cyan-400/80" viewBox="0 0 100 30" preserveAspectRatio="none">
                      <path
                        d="M0 15 L35 15 L38 5 L41 27 L44 11 L47 15 L100 15"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="1.5"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      >
                        <animate
                          attributeName="stroke-dasharray"
                          values="0,100;100,0;0,100"
                          dur="2.5s"
                          repeatCount="indefinite"
                        />
                      </path>
                    </svg>
                  </div>

                  <div className="flex items-center gap-2 text-[9px] font-bold uppercase tracking-wider text-cyan-400/70">
                    <Terminal className="size-3" />
                    <span>User: Edgar (Admin)</span>
                  </div>
                </div>

                {/* 4-Quadranten Grid */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 content-start">
                  
                  {/* Card 1: SOUL.md */}
                  <div className="bg-black/45 border border-white/5 hover:border-cyan-500/20 rounded-2xl p-4 transition-all flex flex-col gap-2.5 backdrop-blur-md">
                    <div className="flex items-center justify-between border-b border-white/5 pb-2">
                      <div className="flex items-center gap-2">
                        <Sliders className="size-3.5 text-cyan-400" />
                        <span className="text-[10px] font-black uppercase tracking-wider text-white/80">🔮 KI-Identität (SOUL)</span>
                      </div>
                      <span className="text-[8px] font-mono text-cyan-500 bg-cyan-950/40 px-1.5 py-0.5 rounded border border-cyan-500/10 uppercase">
                        VAD 0.80 Active
                      </span>
                    </div>
                    <div className="flex-1 flex flex-col gap-1.5 text-[9px] leading-relaxed text-white/60">
                      <div className="flex items-start gap-1.5">
                        <span className="text-cyan-400">Direktive:</span>
                        <span>{extractValue(paiData.soul, 'Kern-Direktive', 'Zentrales Nervensystem des Chefs. Maximale Effizienz.')}</span>
                      </div>
                      <div className="flex items-start gap-1.5">
                        <span className="text-cyan-400">Modus:</span>
                        <span>{extractValue(paiData.soul, 'Modus', 'Ultra-Silent Executer')}</span>
                      </div>
                      {(() => {
                        const points = getSectionBulletpoints(paiData.soul, 'Rollenprofil', 3);
                        const displayPoints = points.length > 0 ? points : [
                          'Reaktivität: Reagiere ausschließlich bei expliziter Ansprache.',
                          'Stille-Regel: Verhalte dich absolut ruhig, erfrage niemals Aufgaben.',
                          'Filterung: Ignoriere Hintergrundgeräusche wie Musik oder TV.'
                        ];
                        return displayPoints.map((point, idx) => (
                          <div key={idx} className="flex items-start gap-1.5 text-white/40">
                            <span className="text-white/20">•</span>
                            <span>{point}</span>
                          </div>
                        ));
                      })()}
                    </div>
                  </div>

                  {/* Card 2: USER.md */}
                  <div className="bg-black/45 border border-white/5 hover:border-cyan-500/20 rounded-2xl p-4 transition-all flex flex-col gap-2.5 backdrop-blur-md">
                    <div className="flex items-center justify-between border-b border-white/5 pb-2">
                      <div className="flex items-center gap-2">
                        <User className="size-3.5 text-cyan-400" />
                        <span className="text-[10px] font-black uppercase tracking-wider text-white/80">👤 Benutzerprofil (USER)</span>
                      </div>
                      <span className="text-[8px] font-mono text-cyan-500 bg-cyan-950/40 px-1.5 py-0.5 rounded border border-cyan-500/10 uppercase">
                        Master-Admin
                      </span>
                    </div>
                    <div className="flex-1 flex flex-col gap-1.5 text-[9px] leading-relaxed text-white/60">
                      <div className="flex items-start gap-1.5">
                        <span className="text-cyan-400">Name:</span>
                        <span>{extractValue(paiData.user, 'Name', 'Edgar (Ed)')}</span>
                      </div>
                      <div className="flex items-start gap-1.5">
                        <span className="text-cyan-400">Rolle:</span>
                        <span>{extractValue(paiData.user, 'Role', 'System-Creator & Master-Administrator')}</span>
                      </div>
                      {(() => {
                        const points = getSectionBulletpoints(paiData.user, 'Preferences', 3);
                        const displayPoints = points.length > 0 ? points : [
                          'Clean Code: Modularität und Dateiaufteilung ab 200 Zeilen.',
                          'Docs-First Policy: Erst lesen, dann implementieren.',
                          'Aesthetics: Edle Cyan/Glassmorphismus-Designs.'
                        ];
                        return displayPoints.map((point, idx) => (
                          <div key={idx} className="flex items-start gap-1.5 text-white/40">
                            <span className="text-white/20">•</span>
                            <span>{point}</span>
                          </div>
                        ));
                      })()}
                    </div>
                  </div>

                  {/* Card 3: HEARTBEAT.md */}
                  <div className="bg-black/45 border border-white/5 hover:border-cyan-500/20 rounded-2xl p-4 transition-all flex flex-col gap-2.5 backdrop-blur-md">
                    <div className="flex items-center justify-between border-b border-white/5 pb-2">
                      <div className="flex items-center gap-2">
                        <Calendar className="size-3.5 text-cyan-400" />
                        <span className="text-[10px] font-black uppercase tracking-wider text-white/80">⏱️ Operativer Heartbeat</span>
                      </div>
                      <span className="text-[8px] font-mono text-cyan-500 bg-cyan-950/40 px-1.5 py-0.5 rounded border border-cyan-500/10 uppercase">
                        Music Autostart
                      </span>
                    </div>
                    <div className="flex-1 flex flex-col gap-1.5 text-[9px] leading-relaxed text-white/60">
                      <div className="flex items-start gap-1.5">
                        <span className="text-cyan-400">Taktung:</span>
                        <span>{extractValue(paiData.heartbeat, 'Morgenbriefing', '08:00 Morgenbriefing & 18:00 Tageszusammenfassung')}</span>
                      </div>
                      {(() => {
                        const points = getSectionBulletpoints(paiData.heartbeat, 'PC Startup Trigger', 3);
                        const displayPoints = points.length > 0 ? points : [
                          'Musik-Autostart bei jedem PC-Start aktiviert.',
                          'Audio-Bibliothek initialisieren nach Windows-Anmeldung.',
                          'Zufälligen lokalen Song abspielen für energetischen Start.'
                        ];
                        return displayPoints.map((point, idx) => (
                          <div key={idx} className="flex items-start gap-1.5 text-white/40">
                            <span className="text-white/20">•</span>
                            <span>{point}</span>
                          </div>
                        ));
                      })()}
                    </div>
                  </div>

                  {/* Card 4: ACCESS_POLICY.md */}
                  <div className="bg-black/45 border border-white/5 hover:border-cyan-500/20 rounded-2xl p-4 transition-all flex flex-col gap-2.5 backdrop-blur-md">
                    <div className="flex items-center justify-between border-b border-white/5 pb-2">
                      <div className="flex items-center gap-2">
                        <Shield className="size-3.5 text-cyan-400" />
                        <span className="text-[10px] font-black uppercase tracking-wider text-white/80">🔒 Sicherheits-Matrix</span>
                      </div>
                      <span className="text-[8px] font-mono text-emerald-400 bg-emerald-950/40 px-1.5 py-0.5 rounded border border-emerald-500/10 uppercase">
                        100% Secured
                      </span>
                    </div>
                    <div className="flex-1 flex flex-col gap-1.5 text-[9px] leading-relaxed text-white/60">
                      <div className="flex items-start gap-1.5">
                        <span className="text-cyan-400">Zugriff:</span>
                        <span>{extractValue(paiData.accessPolicy, 'Full Global Access', 'Exklusiver Vollzugriff für Edgar')}</span>
                      </div>
                      <div className="flex items-start gap-1.5">
                        <span className="text-cyan-400">Schutz:</span>
                        <span>{extractValue(paiData.accessPolicy, 'Stimmen-Filterung', 'Strikte Stimmfilterung & Dynamic Boundary Controls')}</span>
                      </div>
                      {(() => {
                        const points = getSectionBulletpoints(paiData.accessPolicy, 'Boundary Controls', 2);
                        const displayPoints = points.length > 0 ? points : [
                          'Stimmen-Filterung auf Edgar beschränkt.',
                          'Systemkritische Befehle blockieren bei unklarem Kontext.'
                        ];
                        return displayPoints.map((point, idx) => (
                          <div key={idx} className="flex items-start gap-1.5 text-white/40">
                            <span className="text-white/20">•</span>
                            <span>{point}</span>
                          </div>
                        ));
                      })()}
                      <div className="flex items-start gap-1.5 text-emerald-400/80 font-semibold gap-1">
                        <Lock className="size-2.5" />
                        <span>System abgeschirmt.</span>
                      </div>
                    </div>
                  </div>

                </div>
              </motion.div>
            )
          ) : (
            <motion.div
              key={activeTab}
              initial={{ opacity: 0, y: 5 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -5 }}
              className={`flex-1 min-h-0 p-4 flex flex-col gap-3 ${WIDGET_SCROLL_CLASS}`}
            >
              {loading ? (
                <div className="flex-1 flex flex-col items-center justify-center gap-2 text-white/30 text-[10px] uppercase tracking-wider font-bold">
                  <RotateCw className="size-5 text-cyan-500 animate-spin" />
                  Lade Profildaten...
                </div>
              ) : (
                <div className="flex-1 flex flex-col gap-2 h-full">
                  <div className="flex items-center justify-between text-[9px] uppercase tracking-wider text-white/30 font-bold border-b border-white/5 pb-1">
                    <span>
                      Identity-Edit: {activeTab === 'telos' ? 'TELOS.md (Leitbild)' : 'IDEAL_STATE.md (Erfolgsbild)'}
                    </span>
                    <span className="text-cyan-400/60 font-mono hidden md:inline">
                      C:\Users\ed\PAI\USER\{activeTab === 'telos' ? 'TELOS.md' : 'IDEAL_STATE.md'}
                    </span>
                  </div>
                  <textarea
                    value={activeTab === 'telos' ? telos : idealState}
                    onChange={(e) => activeTab === 'telos' ? setTelos(e.target.value) : setIdealState(e.target.value)}
                    className="flex-1 min-h-[280px] w-full bg-black/45 border border-white/5 rounded-xl p-4 text-[11px] font-mono text-cyan-300/80 placeholder:text-white/10 focus:outline-none focus:border-cyan-500/25 focus:ring-1 focus:ring-cyan-500/10 transition-all resize-none shadow-inner"
                    placeholder={`# Leitbild\nSchreibe dein Leitbild in Markdown...`}
                  />
                </div>
              )}
            </motion.div>
          )}
        </AnimatePresence>

        {/* Dezentes Raster nur im sichtbaren Inhaltsbereich */}
        <motion.div
          className="absolute inset-0 opacity-[0.02] pointer-events-none"
          style={{
            backgroundImage:
              'linear-gradient(rgba(255,255,255,0.1) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.1) 1px, transparent 1px)',
            backgroundSize: '20px 20px',
          }}
        />

        {/* Cybernetic Prompt Modal Overlay */}
        <AnimatePresence>
          {promptOpen && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="absolute inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-sm p-4"
            >
              <motion.div
                initial={{ scale: 0.95, y: 10, opacity: 0 }}
                animate={{ scale: 1, y: 0, opacity: 1 }}
                exit={{ scale: 0.95, y: 10, opacity: 0 }}
                transition={{ type: 'spring', damping: 25, stiffness: 350 }}
                className="w-full max-w-sm rounded-2xl border border-cyan-500/20 bg-black/90 p-5 shadow-[0_0_50px_rgba(6,182,212,0.15)] flex flex-col gap-4"
              >
                <div className="flex items-center gap-2 border-b border-white/5 pb-2">
                  <Terminal className="size-3.5 text-cyan-400" />
                  <span className="text-[10px] font-black uppercase tracking-[0.2em] text-cyan-400">
                    {promptTitle}
                  </span>
                </div>

                <p className="text-[9.5px] text-white/50 leading-relaxed font-light">
                  {promptPlaceholder}
                </p>

                <input
                  type="text"
                  autoFocus
                  value={promptValue}
                  onChange={(e) => setPromptValue(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') handlePromptSubmit();
                    if (e.key === 'Escape') handlePromptCancel();
                  }}
                  className="w-full h-9 px-3 rounded-lg bg-cyan-950/20 border border-white/5 focus:border-cyan-500/30 text-[11px] text-cyan-300 placeholder:text-white/10 focus:outline-none transition-all font-mono"
                  placeholder="Thema oder Problem eingeben..."
                />

                <div className="flex justify-end gap-2 mt-1">
                  <button
                    onClick={handlePromptCancel}
                    className="px-3 py-1.5 rounded-lg border border-white/5 hover:bg-white/5 text-[9px] font-bold uppercase tracking-wider text-white/40 hover:text-white/70 transition-all active:scale-95"
                  >
                    Abbrechen
                  </button>
                  <button
                    onClick={handlePromptSubmit}
                    className="px-4 py-1.5 rounded-lg bg-cyan-500/10 hover:bg-cyan-500/20 text-cyan-400 border border-cyan-500/20 text-[9px] font-bold uppercase tracking-wider transition-all hover:shadow-[0_0_10px_rgba(6,182,212,0.25)] active:scale-95"
                  >
                    Bestätigen
                  </button>
                </div>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </motion.div>
  );
}
