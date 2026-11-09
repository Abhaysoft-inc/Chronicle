import { Router } from 'express';
import type { Ctx } from '../../core/context.ts';
import { parseInput } from '../../core/http/middleware.ts';
import { caseOwner } from '../../core/http/ownership.ts';
import { CreateFinding, PatchFinding } from './findings.schema.ts';
import { createExpertFinding, listFindings, patchFinding } from './findings.service.ts';

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

  router.post('/cases/:caseId/findings', (req, res, next) => {
    try {
      const input = parseInput(CreateFinding, req.body ?? {});
      res.status(201).json({ finding: createExpertFinding(ctx, String(req.params.caseId), input, req.user!.id) });
    } catch (err) {
      next(err);
    }
  });

  router.patch('/findings/:id', (req, res, next) => {
    try {
      const parsed = parseInput(PatchFinding, req.body ?? {});
      res.json(patchFinding(ctx, String(req.params.id), parsed, req.user?.id));
    } catch (err) {
      next(err);
    }
  });

  return router;
}
