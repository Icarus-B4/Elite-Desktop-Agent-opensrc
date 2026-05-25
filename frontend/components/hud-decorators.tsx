'use client';

import React, { useState } from 'react';
import { useWidgetManager } from '@/components/dashboard/widget-manager';
import { Terminal as TermIcon, Loader2 } from 'lucide-react';

export const HudDecorators = () => {
  const { popOutWidget, widgets, detachedWidgets } = useWidgetManager() || {};
  const [loading, setLoading] = useState(false);

  const handleOpenTerminal = async () => {
    if (!popOutWidget || loading) return;
    setLoading(true);
    try {
      await popOutWidget('terminal');
    } catch (err) {
      console.error('Fehler beim Öffnen des Terminals:', err);
    } finally {
      setLoading(false);
    }
  };

  const terminalActive = widgets?.terminal && detachedWidgets?.terminal;

  return (
    <div className="fixed inset-0 pointer-events-none z-50 rounded-[32px] overflow-hidden">
      <div className="absolute inset-3 rounded-[28px] ring-1 ring-white/[0.06] pointer-events-none" />

      {/* Top Left Corner */}
      <div className="absolute top-10 left-10 w-12 h-12 border-t-2 border-l-2 border-primary/30 rounded-tl-2xl" />
      <div className="absolute top-10 left-10 w-2 h-2 bg-primary rounded-sm" />

      {/* Top Right Corner */}
      <div className="absolute top-10 right-10 w-12 h-12 border-t-2 border-r-2 border-primary/30 rounded-tr-2xl" />
      <div className="absolute top-10 right-10 w-2 h-2 bg-primary rounded-sm" />

      {/* Bottom Left Corner -> JETZT INTERAKTIVER TERMINAL BUTTON */}
      {typeof popOutWidget === 'function' ? (
        <button
          onClick={handleOpenTerminal}
          className={`absolute bottom-10 left-10 w-12 h-12 border-b-2 border-l-2 rounded-bl-2xl pointer-events-auto flex items-center justify-center group transition-all duration-300 bg-transparent ${
            terminalActive
              ? 'border-cyan-400'
              : 'border-primary/30 hover:border-cyan-400'
          }`}
          title="Elite Terminal öffnen"
          disabled={loading}
        >
          {/* Das kleine Quadrat an der Ecke */}
          <div className={`absolute bottom-0 left-0 w-2 h-2 rounded-sm transition-all duration-300 ${
            terminalActive 
              ? 'bg-cyan-400 shadow-[0_0_8px_#00f2ff]' 
              : 'bg-primary group-hover:bg-cyan-400 group-hover:shadow-[0_0_8px_#00f2ff]'
          }`} />
          
          {loading ? (
            <Loader2 size={13} className="animate-spin text-cyan-400" />
          ) : (
            <TermIcon 
              size={13} 
              className={`transition-all duration-300 ${
                terminalActive
                  ? 'text-cyan-300 scale-110'
                  : 'text-primary/45 group-hover:text-cyan-300 group-hover:scale-110'
              }`} 
            />
          )}
        </button>
      ) : (
        <>
          <div className="absolute bottom-10 left-10 w-12 h-12 border-b-2 border-l-2 border-primary/30 rounded-bl-2xl" />
          <div className="absolute bottom-10 left-10 w-2 h-2 bg-primary rounded-sm" />
        </>
      )}

      {/* Bottom Right Corner */}
      <div className="absolute bottom-10 right-10 w-12 h-12 border-b-2 border-r-2 border-primary/30 rounded-br-2xl" />
      <div className="absolute bottom-10 right-10 w-2 h-2 bg-primary rounded-sm" />

      <div className="absolute top-0 left-0 w-full h-[2px] bg-primary/10 animate-scanline shadow-[0_0_15px_var(--accent-glow)]" />
    </div>
  );
};
