import { z } from 'zod';
import type { Ctx } from '../../core/context.ts';
import { all, get, newId, run } from '../../core/db/index.ts';
import { requireCase } from '../../core/db/lookups.ts';
import { badRequest, notFound } from '../../core/errors.ts';
import { assignCase } from '../cases/index.ts';

export const UpdateExpertProfile = z.object({
  specialty: z.string().trim().min(2).max(100),
  experience_years: z.coerce.number().int().min(0).max(60),
  medical_council_no: z.string().trim().max(100).optional(),
  fee_per_case: z.coerce.number().min(0),
  bio: z.string().trim().max(2000).default(''),
});

export const CreateReviewRequest = z.object({
  case_id: z.string().min(1),
  expert_id: z.string().min(1),
  fee: z.coerce.number().min(0).optional(),
  scheduled_at: z.string().optional(),
  notes: z.string().trim().max(1000).optional(),
});

export const UpdateRequestStatus = z.object({
  status: z.enum(['requested', 'accepted', 'declined', 'completed']),
  notes: z.string().trim().max(1000).optional(),
});

export interface ExpertProfile {
  user_id: string;
  name: string;
  email: string;
  specialty: string;
  experience_years: number;
  medical_council_no: string | null;
  fee_per_case: number;
  bio: string;
  status: string;
  rating: number;
  updated_at: string;
}

export function listExperts(ctx: Ctx, specialty?: string, minExp?: number): ExpertProfile[] {
  let sql = `
    SELECT u.id as user_id, u.name, u.email,
           COALESCE(p.specialty, u.specialty, 'General Medicine') as specialty,
           COALESCE(p.experience_years, u.experience_years, 5) as experience_years,
           p.medical_council_no,
           COALESCE(p.fee_per_case, u.hourly_rate, 5000) as fee_per_case,
           COALESCE(p.bio, 'Experienced medical specialist available for case evaluation.') as bio,
           COALESCE(p.status, 'verified') as status,
           COALESCE(p.rating, 5.0) as rating,
           COALESCE(p.updated_at, u.created_at) as updated_at
    FROM users u
    LEFT JOIN marketplace_profiles p ON p.user_id = u.id
    WHERE u.role = 'expert' OR p.user_id IS NOT NULL
  `;
  const params: unknown[] = [];
  if (specialty) {
    sql += ' AND (p.specialty LIKE ? OR u.specialty LIKE ?)';
    params.push(`%${specialty}%`, `%${specialty}%`);
  }
  if (minExp !== undefined) {
    sql += ' AND COALESCE(p.experience_years, u.experience_years, 0) >= ?';
    params.push(minExp);
  }
  sql += ' ORDER BY rating DESC, experience_years DESC';

  const rows = all<ExpertProfile>(ctx.db, sql, ...params);
  return rows;
}

export function getExpertProfile(ctx: Ctx, userId: string): ExpertProfile {
  const expert = listExperts(ctx).find((e) => e.user_id === userId);
  if (!expert) throw notFound(`Expert profile ${userId}`);
  return expert;
}

export function saveExpertProfile(ctx: Ctx, userId: string, input: z.infer<typeof UpdateExpertProfile>): ExpertProfile {
  run(
    ctx.db,
    `INSERT INTO marketplace_profiles (user_id, specialty, experience_years, medical_council_no, fee_per_case, bio, status, rating)
     VALUES (?, ?, ?, ?, ?, ?, 'verified', 5.0)
     ON CONFLICT(user_id) DO UPDATE SET
       specialty = excluded.specialty,
       experience_years = excluded.experience_years,
       medical_council_no = excluded.medical_council_no,
       fee_per_case = excluded.fee_per_case,
       bio = excluded.bio,
       updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now')`,
    userId, input.specialty, input.experience_years, input.medical_council_no ?? null, input.fee_per_case, input.bio,
  );

  run(
    ctx.db,
    'UPDATE users SET role = ?, specialty = ?, experience_years = ?, registration_no = ?, hourly_rate = ? WHERE id = ?',
    'expert', input.specialty, input.experience_years, input.medical_council_no ?? null, input.fee_per_case, userId,
  );

  return getExpertProfile(ctx, userId);
}

export function createReviewRequest(
  ctx: Ctx,
  requesterId: string,
  input: z.infer<typeof CreateReviewRequest>,
) {
  requireCase(ctx.db, input.case_id);
  const expert = getExpertProfile(ctx, input.expert_id);
  const fee = input.fee ?? expert.fee_per_case;
  const commission = Math.round(fee * 0.10); // 10% platform commission

  const id = newId('mr');
  run(
    ctx.db,
    `INSERT INTO marketplace_requests (id, case_id, expert_id, requester_id, status, fee, commission, scheduled_at, notes)
     VALUES (?, ?, ?, ?, 'requested', ?, ?, ?, ?)`,
    id, input.case_id, input.expert_id, requesterId, fee, commission, input.scheduled_at ?? null, input.notes ?? null,
  );

  return get<{ id: string; status: string; fee: number; commission: number }>(
    ctx.db, 'SELECT * FROM marketplace_requests WHERE id = ?', id,
  );
}

export function listReviewRequests(ctx: Ctx, userId: string) {
  return all(
    ctx.db,
    `SELECT r.*, c.title as case_title, u_req.name as requester_name, u_exp.name as expert_name
     FROM marketplace_requests r
     JOIN cases c ON c.id = r.case_id
     JOIN users u_req ON u_req.id = r.requester_id
     JOIN users u_exp ON u_exp.id = r.expert_id
     WHERE r.requester_id = ? OR r.expert_id = ?
     ORDER BY r.created_at DESC`,
    userId, userId,
  );
}

export function updateReviewRequest(
  ctx: Ctx,
  requestId: string,
  input: z.infer<typeof UpdateRequestStatus>,
  userId: string,
) {
  const req = get<{ id: string; case_id: string; expert_id: string; requester_id: string; status: string }>(
    ctx.db, 'SELECT * FROM marketplace_requests WHERE id = ?', requestId,
  );
  if (!req) throw notFound(`Review request ${requestId}`);

  run(
    ctx.db,
    'UPDATE marketplace_requests SET status = ?, notes = COALESCE(?, notes) WHERE id = ?',
    input.status, input.notes ?? null, requestId,
  );

  // If expert accepts, assign them to the case automatically
  if (input.status === 'accepted') {
    assignCase(ctx, req.case_id, req.expert_id, 'expert', req.requester_id);
  }

  return get(ctx.db, 'SELECT * FROM marketplace_requests WHERE id = ?', requestId);
}
