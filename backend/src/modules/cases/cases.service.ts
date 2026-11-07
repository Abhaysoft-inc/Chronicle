import { z } from 'zod';
import type { Ctx } from '../../core/context.ts';
import { all, get, newId, run } from '../../core/db/index.ts';
import { requireCase } from '../../core/db/lookups.ts';
import { isSupportedLanguage } from '../../shared/indic/languages.ts';
import { listDocuments } from '../documents/index.ts';
import { getProgress } from '../pipeline/index.ts';

export const CreateCase = z.object({
  title: z.string().trim().min(1).max(200),
  case_type: z.enum(['general', 'surgical', 'medical', 'obstetric', 'emergency']).default('general'),
  claim_summary: z.string().trim().max(5000).default(''),
  /** Language the brief should be translated into. English is always produced. */
  output_language: z.string().refine(isSupportedLanguage, 'Unsupported language code').default('en-IN'),
});
export type CreateCaseInput = z.infer<typeof CreateCase>;

export function createCase(ctx: Ctx, input: CreateCaseInput, ownerId: string) {
  const id = newId('c');
  run(
    ctx.db,
    'INSERT INTO cases (id, owner_id, title, case_type, claim_summary, output_language) VALUES (?, ?, ?, ?, ?, ?)',
    id, ownerId, input.title, input.case_type, input.claim_summary, input.output_language,
  );
  return requireCase(ctx.db, id);
}

export function listCases(ctx: Ctx, ownerId: string) {
  return all(
    ctx.db,
    `SELECT c.*, (SELECT COUNT(*) FROM documents d WHERE d.case_id = c.id) AS document_count
     FROM cases c WHERE c.owner_id = ? ORDER BY c.created_at DESC`,
    ownerId,
  );
}

export function getCaseDetail(ctx: Ctx, caseId: string) {
  const c = requireCase(ctx.db, caseId);
  const counts = get<{ events: number; unverified: number }>(
    ctx.db,
    `SELECT COUNT(*) AS events,
            SUM(CASE WHEN EXISTS (SELECT 1 FROM event_sources s WHERE s.event_id = e.id AND COALESCE(s.verified, 0) != 1)
                     THEN 1 ELSE 0 END) AS unverified
     FROM events e WHERE e.case_id = ?`,
    caseId,
  )!;
  const pageIssues = all(
    ctx.db,
    `SELECT p.document_id, p.page_no, p.ocr_status, p.warning FROM pages p
     JOIN documents d ON d.id = p.document_id
     WHERE d.case_id = ? AND (p.warning IS NOT NULL OR p.ocr_status IN ('failed','no_text'))
     ORDER BY d.created_at, p.page_no`,
    caseId,
  );
  return {
    case: c,
    documents: listDocuments(ctx, caseId),
    pipeline: getProgress(ctx, caseId),
    // Pages that were NOT analysed. A missing page must never be read as missing care.
    page_issues: pageIssues,
    events: { total: counts.events, unverified: counts.unverified ?? 0 },
  };
}
