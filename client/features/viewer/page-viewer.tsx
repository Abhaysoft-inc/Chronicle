'use client';

import { useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { EmptyState, ErrorNote } from '@/components/ui/card';
import { Select } from '@/components/ui/field';
import { Pill } from '@/components/ui/pill';
import type { DocumentSummary } from '@/lib/api/types';
import { revealWithin } from '@/lib/dom';
import { humanize } from '@/lib/format';
import { BlockList } from './block-list';
import { PageStage } from './page-stage';
import type { ViewerTarget } from './types';
import { usePageData } from './use-page-data';

/** The "Page viewer" tab: any document, any page. The page on the left, what OCR read on the right. */
export function PageViewer({ documents, value, onChange }: {
  documents: DocumentSummary[];
  value: ViewerTarget | null;
  onChange: (t: ViewerTarget) => void;
}) {
  const doc = documents.find((d) => d.id === value?.documentId) ?? documents[0];
  const page = doc && value && value.documentId === doc.id ? value.page : 1;
  const highlight = new Set(doc && value && value.documentId === doc.id ? value.blockIds : []);
  const data = usePageData(doc, page);

  const firstHighlighted = data.data?.blocks.find((b) => highlight.has(b.block_id))?.block_id;
  useEffect(() => {
    if (firstHighlighted) revealWithin(document.getElementById(`blk-${firstHighlighted}`), 'center');
  }, [firstHighlighted, data.data]);

  if (!doc) return <EmptyState>Upload a document to see its pages here.</EmptyState>;

  const pageCount = doc.page_count;
  const go = (documentId: string, p: number, blockIds: string[] = []) => onChange({ documentId, page: p, blockIds });
  const info = data.data?.page;

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <div className="w-64 max-w-full">
          <Select aria-label="Document" value={doc.id} onChange={(e) => go(e.target.value, 1)}>
            {documents.map((d) => <option key={d.id} value={d.id}>{d.filename}{d.page_count ? ` (${d.page_count} p)` : ''}</option>)}
          </Select>
        </div>
        <Button variant="secondary" size="sm" disabled={page <= 1} onClick={() => go(doc.id, page - 1)} aria-label="Previous page">◀</Button>
        <span className="text-sm tabular-nums">Page {page}{pageCount ? ` of ${pageCount}` : ''}</span>
        <Button variant="secondary" size="sm" disabled={pageCount == null || page >= pageCount} onClick={() => go(doc.id, page + 1)} aria-label="Next page">▶</Button>
        {info && (
          <span className="ml-2 flex flex-wrap items-center gap-1.5">
            <Pill tone={info.ocr_status === 'ok' ? 'ok' : 'bad'}>OCR {info.ocr_status.replace('_', ' ')}</Pill>
            {info.script && <Pill>{info.script} script</Pill>}
            {info.doc_type && <Pill tone="info">{humanize(info.doc_type)}</Pill>}
            {info.warning && <Pill tone="warn">{info.warning}</Pill>}
          </span>
        )}
      </div>

      <div className="grid gap-3 lg:h-[calc(100dvh-16rem)] lg:min-h-[32rem] lg:grid-cols-[minmax(0,1fr)_minmax(22rem,30rem)]">
        <PageStage
          doc={doc}
          page={page}
          blocks={data.data?.blocks}
          highlight={highlight}
          onBlockClick={(id) => go(doc.id, page, [id])}
          className="h-[70vh] lg:h-auto"
        />
        <section data-scroll-container aria-label="What OCR read" className="max-h-[50vh] overflow-auto rounded-xl border border-line bg-surface p-1.5 lg:max-h-none">
          {pageCount == null ? (
            <p className="p-4 text-center text-sm text-muted">This file has not been read yet. Press “Process case” first.</p>
          ) : data.error ? (
            <ErrorNote error={data.error} onRetry={data.reload} />
          ) : !data.data ? (
            <div className="h-24 animate-pulse rounded-lg bg-surface-2" aria-busy="true" />
          ) : (
            <BlockList blocks={data.data.blocks} language={doc.language} highlight={highlight} onSelect={(id) => go(doc.id, page, [id])} />
          )}
        </section>
      </div>
    </div>
  );
}
