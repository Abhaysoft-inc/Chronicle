import { z } from 'zod';
import type { Ctx } from '../../core/context.ts';
import { all, get, run } from '../../core/db/index.ts';
import { requireCase } from '../../core/db/lookups.ts';
import { badRequest } from '../../core/errors.ts';

// Missing-record analysis: which documents a case of this kind would normally contain, which of them
// were found among the uploaded pages, and what the investigator has done about the rest.

export const RECORD_STATUSES = ['missing', 'requested', 'received', 'unavailable'] as const;
export type RecordStatus = (typeof RECORD_STATUSES)[number] | 'present';

/** Expected documents by case type. A clinician should review these lists. */
const EXPECTED: Record<string, string[]> = {
  surgical: ['consent_form', 'operation_notes', 'anaesthesia_record', 'nursing_chart', 'doctor_notes', 'discharge_summary'],
  obstetric: ['consent_form', 'nursing_chart', 'doctor_notes', 'discharge_summary'],
  medical: ['doctor_notes', 'nursing_chart', 'prescription', 'discharge_summary'],
  emergency: ['doctor_notes', 'nursing_chart', 'discharge_summary'],
  general: ['doctor_notes', 'discharge_summary'],
};

const WHY: Record<string, string> = {
  consent_form: 'Informed consent is expected before any procedure or operation.',
  operation_notes: 'The operation record documents what was done, findings and complications.',
  anaesthesia_record: 'The anaesthesia record documents drugs, vitals and events during the operation.',
  nursing_chart: 'Nursing charts show observations and medicines given around the clock.',
  doctor_notes: 'Doctor notes show assessment, decisions and reviews.',
  prescription: 'Prescriptions and drug orders show what was ordered.',
  discharge_summary: 'The discharge (or death) summary records the course, outcome and advice.',
  lab_report: 'Investigations were ordered, so their reports are expected.',
};

export interface ChecklistItem {
  doc_type: string;
  status: RecordStatus;
  reason: string;
  /** Pages where it was found, when present. */
  found_on: { document_id: string; filename: string; pages: number[] }[];
  note: string | null;
  updated_by_name: string | null;
  updated_at: string | null;
}

/** The expected-document checklist for a case, with what was found and what was done about the rest. */
export function getChecklist(ctx: Ctx, caseId: string): ChecklistItem[] {
  const c = requireCase(ctx.db, caseId);
  const expected = new Set(EXPECTED[c.case_type] ?? EXPECTED.general);

  // What the events imply: investigations ordered -> reports expected; a procedure -> consent expected.
  const types = new Set(all<{ type: string }>(ctx.db, 'SELECT DISTINCT type FROM events WHERE case_id = ?', caseId).map((r) => r.type));
  if (types.has('investigation_ordered') || types.has('investigation_result')) expected.add('lab_report');
  if (types.has('procedure') || types.has('anaesthesia')) expected.add('consent_form');

  const pages = all<{ doc_type: string | null; document_id: string; filename: string; page_no: number }>(
    ctx.db,
    `SELECT p.doc_type, p.document_id, d.filename, p.page_no FROM pages p JOIN documents d ON d.id = p.document_id
     WHERE d.case_id = ? AND p.doc_type IS NOT NULL ORDER BY d.created_at, p.page_no`,
    caseId,
  );
  const stored = new Map(
    all<{ doc_type: string; status: string; note: string | null; updated_by: string | null; updated_at: string }>(
      ctx.db, 'SELECT doc_type, status, note, updated_by, updated_at FROM record_checklist WHERE case_id = ?', caseId,
    ).map((r) => [r.doc_type, r]),
  );
  const nameOf = (id: string | null) => (id ? get<{ name: string }>(ctx.db, 'SELECT name FROM users WHERE id = ?', id)?.name ?? null : null);

  return [...expected].map((docType) => {
    // A death summary stands in for a discharge summary.
    const matches = pages.filter((p) => p.doc_type === docType || (docType === 'discharge_summary' && p.doc_type === 'death_summary'));
    const byDoc = new Map<string, { document_id: string; filename: string; pages: number[] }>();
    for (const p of matches) {
      if (!byDoc.has(p.document_id)) byDoc.set(p.document_id, { document_id: p.document_id, filename: p.filename, pages: [] });
      byDoc.get(p.document_id)!.pages.push(p.page_no);
    }
    const s = stored.get(docType);
    return {
      doc_type: docType,
      status: matches.length ? 'present' : ((s?.status as RecordStatus | undefined) ?? 'missing'),
      reason: WHY[docType] ?? 'Expected for this kind of case.',
      found_on: [...byDoc.values()],
      note: s?.note ?? null,
      updated_by_name: nameOf(s?.updated_by ?? null),
      updated_at: s?.updated_at ?? null,
    };
  });
}

export const PatchChecklistItem = z.object({
  status: z.enum(RECORD_STATUSES),
  note: z.string().trim().max(1000).optional(),
});

/** An investigator records what happened to a missing document: requested, received, or unavailable. */
export function setChecklistItem(ctx: Ctx, caseId: string, docType: string, input: z.infer<typeof PatchChecklistItem>, userId: string): ChecklistItem[] {
  if (!/^[a-z_]{2,40}$/.test(docType)) throw badRequest('Unknown document type');
  run(
    ctx.db,
    `INSERT INTO record_checklist (case_id, doc_type, status, note, updated_by, updated_at)
     VALUES (?, ?, ?, ?, ?, strftime('%Y-%m-%dT%H:%M:%fZ','now'))
     ON CONFLICT (case_id, doc_type) DO UPDATE SET status = excluded.status, note = excluded.note,
       updated_by = excluded.updated_by, updated_at = excluded.updated_at`,
    caseId, docType, input.status, input.note ?? null, userId,
  );
  return getChecklist(ctx, caseId);
}
