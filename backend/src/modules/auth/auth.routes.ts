import { Router } from 'express';
import type { Ctx } from '../../core/context.ts';
import { AppError } from '../../core/errors.ts';
import { login, logout, readSession, signup } from './auth.service.ts';
import { clearSessionCookie, readCookie, SESSION_COOKIE, setSessionCookie } from './cookie.ts';
import { LoginLimiter } from './login-limiter.ts';

/** Public routes: sign up, sign in, sign out, and "who am I". Mounted before requireAuth. */
export function authRouter(ctx: Ctx, limiter = new LoginLimiter()): Router {
  const r = Router();

  r.post('/signup', async (req, res) => {
    const { user, session } = await signup(ctx, req.body ?? {});
    setSessionCookie(res, session.token, session.expiresAt);
    res.status(201).json({ user });
  });

  r.post('/login', async (req, res) => {
    // Keyed by address AND email: one person mistyping cannot lock everyone out, and one address
    // cannot try unlimited passwords against one account.
    const email = String((req.body as { email?: unknown } | undefined)?.email ?? '').trim().toLowerCase();
    const key = `${req.ip}|${email}`;
    const wait = limiter.retryAfter(key);
    if (wait > 0) {
      res.setHeader('Retry-After', String(wait));
      throw new AppError(429, 'too_many_attempts', `Too many failed attempts. Try again in ${Math.ceil(wait / 60)} minute(s).`);
    }
    try {
      const { user, session } = await login(ctx, req.body ?? {});
      limiter.succeed(key);
      setSessionCookie(res, session.token, session.expiresAt);
      res.json({ user });
    } catch (err) {
      if (err instanceof AppError && err.code === 'invalid_credentials') limiter.fail(key);
      throw err;
    }
  });

  r.post('/logout', (req, res) => {
    const token = readCookie(req.headers.cookie, SESSION_COOKIE);
    if (token) logout(ctx, token);
    clearSessionCookie(res);
    res.json({ ok: true });
  });

  // 200 with { user: null } when signed out, not 401: the app asks this on every page load, and a
  // 401 would show up as a red error in the browser console each time.
  r.get('/me', (req, res) => {
    const token = readCookie(req.headers.cookie, SESSION_COOKIE);
    const found = token ? readSession(ctx, token) : null;
    res.json({ user: found?.user ?? null, signupOpen: ctx.config.ALLOW_SIGNUP });
  });

  return r;
}
