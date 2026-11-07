'use client';

import Link from 'next/link';
import { EmptyState, ErrorNote } from '@/components/ui/card';
import { Pill } from '@/components/ui/pill';
import { listCases } from '@/lib/api/endpoints';
import { caseStatusTone, formatDate, humanize } from '@/lib/format';
import { useLoader } from '@/lib/hooks/use-loader';
import { languageName } from '@/lib/languages';

export function CaseList() {
  const { data, error, loading, reload } = useLoader('cases', listCases);

  if (error) return <ErrorNote error={error} onRetry={reload} />;
  if (loading && !data) {
    return (
      <ul className="space-y-2" aria-busy="true">
        {[0, 1, 2].map((i) => <li key={i} className="h-16 animate-pulse rounded-lg bg-surface-2" />)}
      </ul>
    );
  }
  if (!data?.length) return <EmptyState>No cases yet. Create one above, then upload its records.</EmptyState>;

  return (
    <ul className="divide-y divide-line overflow-hidden rounded-xl border border-line bg-surface">
      {data.map((c) => (
        <li key={c.id}>
          <Link href={`/cases/${c.id}`} className="flex flex-wrap items-center justify-between gap-2 px-4 py-3 hover:bg-surface-2">
            <div className="min-w-0">
              <p className="truncate font-medium">{c.title}</p>
              <p className="text-xs text-muted">
                {humanize(c.case_type)} · {c.document_count ?? 0} document{c.document_count === 1 ? '' : 's'} · brief in {languageName(c.output_language)} · {formatDate(c.created_at)}
              </p>
            </div>
            <Pill tone={caseStatusTone(c.status)}>{humanize(c.status)}</Pill>
          </Link>
        </li>
      ))}
    </ul>
  );
}
