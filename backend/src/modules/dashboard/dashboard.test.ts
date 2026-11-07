import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import { FakeChat, FakeDocAi } from '../../testing/fakes.ts';
import { addTestUser, json, makePdf, startTestEnv, uploadForm, waitFor, type TestEnv } from '../../testing/helpers.ts';

let env: TestEnv;
before(async () => {
  env = await startTestEnv({ docai: new FakeDocAi(), chat: new FakeChat() });
});
after(() => env.close());

const as = (cookie: string) => (p: string, init: RequestInit = {}) =>
  fetch(`${env.url}${p}`, { ...init, headers: { cookie, ...(init.headers as object) } });

test('the dashboard needs a sign-in', async () => {
  assert.equal((await fetch(`${env.url}/dashboard`)).status, 401);
});

test('an empty account gets zeros and a full 14-day axis, not errors', async () => {
  const empty = await addTestUser(env.ctx, 'New User', 'new@dash.test');
  const d = await json(await as(empty.cookie)('/dashboard'));
  assert.equal(d.totals.cases, 0);
  assert.equal(d.totals.events, 0);
  assert.equal(d.totals.verifiedRate, null, 'no events: a rate would be meaningless, so null');
  assert.equal(d.totals.avgConfidence, null);
  assert.deepEqual(d.eventsByType, []);
  assert.deepEqual(d.attention, []);
  assert.deepEqual(d.recentCases, []);
  assert.equal(d.eventsPerDay.length, 14);
  assert.ok(d.eventsPerDay.every((x: { count: number }) => x.count === 0));
});

test('figures add up for a processed case, count only the user\'s own data, and track reviews', async () => {
  const me = as(env.cookie);
  const caseId = (await json(await me('/cases', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ title: 'Stats case', case_type: 'surgical', output_language: 'hi-IN' }) }))).case.id as string;
  // 12 pages -> the fake model also invents 2 events on page 11 (one made-up quote, one wrong number)
  await me(`/cases/${caseId}/documents`, { method: 'POST', body: uploadForm([{ name: 's.pdf', bytes: await makePdf(12) }], 'hi-IN') });
  await me(`/cases/${caseId}/process`, { method: 'POST' });
  await waitFor(async () => (await json(await me(`/cases/${caseId}/pipeline`))).status === 'processed');

  let d = await json(await me('/dashboard'));
  assert.equal(d.totals.cases, 1);
  assert.equal(d.totals.documents, 1);
  assert.equal(d.totals.pages, 12);
  assert.equal(d.totals.pagesRead, 12);
  assert.equal(d.totals.events, 14);
  assert.equal(d.totals.verifiedEvents, 12);
  assert.equal(d.totals.unverifiedEvents, 2);
  assert.ok(Math.abs(d.totals.verifiedRate - 12 / 14) < 1e-9);
  assert.ok(Math.abs(d.totals.avgConfidence - 0.8) < 1e-9); // the fake OCR scores every block 0.8 (a float average, so not ===)
  assert.equal(d.totals.casesInProgress, 0);
  assert.deepEqual(d.review, { unreviewed: 14, confirmed: 0, corrected: 0, rejected: 0 });
  assert.deepEqual(d.eventsByType, [{ type: 'symptom_report', count: 14 }]);
  assert.equal(d.eventsPerDay.at(-1).count, 14, 'today is the last bar, and all 14 were extracted today');

  // the case needing a look is surfaced, with the reason in plain words
  assert.equal(d.attention.length, 1);
  assert.equal(d.attention[0].caseId, caseId);
  assert.deepEqual(d.attention[0].reasons, ['2 events not verified']);
  assert.deepEqual(d.recentCases[0], { id: caseId, title: 'Stats case', caseType: 'surgical', status: 'processed', createdAt: d.recentCases[0].createdAt, documents: 1, events: 14, reviewed: 0, unverified: 2 });

  // reviews move the numbers
  const events = (await json(await me(`/cases/${caseId}/timeline`))).events as { id: string }[];
  const patch = (id: string, status: string) => me(`/events/${encodeURIComponent(id)}`, { method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ review_status: status }) });
  await patch(events[0]!.id, 'confirmed');
  await patch(events[1]!.id, 'confirmed');
  await patch(events[2]!.id, 'rejected');
  d = await json(await me('/dashboard'));
  assert.deepEqual(d.review, { unreviewed: 11, confirmed: 2, corrected: 0, rejected: 1 });
  assert.equal(d.recentCases[0].reviewed, 3);

  // another account sees none of it
  const other = await addTestUser(env.ctx, 'Other', 'other@dash.test');
  const theirs = await json(await as(other.cookie)('/dashboard'));
  assert.equal(theirs.totals.cases, 0);
  assert.equal(theirs.totals.events, 0);
  assert.deepEqual(theirs.recentCases, []);
});
