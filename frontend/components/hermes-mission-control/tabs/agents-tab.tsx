'use client';

import { useMemo, useRef, useEffect, useState } from 'react';
import type { McSnapshot } from '@/lib/hermes-mission-control-types';
import { agentById, relativeTime } from '../utils';

const DONUT_COLORS: Record<string, string> = {
  orchestrator: '#A78BFA',
  elite: '#7DD3FC',
  scout: '#7DD3FC',
  scribe: '#F472B6',
  reach: '#FBBF24',
  dev: '#E879F9',
};

export function AgentsTab({ data }: { data: McSnapshot }) {
  const agents = data.agents;
  const [filter, setFilter] = useState('ALL');
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const counts = useMemo(() => {
    const active = agents.filter((a) => a.status === 'active').length;
    const idle = agents.filter((a) => a.status === 'idle').length;
    const dormant = agents.filter((a) => a.status === 'dormant').length;
    return { active, idle, dormant };
  }, [agents]);

  const weekTotal = data.activity_by_day.reduce((s, d) => s + d.total, 0);
  const todayTotal = data.activity_by_day.at(-1)?.total ?? 0;

  const mostActive = useMemo(() => {
    if (agents.length === 0) {
      return { agent: null as (typeof agents)[number] | null, count: 0 };
    }
    const totals: Record<string, number> = {};
    for (const day of data.activity_by_day) {
      for (const [id, n] of Object.entries(day.agents ?? {})) {
        totals[id] = (totals[id] ?? 0) + n;
      }
    }
    let best = agents[0];
    let bestN = 0;
    for (const a of agents) {
      if ((totals[a.id] ?? 0) > bestN) {
        bestN = totals[a.id] ?? 0;
        best = a;
      }
    }
    return { agent: best, count: bestN };
  }, [agents, data.activity_by_day]);

  const successRate =
    data.stats.total > 0 ? Math.round((data.stats.completed / data.stats.total) * 100) : 100;

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const cx = 65;
    const cy = 65;
    const outer = 52;
    const inner = 32;
    ctx.clearRect(0, 0, 130, 130);
    const total = agents.reduce((s, a) => s + a.responses, 0);
    if (total === 0) {
      ctx.strokeStyle = 'rgba(255,255,255,0.08)';
      ctx.beginPath();
      ctx.arc(cx, cy, outer, 0, Math.PI * 2);
      ctx.stroke();
      ctx.fillStyle = '#F4F4F8';
      ctx.font = 'bold 18px Inter, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('0', cx, cy);
      ctx.font = '10px monospace';
      ctx.fillText('TOTAL', cx, cy + 14);
      return;
    }
    let start = -Math.PI / 2;
    for (const a of agents) {
      const slice = (a.responses / total) * Math.PI * 2;
      ctx.beginPath();
      ctx.arc(cx, cy, outer, start, start + slice);
      ctx.arc(cx, cy, inner, start + slice, start, true);
      ctx.closePath();
      ctx.fillStyle = DONUT_COLORS[a.id] ?? a.color;
      ctx.fill();
      start += slice;
    }
    ctx.fillStyle = '#F4F4F8';
    ctx.font = 'bold 18px Inter, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(String(total), cx, cy + 2);
    ctx.font = '10px monospace';
    ctx.fillText('TOTAL', cx, cy + 16);
  }, [agents]);

  const filteredLog = data.activity.filter((row) => {
    if (filter === 'ALL') return true;
    const a = agentById(String(row.agent).toLowerCase(), agents);
    return a.code === filter;
  });

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', flexWrap: 'wrap', gap: 16 }}>
        <div>
          <div className="hmc-mono hmc-eyebrow" style={{ marginBottom: 4 }}>
            Subagents
          </div>
          <h1 className="hmc-display">The collective.</h1>
        </div>
        <div className="hmc-glass" style={{ display: 'flex', padding: '0.5rem 0' }}>
          {[
            { label: 'Active', value: counts.active, color: 'var(--hmc-mint)' },
            { label: 'Idle', value: counts.idle, color: 'var(--hmc-amber)' },
            { label: 'Dormant', value: counts.dormant, color: 'var(--hmc-muted)' },
          ].map((c, i) => (
            <div
              key={c.label}
              style={{
                padding: '0.5rem 1.25rem',
                borderLeft: i ? '1px solid var(--hmc-border)' : undefined,
                textAlign: 'center',
              }}
            >
              <div className="hmc-mono">{c.label}</div>
              <div style={{ fontSize: 28, fontWeight: 600, color: c.color }}>{c.value}</div>
            </div>
          ))}
        </div>
      </div>

      <div className="hmc-agent-grid" style={{ marginTop: '1.5rem' }}>
        {agents.map((a) => (
          <div
            key={a.id}
            className="hmc-glass hmc-agent-card"
            style={{ borderTop: `2px solid ${a.color}` }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span className="hmc-mono" style={{ color: a.color }}>
                {a.code}
              </span>
              <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                <span className="hmc-mono" style={{ color: 'var(--hmc-cyan)', fontSize: 9 }}>
                  {a.platform}
                </span>
                <span
                  className="hmc-status-dot"
                  style={{
                    background: a.status === 'active' ? 'var(--hmc-mint)' : a.status === 'idle' ? 'var(--hmc-amber)' : 'var(--hmc-muted)',
                    opacity: a.status === 'dormant' ? 0.25 : 1,
                  }}
                />
              </div>
            </div>
            <div className="name">{a.name}</div>
            <p style={{ color: 'var(--hmc-muted)', fontSize: 13, margin: 0, lineHeight: 1.4, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
              {a.role}
            </p>
            <div className="hmc-mono" style={{ marginTop: 10 }}>
              7-day activity
            </div>
            <div className="hmc-mini-bars">
              {a.activity_7d.map((n, i) => {
                const max = Math.max(1, ...a.activity_7d);
                const h = Math.max(2, (n / max) * 32);
                return (
                  <span
                    key={i}
                    style={{ height: h, background: a.color, opacity: n ? 0.85 : 0.15 }}
                  />
                );
              })}
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8, fontSize: 12 }}>
              <div>
                <div className="hmc-mono" style={{ color: 'var(--hmc-muted)' }}>
                  Responses
                </div>
                <div style={{ fontSize: 20, color: a.color }}>{a.responses}</div>
              </div>
              <div>
                <div className="hmc-mono" style={{ color: 'var(--hmc-muted)' }}>
                  Success
                </div>
                <div
                  style={{
                    fontSize: 20,
                    color:
                      a.success_pct >= 100
                        ? 'var(--hmc-mint)'
                        : a.success_pct >= 80
                          ? 'var(--hmc-amber)'
                          : 'var(--hmc-red)',
                  }}
                >
                  {a.success_pct}%
                </div>
              </div>
              <div>
                <div className="hmc-mono" style={{ color: 'var(--hmc-muted)' }}>
                  Model
                </div>
                <div className="hmc-mono" style={{ fontSize: 10, overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {a.model}
                </div>
              </div>
            </div>
            <div className="hmc-bar" style={{ marginTop: 10 }}>
              <div className="hmc-bar-fill" style={{ width: `${a.load_share}%`, background: a.color }} />
            </div>
            <p style={{ color: 'var(--hmc-muted)', fontSize: 12, marginTop: 8 }}>
              ↳ {a.last_task}
            </p>
            <div className="hmc-mono" style={{ color: 'var(--hmc-muted)' }}>
              {relativeTime(a.last_seen)}
            </div>
          </div>
        ))}
      </div>

      <div className="hmc-eyebrow" style={{ marginTop: '2rem' }}>
        <span>📊</span>
        <span className="hmc-mono">Agent statistics</span>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 300px', gap: '1rem' }}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
          {[
            { label: 'Tasks today', value: todayTotal, bar: 'var(--hmc-amber)', width: 100 },
            { label: 'Tasks this week', value: weekTotal, bar: 'var(--hmc-cyan)', width: 100 },
            {
              label: 'Most active',
              value: mostActive.agent?.name ?? '—',
              bar: mostActive.agent?.color ?? 'var(--hmc-muted)',
              width: weekTotal ? (mostActive.count / weekTotal) * 100 : 0,
              valueColor: mostActive.agent?.color ?? 'var(--hmc-muted)',
            },
            {
              label: 'Success rate',
              value: `${successRate}%`,
              bar:
                successRate >= 90
                  ? 'var(--hmc-mint)'
                  : successRate >= 70
                    ? 'var(--hmc-amber)'
                    : 'var(--hmc-red)',
              width: successRate,
            },
          ].map((card) => (
            <div key={card.label} className="hmc-glass" style={{ padding: '1rem' }}>
              <div className="hmc-mono">{card.label}</div>
              <div
                style={{
                  fontSize: 36,
                  fontWeight: 700,
                  marginTop: 8,
                  color: 'valueColor' in card ? card.valueColor : 'var(--hmc-text)',
                }}
              >
                {card.value}
              </div>
              <div className="hmc-stat-accent-bar">
                <span style={{ width: `${card.width}%`, background: card.bar }} />
              </div>
            </div>
          ))}
        </div>
        <div className="hmc-glass" style={{ padding: '1rem', textAlign: 'center' }}>
          <div className="hmc-mono" style={{ textAlign: 'left', marginBottom: 8 }}>
            Task distribution
          </div>
          <canvas ref={canvasRef} width={130} height={130} />
          <div style={{ marginTop: 12, textAlign: 'left' }}>
            {agents.map((a) => {
              const total = agents.reduce((s, x) => s + x.responses, 0) || 1;
              const pct = Math.round((a.responses / total) * 100);
              return (
                <div
                  key={a.id}
                  style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4, fontSize: 11 }}
                >
                  <span style={{ width: 8, height: 8, borderRadius: '50%', background: DONUT_COLORS[a.id] ?? a.color }} />
                  <span style={{ flex: 1 }}>{a.name}</span>
                  <span className="hmc-mono" style={{ color: 'var(--hmc-muted)' }}>
                    {pct}%
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      <div className="hmc-glass" style={{ marginTop: '1.5rem', padding: '1rem' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 12 }}>
          <span className="hmc-mono">Agent logs</span>
          <span className="hmc-mono" style={{ color: 'var(--hmc-muted)' }}>
            {filteredLog.length} entries
          </span>
        </div>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 12 }}>
          {['ALL', ...agents.map((a) => a.code)].map((code) => (
            <button
              key={code}
              type="button"
              className={`hmc-filter-pill ${filter === code ? 'active' : ''}`}
              onClick={() => setFilter(code)}
            >
              {code}
            </button>
          ))}
        </div>
        <div style={{ maxHeight: 420, overflowY: 'auto' }}>
          <table className="hmc-log-table">
            <thead>
              <tr>
                <th>Time</th>
                <th>Agent</th>
                <th>Task</th>
                <th>Model</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {filteredLog.slice(0, 80).map((row) => {
                const a = agentById(String(row.agent).toLowerCase(), agents);
                const ts =
                  typeof row.created_at === 'number'
                    ? row.created_at
                    : Date.parse(String(row.created_at)) / 1000;
                const failed = String(row.status).toLowerCase() === 'failed';
                return (
                  <tr key={row.id}>
                    <td className="hmc-mono">{relativeTime(ts)}</td>
                    <td style={{ color: a.color }}>{a.name}</td>
                    <td>{String(row.task).slice(0, 100)}</td>
                    <td className="hmc-mono">{row.model ?? '—'}</td>
                    <td>
                      <span
                        className="hmc-mono"
                        style={{
                          padding: '2px 8px',
                          borderRadius: 4,
                          background: failed ? 'rgba(242,109,109,0.15)' : 'rgba(94,226,181,0.12)',
                          color: failed ? 'var(--hmc-red)' : 'var(--hmc-mint)',
                        }}
                      >
                        {row.status}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
