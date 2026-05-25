'use client';

import { motion } from 'framer-motion';
import { 
  Terminal, X, Search, Zap, Music, Camera, Monitor, 
  MessageSquare, Briefcase, Settings, GripVertical,
  Cpu, Globe, Eye
} from 'lucide-react';
import { useWidgetManager } from './widget-manager';
import {
  useWidgetFullscreen,
  WidgetFullscreenButton,
  WidgetPopOutButton,
  WIDGET_PANEL_CLASS,
  WIDGET_HEADER_CLASS,
  WIDGET_INNER_CARD_CLASS,
  WIDGET_TITLE_CLASS,
} from './widget-shell';
import { useState } from 'react';

/**
 * CommandListWidget – Eine stylische Übersicht aller Elite-Befehle.
 */

interface Command {
  text: string;
  desc: string;
  category: 'system' | 'workspace' | 'media' | 'vision' | 'environment' | 'pai' | 'voice';
}

const COMMANDS: Command[] = [
  // Voice / Wake
  { text: "Elite, [Befehl]", desc: "Sprache: Immer mit Wake-Word „Elite“ oder „Jarvis“ beginnen (Modus Rauschfilter/Ultra-Strict).", category: 'voice' },
  { text: "Öffne [Programm] (ohne Elite)", desc: "Sprache Modus 1/2: Klarer Imperativ ohne Wake-Word möglich. Chat: nie Wake-Word nötig.", category: 'voice' },
  { text: "Stopp / Halt / Ruhe", desc: "Unterbricht sofortige Sprachausgabe.", category: 'voice' },

  // System
  { text: "Öffne [Programm]", desc: "Startet Apps wie Chrome, Spotify, Mail.", category: 'system' },
  { text: "Schließe das Fenster", desc: "Schließt die aktive Anwendung.", category: 'system' },
  { text: "Elite, wie ist der System-Status?", desc: "Zeigt CPU und RAM Auslastung.", category: 'system' },
  { text: "Ghost Mode aktivieren", desc: "Minimiert sofort alle Fenster und räumt das HUD auf.", category: 'system' },
  { text: "Clipboard-Überwachung", desc: "Elite erkennt automatisch Links, Fehler oder Code in der Zwischenablage.", category: 'system' },
  { text: "Elite, frag Hermes: [Aufgabe]", desc: "Delegiert an Hermes Agent (agentisch, Tools, Memory) via hermes_ask.", category: 'system' },
  { text: "Elite, suche in Hermes-Sessions [Thema]", desc: "FTS5-Suche in Hermes state.db (hermes_search_sessions).", category: 'system' },
  { text: "Elite, was steht in Mission Control?", desc: "Listet offene MC-Tasks.", category: 'system' },
  
  // Workspace
  { text: "Bereite das Coding vor", desc: "Öffnet Antigravity & Chrome im Splitscreen.", category: 'workspace' },
  { text: "Design-Workspace aktivieren", desc: "Optimiert den Desktop für Webdesign.", category: 'workspace' },
  { text: "Elite, Musik-Workspace", desc: "Startet Spotify & das Musik-Widget.", category: 'workspace' },
  { text: "Meeting Guard", desc: "Pausiert Musik und öffnet Notizen bei aktiven Calls (Zoom/Teams).", category: 'workspace' },
  
  // Media
  { text: "Spiele Playlist [Name]", desc: "Sucht und spielt Musik auf Spotify.", category: 'media' },
  { text: "Nächstes Lied / Pause", desc: "Steuert die Musikwiedergabe.", category: 'media' },
  { text: "Elite, was läuft gerade?", desc: "Startet den Audio-Scanner (Shazam-Mode) zur Musikerkennung.", category: 'media' },
  { text: "Kamera schließen", desc: "Beendet den Webcam-HUD Modus.", category: 'media' },

  // Vision
  { text: "Elite, was siehst du?", desc: "Startet einen visuellen Scan der Umgebung.", category: 'vision' },
  { text: "Elite, wie ist mein Zustand?", desc: "Führt ein Face-Tracking durch (Stimmung & Fokus).", category: 'vision' },
  { text: "Analysiere den Bildschirm", desc: "KI untersucht deinen aktuellen Screen.", category: 'vision' },
  { text: "Recherchiere zu [Thema]", desc: "Elite sucht im Web, macht Screenshots und analysiert Ergebnisse.", category: 'vision' },
  
  // Environment
  { text: "Wetter in [Stadt]", desc: "Aktualisiert das Wetter-Widget im HUD.", category: 'environment' },
  { text: "Merk dir das!", desc: "Speichert die letzte Information dauerhaft im Gedächtnis.", category: 'environment' },
  { text: "Lies dein Gedächtnis", desc: "Zeigt alle gespeicherten Informationen in der MEMORY.md.", category: 'environment' },

  // PAI / Loops (Chat oder Sprache)
  { text: "ideate [Thema]", desc: "Startet PAI-Ideate-Loop (9 Phasen). Im Chat ohne Wake-Word.", category: 'pai' },
  { text: "optimize [Thema]", desc: "Startet PAI-Optimize-Loop. Im Chat ohne Wake-Word.", category: 'pai' },
  { text: "run the Algorithm on [Aufgabe]", desc: "7-Phasen-Algorithmus (Observe→Learn). Chat bevorzugt.", category: 'pai' },
  { text: "Elite, starte Ideation zu …", desc: "Gesprochene Variante für Ideate-Loop.", category: 'pai' },
];

const CATEGORY_CONFIG: Record<string, { icon: any; color: string; label: string }> = {
  voice: { icon: MessageSquare, color: 'text-sky-400', label: 'Sprache & Wake-Word' },
  pai: { icon: Zap, color: 'text-rose-400', label: 'PAI & Loops' },
  system: { icon: Monitor, color: 'text-blue-400', label: 'System' },
  workspace: { icon: Briefcase, color: 'text-amber-400', label: 'Workspaces' },
  media: { icon: Music, color: 'text-purple-400', label: 'Media' },
  vision: { icon: Eye, color: 'text-cyan-400', label: 'Vision' },
  environment: { icon: Globe, color: 'text-emerald-400', label: 'Environment' },
};

export function CommandListWidget() {
  const { closeWidget } = useWidgetManager();
  const { layout, getShellClass } = useWidgetFullscreen('commandList');
  const [search, setSearch] = useState('');

  const filtered = COMMANDS.filter(c => 
    c.text.toLowerCase().includes(search.toLowerCase()) || 
    c.desc.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <motion.div
      key="commandList"
      layout={layout}
      initial={{ opacity: 0, scale: 0.95, y: 10 }}
      animate={{ opacity: 1, scale: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.95, y: 10 }}
      className={getShellClass(
        `flex flex-col ${WIDGET_PANEL_CLASS} min-h-[450px] max-h-[650px]`,
      )}
    >
      {/* Header */}
      <motion.div className={`${WIDGET_HEADER_CLASS} px-5 py-4`}>
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-xl bg-cyan-500/10 text-cyan-400 ring-1 ring-cyan-500/12">
            <Zap className="size-4" />
          </div>
          <div>
            <h3 className={WIDGET_TITLE_CLASS}>Elite Commands</h3>
            <p className="text-[8px] text-white/20 font-bold uppercase tracking-widest">Neural Command Index</p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <WidgetPopOutButton widgetId="commandList" iconClassName="size-4" />
          <WidgetFullscreenButton widgetId="commandList" iconClassName="size-4" />
          <button
            onClick={() => closeWidget('commandList')}
            className="p-1.5 rounded-lg hover:bg-red-500/10 text-white/30 hover:text-red-400 transition-all"
          >
            <X className="size-4" />
          </button>
        </div>
      </motion.div>

      {/* Search Bar */}
      <div className={`${WIDGET_HEADER_CLASS} px-5 py-3`}>
        <div className="relative group">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-3.5 text-white/20 group-focus-within:text-cyan-400 transition-colors" />
          <input 
            type="text" 
            placeholder="Nach Befehlen suchen..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full bg-[rgba(var(--hud-surface-rgb),0.6)] rounded-xl py-2 pl-9 pr-4 text-[10px] text-white placeholder:text-white/10 focus:outline-none focus:shadow-[inset_0_0_0_1px_var(--accent-border)] transition-all hud-inner-surface"
          />
        </div>
      </div>

      {/* List */}
      <div className="flex-1 overflow-y-auto p-4 space-y-6 no-scrollbar bg-[#040c14]/85">
        {Object.entries(CATEGORY_CONFIG).map(([cat, config]) => {
          const catCommands = filtered.filter(c => c.category === cat);
          if (catCommands.length === 0) return null;

          const Icon = config.icon;

          return (
            <div key={cat} className="space-y-3">
              <div className="flex items-center gap-2 px-1">
                <Icon className={`size-3 ${config.color} opacity-70`} />
                <span className="text-[9px] font-black uppercase tracking-[0.2em] text-white/40">{config.label}</span>
                <div className="h-px flex-1 bg-gradient-to-r from-white/5 to-transparent ml-2" />
              </div>
              
              <div className="grid gap-2">
                {catCommands.map((cmd, i) => (
                  <motion.div
                    key={i}
                    whileHover={{ x: 4, backgroundColor: "rgba(255,255,255,0.04)" }}
                    className={`p-3 rounded-xl ${WIDGET_INNER_CARD_CLASS} group cursor-help transition-all`}
                  >
                    <div className="flex items-center justify-between gap-4">
                      <span className="text-[10px] font-bold text-cyan-400/80 font-mono tracking-tight group-hover:text-cyan-400 transition-colors">
                        &quot;{cmd.text}&quot;
                      </span>
                      <div className="h-1 w-1 rounded-full bg-white/5 group-hover:bg-cyan-500/50 transition-colors" />
                    </div>
                    <p className="text-[9px] text-white/20 mt-1.5 font-medium group-hover:text-white/40 transition-colors leading-relaxed">
                      {cmd.desc}
                    </p>
                  </motion.div>
                ))}
              </div>
            </div>
          );
        })}

        {filtered.length === 0 && (
          <div className="flex flex-col items-center justify-center py-20 text-white/10">
            <Zap className="size-10 mb-3 opacity-10 animate-pulse" />
            <p className="text-[10px] font-black uppercase tracking-[0.2em]">No Data Link Found</p>
          </div>
        )}
      </div>

      {/* Footer Info */}
      <div className="p-3 bg-[#061018]/90 border-t border-white/5 flex items-center justify-between px-6">
        <div className="flex items-center gap-1.5">
          <div className="size-1 rounded-full bg-cyan-400 animate-pulse" />
          <span className="text-[7px] font-black uppercase tracking-widest text-white/30">AI Listening</span>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="text-[7px] font-mono text-white/20 uppercase tracking-widest">v2.1.0-Core</span>
        </div>
        <div className="flex items-center gap-1.5">
          <div className="size-1 rounded-full bg-emerald-400" />
          <span className="text-[7px] font-black uppercase tracking-widest text-white/30">Neural Sync</span>
        </div>
      </div>
    </motion.div>
  );
}
