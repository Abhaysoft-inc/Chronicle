import { Router } from 'express';
import type { Ctx } from '../../core/context.ts';
import { parseInput } from '../../core/http/middleware.ts';
import { caseOwner, eventOwner } from '../../core/http/ownership.ts';
import { listTimeline, PatchEvent, patchEvent } from './timeline.service.ts';

export function timelineRouter(ctx: Ctx): Router {
  const r = Router();
  r.param('caseId', caseOwner(ctx));
  r.param('id', eventOwner(ctx));

  // ?verified=true returns only events whose every quote was found in the OCR text.
  r.get('/cases/:caseId/timeline', (req, res) => {
    res.json(listTimeline(ctx, String(req.params.caseId), { verifiedOnly: req.query.verified === 'true' }));
  });

  r.patch('/events/:id', (req, res) => {
    res.json(patchEvent(ctx, String(req.params.id), parseInput(PatchEvent, req.body ?? {})));
  });

  return r;
}
