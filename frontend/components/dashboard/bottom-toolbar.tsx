'use client';

import { ReactNode } from 'react';
import { motion } from 'framer-motion';
import {
  Camera, Grid3X3, MessageSquare, Activity,
  Music, Terminal, Mic, LayoutDashboard, FileText, Rocket, Trash2, Maximize2, LayoutGrid, Settings, Zap, Sliders, HeartPulse,
  Box, Printer, Globe, Lightbulb, Lock,
} from 'lucide-react';
import { usePathname, useRouter } from 'next/navigation';
import { useWidgetManager, WidgetId } from './widget-manager';

/**
 * Bottom Toolbar – Minimalistisch:
 * Nur Icons, kein Text, kompakte Pill am unteren Rand.
 * Aktiver Widget: kleiner Dot darunter.
 *
 * Props:
 *  prepend – Optional: Inhalt der VOR den Widget-Icons erscheint (z.B. VoiceControls)
 */

const ITEMS: { id: WidgetId; icon: any; title: string; dot: string }[] = [
  { id: 'webcam',         icon: Camera,         title: 'Webcam',          dot: 'bg-purple-400' },
  { id: 'imageGrid',      icon: Grid3X3,        title: 'Bilder',          dot: 'bg-cyan-400'   },
  { id: 'chat',           icon: MessageSquare,  title: 'Chat',            dot: 'bg-cyan-400'   },
  { id: 'systemMonitor',  icon: Activity,       title: 'System',          dot: 'bg-emerald-400'},
  { id: 'music',          icon: Music,          title: 'Musik',           dot: 'bg-green-400'  },
  { id: 'logStream',      icon: Terminal,       title: 'Logs',            dot: 'bg-amber-400'  },
  { id: 'textEditor',     icon: FileText,       title: 'Text Editor',     dot: 'bg-amber-400'  },
  { id: 'cad',            icon: Box,            title: 'CAD',             dot: 'bg-cyan-400'   },
  { id: 'printer',        icon: Printer,        title: 'Drucker',         dot: 'bg-violet-400' },
  { id: 'browserAgent',   icon: Globe,          title: 'Web Agent',       dot: 'bg-sky-400'    },
  { id: 'kasa',           icon: Lightbulb,      title: 'Kasa',            dot: 'bg-yellow-400' },
];

interface Props {
  /** Optionaler Inhalt VOR den Widget-Icons (z.B. VoiceAssistantControlBar auf der Hauptseite) */
  prepend?: ReactNode;
}

export function BottomToolbar({ prepend }: Props = {}) {
  const { widgets, detachedWidgets, toggleWidget, toggleAllWidgets, clearChatHistory } = useWidgetManager();
  const pathname = usePathname();
  const router = useRouter();
  const isDashboard = pathname === '/dashboard';
  const missionControlActive = widgets.missionControl && !detachedWidgets.missionControl;
  const missionControlPoppedOut = widgets.missionControl && detachedWidgets.missionControl;

  return (
    <div className="fixed inset-x-0 bottom-6 z-[9999] px-4 pointer-events-none">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.4, type: 'spring', stiffness: 260, damping: 24 }}
        className="mx-auto flex w-max max-w-full items-center gap-1 px-3 py-2 rounded-2xl hud-toolbar backdrop-blur-md shadow-[0_8px_32px_rgba(0,0,0,0.7)] pointer-events-auto"
      >

        {/* Zurück zur Hauptseite (nur auf Dashboard sichtbar) */}
        {isDashboard && (
          <>
            <motion.button
              onClick={() => router.push('/')}
              whileHover={{ scale: 1.15, y: -2 }}
              whileTap={{ scale: 0.9 }}
              title="Zurück zum Voice-Interface"
              className="flex items-center justify-center size-8 rounded-xl text-primary bg-primary/10 ring-1 ring-primary/20 transition-all"
            >
              <Mic className="size-[15px]" />
            </motion.button>
            <div className="w-px h-5 bg-white/10 mx-1" />
          </>
        )}

        {/* Optionaler Prepend-Inhalt (z.B. Voice Controls auf der Hauptseite) */}
        {prepend && (
          <>
            {prepend}
            <div className="w-px h-5 bg-white/10 mx-1" />
          </>
        )}

        {/* Widget-Icons */}
        {ITEMS.map(({ id, icon: Icon, title, dot }) => {
          const active = widgets[id] && !detachedWidgets[id];
          const poppedOut = widgets[id] && detachedWidgets[id];
          return (
            <motion.button
              key={id}
              type="button"
              whileHover={{ scale: 1.15, y: -2 }}
              whileTap={{ scale: 0.9 }}
              onClick={() => {
                if (id === 'chat' && active) {
                  (document.activeElement as HTMLElement | null)?.blur?.();
                }
                toggleWidget(id);
              }}
              title={poppedOut ? `${title} (Pop-out — Klicken für HUD)` : title}
              className="relative flex items-center justify-center size-8 rounded-xl transition-colors"
              style={{
                color: active
                  ? 'rgba(var(--accent-color), 0.95)'
                  : poppedOut
                    ? 'rgba(192, 132, 252, 0.85)'
                    : 'rgba(255,255,255,0.25)',
                background: active
                  ? 'rgba(var(--accent-color), 0.1)'
                  : poppedOut
                    ? 'rgba(192, 132, 252, 0.08)'
                    : 'transparent',
              }}
            >
              <Icon className="size-[15px]" />
              {/* Aktiv-Dot */}
              {active && (
                <motion.span
                  layoutId={`dot-${id}`}
                  className={`absolute -bottom-0.5 left-1/2 -translate-x-1/2 size-[3px] rounded-full ${dot}`}
                  transition={{ type: 'spring', stiffness: 500, damping: 30 }}
                />
              )}
            </motion.button>
          );
        })}

        {/* Trenner */}
        <div className="w-px h-5 bg-white/10 mx-1" />

        {/* Clear Chat History (Global) */}
        <motion.button
          whileHover={{ scale: 1.15, y: -2 }}
          whileTap={{ scale: 0.9 }}
          onClick={() => clearChatHistory()}
          title="Chat-Verlauf löschen"
          className="flex items-center justify-center size-8 rounded-xl text-white/20 hover:text-red-400 transition-colors"
        >
          <Trash2 className="size-[15px]" />
        </motion.button>

        {/* Trenner */}
        <div className="w-px h-5 bg-white/10 mx-1" />

        {/* Alle Widgets umschalten (Ein/Aus) */}
        <motion.button
          whileHover={{ scale: 1.15, y: -2 }}
          whileTap={{ scale: 0.9 }}
          onClick={() => toggleAllWidgets()}
          title="Alle Widgets ein/ausblenden"
          className="flex items-center justify-center size-8 rounded-xl text-white/25 hover:text-primary transition-colors"
        >
          <LayoutGrid className="size-[15px]" />
        </motion.button>

        {/* Befehle-Widget */}
        <motion.button
          onClick={() => toggleWidget('commandList')}
          whileHover={{ scale: 1.15, y: -2 }}
          whileTap={{ scale: 0.9 }}
          title={widgets.commandList && detachedWidgets.commandList ? 'Befehle (Pop-out — Klicken für HUD)' : 'Befehle'}
          className="relative flex items-center justify-center size-8 rounded-xl transition-colors"
          style={{
            color: widgets.commandList && !detachedWidgets.commandList
              ? 'rgba(var(--accent-color), 0.95)'
              : widgets.commandList && detachedWidgets.commandList
                ? 'rgba(192, 132, 252, 0.85)'
                : 'rgba(255,255,255,0.25)',
            background: widgets.commandList && !detachedWidgets.commandList
              ? 'rgba(var(--accent-color), 0.1)'
              : widgets.commandList && detachedWidgets.commandList
                ? 'rgba(192, 132, 252, 0.08)'
                : 'transparent',
          }}
        >
          <Zap className="size-[15px]" />
          {widgets.commandList && !detachedWidgets.commandList && (
            <motion.span
              layoutId="dot-commandList"
              className="absolute -bottom-0.5 left-1/2 -translate-x-1/2 size-[3px] rounded-full bg-cyan-400"
              transition={{ type: 'spring', stiffness: 500, damping: 30 }}
            />
          )}
        </motion.button>

        {/* Settings – öffnet das Settings-Widget im Fullscreen-Modus */}
        <motion.button
          onClick={() => toggleWidget('settings')}
          whileHover={{ scale: 1.15, y: -2 }}
          whileTap={{ scale: 0.9 }}
          title="Einstellungs-Widget"
          className={`relative flex items-center justify-center size-8 rounded-xl transition-colors ${
            widgets.settings ? 'text-primary bg-primary/10' : 'text-white/20 hover:text-primary'
          }`}
        >
          <Settings className="size-[15px]" />
          {widgets.settings && (
            <motion.span
              layoutId="dot-settings"
              className="absolute -bottom-0.5 left-1/2 -translate-x-1/2 size-[3px] rounded-full bg-cyan-400"
              transition={{ type: 'spring', stiffness: 500, damping: 30 }}
            />
          )}
        </motion.button>

        {/* Fullscreen Toggle */}
        <motion.button
          whileHover={{ scale: 1.15, y: -2 }}
          whileTap={{ scale: 0.9 }}
          onClick={() => {
            if (!document.fullscreenElement) {
               document.documentElement.requestFullscreen();
            } else if (document.exitFullscreen) {
               document.exitFullscreen();
            }
          }}
          title="Vollbild umschalten"
          className="flex items-center justify-center size-8 rounded-xl text-white/20 hover:text-primary transition-colors"
        >
          <Maximize2 className="size-[15px]" />
        </motion.button>

        {/* Trenner */}
        <div className="w-px h-5 bg-white/10 mx-1" />

        {/* Mikro / Elite Voice – nur wenn KEIN prepend und NICHT auf Dashboard */}
        {!prepend && !isDashboard && (
          <motion.button
            onClick={() => router.push('/')}
            whileHover={{ scale: 1.15, y: -2 }}
            whileTap={{ scale: 0.9 }}
            title="Elite Voice"
            className="relative flex items-center justify-center size-8 rounded-xl text-white/25 hover:text-primary transition-colors"
          >
            <Mic className="size-[15px]" />
            <motion.span
              className="absolute inset-0 rounded-xl border border-cyan-500/0"
              animate={{ borderColor: ['rgba(0,242,255,0)', 'rgba(0,242,255,0.25)', 'rgba(0,242,255,0)'] }}
              transition={{ duration: 3, repeat: Infinity }}
            />
          </motion.button>
        )}

        {/* Mission Control – direkt neben PAI Core */}
        <motion.button
          type="button"
          whileHover={{ scale: 1.15, y: -2 }}
          whileTap={{ scale: 0.9 }}
          onClick={() => toggleWidget('missionControl')}
          title={missionControlPoppedOut ? 'Hermes Agent (Pop-out — Klicken für HUD)' : 'Hermes Agent'}
          className="relative flex items-center justify-center size-8 rounded-xl transition-colors"
          style={{
            color: missionControlActive
              ? 'rgba(var(--accent-color), 0.95)'
              : missionControlPoppedOut
                ? 'rgba(192, 132, 252, 0.85)'
                : 'rgba(255,255,255,0.25)',
            background: missionControlActive
              ? 'rgba(var(--accent-color), 0.1)'
              : missionControlPoppedOut
                ? 'rgba(192, 132, 252, 0.08)'
                : 'transparent',
          }}
        >
          <Rocket className="size-[15px]" />
          {missionControlActive && (
            <motion.span
              layoutId="dot-missionControl"
              className="absolute -bottom-0.5 left-1/2 -translate-x-1/2 size-[3px] rounded-full bg-green-400"
              transition={{ type: 'spring', stiffness: 500, damping: 30 }}
            />
          )}
        </motion.button>

        {/* PAI Core Widget Toggle (Dedicated Button) */}
        <motion.button
          whileHover={{ scale: 1.15, y: -2 }}
          whileTap={{ scale: 0.9 }}
          onClick={() => toggleWidget('paiPulse')}
          title="PAI Core Dashboard"
          className="relative flex items-center justify-center size-8 rounded-xl transition-colors"
          style={{
            color: widgets['paiPulse'] ? 'rgba(6, 182, 212, 1)' : 'rgba(255, 255, 255, 0.3)',
            background: widgets['paiPulse'] ? 'rgba(6, 182, 212, 0.1)' : 'transparent',
            boxShadow: widgets['paiPulse'] ? '0 0 15px rgba(6, 182, 212, 0.4)' : 'none'
          }}
        >
          <HeartPulse className="size-[16px]" />
          {widgets['paiPulse'] && (
            <motion.span
              layoutId="dot-paiPulse"
              className="absolute -bottom-0.5 left-1/2 -translate-x-1/2 size-[3px] rounded-full bg-cyan-400"
              transition={{ type: 'spring', stiffness: 500, damping: 30 }}
            />
          )}
        </motion.button>

        {/* Status-Dot */}
        <div className="ml-1 flex items-center">
          <span className="size-[5px] rounded-full bg-emerald-400 animate-pulse" />
        </div>
      </motion.div>
    </div>
  );
}
