'use client';

import { useCallback, useEffect, useState } from 'react';
import type { McBoardTask } from '@/lib/hermes-mission-control-types';
import { relativeTime } from '../utils';

const STATUSES = ['pending', 'in_progress', 'done'] as const;
const STATUS_LABEL: Record<string, string> = {
  pending: 'Pending',
  in_progress: 'In Progress',
  done: 'Done',
};

function nextStatus(s: string): string | null {
  if (s === 'pending') return 'in_progress';
  if (s === 'in_progress') return 'done';
  return null;
}

function prevStatus(s: string): string | null {
  if (s === 'done') return 'in_progress';
  if (s === 'in_progress') return 'pending';
  return null;
}

export function TasksTab() {
  const [tasks, setTasks] = useState<McBoardTask[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAdd, setShowAdd] = useState(false);
  const [title, setTitle] = useState('');
  const [priority, setPriority] = useState('medium');
  const [notes, setNotes] = useState('');

  const load = useCallback(async () => {
    try {
      const res = await fetch('/api/hermes/mission-control/board', { cache: 'no-store' });
      const data = await res.json();
      if (data.ok && Array.isArray(data.tasks)) setTasks(data.tasks);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const updateTask = async (id: string, fields: Partial<McBoardTask>) => {
    const prev = tasks;
    setTasks((list) =>
      list.map((t) => (t.id === id ? { ...t, ...fields, updated_at: new Date().toISOString() } : t)),
    );
    try {
      const res = await fetch(`/api/hermes/mission-control/board/update?id=${encodeURIComponent(id)}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(fields),
      });
      const data = await res.json();
      if (!data.ok) throw new Error('update_failed');
      await load();
    } catch {
      setTasks(prev);
    }
  };

  const deleteTask = async (id: string) => {
    const prev = tasks;
    setTasks((list) => list.filter((t) => t.id !== id));
    try {
      const res = await fetch(`/api/hermes/mission-control/board/delete?id=${encodeURIComponent(id)}`, {
        method: 'POST',
      });
      const data = await res.json();
      if (!data.ok) throw new Error('delete_failed');
    } catch {
      setTasks(prev);
    }
  };

  const createTask = async () => {
    if (!title.trim()) return;
    const res = await fetch('/api/hermes/mission-control/board', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title, priority, notes }),
    });
    const data = await res.json();
    if (data.ok) {
      setTitle('');
      setNotes('');
      setShowAdd(false);
      await load();
    }
  };

  if (loading) {
    return <p className="hmc-mono" style={{ color: 'var(--hmc-muted)' }}>Loading board…</p>;
  }

  return (
    <div>
      <div className="hmc-board-grid">
        {STATUSES.map((status) => {
          const col = tasks.filter((t) => t.status === status);
          return (
            <div key={status}>
              <div className="hmc-col-header">
                <span className="hmc-mono">{STATUS_LABEL[status]}</span>
                <span className="hmc-mono count">{col.length}</span>
              </div>
              {status === 'pending' && (
                <button
                  type="button"
                  className="hmc-tab"
                  style={{ width: '100%', marginBottom: 8, border: '1px dashed var(--hmc-border)' }}
                  onClick={() => setShowAdd((v) => !v)}
                >
                  + Add task
                </button>
              )}
              {status === 'pending' && showAdd && (
                <div className="hmc-glass hmc-task-card" style={{ marginBottom: 8 }}>
                  <input
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    placeholder="Title"
                    style={{
                      width: '100%',
                      background: 'transparent',
                      border: 'none',
                      color: 'var(--hmc-text)',
                      marginBottom: 8,
                    }}
                  />
                  <select
                    value={priority}
                    onChange={(e) => setPriority(e.target.value)}
                    style={{ width: '100%', marginBottom: 8, background: '#1f1f2b', color: 'var(--hmc-text)' }}
                  >
                    <option value="low">low</option>
                    <option value="medium">medium</option>
                    <option value="high">high</option>
                  </select>
                  <textarea
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    placeholder="Notes"
                    rows={2}
                    style={{
                      width: '100%',
                      background: 'transparent',
                      border: '1px solid var(--hmc-border)',
                      color: 'var(--hmc-muted)',
                      borderRadius: 8,
                      padding: 6,
                      marginBottom: 8,
                    }}
                  />
                  <div style={{ display: 'flex', gap: 8 }}>
                    <button type="button" className="hmc-tab active" onClick={createTask}>
                      Save
                    </button>
                    <button type="button" className="hmc-tab" onClick={() => setShowAdd(false)}>
                      Cancel
                    </button>
                  </div>
                </div>
              )}
              {col.map((task) => (
                <div key={task.id} className="hmc-glass hmc-task-card">
                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
                    <strong style={{ fontSize: 14, fontWeight: 500 }}>{task.title}</strong>
                    <span className={`hmc-priority ${task.priority}`}>{task.priority}</span>
                  </div>
                  {task.notes && (
                    <p style={{ fontSize: 12, color: 'var(--hmc-muted)', margin: '6px 0' }}>{task.notes}</p>
                  )}
                  <div
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      marginTop: 8,
                      fontSize: 11,
                    }}
                  >
                    <span className="hmc-mono" style={{ color: 'var(--hmc-muted)' }}>
                      {relativeTime(Date.parse(task.updated_at || task.created_at) / 1000)}
                    </span>
                    <span style={{ display: 'flex', gap: 4 }}>
                      <button
                        type="button"
                        className="hmc-filter-pill"
                        title="Move back"
                        onClick={() => {
                          const p = prevStatus(task.status);
                          if (p) updateTask(task.id, { status: p as McBoardTask['status'] });
                        }}
                      >
                        ◀
                      </button>
                      <button
                        type="button"
                        className="hmc-filter-pill"
                        title="Move forward"
                        onClick={() => {
                          const n = nextStatus(task.status);
                          if (n) updateTask(task.id, { status: n as McBoardTask['status'] });
                        }}
                      >
                        ▶
                      </button>
                      <button
                        type="button"
                        className="hmc-filter-pill"
                        title="Delete"
                        onClick={() => deleteTask(task.id)}
                      >
                        ✕
                      </button>
                    </span>
                  </div>
                </div>
              ))}
            </div>
          );
        })}
      </div>
    </div>
  );
}
