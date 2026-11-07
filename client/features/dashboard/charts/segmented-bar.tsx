'use client';

import { useEffect, useRef, useState } from 'react';
import { DataTable } from './chart-card';
import { useChartTooltip } from './use-chart-tooltip';

export interface Segment {
  key: string;
  name: string;
  /** A symbol that says the same thing as the colour, so the meaning never rests on colour alone. */
  icon: string;
  count: number;
  fill: string;
  /** Text colour inside the fill: white, except near-black on the light fills. */
  ink: string;
}

/** The segment's own printed width decides whether its number fits: a label is never clipped. */
function Block({ seg, share, bind }: { seg: Segment; share: number; bind: ReturnType<typeof useChartTooltip>['bind'] }) {
  const ref = useRef<HTMLButtonElement>(null);
  const [fits, setFits] = useState(false);
  const text = String(seg.count);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const measure = () => setFits(el.clientWidth >= text.length * 8 + 20);
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [text]);

  return (
    <button
      ref={ref}
      type="button"
      {...bind(`${seg.count} · ${Math.round(share * 100)}%`, seg.name)}
      aria-label={`${seg.name}: ${seg.count} events, ${Math.round(share * 100)}%`}
      className="flex min-w-0 items-center rounded-[4px] px-2 text-xs font-semibold tabular-nums transition-opacity hover:opacity-85"
      style={{ flex: `${seg.count} 1 0`, background: seg.fill, color: seg.ink }}
    >
      {fits && text}
    </button>
  );
}

/**
 * One whole split into a few parts, read at a glance. Each part is its own block with a 2px surface
 * gap, its count printed inside when it fits. The legend names the parts and repeats no numbers.
 */
export function SegmentedBar({ segments }: { segments: Segment[] }) {
  const { containerRef, bind, tooltip } = useChartTooltip();
  const total = segments.reduce((a, s) => a + s.count, 0);
  if (total === 0) return <p className="grid h-16 place-items-center text-sm text-muted">No events to review yet.</p>;

  return (
    <div ref={containerRef} className="relative">
      <div role="group" aria-label="Review status of all events" className="flex h-7 gap-0.5">
        {segments.filter((s) => s.count > 0).map((s) => <Block key={s.key} seg={s} share={s.count / total} bind={bind} />)}
      </div>
      <ul className="mt-3 flex flex-wrap gap-x-4 gap-y-1.5 text-xs text-muted">
        {segments.map((s) => (
          <li key={s.key} className="flex items-center gap-1.5">
            <i className="inline-block size-2.5 rounded-sm" style={{ background: s.fill }} aria-hidden="true" />
            <span aria-hidden="true">{s.icon}</span>
            {s.name}
          </li>
        ))}
      </ul>
      {tooltip}
    </div>
  );
}

export function SegmentTable({ segments }: { segments: Segment[] }) {
  const total = segments.reduce((a, s) => a + s.count, 0);
  return <DataTable columns={['Status', 'Events', 'Share']} rows={segments.map((s) => [`${s.icon} ${s.name}`, s.count, `${Math.round((s.count / Math.max(1, total)) * 100)}%`])} />;
}
