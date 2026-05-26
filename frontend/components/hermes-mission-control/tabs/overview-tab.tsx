'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import type { McSnapshot } from '@/lib/hermes-mission-control-types';
import { agentById, barColor, formatUptime, relativeTime } from '../utils';

function parseTs(ts: number | string | undefined): number {
  if (typeof ts === 'number') return ts;
  if (!ts) return 0;
  const n = Date.parse(String(ts));
  return Number.isNaN(n) ? 0 : n / 1000;
}

export function OverviewTab({ data }: { data: McSnapshot }) {
  const agents = data.agents;
  const activity = data.activity.slice(0, 50);
  const [directiveIdx, setDirectiveIdx] = useState(0);
  const [ctxIdx, setCtxIdx] = useState(0);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const directives = useMemo(() => {
    if (activity.length === 0) {
      return agents.map((a) => `${a.code} · awaiting uplink`);
    }
    return activity.map((row) => {
      const a = agentById(String(row.agent).toLowerCase(), agents);
      return `${a.code} · ${String(row.task).slice(0, 120)}`;
    });
  }, [activity, agents]);

  useEffect(() => {
    const t = setInterval(() => setDirectiveIdx((i) => (i + 1) % Math.max(1, directives.length)), 2600);
    return () => clearInterval(t);
  }, [directives.length]);

  useEffect(() => {
    const t = setInterval(() => setCtxIdx((i) => (i + 1) % Math.max(1, agents.length)), 2400);
    return () => clearInterval(t);
  }, [agents.length]);

  const ctxAgent = agents[ctxIdx] ?? agents[0];
  const filledSegs = ctxAgent
    ? Math.round((ctxAgent.load_share / 100) * 16)
    : 0;

  const days = data.activity_by_day;
  const sparkValues = days.map((d) => d.total);
  const maxSpark = Math.max(1, ...sparkValues);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const w = canvas.width;
    const h = canvas.height;
    ctx.clearRect(0, 0, w, h);
    const pad = 4;
    const step = (w - pad * 2) / Math.max(1, sparkValues.length - 1);
    const points = sparkValues.map((v, i) => ({
      x: pad + i * step,
      y: h - pad - (v / maxSpark) * (h - pad * 2),
    }));
    if (points.length < 2) return;
    const grad = ctx.createLinearGradient(0, 0, 0, h);
    grad.addColorStop(0, 'rgba(139,92,246,0.35)');
    grad.addColorStop(1, 'rgba(125,211,252,0.05)');
    ctx.beginPath();
    ctx.moveTo(points[0].x, h);
    points.forEach((p) => ctx.lineTo(p.x, p.y));
    ctx.lineTo(points[points.length - 1].x, h);
    ctx.closePath();
    ctx.fillStyle = grad;
    ctx.fill();
    ctx.beginPath();
    points.forEach((p, i) => (i === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y)));
    ctx.strokeStyle = '#8b5cf6';
    ctx.lineWidth = 2;
    ctx.stroke();
    const last = points[points.length - 1];
    ctx.fillStyle = '#7dd3fc';
    ctx.beginPath();
    ctx.arc(last.x, last.y, 4, 0, Math.PI * 2);
    ctx.fill();
  }, [sparkValues, maxSpark]);

  const feed = activity.slice(0, 8);
  const todayTotal = days.at(-1)?.total ?? 0;
  const integrity = data.stats.integrity_pct;
  const intPart = Math.floor(integrity);
  const decPart = (integrity % 1).toFixed(2).slice(1);
  const responsive = agents.filter((a) => a.status !== 'dormant').length;

  const vps = data.vps;
  const metrics = [
    {
      label: 'CPU',
      pct: vps.cpu_pct ?? 0,
      grad: 'linear-gradient(90deg, #7dd3fc, #8b5cf6)',
      sub: null as string | null,
      color: 'var(--hmc-cyan)',
    },
    {
      label: 'RAM',
      pct: vps.mem_pct ?? 0,
      grad: 'linear-gradient(90deg, #8b5cf6, #e879f9)',
      sub:
        vps.mem_used_mb != null
          ? `${vps.mem_used_mb} / ${vps.mem_total_mb ?? '—'} MB`
          : null,
      color: 'var(--hmc-violet-glow)',
    },
    {
      label: 'Disk',
      pct: vps.disk_pct ?? 0,
      grad: 'linear-gradient(90deg, #5ee2b5, #7dd3fc)',
      sub:
        vps.disk_used_gb != null
          ? `${vps.disk_used_gb} / ${vps.disk_total_gb ?? '—'} GB`
          : null,
      color: 'var(--hmc-mint)',
    },
  ];

  const totalResponses = agents.reduce((s, a) => s + a.responses, 0) || 1;

  return (
    <div>
      <div className="hmc-eyebrow">
        <span className="hmc-status-dot" style={{ width: 6, height: 6 }} />
        <span className="mint hmc-mono">Uplink synced</span>
        <span className="hmc-hairline" />
        <span className="hmc-mono">Hermes Orchestrator</span>
        <span className="hmc-mono" style={{ color: 'var(--hmc-muted)' }}>
          v{data.version}
        </span>
      </div>

      <div className="hmc-glass hmc-ops-grid">
        <div>
          <svg className="hmc-radar" viewBox="0 0 140 140" aria-hidden>
            {[62, 46, 30, 14].map((r) => (
              <circle key={r} cx="70" cy="70" r={r} fill="none" stroke="rgba(255,255,255,0.06)" />
            ))}
            <line x1="70" y1="8" x2="70" y2="132" stroke="rgba(255,255,255,0.06)" />
            <line x1="8" y1="70" x2="132" y2="70" stroke="rgba(255,255,255,0.06)" />
            <g className="hmc-radar-sweep">
              <line x1="70" y1="70" x2="70" y2="12" stroke="#7dd3fc" strokeWidth="1.5" />
              <circle cx="70" cy="12" r="3" fill="#7dd3fc" />
            </g>
            {agents.map((a) => {
              const dist = 14 + (a.responses / totalResponses) * 48;
              const angle = (agents.indexOf(a) / agents.length) * Math.PI * 2 - Math.PI / 2;
              const cx = 70 + Math.cos(angle) * dist;
              const cy = 70 + Math.sin(angle) * dist;
              return (
                <circle
                  key={a.id}
                  cx={cx}
                  cy={cy}
                  r="4.5"
                  fill={a.color}
                  style={{ filter: `drop-shadow(0 0 6px ${a.color})` }}
                />
              );
            })}
          </svg>
        </div>

        <div>
          <div className="hmc-mono" style={{ marginBottom: 8 }}>
            Current directive
          </div>
          <div
            className="hmc-mono"
            style={{ color: 'var(--hmc-cyan)', fontSize: 15, minHeight: 60, lineHeight: 1.5 }}
          >
            {directives[directiveIdx % directives.length]}
          </div>
          <div style={{ marginTop: 20 }}>
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                marginBottom: 6,
              }}
              className="hmc-mono"
            >
              <span>Context window · {ctxAgent?.name}</span>
              <span>{ctxAgent?.responses ?? 0} tasks</span>
            </div>
            <div style={{ display: 'flex', gap: 4 }}>
              {Array.from({ length: 16 }).map((_, i) => (
                <span
                  key={i}
                  style={{
                    flex: 1,
                    height: 5,
                    borderRadius: 2,
                    background:
                      i < filledSegs
                        ? ctxAgent?.color ?? 'var(--hmc-violet)'
                        : 'rgba(255,255,255,0.04)',
                    opacity: i < filledSegs ? 1 : 0.3,
                  }}
                />
              ))}
            </div>
            <div className="hmc-mono" style={{ marginTop: 8, color: 'var(--hmc-muted)' }}>
              {ctxAgent?.last_task?.slice(0, 100) ?? '—'}
            </div>
          </div>
        </div>

        <div>
          <div className="hmc-mono" style={{ marginBottom: 12 }}>
            VPS health
          </div>
          {metrics.map((m) => (
            <div key={m.label} style={{ marginBottom: 16 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                <span className="hmc-mono">{m.label}</span>
                <span style={{ color: barColor(m.pct), fontFamily: 'var(--font-inter-tight)' }}>
                  {m.pct != null ? `${m.pct}%` : '—'}
                </span>
              </div>
              <div className="hmc-bar">
                <div
                  className="hmc-bar-fill"
                  style={{
                    width: `${Math.min(100, m.pct)}%`,
                    background: m.grad,
                  }}
                />
              </div>
              {m.sub && (
                <div className="hmc-mono" style={{ textAlign: 'right', marginTop: 4, color: 'var(--hmc-muted)' }}>
                  {m.sub}
                </div>
              )}
            </div>
          ))}
          <div className="hmc-hairline" style={{ margin: '1rem 0' }} />
          <div className="hmc-mono">Hermes DBs</div>
          <div style={{ color: 'var(--hmc-gold)', fontSize: 20, fontWeight: 600 }}>
            {vps.db_size_mb} MB
          </div>
        </div>

        <div className="hmc-footer-metrics" style={{ gridColumn: '1 / -1' }}>
          {[
            { label: 'Queue', value: data.kanban.total },
            { label: 'Sessions', value: data.sessions.count },
            {
              label: 'Errors',
              value: data.stats.failed,
              color: data.stats.failed > 0 ? 'var(--hmc-red)' : 'var(--hmc-mint)',
            },
            { label: 'Today', value: todayTotal },
            { label: 'Uptime', value: formatUptime(data.gateway.uptime_seconds) },
          ].map((cell) => (
            <div key={cell.label}>
              <div className="hmc-mono">{cell.label}</div>
              <div
                className="hmc-mono"
                style={{
                  fontSize: 18,
                  color: 'color' in cell ? cell.color : 'var(--hmc-text)',
                }}
              >
                {cell.value}
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="hmc-stat-strip">
        {[
          {
            label: 'Integrity',
            border: 'var(--hmc-mint)',
            value: (
              <>
                {intPart}
                <span style={{ opacity: 0.7 }}>{decPart}</span>%
              </>
            ),
            sub: (
              <>
                <span className="hmc-status-dot" style={{ width: 6, height: 6, display: 'inline-block' }} />{' '}
                {responsive} of {agents.length} responsive
              </>
            ),
          },
          { label: 'Agent calls', border: 'var(--hmc-cyan)', value: data.stats.total, sub: 'logged events' },
          {
            label: 'Messages',
            border: 'var(--hmc-violet-glow)',
            value: data.sessions.totals.messages ?? 0,
            sub: 'sessions',
          },
          {
            label: 'Tokens in',
            border: 'var(--hmc-gold)',
            value: data.sessions.totals.input_tokens ?? 0,
            sub: 'input',
          },
          {
            label: 'Cache hits',
            border: 'var(--hmc-pink)',
            value: data.sessions.totals.cache_read_tokens ?? 0,
            sub: 'cache read',
          },
        ].map((card) => (
          <div
            key={card.label}
            className="hmc-glass hmc-stat-card"
            style={{ borderTop: `2px solid ${card.border}` }}
          >
            <div className="hmc-mono">{card.label}</div>
            <div className="value">{card.value}</div>
            <div className="hmc-mono" style={{ marginTop: 6, color: 'var(--hmc-muted)' }}>
              {card.sub}
            </div>
          </div>
        ))}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 1fr', gap: '1rem', marginTop: '1rem' }}>
        <div className="hmc-glass" style={{ padding: '1.25rem' }}>
          <div className="hmc-mono">Throughput</div>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 12, marginTop: 8 }}>
            <span
              style={{
                fontSize: 'clamp(34px, 4vw, 56px)',
                fontWeight: 700,
                color: 'var(--hmc-cyan)',
              }}
            >
              {data.stats.total}
            </span>
            <span style={{ color: 'var(--hmc-muted)', fontSize: 18 }}>responses total</span>
          </div>
          <canvas ref={canvasRef} width={600} height={100} style={{ width: '100%', height: 100, marginTop: 12 }} />
          <div className="hmc-mono mint" style={{ marginTop: 8, color: 'var(--hmc-mint)' }}>
            Peak: {days.reduce((best, d) => (d.total > (best?.total ?? 0) ? d : best), days[0])?.date || '—'}
          </div>
        </div>
        <div className="hmc-glass" style={{ padding: '1.25rem' }}>
          <div className="hmc-mono">Activity</div>
          <div style={{ marginTop: 12 }}>
            {feed.map((row) => {
              const a = agentById(String(row.agent).toLowerCase(), agents);
              const ok = String(row.status).toLowerCase() !== 'failed';
              return (
                <div
                  key={row.id}
                  style={{
                    display: 'flex',
                    gap: 8,
                    alignItems: 'flex-start',
                    marginBottom: 10,
                    fontSize: 12,
                  }}
                >
                  <span
                    className="hmc-mono"
                    style={{
                      color: a.color,
                      padding: '2px 6px',
                      borderRadius: 4,
                      background: `${a.color}22`,
                      flexShrink: 0,
                    }}
                  >
                    {a.code}
                  </span>
                  <span style={{ flex: 1, opacity: 0.9 }}>{String(row.task).slice(0, 80)}</span>
                  <span style={{ color: ok ? 'var(--hmc-mint)' : 'var(--hmc-red)', fontSize: 10 }}>
                    {row.status}
                  </span>
                  <span className="hmc-mono" style={{ color: 'var(--hmc-muted)', flexShrink: 0 }}>
                    {relativeTime(parseTs(row.created_at))}
                  </span>
                </div>
              );
            })}
            {feed.length === 0 && (
              <p className="hmc-mono" style={{ color: 'var(--hmc-muted)' }}>
                No activity yet — enable agent-logs.db or check gateway log
              </p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
