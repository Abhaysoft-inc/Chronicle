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
  normalise: { title: 'Order', hint: 'Date every event, link duplicates' },
  facts: { title: 'Facts', hint: 'Patient, hospital, doctors, diagnoses' },
  findings: { title: 'Check', hint: 'Flag gaps, conflicts, possible deviations' },
  brief: { title: 'Brief', hint: 'Compile the expert brief' },
};

export function stageTone(status: string): Tone {
  return status === 'done' ? 'ok' : status === 'failed' ? 'bad' : status === 'running' ? 'info' : 'neutral';
}

/** How an event's date reads in the timeline: "Thu, 12 Mar 2026" or "12 Mar 2026, 22:00". No timezone shift. */
export function formatEventDate(iso: string | null, precision: string | null): string | null {
  if (!iso) return null;
  const [y, m, d] = [Number(iso.slice(0, 4)), Number(iso.slice(5, 7)), Number(iso.slice(8, 10))];
  const day = new Date(Date.UTC(y, m - 1, d));
  if (precision === 'day' || iso.length <= 10) {
    return day.toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });
  }
  const time = iso.slice(11, 16);
  if (precision === 'part_of_day') {
    const h = Number(time.slice(0, 2));
    return `${day.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' })}, ${h < 12 ? 'morning' : h < 16 ? 'afternoon' : h < 20 ? 'evening' : 'night'}`;
  }
  return `${day.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' })}, ${time}`;
}

/** Group heading for a day: "Thursday, 12 March 2026". */
export function formatDayHeading(isoDay: string): string {
  const [y, m, d] = [Number(isoDay.slice(0, 4)), Number(isoDay.slice(5, 7)), Number(isoDay.slice(8, 10))];
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' });
}
