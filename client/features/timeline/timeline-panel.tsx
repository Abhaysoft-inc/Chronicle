'use client';

import { useEffect, useRef, useState } from 'react';
import { EmptyState, ErrorNote } from '@/components/ui/card';
import { useToast } from '@/components/ui/toast';
import { PageStage } from '@/features/viewer/page-stage';
import { usePageData } from '@/features/viewer/use-page-data';
import type { DocumentSummary, Timeline, TimelineEvent } from '@/lib/api/types';
import { weakestConfidence } from '@/lib/confidence';
import { revealWithin } from '@/lib/dom';
import { EventDetail } from './event-detail';
import { EventList } from './event-list';
import { useEventActions } from './use-event-actions';

type Filter = 'all' | 'todo' | 'attention' | 'verified';

/** True when the keypress is going into a form field, so shortcuts must not fire. */
const isTyping = (t: EventTarget | null) =>
  t instanceof HTMLElement && (t.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(t.tagName));

const KBD = 'rounded bg-surface-2 px-1';

/**
 * The review workbench. Three zones that rearrange with the screen:
 *   phone / small   stacked: page, events, details
 *   laptop (lg)     page on the left; events above details on the right
 *   wide (1700px+, the 3xl breakpoint)  three columns: events | page | details
 * The events list never grows when you select one, so you always see several events at once.
 * Keys: ↑/↓ or J/K move, C confirm, X reject, E correct. Click a box on the page to jump to its event.
 */
export function TimelinePanel({ timeline, loading, error, documents, onChanged, onRetry }: {
  timeline: Timeline | undefined;
  loading: boolean;
  error: Error | undefined;
  documents: DocumentSummary[];
  onChanged: () => void;
  onRetry: () => void;
}) {
  const notify = useToast();
  const [filter, setFilter] = useState<Filter>('all');
  const [pick, setPick] = useState<{ id?: string; source: number }>({ source: 0 });
  const [editing, setEditing] = useState(false);
  const actions = useEventActions(onChanged);

  // On wide screens the workbench fills the rest of the window, so nothing falls below the fold.
  // Measured (not a fixed offset) so it stays right whatever sits above it.
  const panelRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const fit = () => {
      const el = panelRef.current;
      if (!el) return;
      if (window.innerWidth < 1024) {
        el.style.height = '';
        return;
      }
      const top = el.getBoundingClientRect().top + window.scrollY;
      el.style.height = `${Math.max(480, window.innerHeight - top - 20)}px`; // 16px = the page's bottom padding
    };
    fit();
    window.addEventListener('resize', fit);
    return () => window.removeEventListener('resize', fit);
  });

  const events = timeline?.events ?? [];
  const shown = events.filter((e) =>
    filter === 'all' ? true
    : filter === 'todo' ? e.review_status === 'unreviewed'
    : filter === 'verified' ? e.verified
    : !e.verified);
  const selected = shown.find((e) => e.id === pick.id) ?? shown[0];
  const selectedIndex = selected ? shown.indexOf(selected) : -1;
  const sourceIndex = selected && pick.id === selected.id ? Math.min(pick.source, selected.sources.length - 1) : 0;
  const source = selected?.sources[sourceIndex];
  const doc = source ? documents.find((d) => d.id === source.document_id) : undefined;
  const pageData = usePageData(doc, source?.page_no ?? 1);

  const select = (id: string | undefined, sourceOfEvent = 0) => {
    setPick({ id, source: sourceOfEvent });
    setEditing(false);
  };

  // Keep the selected row in view as you move with the keyboard.
  const selectedKey = selected?.id;
  useEffect(() => {
    if (selectedKey) revealWithin(document.getElementById(`ev-${selectedKey}`));
  }, [selectedKey]);

  /** Click on a box on the page: jump to the event that cites that text. */
  function onBlockClick(blockId: string) {
    if (!doc || !source) return;
    const cites = (e: TimelineEvent) => e.sources.findIndex((s) => s.document_id === doc.id && s.page_no === source.page_no && s.block_ids.includes(blockId));
    const hits = shown.filter((e) => cites(e) >= 0);
    if (!hits.length) return notify('No event cites this text.', 'info');
    // Several events can cite the same text; repeated clicks step through them.
    const at = hits.findIndex((e) => e.id === selected?.id);
    const next = hits[(at + 1) % hits.length]!;
    select(next.id, cites(next));
  }

  useEffect(() => {
    function onKey(ev: KeyboardEvent) {
      if (ev.metaKey || ev.ctrlKey || ev.altKey) return;
      if (ev.key === 'Escape' && editing) return setEditing(false);
      if (isTyping(ev.target) || !selected) return;
      const move = (to: number) => { ev.preventDefault(); select(shown[Math.max(0, Math.min(shown.length - 1, to))]?.id); };
      const key = ev.key.toLowerCase();
      if (key === 'arrowdown' || key === 'j') return move(selectedIndex + 1);
      if (key === 'arrowup' || key === 'k') return move(selectedIndex - 1);
      if (actions.busy) return;
      // After confirming or rejecting, jump to the next event so a pass through the list is one key per event.
      const next = shown[selectedIndex + 1]?.id;
      if (key === 'c') { void actions.review(selected.id, 'confirmed').then((ok) => ok && next && select(next)); }
      else if (key === 'x') { void actions.review(selected.id, 'rejected').then((ok) => ok && next && select(next)); }
      else if (key === 'e') { ev.preventDefault(); setEditing(true); }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  if (error) return <ErrorNote error={error} onRetry={onRetry} />;
  if (loading && !timeline) return <div className="h-64 animate-pulse rounded-lg bg-surface-2" aria-busy="true" />;
  if (!events.length) return <EmptyState>No events yet. Upload records and press “Process case” to build the timeline.</EmptyState>;

  const count = (f: Filter) =>
    events.filter((e) => (f === 'todo' ? e.review_status === 'unreviewed' : f === 'verified' ? e.verified : f === 'attention' ? !e.verified : true)).length;
  const FILTERS: [Filter, string][] = [
    ['all', 'All'], ['todo', 'To review'], ['attention', 'Not verified'], ['verified', 'Verified'],
  ];

  return (
    <div
      ref={panelRef}
      className="grid gap-3 lg:min-h-[30rem] lg:grid-cols-[minmax(0,1fr)_minmax(23rem,28rem)] lg:grid-rows-[minmax(12rem,3fr)_4fr] 3xl:grid-cols-[21rem_minmax(0,1fr)_27rem] 3xl:grid-rows-1"
    >
      {/* The page: where the evidence is */}
      <div className="flex min-h-0 flex-col lg:col-start-1 lg:row-span-2 lg:row-start-1 3xl:col-start-2 3xl:row-span-1">
        {doc && source && (
          <PageStage
            key={doc.id}
            doc={doc}
            page={source.page_no}
            blocks={pageData.data?.blocks}
            highlight={new Set(source.block_ids)}
            onBlockClick={onBlockClick}
            caption={<><span className="indic">{doc.filename}</span> · p.{source.page_no}</>}
            className="h-[60vh] lg:h-auto lg:flex-1"
          />
        )}
      </div>

      {/* The events, with the filters on top and the shortcuts underneath */}
      <section aria-label="Events" className="flex min-h-0 flex-col overflow-hidden rounded-xl border border-line bg-surface lg:col-start-2 lg:row-start-1 3xl:col-start-1">
        <div className="border-b border-line p-2">
          <div role="group" aria-label="Filter events" className="flex flex-wrap gap-1">
            {FILTERS.map(([f, label]) => (
              <button
                key={f}
                type="button"
                aria-pressed={filter === f}
                onClick={() => { setFilter(f); select(undefined); }}
                className={`rounded-md px-2.5 py-1 text-xs font-medium whitespace-nowrap ${filter === f ? 'bg-accent text-accent-fg' : 'text-muted hover:bg-surface-2 hover:text-fg'} ${f === 'attention' && count(f) > 0 && filter !== f ? 'text-bad' : ''}`}
              >
                {label} <span className="opacity-70">{count(f)}</span>
              </button>
            ))}
          </div>
          {filter === 'attention' && count('attention') > 0 && (
            <p className="mt-2 rounded-md bg-bad-bg px-2.5 py-1.5 text-xs text-bad">
              These cite text that was not found in the OCR output. Check them against the page; they are kept out of findings and the brief.
            </p>
          )}
        </div>
        <div data-scroll-container className="min-h-0 flex-1 overflow-y-auto">
          {shown.length === 0
            ? <p className="p-4 text-center text-sm text-muted">Nothing in this filter.</p>
            : <EventList events={shown} selectedId={selected?.id} onSelect={(id) => select(id)} />}
        </div>
        <p className="hidden border-t border-line px-3 py-1.5 text-[11px] text-muted sm:block">
          <kbd className={KBD}>↑</kbd> <kbd className={KBD}>↓</kbd> move · <kbd className={KBD}>C</kbd> confirm · <kbd className={KBD}>X</kbd> reject · <kbd className={KBD}>E</kbd> correct
        </p>
      </section>

      {/* The selected event: facts, evidence, and the actions */}
      <section aria-label="Event details" className="min-h-0 overflow-hidden rounded-xl border border-line bg-surface lg:col-start-2 lg:row-start-2 3xl:col-start-3 3xl:row-start-1">
        {selected ? (
          <EventDetail
            key={selected.id}
            event={selected}
            documents={documents}
            sourceIndex={sourceIndex}
            onSourceChange={(i) => setPick({ id: selected.id, source: i })}
            activeConfidence={weakestConfidence(pageData.data?.blocks, source?.block_ids ?? [])}
            actions={actions}
            editing={editing}
            onEditingChange={setEditing}
          />
        ) : (
          <p className="grid h-full min-h-24 place-items-center p-4 text-center text-sm text-muted">Pick an event to see its evidence.</p>
        )}
      </section>
    </div>
  );
}
