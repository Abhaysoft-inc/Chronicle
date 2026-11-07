'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

interface Settled<T> {
  /** Which request this result belongs to: `${key}#${version}`. */
  id: string;
  data?: T;
  error?: Error;
}

/**
 * Load data in the browser. Re-runs when `key` changes or `reload()` is called.
 * While a reload is in flight the previous data stays on screen (no flash of empty UI).
 * `loading` is derived (result is for an older request) rather than stored, so nothing needs
 * to call setState synchronously inside the effect.
 */
export function useLoader<T>(key: string | null, load: () => Promise<T>) {
  const [version, setVersion] = useState(0);
  const [settled, setSettled] = useState<Settled<T> | null>(null);
  const loadRef = useRef(load);
  useEffect(() => {
    loadRef.current = load;
  });

  const requestId = key === null ? null : `${key}#${version}`;

  useEffect(() => {
    if (requestId === null) return;
    let stale = false;
    loadRef
      .current()
      .then((data) => !stale && setSettled({ id: requestId, data }))
      .catch((error: Error) => !stale && setSettled({ id: requestId, error }));
    return () => {
      stale = true;
    };
  }, [requestId]);

  const reload = useCallback(() => setVersion((v) => v + 1), []);
  const current = settled !== null && settled.id === requestId;
  return {
    /** Latest successful data, even if a newer request is still running. */
    data: settled?.data,
    error: current ? settled?.error : undefined,
    loading: requestId !== null && !current,
    reload,
  };
}
