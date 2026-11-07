import { Router } from 'express';
import type { Ctx } from '../../core/context.ts';
import { parseInput } from '../../core/http/middleware.ts';
import { caseOwner } from '../../core/http/ownership.ts';
import { CreateCase, createCase, getCaseDetail, listCases } from './cases.service.ts';

export function casesRouter(ctx: Ctx): Router {
  const r = Router();
  r.param('caseId', caseOwner(ctx));

  // req.user is set by requireAuth, which runs before every router in this app.
  r.post('/cases', (req, res) => {
    res.status(201).json({ case: createCase(ctx, parseInput(CreateCase, req.body ?? {}), req.user!.id) });
  });

  r.get('/cases', (req, res) => {
    res.json({ cases: listCases(ctx, req.user!.id) });
  });

  r.get('/cases/:caseId', (req, res) => {
    res.json(getCaseDetail(ctx, String(req.params.caseId)));
  });

  return r;
}
