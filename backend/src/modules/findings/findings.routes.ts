import { Router } from 'express';
import type { Ctx } from '../../core/context.ts';
import { parseInput } from '../../core/http/middleware.ts';
import { caseOwner } from '../../core/http/ownership.ts';
import { PatchFinding } from './findings.schema.ts';
import { listFindings, patchFinding } from './findings.service.ts';

export function findingsRouter(ctx: Ctx): Router {
  const router = Router();
  router.param('caseId', caseOwner(ctx));

  router.get('/cases/:caseId/findings', (req, res, next) => {
    try {
      res.json(listFindings(ctx, String(req.params.caseId)));
    } catch (err) {
      next(err);
    }
  });

  router.patch('/findings/:id', (req, res, next) => {
    try {
      const parsed = parseInput(PatchFinding, req.body ?? {});
      res.json(patchFinding(ctx, String(req.params.id), parsed.status));
    } catch (err) {
      next(err);
    }
  });

  return router;
}
