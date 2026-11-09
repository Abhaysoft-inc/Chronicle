import { Router } from 'express';
import type { Ctx } from '../../core/context.ts';
import { parseInput } from '../../core/http/middleware.ts';
import { caseOwner } from '../../core/http/ownership.ts';
import { getChecklist, PatchChecklistItem, setChecklistItem } from './records.service.ts';

export function recordsRouter(ctx: Ctx): Router {
  const r = Router();
  r.param('caseId', caseOwner(ctx));

  r.get('/cases/:caseId/checklist', (req, res) => {
    res.json({ items: getChecklist(ctx, String(req.params.caseId)) });
  });

  r.patch('/cases/:caseId/checklist/:docType', (req, res) => {
    const items = setChecklistItem(ctx, String(req.params.caseId), String(req.params.docType), parseInput(PatchChecklistItem, req.body ?? {}), req.user!.id);
    res.json({ items });
  });

  return r;
}
