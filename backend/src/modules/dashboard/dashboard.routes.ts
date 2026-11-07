import { Router } from 'express';
import type { Ctx } from '../../core/context.ts';
import { getDashboard } from './dashboard.service.ts';

export function dashboardRouter(ctx: Ctx): Router {
  const r = Router();
  r.get('/dashboard', (req, res) => {
    res.json(getDashboard(ctx, req.user!.id));
  });
  return r;
}
