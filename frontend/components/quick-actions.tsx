'use client';

import React, { useRef } from 'react';
import { motion } from 'framer-motion';
import {
  Camera,
  FolderOpen,
  Globe,
  Mail,
  Smartphone,
  MonitorCheck,
  Terminal,
  Trash2,
  Activity,
  Brain,
  X,
  VolumeX, // Hinzugefügt für Stop Voice
} from 'lucide-react';

interface QuickActionsProps {
  /** Sendet einen Befehl an den Chat */
  onSendCommand: (command: string) => void;
  /** Öffnet das QR-Code Overlay */
  onOpenCamera?: () => void;
  /** Löscht den Chat-Verlauf */
  onClearChat?: () => void;
}

/** Verfügbare Quick-Action Buttons */
const ACTIONS = [
  {
    id: 'stop_voice',
    icon: VolumeX,
    label: 'Voice Stopp',
    command: 'SYSTEM_BEFEHL: Brich deine aktuelle Sprachausgabe sofort ab und antworte nur mit "Abgebrochen".',
    color: 'text-white/70',
    bgColor: 'bg-white/5 hover:bg-white/10 ring-white/10',
  },
  {
    id: 'deep_scan',
    icon: Activity,
    label: 'Deep Scan',
    command: 'SYSTEM_BEFEHL: Führe sofort die Tools get_open_windows UND capture_screen aus. Keine Rückfragen.',
    color: 'text-red-400',
    bgColor: 'bg-red-500/10 hover:bg-red-500/20 ring-red-500/20',
  },
  {
    id: 'cam_eye',
    icon: Camera,
    label: 'Cam-Auge',
    command: 'SYSTEM_BEFEHL: Führe sofort capture_webcam aus. Keine Rückfragen.',
    color: 'text-purple-400',
    bgColor: 'bg-purple-500/10 hover:bg-purple-500/20 ring-purple-500/20',
  },
  {
    id: 'screenshot',
    icon: Camera,
    label: 'Screenshot',
    command: 'SYSTEM_BEFEHL: Führe sofort capture_screen aus. Keine Rückfragen.',
    color: 'text-cyan-400',
    bgColor: 'bg-cyan-500/10 hover:bg-cyan-500/20 ring-cyan-500/20',
  },
  {
    id: 'files',
    icon: FolderOpen,
    label: 'Dateien',
    command: 'SYSTEM_BEFEHL: Führe execute_system_command mit "dir %userprofile%\\Downloads" aus.',
    color: 'text-amber-400',
    bgColor: 'bg-amber-500/10 hover:bg-amber-500/20 ring-amber-500/20',
  },
  {
    id: 'close_browser',
    icon: X,
    label: 'Kill Browser',
    command: 'SYSTEM_BEFEHL: Führe sofort close_window für "chrome" UND "edge" aus.',
    color: 'text-rose-400',
    bgColor: 'bg-rose-500/10 hover:bg-rose-500/20 ring-rose-500/20',
  },
  {
    id: 'memory',
    icon: Brain,
    label: 'Gedächtnis',
    command: 'SYSTEM_BEFEHL: Führe read_agent_memory aus.',
    color: 'text-indigo-400',
    bgColor: 'bg-indigo-500/10 hover:bg-indigo-500/20 ring-indigo-500/20',
  },
  {
    id: 'system',
    icon: MonitorCheck,
    label: 'System',
    command: 'SYSTEM_BEFEHL: Führe get_system_info aus.',
    color: 'text-emerald-400',
    bgColor: 'bg-emerald-500/10 hover:bg-emerald-500/20 ring-emerald-500/20',
  },
];

/**
 * Quick-Action Buttons – Horizontale Leiste mit häufig genutzten Funktionen.
 * Wird über dem Chat-Input angezeigt, wenn der Agent verbunden ist.
 */
export function QuickActions({ onSendCommand, onOpenCamera, onClearChat }: QuickActionsProps) {
  const scrollRef = useRef<HTMLDivElement>(null);

  const handleWheel = (e: React.WheelEvent<HTMLDivElement>) => {
    if (scrollRef.current) {
      // Wandelt vertikales Scrollen (Mausrad) in horizontales Scrollen um
      scrollRef.current.scrollBy({ left: e.deltaY > 0 ? 80 : -80, behavior: 'auto' });
    }
  };

  return (
    <motion.div
      ref={scrollRef}
      onWheel={handleWheel}
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.3 }}
      className="flex items-center gap-2 overflow-x-auto no-scrollbar px-1 py-2 cursor-ew-resize"
    >
      {ACTIONS.map((action, i) => (
        <motion.button
          key={action.id}
          initial={{ opacity: 0, scale: 0.8 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ delay: 0.1 * i }}
          onClick={() => onSendCommand(action.command)}
          className={`flex items-center gap-2 whitespace-nowrap rounded-xl px-3 py-2 text-[11px] font-bold uppercase tracking-wider ring-1 transition-all active:scale-95 ${action.bgColor} ${action.color}`}
          title={action.label}
        >
          <action.icon className="size-3.5" />
          <span className="hidden sm:inline">{action.label}</span>
        </motion.button>
      ))}

      {/* Smartphone-Kamera Button */}
      {onOpenCamera && (
        <motion.button
          initial={{ opacity: 0, scale: 0.8 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ delay: 0.6 }}
          onClick={onOpenCamera}
          className="flex items-center gap-2 whitespace-nowrap rounded-xl px-3 py-2 text-[11px] font-bold uppercase tracking-wider ring-1 transition-all active:scale-95 bg-white/5 hover:bg-white/10 ring-white/10 text-white/50 hover:text-white/80"
          title="Smartphone-Kamera"
        >
          <Smartphone className="size-3.5" />
          <span className="hidden sm:inline">Kamera</span>
        </motion.button>
      )}

      {/* Chat löschen Button */}
      {onClearChat && (
        <motion.button
          initial={{ opacity: 0, scale: 0.8 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ delay: 0.7 }}
          onClick={onClearChat}
          className="flex items-center gap-2 whitespace-nowrap rounded-xl px-3 py-2 text-[11px] font-bold uppercase tracking-wider ring-1 transition-all active:scale-95 bg-red-500/5 hover:bg-red-500/15 ring-red-500/10 text-red-400/50 hover:text-red-400"
          title="Chat löschen"
        >
          <Trash2 className="size-3.5" />
        </motion.button>
      )}
    </motion.div>
  );
}
