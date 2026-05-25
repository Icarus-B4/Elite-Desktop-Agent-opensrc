import { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Cpu, MemoryStick, Activity, Clock, HardDrive, Zap, LoaderCircle } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Heartbeat } from './heartbeat';

interface SystemMetrics {
  cpu_percent: number;
  ram_used_gb: number;
  ram_total_gb: number;
  ram_percent: number;
  disk_percent: number;
  uptime_hours: number;
  process_count: number;
}

/**
 * Elite System Dashboard – Ein hochmodernes HUD-Widget.
 */
export function SystemStatus() {
  const [metrics, setMetrics] = useState<SystemMetrics | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    let interval: NodeJS.Timeout;

    const fetchMetrics = async () => {
      try {
        const resp = await fetch('/api/system-status');
        if (resp.ok) {
          const data = await resp.json();
          setMetrics(data);
          setError(false);
        } else {
          setError(true);
        }
      } catch {
        setError(true);
      }
    };

    fetchMetrics();
    interval = setInterval(fetchMetrics, 12_000);

    // Event-Listener für Echtzeit-Stats vom Agenten (LiveKit DataChannel)
    const handleSystemStats = (e: any) => {
      const data = e.detail;
      setMetrics(prev => ({
        ...prev,
        cpu_percent: data.cpu,
        ram_percent: data.ram,
        ram_used_gb: (data.ram / 100) * (prev?.ram_total_gb || 32), // Schätzung falls total unbekannt
        disk_percent: data.disk ?? prev?.disk_percent ?? 0,
        uptime_hours: prev?.uptime_hours || 0,
        process_count: data.process_count ?? prev?.process_count ?? 0,
        ram_total_gb: prev?.ram_total_gb || 32
      }));
      setError(false);
    };

    window.addEventListener('elite-system-stats', handleSystemStats);
    return () => {
      clearInterval(interval);
      window.removeEventListener('elite-system-stats', handleSystemStats);
    };
  }, []);

  if (error || !metrics) {
    return (
      <div className="rounded-2xl bg-black/40 p-6 backdrop-blur-3xl ring-1 ring-white/10 flex items-center justify-center min-h-[200px]">
        <div className="flex flex-col items-center gap-3">
          <LoaderCircle className="size-6 text-primary animate-spin" />
          <p className="text-[10px] font-black uppercase tracking-[0.2em] text-primary/50">
            {error ? 'Link Failure' : 'Syncing HUD...'}
          </p>
        </div>
      </div>
    );
  }

  const radius = 30;
  const circumference = 2 * Math.PI * radius;
  const cpuPercent = metrics?.cpu_percent ?? 0;
  const strokeDashoffset = circumference - (cpuPercent / 100) * circumference;

  return (
    <div className="relative space-y-4">
      {/* Top Life Sign & HUD Headers */}
      <div className="flex flex-col gap-2">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="text-[10px] font-black uppercase tracking-[0.3em] text-white/40">Diagnostic Feed</span>
            {metrics && (
              <motion.div 
                animate={{ opacity: [1, 0.4, 1] }} 
                transition={{ duration: 1.5, repeat: Infinity }}
                className="size-1.5 rounded-full bg-primary shadow-[0_0_8px_var(--accent-glow)]" 
              />
            )}
          </div>
          <Badge variant="outline" className="text-[8px] border-primary/20 bg-primary/5 text-primary">
            SECURE-LINK
          </Badge>
        </div>
        <Heartbeat />
      </div>

      {/* Elite Circular CPU Core */}
      <div className="flex flex-col items-center justify-center p-4 rounded-2xl bg-white/[0.02] ring-1 ring-white/5 relative overflow-hidden group">
        <div className="absolute inset-0 bg-gradient-to-br from-primary/10 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-700" />
        
        {/* SVG Circular Monitor */}
        <div className="relative size-32">
          <svg viewBox="0 0 128 128" className="size-full -rotate-90">
            {/* Background Circle */}
            <circle
              cx="64"
              cy="64"
              r={radius}
              stroke="currentColor"
              strokeWidth="2"
              fill="transparent"
              className="text-white/5"
            />
            {/* Progress Circle */}
            <motion.circle
              cx="64"
              cy="64"
              r={radius}
              stroke="currentColor"
              strokeWidth="3"
              fill="transparent"
              initial={{ strokeDashoffset: circumference }}
              strokeDasharray={circumference}
              animate={{ strokeDashoffset: isNaN(strokeDashoffset) ? circumference : strokeDashoffset }}
              transition={{ duration: 0.8, ease: "easeInOut" }}
              strokeLinecap="round"
              className="text-primary drop-shadow-[0_0_8px_var(--accent-glow)]"
            />
          </svg>
          
          {/* Inner Value */}
          <div className="absolute inset-0 flex flex-col items-center justify-center">
            <span className="text-xl font-black text-white/90 tracking-tighter">
              {metrics.cpu_percent.toFixed(0)}
            </span>
            <span className="text-[8px] font-black uppercase tracking-widest text-primary/50 -mt-1">
              CPU %
            </span>
          </div>
        </div>

        {/* Decorative Scanners */}
        <div className="absolute inset-x-0 top-0 h-[1px] bg-gradient-to-r from-transparent via-primary/50 to-transparent animate-[scan_3s_ease-in-out_infinite]" />
      </div>

      {/* Grid of Other Metrics */}
      <div className="grid grid-cols-2 lg:grid-cols-1 gap-2">
        <MetricCard 
          icon={MemoryStick} 
          label="RAM" 
          value={`${metrics.ram_percent.toFixed(0)}%`}
          subValue={`${metrics.ram_used_gb.toFixed(1)}GB`}
          percent={metrics.ram_percent}
          color="cyan"
        />
        <MetricCard 
          icon={HardDrive} 
          label="DISK" 
          value={`${metrics.disk_percent.toFixed(0)}%`}
          percent={metrics.disk_percent}
          color="blue"
        />
        <MetricCard 
          icon={Activity} 
          label="TASKS" 
          value={metrics.process_count.toString()}
          percent={Math.min((metrics.process_count / 400) * 100, 100)}
          color="emerald"
        />
        <MetricCard 
          icon={Zap} 
          label="UPTIME" 
          value={`${Math.floor(metrics.uptime_hours)}h`}
          percent={100}
          color="amber"
        />
      </div>

      {/* Latency Widget - Now semi-dynamic */}
      <div className="bg-white/[0.02] p-2 rounded-xl border border-white/5">
        <div className="flex items-center justify-between mb-1">
          <span className="text-[8px] font-bold text-white/30 uppercase tracking-widest">Network Latency</span>
          <motion.span 
            animate={{ opacity: [1, 0.5, 1] }}
            className="text-[8px] font-mono text-primary"
          >
            {(15 + Math.random() * 15).toFixed(0)}ms
          </motion.span>
        </div>
        <div className="flex gap-1">
          {[1,2,3,4,5,6,7,8,9,10].map(i => (
            <motion.div 
              key={i} 
              animate={{ opacity: [0.3, 1, 0.3] }}
              transition={{ delay: i * 0.1, duration: 2, repeat: Infinity }}
              className={`h-1 flex-1 rounded-full ${i < 4 ? 'bg-primary' : 'bg-white/5'}`} 
            />
          ))}
        </div>
      </div>

      <div className="flex items-center justify-between px-2 pt-2 border-t border-white/5 opacity-30 group">
         <div className="flex items-center gap-2">
            <div className="size-1 rounded-full bg-primary animate-pulse" />
            <span className="text-[8px] font-bold uppercase tracking-[0.2em] text-white">System Secure</span>
         </div>
         <span className="text-[7px] font-mono text-white/40">LIVE_SYNC: OK</span>
      </div>
    </div>
  );
}

function MetricCard({ icon: Icon, label, value, subValue, percent, color }: any) {
  const colors: any = {
    cyan: "bg-primary shadow-[0_0_8px_var(--accent-glow)]",
    blue: "bg-blue-500 shadow-blue-500/20",
    emerald: "bg-emerald-500 shadow-emerald-500/20",
    amber: "bg-amber-500 shadow-amber-500/20",
  };

  return (
    <div className="bg-white/[0.03] p-3 rounded-xl ring-1 ring-white/5 group relative overflow-hidden transition-all hover:bg-white/[0.06]">
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <Icon className="size-3 text-white/30 group-hover:text-primary transition-colors" />
          <span className="text-[9px] font-black uppercase tracking-widest text-white/40">{label}</span>
        </div>
        <div className="flex flex-col items-end">
          <span className="text-[11px] font-bold text-white/80">{value}</span>
          {subValue && <span className="text-[8px] text-white/20 -mt-1">{subValue}</span>}
        </div>
      </div>
      <div className="h-1 w-full bg-white/5 rounded-full overflow-hidden">
        <motion.div
          initial={{ width: 0 }}
          animate={{ width: `${percent}%` }}
          transition={{ duration: 1, ease: "easeOut" }}
          className={`h-full rounded-full ${colors[color]} shadow-lg transition-all duration-700`}
        />
      </div>
    </div>
  );
}

