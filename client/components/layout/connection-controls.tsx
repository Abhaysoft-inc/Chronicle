'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Field, TextInput } from '@/components/ui/field';
import { Pill } from '@/components/ui/pill';
import { fetchHealth } from '@/lib/api/client';
import { DEFAULT_API_BASE, getApiBase, getApiToken, saveApiSettings } from '@/lib/api/config';
import { useLoader } from '@/lib/hooks/use-loader';

/** Is the backend up, and does it have a Sarvam key? Shown in the top bar of the app. */
export function ApiStatus() {
  const { data, error, loading } = useLoader('health', fetchHealth);
  if (loading && !data) return <Pill>Checking API…</Pill>;
  if (error || !data) return <Pill tone="bad" title="The backend did not answer. Start it with npm run dev in /backend.">API offline</Pill>;
  if (data.cacheOnly) return <Pill tone="warn">Cache-only mode</Pill>;
  return data.sarvamKeyConfigured
    ? <Pill tone="ok">API online</Pill>
    : <Pill tone="warn" title="Uploads work, but OCR will fail until SARVAM_API_KEY is set in backend/.env">No Sarvam key</Pill>;
}

function ConnectionPanel({ onClose }: { onClose: () => void }) {
  // Lazy initial state: reads localStorage once, in the browser, when the panel opens.
  const [base, setBase] = useState(getApiBase);
  const [token, setToken] = useState(getApiToken);
  return (
    <div className="absolute top-full right-0 z-40 mt-2 w-80 rounded-xl border border-line bg-surface p-4 shadow-xl">
      <div className="flex flex-col gap-3">
        <Field label="Backend URL" hint={`Default: ${DEFAULT_API_BASE}`}>
          <TextInput value={base} onChange={(e) => setBase(e.target.value)} placeholder={DEFAULT_API_BASE} />
        </Field>
        <Field label="API token" hint="Only needed if the backend sets API_TOKEN.">
          <TextInput type="password" value={token} onChange={(e) => setToken(e.target.value)} placeholder="optional" />
        </Field>
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button onClick={() => { saveApiSettings(base, token); window.location.reload(); }}>Save and reload</Button>
        </div>
      </div>
    </div>
  );
}

export function ConnectionButton() {
  const [open, setOpen] = useState(false);
  return (
    <div className="relative">
      <Button variant="secondary" size="sm" aria-expanded={open} onClick={() => setOpen((v) => !v)}>Connection</Button>
      {open && <ConnectionPanel onClose={() => setOpen(false)} />}
    </div>
  );
}
