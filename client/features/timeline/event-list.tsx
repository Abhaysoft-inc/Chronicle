import type { ReactNode } from 'react';
import type { TimelineEvent } from '@/lib/api/types';
import { humanize, nearlySame } from '@/lib/format';

/**
 * One row per event; the selected row opens in place with its evidence and actions.
 * Only exceptions draw the eye (not verified, rejected, edited). The normal state stays quiet.
 */
export function EventList({ events, selectedId, onSelect, renderExpanded }: {
  events: TimelineEvent[];
  selectedId: string | undefined;
  onSelect: (id: string) => void;
  renderExpanded: (e: TimelineEvent) => ReactNode;
}) {
  return (
    <ul role="listbox" aria-label="Events" className="flex flex-col gap-1.5 p-2">
      {events.map((e) => {
        const selected = e.id === selectedId;
        const date = e.corrected?.raw_date !== undefined ? e.corrected.raw_date : e.raw_date;
        const summary = e.corrected?.summary_en ?? e.summary_en;
        // Summaries can be generic ("vital signs were recorded") and repeat across events, so the
        // first line of the actual evidence is shown too. It is what tells such rows apart.
        const quote = e.sources[0]?.quote_original;
        const showQuote = !selected && quote && !nearlySame(quote, summary);
        return (
          <li key={e.id} className={`overflow-hidden rounded-xl border ${selected ? 'border-accent bg-surface shadow-sm' : 'border-transparent hover:bg-surface-2/70'} ${e.review_status === 'rejected' ? 'opacity-55' : ''}`}>
            <button
              id={`ev-${e.id}`}
              type="button"
              role="option"
              aria-selected={selected}
              onClick={() => onSelect(e.id)}
              className="block w-full px-3.5 py-3 text-left"
            >
              <span className="flex items-center gap-2 text-xs text-muted">
                <span className="rounded bg-surface-2 px-1.5 py-0.5 font-mono font-semibold text-fg">{e.label}</span>
                <span>{humanize(e.type)}</span>
                {date && <span className="indic truncate">· {date}</span>}
                <span className="ml-auto flex shrink-0 items-center gap-2">
                  {!e.verified && <span className="font-medium text-bad">⚠ Not verified</span>}
                  {e.review_status === 'confirmed' && <span className="font-medium text-ok">✓ Confirmed</span>}
                  {e.review_status === 'rejected' && <span className="font-medium text-bad">Rejected</span>}
                  {e.review_status === 'corrected' && <span className="font-medium text-warn">Edited</span>}
                </span>
              </span>
              <span className={`mt-1.5 block text-[15px] leading-snug font-medium ${selected ? '' : 'line-clamp-2'} ${e.review_status === 'rejected' ? 'line-through' : ''}`}>{summary}</span>
              {showQuote && <span className="indic mt-1 block truncate text-[13px] text-muted">“{quote}”</span>}
            </button>
            {selected && <div className="border-t border-line px-3.5 pt-3 pb-3.5">{renderExpanded(e)}</div>}
          </li>
        );
      })}
    </ul>
  );
}
