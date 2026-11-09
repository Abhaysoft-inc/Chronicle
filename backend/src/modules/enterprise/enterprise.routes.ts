import { Router } from 'express';
import type { Ctx } from '../../core/context.ts';
import { parseInput } from '../../core/http/middleware.ts';
import { caseOwner } from '../../core/http/ownership.ts';
import {
  CreateKeyInput,
  createApiKey,
  exportCaseArchive,
  getOrCreateOrg,
  getUsageAnalytics,
  listApiKeys,
  purgeCaseData,
  revokeApiKey,
  UpdateOrgInput,
  updateOrg,
} from './enterprise.service.ts';

export function enterpriseRouter(ctx: Ctx): Router {
  const r = Router();
  r.param('caseId', caseOwner(ctx));

  r.get('/admin/organization', (req, res, next) => {
    try {
      res.json({ organization: getOrCreateOrg(ctx, req.user!.id) });
    } catch (err) {
      next(err);
    }
  });

  r.patch('/admin/organization', (req, res, next) => {
    try {
      const input = parseInput(UpdateOrgInput, req.body ?? {});
      res.json({ organization: updateOrg(ctx, req.user!.id, input) });
    } catch (err) {
      next(err);
    }
  });

  r.get('/admin/usage', (req, res, next) => {
    try {
      res.json(getUsageAnalytics(ctx, req.user!.id));
    } catch (err) {
      next(err);
    }
  });

  r.post('/admin/api-keys', (req, res, next) => {
    try {
      const input = parseInput(CreateKeyInput, req.body ?? {});
      const result = createApiKey(ctx, req.user!.id, input.name);
      res.status(201).json(result);
    } catch (err) {
      next(err);
    }
  });

  r.get('/admin/api-keys', (req, res, next) => {
    try {
      res.json({ api_keys: listApiKeys(ctx, req.user!.id) });
    } catch (err) {
      next(err);
    }
  });

  r.delete('/admin/api-keys/:id', (req, res, next) => {
    try {
      revokeApiKey(ctx, String(req.params.id), req.user!.id);
      res.json({ ok: true });
    } catch (err) {
      next(err);
    }
  });

  r.post('/cases/:caseId/purge', (req, res, next) => {
    try {
      res.json(purgeCaseData(ctx, String(req.params.caseId)));
    } catch (err) {
      next(err);
    }
  });

  r.get('/cases/:caseId/export', (req, res, next) => {
    try {
      res.json(exportCaseArchive(ctx, String(req.params.caseId)));
    } catch (err) {
      next(err);
    }
  });

  return r;
}
