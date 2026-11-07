import { Router } from 'express';
import type { Ctx } from '../../core/context.ts';
import { caseOwner } from '../../core/http/ownership.ts';
import { generateBrief, getBrief } from './brief.service.ts';

export function briefRouter(ctx: Ctx): Router {
  const router = Router();
  router.param('caseId', caseOwner(ctx));

  router.get('/cases/:caseId/brief', (req, res, next) => {
    try {
      const caseId = String(req.params.caseId);
      const brief = getBrief(ctx, caseId);

      if (req.query.format === 'md') {
        res.setHeader('Content-Type', 'text/markdown; charset=utf-8');
        res.setHeader('Content-Disposition', `attachment; filename="brief-${caseId}.md"`);
        res.send(brief.content_md);
        return;
      }

      res.json({ brief });
    } catch (err) {
      next(err);
    }
  });

  router.post('/cases/:caseId/brief', async (req, res, next) => {
    try {
      const brief = await generateBrief(ctx, String(req.params.caseId));
      res.json({ brief });
    } catch (err) {
      next(err);
    }
  });

  return router;
}
