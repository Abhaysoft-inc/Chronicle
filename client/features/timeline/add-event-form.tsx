'use client';

import { useState, type FormEvent } from 'react';
import { Button } from '@/components/ui/button';
import { Field, Select, TextInput } from '@/components/ui/field';
import { useToast } from '@/components/ui/toast';
import { addEvent } from '@/lib/api/endpoints';
import type { TimelineEvent } from '@/lib/api/types';
import { humanize } from '@/lib/format';

/** The event kinds the backend accepts (mirrors EVENT_TYPES in backend/src/modules/extraction). */
export const EVENT_TYPES = [
  'admission', 'symptom_report', 'observation_vitals', 'examination', 'investigation_ordered', 'investigation_result',
  'diagnosis', 'medication_ordered', 'medication_administered', 'consent', 'procedure', 'anaesthesia', 'transfer',
  'escalation_or_review', 'discharge', 'death', 'other',
] as const;

/**
 * Add an event the records imply but the extraction missed (or one from a paper record not uploaded).
 * It is shown as added by a person, never as read from a document.
 */
export function AddEventForm({ caseId, onAdded, onCancel }: { caseId: string; onAdded: (e: TimelineEvent) => void; onCancel: () => void }) {
  const notify = useToast();
  const [type, setType] = useState<string>('observation_vitals');
  const [rawDate, setRawDate] = useState('');
  const [who, setWho] = useState('');
  const [summary, setSummary] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit(ev: FormEvent) {
    ev.preventDefault();
    if (summary.trim().length < 3) return notify('Describe what happened.', 'bad');
    setBusy(true);
    try {
      const added = await addEvent(caseId, { type, summary_en: summary.trim(), raw_date: rawDate.trim() || null, actor_role: who.trim() || null });
      notify(`Added ${added.label}.`, 'ok');
      onAdded(added);
    } catch (err) {
      notify((err as Error).message, 'bad');
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="flex h-full flex-col">
      <header className="border-b border-line px-4 py-3">
        <h3 className="text-base font-semibold">Add an event</h3>
        <p className="mt-0.5 text-xs text-muted">It will be marked “Added by a reviewer”, not as read from a document.</p>
      </header>
      <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto px-4 py-3">
        <Field label="What kind of event">
          <Select value={type} onChange={(e) => setType(e.target.value)}>
            {EVENT_TYPES.map((t) => <option key={t} value={t}>{humanize(t)}</option>)}
          </Select>
        </Field>
        <Field label="Date and time, as written" hint="e.g. 12/03/2026 22:00, or रात 10 बजे. Leave empty if unknown.">
          <TextInput value={rawDate} onChange={(e) => setRawDate(e.target.value)} placeholder="12/03/2026 22:00" />
        </Field>
        <Field label="Who (optional)">
          <TextInput value={who} onChange={(e) => setWho(e.target.value)} placeholder="nurse, Dr. Rao, surgeon…" />
        </Field>
        <Field label="What happened">
          <textarea
            value={summary}
            onChange={(e) => setSummary(e.target.value)}
            rows={4}
            placeholder="BP 86/50 recorded; duty doctor informed."
            className="w-full rounded-lg border border-line bg-surface px-3 py-2 text-sm text-fg placeholder:text-muted"
          />
        </Field>
      </div>
      <footer className="flex gap-2 border-t border-line px-4 py-2.5">
        <Button size="sm" type="submit" loading={busy}>Add event</Button>
        <Button size="sm" variant="ghost" onClick={onCancel}>Cancel</Button>
      </footer>
    </form>
  );
}
