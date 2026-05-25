'use client';

import { useRef, useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Terminal, X, Brain, Wrench, CheckCircle, AlertTriangle, AlertCircle, Cpu, Eye } from 'lucide-react';
import { useWidgetManager, LogEntry } from './widget-manager';
import {
  useWidgetFullscreen,
  WidgetFullscreenButton,
  WidgetPopOutButton,
  WIDGET_PANEL_CLASS,
  WIDGET_SCROLL_CLASS,
  WIDGET_HEADER_CLASS,
  WIDGET_BODY_CLASS,
  WIDGET_TITLE_CLASS,
  WIDGET_SUBTITLE_CLASS,
  WIDGET_TEXT_BODY_CLASS,
} from './widget-shell';

/**
 * Log-Stream Widget: Zeigt KI-Gedankengänge und Tool-Aufrufe in Echtzeit.
 * Inspiriert durch fury-sdk Event-Streaming.
 */

const TYPE_CONFIG: Record<LogEntry['type'], { icon: any; color: string; label: string }> = {
  tool_call: { icon: Wrench, color: 'text-primary', label: 'TOOL' },
  thinking: { icon: Brain, color: 'text-purple-400', label: 'THINK' },
  result: { icon: CheckCircle, color: 'text-emerald-400', label: 'OK' },
  system: { icon: Cpu, color: 'text-amber-400', label: 'SYS' },
  error: { icon: AlertTriangle, color: 'text-red-400', label: 'ERR' },
  suggestion: { icon: Brain, color: 'text-cyan-400', label: 'SUGG' },
  vision: { icon: Eye, color: 'text-sky-400', label: 'VIS' },
  warning: { icon: AlertCircle, color: 'text-yellow-400', label: 'WARN' },
};

function getLogTypeConfig(type: string) {
  return TYPE_CONFIG[type as LogEntry['type']] ?? TYPE_CONFIG.system;
}

export function LogStreamWidget() {
  const { closeWidget, logs, addLog } = useWidgetManager();
  const { layout, getShellClass, isFullscreen } = useWidgetFullscreen('logStream');
  const scrollRef = useRef<HTMLDivElement>(null);
  const [autoScroll, setAutoScroll] = useState(true);

  // Auto-Scroll bei neuen Logs
  useEffect(() => {
    if (autoScroll && scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [logs, autoScroll]);

  const demoSeeded = useRef(false);
  useEffect(() => {
    if (demoSeeded.current || logs.length > 0) return;
    demoSeeded.current = true;
    const demoLogs: Array<Omit<LogEntry, 'id' | 'timestamp'>> = [
      { type: 'system', message: 'Elite Dashboard initialisiert' },
      { type: 'system', message: 'Widget-Manager gestartet' },
      { type: 'thinking', message: '[Self-Healing] OBSERVE: Starte selbstheilenden Workflow...' },
      { type: 'thinking', message: '[Self-Healing] THINK: Diagnose-Agent (Elite-Diag) analysiert den NameError...' },
      { type: 'thinking', message: '[Self-Healing] PLAN: Korrekturvorschlag für broken_test.py erstellt.' },
      { type: 'suggestion', message: '[Self-Healing] AUDIT: Review-Agent (Elite-Auditor) prüft die Änderung...' },
      { type: 'result', message: '[Self-Healing] APPROVED: Auditor hat die Änderung freigegeben (Sicherheit & Syntax OK).' },
      { type: 'thinking', message: '[Self-Healing] EXECUTE: Executor-Agent (Elite-Executor) wendet den Patch an...' },
      { type: 'result', message: '[Self-Healing] VERIFY: Verifier-Agent prüft die Syntax (py_compile)... Kompilierung erfolgreich!' },
      { type: 'result', message: '[Self-Healing] LEARN: Protokolliere Behebung im System-Gedächtnis.' },
      { type: 'result', message: '[Self-Healing] Selbstheilung erfolgreich abgeschlossen!' },
    ];
    demoLogs.forEach((log, i) => {
      setTimeout(() => addLog(log), (i + 1) * 1200);
    });
  }, [logs.length, addLog]);

  // Find self-healing logs and determine current active phase
  const healingLogs = logs.filter(log => log.message.includes('[Self-Healing]') || log.message.includes('LEARN:'));
  const hasRecentHealing = healingLogs.length > 0 && (Date.now() - healingLogs[healingLogs.length - 1].timestamp < 300000); // 5 minutes timeout
  
  let activePhase: 'diag' | 'audit' | 'exec' | 'verify' | 'learn' | 'done' | null = null;
  if (hasRecentHealing) {
    const lastMsg = healingLogs[healingLogs.length - 1].message;
    if (lastMsg.includes('OBSERVE') || lastMsg.includes('Diag') || lastMsg.includes('Diagnose-Agent')) {
      activePhase = 'diag';
    } else if (lastMsg.includes('AUDIT') || lastMsg.includes('APPROVED') || lastMsg.includes('REJECTED') || lastMsg.includes('Auditor')) {
      activePhase = 'audit';
    } else if (lastMsg.includes('EXECUTE') || lastMsg.includes('Executor')) {
      activePhase = 'exec';
    } else if (lastMsg.includes('VERIFY') || lastMsg.includes('Verifier') || lastMsg.includes('Kompilierung')) {
      activePhase = 'verify';
    } else if (lastMsg.includes('LEARN') || lastMsg.includes('Learner') || lastMsg.includes('Lernzyklus') || lastMsg.includes('synchronisiert')) {
      activePhase = 'learn';
    } else if (lastMsg.includes('erfolgreich abgeschlossen') || lastMsg.includes('abgeschlossen') || lastMsg.includes('beendet')) {
      activePhase = 'done';
    }
  }
  return (
    <motion.div layout={layout} initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.9 }}
      className={getShellClass(`flex flex-col ${WIDGET_PANEL_CLASS} h-full min-h-[200px]`)}>
      {/* Header */}
      <div className={WIDGET_HEADER_CLASS}>
        <div className="flex items-center gap-2">
          <Terminal className="size-4 text-orange-400" />
          <span className={WIDGET_TITLE_CLASS}>KI Log-Stream</span>
          <span className="text-[9px] text-white/50 font-mono">{logs.length} Einträge</span>
        </div>
        <motion.div className="flex items-center gap-1">
          <WidgetPopOutButton widgetId="logStream" />
          <WidgetFullscreenButton widgetId="logStream" />
          <button onClick={() => setAutoScroll(!autoScroll)}
            className={`px-2 py-1 rounded-lg text-[9px] font-bold uppercase tracking-wider transition-colors ${
              autoScroll ? 'bg-primary/10 text-primary ring-1 ring-primary/20' : 'text-white/20 hover:text-white/40'
            }`}>
            Auto
          </button>
          <button onClick={() => closeWidget('logStream')} className="p-1.5 rounded-lg hover:bg-red-500/10 text-white/30 hover:text-red-400 transition-colors">
            <X className="size-3.5" />
          </button>
        </motion.div>
      </div>

      {/* Real-time Agent Workflow Stepper */}
      <AnimatePresence>
        {hasRecentHealing && (
          <motion.div 
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className="border-b border-white/5 bg-cyan-950/20 p-2.5 px-4 flex flex-col gap-2 overflow-hidden"
          >
            <div className="flex items-center justify-between">
              <span className="text-[9px] font-bold text-cyan-400 tracking-wider uppercase flex items-center gap-1.5">
                <span className="relative flex h-2 w-2">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-cyan-400 opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-cyan-500"></span>
                </span>
                Agenten-Kollaboration aktiv
              </span>
              <span className="text-[8px] font-mono text-white/40 uppercase tracking-widest">
                {activePhase === 'done' ? 'Erfolgreich' : activePhase ? `Phase: ${activePhase}` : 'IDLE'}
              </span>
            </div>
            
            <div className="flex items-center justify-between text-[8px] font-mono mt-1 relative px-2">
              {/* Background connector line */}
              <div className="absolute top-[10px] left-8 right-8 h-[1px] bg-white/10 z-0" />
              
              {/* Flowing highlight line */}
              <div 
                className="absolute top-[10px] left-8 h-[1px] bg-cyan-500 transition-all duration-700 ease-in-out z-0"
                style={{
                  width: activePhase === 'diag' ? '0%' :
                         activePhase === 'audit' ? '25%' :
                         activePhase === 'exec' ? '50%' :
                         activePhase === 'verify' ? '75%' :
                         activePhase === 'learn' || activePhase === 'done' ? '100%' : '0%'
                }}
              />

              {[
                { id: 'diag', label: 'Diag', desc: 'Elite-Diag (Diagnose)' },
                { id: 'audit', label: 'Audit', desc: 'Elite-Auditor (Sicherheit & Code-Review)' },
                { id: 'exec', label: 'Exec', desc: 'Elite-Executor (Einspielen & Backup)' },
                { id: 'verify', label: 'Verify', desc: 'Elite-Verifier (Syntaxcheck & Test)' },
                { id: 'learn', label: 'Learn', desc: 'Elite-Learner (Gedächtnis & PAI Sync)' }
              ].map((step, idx) => {
                const phases = ['diag', 'audit', 'exec', 'verify', 'learn', 'done'];
                const currentIdx = phases.indexOf(activePhase || '');
                const stepIdx = phases.indexOf(step.id);
                const isActive = activePhase === step.id;
                const isCompleted = currentIdx > stepIdx;
                
                let stateColor = 'bg-black/40 border-white/10 text-white/30';
                let ringColor = '';
                if (isActive) {
                  stateColor = 'bg-cyan-950 border-cyan-400 text-cyan-400 font-bold shadow-[0_0_10px_rgba(34,211,238,0.4)]';
                  ringColor = 'ring-4 ring-cyan-500/20 animate-pulse';
                } else if (isCompleted) {
                  stateColor = 'bg-emerald-950 border-emerald-500 text-emerald-400 shadow-[0_0_6px_rgba(16,185,129,0.2)]';
                }

                return (
                  <div key={step.id} className="flex flex-col items-center z-10 group relative select-none">
                    <div className={`size-5 rounded-full border flex items-center justify-center text-[9px] transition-all duration-500 ${stateColor} ${ringColor}`}>
                      {isCompleted ? '✓' : idx + 1}
                    </div>
                    <span className={`text-[9px] mt-1.5 transition-colors duration-500 ${isActive ? 'text-cyan-400 font-bold' : isCompleted ? 'text-emerald-400' : 'text-white/30'}`}>
                      {step.label}
                    </span>
                    
                    {/* Tooltip for agent detail */}
                    <div className="absolute top-7 scale-0 group-hover:scale-100 transition-transform duration-200 bg-black/90 border border-white/10 px-2 py-1 rounded text-[8px] whitespace-nowrap text-white/90 z-20 shadow-xl">
                      {step.desc}
                    </div>
                  </div>
                );
              })}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Log-Einträge */}
      <motion.div ref={scrollRef} className={`${WIDGET_BODY_CLASS} p-3 space-y-1 font-mono text-[11px] ${WIDGET_SCROLL_CLASS} ${isFullscreen ? 'min-h-0' : 'max-h-[300px]'}`}
        onScroll={e => {
          const el = e.currentTarget;
          const isNearBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 50;
          setAutoScroll(isNearBottom);
        }}>
        <AnimatePresence initial={false}>
          {logs.map(log => {
            const config = getLogTypeConfig(log.type);
            const Icon = config.icon;
            const time = new Date(log.timestamp).toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit', second: '2-digit' });

            return (
              <motion.div key={log.id}
                initial={{ opacity: 0, x: -10, height: 0 }}
                animate={{ opacity: 1, x: 0, height: 'auto' }}
                exit={{ opacity: 0 }}
                className="flex items-start gap-2 py-1.5 px-2 rounded-lg hover:bg-white/8 transition-colors group">
                <span className="text-[9px] text-white/40 flex-shrink-0 mt-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                  {time}
                </span>
                {/* Typ-Badge */}
                <div className={`flex items-center gap-1 flex-shrink-0 mt-0.5`}>
                  <Icon className={`size-3 ${config.color}`} />
                  <span className={`text-[8px] font-bold uppercase tracking-wider ${config.color}`}>
                    {config.label}
                  </span>
                </div>
                <span className={`${WIDGET_TEXT_BODY_CLASS} break-all`}>{log.message}</span>
              </motion.div>
            );
          })}
        </AnimatePresence>

        {/* Cursor-Blink am Ende */}
        <div className="flex items-center gap-1 px-2 py-1">
          <span className="text-primary/30">›</span>
          <motion.span className="w-1.5 h-3.5 bg-cyan-400/40 rounded-sm"
            animate={{ opacity: [1, 0] }} transition={{ duration: 0.8, repeat: Infinity }} />
        </div>
      </motion.div>
    </motion.div>
  );
}
