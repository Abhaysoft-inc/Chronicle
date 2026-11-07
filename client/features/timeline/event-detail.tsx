'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { TextInput } from '@/components/ui/field';
import { Pill } from '@/components/ui/pill';
import type { DocumentSummary, TimelineEvent } from '@/lib/api/types';
import { confidenceLevel } from '@/lib/confidence';
import { humanize, nearlySame, verifyReasonText } from '@/lib/format';
import type { EventActions } from './use-event-actions';

/** The body of the selected event: facts, evidence quotes, a handwriting warning, and the actions. */
export function EventDetail({ event: e, documents, sourceIndex, onSourceChange, activeConfidence, actions, editing, onEditingChange }: {
  event: TimelineEvent;
  documents: DocumentSummary[];
  sourceIndex: number;
  onSourceChange: (index: number) => void;
  /** Lowest OCR confidence among the blocks the active source cites. */
  activeConfidence: number | null;
  actions: EventActions;
  editing: boolean;
  onEditingChange: (v: boolean) => void;
}) {
  const [draft, setDraft] = useState<{ summary: string; date: string } | null>(null);
  const summary = e.corrected?.summary_en ?? e.summary_en;
  const date = e.corrected?.raw_date !== undefined ? e.corrected.raw_date : e.raw_date;
  const details = Object.entries(e.details).filter(([, v]) => v !== null && v !== '');
  const failing = e.sources.filter((s) => !s.verified);
  const level = confidenceLevel(activeConfidence);

  const form = editing ? (draft ?? { summary, date: date ?? '' }) : null;
  async function save() {
    if (!form?.summary.trim()) return;
    if (await actions.correct(e.id, { summary_en: form.summary.trim(), raw_date: form.date.trim() || null })) {
      setDraft(null);
      onEditingChange(false);
    }
  }

  return (
    <div className="flex flex-col gap-3.5">
      {(e.legibility !== 'clear' || e.review_status !== 'unreviewed') && (
        <div className="flex flex-wrap gap-1.5">
          {e.legibility !== 'clear' && <Pill tone="warn">{humanize(e.legibility)} handwriting</Pill>}
          {e.review_status !== 'unreviewed' && (
            <Pill tone={e.review_status === 'confirmed' ? 'ok' : e.review_status === 'rejected' ? 'bad' : 'warn'}>{humanize(e.review_status)}</Pill>
          )}
        </div>
      )}

      {form ? (
        <div className="flex flex-col gap-2">
          <TextInput autoFocus value={form.summary} onChange={(ev) => setDraft({ ...form, summary: ev.target.value })} aria-label="Corrected summary" className="h-10 text-base" />
          <TextInput value={form.date} onChange={(ev) => setDraft({ ...form, date: ev.target.value })} placeholder="Date as written (optional)" aria-label="Date as written" />
          <div className="flex gap-2">
            <Button size="sm" onClick={save} loading={actions.busy}>Save correction</Button>
            <Button size="sm" variant="ghost" onClick={() => { setDraft(null); onEditingChange(false); }}>Cancel (Esc)</Button>
          </div>
        </div>
      ) : (
        <>
          {e.corrected && <p className="text-xs text-warn">Edited by a person. Original: {e.summary_en}</p>}
          <p className="text-sm text-muted">
            {date ? <>Date as written: <b className="indic font-semibold text-fg">{date}</b></> : 'No date recorded'}
            {e.actor_role && <> · {e.actor_role}</>}
          </p>
          {details.length > 0 && (
            <dl className="flex flex-wrap gap-1.5">
              {details.map(([k, v]) => (
                <div key={k} className="indic rounded-md bg-surface-2 px-2 py-1 text-[13px]">
                  <dt className="inline text-muted">{humanize(k)}: </dt>
                  <dd className="inline font-medium">{String(v)}</dd>
                </div>
              ))}
            </dl>
          )}
        </>
      )}

      <section aria-label="Evidence">
        <h4 className="mb-2 flex flex-wrap items-center gap-x-3 text-xs font-semibold tracking-wide text-muted uppercase">
          Evidence ({e.sources.length})
          {failing.length === 0 && <span className="font-medium tracking-normal text-ok normal-case">✓ found in the OCR text</span>}
        </h4>
        <ul className="flex flex-col gap-1.5">
          {e.sources.map((s, i) => {
            const d = documents.find((x) => x.id === s.document_id);
            const showEnglish = s.quote_en && !nearlySame(s.quote_en, s.quote_original);
            const active = i === sourceIndex;
            return (
              <li key={i}>
                <button
                  type="button"
                  onClick={() => onSourceChange(i)}
                  aria-pressed={active}
                  className={`block w-full rounded-lg border-l-4 px-3 py-2 text-left ${s.verified ? 'border-ok' : 'border-bad'} ${active ? 'bg-surface-2 ring-1 ring-accent/50' : 'bg-surface-2/50 hover:bg-surface-2'}`}
                >
                  <span lang={d?.language ?? undefined} className="indic block text-base">{s.quote_original}</span>
                  {showEnglish && <span className="mt-0.5 block text-[13px] text-muted">English (machine-generated): {s.quote_en}</span>}
                  <span className="mt-1 flex flex-wrap gap-x-3 text-xs text-muted">
                    <span className="indic">{d?.filename ?? s.document_id} · p.{s.page_no}</span>
                    {!s.verified && <span className="font-medium text-bad">✕ {verifyReasonText(s.verify_reason)}</span>}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
        {level === 'low' && (
          <p className="mt-2 rounded-lg border border-warn/40 bg-warn-bg px-3 py-2 text-[13px] text-warn">
            ✋ Low OCR confidence ({Math.round((activeConfidence ?? 0) * 100)}%). Compare this text with the handwriting on the page before you rely on it, especially numbers and drug names.
          </p>
        )}
      </section>

      {!editing && (
        <div className="flex flex-wrap items-center gap-2 border-t border-line pt-3">
          <Button variant="secondary" disabled={actions.busy || e.review_status === 'confirmed'} onClick={() => actions.review(e.id, 'confirmed')}>
            Confirm <kbd className="ml-1 rounded bg-surface-2 px-1 text-[11px] text-muted">C</kbd>
          </Button>
          <Button variant="danger" disabled={actions.busy || e.review_status === 'rejected'} onClick={() => actions.review(e.id, 'rejected')}>
            Reject <kbd className="ml-1 rounded bg-surface-2 px-1 text-[11px] text-muted">X</kbd>
          </Button>
          <Button variant="ghost" disabled={actions.busy} onClick={() => onEditingChange(true)}>
            Correct <kbd className="ml-1 rounded bg-surface-2 px-1 text-[11px] text-muted">E</kbd>
          </Button>
          {e.review_status !== 'unreviewed' && (
            <Button variant="ghost" disabled={actions.busy} onClick={() => actions.review(e.id, 'unreviewed')}>Reset</Button>
          )}
        </div>
      )}
    </div>
  );
}
