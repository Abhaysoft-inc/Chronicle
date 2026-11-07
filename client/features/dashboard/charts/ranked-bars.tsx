'use client';

import { humanize } from '@/lib/format';
import { DataTable } from './chart-card';
import { useChartTooltip } from './use-chart-tooltip';

const MAX_ROWS = 7;

/** The top rows by count; the tail folds into one "Other" row rather than inventing more colours. */
function rowsOf(data: { type: string; count: number }[]) {
  if (data.length <= MAX_ROWS + 1) return data.map((d) => ({ label: humanize(d.type), count: d.count, other: false }));
  const head = data.slice(0, MAX_ROWS).map((d) => ({ label: humanize(d.type), count: d.count, other: false }));
  const tail = data.slice(MAX_ROWS);
  return [...head, { label: `Other (${tail.length} types)`, count: tail.reduce((a, d) => a + d.count, 0), other: true }];
}

/**
 * Compare parts of a whole: one bar per category, largest first, one colour (the bars share a
 * baseline, so length is the encoding; colour adds nothing). The value sits at the bar's tip.
 */
export function RankedBars({ data }: { data: { type: string; count: number }[] }) {
  const { containerRef, bind, tooltip } = useChartTooltip();
  const rows = rowsOf(data);
  const total = rows.reduce((a, r) => a + r.count, 0);
  const max = Math.max(1, ...rows.map((r) => r.count));

  if (total === 0) return <p className="grid h-40 place-items-center text-sm text-muted">No events yet.</p>;

  return (
    <div ref={containerRef} className="relative">
      <ul className="flex flex-col gap-1">
        {rows.map((r) => {
          const share = Math.round((r.count / total) * 100);
          return (
            <li key={r.label}>
              <button
                type="button"
                {...bind(`${r.count} event${r.count === 1 ? '' : 's'}`, `${r.label} · ${share}% of all events`)}
                aria-label={`${r.label}: ${r.count} events, ${share}% of all`}
                className="grid w-full grid-cols-[8.5rem_1fr] items-center gap-3 rounded-md px-1 py-1.5 text-left hover:bg-surface-2/60 focus-visible:bg-surface-2/60"
              >
                <span className="truncate text-sm text-muted">{r.label}</span>
                <span className="flex items-center gap-2">
                  {/* 88% leaves room for the value at the tip of the longest bar */}
                  <span className={`block h-4 rounded-r-[4px] ${r.other ? 'bg-viz-neutral' : 'bg-viz-1'}`} style={{ width: `${(r.count / max) * 88}%`, minWidth: 2 }} />
                  <span className="text-sm font-semibold tabular-nums">{r.count}</span>
                </span>
              </button>
            </li>
          );
        })}
      </ul>
      {tooltip}
    </div>
  );
}

export function RankedTable({ data }: { data: { type: string; count: number }[] }) {
  const total = data.reduce((a, d) => a + d.count, 0);
  return <DataTable columns={['Type', 'Events', 'Share']} rows={data.map((d) => [humanize(d.type), d.count, `${Math.round((d.count / Math.max(1, total)) * 100)}%`])} />;
}
