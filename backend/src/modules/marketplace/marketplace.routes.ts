import { Router } from 'express';
import type { Ctx } from '../../core/context.ts';
import { parseInput } from '../../core/http/middleware.ts';
import {
  CreateReviewRequest,
  createReviewRequest,
  getExpertProfile,
  listExperts,
  listReviewRequests,
  saveExpertProfile,
  UpdateExpertProfile,
  UpdateRequestStatus,
  updateReviewRequest,
} from './marketplace.service.ts';

export function marketplaceRouter(ctx: Ctx): Router {
  const r = Router();

  r.get('/marketplace/experts', (req, res, next) => {
    try {
      const specialty = typeof req.query.specialty === 'string' ? req.query.specialty : undefined;
      const minExp = typeof req.query.min_exp === 'string' ? Number(req.query.min_exp) : undefined;
      res.json({ experts: listExperts(ctx, specialty, minExp) });
    } catch (err) {
      next(err);
    }
  });

  r.get('/marketplace/experts/:userId', (req, res, next) => {
    try {
      res.json({ expert: getExpertProfile(ctx, String(req.params.userId)) });
    } catch (err) {
      next(err);
    }
  });

  r.post('/marketplace/profile', (req, res, next) => {
    try {
      const input = parseInput(UpdateExpertProfile, req.body ?? {});
      const expert = saveExpertProfile(ctx, req.user!.id, input);
      res.json({ expert });
    } catch (err) {
      next(err);
    }
  });

  r.post('/marketplace/requests', (req, res, next) => {
    try {
      const input = parseInput(CreateReviewRequest, req.body ?? {});
      const request = createReviewRequest(ctx, req.user!.id, input);
      res.status(201).json({ request });
    } catch (err) {
      next(err);
    }
  });

  r.get('/marketplace/requests', (req, res, next) => {
    try {
      res.json({ requests: listReviewRequests(ctx, req.user!.id) });
    } catch (err) {
      next(err);
    }
  });

  r.patch('/marketplace/requests/:requestId', (req, res, next) => {
    try {
      const input = parseInput(UpdateRequestStatus, req.body ?? {});
      const updated = updateReviewRequest(ctx, String(req.params.requestId), input, req.user!.id);
      res.json({ request: updated });
    } catch (err) {
      next(err);
    }
  });

  return r;
}
