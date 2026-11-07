'use client';

import { useCallback, useRef, useState, type ReactNode } from 'react';

interface Tip {
  x: number;
  y: number;
  value: string;
  label: string;
}

/**
 * One tooltip per chart. A mark shows it on hover AND on keyboard focus (same details), so a value
 * is never only reachable with a mouse. The text is rendered by React, so labels that came from the
 * API cannot inject markup. Attach `containerRef` to the chart's relatively-positioned wrapper.
 */
export function useChartTooltip() {
  const containerRef = useRef<HTMLDivElement>(null);
  const [tip, setTip] = useState<Tip | null>(null);

  const show = useCallback((el: HTMLElement, value: string, label: string) => {
    const box = containerRef.current?.getBoundingClientRect();
    if (!box) return;
    const r = el.getBoundingClientRect();
    setTip({ x: r.left + r.width / 2 - box.left, y: r.top - box.top, value, label });
  }, []);
  const hide = useCallback(() => setTip(null), []);

  /** Spread onto a mark: `<button {...bind('12', 'Nov 7')}>` */
  const bind = (value: string, label: string) => ({
    onPointerEnter: (e: React.PointerEvent<HTMLElement>) => show(e.currentTarget, value, label),
    onFocus: (e: React.FocusEvent<HTMLElement>) => show(e.currentTarget, value, label),
    onPointerLeave: hide,
    onBlur: hide,
  });

  const tooltip: ReactNode = tip && (
    <div
      role="tooltip"
      className="pointer-events-none absolute z-20 -translate-x-1/2 -translate-y-full rounded-lg border border-line bg-surface px-2.5 py-1.5 text-center whitespace-nowrap shadow-lg"
      style={{ left: tip.x, top: tip.y - 6 }}
    >
      <p className="text-sm font-semibold">{tip.value}</p>
      <p className="text-xs text-muted">{tip.label}</p>
    </div>
  );

  return { containerRef, bind, tooltip };
}
