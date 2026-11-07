'use client';

import { useRef, useState, type DragEvent } from 'react';
import { Button } from '@/components/ui/button';
import { Field, Select } from '@/components/ui/field';
import { useToast } from '@/components/ui/toast';
import { uploadDocuments } from '@/lib/api/endpoints';
import { LANGUAGES } from '@/lib/languages';

const ACCEPTED = ['application/pdf', 'image/jpeg', 'image/png'];
const formatSize = (b: number) => (b > 1_000_000 ? `${(b / 1_000_000).toFixed(1)} MB` : `${Math.max(1, Math.round(b / 1000))} KB`);

export function UploadPanel({ caseId, onUploaded }: { caseId: string; onUploaded: () => void }) {
  const notify = useToast();
  const input = useRef<HTMLInputElement>(null);
  const [files, setFiles] = useState<File[]>([]);
  const [language, setLanguage] = useState('');
  const [dragging, setDragging] = useState(false);
  const [busy, setBusy] = useState(false);

  function add(list: FileList | File[]) {
    const all = Array.from(list);
    const ok = all.filter((f) => ACCEPTED.includes(f.type));
    if (ok.length < all.length) notify(`${all.length - ok.length} file(s) skipped: only PDF, JPG and PNG are accepted.`, 'bad');
    setFiles((cur) => [...cur, ...ok]);
  }

  function onDrop(e: DragEvent) {
    e.preventDefault();
    setDragging(false);
    add(e.dataTransfer.files);
  }

  async function upload() {
    setBusy(true);
    try {
      const res = await uploadDocuments(caseId, files, language);
      const dups = res.documents.filter((d) => d.duplicate).length;
      const added = res.documents.length - dups;
      notify(`${added} file${added === 1 ? '' : 's'} uploaded${dups ? `, ${dups} already in this case (skipped)` : ''}.`, 'ok');
      setFiles([]);
      onUploaded();
    } catch (err) {
      notify((err as Error).message, 'bad');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col gap-3">
      <div
        onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
        onDragLeave={() => setDragging(false)}
        onDrop={onDrop}
        className={`flex flex-col items-center gap-2 rounded-xl border-2 border-dashed px-4 py-8 text-center transition-colors ${dragging ? 'border-accent bg-accent/5' : 'border-line'}`}
      >
        <p className="text-sm">Drop records here, or</p>
        <Button variant="secondary" onClick={() => input.current?.click()}>Choose files</Button>
        <input
          ref={input}
          type="file"
          multiple
          hidden
          accept=".pdf,.jpg,.jpeg,.png,application/pdf,image/jpeg,image/png"
          onChange={(e) => { if (e.target.files) add(e.target.files); e.target.value = ''; }}
        />
        <p className="text-xs text-muted">PDF, JPG or PNG. Handwritten or printed. Use synthetic records, not real patient data.</p>
      </div>

      {files.length > 0 && (
        <>
          <ul className="divide-y divide-line rounded-lg border border-line text-sm">
            {files.map((f, i) => (
              <li key={`${f.name}-${i}`} className="flex items-center justify-between gap-2 px-3 py-1.5">
                <span className="indic truncate">{f.name}</span>
                <span className="flex shrink-0 items-center gap-2 text-xs text-muted">
                  {formatSize(f.size)}
                  <button type="button" aria-label={`Remove ${f.name}`} className="text-bad" onClick={() => setFiles((cur) => cur.filter((_, j) => j !== i))}>✕</button>
                </span>
              </li>
            ))}
          </ul>
          <div className="flex flex-wrap items-end gap-3">
            <div className="w-56">
              <Field label="Language of these files" hint="Auto-detect assumes an Indian-language document.">
                <Select value={language} onChange={(e) => setLanguage(e.target.value)}>
                  <option value="">Auto-detect</option>
                  {LANGUAGES.map((l) => <option key={l.code} value={l.code}>{l.name}{l.tier > 1 ? ` (tier ${l.tier})` : ''}</option>)}
                </Select>
              </Field>
            </div>
            <Button onClick={upload} loading={busy} className="mb-[1.15rem]">
              Upload {files.length} file{files.length === 1 ? '' : 's'}
            </Button>
          </div>
        </>
      )}
    </div>
  );
}
