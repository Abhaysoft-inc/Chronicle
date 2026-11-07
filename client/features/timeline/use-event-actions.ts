'use client';

import { useCallback, useState } from 'react';
import { useToast } from '@/components/ui/toast';
import { patchEvent } from '@/lib/api/endpoints';

type Review = 'confirmed' | 'rejected' | 'unreviewed';

/** Confirm / reject / correct an event. Shared by the buttons and the keyboard shortcuts. */
export function useEventActions(onChanged: () => void) {
  const notify = useToast();
  const [busy, setBusy] = useState(false);

  const run = useCallback(async (fn: () => Promise<unknown>) => {
    setBusy(true);
    try {
      await fn();
      onChanged();
      return true;
    } catch (err) {
      notify((err as Error).message, 'bad');
      return false;
    } finally {
      setBusy(false);
    }
  }, [onChanged, notify]);

  const review = useCallback((id: string, status: Review) => run(() => patchEvent(id, { review_status: status })), [run]);
  const correct = useCallback(
    (id: string, corrections: { summary_en: string; raw_date: string | null }) => run(() => patchEvent(id, { corrections })),
    [run],
  );

  return { busy, review, correct };
}

export type EventActions = ReturnType<typeof useEventActions>;
