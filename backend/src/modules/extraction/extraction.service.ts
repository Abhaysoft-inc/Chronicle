import { all, get, run, tx } from '../../core/db/index.ts';
import { buildExtractUser, EXTRACT_PROMPT_VERSION, EXTRACT_SYSTEM, type PromptBlock } from './extraction.prompt.ts';
import { ExtractionOut, type ExtractionResult } from './extraction.schema.ts';
import { TruncatedError } from '../../integrations/sarvam/chat.ts';
import type { Ctx } from '../../core/context.ts';

// Indic text uses more tokens per character than English, so budget by characters and
// halve the batch if the model's reply is cut off. Phase 0 measures the real ratio.
const CHAR_BUDGET = 3500;
const MAX_PAGES_PER_BATCH = 3;

interface DocRow { id: string; language: string | null }
interface BlockRow { block_id: string; page_no: number; text: string }

/** Stage 3. Ask the LLM for events, a few pages at a time. Pages in Tier 2/3 languages are skipped. */
export async function extractCase(ctx: Ctx, caseId: string): Promise<void> {
  const docs = all<DocRow>(ctx.db, 'SELECT id, language FROM documents WHERE case_id = ?', caseId);

  for (const doc of docs) {
    const pageRows = all<{ page_no: number }>(
      ctx.db,
      `SELECT page_no FROM pages
       WHERE document_id = ? AND ocr_status = 'ok' AND doc_type IS NULL
         AND (language_tier IS NULL OR language_tier = 1)
       ORDER BY page_no`,
      doc.id,
    );
    for (const batch of batchPages(ctx, doc.id, pageRows.map((r) => r.page_no))) {
      await extractBatch(ctx, caseId, doc, batch);
    }
  }
}

/** Group page numbers into batches that fit the character budget. */
function batchPages(ctx: Ctx, docId: string, pageNos: number[]): number[][] {
  const batches: number[][] = [];
  let cur: number[] = [];
  let chars = 0;
  for (const p of pageNos) {
    const size =
      get<{ n: number }>(ctx.db, 'SELECT COALESCE(SUM(LENGTH(text)),0) AS n FROM ocr_blocks WHERE document_id = ? AND page_no = ?', docId, p)?.n ?? 0;
    const contiguous = cur.length === 0 || p === cur[cur.length - 1]! + 1;
    if (cur.length && (!contiguous || cur.length >= MAX_PAGES_PER_BATCH || chars + size > CHAR_BUDGET)) {
      batches.push(cur);
      cur = [];
      chars = 0;
    }
    cur.push(p);
    chars += size;
  }
  if (cur.length) batches.push(cur);
  return batches;
}

async function extractBatch(ctx: Ctx, caseId: string, doc: DocRow, pageNos: number[]): Promise<void> {
  const blocks = all<BlockRow>(
    ctx.db,
    `SELECT block_id, page_no, text FROM ocr_blocks
     WHERE document_id = ? AND page_no BETWEEN ? AND ? ORDER BY page_no, seq`,
    doc.id, pageNos[0]!, pageNos[pageNos.length - 1]!,
  );
  const promptBlocks: PromptBlock[] = blocks.filter((b) => pageNos.includes(b.page_no));

  let result: ExtractionResult;
  try {
    result = await ctx.chat.json({
      task: `${EXTRACT_PROMPT_VERSION}:${doc.id}:${pageNos.join(',')}`,
      system: EXTRACT_SYSTEM,
      user: buildExtractUser(doc.language, promptBlocks),
      schema: ExtractionOut,
    });
  } catch (err) {
    if (err instanceof TruncatedError && pageNos.length > 1) {
      const mid = Math.ceil(pageNos.length / 2);
      await extractBatch(ctx, caseId, doc, pageNos.slice(0, mid));
      await extractBatch(ctx, caseId, doc, pageNos.slice(mid));
      return;
    }
    if (err instanceof TruncatedError) {
      // One page is too big for a single reply: leave it unextracted and say so.
      for (const p of pageNos) {
        run(ctx.db, `UPDATE pages SET warning = ? WHERE document_id = ? AND page_no = ?`,
          'Too long for automated extraction in one step; not analysed.', doc.id, p);
      }
      return;
    }
    throw err;
  }
  saveExtraction(ctx, caseId, doc.id, pageNos, result);
}

function saveExtraction(ctx: Ctx, caseId: string, docId: string, pageNos: number[], result: ExtractionResult): void {
  tx(ctx.db, () => {
    const typeByPage = new Map(result.pages.map((p) => [p.page_no, p.doc_type]));
    for (const p of pageNos) {
      run(ctx.db, 'UPDATE pages SET doc_type = ? WHERE document_id = ? AND page_no = ?', typeByPage.get(p) ?? 'other', docId, p);
    }
    let seq = get<{ n: number }>(ctx.db, 'SELECT COALESCE(MAX(seq),0) AS n FROM events WHERE case_id = ?', caseId)!.n;
    for (const ev of result.events) {
      seq++;
      const id = `E${String(seq).padStart(3, '0')}`;
      run(
        ctx.db,
        `INSERT INTO events (id, case_id, seq, type, raw_date, actor_role, summary_en, details_json, legibility)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        `${caseId}:${id}`, caseId, seq, ev.type, ev.occurred_at_raw, ev.actor_role, ev.summary_en,
        JSON.stringify(ev.details), ev.legibility,
      );
      for (const s of ev.sources) {
        run(
          ctx.db,
          `INSERT INTO event_sources (event_id, document_id, page_no, block_ids_json, quote_original, quote_en)
           VALUES (?, ?, ?, ?, ?, ?)`,
          `${caseId}:${id}`, docId, s.page_no, JSON.stringify(s.block_ids), s.quote_original, s.quote_en,
        );
      }
    }
  });
}
