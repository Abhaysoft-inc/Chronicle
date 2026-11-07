'use client';

import { useEffect, useRef, useState } from 'react';
import { streamUrl } from '@/lib/api/client';
import { getPipeline } from '@/lib/api/endpoints';
import type { PipelineSnapshot } from '@/lib/api/types';

export type StreamMode = 'connecting' | 'live' | 'polling';

/**
 * Live pipeline progress for one case, over Server-Sent Events.
 * - The server sends a full "snapshot" on connect, then an "update" for every change, so
 *   opening the page mid-run, reconnecting, or a server restart all land on the truth.
 * - EventSource reconnects by itself. Only if it fails 3 times in a row (or is closed for good,
 *   e.g. a bad token) do we fall back to polling GET /pipeline every 2s.
 * - `onSettled(finalStatus)` fires once when a run finishes (status leaves "processing"), so the
 *   caller can reload the data the run produced.
 */
export function usePipelineStream(caseId: string, onSettled: (finalStatus: string) => void) {
  const [state, setState] = useState<{ caseId: string; snapshot: PipelineSnapshot } | null>(null);
  const [mode, setMode] = useState<StreamMode>('connecting');
  const settled = useRef(onSettled);
  useEffect(() => {
    settled.current = onSettled;
  });

  useEffect(() => {
    let source: EventSource | null = null;
    let pollTimer: ReturnType<typeof setInterval> | undefined;
    let lastStatus: string | null = null;
    let failures = 0;

    const apply = (snapshot: PipelineSnapshot) => {
      setState({ caseId, snapshot });
      if (lastStatus === 'processing' && snapshot.status !== 'processing') settled.current(snapshot.status);
      lastStatus = snapshot.status;
    };

    const startPolling = () => {
      source?.close();
      source = null;
      if (pollTimer) return;
      setMode('polling');
      const tick = () => getPipeline(caseId).then(apply).catch(() => { /* keep trying */ });
      tick();
      pollTimer = setInterval(tick, 2000);
    };

    const onMessage = (e: Event) => {
      failures = 0;
      setMode('live');
      apply(JSON.parse((e as MessageEvent<string>).data) as PipelineSnapshot);
    };

    try {
      source = new EventSource(streamUrl(`/cases/${caseId}/stream`), { withCredentials: true }); // send the session cookie
      source.addEventListener('snapshot', onMessage);
      source.addEventListener('update', onMessage);
      source.onerror = () => {
        failures += 1;
        if (source?.readyState === EventSource.CLOSED || failures >= 3) startPolling();
      };
    } catch {
      queueMicrotask(startPolling);
    }

    return () => {
      source?.close();
      if (pollTimer) clearInterval(pollTimer);
    };
  }, [caseId]);

  return { snapshot: state?.caseId === caseId ? state.snapshot : null, mode };
}
