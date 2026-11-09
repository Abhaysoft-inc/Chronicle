import { z } from 'zod';
import type { Ctx } from '../../core/context.ts';
import { all, get, newId, run } from '../../core/db/index.ts';
import { requireCase } from '../../core/db/lookups.ts';
import { listFindings } from '../findings/index.ts';
import { listTimeline } from '../timeline/index.ts';
import { getChecklist } from '../records/index.ts';

export const CreateCommentInput = z.object({
  target_type: z.enum(['case', 'finding', 'event']),
  target_id: z.string().min(1),
  content: z.string().trim().min(1).max(2000),
});

export interface CaseComment {
  id: string;
  case_id: string;
  user_id: string;
  user_name: string;
  target_type: 'case' | 'finding' | 'event';
  target_id: string;
  content: string;
  created_at: string;
}

export interface ActivityLogItem {
  id: string;
  case_id: string;
  user_id: string | null;
  user_name: string | null;
  action: string;
  details: Record<string, unknown>;
  created_at: string;
}

export function logActivity(
  ctx: Ctx,
  caseId: string,
  userId: string | null,
  action: string,
  details: Record<string, unknown> = {},
): void {
  const id = newId('act');
  run(
    ctx.db,
    `INSERT INTO activity_logs (id, case_id, user_id, action, details_json)
     VALUES (?, ?, ?, ?, ?)`,
    id, caseId, userId, action, JSON.stringify(details),
  );
}

export function getActivityLogs(ctx: Ctx, caseId: string): ActivityLogItem[] {
  requireCase(ctx.db, caseId);
  const rows = all<{
    id: string;
    case_id: string;
    user_id: string | null;
    user_name: string | null;
    action: string;
    details_json: string;
    created_at: string;
  }>(
    ctx.db,
    `SELECT a.id, a.case_id, a.user_id, u.name as user_name, a.action, a.details_json, a.created_at
     FROM activity_logs a
     LEFT JOIN users u ON u.id = a.user_id
     WHERE a.case_id = ?
     ORDER BY a.created_at DESC
     LIMIT 100`,
    caseId,
  );

  return rows.map((r) => ({
    id: r.id,
    case_id: r.case_id,
    user_id: r.user_id,
    user_name: r.user_name,
    action: r.action,
    details: JSON.parse(r.details_json || '{}'),
    created_at: r.created_at,
  }));
}

export function addComment(
  ctx: Ctx,
  caseId: string,
  userId: string,
  input: z.infer<typeof CreateCommentInput>,
): CaseComment {
  requireCase(ctx.db, caseId);
  const id = newId('cmt');
  run(
    ctx.db,
    `INSERT INTO comments (id, case_id, user_id, target_type, target_id, content)
     VALUES (?, ?, ?, ?, ?, ?)`,
    id, caseId, userId, input.target_type, input.target_id, input.content,
  );

  logActivity(ctx, caseId, userId, 'comment_added', {
    target_type: input.target_type,
    target_id: input.target_id,
  });

  const user = get<{ name: string }>(ctx.db, 'SELECT name FROM users WHERE id = ?', userId);
  return {
    id,
    case_id: caseId,
    user_id: userId,
    user_name: user?.name ?? 'User',
    target_type: input.target_type,
    target_id: input.target_id,
    content: input.content,
    created_at: new Date().toISOString(),
  };
}

export function listComments(
  ctx: Ctx,
  caseId: string,
  targetType?: string,
  targetId?: string,
): CaseComment[] {
  requireCase(ctx.db, caseId);
  let sql = `
    SELECT c.id, c.case_id, c.user_id, u.name as user_name, c.target_type, c.target_id, c.content, c.created_at
    FROM comments c
    JOIN users u ON u.id = c.user_id
    WHERE c.case_id = ?
  `;
  const params: unknown[] = [caseId];
  if (targetType) {
    sql += ' AND c.target_type = ?';
    params.push(targetType);
  }
  if (targetId) {
    sql += ' AND c.target_id = ?';
    params.push(targetId);
  }
  sql += ' ORDER BY c.created_at ASC';

  const rows = all<{
    id: string;
    case_id: string;
    user_id: string;
    user_name: string;
    target_type: 'case' | 'finding' | 'event';
    target_id: string;
    content: string;
    created_at: string;
  }>(ctx.db, sql, ...params);

  return rows;
}

export function getPendingReviews(ctx: Ctx, caseId: string) {
  requireCase(ctx.db, caseId);
  const { summary: findingsSummary } = listFindings(ctx, caseId);
  const { events } = listTimeline(ctx, caseId);
  const checklist = getChecklist(ctx, caseId);

  const unreviewedEvents = events.filter((e) => e.review_status === 'unreviewed').length;
  const missingRecordsCount = checklist.filter((c) => c.status === 'missing' || c.status === 'requested').length;

  return {
    open_findings: findingsSummary.open,
    unreviewed_events: unreviewedEvents,
    missing_records: missingRecordsCount,
    ready_for_expert_signoff: findingsSummary.open === 0 && unreviewedEvents === 0,
  };
}
