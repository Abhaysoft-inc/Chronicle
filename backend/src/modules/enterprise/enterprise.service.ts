import { createHash, randomBytes } from 'node:crypto';
import fs from 'node:fs';
import { z } from 'zod';
import type { Ctx } from '../../core/context.ts';
import { all, get, newId, run, tx } from '../../core/db/index.ts';
import { requireCase } from '../../core/db/lookups.ts';
import { badRequest, notFound } from '../../core/errors.ts';

export const UpdateOrgInput = z.object({
  name: z.string().trim().min(2).max(100).optional(),
  plan: z.enum(['starter', 'professional', 'enterprise']).optional(),
  quota_pages: z.coerce.number().int().positive().optional(),
});

export const CreateKeyInput = z.object({
  name: z.string().trim().min(1).max(80),
});

const sha256 = (s: string) => createHash('sha256').update(s).digest('hex');

export interface OrganizationInfo {
  id: string;
  name: string;
  plan: string;
  quota_pages: number;
  pages_used: number;
  created_at: string;
}

export interface ApiKeyItem {
  id: string;
  name: string;
  prefix: string;
  created_at: string;
  revoked_at: string | null;
}

export function getOrCreateOrg(ctx: Ctx, userId: string): OrganizationInfo {
  const user = get<{ org_id: string | null }>(ctx.db, 'SELECT org_id FROM users WHERE id = ?', userId);
  let orgId = user?.org_id;

  if (orgId) {
    const existing = get<OrganizationInfo>(ctx.db, 'SELECT * FROM organizations WHERE id = ?', orgId);
    if (existing) return existing;
  }

  // Create default organization
  orgId = newId('org');
  run(
    ctx.db,
    `INSERT INTO organizations (id, name, plan, quota_pages, pages_used)
     VALUES (?, 'MedLex Legal Services', 'professional', 2500, 0)`,
    orgId,
  );
  run(ctx.db, 'UPDATE users SET org_id = ? WHERE id = ?', orgId, userId);

  return get<OrganizationInfo>(ctx.db, 'SELECT * FROM organizations WHERE id = ?', orgId)!;
}

export function updateOrg(ctx: Ctx, userId: string, input: z.infer<typeof UpdateOrgInput>): OrganizationInfo {
  const org = getOrCreateOrg(ctx, userId);
  run(
    ctx.db,
    `UPDATE organizations SET
      name = COALESCE(?, name),
      plan = COALESCE(?, plan),
      quota_pages = COALESCE(?, quota_pages)
     WHERE id = ?`,
    input.name ?? null, input.plan ?? null, input.quota_pages ?? null, org.id,
  );
  return get<OrganizationInfo>(ctx.db, 'SELECT * FROM organizations WHERE id = ?', org.id)!;
}

export function getUsageAnalytics(ctx: Ctx, userId: string) {
  const org = getOrCreateOrg(ctx, userId);

  const stats = get<{ total_cases: number; total_docs: number; total_pages: number; total_audio: number }>(
    ctx.db,
    `SELECT
       (SELECT COUNT(*) FROM cases) as total_cases,
       (SELECT COUNT(*) FROM documents) as total_docs,
       (SELECT COUNT(*) FROM pages) as total_pages,
       (SELECT COUNT(*) FROM audio_records) as total_audio`,
  )!;

  // Update org usage
  run(ctx.db, 'UPDATE organizations SET pages_used = ? WHERE id = ?', stats.total_pages, org.id);

  return {
    organization: { ...org, pages_used: stats.total_pages },
    usage: {
      cases_count: stats.total_cases,
      documents_count: stats.total_docs,
      pages_processed: stats.total_pages,
      audio_recordings_count: stats.total_audio,
      quota_remaining: Math.max(0, org.quota_pages - stats.total_pages),
      quota_percentage: Math.min(100, Math.round((stats.total_pages / (org.quota_pages || 1)) * 100)),
    },
  };
}

export function createApiKey(ctx: Ctx, userId: string, name: string): { key: string; apiKey: ApiKeyItem } {
  const org = getOrCreateOrg(ctx, userId);
  const secret = randomBytes(24).toString('base64url');
  const fullKey = `mlx_live_${secret}`;
  const prefix = fullKey.slice(0, 12);
  const keyHash = sha256(fullKey);
  const id = newId('key');

  run(
    ctx.db,
    `INSERT INTO api_keys (id, org_id, user_id, key_hash, name, prefix)
     VALUES (?, ?, ?, ?, ?, ?)`,
    id, org.id, userId, keyHash, name, prefix,
  );

  return {
    key: fullKey,
    apiKey: {
      id,
      name,
      prefix,
      created_at: new Date().toISOString(),
      revoked_at: null,
    },
  };
}

export function listApiKeys(ctx: Ctx, userId: string): ApiKeyItem[] {
  return all<ApiKeyItem>(
    ctx.db,
    'SELECT id, name, prefix, created_at, revoked_at FROM api_keys WHERE user_id = ? ORDER BY created_at DESC',
    userId,
  );
}

export function revokeApiKey(ctx: Ctx, keyId: string, userId: string): void {
  run(
    ctx.db,
    `UPDATE api_keys SET revoked_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id = ? AND user_id = ?`,
    keyId, userId,
  );
}

/** Complete deletion of all case data for DPDP / GDPR data retention compliance. */
export function purgeCaseData(ctx: Ctx, caseId: string): { success: boolean; purged_id: string } {
  requireCase(ctx.db, caseId);

  // Find all file paths
  const docs = all<{ path: string }>(ctx.db, 'SELECT path FROM documents WHERE case_id = ?', caseId);
  const chunks = all<{ path: string }>(
    ctx.db,
    'SELECT c.path FROM ocr_chunks c JOIN documents d ON d.id = c.document_id WHERE d.case_id = ?',
    caseId,
  );

  // Delete physical files
  for (const d of docs) {
    try {
      if (fs.existsSync(d.path)) fs.unlinkSync(d.path);
    } catch {
      // ignore
    }
  }
  for (const c of chunks) {
    try {
      if (fs.existsSync(c.path)) fs.unlinkSync(c.path);
    } catch {
      // ignore
    }
  }

  // Delete database record (cascading deletes children)
  run(ctx.db, 'DELETE FROM cases WHERE id = ?', caseId);
  return { success: true, purged_id: caseId };
}

/** Complete JSON archive export of case data. */
export function exportCaseArchive(ctx: Ctx, caseId: string) {
  const caseRow = requireCase(ctx.db, caseId);
  const events = all(ctx.db, 'SELECT * FROM events WHERE case_id = ?', caseId);
  const findings = all(ctx.db, 'SELECT * FROM findings WHERE case_id = ?', caseId);
  const documents = all(ctx.db, 'SELECT id, filename, sha256, mime, page_count, language, created_at FROM documents WHERE case_id = ?', caseId);
  const brief = get(ctx.db, 'SELECT * FROM briefs WHERE case_id = ?', caseId);

  return {
    version: '1.0',
    exported_at: new Date().toISOString(),
    case: caseRow,
    documents,
    events,
    findings,
    brief,
  };
}
