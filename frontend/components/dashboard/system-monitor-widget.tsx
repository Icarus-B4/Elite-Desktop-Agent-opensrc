'use client';

import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { Cpu, MemoryStick, HardDrive, Activity, Zap, Clock, X, Wifi, GripVertical } from 'lucide-react';
import { useWidgetManager } from './widget-manager';
import {
  useWidgetFullscreen,
  WidgetFullscreenButton,
  WidgetPopOutButton,
  WIDGET_PANEL_CLASS,
  WIDGET_HEADER_CLASS,
  WIDGET_STAT_CARD_CLASS,
  WIDGET_INNER_SURFACE_CLASS,
  WIDGET_TITLE_CLASS,
} from './widget-shell';

/**
 * System-Monitor Widget: CPU, RAM, Disk, Tasks, Uptime.
 * Polled /api/system-status alle 12 Sekunden (Server cached 8s).
 * Fallback auf simulierte Daten wenn API nicht erreichbar.
 */

interface Metrics {
  cpu_percent: number;
  ram_used_gb: number;
  ram_total_gb: number;
  ram_percent: number;
  disk_percent: number;
  uptime_hours: number;
  process_count: number;
}

// Simulierte Metriken als Fallback
function generateSimulatedMetrics(): Metrics {
  return {
    cpu_percent: 15 + Math.random() * 45,
    ram_used_gb: 6 + Math.random() * 6,
    ram_total_gb: 16,
    ram_percent: 40 + Math.random() * 30,
    disk_percent: 45 + Math.random() * 20,
    uptime_hours: 24 + Math.random() * 200,
    process_count: 150 + Math.floor(Math.random() * 100),
  };
}

export function SystemMonitorWidget() {
  const { closeWidget } = useWidgetManager();
  const { layout, getShellClass } = useWidgetFullscreen('systemMonitor');
  // Starte mit statischen Werten, um Hydration-Mismatch zu vermeiden
  const [metrics, setMetrics] = useState<Metrics>({
    cpu_percent: 25, ram_used_gb: 8, ram_total_gb: 16,
    ram_percent: 50, disk_percent: 55, uptime_hours: 48, process_count: 200,
  });
  const [isLive, setIsLive] = useState(false);
  const [latency, setLatency] = useState(24);

  useEffect(() => {
    // 🚀 STABILE BRÜCKE: Höre auf Live-Daten vom Agenten
    const handleLiveStats = (event: any) => {
      const data = event.detail;
      setMetrics(prev => ({
        ...prev,
        cpu_percent: data.cpu ?? prev.cpu_percent,
        ram_percent: data.ram ?? prev.ram_percent,
        disk_percent: data.disk ?? prev.disk_percent,
        process_count: data.process_count ?? prev.process_count,
      }));
      setIsLive(true);
      setLatency(12); // Live-Daten sind ultra-schnell
    };

    window.addEventListener('elite-system-stats', handleLiveStats);

    const fetchMetrics = async () => {
      const start = performance.now();
      try {
        const resp = await fetch(`/api/system-status?t=${Date.now()}`, { cache: 'no-store' });
        const roundtrip = Math.round(performance.now() - start);
        
        setIsLive(prevLive => {
          if (!prevLive) setLatency(roundtrip);
          return true;
        });
        
        if (resp.ok) { 
          const data = await resp.json();
          setMetrics(prev => ({ ...prev, ...data })); 
        }
      } catch {
        setIsLive(false);
      }
    };

    fetchMetrics();
    const interval = setInterval(fetchMetrics, 12_000);
    return () => {
      clearInterval(interval);
      window.removeEventListener('elite-system-stats', handleLiveStats);
    };
  }, []); // Leeres Array löst die Schleife auf (Deutsch)

  const radius = 34;
  const circumference = 2 * Math.PI * radius;
  const cpuOffset = circumference - (metrics.cpu_percent / 100) * circumference;
  const ramOffset = circumference - (metrics.ram_percent / 100) * circumference;

  return (
    <motion.div layout={layout} initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.9 }}
      className={getShellClass(`flex flex-col ${WIDGET_PANEL_CLASS}`)}>
      {/* Header */}
      <div className={WIDGET_HEADER_CLASS}>
        <div className="flex items-center gap-3">
          <div className="p-1 cursor-grab active:cursor-grabbing text-white/20 hover:text-primary transition-colors">
            <GripVertical className="size-3.5" />
          </div>
          <div className="flex items-center gap-2">
            <Activity className="size-4 text-emerald-400" />
            <span className={WIDGET_TITLE_CLASS}>System Monitor</span>
            <span className={`flex items-center gap-1 text-[8px] font-bold uppercase tracking-wider ${isLive ? 'text-green-400' : 'text-amber-400'}`}>
              <span className={`size-1 rounded-full ${isLive ? 'bg-green-400' : 'bg-amber-400'} animate-pulse`} />
              {isLive ? 'Live' : 'Sim'}
            </span>
          </div>
        </div>
        
        <div className="flex items-center gap-1.5">
          <WidgetPopOutButton widgetId="systemMonitor" />
          <WidgetFullscreenButton widgetId="systemMonitor" />
          <button 
            onClick={() => closeWidget('systemMonitor')} 
            className="p-1.5 rounded-lg hover:bg-red-500/10 text-white/30 hover:text-red-400 transition-all"
          >
            <X className="size-3.5" />
          </button>
        </div>
      </div>

      <div className="p-4 space-y-4">
        {/* Circular Gauges – CPU & RAM nebeneinander */}
        <div className="flex justify-around">
          {/* CPU Gauge */}
          <div className="flex flex-col items-center">
            <div className="relative size-[88px]">
              <svg className="size-full -rotate-90">
                <circle cx="44" cy="44" r={radius} stroke="currentColor" strokeWidth="3" fill="transparent" className="text-white/5" />
                <motion.circle cx="44" cy="44" r={radius} stroke="currentColor" strokeWidth="4" fill="transparent"
                  strokeDasharray={circumference} animate={{ strokeDashoffset: cpuOffset }}
                  transition={{ duration: 1, ease: 'easeOut' }} strokeLinecap="round"
                  className="text-primary drop-shadow-[0_0_8px_rgba(34,211,238,0.5)]" />
              </svg>
              <div className="absolute inset-0 flex flex-col items-center justify-center">
                <Cpu className="size-3.5 text-primary/60 mb-0.5" />
                <span className="text-lg font-black text-white/90">{metrics.cpu_percent.toFixed(0)}</span>
                <span className="text-[7px] font-bold uppercase tracking-wider text-primary/40 -mt-0.5">CPU %</span>
              </div>
            </div>
          </div>

          {/* RAM Gauge */}
          <div className="flex flex-col items-center">
            <div className="relative size-[88px]">
              <svg className="size-full -rotate-90">
                <circle cx="44" cy="44" r={radius} stroke="currentColor" strokeWidth="3" fill="transparent" className="text-white/5" />
                <motion.circle cx="44" cy="44" r={radius} stroke="currentColor" strokeWidth="4" fill="transparent"
                  strokeDasharray={circumference} animate={{ strokeDashoffset: ramOffset }}
                  transition={{ duration: 1, ease: 'easeOut' }} strokeLinecap="round"
                  className="text-purple-400 drop-shadow-[0_0_8px_rgba(192,132,252,0.5)]" />
              </svg>
              <div className="absolute inset-0 flex flex-col items-center justify-center">
                <MemoryStick className="size-3.5 text-purple-400/60 mb-0.5" />
                <span className="text-lg font-black text-white/90">{metrics.ram_percent.toFixed(0)}</span>
                <span className="text-[7px] font-bold uppercase tracking-wider text-purple-500/40 -mt-0.5">RAM %</span>
              </div>
            </div>
          </div>
        </div>

        {/* Metriken-Leiste */}
        <div className="grid grid-cols-3 gap-2">
          <MetricPill icon={HardDrive} label="Disk" value={`${metrics.disk_percent.toFixed(0)}%`} color="text-blue-400" />
          <MetricPill icon={Zap} label="Tasks" value={`${metrics.process_count}`} color="text-amber-400" />
          <MetricPill icon={Clock} label="Uptime" value={`${Math.floor(metrics.uptime_hours)}h`} color="text-emerald-400" />
        </div>

        {/* Netzwerk-Latenz Bar */}
        <motion.div layout className={WIDGET_INNER_SURFACE_CLASS}>
          <div className="flex items-center justify-between mb-1.5">
            <div className="flex items-center gap-1.5">
              <Wifi className="size-3 text-primary/50" />
              <span className="text-[8px] font-bold text-white/30 uppercase tracking-widest">Latenz</span>
            </div>
            <span className="text-[9px] font-mono text-primary">{latency}ms</span>
          </div>
          <div className="flex gap-0.5">
            {Array.from({ length: 12 }, (_, i) => (
              <div key={i} className={`h-1 flex-1 rounded-full transition-colors duration-500 ${
                i < Math.max(2, Math.min(10, Math.round(latency / 5))) ? 'bg-primary' : 'bg-white/[0.04]'
              }`} />
            ))}
          </div>
        </motion.div>
      </div>
    </motion.div>
  );
}

function MetricPill({ icon: Icon, label, value, color }: { icon: any; label: string; value: string; color: string }) {
  return (
    <div className={`${WIDGET_STAT_CARD_CLASS} hover:bg-white/[0.03] transition-colors`}>
      <Icon className={`size-3 ${color} opacity-60`} />
      <span className="text-[10px] font-bold text-white/80">{value}</span>
      <span className="text-[7px] font-bold uppercase tracking-widest text-white/50">{label}</span>
    </div>
  );
}
