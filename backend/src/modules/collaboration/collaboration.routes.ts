import { Router } from 'express';
import type { Ctx } from '../../core/context.ts';
import { parseInput } from '../../core/http/middleware.ts';
import { caseOwner } from '../../core/http/ownership.ts';
import { addComment, CreateCommentInput, getActivityLogs, getPendingReviews, listComments } from './collaboration.service.ts';

export function collaborationRouter(ctx: Ctx): Router {
  const r = Router();
  r.param('caseId', caseOwner(ctx));

  r.post('/cases/:caseId/comments', (req, res, next) => {
    try {
      const input = parseInput(CreateCommentInput, req.body ?? {});
      const comment = addComment(ctx, String(req.params.caseId), req.user!.id, input);
      res.status(201).json({ comment });
    } catch (err) {
      next(err);
    }
  });

  r.get('/cases/:caseId/comments', (req, res, next) => {
    try {
      const targetType = typeof req.query.target_type === 'string' ? req.query.target_type : undefined;
      const targetId = typeof req.query.target_id === 'string' ? req.query.target_id : undefined;
      res.json({ comments: listComments(ctx, String(req.params.caseId), targetType, targetId) });
    } catch (err) {
      next(err);
    }
  });

  r.get('/cases/:caseId/activities', (req, res, next) => {
    try {
      res.json({ activities: getActivityLogs(ctx, String(req.params.caseId)) });
    } catch (err) {
      next(err);
    }
  });

  r.get('/cases/:caseId/pending-reviews', (req, res, next) => {
    try {
      res.json(getPendingReviews(ctx, String(req.params.caseId)));
    } catch (err) {
      next(err);
    }
  });

  return r;
}
