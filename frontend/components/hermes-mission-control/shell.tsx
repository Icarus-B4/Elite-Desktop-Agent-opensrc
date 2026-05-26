'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import type { McTab } from '@/lib/hermes-mission-control-types';
import { formatClock } from './utils';

const TABS: { id: McTab; label: string }[] = [
  { id: 'overview', label: 'Overview' },
  { id: 'agents', label: 'Agents' },
  { id: 'tasks', label: 'Tasks' },
  { id: 'schedule', label: 'Schedule' },
  { id: 'content', label: 'Content' },
];

export function MissionControlShell({
  tab,
  onTab,
  operational,
  children,
}: {
  tab: McTab;
  onTab: (t: McTab) => void;
  operational: boolean;
  children: React.ReactNode;
}) {
  // Live clock only after mount — avoids SSR/client second mismatch (hydration).
  const [clock, setClock] = useState('');

  useEffect(() => {
    const tick = () => setClock(formatClock());
    tick();
    const t = setInterval(tick, 1000);
    return () => clearInterval(t);
  }, []);

  return (
    <>
      <div className="hmc-bg-orbs" />
      <div className="hmc-dot-grid" />
      <div className="hmc-shell">
        <nav className="hmc-nav">
          <div className="hmc-brand">
            <div className="hmc-brand-ring" aria-hidden />
            <div>
              <div style={{ fontWeight: 600, fontSize: 15 }}>Hermes</div>
              <div className="hmc-mono" style={{ color: 'var(--hmc-muted)' }}>
                / ORCHESTRATOR
                <span className="hmc-version-badge">v1.0</span>
              </div>
            </div>
          </div>

          <div className="hmc-tabs" role="tablist">
            {TABS.map((t) => (
              <button
                key={t.id}
                type="button"
                role="tab"
                aria-selected={tab === t.id}
                className={`hmc-tab ${tab === t.id ? 'active' : ''}`}
                onClick={() => onTab(t.id)}
              >
                {t.label}
              </button>
            ))}
          </div>

          <div className="hmc-status-pill">
            <span className="hmc-status-dot" style={operational ? undefined : { background: 'var(--hmc-amber)' }} />
            <span>{operational ? 'All systems operational' : 'Degraded — check gateway'}</span>
            <span
              className="hmc-mono"
              style={{ marginLeft: 8, color: 'var(--hmc-text)', minWidth: '4.5rem', display: 'inline-block' }}
              suppressHydrationWarning
            >
              {clock || '--:--:--'}
            </span>
          </div>
        </nav>

        <main className="hmc-main">
          <p style={{ marginBottom: '1rem' }}>
            <Link href="/dashboard" className="hmc-link-back">
              ← Elite Control Hub (Widgets unverändert)
            </Link>
            {' · '}
            <a href="http://127.0.0.1:9119" className="hmc-link-back" target="_blank" rel="noreferrer">
              Hermes Web UI :9119
            </a>
          </p>
          {children}
        </main>
      </div>
    </>
  );
}
