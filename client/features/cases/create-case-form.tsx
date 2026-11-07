'use client';

import { useRouter } from 'next/navigation';
import { useState, type FormEvent } from 'react';
import { Button } from '@/components/ui/button';
import { Field, Select, TextInput } from '@/components/ui/field';
import { useToast } from '@/components/ui/toast';
import { createCase } from '@/lib/api/endpoints';
import { LANGUAGES } from '@/lib/languages';

const CASE_TYPES = ['general', 'surgical', 'medical', 'obstetric', 'emergency'];

export function CreateCaseForm() {
  const router = useRouter();
  const notify = useToast();
  const [title, setTitle] = useState('');
  const [caseType, setCaseType] = useState('general');
  const [outputLanguage, setOutputLanguage] = useState('en-IN');
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!title.trim()) return notify('Give the case a title first.', 'bad');
    setBusy(true);
    try {
      const c = await createCase({ title: title.trim(), case_type: caseType, output_language: outputLanguage });
      router.push(`/cases/${c.id}`);
    } catch (err) {
      notify((err as Error).message, 'bad');
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="grid gap-3 sm:grid-cols-[1fr_9rem_11rem_auto] sm:items-end">
      <Field label="Case title">
        <TextInput value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Post-operative infection, Ward 4" maxLength={200} />
      </Field>
      <Field label="Type">
        <Select value={caseType} onChange={(e) => setCaseType(e.target.value)}>
          {CASE_TYPES.map((t) => <option key={t} value={t}>{t[0].toUpperCase() + t.slice(1)}</option>)}
        </Select>
      </Field>
      <Field label="Brief language" hint="English is always produced.">
        <Select value={outputLanguage} onChange={(e) => setOutputLanguage(e.target.value)}>
          {LANGUAGES.filter((l) => l.tier === 1).map((l) => <option key={l.code} value={l.code}>{l.name}</option>)}
        </Select>
      </Field>
      <Button type="submit" loading={busy} className="sm:mb-[1.15rem]">Create case</Button>
    </form>
  );
}
