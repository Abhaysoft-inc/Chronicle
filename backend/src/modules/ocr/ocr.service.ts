import fs from 'node:fs';
import { all, get, run, tx } from '../../core/db/index.ts';
import { tierOf, LANGUAGES } from '../../shared/indic/languages.ts';
import { scriptProfile } from '../../shared/indic/text.ts';
import { hashOf } from '../../integrations/sarvam/cache.ts';
import type { ParseResult } from '../../integrations/sarvam/docai.ts';
import { QuotaError } from '../../integrations/sarvam/http.ts';
import type { Ctx } from '../../core/context.ts';

interface ChunkRow {
  id: string;
  document_id: string;
  idx: number;
  page_offset: number;
  page_count: number;
  path: string;
  sha256: string;
  filename: string;
  mime: string;
  language: string | null;
}

/**
 * Stage 2. OCR every pending chunk with Sarvam Parse, then store blocks with ids like
 * "p4.b12" (page numbers are for the ORIGINAL document, not the chunk).
 * Results are cached by chunk hash + language, so re-runs cost nothing.
 * One failed chunk does not stop the others; the failure is recorded on the chunk.
 */
export async function ocrCase(ctx: Ctx, caseId: string): Promise<{ failedChunks: number }> {
  const chunks = all<ChunkRow>(
    ctx.db,
    `SELECT c.*, d.filename, d.mime, d.language FROM ocr_chunks c
     JOIN documents d ON d.id = c.document_id
     WHERE d.case_id = ? AND c.status IN ('pending','failed') ORDER BY d.created_at, c.idx`,
    caseId,
  );

  let failed = 0;
  for (const ch of chunks) {
    try {
      const result = await ctx.cache.through<ParseResult>(
        'docai.parse',
        hashOf('parse', ch.sha256, ch.language ?? ''),
        () =>
          ctx.docai.parse({
            bytes: fs.readFileSync(ch.path),
            filename: `${ch.document_id}_${ch.idx}${ch.mime === 'application/pdf' ? '.pdf' : ''}`,
            mime: ch.mime,
            language: ch.language,
          }),
      );
      storeChunk(ctx, ch, result);
    } catch (err) {
      if (err instanceof QuotaError) throw err; // no point trying the rest
      failed++;
      run(
        ctx.db,
        `UPDATE ocr_chunks SET status = 'failed', error = ? WHERE id = ?`,
        (err as Error).message.slice(0, 500), ch.id,
      );
      for (let p = 1; p <= ch.page_count; p++) {
        run(
          ctx.db,
          `UPDATE pages SET ocr_status = 'failed', warning = ? WHERE document_id = ? AND page_no = ?`,
          'OCR failed for this page. It is NOT included in the analysis.', ch.document_id, ch.page_offset + p,
        );
      }
    }
  }
  return { failedChunks: failed };
}

function storeChunk(ctx: Ctx, ch: ChunkRow, result: ParseResult): void {
  const byPage = new Map<number, typeof result.blocks>();
  for (const b of result.blocks) {
    // Ignore blocks that claim a page outside this chunk rather than mislabel them.
    if (b.page < 1 || b.page > ch.page_count) continue;
    if (!byPage.has(b.page)) byPage.set(b.page, []);
    byPage.get(b.page)!.push(b);
  }

  tx(ctx.db, () => {
    run(ctx.db, 'DELETE FROM ocr_blocks WHERE document_id = ? AND page_no > ? AND page_no <= ?', ch.document_id, ch.page_offset, ch.page_offset + ch.page_count);
    for (let local = 1; local <= ch.page_count; local++) {
      const pageNo = ch.page_offset + local;
      const blocks = byPage.get(local) ?? [];
      blocks.forEach((b, i) => {
        run(
          ctx.db,
          `INSERT OR REPLACE INTO ocr_blocks (block_id, document_id, page_no, seq, text, tag, bbox_json, bbox_norm_json, confidence)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          `p${pageNo}.b${i + 1}`, ch.document_id, pageNo, i + 1, b.text, b.tag,
          b.bbox == null ? null : JSON.stringify(b.bbox),
          b.bboxNorm ? JSON.stringify(b.bboxNorm) : null,
          b.confidence ?? null,
        );
      });

      const text = blocks.map((b) => b.text).join(' ');
      const profile = scriptProfile(text);
      const tier = tierOf(ch.language);
      const warning = pageWarning(ch.language, profile.dominant, profile.share, blocks.length);
      const size = result.pages?.find((p) => p.page === local);
      run(
        ctx.db,
        `UPDATE pages SET ocr_status = ?, script = ?, language = ?, language_tier = ?, warning = ?, image_width = ?, image_height = ?
         WHERE document_id = ? AND page_no = ?`,
        blocks.length ? 'ok' : 'no_text', profile.dominant, ch.language, tier, warning,
        size?.width ?? null, size?.height ?? null, ch.document_id, pageNo,
      );
    }
    const partial = result.status === 'partially_completed';
    run(
      ctx.db,
      `UPDATE ocr_chunks SET status = ?, sarvam_job_id = ?, error = NULL WHERE id = ?`,
      partial ? 'partial' : 'done', result.jobId, ch.id,
    );
  });
}

/** Human-readable reason this page needs attention, or null. */
export function pageWarning(
  language: string | null,
  script: string | null,
  share: number,
  blockCount: number,
): string | null {
  if (blockCount === 0) return 'No text was read from this page (blank, or OCR could not read it).';
  const tier = tierOf(language);
  if (tier === 3) return `${LANGUAGES[language!]?.name} is read by OCR only; automated analysis is withheld. Manual review needed.`;
  if (tier === 2) return `${LANGUAGES[language!]?.name} needs translation before analysis, which is not enabled yet. Page is excluded from analysis.`;
  const expected = language ? LANGUAGES[language]?.scripts : undefined;
  if (expected && script && share >= 0.6 && !expected.includes(script as never) && script !== 'Latin') {
    return `Page looks like ${script} script but the document language is ${LANGUAGES[language!]?.name}. Check the language setting.`;
  }
  return null;
}

/**
 * Upgrade blocks that were stored before boxes / confidence were captured, using each finished
 * job's SAVED output (no new OCR, so no new charge). Only the new fields are written, and a block
 * is touched only if its text matches what is already stored, so event citations cannot break.
 */
export async function refreshOcrDetails(
  ctx: Ctx,
  docai: { getResult(jobId: string): Promise<ParseResult> },
  onlyCaseId?: string,
): Promise<{ chunks: number; blocksUpdated: number; skipped: string[] }> {
  const chunks = all<ChunkRow & { sarvam_job_id: string }>(
    ctx.db,
    `SELECT c.*, d.filename, d.mime, d.language FROM ocr_chunks c
     JOIN documents d ON d.id = c.document_id
     WHERE c.sarvam_job_id IS NOT NULL AND c.status IN ('done', 'partial')
       ${onlyCaseId ? 'AND d.case_id = ?' : ''}
     ORDER BY d.created_at, c.idx`,
    ...(onlyCaseId ? [onlyCaseId] : []),
  );

  let blocksUpdated = 0;
  const skipped: string[] = [];
  for (const ch of chunks) {
    const result = await docai.getResult(ch.sarvam_job_id);
    const byPage = new Map<number, typeof result.blocks>();
    for (const b of result.blocks) {
      if (b.page < 1 || b.page > ch.page_count) continue;
      if (!byPage.has(b.page)) byPage.set(b.page, []);
      byPage.get(b.page)!.push(b);
    }
    tx(ctx.db, () => {
      for (let local = 1; local <= ch.page_count; local++) {
        const pageNo = ch.page_offset + local;
        (byPage.get(local) ?? []).forEach((b, i) => {
          const id = `p${pageNo}.b${i + 1}`;
          const stored = get<{ text: string }>(ctx.db, 'SELECT text FROM ocr_blocks WHERE document_id = ? AND block_id = ?', ch.document_id, id);
          if (!stored || stored.text !== b.text) {
            skipped.push(`${ch.filename} ${id}`);
            return;
          }
          run(
            ctx.db,
            `UPDATE ocr_blocks SET tag = ?, bbox_json = ?, bbox_norm_json = ?, confidence = ? WHERE document_id = ? AND block_id = ?`,
            b.tag, b.bbox == null ? null : JSON.stringify(b.bbox), b.bboxNorm ? JSON.stringify(b.bboxNorm) : null, b.confidence ?? null,
            ch.document_id, id,
          );
          blocksUpdated++;
        });
        const size = result.pages?.find((p) => p.page === local);
        if (size) {
          run(ctx.db, 'UPDATE pages SET image_width = ?, image_height = ? WHERE document_id = ? AND page_no = ?', size.width, size.height, ch.document_id, pageNo);
        }
      }
      // Keep the OCR cache in step, so a later "process again" does not bring the old shape back.
      run(
        ctx.db,
        'INSERT OR REPLACE INTO api_cache (request_hash, endpoint, response_json) VALUES (?, ?, ?)',
        hashOf('parse', ch.sha256, ch.language ?? ''), 'docai.parse', JSON.stringify(result),
      );
    });
  }
  return { chunks: chunks.length, blocksUpdated, skipped };
}
