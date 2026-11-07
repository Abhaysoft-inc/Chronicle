import type { Ctx } from '../../core/context.ts';
import { all, get, run } from '../../core/db/index.ts';
import { requireCase } from '../../core/db/lookups.ts';
import { badRequest } from '../../core/errors.ts';
import { ingestCase } from '../documents/index.ts';
import { extractCase } from '../extraction/index.ts';
import { ocrCase } from '../ocr/index.ts';
import { verifyCase } from '../verification/index.ts';
import { publishProgress, type ProgressSnapshot, type ProgressStage } from './pipeline.events.ts';

// Each stage is idempotent: it only does work that is not done yet. So "resume after a
// failure" and "re-run after adding a document" are the same operation.
type StageFn = (ctx: Ctx, caseId: string) => Promise<string | void> | string | void;

const STAGE_FNS: [name: string, fn: StageFn][] = [
  ['ingest', (ctx, id) => ingestCase(ctx, id)],
  ['ocr', async (ctx, id) => {
    const { failedChunks } = await ocrCase(ctx, id);
    return failedChunks ? `${failedChunks} chunk(s) failed OCR; those pages are excluded` : undefined;
  }],
  ['extract', (ctx, id) => extractCase(ctx, id)],
  ['verify', (ctx, id) => {
    const { checked, failed } = verifyCase(ctx, id);
    return `${checked} quote(s) checked, ${failed} failed verification`;
  }],
];

export const STAGES = STAGE_FNS.map(([n]) => n);

const inFlight = new Set<string>();

function setStage(ctx: Ctx, caseId: string, stage: string, status: string, progress: string | null = null, error: string | null = null) {
  run(
    ctx.db,
    `INSERT INTO pipeline_runs (case_id, stage, status, progress, error, updated_at)
     VALUES (?, ?, ?, ?, ?, strftime('%Y-%m-%dT%H:%M:%fZ','now'))
     ON CONFLICT (case_id, stage) DO UPDATE SET
       status = excluded.status, progress = excluded.progress, error = excluded.error, updated_at = excluded.updated_at`,
    caseId, stage, status, progress, error,
  );
  publish(ctx, caseId);
}

function setCaseStatus(ctx: Ctx, caseId: string, status: string) {
  run(ctx.db, 'UPDATE cases SET status = ? WHERE id = ?', status, caseId);
  publish(ctx, caseId);
}

export function getProgress(ctx: Ctx, caseId: string): ProgressStage[] {
  const rows = all<ProgressStage>(
    ctx.db,
    'SELECT stage, status, progress, error, updated_at FROM pipeline_runs WHERE case_id = ?',
    caseId,
  );
  const byStage = new Map(rows.map((r) => [r.stage, r]));
  return STAGES.map((stage) => byStage.get(stage) ?? { stage, status: 'pending', progress: null, error: null, updated_at: null });
}

/** Case status + every stage: the full current picture. Sent first on connect, then on every change. */
export function getSnapshot(ctx: Ctx, caseId: string): ProgressSnapshot {
  const c = get<{ status: string }>(ctx.db, 'SELECT status FROM cases WHERE id = ?', caseId);
  return { status: c?.status ?? 'unknown', stages: getProgress(ctx, caseId) };
}

function publish(ctx: Ctx, caseId: string) {
  publishProgress(caseId, getSnapshot(ctx, caseId));
}

/** Run every stage in order and wait for it. Throws on the first failed stage. */
export async function runPipeline(ctx: Ctx, caseId: string): Promise<void> {
  requireCase(ctx.db, caseId);
  setCaseStatus(ctx, caseId, 'processing');
  for (const [stage] of STAGE_FNS) setStage(ctx, caseId, stage, 'pending');

  let warnings = false;
  for (const [stage, fn] of STAGE_FNS) {
    setStage(ctx, caseId, stage, 'running');
    try {
      const note = await fn(ctx, caseId);
      if (stage === 'ocr' && note) warnings = true;
      setStage(ctx, caseId, stage, 'done', note ?? null);
    } catch (err) {
      setStage(ctx, caseId, stage, 'failed', null, (err as Error).message.slice(0, 500));
      setCaseStatus(ctx, caseId, 'failed');
      throw err;
    }
  }
  setCaseStatus(ctx, caseId, warnings ? 'processed_with_warnings' : 'processed');
}

/** Kick off the pipeline in the background. Returns false if it is already running. */
export function startPipeline(ctx: Ctx, caseId: string): boolean {
  requireCase(ctx.db, caseId);
  const docs = get<{ n: number }>(ctx.db, 'SELECT COUNT(*) AS n FROM documents WHERE case_id = ?', caseId)!.n;
  if (docs === 0) throw badRequest('Upload at least one document before processing.');
  if (inFlight.has(caseId)) return false;
  inFlight.add(caseId);
  runPipeline(ctx, caseId)
    .catch((err) => console.error(`[pipeline] case ${caseId} failed: ${(err as Error).message}`))
    .finally(() => inFlight.delete(caseId));
  return true;
}

/** On boot: anything left "running" was killed mid-way. Mark it so a re-run is obvious. */
export function recoverInterrupted(ctx: Ctx): void {
  run(ctx.db, `UPDATE pipeline_runs SET status = 'failed', error = 'Interrupted by server restart' WHERE status = 'running'`);
  run(ctx.db, `UPDATE cases SET status = 'interrupted' WHERE status = 'processing'`);
}
