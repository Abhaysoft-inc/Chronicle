import path from 'node:path';
import express, { type Express } from 'express';
import type { Ctx } from './core/context.ts';
import { cors, errorHandler, tokenAuth } from './core/http/middleware.ts';
import { AppError } from './core/errors.ts';
import { authRouter, requireAuth } from './modules/auth/index.ts';
import { casesRouter } from './modules/cases/index.ts';
import { dashboardRouter } from './modules/dashboard/index.ts';
import { documentsRouter } from './modules/documents/index.ts';
import { findingsRouter } from './modules/findings/index.ts';
import { briefRouter } from './modules/brief/index.ts';
import { pipelineRouter } from './modules/pipeline/index.ts';
import { timelineRouter } from './modules/timeline/index.ts';
import { recordsRouter } from './modules/records/index.ts';
import { copilotRouter } from './modules/copilot/index.ts';
import { voiceRouter } from './modules/voice/index.ts';
import { collaborationRouter } from './modules/collaboration/index.ts';
import { marketplaceRouter } from './modules/marketplace/index.ts';
import { insuranceRouter } from './modules/insurance/index.ts';
import { auditRouter } from './modules/audit/index.ts';
import { enterpriseRouter } from './modules/enterprise/index.ts';

/** Build the HTTP app. Each module contributes one router under /api. */
export function createApp(ctx: Ctx): Express {
  const app = express();
  app.disable('x-powered-by');
  app.use(cors(ctx.config.CLIENT_ORIGIN, process.env.NODE_ENV !== 'production'));
  app.use(express.json({ limit: '1mb' }));

  app.get('/health', (_req, res) => {
    res.json({
      ok: true,
      sarvamKeyConfigured: Boolean(ctx.config.SARVAM_API_KEY),
      cacheOnly: ctx.config.CACHE_ONLY,
    });
  });

  // Developer test console (plain HTML, no build). Not served in production.
  if (process.env.NODE_ENV !== 'production') {
    app.use('/test', express.static(path.join(import.meta.dirname, '..', 'tools', 'test-console')));
    app.get('/', (_req, res) => res.redirect('/test/'));
  }

  const api = express.Router();
  api.use(tokenAuth(ctx.config));
  api.use('/auth', authRouter(ctx)); // public: sign up / in / out
  api.use(requireAuth(ctx)); // everything below needs a signed-in user
  api.use(dashboardRouter(ctx));
  api.use(casesRouter(ctx));
  api.use(documentsRouter(ctx));
  api.use(findingsRouter(ctx));
  api.use(briefRouter(ctx));
  api.use(pipelineRouter(ctx));
  api.use(timelineRouter(ctx));
  api.use(recordsRouter(ctx));
  api.use(copilotRouter(ctx));
  api.use(voiceRouter(ctx));
  api.use(collaborationRouter(ctx));
  api.use(marketplaceRouter(ctx));
  api.use(insuranceRouter(ctx));
  api.use(auditRouter(ctx));
  api.use(enterpriseRouter(ctx));
  app.use('/api', api);

  app.use((req, _res, next) => next(new AppError(404, 'not_found', `No route for ${req.method} ${req.path}`)));
  app.use(errorHandler);
  return app;
}
