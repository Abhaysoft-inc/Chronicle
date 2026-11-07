import Link from 'next/link';
import type { DashboardData } from '@/lib/api/types';

/** Cases with something a person should look at: unverified events, pages that were not analysed, failures. */
export function AttentionList({ items }: { items: DashboardData['attention'] }) {
  if (!items.length) {
    return (
      <p className="grid h-40 place-items-center text-center text-sm text-muted">
        <span><span className="text-ok" aria-hidden="true">✓</span> Nothing needs attention.</span>
      </p>
    );
  }
  return (
    <ul className="divide-y divide-line">
      {items.map((c) => (
        <li key={c.caseId}>
          <Link href={`/cases/${c.caseId}`} className="block rounded-md px-1 py-2.5 hover:bg-surface-2/60">
            <p className="truncate text-sm font-medium">{c.title}</p>
            <ul className="mt-1 flex flex-wrap gap-1.5">
              {c.reasons.map((r) => (
                <li key={r} className="rounded-full bg-warn-bg px-2 py-0.5 text-xs font-medium text-warn"><span aria-hidden="true">⚠ </span>{r}</li>
              ))}
            </ul>
          </Link>
        </li>
      ))}
    </ul>
  );
}
