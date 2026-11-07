/** "medication_administered" -> "Medication administered" */
export function humanize(s: string): string {
  const t = s.replace(/_/g, ' ').trim();
  return t.charAt(0).toUpperCase() + t.slice(1);
}

export function formatDate(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
}

const wordsOf = (s: string) => s.toLowerCase().replace(/[^\p{L}\p{N}\s]/gu, ' ').split(/\s+/).filter(Boolean);

/**
 * True when two strings say the same thing (e.g. an English quote and its "English translation").
 * Used to hide a redundant line rather than show the reader the same sentence twice.
 */
export function nearlySame(a: string, b: string): boolean {
  const x = wordsOf(a);
  const y = wordsOf(b);
  if (!x.length || !y.length) return false;
  const ys = new Set(y);
  const shared = new Set(x.filter((w) => ys.has(w))).size;
  return shared / Math.max(new Set(x).size, ys.size) >= 0.8;
}

/** Plain-language reason a cited quote failed verification. */
export function verifyReasonText(reason: string | null): string {
  if (!reason) return 'Not checked yet';
  if (reason.startsWith('block_not_found')) return 'The cited text block does not exist';
  if (reason.startsWith('block_on_other_page')) return 'The cited block is on a different page';
  switch (reason) {
    case 'low_similarity': return 'This quote was not found in the OCR text';
    case 'digit_mismatch': return 'A number in the quote does not match the OCR text';
    case 'script_mismatch': return 'The quote is in a different script from the page';
    case 'empty_quote': return 'No quote was given';
    case 'no_blocks_cited': return 'No source block was cited';
    default: return reason;
  }
}

export type Tone = 'neutral' | 'ok' | 'bad' | 'warn' | 'info';

export function caseStatusTone(status: string): Tone {
  switch (status) {
    case 'processed': return 'ok';
    case 'processed_with_warnings': return 'warn';
    case 'processing': return 'info';
    case 'failed':
    case 'interrupted': return 'bad';
    default: return 'neutral';
  }
}

export const STAGE_LABELS: Record<string, { title: string; hint: string }> = {
  ingest: { title: 'Prepare', hint: 'Split files into pages' },
  ocr: { title: 'Read', hint: 'Sarvam OCR reads every page' },
  extract: { title: 'Extract', hint: 'Find clinical events' },
  verify: { title: 'Verify', hint: 'Check each quote against the OCR text' },
};

export function stageTone(status: string): Tone {
  return status === 'done' ? 'ok' : status === 'failed' ? 'bad' : status === 'running' ? 'info' : 'neutral';
}
