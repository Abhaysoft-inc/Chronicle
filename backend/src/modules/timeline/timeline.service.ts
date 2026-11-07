import { z } from 'zod';
import type { Ctx } from '../../core/context.ts';
import { all, get, run } from '../../core/db/index.ts';
import { requireCase } from '../../core/db/lookups.ts';
import { badRequest, notFound } from '../../core/errors.ts';
import { EVENT_TYPES } from '../extraction/index.ts';
import { caseDateContext, parseRawDate } from '../normalisation/index.ts';

interface EventRow {
  id: string; seq: number; type: string; raw_date: string | null; occurred_at_iso: string | null;
  precision: string | null; basis: string | null; actor_role: string | null; summary_en: string;
  details_json: string; legibility: string; review_status: string; corrected_json: string | null;
  date_note: string | null; duplicate_of: string | null; origin: string; created_by: string | null;
}
interface SourceRow {
  event_id: string; document_id: string; page_no: number; block_ids_json: string;
  quote_original: string; quote_en: string | null; verified: number | null; verify_reason: string | null;
}

const labelOf = (id: string) => id.split(':').pop()!;

/**
 * Events in date order (undated ones last), with their sources.
 * `verified` is true when EVERY cited quote was found in the OCR text, or when a person added the
 * event themselves. Unverified events are returned (so a person can look) but must not feed findings.
 * Options for analysis: verifiedOnly, and excludeDuplicates so a repeated fact is not counted twice.
 */
export function listTimeline(ctx: Ctx, caseId: string, opts: { verifiedOnly?: boolean; excludeDuplicates?: boolean } = {}) {
  requireCase(ctx.db, caseId);
  const events = all<EventRow>(
    ctx.db,
    'SELECT * FROM events WHERE case_id = ? ORDER BY occurred_at_iso IS NULL, occurred_at_iso, seq',
    caseId,
  );
  const sources = all<SourceRow>(
    ctx.db,
    `SELECT s.* FROM event_sources s JOIN events e ON e.id = s.event_id WHERE e.case_id = ? ORDER BY s.id`,
    caseId,
  );
  const byEvent = new Map<string, SourceRow[]>();
  for (const s of sources) {
    if (!byEvent.has(s.event_id)) byEvent.set(s.event_id, []);
    byEvent.get(s.event_id)!.push(s);
  }

  const out = events.map((e) => {
    const srcs = byEvent.get(e.id) ?? [];
    const manual = e.origin === 'manual';
    return {
      id: e.id,
      label: labelOf(e.id),
      type: e.type,
      raw_date: e.raw_date,
      occurred_at_iso: e.occurred_at_iso,
      precision: e.precision,
      basis: e.basis,
      date_note: e.date_note,
      actor_role: e.actor_role,
      summary_en: e.summary_en,
      details: JSON.parse(e.details_json) as Record<string, unknown>,
      legibility: e.legibility,
      review_status: e.review_status,
      corrected: e.corrected_json ? (JSON.parse(e.corrected_json) as Record<string, unknown>) : null,
      origin: manual ? ('manual' as const) : ('extracted' as const),
      duplicate_of: e.duplicate_of ? labelOf(e.duplicate_of) : null,
      verified: manual || (srcs.length > 0 && srcs.every((s) => s.verified === 1)),
      sources: srcs.map((s) => ({
        document_id: s.document_id,
        page_no: s.page_no,
        block_ids: JSON.parse(s.block_ids_json) as string[],
        quote_original: s.quote_original,
        quote_en: s.quote_en,
        quote_en_is_machine_generated: true,
        verified: s.verified === null ? null : s.verified === 1,
        verify_reason: s.verify_reason,
      })),
    };
  });
  let shown = out;
  if (opts.verifiedOnly) shown = shown.filter((e) => e.verified && e.review_status !== 'rejected');
  if (opts.excludeDuplicates) shown = shown.filter((e) => !e.duplicate_of);
  return {
    events: shown,
    total: out.length,
    verified: out.filter((e) => e.verified).length,
    duplicates: out.filter((e) => e.duplicate_of).length,
    undated: out.filter((e) => !e.occurred_at_iso).length,
  };
}

export type TimelineEvent = ReturnType<typeof listTimeline>['events'][number];

function redate(ctx: Ctx, caseId: string, eventId: string, raw: string | null) {
  const p = parseRawDate(raw, caseDateContext(ctx, caseId));
  run(ctx.db, 'UPDATE events SET occurred_at_iso = ?, precision = ?, basis = ?, date_note = ? WHERE id = ?', p.iso, p.precision, p.basis, p.note, eventId);
}

export const PatchEvent = z
  .object({
    review_status: z.enum(['confirmed', 'rejected', 'corrected', 'unreviewed']).optional(),
    corrections: z
      .object({
        summary_en: z.string().trim().min(1).optional(),
        raw_date: z.string().trim().nullable().optional(),
        details: z.record(z.string(), z.union([z.string(), z.number(), z.null()])).optional(),
      })
      .optional(),
  })
  .refine((v) => v.review_status || v.corrections, 'Provide review_status and/or corrections');

/** A person confirms, rejects or corrects an event. The original LLM output is never overwritten. */
export function patchEvent(ctx: Ctx, eventId: string, input: z.infer<typeof PatchEvent>) {
  const ev = get<EventRow & { case_id: string }>(ctx.db, 'SELECT * FROM events WHERE id = ?', eventId);
  if (!ev) throw notFound(`Event ${eventId}`);
  if (input.review_status === 'corrected' && !input.corrections && !ev.corrected_json) {
    throw badRequest("Status 'corrected' needs a 'corrections' object");
  }
  let corrected = ev.corrected_json ? (JSON.parse(ev.corrected_json) as Record<string, unknown>) : null;
  if (input.corrections) corrected = { ...(corrected ?? {}), ...input.corrections };
  const status = input.review_status ?? (input.corrections ? 'corrected' : ev.review_status);
  run(ctx.db, 'UPDATE events SET review_status = ?, corrected_json = ? WHERE id = ?', status, corrected ? JSON.stringify(corrected) : null, eventId);
  // A corrected date moves the event to its right place straight away.
  if (input.corrections && 'raw_date' in input.corrections) redate(ctx, ev.case_id, eventId, input.corrections.raw_date ?? null);
  return { id: eventId, review_status: status, corrected };
}

export const AddEvent = z.object({
  type: z.enum(EVENT_TYPES),
  summary_en: z.string().trim().min(3).max(500),
  raw_date: z.string().trim().max(100).nullable().default(null),
  actor_role: z.string().trim().max(60).nullable().default(null),
  details: z.record(z.string(), z.union([z.string(), z.number(), z.null()])).default({}),
});

/**
 * A reviewer adds an event the records imply but the extraction missed (for example from a paper
 * record that was not uploaded). Marked as added by a person, never as read from a document.
 */
export function addEvent(ctx: Ctx, caseId: string, input: z.infer<typeof AddEvent>, userId: string) {
  requireCase(ctx.db, caseId);
  const seq = (get<{ n: number }>(ctx.db, 'SELECT COALESCE(MAX(seq), 0) AS n FROM events WHERE case_id = ?', caseId)!.n) + 1;
  const id = `${caseId}:E${String(seq).padStart(3, '0')}`;
  run(
    ctx.db,
    `INSERT INTO events (id, case_id, seq, type, raw_date, actor_role, summary_en, details_json, legibility, review_status, origin, created_by)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'clear', 'confirmed', 'manual', ?)`,
    id, caseId, seq, input.type, input.raw_date, input.actor_role, input.summary_en, JSON.stringify(input.details), userId,
  );
  redate(ctx, caseId, id, input.raw_date);
  return listTimeline(ctx, caseId).events.find((e) => e.id === id)!;
}
