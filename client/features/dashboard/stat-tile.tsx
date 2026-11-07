import type { ReactNode } from 'react';

/** A headline number with a plain sentence under it. The number is the chart; no plot needed. */
export function StatTile({ label, value, sub, tone = 'muted' }: {
  label: string;
  value: ReactNode;
  sub?: ReactNode;
  /** Colour of the sub line. A problem is always written out ("⚠ 2 not verified"), never just coloured. */
  tone?: 'muted' | 'bad' | 'ok';
}) {
  return (
    <div className="rounded-xl border border-line bg-surface p-4">
      <p className="text-[13px] text-muted">{label}</p>
      {/* proportional (not tabular) figures: big standalone numbers look loose with equal-width digits */}
      <p className="mt-1.5 text-3xl leading-none font-semibold tracking-tight">{value}</p>
      {sub && <p className={`mt-2 text-xs ${tone === 'bad' ? 'font-medium text-bad' : tone === 'ok' ? 'font-medium text-ok' : 'text-muted'}`}>{sub}</p>}
    </div>
  );
}
