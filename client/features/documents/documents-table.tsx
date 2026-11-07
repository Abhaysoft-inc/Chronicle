import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/card';
import { Pill } from '@/components/ui/pill';
import type { DocumentSummary } from '@/lib/api/types';
import { languageName } from '@/lib/languages';

export function DocumentsTable({ documents, onView }: { documents: DocumentSummary[]; onView: (documentId: string) => void }) {
  if (!documents.length) return <EmptyState>No documents yet. Upload the case&apos;s records above.</EmptyState>;
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-left text-sm">
        <thead className="text-xs text-muted">
          <tr>
            <th className="py-2 pr-3 font-medium">File</th>
            <th className="py-2 pr-3 font-medium">Pages</th>
            <th className="py-2 pr-3 font-medium">Language</th>
            <th className="py-2 pr-3 font-medium">Status</th>
            <th className="py-2" />
          </tr>
        </thead>
        <tbody className="divide-y divide-line">
          {documents.map((d) => (
            <tr key={d.id}>
              <td className="indic max-w-xs truncate py-2 pr-3">{d.filename}</td>
              <td className="py-2 pr-3">{d.page_count ?? <span className="text-muted">not read yet</span>}</td>
              <td className="py-2 pr-3">{languageName(d.language)}</td>
              <td className="py-2 pr-3">
                <div className="flex flex-wrap gap-1">
                  {d.failed_pages > 0 && <Pill tone="bad">{d.failed_pages} page{d.failed_pages === 1 ? '' : 's'} failed</Pill>}
                  {d.pages_with_warnings > 0 && <Pill tone="warn">{d.pages_with_warnings} warning{d.pages_with_warnings === 1 ? '' : 's'}</Pill>}
                  {d.failed_pages === 0 && d.pages_with_warnings === 0 && d.page_count != null && <Pill tone="ok">Read</Pill>}
                </div>
              </td>
              <td className="py-2 text-right">
                <Button variant="ghost" size="sm" onClick={() => onView(d.id)}>View</Button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
