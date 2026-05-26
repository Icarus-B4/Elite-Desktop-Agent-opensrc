'use client';

import { useCallback, useEffect, useState } from 'react';
import type { McSnapshot, McTab } from '@/lib/hermes-mission-control-types';
import { MissionControlShell } from './shell';
import { OverviewTab } from './tabs/overview-tab';
import { AgentsTab } from './tabs/agents-tab';
import { TasksTab } from './tabs/tasks-tab';
import { ScheduleTab } from './tabs/schedule-tab';
import { ContentTab } from './tabs/content-tab';

const EMPTY_SNAPSHOT: McSnapshot = {
  ok: false,
  version: '1.0',
  generated_at: '',
  gateway: { state: 'unknown', uptime_seconds: null },
  activity: [],
  activity_by_day: [],
  agents: [],
  stats: { total: 0, completed: 0, failed: 0, integrity_pct: 100 },
  sessions: { count: 0, totals: {} },
  kanban: { total: 0 },
  vps: {
    cpu_pct: null,
    mem_pct: null,
    mem_used_mb: null,
    mem_total_mb: null,
    disk_pct: null,
    disk_used_gb: null,
    disk_total_gb: null,
    db_size_mb: 0,
  },
  crons: [],
  content_index: [],
  warnings: [],
};

export function MissionControlApp() {
  const [tab, setTab] = useState<McTab>('overview');
  const [data, setData] = useState<McSnapshot>(EMPTY_SNAPSHOT);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch('/api/hermes/mission-control/snapshot', { cache: 'no-store' });
      const payload = await res.json();
      if (payload.ok !== false && payload.agents) {
        setData(payload as McSnapshot);
        setError(null);
      } else {
        setError(payload.error ?? 'snapshot_unavailable');
      }
    } catch {
      setError('network_error');
    }
  }, []);

  useEffect(() => {
    load();
    const id = setInterval(load, 8000);
    return () => clearInterval(id);
  }, [load]);

  const operational =
    data.gateway.state === 'running' ||
    data.gateway.state === 'ready' ||
    (data.stats.failed === 0 && data.warnings.length === 0);

  return (
    <MissionControlShell tab={tab} onTab={setTab} operational={operational}>
      {error && (
        <div
          className="hmc-glass"
          style={{
            padding: '0.75rem 1rem',
            marginBottom: '1rem',
            borderColor: 'var(--hmc-amber)',
            color: 'var(--hmc-amber)',
            fontSize: 13,
          }}
        >
          Snapshot: {error} — prüfe Python/WSL und Hermes-Pfade. Das Elite-Widget unter /dashboard bleibt unverändert nutzbar.
        </div>
      )}
      {tab === 'overview' && <OverviewTab data={data} />}
      {tab === 'agents' && <AgentsTab data={data} />}
      {tab === 'tasks' && <TasksTab />}
      {tab === 'schedule' && <ScheduleTab data={data} />}
      {tab === 'content' && <ContentTab data={data} />}
    </MissionControlShell>
  );
}
