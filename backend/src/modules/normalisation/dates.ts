import { toAsciiDigits } from '../../shared/indic/text.ts';

// Turns dates and times as written in Indian medical records into sortable ISO values.
// Rules that matter for a medical-legal timeline:
// - Day comes first (DD/MM) unless the numbers make that impossible.
// - A 12-hour time with no AM/PM marker is NOT guessed: it is kept but flagged ambiguous,
//   because a 12-hour error invents a monitoring gap or a conflict that is not there.
// - Hindi time-of-day words (सुबह, दोपहर, शाम, रात) DO settle AM/PM, so they are used.
// - Anything filled in rather than read (a missing year, a date taken from the page header,
//   "POD 2" counted from the operation) is marked as inferred, with a note saying how.

export type Precision = 'minute' | 'hour' | 'part_of_day' | 'day' | 'month';

export interface ParsedDate {
  /** "2026-03-12" or "2026-03-12T22:00:00+05:30" (IST). Null when no date could be read. */
  iso: string | null;
  precision: Precision | null;
  basis: 'stated' | 'inferred' | null;
  /** Why the value is inferred or uncertain, in plain words. */
  note: string | null;
}

export interface DateContext {
  /** The year most dates in this case are in; used when a date has no year. */
  anchorYear?: number;
  /** ISO day of the operation, for "POD 2" style dates. */
  procedureDay?: string | null;
  /** ISO day of admission, for "Day 3 of admission". */
  admissionDay?: string | null;
}

const NONE: ParsedDate = { iso: null, precision: null, basis: null, note: null };

const MONTHS: Record<string, number> = {
  jan: 1, january: 1, feb: 2, february: 2, mar: 3, march: 3, apr: 4, april: 4, may: 5, jun: 6, june: 6,
  jul: 7, july: 7, aug: 8, august: 8, sep: 9, sept: 9, september: 9, oct: 10, october: 10, nov: 11, november: 11,
  dec: 12, december: 12,
  'जनवरी': 1, 'फरवरी': 2, 'फ़रवरी': 2, 'मार्च': 3, 'अप्रैल': 4, 'मई': 5, 'जून': 6, 'जुलाई': 7, 'अगस्त': 8,
  'सितंबर': 9, 'सितम्बर': 9, 'अक्टूबर': 10, 'अक्तूबर': 10, 'नवंबर': 11, 'नवम्बर': 11, 'दिसंबर': 12, 'दिसम्बर': 12,
};
const MONTH_RE = Object.keys(MONTHS).sort((a, b) => b.length - a.length).join('|');

const pad = (n: number) => String(n).padStart(2, '0');
const daysIn = (y: number, m: number) => new Date(Date.UTC(y, m, 0)).getUTCDate();
const fullYear = (y: number) => (y >= 100 ? y : y <= 50 ? 2000 + y : 1900 + y);

function validDay(y: number, m: number, d: number): boolean {
  return y >= 1950 && y <= 2100 && m >= 1 && m <= 12 && d >= 1 && d <= daysIn(y, m);
}

export function addDays(isoDay: string, n: number): string {
  const t = new Date(`${isoDay.slice(0, 10)}T00:00:00Z`).getTime() + n * 86_400_000;
  return new Date(t).toISOString().slice(0, 10);
}

interface DayResult { y: number; m: number; d: number; yearInferred: boolean }

/** Find a calendar day in the text. */
function findDay(s: string, anchorYear?: number): DayResult | null {
  // 2026-03-12
  let m = /\b(\d{4})-(\d{1,2})-(\d{1,2})\b/.exec(s);
  if (m) {
    const [y, mo, d] = [+m[1]!, +m[2]!, +m[3]!];
    if (validDay(y, mo, d)) return { y, m: mo, d, yearInferred: false };
  }
  // 12/03/2026, 12-3-26, 12.03.2026, 26 / 10 / 18
  m = /\b(\d{1,2})\s*[/.\-]\s*(\d{1,2})\s*[/.\-]\s*(\d{2,4})\b/.exec(s);
  if (m) {
    let [a, b] = [+m[1]!, +m[2]!];
    const y = fullYear(+m[3]!);
    if (a <= 12 && b > 12) [a, b] = [b, a]; // only possible as MM/DD
    if (validDay(y, b, a)) return { y, m: b, d: a, yearInferred: false };
  }
  // 12 March 2026, 12th Mar, 12 मार्च 2026
  m = new RegExp(`\\b(\\d{1,2})(?:st|nd|rd|th)?\\s*(?:of\\s+)?(${MONTH_RE})\\.?,?\\s*(\\d{2,4})?`, 'i').exec(s);
  if (m) {
    const d = +m[1]!;
    const mo = MONTHS[m[2]!.toLowerCase()]!;
    const y = m[3] ? fullYear(+m[3]) : anchorYear;
    if (y && validDay(y, mo, d)) return { y, m: mo, d, yearInferred: !m[3] };
  }
  // March 12, 2026
  m = new RegExp(`\\b(${MONTH_RE})\\.?\\s+(\\d{1,2})(?:st|nd|rd|th)?,?\\s*(\\d{4})?`, 'i').exec(s);
  if (m) {
    const mo = MONTHS[m[1]!.toLowerCase()]!;
    const d = +m[2]!;
    const y = m[3] ? +m[3] : anchorYear;
    if (y && validDay(y, mo, d)) return { y, m: mo, d, yearInferred: !m[3] };
  }
  // 12/3 (no year) - day first
  m = /\b(\d{1,2})\s*[/.]\s*(\d{1,2})\b(?!\s*[/.\-]\s*\d)/.exec(s);
  if (m && anchorYear) {
    const [d, mo] = [+m[1]!, +m[2]!];
    if (validDay(anchorYear, mo, d)) return { y: anchorYear, m: mo, d, yearInferred: true };
  }
  return null;
}

interface TimeResult { h: number; min: number; precision: Precision; ambiguous: boolean; note?: string }

const PART_OF_DAY: [RegExp, (h: number) => number, string][] = [
  [/सुबह|प्रातः|morning|\bam\b|a\.m\./i, (h) => (h === 12 ? 0 : h), 'morning'],
  [/दोपहर|afternoon|noon/i, (h) => (h < 12 ? h + 12 : h), 'afternoon'],
  [/शाम|evening/i, (h) => (h < 12 ? h + 12 : h), 'evening'],
  [/रात|night|\bpm\b|p\.m\./i, (h) => (h >= 5 && h < 12 ? h + 12 : h === 12 ? 0 : h), 'night'],
];

/** Find a time of day. */
function findTime(s: string): TimeResult | null {
  // 2200 hrs, 22:00 hrs, 0930 h
  let m = /\b([01]?\d|2[0-3]):?([0-5]\d)\s*(?:hrs?|hours|h)\b/i.exec(s);
  if (m) return { h: +m[1]!, min: +m[2]!, precision: 'minute', ambiguous: false };

  // 10:30 am / 10:30 PM / 10.30 pm
  m = /\b(1[0-2]|0?\d)[:.]([0-5]\d)\s*(am|pm|a\.m\.|p\.m\.)/i.exec(s);
  if (m) {
    let h = +m[1]! % 12;
    if (/p/i.test(m[3]!)) h += 12;
    return { h, min: +m[2]!, precision: 'minute', ambiguous: false };
  }
  // 10 pm
  m = /\b(1[0-2]|0?\d)\s*(am|pm|a\.m\.|p\.m\.)/i.exec(s);
  if (m) {
    let h = +m[1]! % 12;
    if (/p/i.test(m[2]!)) h += 12;
    return { h, min: 0, precision: 'hour', ambiguous: false };
  }
  // रात 10 बजे, सुबह 6 बजे: the time-of-day word settles AM/PM
  m = /(\d{1,2})(?:[:.](\d{2}))?\s*बजे/.exec(s);
  if (m) {
    const h = +m[1]!;
    for (const [re, to, word] of PART_OF_DAY) {
      if (re.test(s)) return { h: to(h), min: m[2] ? +m[2] : 0, precision: m[2] ? 'minute' : 'hour', ambiguous: false, note: `time read with "${word}"` };
    }
    return { h, min: m[2] ? +m[2] : 0, precision: 'hour', ambiguous: h <= 12, note: h <= 12 ? 'AM or PM not written' : undefined };
  }
  // 22:00 (24-hour) or 10:30 (could be AM or PM)
  m = /\b([01]?\d|2[0-3]):([0-5]\d)\b/.exec(s);
  if (m) {
    const h = +m[1]!;
    return { h, min: +m[2]!, precision: 'minute', ambiguous: h >= 1 && h <= 12, note: h >= 1 && h <= 12 ? 'AM or PM not written' : undefined };
  }
  // A time-of-day word alone ("night", "रात में"): a band, not a time
  for (const [re, , word] of PART_OF_DAY) {
    if (re.test(s) && !/\b(am|pm)\b/i.test(s)) {
      const rep = word === 'morning' ? 8 : word === 'afternoon' ? 14 : word === 'evening' ? 18 : 22;
      return { h: rep, min: 0, precision: 'part_of_day', ambiguous: false, note: `only "${word}" is written` };
    }
  }
  return null;
}

/** Read one date/time as written. */
export function parseRawDate(raw: string | null | undefined, ctx: DateContext = {}): ParsedDate {
  if (!raw || !raw.trim()) return NONE;
  const s = toAsciiDigits(raw)
    .replace(/[।|]/g, '/') // OCR often reads "/" in handwriting as a danda or a bar
    .replace(/\s+/g, ' ')
    .trim();

  const notes: string[] = [];
  let day: DayResult | null = findDay(s, ctx.anchorYear);
  let inferred = false;

  // Relative dates: POD 2, post-op day 2, ऑपरेशन के 2 दिन बाद, Day 3 of admission
  if (!day) {
    const pod = /\b(?:POD|post[- ]?op(?:erative)? day)\s*[-:]?\s*(\d{1,2})\b/i.exec(s) ?? /ऑपरेशन के\s*(\d{1,2})\s*दिन बाद/.exec(s);
    const doa = /\bday\s*(\d{1,2})\s*(?:of admission|of stay)\b/i.exec(s);
    const base = pod ? ctx.procedureDay : doa ? ctx.admissionDay : null;
    const n = pod ? +pod[1]! : doa ? +doa[1]! - 1 : NaN;
    if (base && Number.isFinite(n)) {
      const iso = addDays(base, n);
      day = { y: +iso.slice(0, 4), m: +iso.slice(5, 7), d: +iso.slice(8, 10), yearInferred: false };
      inferred = true;
      notes.push(pod ? `counted ${n} day(s) from the operation` : `counted from admission`);
    }
  }

  if (!day) return NONE;
  if (day.yearInferred) {
    inferred = true;
    notes.push('year not written; taken from the rest of the case');
  }
  const dateIso = `${day.y}-${pad(day.m)}-${pad(day.d)}`;
  const time = findTime(s);
  if (!time) return { iso: dateIso, precision: 'day', basis: inferred ? 'inferred' : 'stated', note: notes.join('; ') || null };

  if (time.note) notes.push(time.note);
  if (time.precision === 'part_of_day') inferred = true;
  return {
    iso: `${dateIso}T${pad(time.h)}:${pad(time.min)}:00+05:30`,
    precision: time.precision,
    basis: inferred ? 'inferred' : 'stated',
    note: notes.join('; ') || null,
  };
}

/** Explicit 4-digit or 2-digit years in a date string, to work out the case's anchor year. */
export function yearsIn(raw: string | null | undefined): number[] {
  if (!raw) return [];
  const day = findDay(toAsciiDigits(raw).replace(/[।|]/g, '/'), undefined);
  return day && !day.yearInferred ? [day.y] : [];
}
