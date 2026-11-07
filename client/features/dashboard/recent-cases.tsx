import Link from 'next/link';
import { Pill } from '@/components/ui/pill';
import type { DashboardData } from '@/lib/api/types';
import { caseStatusTone, formatDate, humanize } from '@/lib/format';

/** Review progress as a thin bar plus the words, so the figure is readable without the bar. */
function ReviewProgress({ reviewed, total }: { reviewed: number; total: number }) {
  if (total === 0) return <span className="text-muted">No events yet</span>;
  const pct = Math.round((reviewed / total) * 100);
  return (
    <span className="flex items-center gap-2.5">
      <span className="h-2 w-24 overflow-hidden rounded-full bg-viz-neutral" role="img" aria-label={`${reviewed} of ${total} events reviewed`}>
        <span className="block h-full rounded-full bg-viz-1" style={{ width: `${pct}%` }} />
      </span>
      <span className="text-xs text-muted tabular-nums">{reviewed} / {total}</span>
    </span>
  );
}

export function RecentCases({ cases }: { cases: DashboardData['recentCases'] }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[40rem] text-left text-sm">
        <thead className="text-xs text-muted">
          <tr>
            <th className="py-2 pr-4 font-medium">Case</th>
            <th className="py-2 pr-4 font-medium">Status</th>
            <th className="py-2 pr-4 text-right font-medium">Documents</th>
            <th className="py-2 pr-4 font-medium">Review</th>
            <th className="py-2 text-right font-medium">Created</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-line">
          {cases.map((c) => (
            <tr key={c.id} className="group hover:bg-surface-2/50">
              <td className="py-3 pr-4">
                <Link href={`/cases/${c.id}`} className="font-medium group-hover:text-accent">{c.title}</Link>
                <p className="text-xs text-muted">{humanize(c.caseType)}</p>
              </td>
              <td className="py-3 pr-4">
                <Pill tone={caseStatusTone(c.status)}>{humanize(c.status)}</Pill>
                {c.unverified > 0 && <span className="ml-2 text-xs font-medium text-bad">⚠ {c.unverified} not verified</span>}
              </td>
              <td className="py-3 pr-4 text-right tabular-nums">{c.documents}</td>
              <td className="py-3 pr-4"><ReviewProgress reviewed={c.reviewed} total={c.events} /></td>
              <td className="py-3 text-right text-xs whitespace-nowrap text-muted">{formatDate(c.createdAt)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
