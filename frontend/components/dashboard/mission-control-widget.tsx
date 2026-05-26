'use client';

import React, { useEffect, useState, useCallback, useRef } from 'react';
import { motion } from 'framer-motion';
import {
  Sparkles, X, ExternalLink, Brain, Terminal,
  RefreshCw, GripVertical, Database, Activity, MessageSquare, LayoutDashboard,
} from 'lucide-react';
import { useWidgetManager } from './widget-manager';
import { HermesUnifiedChatHint } from './hermes-unified-chat-hint';
import {
  useWidgetFullscreen,
  WidgetFullscreenButton,
  WidgetPopOutButton,
  WIDGET_PANEL_CLASS,
  WIDGET_HEADER_CLASS,
  WIDGET_STAT_CARD_CLASS,
  WIDGET_LIST_ROW_CLASS,
  WIDGET_TITLE_CLASS,
  WIDGET_LABEL_MUTED_CLASS,
} from './widget-shell';

/** Widget-ID bleibt missionControl (Layout-Kompatibilität) — UI zeigt Hermes Agent. */

const HERMES_DASHBOARD_URL =
  (typeof process !== 'undefined' && process.env.NEXT_PUBLIC_HERMES_DASHBOARD_URL) ||
  'http://127.0.0.1:9119';

type HermesTab = 'chat' | 'overview';

interface HermesOverview {
  isOnline: boolean;
  gatewayReady: boolean;
  dashboardReady: boolean;
  gatewayUrl: string;
  dashboardUrl: string;
  memory?: { chars: number; limit: number };
  userProfile?: { chars: number; limit: number };
  sessionCount: number | null;
  recentLogs: string[];
  warnings: string[];
}

export function MissionControlWidget() {
  const { closeWidget, addLog } = useWidgetManager();
  const { layout, getShellClass } = useWidgetFullscreen('missionControl');
  const [data, setData] = useState<HermesOverview | null>(null);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<HermesTab>('overview');
  const lastLogCountRef = useRef(0);

  const fetchData = useCallback(async () => {
    try {
      const res = await fetch('/api/hermes/overview', { cache: 'no-store' });
      const payload = res.ok ? await res.json() : null;
      if (payload) {
        setData(payload as HermesOverview);
      } else {
        setData(null);
      }
    } catch {
      setData(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
    const interval = setInterval(fetchData, 5000);
    return () => clearInterval(interval);
  }, [fetchData]);

  useEffect(() => {
    const logs = data?.recentLogs ?? [];
    if (logs.length > lastLogCountRef.current && logs.length > 0) {
      const newest = logs[logs.length - 1];
      addLog({ type: 'system', message: `[Hermes] ${newest.slice(0, 200)}` });
    }
    lastLogCountRef.current = logs.length;
  }, [data?.recentLogs, addLog]);

  const handleOpenDashboard = async () => {
    const url = data?.dashboardUrl || HERMES_DASHBOARD_URL;
    if (!data?.dashboardReady) {
      addLog({
        type: 'system',
        message:
          '[Hermes] Dashboard (9119) offline — in WSL: hermes dashboard --no-open  oder START_JARVIS.bat neu starten',
      });
    }
    // Electron: eliteAPI.openExternal nutzen (window.open wird vom setWindowOpenHandler blockiert)
    const api = (window as any).eliteAPI;
    if (api?.openExternal) {
      api.openExternal(url);
    } else {
      window.open(url, '_blank', 'noopener,noreferrer');
    }
  };

  const memoryPct = data?.memory
    ? Math.round((data.memory.chars / data.memory.limit) * 100)
    : 0;
  const userPct = data?.userProfile
    ? Math.round((data.userProfile.chars / data.userProfile.limit) * 100)
    : 0;

  const gatewayReady = Boolean(data?.gatewayReady);

  return (
    <motion.div
      key="missionControl"
      layout={layout}
      initial={{ opacity: 0, scale: 0.97, y: 8 }}
      animate={{ opacity: 1, scale: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.97, y: 8 }}
      transition={{ type: 'spring', stiffness: 300, damping: 28 }}
      className={getShellClass(`flex flex-col min-h-[420px] ${WIDGET_PANEL_CLASS}`)}
    >
      <div className={WIDGET_HEADER_CLASS}>
        <div className="flex items-center gap-3">
          <div className="p-1 cursor-grab active:cursor-grabbing text-white/20 hover:text-primary transition-colors">
            <GripVertical className="size-3.5" />
          </div>
          <div className="flex items-center gap-2">
            <Sparkles className="size-4 text-violet-400" />
            <span className={WIDGET_TITLE_CLASS}>Hermes Agent</span>
            <span
              className={`flex items-center gap-1 text-[8px] font-bold ${
                data?.isOnline ? 'text-green-400/80' : 'text-red-400/60'
              }`}
            >
              <span
                className={`size-1 rounded-full ${
                  data?.isOnline ? 'bg-green-400 animate-pulse' : 'bg-red-400'
                }`}
              />
              {data?.isOnline ? 'Live' : 'Offline'}
            </span>
          </div>
        </div>

        <div className="flex items-center gap-1.5">
          <WidgetPopOutButton widgetId="missionControl" />
          <WidgetFullscreenButton widgetId="missionControl" />
          <button
            onClick={(e) => {
              e.stopPropagation();
              fetchData();
            }}
            title="Aktualisieren"
            className="p-1.5 rounded-lg hover:bg-white/5 text-white/20 hover:text-primary transition-colors"
          >
            <RefreshCw className={`size-3 ${loading ? 'animate-spin' : ''}`} />
          </button>
          <button
            onClick={() => closeWidget('missionControl')}
            className="p-1.5 rounded-lg hover:bg-red-500/10 text-white/30 hover:text-red-400 transition-all"
          >
            <X className="size-3.5" />
          </button>
        </div>
      </div>

      <div className="flex gap-1 px-3 pt-2">
        <TabButton
          active={tab === 'chat'}
          onClick={() => setTab('chat')}
          icon={MessageSquare}
          label="Chat-Hinweis"
        />
        <TabButton
          active={tab === 'overview'}
          onClick={() => setTab('overview')}
          icon={LayoutDashboard}
          label="Status"
        />
      </div>

      <div className="flex flex-col flex-1 min-h-0 p-3 pt-2">
        {tab === 'chat' ? (
          <HermesUnifiedChatHint gatewayReady={gatewayReady} />
        ) : (
          <div className="space-y-3 overflow-y-auto">
            <div className="grid grid-cols-3 gap-2">
              <StatCard
                icon={Activity}
                label="Gateway"
                value={data?.gatewayReady ? 'OK' : '—'}
                color={data?.gatewayReady ? 'text-emerald-400' : 'text-red-400'}
              />
              <StatCard
                icon={Brain}
                label="Memory"
                value={data?.memory ? `${memoryPct}%` : '—'}
                color="text-violet-400"
                hint={data?.memory ? `${data.memory.chars}/${data.memory.limit}` : undefined}
              />
              <StatCard
                icon={Database}
                label="Sessions"
                value={data?.sessionCount != null ? String(data.sessionCount) : '—'}
                color="text-cyan-400"
              />
            </div>

            {(data?.warnings?.length ?? 0) > 0 && (
              <div className="px-2 py-1 rounded-lg bg-amber-500/10 ring-1 ring-amber-500/20">
                <span className="text-[8px] font-medium text-amber-300/90">
                  {data?.warnings?.includes('gateway_unreachable')
                    ? 'Hermes Gateway offline — START_JARVIS.bat oder hermes gateway run'
                    : data?.warnings?.includes('gateway_wsl_log_active')
                      ? 'Gateway läuft in WSL — HTTP von Windows eingeschränkt, Chat über WSL-Bridge'
                      : data?.warnings?.join(', ')}
                </span>
              </div>
            )}

            <div className="space-y-1">
              <span className={`${WIDGET_LABEL_MUTED_CLASS} px-1 flex items-center gap-1`}>
                <Terminal className="size-3 opacity-50" />
                Gateway-Log
              </span>
              <div className="max-h-28 overflow-y-auto space-y-0.5 rounded-lg bg-black/30 p-2 ring-1 ring-white/5">
                {(data?.recentLogs?.length ?? 0) > 0 ? (
                  data!.recentLogs.slice(-8).map((line, i) => (
                    <div key={i} className={`${WIDGET_LIST_ROW_CLASS} text-[8px] font-mono text-white/45 py-0.5`}>
                      {line.slice(0, 120)}
                    </div>
                  ))
                ) : (
                  <span className="text-[9px] text-white/25">Keine Log-Zeilen</span>
                )}
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <button
                onClick={() => {
                  const api = (
                    window as Window & {
                      eliteAPI?: {
                        openMissionControl?: () => Promise<{ ok: boolean }>;
                        openExternal?: (u: string) => void;
                      };
                    }
                  ).eliteAPI;
                  if (api?.openMissionControl) {
                    void api.openMissionControl().catch((err: unknown) => {
                      const msg = err instanceof Error ? err.message : String(err);
                      addLog({
                        type: 'system',
                        message: msg.includes('No handler')
                          ? '[Hermes] Mission Control: Elite/Electron komplett neu starten (main.js Handler fehlt).'
                          : `[Hermes] Mission Control: ${msg}`,
                      });
                    });
                    return;
                  }
                  const url = `${window.location.origin}/hermes/mission-control`;
                  if (api?.openExternal) api.openExternal(url);
                  else window.location.href = url;
                }}
                className="flex items-center justify-center gap-1.5 py-2 rounded-xl bg-cyan-500/10 ring-1 ring-cyan-500/20 hover:bg-cyan-500/20 transition-all"
              >
                <LayoutDashboard className="size-3 text-cyan-400" />
                <span className="text-[9px] font-bold uppercase tracking-wider text-cyan-400">
                  Mission Control
                </span>
              </button>
              <button
                onClick={handleOpenDashboard}
                className="flex items-center justify-center gap-1.5 py-2 rounded-xl bg-violet-500/10 ring-1 ring-violet-500/20 hover:bg-violet-500/20 transition-all"
              >
                <ExternalLink className="size-3 text-violet-400" />
                <span className="text-[9px] font-bold uppercase tracking-wider text-violet-400">
                  Hermes UI
                </span>
              </button>
            </div>
            <button
              onClick={() => {
                const api = (window as Window & { eliteAPI?: { openExternal?: (u: string) => void } }).eliteAPI;
                const url = 'http://127.0.0.1:31337';
                if (api?.openExternal) api.openExternal(url);
                else window.open(url, '_blank', 'noopener,noreferrer');
              }}
              className="flex w-full items-center justify-center gap-1.5 py-2 mt-2 rounded-xl bg-primary/10 ring-1 ring-primary/20 hover:bg-primary/20 transition-all"
            >
              <Brain className="size-3 text-primary" />
              <span className="text-[9px] font-bold uppercase tracking-wider text-primary">
                PAI Pulse
              </span>
            </button>

            {userPct > 0 && (
              <div className={`${WIDGET_LIST_ROW_CLASS} justify-between`}>
                <span className="text-[8px] text-white/40">USER.md</span>
                <span className="text-[9px] font-bold text-white/60">{userPct}%</span>
              </div>
            )}
          </div>
        )}
      </div>
    </motion.div>
  );
}

function TabButton({
  active,
  onClick,
  icon: Icon,
  label,
}: {
  active: boolean;
  onClick: () => void;
  icon: React.FC<{ className?: string }>;
  label: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[9px] font-bold uppercase tracking-wider transition-all ${
        active
          ? 'bg-violet-500/15 text-violet-300 ring-1 ring-violet-500/30'
          : 'text-white/30 hover:text-white/50 hover:bg-white/5'
      }`}
    >
      <Icon className="size-3" />
      {label}
    </button>
  );
}

function StatCard({
  icon: Icon,
  label,
  value,
  color,
  hint,
}: {
  icon: React.FC<{ className?: string }>;
  label: string;
  value: string;
  color: string;
  hint?: string;
}) {
  return (
    <div className={WIDGET_STAT_CARD_CLASS}>
      <Icon className={`size-3 ${color} opacity-60`} />
      <span className="text-[10px] font-bold text-white/80">{value}</span>
      <span className="text-[7px] font-bold uppercase tracking-widest text-white/50">{label}</span>
      {hint && <span className="text-[6px] text-white/35">{hint}</span>}
    </div>
  );
}
