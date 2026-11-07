import type { ErrorRequestHandler, RequestHandler } from 'express';
import multer from 'multer';
import { ZodError, type z } from 'zod';
import type { Config } from '../../config/index.ts';
import { QuotaError, CacheMissError } from '../../integrations/sarvam/http.ts';
import { AppError, badRequest } from '../errors.ts';

/** Validate untrusted input against a Zod schema, or throw a 400 listing what is wrong. */
export function parseInput<S extends z.ZodType>(schema: S, data: unknown): z.infer<S> {
  const r = schema.safeParse(data);
  if (!r.success) {
    throw badRequest(
      'Invalid input',
      r.error.issues.map((i) => ({ path: i.path.join('.'), message: i.message })),
    );
  }
  return r.data;
}

/** Optional shared token (API_TOKEN). Not user accounts, just a guard for the demo server. */
export function tokenAuth(cfg: Pick<Config, 'API_TOKEN'>): RequestHandler {
  return (req, res, next) => {
    if (!cfg.API_TOKEN) return next();
    // Browsers cannot set headers on an EventSource, so the SSE route also accepts ?token=.
    // (Query strings can end up in logs; fine for this demo guard, not for real secrets.)
    const supplied = req.header('x-api-token') ?? (req.path.endsWith('/stream') ? String(req.query.token ?? '') : '');
    if (supplied === cfg.API_TOKEN) return next();
    res.status(401).json({ error: { code: 'unauthorized', message: 'Missing or wrong x-api-token header' } });
  };
}

const LOCAL_ORIGIN = /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/;

/**
 * Allow the configured client origin. With `allowLocalhost` (dev only) any localhost / 127.0.0.1
 * port is also allowed, so the test console works from Live Server (:5500) or the Next.js app.
 */
export function cors(allowed: string, allowLocalhost = false): RequestHandler {
  return (req, res, next) => {
    const origin = req.header('origin');
    const ok = origin && (origin === allowed || (allowLocalhost && LOCAL_ORIGIN.test(origin)));
    res.setHeader('Vary', 'Origin');
    res.setHeader('Access-Control-Allow-Credentials', 'true'); // the session cookie travels with API calls
    res.setHeader('Access-Control-Allow-Origin', ok ? origin : allowed);
    res.setHeader('Access-Control-Allow-Headers', 'content-type, x-api-token');
    res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PATCH,OPTIONS');
    if (req.method === 'OPTIONS') {
      res.status(204).end();
      return;
    }
    next();
  };
}

/** One error format for the whole API: { error: { code, message, details } }. */
export const errorHandler: ErrorRequestHandler = (err, _req, res, _next) => {
  const send = (status: number, code: string, message: string, details?: unknown) =>
    res.status(status).json({ error: { code, message, ...(details === undefined ? {} : { details }) } });

  if (err instanceof AppError) return send(err.status, err.code, err.message, err.details);
  if (err instanceof ZodError) return send(400, 'validation_error', 'Invalid input', err.issues);
  if (err instanceof multer.MulterError) {
    return send(err.code === 'LIMIT_FILE_SIZE' ? 413 : 400, 'upload_error', err.message);
  }
  if (err instanceof QuotaError) return send(402, 'sarvam_credits_exhausted', err.message);
  if (err instanceof CacheMissError) return send(409, 'cache_miss', err.message);
  if (err instanceof SyntaxError && 'body' in err) return send(400, 'bad_json', 'Request body is not valid JSON');

  console.error(err);
  return send(500, 'internal_error', 'Something went wrong on our side');
};
