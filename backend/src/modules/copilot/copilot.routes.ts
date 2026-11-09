import { Router } from 'express';
import type { Ctx } from '../../core/context.ts';
import { parseInput } from '../../core/http/middleware.ts';
import { caseOwner } from '../../core/http/ownership.ts';
import { askCopilot, clearCopilotHistory, CopilotAskInput, getCopilotHistory } from './copilot.service.ts';

export function copilotRouter(ctx: Ctx): Router {
  const r = Router();
  r.param('caseId', caseOwner(ctx));

  r.post('/cases/:caseId/copilot/ask', async (req, res, next) => {
    try {
      const input = parseInput(CopilotAskInput, req.body ?? {});
      const message = await askCopilot(ctx, String(req.params.caseId), input.question, req.user!.id);
      res.json({ message });
    } catch (err) {
      next(err);
    }
  });

  r.get('/cases/:caseId/copilot/history', (req, res, next) => {
    try {
      res.json({ messages: getCopilotHistory(ctx, String(req.params.caseId)) });
    } catch (err) {
      next(err);
    }
  });

  r.delete('/cases/:caseId/copilot/history', (req, res, next) => {
    try {
      clearCopilotHistory(ctx, String(req.params.caseId));
      res.json({ ok: true });
    } catch (err) {
      next(err);
    }
  });

  return r;
}
