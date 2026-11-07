import type { Ctx } from '../../core/context.ts';
import { all, run, tx } from '../../core/db/index.ts';
import { normalizeIndic } from '../../shared/indic/text.ts';
import { parseRawDate, yearsIn, type DateContext, type ParsedDate } from './dates.ts';

interface EventRow {
  id: string;
  type: string;
  raw_date: string | null;
  corrected_json: string | null;
  summary_en: string;
  origin: string;
}
interface SourceRow { event_id: string; document_id: string; page_no: number; block_ids_json: string }

const DATE_LABEL = /\b(date|dt|dated)\b|दिनांक|तारीख|दि\./i;

/** Word-set overlap, 0..1: how much two short sentences say the same thing. */
export function similarity(a: string, b: string): number {
  const words = (s: string) => new Set(normalizeIndic(s).replace(/[^\p{L}\p{N}\s]/gu, ' ').split(/\s+/).filter((w) => w.length > 2));
  const x = words(a);
  const y = words(b);
  if (!x.size || !y.size) return 0;
  let shared = 0;
  for (const w of x) if (y.has(w)) shared++;
  return shared / Math.max(x.size, y.size);
}

/**
 * The date written on a page (a certificate's "Dt. 11/06/2020", a report's header). Events on that
 * page that carry no date of their own inherit it, marked as inferred.
 */
function pageDates(ctx: Ctx, caseId: string, anchorYear: number | undefined): Map<string, ParsedDate> {
  const blocks = all<{ document_id: string; page_no: number; text: string }>(
    ctx.db,
    `SELECT b.document_id, b.page_no, b.text FROM ocr_blocks b JOIN documents d ON d.id = b.document_id
     WHERE d.case_id = ? ORDER BY b.document_id, b.page_no, b.seq`,
    caseId,
  );
  const byPage = new Map<string, string[]>();
  for (const b of blocks) {
    const k = `${b.document_id}:${b.page_no}`;
    if (!byPage.has(k)) byPage.set(k, []);
    byPage.get(k)!.push(b.text);
  }
  const out = new Map<string, ParsedDate>();
  for (const [k, texts] of byPage) {
    // A block that says "Date" / "दिनांक" first; otherwise the first block that holds any date.
    const ordered = [...texts.filter((t) => DATE_LABEL.test(t)), ...texts.filter((t) => !DATE_LABEL.test(t))];
    for (const t of ordered) {
      const p = parseRawDate(t, { anchorYear });
      if (p.iso) {
        out.set(k, { iso: p.iso.slice(0, 10), precision: 'day', basis: 'inferred', note: 'no date on the entry itself; taken from the date written on the page' });
        break;
      }
    }
  }
  return out;
}

/**
 * Pipeline stage: give every event a sortable date, and link repeated events to their first copy.
 * Recomputed in full each run (cheap), so a reviewer's corrected date is always honoured.
 */
export function normaliseCase(ctx: Ctx, caseId: string): { dated: number; undated: number; duplicates: number } {
  const events = all<EventRow>(
    ctx.db,
    'SELECT id, type, raw_date, corrected_json, summary_en, origin FROM events WHERE case_id = ? ORDER BY seq',
    caseId,
  );
  const sources = all<SourceRow>(
    ctx.db,
    `SELECT s.event_id, s.document_id, s.page_no, s.block_ids_json FROM event_sources s
     JOIN events e ON e.id = s.event_id WHERE e.case_id = ? ORDER BY s.id`,
    caseId,
  );
  const sourcesOf = new Map<string, SourceRow[]>();
  for (const s of sources) {
    if (!sourcesOf.has(s.event_id)) sourcesOf.set(s.event_id, []);
    sourcesOf.get(s.event_id)!.push(s);
  }
  const rawOf = (e: EventRow): string | null => {
    const corrected = e.corrected_json ? (JSON.parse(e.corrected_json) as { raw_date?: string | null }) : null;
    return corrected && 'raw_date' in corrected ? (corrected.raw_date ?? null) : e.raw_date;
  };

  // The case's usual year, so "12/3" without a year still sorts into the right place.
  const years = events.flatMap((e) => yearsIn(rawOf(e)));
  const counts = new Map<number, number>();
  for (const y of years) counts.set(y, (counts.get(y) ?? 0) + 1);
  const anchorYear = [...counts].sort((a, b) => b[1] - a[1])[0]?.[0];

  const pages = pageDates(ctx, caseId, anchorYear);

  // First pass with explicit dates only, to find the operation and admission days for "POD 2".
  const ctx0: DateContext = { anchorYear };
  const firstDayOf = (type: string) =>
    events.filter((e) => e.type === type).map((e) => parseRawDate(rawOf(e), ctx0).iso).find(Boolean)?.slice(0, 10) ?? null;
  const dctx: DateContext = { anchorYear, procedureDay: firstDayOf('procedure'), admissionDay: firstDayOf('admission') };

  let dated = 0;
  let duplicates = 0;
  const firstBySignature = new Map<string, string>();
  const kept: { id: string; type: string; day: string | null; summary: string }[] = [];

  tx(ctx.db, () => {
    for (const e of events) {
      let p = parseRawDate(rawOf(e), dctx);
      const srcs = sourcesOf.get(e.id) ?? [];
      if (!p.iso && srcs[0]) p = pages.get(`${srcs[0].document_id}:${srcs[0].page_no}`) ?? p;
      if (p.iso) dated++;

      // Duplicates: the same kind of event citing the very same text, or saying the same thing on
      // the same day. Manual events are never folded away.
      let duplicateOf: string | null = null;
      if (e.origin !== 'manual') {
        const signature = srcs.length
          ? `${e.type}|${srcs.map((s) => `${s.document_id}:${s.page_no}:${(JSON.parse(s.block_ids_json) as string[]).sort().join(',')}`).sort().join(';')}`
          : null;
        if (signature && firstBySignature.has(signature)) duplicateOf = firstBySignature.get(signature)!;
        else {
          const day = p.iso?.slice(0, 10) ?? null;
          const twin = kept.find((k) => k.type === e.type && k.day && k.day === day && similarity(k.summary, e.summary_en) >= 0.8);
          if (twin) duplicateOf = twin.id;
        }
        if (signature && !firstBySignature.has(signature)) firstBySignature.set(signature, duplicateOf ?? e.id);
        if (!duplicateOf) kept.push({ id: e.id, type: e.type, day: p.iso?.slice(0, 10) ?? null, summary: e.summary_en });
      }
      if (duplicateOf) duplicates++;

      run(
        ctx.db,
        'UPDATE events SET occurred_at_iso = ?, precision = ?, basis = ?, date_note = ?, duplicate_of = ? WHERE id = ?',
        p.iso, p.precision, p.basis, p.note, duplicateOf, e.id,
      );
    }
  });
  return { dated, undated: events.length - dated, duplicates };
}

/** Date context for a case, for parsing a date typed in by a reviewer. */
export function caseDateContext(ctx: Ctx, caseId: string): DateContext {
  const rows = all<{ type: string; occurred_at_iso: string | null; raw_date: string | null }>(
    ctx.db, 'SELECT type, occurred_at_iso, raw_date FROM events WHERE case_id = ? ORDER BY seq', caseId,
  );
  const years = rows.flatMap((r) => yearsIn(r.raw_date));
  const anchorYear = years.length ? years.sort((a, b) => years.filter((y) => y === b).length - years.filter((y) => y === a).length)[0] : undefined;
  return {
    anchorYear,
    procedureDay: rows.find((r) => r.type === 'procedure' && r.occurred_at_iso)?.occurred_at_iso?.slice(0, 10) ?? null,
    admissionDay: rows.find((r) => r.type === 'admission' && r.occurred_at_iso)?.occurred_at_iso?.slice(0, 10) ?? null,
  };
}
