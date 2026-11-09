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
  output_language: z.string().refine(isSupportedLanguage, 'Unsupported language code').default('en-IN'),
  patient_name: z.string().trim().max(100).optional(),
  patient_age: z.coerce.number().int().min(0).max(130).optional(),
  patient_gender: z.string().trim().max(20).optional(),
  hospital_name: z.string().trim().max(200).optional(),
  priority: z.enum(['low', 'medium', 'high', 'urgent']).default('medium'),
  incident_date: z.string().trim().max(50).optional(),
  admission_date: z.string().trim().max(50).optional(),
  discharge_date: z.string().trim().max(50).optional(),
});
export type CreateCaseInput = z.infer<typeof CreateCase>;

export const UpdateMetadata = z.object({
  patient_name: z.string().trim().max(100).optional(),
  patient_age: z.coerce.number().int().min(0).max(130).optional(),
  patient_gender: z.string().trim().max(20).optional(),
  hospital_name: z.string().trim().max(200).optional(),
  priority: z.enum(['low', 'medium', 'high', 'urgent']).optional(),
  incident_date: z.string().trim().max(50).optional(),
  admission_date: z.string().trim().max(50).optional(),
  discharge_date: z.string().trim().max(50).optional(),
  notes: z.string().trim().max(5000).optional(),
});

export const UpdateStatus = z.object({
  status: z.enum(['new', 'processing', 'under_review', 'completed', 'failed', 'created']),
});

export const AssignCaseInput = z.object({
  user_id: z.string().min(1),
  role: z.enum(['lawyer', 'expert', 'investigator']).default('expert'),
});

export function createCase(ctx: Ctx, input: CreateCaseInput, ownerId: string) {
  const id = newId('c');
  run(
    ctx.db,
    `INSERT INTO cases (id, owner_id, title, case_type, claim_summary, output_language, status, patient_name, patient_age, patient_gender, hospital_name, priority)
     VALUES (?, ?, ?, ?, ?, ?, 'created', ?, ?, ?, ?, ?)`,
    id, ownerId, input.title, input.case_type, input.claim_summary, input.output_language,
    input.patient_name ?? null, input.patient_age ?? null, input.patient_gender ?? null, input.hospital_name ?? null, input.priority ?? 'medium',
  );

  run(
    ctx.db,
    `INSERT INTO case_metadata (case_id, patient_name, patient_age, patient_gender, hospital_name, priority, incident_date, admission_date, discharge_date)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(case_id) DO UPDATE SET patient_name=excluded.patient_name`,
    id, input.patient_name ?? null, input.patient_age ?? null, input.patient_gender ?? null, input.hospital_name ?? null, input.priority ?? 'medium',
    input.incident_date ?? null, input.admission_date ?? null, input.discharge_date ?? null,
  );

  return requireCase(ctx.db, id);
}

export function updateCaseMetadata(ctx: Ctx, caseId: string, input: z.infer<typeof UpdateMetadata>) {
  requireCase(ctx.db, caseId);
  const current = get(ctx.db, 'SELECT * FROM case_metadata WHERE case_id = ?', caseId);
  if (!current) {
    run(
      ctx.db,
      `INSERT INTO case_metadata (case_id, patient_name, patient_age, patient_gender, hospital_name, priority, incident_date, admission_date, discharge_date, notes)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      caseId, input.patient_name ?? null, input.patient_age ?? null, input.patient_gender ?? null,
      input.hospital_name ?? null, input.priority ?? 'medium', input.incident_date ?? null,
      input.admission_date ?? null, input.discharge_date ?? null, input.notes ?? null,
    );
  } else {
    run(
      ctx.db,
      `UPDATE case_metadata SET
        patient_name = COALESCE(?, patient_name),
        patient_age = COALESCE(?, patient_age),
        patient_gender = COALESCE(?, patient_gender),
        hospital_name = COALESCE(?, hospital_name),
        priority = COALESCE(?, priority),
        incident_date = COALESCE(?, incident_date),
        admission_date = COALESCE(?, admission_date),
        discharge_date = COALESCE(?, discharge_date),
        notes = COALESCE(?, notes),
        updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now')
       WHERE case_id = ?`,
      input.patient_name ?? null, input.patient_age ?? null, input.patient_gender ?? null,
      input.hospital_name ?? null, input.priority ?? null, input.incident_date ?? null,
      input.admission_date ?? null, input.discharge_date ?? null, input.notes ?? null, caseId,
    );
  }
  // Also sync top-level case record
  run(
    ctx.db,
    `UPDATE cases SET
      patient_name = COALESCE(?, patient_name),
      patient_age = COALESCE(?, patient_age),
      patient_gender = COALESCE(?, patient_gender),
      hospital_name = COALESCE(?, hospital_name),
      priority = COALESCE(?, priority)
     WHERE id = ?`,
    input.patient_name ?? null, input.patient_age ?? null, input.patient_gender ?? null,
    input.hospital_name ?? null, input.priority ?? null, caseId,
  );
  return get(ctx.db, 'SELECT * FROM case_metadata WHERE case_id = ?', caseId);
}

export function updateCaseStatus(ctx: Ctx, caseId: string, status: string) {
  requireCase(ctx.db, caseId);
  run(ctx.db, 'UPDATE cases SET status = ? WHERE id = ?', status, caseId);
  return { id: caseId, status };
}

export function assignCase(ctx: Ctx, caseId: string, userId: string, role: string, assignedBy: string) {
  requireCase(ctx.db, caseId);
  const id = newId('ca');
  run(
    ctx.db,
    `INSERT INTO case_assignments (id, case_id, user_id, role, assigned_by)
     VALUES (?, ?, ?, ?, ?)
     ON CONFLICT(case_id, user_id) DO UPDATE SET role = excluded.role, assigned_by = excluded.assigned_by`,
    id, caseId, userId, role, assignedBy,
  );
  return listAssignments(ctx, caseId);
}

export function listAssignments(ctx: Ctx, caseId: string) {
  return all<{ id: string; user_id: string; name: string; email: string; role: string; assigned_at: string }>(
    ctx.db,
    `SELECT a.id, a.user_id, u.name, u.email, a.role, a.assigned_at
     FROM case_assignments a
     JOIN users u ON u.id = a.user_id
     WHERE a.case_id = ?
     ORDER BY a.assigned_at ASC`,
    caseId,
  );
}

export function removeAssignment(ctx: Ctx, caseId: string, userId: string) {
  run(ctx.db, 'DELETE FROM case_assignments WHERE case_id = ? AND user_id = ?', caseId, userId);
  return listAssignments(ctx, caseId);
}

export function listCases(ctx: Ctx, userId: string, userRole = 'lawyer') {
  if (userRole === 'admin') {
    return all(
      ctx.db,
      `SELECT c.*, (SELECT COUNT(*) FROM documents d WHERE d.case_id = c.id) AS document_count
       FROM cases c ORDER BY c.created_at DESC`,
    );
  }
  return all(
    ctx.db,
    `SELECT c.*, (SELECT COUNT(*) FROM documents d WHERE d.case_id = c.id) AS document_count
     FROM cases c
     WHERE c.owner_id = ? OR EXISTS (SELECT 1 FROM case_assignments a WHERE a.case_id = c.id AND a.user_id = ?)
     ORDER BY c.created_at DESC`,
    userId, userId,
  );
}

export function getCaseDetail(ctx: Ctx, caseId: string) {
  const c = requireCase(ctx.db, caseId);
  const metadata = get(ctx.db, 'SELECT * FROM case_metadata WHERE case_id = ?', caseId) ?? null;
  const assignments = listAssignments(ctx, caseId);
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
    metadata,
    assignments,
    documents: listDocuments(ctx, caseId),
    pipeline: getProgress(ctx, caseId),
    page_issues: pageIssues,
    events: { total: counts.events, unverified: counts.unverified ?? 0 },
  };
}
