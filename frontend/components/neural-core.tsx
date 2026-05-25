'use client';

import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { 
  Bot, 
  Cloud, 
  Thermometer, 
  Wind, 
  MapPin, 
  Compass, 
  Globe, 
  Zap, 
  BrainCircuit,
  Waves
} from 'lucide-react';

/**
 * Neural Core Hub – Rechtes HUD-Widget für Umgebung und KI-Status.
 */
export function NeuralCore() {
  const [time, setTime] = useState(new Date());
  const [cpu, setCpu] = useState(0);
  const [weather, setWeather] = useState({
    temp: "22.4°C",
    condition: "Clear Sky",
    location: "Biel"
  });
  
  useEffect(() => {
    // Initial fetch for "automatic" data
    const fetchInitialData = async () => {
      try {
        const resp = await fetch('/api/system-status');
        if (resp.ok) {
          const data = await resp.json();
          if (data.cpu_percent !== undefined) setCpu(data.cpu_percent);
          if (data.weather) setWeather(data.weather);
        }
      } catch (err) {
        console.error("Failed to fetch initial HUD data:", err);
      }
    };
    fetchInitialData();

    const timer = setInterval(() => setTime(new Date()), 1000);
    
    const handleStats = (e: any) => {
      setCpu(e.detail.cpu);
    };

    const handleWeather = (e: any) => {
      setWeather({
        temp: e.detail.temp,
        condition: e.detail.condition,
        location: e.detail.location
      });
    };
    
    window.addEventListener('elite-system-stats', handleStats);
    window.addEventListener('elite-weather-update', handleWeather);
    return () => {
      clearInterval(timer);
      window.removeEventListener('elite-system-stats', handleStats);
      window.removeEventListener('elite-weather-update', handleWeather);
    };
  }, []);

  return (
    <div className="relative space-y-5">
      {/* Neural Link Header */}
      <div className="flex flex-col gap-2">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="text-[10px] font-black uppercase tracking-[0.3em] text-white/40">Neural Bridge</span>
            <motion.div 
              animate={{ 
                scale: [1, 1.2 + (cpu / 200), 1], 
                opacity: [1, 0.6, 1],
                backgroundColor: cpu > 50 ? "#ef4444" : "#10b981"
              }} 
              transition={{ duration: 1 / (1 + cpu / 50), repeat: Infinity }}
              className="size-1.5 rounded-full bg-emerald-500 shadow-[0_0_5px_#10b981]" 
            />
          </div>
          <motion.span 
            animate={{ opacity: [0.6, 1, 0.6] }}
            className="text-[9px] font-mono text-emerald-400"
          >
            LINK_SYNC: {(99.5 + (Math.random() * 0.4)).toFixed(1)}%
          </motion.span>
        </div>
        <div className="h-px w-full bg-gradient-to-r from-emerald-500/50 via-primary/25 to-transparent" />
      </div>

      {/* Brain Activity Visualizer */}
      <div className="bg-white/[0.02] p-4 rounded-2xl ring-1 ring-white/5 relative overflow-hidden group">
        <div className="absolute inset-0 bg-gradient-to-br from-emerald-500/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
        <div className="flex items-center gap-3 mb-4">
          <div className="p-2 rounded-xl bg-emerald-500/10 text-emerald-400">
            <BrainCircuit className="size-4" />
          </div>
          <div>
            <h4 className="text-[10px] font-black uppercase tracking-wider text-white/80">Neural Processing</h4>
            <p className="text-[8px] text-white/20 font-bold uppercase tracking-widest">Active Thought Matrix</p>
          </div>
        </div>

        {/* Waveform Animation - Smoother & CPU Reactive */}
        <div className="h-12 flex items-end gap-[2px] px-1 overflow-hidden">
          {[...Array(20)].map((_, i) => (
            <motion.div
              key={i}
              animate={{ 
                height: [
                  10 + Math.random() * (20 + cpu / 2), 
                  20 + Math.random() * (25 + cpu / 1.5), 
                  15 + Math.random() * (22 + cpu / 2)
                ],
                backgroundColor: cpu > 70 ? "rgba(239, 68, 68, 0.3)" : "rgba(16, 185, 129, 0.3)"
              }}
              transition={{ 
                duration: (0.4 + Math.random() * 0.6) / (1 + cpu / 100), 
                repeat: Infinity, 
                ease: "linear" // Linear for smoother waves
              }}
              className="flex-1 bg-emerald-500/30 rounded-t-sm"
            />
          ))}
        </div>
      </div>

      {/* Environment Data */}
      <div className="space-y-3">
        <div className="flex items-center gap-2 px-1">
          <MapPin className="size-3 text-primary" />
          <span className="text-[9px] font-black uppercase tracking-widest text-white/30">HQ Environment ({weather.location})</span>
        </div>

        <div className="grid grid-cols-2 gap-2">
          <div className="bg-white/[0.03] p-3 rounded-xl ring-1 ring-white/5 flex flex-col gap-1">
            <div className="flex items-center gap-2">
              <Thermometer className="size-3 text-white/20" />
              <span className="text-[8px] font-bold text-white/40">TEMP</span>
            </div>
            <span className="text-sm font-black text-white/90">{weather.temp}</span>
          </div>
          <div className="bg-white/[0.03] p-3 rounded-xl ring-1 ring-white/5 flex flex-col gap-1">
            <div className="flex items-center gap-2">
              <Cloud className="size-3 text-white/20" />
              <span className="text-[8px] font-bold text-white/40">COND</span>
            </div>
            <span className="text-sm font-black text-white/90 uppercase text-[10px] tracking-wider truncate">{weather.condition}</span>
          </div>
        </div>
      </div>

      {/* Global Geo Timer */}
      <div className="bg-white/[0.02] p-4 rounded-2xl ring-1 ring-white/5 space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Globe className="size-3.5 text-primary/50" />
            <span className="text-[9px] font-black uppercase tracking-widest text-white/40">System Time</span>
          </div>
          <span className="text-[9px] font-mono text-primary/80">UTC+2</span>
        </div>

        <div className="flex flex-col items-center py-2">
          <span className="text-3xl font-black tracking-tighter text-white/90 font-mono">
            {time.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
          </span>
          <span className="text-[10px] font-black uppercase tracking-[0.4em] text-white/10 mt-1">
            {time.toLocaleDateString('de-DE', { day: '2-digit', month: 'long', year: 'numeric' })}
          </span>
        </div>

        {/* Global Nodes */}
        <div className="space-y-2 border-t border-white/5 pt-3">
          <div className="flex items-center justify-between text-[8px] font-bold uppercase tracking-widest text-white/20">
            <span className="flex items-center gap-1"><Zap className="size-2 text-emerald-500" /> Neural Node-1</span>
            <span className="text-emerald-500/50">Online</span>
          </div>
          <div className="flex items-center justify-between text-[8px] font-bold uppercase tracking-widest text-white/20 opacity-50">
            <span className="flex items-center gap-1"><Zap className="size-2" /> Neural Node-2</span>
            <span>Standby</span>
          </div>
        </div>
      </div>

      {/* Decorative Bottom */}
      <div className="flex items-center justify-center py-2 px-4 rounded-xl bg-primary/5 border border-primary/15">
        <Waves className="size-3 text-primary/30 animate-pulse mr-2" />
        <span className="text-[8px] font-black uppercase tracking-[0.3em] text-primary/40">Matrix Core Stable</span>
      </div>
    </div>
  );
}
