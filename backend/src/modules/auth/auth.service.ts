import { createHash, randomBytes } from 'node:crypto';
import { z } from 'zod';
import type { Ctx } from '../../core/context.ts';
import { get, newId, run, tx } from '../../core/db/index.ts';
import { AppError } from '../../core/errors.ts';
import type { AuthUser } from '../../core/http/auth-user.ts';
import { hashPassword, verifyAgainstDummy, verifyPassword } from './password.ts';

export const SignupInput = z.object({
  name: z.string().trim().min(1, 'Enter your name').max(80),
  email: z.string().trim().toLowerCase().email('Enter a valid email address').max(254),
  password: z.string().min(8, 'Use at least 8 characters').max(128, 'Use at most 128 characters'),
});

export const LoginInput = z.object({
  email: z.string().trim().toLowerCase().email('Enter a valid email address'),
  password: z.string().min(1, 'Enter your password').max(128),
});

const sha256 = (s: string) => createHash('sha256').update(s).digest('hex');
const DAY = 86_400_000;

interface UserRow extends AuthUser {
  password_hash: string;
}

export interface Session {
  token: string;
  expiresAt: Date;
}

/** Start a session for an existing user. Returns the token to put in the cookie. */
export function createSession(ctx: Ctx, userId: string): Session {
  const token = randomBytes(32).toString('base64url'); // 256 bits: not guessable
  const expiresAt = new Date(Date.now() + ctx.config.SESSION_DAYS * DAY);
  run(ctx.db, 'INSERT INTO sessions (token_hash, user_id, expires_at) VALUES (?, ?, ?)', sha256(token), userId, expiresAt.toISOString());
  return { token, expiresAt };
}

/** Delete sessions that have already expired. Cheap, and keeps the table from growing for ever. */
function purgeExpired(ctx: Ctx): void {
  run(ctx.db, 'DELETE FROM sessions WHERE expires_at <= ?', new Date().toISOString());
}

export async function signup(ctx: Ctx, raw: unknown): Promise<{ user: AuthUser; session: Session }> {
  if (!ctx.config.ALLOW_SIGNUP) throw new AppError(403, 'signup_disabled', 'New accounts are turned off on this server.');
  const input = SignupInput.parse(raw);
  if (get(ctx.db, 'SELECT 1 AS x FROM users WHERE email = ?', input.email)) {
    throw new AppError(409, 'email_taken', 'An account with this email already exists. Try signing in.');
  }
  const passwordHash = await hashPassword(input.password);
  const id = newId('u');
  const session = tx(ctx.db, () => {
    const isFirstUser = get<{ n: number }>(ctx.db, 'SELECT COUNT(*) AS n FROM users')!.n === 0;
    run(ctx.db, 'INSERT INTO users (id, email, name, password_hash) VALUES (?, ?, ?, ?)', id, input.email, input.name, passwordHash);
    // Cases created before accounts existed have no owner. The first person to sign up adopts them.
    if (isFirstUser) run(ctx.db, 'UPDATE cases SET owner_id = ? WHERE owner_id IS NULL', id);
    return createSession(ctx, id);
  });
  return { user: { id, email: input.email, name: input.name }, session };
}

/** Create a user without a request (tests, the fake dev server). */
export async function createUser(ctx: Ctx, name: string, email: string, password: string): Promise<AuthUser> {
  const input = SignupInput.parse({ name, email, password });
  const id = newId('u');
  run(ctx.db, 'INSERT INTO users (id, email, name, password_hash) VALUES (?, ?, ?, ?)', id, input.email, input.name, await hashPassword(input.password));
  return { id, email: input.email, name: input.name };
}

export async function login(ctx: Ctx, raw: unknown): Promise<{ user: AuthUser; session: Session }> {
  const input = LoginInput.parse(raw);
  const row = get<UserRow>(ctx.db, 'SELECT id, email, name, password_hash FROM users WHERE email = ?', input.email);
  const ok = row ? await verifyPassword(input.password, row.password_hash) : await verifyAgainstDummy(input.password);
  // One message for "no such account" and "wrong password", so the form cannot be used to find accounts.
  if (!row || !ok) throw new AppError(401, 'invalid_credentials', 'Incorrect email or password.');
  purgeExpired(ctx);
  return { user: { id: row.id, email: row.email, name: row.name }, session: createSession(ctx, row.id) };
}

export function logout(ctx: Ctx, token: string): void {
  run(ctx.db, 'DELETE FROM sessions WHERE token_hash = ?', sha256(token));
}

/**
 * Who does this cookie belong to? Expired sessions are deleted. A session that is more than half
 * used is extended, so people who keep working are not signed out mid-review.
 */
export function readSession(ctx: Ctx, token: string): { user: AuthUser; extended: Session | null } | null {
  const row = get<AuthUser & { expires_at: string }>(
    ctx.db,
    `SELECT u.id, u.email, u.name, s.expires_at FROM sessions s JOIN users u ON u.id = s.user_id WHERE s.token_hash = ?`,
    sha256(token),
  );
  if (!row) return null;
  const expires = new Date(row.expires_at).getTime();
  if (expires <= Date.now()) {
    logout(ctx, token);
    return null;
  }
  const total = ctx.config.SESSION_DAYS * DAY;
  if (expires - Date.now() < total / 2) {
    const newExpiry = new Date(Date.now() + total);
    run(ctx.db, 'UPDATE sessions SET expires_at = ? WHERE token_hash = ?', newExpiry.toISOString(), sha256(token));
    return { user: { id: row.id, email: row.email, name: row.name }, extended: { token, expiresAt: newExpiry } };
  }
  return { user: { id: row.id, email: row.email, name: row.name }, extended: null };
}
