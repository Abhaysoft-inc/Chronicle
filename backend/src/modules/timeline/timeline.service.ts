import { z } from 'zod';
import type { Ctx } from '../../core/context.ts';
import { all, get, run } from '../../core/db/index.ts';
import { requireCase } from '../../core/db/lookups.ts';
import { badRequest, notFound } from '../../core/errors.ts';

interface EventRow {
  id: string; seq: number; type: string; raw_date: string | null; occurred_at_iso: string | null;
  precision: string | null; basis: string | null; actor_role: string | null; summary_en: string;
  details_json: string; legibility: string; review_status: string; corrected_json: string | null;
}
interface SourceRow {
  event_id: string; document_id: string; page_no: number; block_ids_json: string;
  quote_original: string; quote_en: string | null; verified: number | null; verify_reason: string | null;
}

/**
 * Events with their sources. Ordering is extraction order for now; the timeline stage
 * (date normalisation, merging, conflict detection) will add real chronological order.
 * `verified` is true only when EVERY source quote was found in the OCR text. Unverified
 * events are returned (so a person can look) but flagged; they must not feed findings.
 */
export function listTimeline(ctx: Ctx, caseId: string, opts: { verifiedOnly?: boolean } = {}) {
  requireCase(ctx.db, caseId);
  const events = all<EventRow>(ctx.db, 'SELECT * FROM events WHERE case_id = ? ORDER BY seq', caseId);
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
    return {
      id: e.id,
      label: e.id.split(':').pop()!,
      type: e.type,
      raw_date: e.raw_date,
      occurred_at_iso: e.occurred_at_iso,
      precision: e.precision,
      basis: e.basis,
      actor_role: e.actor_role,
      summary_en: e.summary_en,
      details: JSON.parse(e.details_json) as Record<string, unknown>,
      legibility: e.legibility,
      review_status: e.review_status,
      corrected: e.corrected_json ? (JSON.parse(e.corrected_json) as Record<string, unknown>) : null,
      verified: srcs.length > 0 && srcs.every((s) => s.verified === 1),
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
  const shown = opts.verifiedOnly ? out.filter((e) => e.verified) : out;
  return { events: shown, total: out.length, verified: out.filter((e) => e.verified).length };
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
  const ev = get<EventRow>(ctx.db, 'SELECT * FROM events WHERE id = ?', eventId);
  if (!ev) throw notFound(`Event ${eventId}`);
  if (input.review_status === 'corrected' && !input.corrections && !ev.corrected_json) {
    throw badRequest("Status 'corrected' needs a 'corrections' object");
  }
  let corrected = ev.corrected_json ? (JSON.parse(ev.corrected_json) as Record<string, unknown>) : null;
  if (input.corrections) corrected = { ...(corrected ?? {}), ...input.corrections };
  const status = input.review_status ?? (input.corrections ? 'corrected' : ev.review_status);
  run(ctx.db, 'UPDATE events SET review_status = ?, corrected_json = ? WHERE id = ?', status, corrected ? JSON.stringify(corrected) : null, eventId);
  return { id: eventId, review_status: status, corrected };
}
