'use client';

import { useEffect, useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import { ErrorNote } from '@/components/ui/card';
import { CONFIDENCE_LABEL, confidenceLevel } from '@/lib/confidence';
import type { DocumentSummary, OcrBlock } from '@/lib/api/types';
import { revealWithin } from '@/lib/dom';
import { useOriginalUrl } from './use-original-url';

const ZOOMS = [1, 1.5, 2, 3];
const area = (b: OcrBlock) => (b.bbox_norm ? (b.bbox_norm[2] - b.bbox_norm[0]) * (b.bbox_norm[3] - b.bbox_norm[1]) : 0);

const LEVEL_BOX = {
  low: 'border-bad bg-bad/15',
  medium: 'border-warn bg-warn/15',
  high: 'border-ok bg-ok/10',
};

/**
 * The original page, large, with every OCR block drawn on it as a box. Boxes are placed in
 * percentages of the page, so they stay aligned at any zoom. Cited blocks are highlighted.
 * Only images get boxes: a PDF is shown in the browser's own viewer, which cannot be drawn on.
 */
export function PageStage({ doc, page, blocks, highlight, onBlockClick, className = '' }: {
  doc: DocumentSummary;
  page: number;
  blocks: OcrBlock[] | undefined;
  highlight: ReadonlySet<string>;
  onBlockClick?: (blockId: string) => void;
  className?: string;
}) {
  const [zoom, setZoom] = useState(1);
  const [showBoxes, setShowBoxes] = useState(true);
  const [showConfidence, setShowConfidence] = useState(false);
  const [loadedUrl, setLoadedUrl] = useState<string>();
  const original = useOriginalUrl(doc.id);
  const isPdf = doc.mime === 'application/pdf';

  // Small boxes are drawn last so they sit on top of the big ones that contain them.
  const boxed = useMemo(() => (blocks ?? []).filter((b) => b.bbox_norm).sort((a, b) => area(b) - area(a)), [blocks]);
  const missingBoxes = blocks != null && blocks.length > 0 && boxed.length === 0;

  // Bring the first cited box into view, inside the stage only, once the image has laid out.
  const firstCited = boxed.find((b) => highlight.has(b.block_id))?.block_id;
  const imageReady = original?.url != null && loadedUrl === original.url;
  useEffect(() => {
    if (firstCited && imageReady) revealWithin(document.getElementById(`box-${firstCited}`), 'center');
  }, [firstCited, imageReady, zoom, page]);

  return (
    <div className={`flex min-h-0 flex-col gap-2 ${className}`}>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 text-[13px]">
        {!isPdf && (
          <div className="flex items-center gap-1" role="group" aria-label="Zoom">
            <Button variant="secondary" size="sm" disabled={zoom <= ZOOMS[0]} onClick={() => setZoom(ZOOMS[Math.max(0, ZOOMS.indexOf(zoom) - 1)])} aria-label="Zoom out">−</Button>
            <span className="w-11 text-center tabular-nums">{Math.round(zoom * 100)}%</span>
            <Button variant="secondary" size="sm" disabled={zoom >= ZOOMS[ZOOMS.length - 1]} onClick={() => setZoom(ZOOMS[Math.min(ZOOMS.length - 1, ZOOMS.indexOf(zoom) + 1)])} aria-label="Zoom in">+</Button>
          </div>
        )}
        {!isPdf && (
          <>
            <label className="flex items-center gap-1.5 text-muted">
              <input type="checkbox" checked={showBoxes} onChange={(e) => setShowBoxes(e.target.checked)} /> Text boxes
            </label>
            <label className="flex items-center gap-1.5 text-muted" title="Sarvam's own score for each block. A hint to look closely, not a probability.">
              <input type="checkbox" checked={showConfidence} onChange={(e) => setShowConfidence(e.target.checked)} /> OCR confidence
            </label>
            {showConfidence && (
              <span className="flex items-center gap-2 text-xs text-muted">
                <span className="flex items-center gap-1"><i className="inline-block size-2.5 rounded-sm border border-bad bg-bad/25" /> low</span>
                <span className="flex items-center gap-1"><i className="inline-block size-2.5 rounded-sm border border-warn bg-warn/25" /> medium</span>
                <span className="flex items-center gap-1"><i className="inline-block size-2.5 rounded-sm border border-ok bg-ok/25" /> high</span>
              </span>
            )}
          </>
        )}
      </div>

      <div data-scroll-container className="min-h-0 flex-1 overflow-auto rounded-xl border border-line bg-surface-2">
        {!original ? (
          <div className="grid h-full min-h-48 place-items-center text-sm text-muted">Loading original…</div>
        ) : original.error ? (
          <div className="p-3"><ErrorNote error={new Error(`Could not load the original: ${original.error}`)} /></div>
        ) : isPdf ? (
          <iframe key={`${doc.id}-${page}`} src={`${original.url}#page=${page}`} title="Original document" className="size-full min-h-96 border-0" />
        ) : (
          <div className="relative mx-auto" style={{ width: `${zoom * 100}%` }}>
            {/* eslint-disable-next-line @next/next/no-img-element -- a blob: URL, so next/image cannot optimise it */}
            <img src={original.url} alt="Original document" draggable={false} onLoad={() => setLoadedUrl(original.url)} className="block h-auto w-full select-none" />
            {boxed.map((b) => {
              const [x1, y1, x2, y2] = b.bbox_norm!;
              const cited = highlight.has(b.block_id);
              const level = confidenceLevel(b.confidence);
              const tone = showConfidence && level ? LEVEL_BOX[level] : 'border-accent bg-accent/10';
              const label = `${b.tag ?? 'text'}${b.confidence != null ? ` · ${Math.round(b.confidence * 100)}%` : ''}: ${b.text.replace(/\s+/g, ' ').slice(0, 90)}`;
              return (
                <button
                  key={b.block_id}
                  id={`box-${b.block_id}`}
                  type="button"
                  title={label}
                  aria-label={label}
                  onClick={() => onBlockClick?.(b.block_id)}
                  style={{ left: `${x1 * 100}%`, top: `${y1 * 100}%`, width: `${(x2 - x1) * 100}%`, height: `${(y2 - y1) * 100}%` }}
                  className={`absolute rounded-sm transition-colors ${
                    cited
                      // A bright outline with only a faint tint: the handwriting underneath must stay legible.
                      ? 'z-20 border-2 border-[#f59e0b] bg-[#f59e0b]/10 shadow-[0_0_0_3px_rgba(245,158,11,0.35)]'
                      : showBoxes || showConfidence
                        ? `z-10 border ${tone} hover:bg-accent/25`
                        : 'z-10 border border-transparent hover:border-accent hover:bg-accent/15'
                  }`}
                />
              );
            })}
          </div>
        )}
      </div>

      {missingBoxes && !isPdf && (
        <p className="text-xs text-warn">This page was read before text boxes were captured, so nothing can be drawn on it. Run <code>npm run refresh:ocr</code> in /backend (free), or process the case again.</p>
      )}
      {isPdf && <p className="text-xs text-muted">PDF pages are shown in the browser&apos;s viewer, so text boxes are only drawn for image files (JPG / PNG).</p>}
      {showConfidence && !isPdf && (
        <p className="text-xs text-muted">{CONFIDENCE_LABEL.low}: look closely at the original. Handwriting usually scores lower than print.</p>
      )}
    </div>
  );
}
