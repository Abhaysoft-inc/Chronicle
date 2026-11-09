'use client';

import Link from 'next/link';
import { useEffect } from 'react';
import { Card, ErrorNote } from '@/components/ui/card';
import { useAuth } from '@/features/auth/auth-context';
import { getDashboard } from '@/lib/api/endpoints';
import { useLoader } from '@/lib/hooks/use-loader';
import { AttentionList } from './attention-list';
import { ChartCard } from './charts/chart-card';
import { ColumnChart, ColumnTable } from './charts/column-chart';
import { RankedBars, RankedTable } from './charts/ranked-bars';
import { SegmentTable, SegmentedBar, type Segment } from './charts/segmented-bar';
import { RecentCases } from './recent-cases';
import { StatTile } from './stat-tile';

const pct = (n: number | null) => (n === null ? '–' : `${Math.round(n * 100)}%`);

function greeting(): string {
  const h = new Date().getHours();
  return h < 5 ? 'Working late' : h < 12 ? 'Good morning' : h < 18 ? 'Good afternoon' : 'Good evening';
}

function Skeleton() {
  return (
    <div className="flex flex-col gap-5" aria-busy="true" aria-label="Loading dashboard">
      <div className="h-8 w-64 animate-pulse rounded bg-surface-2" />
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">{[0, 1, 2, 3, 4].map((i) => <div key={i} className="h-28 animate-pulse rounded-xl bg-surface-2" />)}</div>
      <div className="grid gap-4 lg:grid-cols-3"><div className="h-72 animate-pulse rounded-xl bg-surface-2 lg:col-span-2" /><div className="h-72 animate-pulse rounded-xl bg-surface-2" /></div>
    </div>
  );
}

function Welcome() {
  const steps = ['Create a case for the dispute you are looking at.', 'Upload the records: photos, scans or PDFs, in any Indian language.', 'Press Process, then review the timeline with the evidence beside it.'];
  return (
    <Card title="Welcome to Chronicle" description="Three steps to your first timeline.">
      <ol className="flex flex-col gap-3 text-sm">
        {steps.map((s, i) => (
          <li key={s} className="flex items-start gap-3">
            <span className="grid size-6 shrink-0 place-items-center rounded-full bg-accent/10 text-xs font-semibold text-accent">{i + 1}</span>
            <span className="pt-0.5">{s}</span>
          </li>
        ))}
      </ol>
      <Link href="/cases" className="mt-5 inline-flex h-10 items-center rounded-lg bg-accent px-4 text-sm font-medium text-accent-fg hover:opacity-90">Create your first case</Link>
    </Card>
  );
}

export function DashboardView() {
  const { user } = useAuth();
  const { data, error, reload } = useLoader('dashboard', getDashboard);
  const inProgress = data?.totals.casesInProgress ?? 0;

  // Keep the numbers fresh: when you come back to the tab, and every few seconds while a case is processing.
  useEffect(() => {
    const onVisible = () => document.visibilityState === 'visible' && reload();
    document.addEventListener('visibilitychange', onVisible);
    const timer = inProgress > 0 ? setInterval(reload, 4000) : undefined;
    return () => {
      document.removeEventListener('visibilitychange', onVisible);
      if (timer) clearInterval(timer);
    };
  }, [inProgress, reload]);

  if (error && !data) return <ErrorNote error={error} onRetry={reload} />;
  if (!data) return <Skeleton />;

  const { totals, review } = data;
  const reviewedCount = review.confirmed + review.corrected + review.rejected;
  const reviewedShare = totals.events ? reviewedCount / totals.events : null;
  const segments: Segment[] = [
    { key: 'confirmed', name: 'Confirmed', icon: '✓', count: review.confirmed, fill: 'var(--viz-good)', ink: '#ffffff' },
    { key: 'corrected', name: 'Edited', icon: '✎', count: review.corrected, fill: 'var(--viz-warn)', ink: '#0b0b0b' },
    { key: 'rejected', name: 'Rejected', icon: '✕', count: review.rejected, fill: 'var(--viz-crit)', ink: '#ffffff' },
    { key: 'unreviewed', name: 'Not reviewed', icon: '○', count: review.unreviewed, fill: 'var(--viz-neutral)', ink: 'var(--viz-neutral-ink)' },
  ];

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-medium tracking-tight">{greeting()}, {user?.name.split(' ')[0]}</h1>
          <p className="mt-1 text-sm text-muted">Here is where your cases stand.</p>
        </div>
        <Link href="/cases" className="inline-flex h-10 items-center rounded-lg bg-accent px-4 text-sm font-medium text-accent-fg hover:opacity-90">New case</Link>
      </div>

      {totals.cases === 0 ? (
        <Welcome />
      ) : (
        <>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
            <StatTile label="Cases" value={totals.cases} sub={inProgress > 0 ? `${inProgress} processing now` : `${totals.documents} document${totals.documents === 1 ? '' : 's'}`} />
            <StatTile
              label="Pages read"
              value={totals.pagesRead}
              sub={totals.pagesNotAnalysed > 0 ? `⚠ ${totals.pagesNotAnalysed} not analysed` : `of ${totals.pages} · avg OCR confidence ${pct(totals.avgConfidence)}`}
              tone={totals.pagesNotAnalysed > 0 ? 'bad' : 'muted'}
            />
            <StatTile label="Events extracted" value={totals.events} sub={`${totals.verifiedEvents} verified`} />
            <StatTile
              label="Verified"
              value={pct(totals.verifiedRate)}
              sub={totals.unverifiedEvents > 0 ? `⚠ ${totals.unverifiedEvents} not verified` : totals.events ? '✓ every quote found' : 'No events yet'}
              tone={totals.unverifiedEvents > 0 ? 'bad' : totals.events ? 'ok' : 'muted'}
            />
            <StatTile label="Reviewed" value={pct(reviewedShare)} sub={totals.events ? `${review.unreviewed} left to review` : 'No events yet'} />
          </div>

          <div className="grid gap-4 lg:grid-cols-3">
            <ChartCard
              className="lg:col-span-2"
              title="Events extracted per day"
              subtitle="Last 14 days"
              chart={<ColumnChart data={data.eventsPerDay} unit="event" />}
              table={<ColumnTable data={data.eventsPerDay} unit="event" />}
            />
            <ChartCard
              title="Review progress"
              subtitle={totals.events ? `${reviewedCount} of ${totals.events} events reviewed` : 'Nothing to review yet'}
              chart={<SegmentedBar segments={segments} />}
              table={<SegmentTable segments={segments} />}
            />
          </div>

          <div className="grid gap-4 lg:grid-cols-3">
            <ChartCard
              className="lg:col-span-2"
              title="Events by type"
              subtitle="What the records describe"
              chart={<RankedBars data={data.eventsByType} />}
              table={<RankedTable data={data.eventsByType} />}
            />
            <Card title="Needs attention" description="Worth a look before you rely on the timeline">
              <AttentionList items={data.attention} />
            </Card>
          </div>

          <Card title="Recent cases" actions={<Link href="/cases" className="text-sm font-medium text-accent hover:underline">View all</Link>}>
            <RecentCases cases={data.recentCases} />
          </Card>
        </>
      )}
    </div>
  );
}
