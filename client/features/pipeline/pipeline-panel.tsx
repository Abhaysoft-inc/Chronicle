import { Button } from '@/components/ui/button';
import { Spinner } from '@/components/ui/spinner';
import type { PipelineStage } from '@/lib/api/types';
import { STAGE_LABELS } from '@/lib/format';
import type { StreamMode } from './use-pipeline-stream';

const BORDER: Record<string, string> = {
  done: 'border-ok/40',
  running: 'border-accent',
  failed: 'border-bad/50',
  pending: 'border-line',
};

function StageIcon({ status, n }: { status: string; n: number }) {
  if (status === 'running') return <Spinner className="size-4 text-accent" />;
  const cls = status === 'done' ? 'bg-ok text-surface' : status === 'failed' ? 'bg-bad text-surface' : 'bg-surface-2 text-muted';
  return <span className={`grid size-5 place-items-center rounded-full text-xs font-semibold ${cls}`}>{status === 'done' ? '✓' : status === 'failed' ? '!' : n}</span>;
}

function ConnectionDot({ mode }: { mode: StreamMode }) {
  const label = mode === 'live' ? 'Live' : mode === 'polling' ? 'Polling (stream unavailable)' : 'Connecting…';
  const dot = mode === 'live' ? 'bg-ok' : mode === 'polling' ? 'bg-warn' : 'bg-muted';
  return (
    <span className="flex items-center gap-1.5 text-xs text-muted" title={mode === 'live' ? 'Receiving updates over a server-sent event stream' : undefined}>
      <span className={`size-2 rounded-full ${dot} ${mode === 'live' ? 'animate-pulse' : ''}`} />
      {label}
    </span>
  );
}

export function PipelinePanel({ stages, running, hasDocuments, mode, starting, onProcess }: {
  stages: PipelineStage[];
  running: boolean;
  hasDocuments: boolean;
  mode: StreamMode;
  starting: boolean;
  onProcess: () => void;
}) {
  const everRun = stages.some((s) => s.status !== 'pending');
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <Button onClick={onProcess} loading={starting || running} disabled={!hasDocuments}>
            {running ? 'Processing…' : everRun ? 'Process again' : 'Process case'}
          </Button>
          <ConnectionDot mode={mode} />
        </div>
        <p className="text-xs text-muted">
          {hasDocuments ? 'Safe to run again: pages already read are cached and cost nothing.' : 'Upload at least one document first.'}
        </p>
      </div>

      <ol className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {stages.map((s, i) => {
          const label = STAGE_LABELS[s.stage] ?? { title: s.stage, hint: '' };
          return (
            <li key={s.stage} className={`rounded-lg border bg-surface p-3 ${BORDER[s.status] ?? BORDER.pending}`}>
              <div className="flex items-center gap-2">
                <StageIcon status={s.status} n={i + 1} />
                <span className="text-sm font-medium">{label.title}</span>
              </div>
              <p className="mt-1 text-xs text-muted">{label.hint}</p>
              {s.progress && <p className="mt-2 text-xs">{s.progress}</p>}
              {s.error && <p role="alert" className="mt-2 text-xs break-words text-bad">{s.error}</p>}
            </li>
          );
        })}
      </ol>
    </div>
  );
}
