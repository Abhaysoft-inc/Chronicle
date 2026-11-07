import type { RequestHandler } from 'express';
import type { Ctx } from '../../core/context.ts';
import { AppError } from '../../core/errors.ts';
import { readSession } from './auth.service.ts';
import { readCookie, SESSION_COOKIE, setSessionCookie } from './cookie.ts';

/** Everything registered after this needs a signed-in user. Sets req.user. */
export function requireAuth(ctx: Ctx): RequestHandler {
  return (req, _res, next) => {
    const token = readCookie(req.headers.cookie, SESSION_COOKIE);
    const found = token ? readSession(ctx, token) : null;
    if (!token || !found) return next(new AppError(401, 'unauthenticated', 'Please sign in to continue.'));
    req.user = found.user;
    req.sessionToken = token;
    if (found.extended) setSessionCookie(_res, token, found.extended.expiresAt);
    next();
  };
}
