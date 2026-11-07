import { Button } from '@/components/ui/button';
import { Pill } from '@/components/ui/pill';
import type { DocumentSummary, PageIssue } from '@/lib/api/types';

/**
 * Pages that were NOT analysed. This must stay prominent: a page that failed OCR could be the
 * most important one, and a missing page must never be read as "no care was recorded".
 */
export function PageIssues({ issues, documents, onView }: {
  issues: PageIssue[];
  documents: DocumentSummary[];
  onView: (documentId: string, page: number) => void;
}) {
  if (!issues.length) return null;
  const name = (id: string) => documents.find((d) => d.id === id)?.filename ?? id;
  return (
    <div className="rounded-lg border border-warn/40 bg-warn-bg p-3">
      <p className="text-sm font-medium text-warn">
        {issues.length} page{issues.length === 1 ? '' : 's'} not fully analysed
      </p>
      <p className="mt-0.5 text-xs text-warn/90">Anything on these pages is missing from the timeline. Do not read that as missing care.</p>
      <ul className="mt-2 divide-y divide-warn/20 text-sm">
        {issues.map((i) => (
          <li key={`${i.document_id}-${i.page_no}`} className="flex flex-wrap items-center gap-2 py-1.5">
            <span className="indic font-medium">{name(i.document_id)}</span>
            <span className="text-xs">p.{i.page_no}</span>
            <Pill tone={i.ocr_status === 'failed' ? 'bad' : 'warn'}>{i.ocr_status === 'ok' ? 'withheld' : i.ocr_status.replace('_', ' ')}</Pill>
            <span className="min-w-0 flex-1 text-xs">{i.warning}</span>
            <Button variant="ghost" size="sm" onClick={() => onView(i.document_id, i.page_no)}>View</Button>
          </li>
        ))}
      </ul>
    </div>
  );
}
