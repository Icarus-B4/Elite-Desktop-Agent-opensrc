export function formatClock(d = new Date()) {
  return d.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

export function formatUptime(seconds: number | null | undefined) {
  if (seconds == null || seconds < 0) return '—';
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}

export function relativeTime(ts: number | null | undefined) {
  if (!ts) return '—';
  const diff = Date.now() / 1000 - ts;
  if (diff < 60) return `${Math.floor(diff)}s ago`;
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
}

export function barColor(pct: number) {
  if (pct >= 85) return 'var(--hmc-red)';
  if (pct >= 70) return 'var(--hmc-amber)';
  return 'var(--hmc-cyan)';
}

export function agentById(
  id: string,
  agents: { id: string; color: string; name: string; code: string }[],
) {
  return agents.find((a) => a.id === id) ?? { id, color: '#8A8A9B', name: id, code: id.slice(0, 4).toUpperCase() };
}
