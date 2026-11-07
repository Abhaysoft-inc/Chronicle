'use client';

import { useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Pill } from '@/components/ui/pill';
import { useToast } from '@/components/ui/toast';
import { patchFinding } from '@/lib/api/endpoints';
import type { FindingSeverity, FindingsData, FindingStatus } from '@/lib/api/types';
import { humanize, type Tone } from '@/lib/format';

const SEVERITY_TONES: Record<FindingSeverity, Tone> = {
  critical: 'bad',
  high: 'warn',
  medium: 'info',
  low: 'neutral',
};

const CATEGORY_NAMES: Record<string, string> = {
  missing_record: 'Missing Record',
  documentation_gap: 'Documentation Gap',
  timeline_conflict: 'Timeline Conflict',
  possible_care_deviation: 'Possible Care Deviation',
};

export function FindingsPanel({
  findingsData,
  onRefresh,
  onSelectEvent,
}: {
  findingsData: FindingsData;
  onRefresh: () => void;
  onSelectEvent?: (eventId: string) => void;
}) {
  const notify = useToast();
  const [filterSeverity, setFilterSeverity] = useState<string>('all');
  const [filterStatus, setFilterStatus] = useState<string>('all');
  const [updatingId, setUpdatingId] = useState<string | null>(null);

  const { findings, summary } = findingsData;

  const filtered = useMemo(() => {
    return findings.filter((f) => {
      if (filterSeverity !== 'all' && f.severity !== filterSeverity) return false;
      if (filterStatus !== 'all' && f.status !== filterStatus) return false;
      return true;
    });
  }, [findings, filterSeverity, filterStatus]);

  async function updateStatus(id: string, status: FindingStatus) {
    setUpdatingId(id);
    try {
      await patchFinding(id, status);
      notify(`Finding marked as ${status}.`, 'ok');
      onRefresh();
    } catch (err) {
      notify((err as Error).message, 'bad');
    } finally {
      setUpdatingId(null);
    }
  }

  return (
    <div className="flex flex-col gap-4">
      {/* Top summary cards */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
        <Card className="flex flex-col p-3">
          <span className="text-xs text-muted">Total Issues</span>
          <span className="text-xl font-bold tracking-tight">{summary.total}</span>
        </Card>
        <Card className="flex flex-col border-bad/30 bg-bad-bg/20 p-3">
          <span className="text-xs font-medium text-bad">Critical Issues</span>
          <span className="text-xl font-bold text-bad">{summary.by_severity.critical}</span>
        </Card>
        <Card className="flex flex-col border-warn/30 bg-warn-bg/20 p-3">
          <span className="text-xs font-medium text-warn">High Severity</span>
          <span className="text-xl font-bold text-warn">{summary.by_severity.high}</span>
        </Card>
        <Card className="flex flex-col p-3">
          <span className="text-xs text-muted">Medium Severity</span>
          <span className="text-xl font-bold">{summary.by_severity.medium}</span>
        </Card>
        <Card className="col-span-2 flex flex-col p-3 sm:col-span-1">
          <span className="text-xs text-muted">Accepted for Brief</span>
          <span className="text-xl font-bold text-ok">{summary.accepted}</span>
        </Card>
      </div>

      {/* Filter toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line pb-3">
        <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label="Severity filter">
          <span className="text-xs font-medium text-muted">Severity:</span>
          {(['all', 'critical', 'high', 'medium', 'low'] as const).map((sev) => {
            const active = filterSeverity === sev;
            const count = sev === 'all' ? findings.length : summary.by_severity[sev];
            return (
              <button
                key={sev}
                type="button"
                onClick={() => setFilterSeverity(sev)}
                className={`rounded-lg px-2.5 py-1 text-xs font-medium transition-colors ${
                  active ? 'bg-accent text-accent-fg' : 'bg-surface-2 text-muted hover:text-fg'
                }`}
              >
                {humanize(sev)} ({count})
              </button>
            );
          })}
        </div>

        <div className="flex items-center gap-1.5 text-xs text-muted">
          <span>Status:</span>
          <select
            value={filterStatus}
            onChange={(e) => setFilterStatus(e.target.value)}
            className="rounded-md border border-line bg-surface px-2 py-1 text-xs text-fg"
          >
            <option value="all">All statuses</option>
            <option value="open">Open only ({summary.open})</option>
            <option value="accepted">Accepted ({summary.accepted})</option>
            <option value="dismissed">Dismissed ({summary.dismissed})</option>
          </select>
        </div>
      </div>

      {/* Findings List */}
      {filtered.length === 0 ? (
        <Card className="flex flex-col items-center justify-center gap-2 p-8 text-center">
          <div className="rounded-full bg-ok-bg p-3 text-ok">
            <svg className="size-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
          </div>
          <p className="text-sm font-medium">No matching care deviations or documentation gaps.</p>
          <p className="text-xs text-muted">
            {findings.length === 0
              ? 'The rule engine found no documented care problems or missing surgical records.'
              : 'Try clearing the active filters above.'}
          </p>
        </Card>
      ) : (
        <div className="flex flex-col gap-3">
          {filtered.map((f) => (
            <Card key={f.id} className="flex flex-col gap-3 p-4 transition-shadow hover:shadow-sm">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="flex flex-wrap items-center gap-2">
                  <Pill tone={SEVERITY_TONES[f.severity]}>{f.severity.toUpperCase()}</Pill>
                  <span className="rounded bg-surface-2 px-2 py-0.5 text-xs text-muted">
                    {CATEGORY_NAMES[f.category] ?? humanize(f.category)}
                  </span>
                  <span className="text-xs text-muted">ID: {f.id}</span>
                </div>
                <div>
                  <Pill tone={f.status === 'accepted' ? 'ok' : f.status === 'dismissed' ? 'neutral' : 'info'}>
                    {f.status === 'accepted' ? 'Accepted for Brief' : humanize(f.status)}
                  </Pill>
                </div>
              </div>

              <div>
                <h3 className="text-base font-semibold tracking-tight text-fg">{f.title}</h3>
                <p className="mt-1 text-sm text-fg/90">{f.explanation}</p>
              </div>

              {/* Evidence Event Citations */}
              {f.evidence_event_ids.length > 0 && (
                <div className="flex flex-wrap items-center gap-1.5 pt-1 text-xs">
                  <span className="font-medium text-muted">Supporting Evidence:</span>
                  {f.evidence_event_ids.map((evId) => (
                    <button
                      key={evId}
                      type="button"
                      onClick={() => onSelectEvent?.(evId)}
                      className="inline-flex items-center rounded border border-line bg-surface-2 px-2 py-0.5 font-mono text-accent hover:border-accent"
                      title="View cited event"
                    >
                      {evId.split(':').pop()}
                    </button>
                  ))}
                </div>
              )}

              {/* Question for Medical Expert */}
              <div className="rounded-lg border border-accent/20 bg-accent/5 p-3">
                <p className="text-xs font-semibold text-accent">Question for Independent Clinical Expert:</p>
                <p className="mt-0.5 text-sm italic text-fg/90">{f.question_for_expert}</p>
              </div>

              {/* Action Buttons */}
              <div className="flex flex-wrap items-center justify-end gap-2 border-t border-line/60 pt-3">
                {f.status === 'open' ? (
                  <>
                    <Button
                      variant="secondary"
                      size="sm"
                      loading={updatingId === f.id}
                      onClick={() => updateStatus(f.id, 'dismissed')}
                    >
                      Dismiss
                    </Button>
                    <Button
                      variant="primary"
                      size="sm"
                      loading={updatingId === f.id}
                      onClick={() => updateStatus(f.id, 'accepted')}
                    >
                      Accept for Expert Brief
                    </Button>
                  </>
                ) : (
                  <Button
                    variant="secondary"
                    size="sm"
                    loading={updatingId === f.id}
                    onClick={() => updateStatus(f.id, 'open')}
                  >
                    Reopen for Review
                  </Button>
                )}
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
