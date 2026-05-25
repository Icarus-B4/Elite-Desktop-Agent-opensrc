import React, { useState, useEffect, useCallback, forwardRef } from 'react';
import { motion } from 'framer-motion';
import { Music, X, Play, Pause, SkipForward, SkipBack, Volume2, Shuffle, Repeat, List, Loader2, GripVertical } from 'lucide-react';
import { useWidgetManager } from './widget-manager';
import { useWidgetFullscreen, WidgetFullscreenButton, WidgetPopOutButton, WIDGET_PANEL_CLASS, WIDGET_HEADER_CLASS, WIDGET_TITLE_CLASS } from './widget-shell';

/**
 * Musik-Widget: Simuliertes Spotify-artiges Playback mit Steuerung.
 * Zeigt aktuelle Wiedergabe-Info und Audio-Visualizer.
 */

interface Track {
  title: string;
  artist: string;
  album: string;
  duration: number; // Sekunden
  color: string;    // Gradient-Farbe für Cover
}

const PLAYLIST: Track[] = [
  { title: 'Neon Lights', artist: 'Synthwave Elite', album: 'Digital Dreams', duration: 234, color: 'from-primary/60 to-primary/70' },
  { title: 'Midnight Drive', artist: 'RetroWave', album: 'Night City', duration: 198, color: 'from-purple-600 to-pink-700' },
  { title: 'Data Stream', artist: 'Circuit Breaker', album: 'Binary', duration: 267, color: 'from-emerald-600 to-teal-700' },
  { title: 'Ghost Protocol', artist: 'Phantom Signal', album: 'Zero Day', duration: 312, color: 'from-red-600 to-orange-700' },
  { title: 'Electric Soul', artist: 'Voltage', album: 'Pulse', duration: 189, color: 'from-amber-600 to-yellow-700' },
];

export const MusicWidget = forwardRef<HTMLDivElement>((props, ref) => {
  const { closeWidget, addLog, musicLibrary, updateMusicLibrary } = useWidgetManager();
  const { layout, getShellClass } = useWidgetFullscreen('music');
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentSong, setCurrentSong] = useState<string | null>(null);
  const [volume, setVolume] = useState(0.7);
  const [showLibrary, setShowLibrary] = useState(false);

  // 🚀 STABILE BRÜCKE: Lade Songs direkt vom lokalen Server
  useEffect(() => {
    const fetchSongs = async () => {
      try {
        const resp = await fetch("http://localhost:8001/music");
        if (resp.ok) {
          const data = await resp.json();
          if (data.songs && data.songs.length > 0) {
            // Nur updaten wenn sich die Anzahl geändert hat um Loops zu vermeiden
            if (data.songs.length !== musicLibrary.length) {
              updateMusicLibrary(data.songs);
            }
          }
        }
      } catch (e) {
        // Bridge noch nicht bereit
      }
    };
    
    fetchSongs();
    const interval = setInterval(fetchSongs, 3000); // Alle 3 Sekunden prüfen
    return () => clearInterval(interval);
  }, [musicLibrary.length, updateMusicLibrary]);

  // Hilfsfunktion zum Senden von Befehlen an den Agenten
  const sendMediaCommand = useCallback((action: string, param?: string) => {
    console.log(`[MusicWidget] Media Command: ${action}`, param);
    if (window.elite?.executeCommand) {
      if (action === 'play_local') {
        window.elite.executeCommand(`Spiele den lokalen Song: ${param}`);
        setIsPlaying(true);
        setCurrentSong(param || null);
      } else {
        window.elite.executeCommand(`Führe media_control aus mit Aktion: ${action}`);
        if (action === 'playpause') setIsPlaying(!isPlaying);
      }
      addLog({ type: 'system', message: `Media Action: ${action} ${param || ''}` });
    } else {
      console.warn("[MusicWidget] window.elite.executeCommand not found");
    }
  }, [isPlaying, addLog]);

  const currentTitle = currentSong 
    ? currentSong.split('\\').pop()?.split('/').pop()?.replace(/\.[^/.]+$/, "")
    : "Universal Controller";

  return (
    <motion.div 
      ref={ref}
      layout={layout}
      initial={{ opacity: 0, scale: 0.9 }} 
      animate={{ opacity: 1, scale: 1 }} 
      exit={{ opacity: 0, scale: 0.9 }}
      className={getShellClass(`flex flex-col ${WIDGET_PANEL_CLASS} ${showLibrary ? 'h-[450px]' : 'h-auto'}`)}>
      
      {/* Header */}
      <div className={WIDGET_HEADER_CLASS}>
        <div className="flex items-center gap-3">
          <div className="p-1 cursor-grab active:cursor-grabbing text-white/20 hover:text-primary transition-colors">
            <GripVertical className="size-3.5" />
          </div>
          <div className="flex items-center gap-2">
            <div className="size-1.5 rounded-full bg-green-500 animate-pulse" />
            <span className={WIDGET_TITLE_CLASS}>System Media</span>
          </div>
        </div>
        
        <div className="flex items-center gap-1.5">
          <WidgetPopOutButton widgetId="music" />
          <WidgetFullscreenButton widgetId="music" />
          <button 
            onClick={() => setShowLibrary(!showLibrary)}
            className={`p-1.5 rounded-lg transition-colors ${showLibrary ? 'text-primary bg-primary/10' : 'text-white/30 hover:text-white/60'}`}
          >
            <List className="size-3.5" />
          </button>
          <button 
            onClick={() => closeWidget('music')} 
            className="p-1.5 rounded-lg hover:bg-red-500/10 text-white/30 hover:text-red-400 transition-all"
          >
            <X className="size-3.5" />
          </button>
        </div>
      </div>

      <div className="p-6 flex flex-col items-center text-center space-y-4">
        {/* Visualizer Placeholder / Icon (Kompakter wenn Library offen) */}
        <div className={`relative ${showLibrary ? 'size-16' : 'size-24'} rounded-full bg-gradient-to-tr from-cyan-500/20 to-blue-500/20 flex items-center justify-center ring-1 ring-white/10 shadow-inner transition-all`}>
          <div className="absolute inset-0 rounded-full bg-cyan-500/5 animate-ping" style={{ animationDuration: '3s' }} />
          <Music className={`${showLibrary ? 'size-6' : 'size-10'} ${isPlaying ? 'text-primary' : 'text-white/20'} transition-colors`} />
        </div>

        <div className="space-y-1">
          <h3 className="text-sm font-bold text-white/90 truncate max-w-[200px]">{currentTitle}</h3>
          <p className="text-[10px] text-white/40 uppercase tracking-widest">
            {musicLibrary && musicLibrary.length > 0 ? `${musicLibrary.length} Songs in Library` : 'Active System Output'}
          </p>
        </div>

        {/* Controls */}
        <div className="flex items-center gap-6">
          <button onClick={() => sendMediaCommand('prev')} 
            className="p-2 rounded-full hover:bg-white/5 text-white/60 hover:text-white transition-colors">
            <SkipBack className="size-5" />
          </button>
          
          <button onClick={() => sendMediaCommand('playpause')}
            className="size-12 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center ring-1 ring-white/20 hover:ring-cyan-500/50 transition-all group">
            {isPlaying ? (
              <Pause className="size-5 text-white group-hover:text-primary" fill="currentColor" />
            ) : (
              <Play className="size-5 text-white translate-x-0.5 group-hover:text-primary" fill="currentColor" />
            )}
          </button>

          <button onClick={() => sendMediaCommand('next')}
            className="p-2 rounded-full hover:bg-white/5 text-white/60 hover:text-white transition-colors">
            <SkipForward className="size-5" />
          </button>
        </div>

        {/* Library List */}
        {showLibrary && (
          <div className="w-full flex-1 overflow-y-auto no-scrollbar border-t border-white/5 mt-4 pt-2 text-left space-y-1 max-h-[220px]">
            {musicLibrary && musicLibrary.length > 0 ? (
              musicLibrary.map((song, i) => {
                // Extrahiere den Dateinamen ohne Endung
                const fileName = typeof song === 'string' 
                  ? song.split('\\').pop()?.split('/').pop()?.replace(/\.[^/.]+$/, "") 
                  : `Track ${i + 1}`;
                
                return (
                  <button
                    key={`${song}-${i}`}
                    onClick={() => sendMediaCommand('play_local', song)}
                    className="w-full px-3 py-2 rounded-xl hover:bg-white/5 text-[11px] text-white/40 hover:text-primary transition-all flex items-center gap-3 group"
                  >
                    <div className="size-6 rounded-lg bg-white/5 flex items-center justify-center group-hover:bg-primary/20 transition-colors">
                      <Play className="size-2.5 opacity-0 group-hover:opacity-100 transition-opacity" fill="currentColor" />
                      <span className="text-[8px] group-hover:hidden">{i + 1}</span>
                    </div>
                    <span className="truncate flex-1 font-medium">{fileName}</span>
                    <Music className="size-3 opacity-0 group-hover:opacity-100 text-primary/40" />
                  </button>
                );
              })
            ) : (
              <div className="py-8 text-center space-y-3">
                <Music className="size-5 text-white/10 mx-auto" />
                <div className="space-y-1">
                  <p className="text-[10px] text-white/30 uppercase tracking-[0.2em]">Gescannte Musikbibliothek</p>
                  <p className="text-[9px] text-white/10 italic">Warte auf Synchronisation...</p>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Volume & Extras (Nur wenn Library zu) */}
        {!showLibrary && (
          <div className="w-full pt-2 flex items-center gap-3">
            <Volume2 className="size-3.5 text-white/30" />
            <div className="flex-1 h-1 bg-white/5 rounded-full overflow-hidden">
              <motion.div 
                className="h-full bg-cyan-500/50" 
                initial={{ width: '70%' }}
                animate={{ width: `${volume * 100}%` }}
              />
            </div>
            <div className="flex gap-2">
              <button onClick={() => sendMediaCommand('vol_down')} className="text-[10px] text-white/20 hover:text-white/60">-</button>
              <button onClick={() => sendMediaCommand('vol_up')} className="text-[10px] text-white/20 hover:text-white/60">+</button>
            </div>
          </div>
        )}
      </div>
    </motion.div>
  );
});

MusicWidget.displayName = 'MusicWidget';
