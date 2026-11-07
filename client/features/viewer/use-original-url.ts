'use client';

import { useEffect, useState } from 'react';
import { getOriginalFile } from '@/lib/api/endpoints';

/**
 * The original upload as a blob: URL. It goes through fetch (not a plain <iframe src>) so the
 * API token header can be sent. The object URL is released when the document changes.
 */
export function useOriginalUrl(documentId: string | undefined) {
  const [state, setState] = useState<{ id: string; url?: string; error?: string } | null>(null);

  useEffect(() => {
    if (!documentId) return;
    let stale = false;
    let objectUrl: string | undefined;
    getOriginalFile(documentId)
      .then((blob) => {
        if (stale) return;
        objectUrl = URL.createObjectURL(blob);
        setState({ id: documentId, url: objectUrl });
      })
      .catch((e: Error) => !stale && setState({ id: documentId, error: e.message }));
    return () => {
      stale = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [documentId]);

  // Ignore a result that belongs to the previous document.
  return state && state.id === documentId ? state : null;
}
