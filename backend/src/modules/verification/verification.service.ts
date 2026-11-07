import { all, run } from '../../core/db/index.ts';
import { quoteMatches } from '../../shared/indic/text.ts';
import type { Ctx } from '../../core/context.ts';

interface SourceRow {
  id: number;
  document_id: string;
  page_no: number;
  block_ids_json: string;
  quote_original: string;
}

/**
 * Stage 4. For each unchecked source: every cited block must exist on the cited page,
 * and the quote must really appear in those blocks (digits exactly, text approximately).
 *
 * This catches text the LLM INVENTED. It cannot catch words the OCR MISREAD ("50" read as
 * "500" still matches), so critical values are shown beside the page image for a person.
 */
export function verifyCase(ctx: Ctx, caseId: string): { checked: number; failed: number } {
  const sources = all<SourceRow>(
    ctx.db,
    `SELECT s.id, s.document_id, s.page_no, s.block_ids_json, s.quote_original
     FROM event_sources s JOIN events e ON e.id = s.event_id
     WHERE e.case_id = ? AND s.verified IS NULL`,
    caseId,
  );

  let failed = 0;
  for (const s of sources) {
    const { ok, reason } = checkSource(ctx, s);
    if (!ok) failed++;
    run(ctx.db, 'UPDATE event_sources SET verified = ?, verify_reason = ? WHERE id = ?', ok ? 1 : 0, reason, s.id);
  }
  return { checked: sources.length, failed };
}

function checkSource(ctx: Ctx, s: SourceRow): { ok: boolean; reason: string | null } {
  let ids: unknown;
  try {
    ids = JSON.parse(s.block_ids_json);
  } catch {
    return { ok: false, reason: 'bad_block_ids' };
  }
  if (!Array.isArray(ids) || ids.length === 0) return { ok: false, reason: 'no_blocks_cited' };

  const texts: string[] = [];
  for (const id of ids) {
    const row = all<{ text: string; page_no: number }>(
      ctx.db,
      'SELECT text, page_no FROM ocr_blocks WHERE document_id = ? AND block_id = ?',
      s.document_id, String(id),
    )[0];
    if (!row) return { ok: false, reason: `block_not_found:${String(id)}` };
    if (row.page_no !== s.page_no) return { ok: false, reason: `block_on_other_page:${String(id)}` };
    texts.push(row.text);
  }
  const m = quoteMatches(s.quote_original, texts.join(' '));
  return m.ok ? { ok: true, reason: null } : { ok: false, reason: m.reason };
}
