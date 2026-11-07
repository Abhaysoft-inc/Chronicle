import type { TimelineEvent } from '@/lib/api/types';
import { formatDayHeading, humanize } from '@/lib/format';

/** "22:00", "night", or nothing for a day-only date. "≈" marks a time or date that was inferred. */
function timeLabel(e: TimelineEvent): string | null {
  if (!e.occurred_at_iso || e.occurred_at_iso.length <= 10) return null;
  if (e.precision === 'part_of_day') {
    const h = Number(e.occurred_at_iso.slice(11, 13));
    return h < 12 ? 'morning' : h < 16 ? 'afternoon' : h < 20 ? 'evening' : 'night';
  }
  return e.occurred_at_iso.slice(11, 16);
}

/**
 * The chronology: events in date order, grouped under a heading per day, undated ones last.
 * One short row per event, so many are visible at once. Only exceptions draw the eye.
 */
export function EventList({ events, selectedId, onSelect }: {
  events: TimelineEvent[];
  selectedId: string | undefined;
  onSelect: (id: string) => void;
}) {
  const groups: { key: string; heading: string; events: TimelineEvent[] }[] = [];
  for (const e of events) {
    const key = e.occurred_at_iso?.slice(0, 10) ?? 'undated';
    let g = groups[groups.length - 1];
    if (!g || g.key !== key) {
      g = { key, heading: key === 'undated' ? 'No date in the records' : formatDayHeading(key), events: [] };
      groups.push(g);
    }
    g.events.push(e);
  }

  return (
    <div role="listbox" aria-label="Events" className="pb-1.5">
      {groups.map((g) => (
        <section key={g.key} aria-label={g.heading}>
          <h3 className="sticky top-0 z-10 border-b border-line bg-surface/95 px-3 py-1.5 text-[11px] font-semibold tracking-wide text-muted uppercase backdrop-blur">
            {g.heading} <span className="font-normal normal-case">· {g.events.length}</span>
          </h3>
          <ul className="flex flex-col px-1.5 pt-1">
            {g.events.map((e) => {
              const selected = e.id === selectedId;
              const summary = e.corrected?.summary_en ?? e.summary_en;
              const time = timeLabel(e);
              const inferred = e.basis === 'inferred';
              return (
                <li key={e.id}>
                  <button
                    id={`ev-${e.id}`}
                    type="button"
                    role="option"
                    aria-selected={selected}
                    title={summary}
                    onClick={() => onSelect(e.id)}
                    className={`block w-full rounded-lg border-l-[3px] px-3 py-2 text-left ${selected ? 'border-accent bg-accent/10' : 'border-transparent hover:bg-surface-2'} ${e.review_status === 'rejected' || e.duplicate_of ? 'opacity-55' : ''}`}
                  >
                    <span className="flex items-center gap-2 text-[11px] text-muted">
                      <span className="font-mono font-semibold text-fg">{e.label}</span>
                      {time && (
                        <span className="font-medium tabular-nums text-fg" title={e.date_note ?? undefined}>{inferred ? '≈ ' : ''}{time}</span>
                      )}
                      {!time && inferred && e.occurred_at_iso && <span title={e.date_note ?? undefined}>≈ date</span>}
                      <span className="truncate">{humanize(e.type)}</span>
                      <span className="ml-auto flex shrink-0 items-center gap-2">
                        {e.origin === 'manual' && <span className="font-semibold text-accent" title="Added by a reviewer">✚ Added</span>}
                        {e.duplicate_of && <span title={`Repeats ${e.duplicate_of}`}>= {e.duplicate_of}</span>}
                        {!e.verified && <span className="font-semibold text-bad">⚠ Not verified</span>}
                        {e.review_status === 'confirmed' && e.origin !== 'manual' && <span className="font-semibold text-ok">✓</span>}
                        {e.review_status === 'rejected' && <span className="font-semibold text-bad">✕</span>}
                        {e.review_status === 'corrected' && <span className="font-semibold text-warn">✎</span>}
                      </span>
                    </span>
                    <span className={`mt-0.5 block truncate text-sm ${selected ? 'font-semibold' : 'font-medium'} ${e.review_status === 'rejected' ? 'line-through' : ''}`}>{summary}</span>
                  </button>
                </li>
              );
            })}
          </ul>
        </section>
      ))}
    </div>
  );
}
