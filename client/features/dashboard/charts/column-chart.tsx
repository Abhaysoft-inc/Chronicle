'use client';

import { DataTable } from './chart-card';
import { useChartTooltip } from './use-chart-tooltip';

/** Smallest "round" axis maximum at or above `max`: 4, 8, 10, 20, 40, 60, 100... Always even, so the middle tick is whole. */
export function niceMax(max: number): number {
  if (max <= 4) return 4;
  if (max <= 8) return 8;
  const p = 10 ** Math.floor(Math.log10(max));
  return [1, 2, 4, 6, 10].map((m) => m * p).find((v) => v >= max) ?? max;
}

const dayLong = (iso: string) => new Date(`${iso}T00:00:00Z`).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric', timeZone: 'UTC' });
const dayShort = (iso: string) => new Date(`${iso}T00:00:00Z`).toLocaleDateString(undefined, { month: 'short', day: 'numeric', timeZone: 'UTC' });

/**
 * One series over time: thin columns on a shared baseline, 4px rounded tops, a hairline grid, and a
 * single value label on the peak (every other value is in the tooltip and the table view).
 */
export function ColumnChart({ data, unit }: { data: { day: string; count: number }[]; unit: string }) {
  const { containerRef, bind, tooltip } = useChartTooltip();
  const max = Math.max(0, ...data.map((d) => d.count));
  const top = niceMax(max);
  const peak = max > 0 ? data.findIndex((d) => d.count === max) : -1;
  const ticks = [top, top / 2, 0];

  if (max === 0) {
    return <p className="grid h-48 place-items-center text-sm text-muted">Nothing extracted in the last {data.length} days.</p>;
  }

  return (
    <div ref={containerRef} className="relative">
      <div className="flex gap-2">
        <div className="relative h-44 w-7 shrink-0 text-right text-[11px] text-muted tabular-nums" aria-hidden="true">
          {ticks.map((t) => (
            <span key={t} className="absolute right-0 -translate-y-1/2" style={{ top: `${100 - (t / top) * 100}%` }}>{t}</span>
          ))}
        </div>
        <div className="relative h-44 flex-1">
          {ticks.map((t) => (
            <div key={t} aria-hidden="true" className={`absolute inset-x-0 h-px ${t === 0 ? 'bg-muted/40' : 'bg-line'}`} style={{ top: `${100 - (t / top) * 100}%` }} />
          ))}
          <div className="absolute inset-0 flex items-stretch gap-1">
            {data.map((d, i) => (
              <button
                key={d.day}
                type="button"
                {...bind(`${d.count} ${d.count === 1 ? unit : `${unit}s`}`, dayLong(d.day))}
                aria-label={`${dayLong(d.day)}: ${d.count} ${d.count === 1 ? unit : `${unit}s`}`}
                className="group relative flex flex-1 items-end justify-center rounded-sm hover:bg-surface-2/60 focus-visible:bg-surface-2/60"
              >
                {d.count > 0 && (
                  <span
                    className="block w-full max-w-6 rounded-t-[4px] bg-viz-1 transition-opacity group-hover:opacity-80"
                    style={{ height: `${(d.count / top) * 100}%` }}
                  />
                )}
                {i === peak && (
                  <span className="absolute -translate-y-full pb-1 text-xs font-semibold tabular-nums" style={{ bottom: `${(d.count / top) * 100}%` }} aria-hidden="true">{d.count}</span>
                )}
              </button>
            ))}
          </div>
        </div>
      </div>
      <div className="mt-1.5 flex gap-2" aria-hidden="true">
        <div className="w-7 shrink-0" />
        <div className="flex flex-1 gap-1">
          {data.map((d, i) => (
            <span key={d.day} className="flex-1 text-center text-[11px] whitespace-nowrap text-muted">
              {(data.length - 1 - i) % 3 === 0 ? dayShort(d.day) : ''}
            </span>
          ))}
        </div>
      </div>
      {tooltip}
    </div>
  );
}

export function ColumnTable({ data, unit }: { data: { day: string; count: number }[]; unit: string }) {
  return <DataTable columns={['Day', `${unit[0]!.toUpperCase()}${unit.slice(1)}s`]} rows={[...data].reverse().map((d) => [dayLong(d.day), d.count])} />;
}
