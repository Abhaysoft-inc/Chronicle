'use client';

import { Pill } from '@/components/ui/pill';
import type { OcrBlock } from '@/lib/api/types';
import { confidenceLevel } from '@/lib/confidence';

const TONE = { low: 'bad', medium: 'warn', high: 'ok' } as const;

/** What OCR read from the page, block by block, in reading order. Click one to find it on the page. */
export function BlockList({ blocks, language, highlight, onSelect }: {
  blocks: OcrBlock[];
  language: string | null;
  highlight: ReadonlySet<string>;
  onSelect: (blockId: string) => void;
}) {
  if (!blocks.length) return <p className="p-4 text-center text-sm text-muted">No text was read from this page.</p>;
  return (
    <ol className="flex flex-col gap-1">
      {blocks.map((b, i) => {
        const level = confidenceLevel(b.confidence);
        const active = highlight.has(b.block_id);
        return (
          <li key={b.block_id}>
            <button
              type="button"
              id={`blk-${b.block_id}`}
              onClick={() => onSelect(b.block_id)}
              className={`block w-full rounded-lg px-3 py-2 text-left ${active ? 'bg-hl ring-1 ring-warn/50' : 'hover:bg-surface-2'}`}
            >
              <span className="mb-1 flex items-center gap-2 text-xs text-muted">
                <span className="font-mono">{i + 1}</span>
                {b.tag && <span>{b.tag.replace('-', ' ')}</span>}
                {level && b.confidence != null && <Pill tone={TONE[level]}>{Math.round(b.confidence * 100)}%</Pill>}
              </span>
              <span lang={language ?? undefined} className="indic block text-[15px] whitespace-pre-wrap">{b.text}</span>
            </button>
          </li>
        );
      })}
    </ol>
  );
}
