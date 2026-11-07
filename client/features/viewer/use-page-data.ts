'use client';

import { getPage } from '@/lib/api/endpoints';
import type { DocumentSummary } from '@/lib/api/types';
import { useLoader } from '@/lib/hooks/use-loader';

/** OCR blocks (text, box, confidence) for one page of a document. Null key = nothing to load yet. */
export function usePageData(doc: DocumentSummary | undefined, page: number) {
  const readable = doc != null && doc.page_count != null && page >= 1 && page <= doc.page_count;
  return useLoader(readable ? `${doc.id}:${page}` : null, () => getPage(doc!.id, page));
}
