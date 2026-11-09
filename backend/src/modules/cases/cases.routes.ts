import { Router } from 'express';
import type { Ctx } from '../../core/context.ts';
import { parseInput } from '../../core/http/middleware.ts';
import { caseOwner } from '../../core/http/ownership.ts';
import {
  AssignCaseInput,
  assignCase,
  CreateCase,
  createCase,
  getCaseDetail,
  listAssignments,
  listCases,
  removeAssignment,
  UpdateMetadata,
  updateCaseMetadata,
  UpdateStatus,
  updateCaseStatus,
} from './cases.service.ts';

export function casesRouter(ctx: Ctx): Router {
  const r = Router();
  r.param('caseId', caseOwner(ctx));

  // req.user is set by requireAuth, which runs before every router in this app.
  r.post('/cases', (req, res) => {
    res.status(201).json({ case: createCase(ctx, parseInput(CreateCase, req.body ?? {}), req.user!.id) });
  });

  r.get('/cases', (req, res) => {
    res.json({ cases: listCases(ctx, req.user!.id, req.user?.role) });
  });

  r.get('/cases/:caseId', (req, res) => {
    res.json(getCaseDetail(ctx, String(req.params.caseId)));
  });

  r.patch('/cases/:caseId/metadata', (req, res) => {
    const updated = updateCaseMetadata(ctx, String(req.params.caseId), parseInput(UpdateMetadata, req.body ?? {}));
    res.json({ metadata: updated });
  });

  r.patch('/cases/:caseId/status', (req, res) => {
    const { status } = parseInput(UpdateStatus, req.body ?? {});
    res.json(updateCaseStatus(ctx, String(req.params.caseId), status));
  });

  r.post('/cases/:caseId/assign', (req, res) => {
    const input = parseInput(AssignCaseInput, req.body ?? {});
    const assignments = assignCase(ctx, String(req.params.caseId), input.user_id, input.role, req.user!.id);
    res.json({ assignments });
  });

  r.get('/cases/:caseId/assignments', (req, res) => {
    res.json({ assignments: listAssignments(ctx, String(req.params.caseId)) });
  });

  r.delete('/cases/:caseId/assignments/:userId', (req, res) => {
    const assignments = removeAssignment(ctx, String(req.params.caseId), String(req.params.userId));
    res.json({ assignments });
  });

  return r;
}
