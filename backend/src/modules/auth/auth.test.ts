import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import { FakeChat, FakeDocAi } from '../../testing/fakes.ts';
import { addTestUser, json, makePdf, startTestEnv, uploadForm, waitFor, type TestEnv } from '../../testing/helpers.ts';
import { LoginLimiter } from './login-limiter.ts';
import { hashPassword, verifyPassword } from './password.ts';

let env: TestEnv; // a clean server: no users yet, so the first sign-up is "the first user"
const docai = new FakeDocAi();
const chat = new FakeChat();

before(async () => {
  env = await startTestEnv({ docai, chat }, {}, { signedIn: false });
});
after(() => env.close());

const call = (p: string, init: RequestInit = {}) => fetch(`${env.url}${p}`, init);
const send = (p: string, body: unknown, cookie = '') =>
  call(p, { method: 'POST', headers: { 'content-type': 'application/json', ...(cookie ? { cookie } : {}) }, body: JSON.stringify(body) });
const cookieOf = (res: Response) => (res.headers.getSetCookie()[0] ?? '').split(';')[0]!;
const PW = 'correct-horse-9';

test('passwords: hashed with scrypt and a random salt, verified in constant form', async () => {
  const a = await hashPassword(PW);
  const b = await hashPassword(PW);
  assert.match(a, /^scrypt\$32768\$8\$1\$/);
  assert.notEqual(a, b, 'a fresh salt each time, so equal passwords do not give equal hashes');
  assert.ok(!a.includes(PW));
  assert.equal(await verifyPassword(PW, a), true);
  assert.equal(await verifyPassword('wrong-password', a), false);
  assert.equal(await verifyPassword(PW, 'not$a$valid$hash'), false);
});

test('login limiter: locks after the limit, per key, and forgives after the window', () => {
  let t = 1_000_000;
  const l = new LoginLimiter(3, 60_000, () => t);
  for (let i = 0; i < 3; i++) { assert.equal(l.retryAfter('a'), 0); l.fail('a'); }
  assert.ok(l.retryAfter('a') > 0 && l.retryAfter('a') <= 60);
  assert.equal(l.retryAfter('b'), 0, 'other keys are unaffected');
  t += 61_000;
  assert.equal(l.retryAfter('a'), 0, 'the window passed');
  l.fail('a'); l.succeed('a');
  assert.equal(l.retryAfter('a'), 0);
});

test('sign-up: the first user adopts cases made before accounts existed; the second does not', async () => {
  env.ctx.db.exec(`INSERT INTO cases (id, owner_id, title) VALUES ('c_old', NULL, 'Made before accounts')`);

  const res = await send('/auth/signup', { name: '  Asha Rao ', email: 'Asha@Example.com ', password: PW });
  assert.equal(res.status, 201);
  const { user } = await json(res);
  assert.deepEqual({ name: user.name, email: user.email }, { name: 'Asha Rao', email: 'asha@example.com' }); // trimmed, lower-cased
  assert.equal(user.password_hash, undefined, 'the hash never leaves the server');

  const owner = env.ctx.db.prepare(`SELECT owner_id FROM cases WHERE id = 'c_old'`).get() as { owner_id: string };
  assert.equal(owner.owner_id, user.id);

  const second = await json(await send('/auth/signup', { name: 'Ben', email: 'ben@example.com', password: PW }));
  env.ctx.db.exec(`INSERT INTO cases (id, owner_id, title) VALUES ('c_old2', NULL, 'Another orphan')`);
  const stillOrphan = env.ctx.db.prepare(`SELECT owner_id FROM cases WHERE id = 'c_old2'`).get() as { owner_id: string | null };
  assert.equal(stillOrphan.owner_id, null, 'only the very first account adopts old cases');
  assert.notEqual(second.user.id, user.id);
});

test('sign-up sets a hardened session cookie, and /me recognises it', async () => {
  const res = await send('/auth/signup', { name: 'Cora', email: 'cora@example.com', password: PW });
  const raw = res.headers.getSetCookie()[0]!;
  assert.match(raw, /^chronicle_session=/);
  assert.match(raw, /HttpOnly/i);
  assert.match(raw, /SameSite=Lax/i);
  assert.match(raw, /Path=\//);
  assert.match(raw, /Expires=/i);

  const me = await json(await call('/auth/me', { headers: { cookie: cookieOf(res) } }));
  assert.equal(me.user.email, 'cora@example.com');
  assert.equal((await json(await call('/auth/me'))).user, null, 'signed out: 200 with user null, not an error');

  // only a hash of the token is stored, so a leaked database cannot be replayed as cookies
  const token = cookieOf(res).split('=')[1]!;
  const stored = env.ctx.db.prepare('SELECT token_hash FROM sessions').all() as { token_hash: string }[];
  assert.ok(stored.length > 0 && stored.every((s) => s.token_hash !== token));
  const pw = env.ctx.db.prepare(`SELECT password_hash FROM users WHERE email = 'cora@example.com'`).get() as { password_hash: string };
  assert.match(pw.password_hash, /^scrypt\$/);
});

test('sign-up rejects bad input with readable messages, and duplicate emails (any case)', async () => {
  const weak = await send('/auth/signup', { name: 'Dev', email: 'dev@example.com', password: 'short' });
  assert.equal(weak.status, 400);
  assert.ok(JSON.stringify(await json(weak)).includes('at least 8 characters'));

  assert.equal((await send('/auth/signup', { name: 'Dev', email: 'not-an-email', password: PW })).status, 400);
  assert.equal((await send('/auth/signup', { name: '   ', email: 'dev@example.com', password: PW })).status, 400);

  const dup = await send('/auth/signup', { name: 'Asha again', email: 'ASHA@example.com', password: PW });
  assert.equal(dup.status, 409);
  assert.equal((await json(dup)).error.code, 'email_taken');
});

test('login: right password signs in; wrong password and unknown email give the SAME answer', async () => {
  const ok = await send('/auth/login', { email: 'ASHA@example.com', password: PW });
  assert.equal(ok.status, 200);
  assert.match(ok.headers.getSetCookie()[0] ?? '', /chronicle_session=/);

  const wrong = await send('/auth/login', { email: 'asha@example.com', password: 'nope-nope-nope' });
  const unknown = await send('/auth/login', { email: 'nobody@example.com', password: 'nope-nope-nope' });
  assert.equal(wrong.status, 401);
  assert.equal(unknown.status, 401);
  assert.deepEqual(await json(wrong), await json(unknown), 'the form must not reveal which emails have accounts');
});

test('protected routes need a valid session; logout ends exactly that session', async () => {
  assert.equal((await call('/cases')).status, 401);
  assert.equal((await call('/cases', { headers: { cookie: 'chronicle_session=garbage' } })).status, 401);
  assert.equal((await call('/dashboard')).status, 401);

  const signedIn = cookieOf(await send('/auth/login', { email: 'asha@example.com', password: PW }));
  const other = cookieOf(await send('/auth/login', { email: 'asha@example.com', password: PW }));
  assert.equal((await call('/cases', { headers: { cookie: signedIn } })).status, 200);

  assert.equal((await send('/auth/logout', {}, signedIn)).status, 200);
  assert.equal((await call('/cases', { headers: { cookie: signedIn } })).status, 401, 'that session is gone');
  assert.equal((await call('/cases', { headers: { cookie: other } })).status, 200, 'other devices stay signed in');
});

test('sessions expire, and active ones are extended', async () => {
  const cookie = cookieOf(await send('/auth/login', { email: 'asha@example.com', password: PW }));
  const hash = (await import('node:crypto')).createHash('sha256').update(cookie.split('=')[1]!).digest('hex');

  // nearly expired (less than half the lifetime left): using it pushes the expiry out again
  const soon = new Date(Date.now() + 60_000).toISOString();
  env.ctx.db.prepare('UPDATE sessions SET expires_at = ? WHERE token_hash = ?').run(soon, hash);
  assert.equal((await call('/cases', { headers: { cookie } })).status, 200);
  const extended = env.ctx.db.prepare('SELECT expires_at FROM sessions WHERE token_hash = ?').get(hash) as { expires_at: string };
  assert.ok(new Date(extended.expires_at).getTime() > Date.now() + 10 * 86_400_000, 'extended by about SESSION_DAYS');

  // expired: refused, and the row is deleted
  env.ctx.db.prepare('UPDATE sessions SET expires_at = ? WHERE token_hash = ?').run(new Date(Date.now() - 1000).toISOString(), hash);
  assert.equal((await call('/cases', { headers: { cookie } })).status, 401);
  assert.equal(env.ctx.db.prepare('SELECT 1 FROM sessions WHERE token_hash = ?').get(hash), undefined);
});

test('too many wrong passwords lock that account-and-address for a while', async () => {
  const email = 'lockme@example.com';
  await send('/auth/signup', { name: 'Lock', email, password: PW });
  let last: Response | undefined;
  for (let i = 0; i < 10; i++) last = await send('/auth/login', { email, password: `wrong-${i}-password` });
  assert.equal(last!.status, 401);

  const locked = await send('/auth/login', { email, password: PW }); // even the RIGHT password is refused while locked
  assert.equal(locked.status, 429);
  assert.equal((await json(locked)).error.code, 'too_many_attempts');
  assert.ok(Number(locked.headers.get('retry-after')) > 0);

  // a different account from the same address is not locked
  assert.equal((await send('/auth/login', { email: 'asha@example.com', password: PW })).status, 200);
});

test('people can only see and change their OWN cases (others get 404, same as missing)', async () => {
  const a = await addTestUser(env.ctx, 'Alice', 'alice@iso.test');
  const b = await addTestUser(env.ctx, 'Bob', 'bob@iso.test');
  const asA = (p: string, init: RequestInit = {}) => call(p, { ...init, headers: { cookie: a.cookie, ...(init.headers as object) } });
  const asB = (p: string, init: RequestInit = {}) => call(p, { ...init, headers: { cookie: b.cookie, ...(init.headers as object) } });

  const caseId = (await json(await asA('/cases', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ title: 'Alice only' }) }))).case.id as string;
  const up = await json(await asA(`/cases/${caseId}/documents`, { method: 'POST', body: uploadForm([{ name: 'a.pdf', bytes: await makePdf(2) }], 'hi-IN') }));
  const docId = up.documents[0].id as string;
  assert.equal((await asA(`/cases/${caseId}/process`, { method: 'POST' })).status, 202);
  await waitFor(async () => (await json(await asA(`/cases/${caseId}/pipeline`))).status === 'processed');
  const eventId = (await json(await asA(`/cases/${caseId}/timeline`))).events[0].id as string;

  const patch = { method: 'PATCH', headers: { 'content-type': 'application/json' }, body: '{"review_status":"confirmed"}' };
  for (const [what, res] of [
    ['case', await asB(`/cases/${caseId}`)],
    ['documents', await asB(`/cases/${caseId}/documents`)],
    ['upload', await asB(`/cases/${caseId}/documents`, { method: 'POST', body: uploadForm([{ name: 'x.pdf', bytes: await makePdf(1) }]) })],
    ['process', await asB(`/cases/${caseId}/process`, { method: 'POST' })],
    ['pipeline', await asB(`/cases/${caseId}/pipeline`)],
    ['stream', await asB(`/cases/${caseId}/stream`)],
    ['timeline', await asB(`/cases/${caseId}/timeline`)],
    ['original file', await asB(`/documents/${docId}/file`)],
    ['page', await asB(`/documents/${docId}/pages/1`)],
    ['event patch', await asB(`/events/${encodeURIComponent(eventId)}`, patch)],
  ] as const) {
    assert.equal(res.status, 404, `Bob must not reach Alice's ${what}`);
  }

  assert.equal((await json(await asB('/cases'))).cases.length, 0, "Bob's list does not include Alice's case");
  assert.equal((await json(await asA('/cases'))).cases.length, 1);
  // and Bob's attempt changed nothing
  assert.equal((await json(await asA(`/cases/${caseId}/timeline`))).events[0].review_status, 'unreviewed');
  assert.equal((await asA(`/events/${encodeURIComponent(eventId)}`, patch)).status, 200, 'the owner still can');
});

test('sign-up can be switched off', async () => {
  const closed = await startTestEnv({ docai, chat }, { ALLOW_SIGNUP: 'false' }, { signedIn: false });
  try {
    const res = await fetch(`${closed.url}/auth/signup`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ name: 'X', email: 'x@y.test', password: PW }) });
    assert.equal(res.status, 403);
    assert.equal((await res.json() as any).error.code, 'signup_disabled');
    assert.equal(((await (await fetch(`${closed.url}/auth/me`)).json()) as any).signupOpen, false);
  } finally {
    await closed.close();
  }
});

test('CORS lets the browser send the session cookie to the API', async () => {
  const res = await call('/auth/me', { headers: { Origin: 'http://localhost:3000' } });
  assert.equal(res.headers.get('access-control-allow-credentials'), 'true');
  assert.equal(res.headers.get('access-control-allow-origin'), 'http://localhost:3000');
});
