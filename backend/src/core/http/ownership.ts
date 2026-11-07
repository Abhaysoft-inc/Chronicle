import type { RequestParamHandler } from 'express';
import type { Ctx } from '../context.ts';
import { get } from '../db/index.ts';
import { notFound } from '../errors.ts';

// "Is this yours?" checks, run by Express before any route with that parameter. A thing that is
// someone else's answers 404, exactly like one that does not exist, so ids cannot be probed.
// Register on a router:  r.param('caseId', caseOwner(ctx));

function check(ctx: Ctx, sql: string, id: string, what: string, userId: string | undefined): void {
  const row = get<{ owner_id: string | null }>(ctx.db, sql, id);
  if (!row || !userId || row.owner_id !== userId) throw notFound(`${what} ${id}`);
}

export const caseOwner = (ctx: Ctx): RequestParamHandler => (req, _res, next, id) => {
  try {
    check(ctx, 'SELECT owner_id FROM cases WHERE id = ?', String(id), 'Case', req.user?.id);
    next();
  } catch (err) {
    next(err);
  }
};

export const documentOwner = (ctx: Ctx): RequestParamHandler => (req, _res, next, id) => {
  try {
    check(ctx, 'SELECT c.owner_id FROM documents d JOIN cases c ON c.id = d.case_id WHERE d.id = ?', String(id), 'Document', req.user?.id);
    next();
  } catch (err) {
    next(err);
  }
};

export const eventOwner = (ctx: Ctx): RequestParamHandler => (req, _res, next, id) => {
  try {
    check(ctx, 'SELECT c.owner_id FROM events e JOIN cases c ON c.id = e.case_id WHERE e.id = ?', String(id), 'Event', req.user?.id);
    next();
  } catch (err) {
    next(err);
  }
};
