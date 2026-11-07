import fs from 'node:fs';
import type { AddressInfo } from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { PDFDocument } from 'pdf-lib';
import { createApp } from '../app.ts';
import { createContext } from '../bootstrap.ts';
import { loadConfig, type Config } from '../config/index.ts';
import type { Ctx } from '../core/context.ts';
import { openDb } from '../core/db/index.ts';
import { createSession, createUser, SESSION_COOKIE } from '../modules/auth/index.ts';

export interface TestEnv {
  ctx: Ctx;
  url: string;
  dir: string;
  /** Cookie header value for the default signed-in test user ('' when started with signedIn: false). */
  cookie: string;
  /** The default test user's id ('' when signedIn is false). */
  userId: string;
  close(): Promise<void>;
}

/** A user plus the Cookie header that signs a request in as them. */
export async function addTestUser(ctx: Ctx, name: string, email: string): Promise<{ id: string; cookie: string }> {
  const user = await createUser(ctx, name, email, 'test-password-1');
  return { id: user.id, cookie: `${SESSION_COOKIE}=${createSession(ctx, user.id).token}` };
}

/**
 * In-memory DB + temp data dir + the real HTTP app on a random port. Pass fakes via overrides.
 * By default a user is already signed in (use env.cookie); pass { signedIn: false } for auth tests.
 */
export async function startTestEnv(
  overrides: Partial<Ctx> & { fetchImpl?: typeof fetch } = {},
  env: Record<string, string> = {},
  opts: { signedIn?: boolean } = {},
): Promise<TestEnv> {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'chronicle-test-'));
  const config: Config = loadConfig({ DATA_DIR: dir, DOCAI_POLL_SECONDS: '0', SARVAM_API_KEY: 'test-key', ...env });
  const db = openDb(':memory:');
  const ctx = createContext(config, db, overrides);
  const me = opts.signedIn === false ? null : await addTestUser(ctx, 'Test Reviewer', 'reviewer@test.dev');
  const server = createApp(ctx).listen(0);
  await new Promise<void>((r) => server.once('listening', r));
  const { port } = server.address() as AddressInfo;
  return {
    ctx,
    url: `http://127.0.0.1:${port}/api`,
    dir,
    cookie: me?.cookie ?? '',
    userId: me?.id ?? '',
    close: async () => {
      await new Promise<void>((r) => server.close(() => r()));
      fs.rmSync(dir, { recursive: true, force: true });
    },
  };
}

export async function makePdf(pages: number): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  for (let i = 0; i < pages; i++) doc.addPage([200, 200]);
  return doc.save();
}

export async function pageCountOf(bytes: Uint8Array): Promise<number> {
  return (await PDFDocument.load(bytes)).getPageCount();
}

export async function waitFor<T>(fn: () => Promise<T | undefined | false>, ms = 5000): Promise<T> {
  const end = Date.now() + ms;
  for (;;) {
    const v = await fn();
    if (v) return v;
    if (Date.now() > end) throw new Error('waitFor timed out');
    await new Promise((r) => setTimeout(r, 20));
  }
}

export async function json(res: Response): Promise<any> {
  return res.json();
}

export function uploadForm(files: { name: string; bytes: Uint8Array; type?: string }[], language?: string): FormData {
  const form = new FormData();
  for (const f of files) form.append('files', new Blob([Buffer.from(f.bytes)], { type: f.type ?? 'application/pdf' }), f.name);
  if (language) form.append('language', language);
  return form;
}
