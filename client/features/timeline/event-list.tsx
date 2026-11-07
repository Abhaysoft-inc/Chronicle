import type { TimelineEvent } from '@/lib/api/types';
import { humanize } from '@/lib/format';

/**
 * One short row per event, so many are visible at once. Only exceptions draw the eye
 * (not verified, rejected, edited). The selected row is highlighted; its details are in the
 * panel beside or below, so selecting never pushes the other events out of view.
 */
export function EventList({ events, selectedId, onSelect }: {
  events: TimelineEvent[];
  selectedId: string | undefined;
  onSelect: (id: string) => void;
}) {
  return (
    <ul role="listbox" aria-label="Events" className="flex flex-col p-1.5">
      {events.map((e) => {
        const selected = e.id === selectedId;
        const date = e.corrected?.raw_date !== undefined ? e.corrected.raw_date : e.raw_date;
        const summary = e.corrected?.summary_en ?? e.summary_en;
        return (
          <li key={e.id}>
            <button
              id={`ev-${e.id}`}
              type="button"
              role="option"
              aria-selected={selected}
              title={summary}
              onClick={() => onSelect(e.id)}
              className={`block w-full rounded-lg border-l-[3px] px-3 py-2 text-left ${selected ? 'border-accent bg-accent/10' : 'border-transparent hover:bg-surface-2'} ${e.review_status === 'rejected' ? 'opacity-55' : ''}`}
            >
              <span className="flex items-center gap-2 text-[11px] text-muted">
                <span className="font-mono font-semibold text-fg">{e.label}</span>
                <span className="truncate">{humanize(e.type)}</span>
                {date && <span className="indic truncate">· {date}</span>}
                <span className="ml-auto flex shrink-0 items-center gap-2">
                  {!e.verified && <span className="font-semibold text-bad">⚠ Not verified</span>}
                  {e.review_status === 'confirmed' && <span className="font-semibold text-ok">✓</span>}
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
  );
}
