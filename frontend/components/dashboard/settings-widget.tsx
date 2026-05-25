'use client';

import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import {
  Bot,
  Mic,
  LayoutGrid,
  Terminal,
  Activity,
  Rocket,
  Zap,
  X,
} from 'lucide-react';
import { useWidgetManager } from './widget-manager';
import { AdaCapabilitiesPanel } from './ada-capabilities-panel';

/**
 * SettingsWidget – das ehemalige "Settings Center" (Soul Matrix, Voice Assistant,
 * HUD Aesthetics, ...) jetzt als Widget. Wird über das Settings-Icon in der
 * Bottom-Toolbar getoggelt – kein Routen-Wechsel mehr.
 * Verwendet das große Seitenlayout, nicht das kompakte Widget-Shell-Styling.
 */
export function SettingsWidget() {
  const { closeWidget, toggleWidget } = useWidgetManager();

  const [activeSettings, setActiveSettings] = useState<Record<string, number>>({
    'Soul Matrix': 0,
    'Voice Assistant': 1,
    'HUD Aesthetics': 0,
    'System Access': 1,
    'Security Link': 0,
    'Module Control': 0,
  });
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    fetch('/api/elite/settings')
      .then((res) => res.json())
      .then((data) => {
        setActiveSettings({
          'Soul Matrix': data.soulMatrix ?? 0,
          'Voice Assistant': data.voiceAssistant ?? 1,
          'HUD Aesthetics': data.hudAesthetics ?? 0,
          'System Access': data.systemAccess ?? 1,
          'Security Link': data.securityLink ?? 0,
          'Module Control': data.moduleControl ?? 0,
        });
      })
      .catch((err) => console.error('Fehler beim Laden der Settings:', err));
  }, []);

  const handleOptionClick = async (
    title: string,
    index: number,
    isCommandTrigger?: boolean,
  ) => {
    if (isCommandTrigger) {
      toggleWidget('commandList');
      return;
    }
    const newSettings = { ...activeSettings, [title]: index };
    setActiveSettings(newSettings);

    setIsSaving(true);
    try {
      await fetch('/api/elite/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          soulMatrix: newSettings['Soul Matrix'],
          voiceAssistant: newSettings['Voice Assistant'],
          hudAesthetics: newSettings['HUD Aesthetics'],
          systemAccess: newSettings['System Access'],
          securityLink: newSettings['Security Link'],
          moduleControl: newSettings['Module Control'],
        }),
      });
      window.dispatchEvent(new CustomEvent('elite-settings-updated'));
    } catch (err) {
      console.error('Fehler beim Speichern:', err);
    } finally {
      setTimeout(() => setIsSaving(false), 500);
    }
  };

  const settings: {
    title: string;
    desc: string;
    icon: any;
    options: string[];
    isCommandTrigger?: boolean;
  }[] = [
    {
      title: 'Soul Matrix',
      desc: 'Tonfall-Overlay (SOUL.md bleibt Butler-Basis): Elite=knapp, Jarvis=proaktiver, Ghost=minimal',
      icon: Bot,
      options: ['Elite (Standard)', 'Jarvis (Hilfsbereit)', 'Ghost (Diskret)'],
    },
    {
      title: 'Voice Assistant',
      desc: '0/3=nur „Elite/Jarvis"; 1/2=auch klare Befehle („Öffne …"); Chat immer ohne Wake-Word',
      icon: Mic,
      options: [
        'Rauschfilter (empfohlen)',
        'Hohe Empfindlichkeit',
        'Schnelle Antwort',
        'Ultra-Strict VAD (0.8)',
      ],
    },
    {
      title: 'HUD Aesthetics',
      desc: 'Accent Colors & Transparenz-Level',
      icon: LayoutGrid,
      options: ['Cyan-Neon', 'Amber-Retro', 'Matrix-Green'],
    },
    {
      title: 'System Access',
      desc: 'Berechtigungen für File-Access & Shell',
      icon: Terminal,
      options: ['Read-Only', 'Full-Control', 'Restricted'],
    },
    {
      title: 'Security Link',
      desc: 'Verschlüsselung & Missions-Sync',
      icon: Activity,
      options: ['AES-256', 'Live-Sync', 'Local-Only'],
    },
    {
      title: 'Module Control',
      desc: 'Aktive Hintergrund-Prozesse',
      icon: Rocket,
      options: ['Optimized', 'High-Performance', 'Eco-Mode'],
    },
    {
      title: 'Command Index',
      desc: 'Liste aller verfügbaren Befehle',
      icon: Zap,
      options: ['Übersicht öffnen'],
      isCommandTrigger: true,
    },
  ];

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.95 }}
      transition={{ duration: 0.3 }}
      className="fixed inset-0 z-[9999] bg-[#000b1a] flex flex-col"
    >
      {/* Close Button (Top Right) */}
      <div className="absolute top-6 right-6 z-50">
        <button
          onClick={() => closeWidget('settings')}
          className="p-3 rounded-xl bg-white/5 hover:bg-red-500/10 text-white/40 hover:text-red-400 transition-all ring-1 ring-white/10 hover:ring-red-400/30"
          title="Schließen"
        >
          <X className="size-5" />
        </button>
      </div>

      {/* Settings Content mit dem originalen SettingsCenter Layout */}
      <div className="relative z-10 flex-1 overflow-y-auto px-6 py-8 no-scrollbar">
        <div className="max-w-6xl mx-auto">
          <div className="flex items-center justify-between mb-8">
            <div className="flex items-center gap-4">
              <div className="size-2 rounded-full bg-primary animate-pulse shadow-[0_0_10px_var(--accent-glow)]" />
              <span className="text-[10px] font-black uppercase tracking-[0.4em] text-primary/70">
                Matrix Sync Status: {isSaving ? 'Synchronizing...' : 'Live'}
              </span>
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
                        <h3 className="text-sm font-black uppercase tracking-wider text-white/90">
                          {s.title}
                        </h3>
                        <p className="text-[10px] text-white/30 font-medium">{s.desc}</p>
                      </div>
                    </div>

                    <div className="space-y-2 mt-auto">
                      {s.options.map((opt, oi) => (
                        <button
                          key={opt}
                          onClick={() => handleOptionClick(s.title, oi, s.isCommandTrigger)}
                          className={`w-full flex items-center justify-between px-4 py-2.5 rounded-xl text-[10px] font-bold uppercase tracking-widest transition-all ${
                            oi === activeIndex && !s.isCommandTrigger
                              ? 'bg-primary text-black shadow-[0_0_20px_var(--accent-glow)]'
                              : 'bg-white/5 text-white/40 hover:bg-white/10 hover:text-white'
                          }`}
                        >
                          {opt}
                          {oi === activeIndex && !s.isCommandTrigger && (
                            <Activity className="size-3" />
                          )}
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
    </motion.div>
  );
}
