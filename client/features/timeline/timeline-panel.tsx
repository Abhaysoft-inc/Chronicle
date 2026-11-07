'use client';

import { useEffect, useRef, useState } from 'react';
import { EmptyState, ErrorNote } from '@/components/ui/card';
import { useToast } from '@/components/ui/toast';
import { PageStage } from '@/features/viewer/page-stage';
import { usePageData } from '@/features/viewer/use-page-data';
import type { DocumentSummary, Timeline, TimelineEvent } from '@/lib/api/types';
import { weakestConfidence } from '@/lib/confidence';
import { revealWithin } from '@/lib/dom';
import { humanize } from '@/lib/format';
import { EventDetail } from './event-detail';
import { AddEventForm } from './add-event-form';
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
export function TimelinePanel({ caseId, timeline, loading, error, documents, onChanged, onRetry }: {
  caseId: string;
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
  const [typeFilter, setTypeFilter] = useState('');
  const [whoFilter, setWhoFilter] = useState('');
  const [showDuplicates, setShowDuplicates] = useState(false);
  const [adding, setAdding] = useState(false);
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
  // Event kinds and who-recorded-it values that actually occur in this case, for the two dropdowns.
  const typesPresent = [...new Set(events.map((e) => e.type))].sort();
  const whoPresent = [...new Set(events.map((e) => e.actor_role).filter((w): w is string => !!w))].sort();
  const shown = events.filter((e) =>
    (filter === 'all' ? true
      : filter === 'todo' ? e.review_status === 'unreviewed'
      : filter === 'verified' ? e.verified
      : !e.verified)
    && (!typeFilter || e.type === typeFilter)
    && (!whoFilter || e.actor_role === whoFilter)
    && (showDuplicates || !e.duplicate_of));
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
        {!source && selected && (
          <div className="grid h-[30vh] place-items-center rounded-xl border border-dashed border-line p-6 text-center text-sm text-muted lg:h-auto lg:flex-1">
            {selected.origin === 'manual' ? 'This event was added by a reviewer, so there is no page to show.' : 'This event has no source page.'}
          </div>
        )}
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
          <div className="mt-2 flex flex-wrap items-center gap-1.5 text-xs">
            <select aria-label="Event type" value={typeFilter} onChange={(e) => { setTypeFilter(e.target.value); select(undefined); }} className="h-7 rounded-md border border-line bg-surface px-1.5 text-xs">
              <option value="">All types</option>
              {typesPresent.map((t) => <option key={t} value={t}>{humanize(t)}</option>)}
            </select>
            {whoPresent.length > 0 && (
              <select aria-label="Recorded by" value={whoFilter} onChange={(e) => { setWhoFilter(e.target.value); select(undefined); }} className="h-7 rounded-md border border-line bg-surface px-1.5 text-xs">
                <option value="">Anyone</option>
                {whoPresent.map((w) => <option key={w} value={w}>{w}</option>)}
              </select>
            )}
            {(timeline?.duplicates ?? 0) > 0 && (
              <label className="flex items-center gap-1 text-muted" title="Events that repeat another event (same text cited, or the same thing on the same day)">
                <input type="checkbox" checked={showDuplicates} onChange={(e) => setShowDuplicates(e.target.checked)} /> Duplicates ({timeline?.duplicates})
              </label>
            )}
            <button type="button" onClick={() => { setAdding(true); setEditing(false); }} className="ml-auto rounded-md px-2 py-1 font-medium text-accent hover:bg-accent/10">+ Add event</button>
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
        {adding ? (
          <AddEventForm
            caseId={caseId}
            onCancel={() => setAdding(false)}
            onAdded={(added) => { setAdding(false); onChanged(); select(added.id); }}
          />
        ) : selected ? (
          <EventDetail
            key={selected.id}
            onJumpTo={(label) => { const t = events.find((x) => x.label === label); if (t) { setShowDuplicates(true); select(t.id); } }}
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
