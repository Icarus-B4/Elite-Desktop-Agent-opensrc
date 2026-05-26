'use client';

import { useEffect, useMemo, useState } from 'react';
import type { McSnapshot } from '@/lib/hermes-mission-control-types';
import { agentById } from '../utils';

function simpleMarkdownHtml(md: string): string {
  const escaped = md
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
  return escaped
    .replace(/^### (.+)$/gm, '<h3>$1</h3>')
    .replace(/^## (.+)$/gm, '<h2>$1</h2>')
    .replace(/^# (.+)$/gm, '<h1>$1</h1>')
    .replace(/```([\s\S]*?)```/g, '<pre><code>$1</code></pre>')
    .replace(/\n/g, '<br/>');
}

export function ContentTab({ data }: { data: McSnapshot }) {
  const agents = data.agents;
  const docs = data.content_index;
  const [selected, setSelected] = useState<string | null>(null);
  const [raw, setRaw] = useState('');
  const [mode, setMode] = useState<'view' | 'edit'>('view');
  const [loading, setLoading] = useState(false);

  const grouped = useMemo(() => {
    const map = new Map<string, typeof docs>();
    for (const d of docs) {
      const list = map.get(d.agent) ?? [];
      list.push(d);
      map.set(d.agent, list);
    }
    return map;
  }, [docs]);

  useEffect(() => {
    if (!selected && docs.length > 0) setSelected(docs[0].path);
  }, [docs, selected]);

  useEffect(() => {
    if (!selected) return;
    let cancelled = false;
    setLoading(true);
    fetch(`/api/hermes/mission-control/content/get?path=${encodeURIComponent(selected)}`)
      .then((r) => r.json())
      .then((payload) => {
        if (!cancelled && payload.ok) {
          setRaw(payload.content);
          setMode('view');
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [selected]);

  const meta = docs.find((d) => d.path === selected);
  const agent = meta ? agentById(meta.agent, agents) : null;

  const save = async () => {
    if (!selected) return;
    const res = await fetch('/api/hermes/mission-control/content/save', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ path: selected, content: raw }),
    });
    const payload = await res.json();
    if (payload.ok) setMode('view');
  };

  return (
    <div className="hmc-content-layout">
      <aside className="hmc-glass hmc-content-sidebar">
        {docs.length === 0 ? (
          <p className="hmc-mono" style={{ color: 'var(--hmc-muted)', padding: 8 }}>
            No documents in ~/.hermes/content/
          </p>
        ) : (
          Array.from(grouped.entries()).map(([agentId, items]) => {
            const a = agentById(agentId, agents);
            return (
              <div key={agentId} style={{ marginBottom: 16 }}>
                <div className="hmc-mono" style={{ color: a.color, marginBottom: 6 }}>
                  {agentId}
                </div>
                {items.map((doc) => (
                  <button
                    key={doc.path}
                    type="button"
                    className={`hmc-doc-row ${selected === doc.path ? 'selected' : ''}`}
                    style={{ borderLeftColor: selected === doc.path ? a.color : 'transparent' }}
                    onClick={() => setSelected(doc.path)}
                  >
                    <div style={{ fontSize: 13, fontWeight: 500 }}>{doc.title}</div>
                    <div className="hmc-mono" style={{ color: 'var(--hmc-muted)', fontSize: 10 }}>
                      {doc.filename}
                    </div>
                  </button>
                ))}
              </div>
            );
          })
        )}
      </aside>
      <div className="hmc-glass" style={{ padding: '1.25rem' }}>
        {!selected ? (
          <p className="hmc-mono" style={{ textAlign: 'center', color: 'var(--hmc-muted)', marginTop: '4rem' }}>
            Select a document to read
          </p>
        ) : (
          <>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 12 }}>
              <div>
                <h2 style={{ margin: 0, fontSize: 22, fontWeight: 600 }}>{meta?.title}</h2>
                {agent && (
                  <span className="hmc-mono" style={{ color: agent.color }}>
                    {agent.name}
                  </span>
                )}
                {meta && (
                  <div className="hmc-mono" style={{ color: 'var(--hmc-muted)', marginTop: 4 }}>
                    {new Date(meta.modified_at * 1000).toLocaleString('de-DE')}
                  </div>
                )}
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                <button
                  type="button"
                  className={`hmc-tab ${mode === 'view' ? 'active' : ''}`}
                  onClick={() => setMode('view')}
                >
                  View
                </button>
                <button
                  type="button"
                  className={`hmc-tab ${mode === 'edit' ? 'active' : ''}`}
                  onClick={() => setMode('edit')}
                >
                  Edit
                </button>
              </div>
            </div>
            {loading ? (
              <p className="hmc-mono" style={{ marginTop: 24, color: 'var(--hmc-muted)' }}>
                Loading…
              </p>
            ) : mode === 'edit' ? (
              <>
                <textarea
                  value={raw}
                  onChange={(e) => setRaw(e.target.value)}
                  style={{
                    width: '100%',
                    minHeight: 360,
                    marginTop: 16,
                    background: 'rgba(0,0,0,0.35)',
                    border: '1px solid var(--hmc-border)',
                    borderRadius: 12,
                    color: 'var(--hmc-text)',
                    fontFamily: 'var(--font-jetbrains), monospace',
                    fontSize: 13,
                    padding: 12,
                  }}
                />
                <div style={{ marginTop: 12, display: 'flex', gap: 8 }}>
                  <button type="button" className="hmc-tab active" onClick={save}>
                    Save
                  </button>
                  <button type="button" className="hmc-tab" onClick={() => setMode('view')}>
                    Cancel
                  </button>
                </div>
              </>
            ) : (
              <div
                className="hmc-markdown"
                style={{ marginTop: 16, lineHeight: 1.6 }}
                dangerouslySetInnerHTML={{ __html: simpleMarkdownHtml(raw) }}
              />
            )}
          </>
        )}
      </div>
    </div>
  );
}
