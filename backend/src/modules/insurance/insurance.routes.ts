import { Router } from 'express';
import { z } from 'zod';
import type { Ctx } from '../../core/context.ts';
import { parseInput } from '../../core/http/middleware.ts';
import { caseOwner } from '../../core/http/ownership.ts';
import { analyzeInsuranceClaim, AnalyzeClaimInput, getInsuranceClaim, updateClaimStatus } from './insurance.service.ts';

const StatusInput = z.object({
  status: z.enum(['pending', 'under_investigation', 'approved', 'flagged']),
});

export function insuranceRouter(ctx: Ctx): Router {
  const r = Router();
  r.param('caseId', caseOwner(ctx));

  r.post('/cases/:caseId/insurance/analyze', (req, res, next) => {
    try {
      const input = parseInput(AnalyzeClaimInput, req.body ?? {});
      const result = analyzeInsuranceClaim(ctx, String(req.params.caseId), input);
      res.json({ claim: result });
    } catch (err) {
      next(err);
    }
  });

  r.get('/cases/:caseId/insurance', (req, res, next) => {
    try {
      res.json({ claim: getInsuranceClaim(ctx, String(req.params.caseId)) });
    } catch (err) {
      next(err);
    }
  });

  r.patch('/cases/:caseId/insurance/status', (req, res, next) => {
    try {
      const { status } = parseInput(StatusInput, req.body ?? {});
      res.json({ claim: updateClaimStatus(ctx, String(req.params.caseId), status) });
    } catch (err) {
      next(err);
    }
  });

  return r;
}
