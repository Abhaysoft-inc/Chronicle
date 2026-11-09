import { Router } from 'express';
import type { Ctx } from '../../core/context.ts';
import { caseOwner } from '../../core/http/ownership.ts';
import { getClinicalAudit, runClinicalAudit } from './audit.service.ts';

export function auditRouter(ctx: Ctx): Router {
  const r = Router();
  r.param('caseId', caseOwner(ctx));

  r.get('/cases/:caseId/clinical-audit', (req, res, next) => {
    try {
      res.json({ audit: getClinicalAudit(ctx, String(req.params.caseId)) });
    } catch (err) {
      next(err);
    }
  });

  r.post('/cases/:caseId/clinical-audit/run', (req, res, next) => {
    try {
      res.json({ audit: runClinicalAudit(ctx, String(req.params.caseId)) });
    } catch (err) {
      next(err);
    }
  });

  return r;
}
