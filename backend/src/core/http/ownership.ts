import type { RequestParamHandler } from 'express';
import type { Ctx } from '../context.ts';
import { get } from '../db/index.ts';
import { notFound } from '../errors.ts';

// "Is this yours?" checks, run by Express before any route with that parameter. A thing that is
// someone else's answers 404, exactly like one that does not exist, so ids cannot be probed.
// Register on a router:  r.param('caseId', caseOwner(ctx));

function checkCaseAccess(ctx: Ctx, caseId: string, userId: string | undefined): void {
  const row = get<{ owner_id: string | null }>(ctx.db, 'SELECT owner_id FROM cases WHERE id = ?', caseId);
  if (!row || !userId) throw notFound(`Case ${caseId}`);
  if (row.owner_id === userId) return;
  const assigned = get<{ id: string }>(ctx.db, 'SELECT id FROM case_assignments WHERE case_id = ? AND user_id = ?', caseId, userId);
  if (assigned) return;
  const user = get<{ role: string }>(ctx.db, 'SELECT role FROM users WHERE id = ?', userId);
  if (user?.role === 'admin') return;
  throw notFound(`Case ${caseId}`);
}

export const caseOwner = (ctx: Ctx): RequestParamHandler => (req, _res, next, id) => {
  try {
    checkCaseAccess(ctx, String(id), req.user?.id);
    next();
  } catch (err) {
    next(err);
  }
};

export const documentOwner = (ctx: Ctx): RequestParamHandler => (req, _res, next, id) => {
  try {
    const doc = get<{ case_id: string }>(ctx.db, 'SELECT case_id FROM documents WHERE id = ?', String(id));
    if (!doc) throw notFound(`Document ${id}`);
    checkCaseAccess(ctx, doc.case_id, req.user?.id);
    next();
  } catch (err) {
    next(err);
  }
};

export const eventOwner = (ctx: Ctx): RequestParamHandler => (req, _res, next, id) => {
  try {
    const ev = get<{ case_id: string }>(ctx.db, 'SELECT case_id FROM events WHERE id = ?', String(id));
    if (!ev) throw notFound(`Event ${id}`);
    checkCaseAccess(ctx, ev.case_id, req.user?.id);
    next();
  } catch (err) {
    next(err);
  }
};
