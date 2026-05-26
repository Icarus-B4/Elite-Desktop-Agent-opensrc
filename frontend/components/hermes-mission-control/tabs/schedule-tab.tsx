'use client';

import type { McSnapshot } from '@/lib/hermes-mission-control-types';

function CronSection({
  title,
  jobs,
}: {
  title: string;
  jobs: McSnapshot['crons'];
}) {
  return (
    <section style={{ marginBottom: '2rem' }}>
      <div className="hmc-mono hmc-eyebrow">{title}</div>
      {jobs.length === 0 ? (
        <p className="hmc-mono" style={{ textAlign: 'center', color: 'var(--hmc-muted)', padding: '2rem' }}>
          No scheduled jobs in this group.
        </p>
      ) : (
        jobs.map((job, i) => (
          <div key={`${job.source}-${i}`} className="hmc-glass hmc-cron-card">
            <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 8 }}>
              <span
                className="hmc-mono"
                style={{
                  padding: '2px 8px',
                  borderRadius: 4,
                  background:
                    job.owner === 'hermes' ? 'rgba(139,92,246,0.2)' : 'rgba(255,255,255,0.06)',
                  color: job.owner === 'hermes' ? 'var(--hmc-violet-glow)' : 'var(--hmc-muted)',
                }}
              >
                {job.owner}
              </span>
            </div>
            <code
              title={job.command}
              style={{
                display: 'block',
                fontFamily: 'var(--font-jetbrains), monospace',
                fontSize: 13,
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
              }}
            >
              {job.command}
            </code>
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: '1fr 1fr',
                gap: 12,
                marginTop: 12,
              }}
              className="hmc-mono"
            >
              <div>
                <div style={{ color: 'var(--hmc-muted)' }}>Schedule</div>
                <div>{job.schedule}</div>
              </div>
              <div>
                <div style={{ color: 'var(--hmc-muted)' }}>Source</div>
                <div style={{ fontSize: 9 }}>{job.source}</div>
              </div>
            </div>
            <p style={{ color: 'var(--hmc-muted)', fontSize: 12, marginTop: 10 }}>{job.description}</p>
          </div>
        ))
      )}
    </section>
  );
}

export function ScheduleTab({ data }: { data: McSnapshot }) {
  const hermes = data.crons.filter((c) => c.owner === 'hermes');
  const system = data.crons.filter((c) => c.owner !== 'hermes');

  return (
    <div>
      <CronSection title="Hermes jobs" jobs={hermes} />
      <CronSection title="System jobs" jobs={system} />
    </div>
  );
}
