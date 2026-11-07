import type { ScriptName } from './languages.ts';

// ---------- digits ----------

// Zero digit code point of each script's decimal block.
const DIGIT_BASES = [
  0x0660, // Arabic-Indic
  0x06f0, // Extended Arabic-Indic (Urdu, Sindhi, Kashmiri)
  0x0966, // Devanagari
  0x09e6, // Bengali
  0x0a66, // Gurmukhi
  0x0ae6, // Gujarati
  0x0b66, // Odia
  0x0be6, // Tamil
  0x0c66, // Telugu
  0x0ce6, // Kannada
  0x0d66, // Malayalam
  0x1c40, // Ol Chiki
];

/** Map native digits (१२, ১২, ௧௨ ...) to ASCII 0-9. Everything else is untouched. */
export function toAsciiDigits(s: string): string {
  let out = '';
  for (const ch of s) {
    const cp = ch.codePointAt(0)!;
    let mapped: string | null = null;
    for (const base of DIGIT_BASES) {
      if (cp >= base && cp <= base + 9) {
        mapped = String(cp - base);
        break;
      }
    }
    out += mapped ?? ch;
  }
  return out;
}

// ---------- normalisation ----------

/**
 * Canonical form for comparing Indic text.
 * - NFC (this also folds precomposed nukta letters like U+0958 into base + nukta)
 * - drops zero-width joiner / non-joiner / BOM and soft hyphen
 * - unifies danda variants
 * - collapses whitespace, lowercases Latin
 */
export function normalizeIndic(s: string): string {
  return s
    .normalize('NFC')
    .replace(/[​‌‍⁠﻿­]/g, '')
    .replace(/[।॥|]/g, '।')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

const segmenter = new Intl.Segmenter('hi', { granularity: 'grapheme' });

/** Split into user-perceived characters, so a conjunct or vowel sign stays with its base. */
export function graphemes(s: string): string[] {
  return Array.from(segmenter.segment(s), (x) => x.segment);
}

// ---------- scripts ----------

const SCRIPT_RANGES: [ScriptName, number, number][] = [
  ['Devanagari', 0x0900, 0x097f],
  ['Devanagari', 0xa8e0, 0xa8ff],
  ['Bengali', 0x0980, 0x09ff],
  ['Gurmukhi', 0x0a00, 0x0a7f],
  ['Gujarati', 0x0a80, 0x0aff],
  ['Odia', 0x0b00, 0x0b7f],
  ['Tamil', 0x0b80, 0x0bff],
  ['Telugu', 0x0c00, 0x0c7f],
  ['Kannada', 0x0c80, 0x0cff],
  ['Malayalam', 0x0d00, 0x0d7f],
  ['Arabic', 0x0600, 0x06ff],
  ['Arabic', 0x0750, 0x077f],
  ['Arabic', 0xfb50, 0xfdff],
  ['Arabic', 0xfe70, 0xfeff],
  ['OlChiki', 0x1c50, 0x1c7f],
  ['MeeteiMayek', 0xabc0, 0xabff],
  ['Latin', 0x0041, 0x005a],
  ['Latin', 0x0061, 0x007a],
  ['Latin', 0x00c0, 0x024f],
];

export function scriptOf(cp: number): ScriptName | null {
  for (const [name, lo, hi] of SCRIPT_RANGES) {
    if (cp >= lo && cp <= hi) return name;
  }
  return null;
}

export interface ScriptProfile {
  /** Most common script among letters, or null if there are no letters. */
  dominant: ScriptName | null;
  /** Share of letters in the dominant script (0..1). */
  share: number;
  counts: Partial<Record<ScriptName, number>>;
  letters: number;
}

/** Count letters per script. Digits, punctuation and spaces are ignored. */
export function scriptProfile(text: string): ScriptProfile {
  const counts: Partial<Record<ScriptName, number>> = {};
  let letters = 0;
  for (const ch of text) {
    const s = scriptOf(ch.codePointAt(0)!);
    if (!s) continue;
    // Skip native digits that fall inside letter blocks.
    if (/\p{Nd}/u.test(ch)) continue;
    counts[s] = (counts[s] ?? 0) + 1;
    letters++;
  }
  let dominant: ScriptName | null = null;
  let best = 0;
  for (const [s, n] of Object.entries(counts) as [ScriptName, number][]) {
    if (n > best) {
      best = n;
      dominant = s;
    }
  }
  return { dominant, share: letters ? best / letters : 0, counts, letters };
}

// ---------- quote matching ----------

const DIGIT_RUN = /\d+/g;

export function digitRuns(s: string): string[] {
  return toAsciiDigits(s).match(DIGIT_RUN) ?? [];
}

/**
 * Best approximate match of `needle` inside `hay` (Sellers' algorithm).
 * Works on graphemes. Returns similarity 0..1 where 1 means an exact substring.
 */
export function bestSubstringSimilarity(needle: string[], hay: string[]): number {
  const m = needle.length;
  const n = hay.length;
  if (m === 0) return 0;
  if (n === 0) return 0;
  let prev = new Array<number>(n + 1).fill(0); // D[0][j] = 0: match may start anywhere
  let cur = new Array<number>(n + 1).fill(0);
  for (let i = 1; i <= m; i++) {
    cur[0] = i;
    for (let j = 1; j <= n; j++) {
      const cost = needle[i - 1] === hay[j - 1] ? 0 : 1;
      cur[j] = Math.min(prev[j - 1]! + cost, prev[j]! + 1, cur[j - 1]! + 1);
    }
    [prev, cur] = [cur, prev];
  }
  let best = Infinity;
  for (let j = 0; j <= n; j++) best = Math.min(best, prev[j]!);
  return Math.max(0, 1 - best / m);
}

export type MatchResult =
  | { ok: true; score: number }
  | { ok: false; score: number; reason: 'empty_quote' | 'script_mismatch' | 'digit_mismatch' | 'low_similarity' };

/**
 * Check that an LLM-supplied quote really appears in the OCR text.
 * Digits must match EXACTLY (१० == 10, but 10 != 100); everything else may differ slightly.
 */
export function quoteMatches(quote: string, haystack: string, threshold = 0.85): MatchResult {
  const q = normalizeIndic(quote);
  const h = normalizeIndic(haystack);
  if (!q) return { ok: false, score: 0, reason: 'empty_quote' };

  // A quote rewritten in another script (e.g. romanised) is not the evidence.
  const qp = scriptProfile(q);
  const hp = scriptProfile(h);
  if (qp.dominant && hp.dominant && qp.dominant !== hp.dominant && qp.share >= 0.6 && hp.share >= 0.6) {
    return { ok: false, score: 0, reason: 'script_mismatch' };
  }

  // Every number in the quote must be present as a whole number in the source.
  const hayRuns = new Set(digitRuns(h));
  for (const run of digitRuns(q)) {
    if (!hayRuns.has(run)) return { ok: false, score: 0, reason: 'digit_mismatch' };
  }

  const qa = graphemes(toAsciiDigits(q));
  const ha = graphemes(toAsciiDigits(h));
  const score = bestSubstringSimilarity(qa, ha);
  return score >= threshold ? { ok: true, score } : { ok: false, score, reason: 'low_similarity' };
}
