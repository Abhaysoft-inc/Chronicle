'use client';

import { useState, type ReactNode } from 'react';

/**
 * A titled chart. Every chart has a "Table" view of the same numbers, so nothing depends on
 * colour, hovering, or being able to see the plot.
 */
export function ChartCard({ title, subtitle, chart, table, className = '' }: {
  title: string;
  subtitle?: string;
  chart: ReactNode;
  table: ReactNode;
  className?: string;
}) {
  const [view, setView] = useState<'chart' | 'table'>('chart');
  return (
    <section className={`flex flex-col rounded-xl border border-line bg-surface ${className}`}>
      <header className="flex items-start justify-between gap-3 px-5 pt-4">
        <div>
          <h2 className="text-sm font-semibold">{title}</h2>
          {subtitle && <p className="mt-0.5 text-xs text-muted">{subtitle}</p>}
        </div>
        <div role="group" aria-label={`${title}: view`} className="inline-flex shrink-0 rounded-lg border border-line p-0.5 text-xs">
          {(['chart', 'table'] as const).map((v) => (
            <button
              key={v}
              type="button"
              aria-pressed={view === v}
              onClick={() => setView(v)}
              className={`rounded-md px-2.5 py-1 font-medium capitalize ${view === v ? 'bg-surface-2 text-fg' : 'text-muted hover:text-fg'}`}
            >
              {v}
            </button>
          ))}
        </div>
      </header>
      <div className="flex-1 px-5 pt-4 pb-5">{view === 'chart' ? chart : table}</div>
    </section>
  );
}

/** A plain table for a chart's "Table" view. Numbers are right-aligned and tabular so they line up. */
export function DataTable({ columns, rows }: { columns: string[]; rows: (string | number)[][] }) {
  return (
    <div className="max-h-72 overflow-auto">
      <table className="w-full text-sm">
        <thead className="text-left text-xs text-muted">
          <tr>{columns.map((c, i) => <th key={c} className={`py-1.5 font-medium ${i > 0 ? 'text-right' : ''}`}>{c}</th>)}</tr>
        </thead>
        <tbody className="divide-y divide-line">
          {rows.map((r, i) => (
            <tr key={i}>{r.map((cell, j) => <td key={j} className={`py-1.5 ${j > 0 ? 'text-right tabular-nums' : ''}`}>{cell}</td>)}</tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
