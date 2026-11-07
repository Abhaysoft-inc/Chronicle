import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import { FakeChat, FakeDocAi } from '../../testing/fakes.ts';
import { refreshOcrDetails } from '../ocr/index.ts';
import { json, makePdf, startTestEnv, uploadForm, waitFor, type TestEnv } from '../../testing/helpers.ts';

// --- tests ---------------------------------------------------------------------------

let env: TestEnv;
const docai = new FakeDocAi();
const chat = new FakeChat();

before(async () => {
  env = await startTestEnv({ docai, chat });
});
after(() => env.close());

// Every request is signed in as the default test user, like a browser holding the session cookie.
const api = (p: string, init: RequestInit = {}) =>
  fetch(`${env.url}${p}`, { ...init, headers: { cookie: env.cookie, ...(init.headers as object) } });
const post = (p: string, body: unknown) =>
  api(p, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });

async function processAndWait(caseId: string) {
  const res = await api(`/cases/${caseId}/process`, { method: 'POST' });
  assert.equal(res.status, 202);
  return waitFor(async () => {
    const p = await json(await api(`/cases/${caseId}/pipeline`));
    return ['processed', 'processed_with_warnings', 'failed'].includes(p.status) ? p : false;
  });
}

test('full pipeline over HTTP: 12-page Hindi PDF -> chunks -> blocks -> verified events', async () => {
  const created = await json(await post('/cases', { title: 'Test case', case_type: 'surgical', output_language: 'hi-IN' }));
  const caseId = created.case.id as string;

  // upload: a real PDF plus a text file disguised as a PDF
  const bad = await api(`/cases/${caseId}/documents`, {
    method: 'POST',
    body: uploadForm([{ name: 'evil.pdf', bytes: new TextEncoder().encode('not a pdf at all') }], 'hi-IN'),
  });
  assert.equal(bad.status, 400);

  const pdf12 = await makePdf(12); // pdf-lib stamps a creation time, so build once and reuse the bytes
  const up = await api(`/cases/${caseId}/documents`, {
    method: 'POST',
    body: uploadForm([{ name: 'नोट्स.pdf', bytes: pdf12 }], 'hi-IN'),
  });
  assert.equal(up.status, 201);
  const { documents } = await json(up);
  const docId = documents[0].id as string;
  assert.equal(documents[0].filename, 'नोट्स.pdf'); // Indic filename survives multer's latin-1 decoding

  const progress = await processAndWait(caseId);
  assert.equal(progress.status, 'processed', JSON.stringify(progress));

  // 12 pages -> chunks of 10 + 2 -> two OCR calls, language forwarded
  assert.equal(docai.calls.length, 2);
  assert.ok(docai.calls.every((c) => c.language === 'hi-IN'));

  // page mapping: block ids carry ORIGINAL page numbers, not chunk-local ones
  const p11 = await json(await api(`/documents/${docId}/pages/11`));
  assert.equal(p11.blocks[0].block_id, 'p11.b1');
  assert.match(p11.blocks[0].text, /पृष्ठ 11$/);
  // boxes, confidence and page size reach the API (this is what the page viewer draws)
  assert.deepEqual(p11.blocks[0].bbox, { x1: 40, y1: 60, x2: 360, y2: 100 });
  assert.deepEqual(p11.blocks[0].bbox_norm, [0.1, 0.1, 0.9, 0.17]);
  assert.equal(p11.blocks[0].confidence, 0.8);
  assert.equal(p11.blocks[0].tag, 'paragraph');
  assert.equal(p11.page.image_width, 400);
  assert.equal(p11.page.image_height, 600);
  assert.equal(p11.page.doc_type, 'doctor_notes');
  assert.equal((await api(`/documents/${docId}/pages/13`)).status, 400);

  // timeline: 12 honest events + 2 fabricated ones; code must catch exactly the 2
  const tl = await json(await api(`/cases/${caseId}/timeline`));
  assert.equal(tl.total, 14);
  assert.equal(tl.verified, 12);
  const invented = tl.events.find((e: any) => e.summary_en === 'INVENTED event');
  const wrongNum = tl.events.find((e: any) => e.summary_en === 'WRONG NUMBER event');
  assert.equal(invented.verified, false);
  assert.equal(invented.sources[0].verify_reason, 'low_similarity');
  assert.equal(wrongNum.verified, false);
  assert.equal(wrongNum.sources[0].verify_reason, 'digit_mismatch');
  assert.equal(invented.sources[0].quote_en_is_machine_generated, true);

  const onlyVerified = await json(await api(`/cases/${caseId}/timeline?verified=true`));
  assert.equal(onlyVerified.events.length, 12);
  assert.ok(onlyVerified.events.every((e: any) => e.verified));

  // case summary reports the unverified count
  const detail = await json(await api(`/cases/${caseId}`));
  assert.deepEqual(detail.events, { total: 14, unverified: 2 });
  assert.equal(detail.documents[0].page_count, 12);

  // re-running costs nothing: OCR is cached, extraction does not duplicate events
  const chatCalls = chat.requests.length;
  await processAndWait(caseId);
  assert.equal(docai.calls.length, 2);
  assert.equal(chat.requests.length, chatCalls);
  assert.equal((await json(await api(`/cases/${caseId}/timeline`))).total, 14);

  // uploading the same file again is recognised
  const dup = await json(await api(`/cases/${caseId}/documents`, {
    method: 'POST', body: uploadForm([{ name: 'copy.pdf', bytes: pdf12 }], 'hi-IN'),
  }));
  assert.equal(dup.documents[0].duplicate, true);
  assert.equal(dup.documents[0].id, docId); // same content -> same document, not a second copy
});

test('a person can correct an event without losing the original', async () => {
  const caseId = (await json(await post('/cases', { title: 'Correction case' }))).case.id as string;
  await api(`/cases/${caseId}/documents`, { method: 'POST', body: uploadForm([{ name: 'a.pdf', bytes: await makePdf(1) }], 'hi-IN') });
  await processAndWait(caseId);

  const ev = (await json(await api(`/cases/${caseId}/timeline`))).events[0];
  const res = await api(`/events/${encodeURIComponent(ev.id)}`, {
    method: 'PATCH', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ corrections: { summary_en: 'Patient had high fever', raw_date: '12/3/2026' } }),
  });
  assert.equal(res.status, 200);
  const after = (await json(await api(`/cases/${caseId}/timeline`))).events[0];
  assert.equal(after.review_status, 'corrected');
  assert.equal(after.summary_en, ev.summary_en); // original untouched
  assert.equal(after.corrected.summary_en, 'Patient had high fever');

  assert.equal((await api(`/events/${encodeURIComponent(ev.id)}`, {
    method: 'PATCH', headers: { 'content-type': 'application/json' }, body: '{}',
  })).status, 400);
  assert.equal((await api('/events/nope', { method: 'PATCH', headers: { 'content-type': 'application/json' }, body: '{"review_status":"confirmed"}' })).status, 404);
});

test('Tier 2 languages are OCR-read but withheld from analysis, with a visible warning', async () => {
  const caseId = (await json(await post('/cases', { title: 'Urdu case' }))).case.id as string;
  await api(`/cases/${caseId}/documents`, { method: 'POST', body: uploadForm([{ name: 'urdu.pdf', bytes: await makePdf(1) }], 'ur-IN') });
  const before = chat.requests.length;
  await processAndWait(caseId);

  assert.equal(chat.requests.length, before); // never sent to the LLM
  const detail = await json(await api(`/cases/${caseId}`));
  assert.equal(detail.events.total, 0);
  assert.equal(detail.page_issues.length, 1);
  assert.match(detail.page_issues[0].warning, /Urdu needs translation/);
});

test('input validation and errors use one consistent format', async () => {
  const bad = await post('/cases', { title: '', output_language: 'xx-YY' });
  assert.equal(bad.status, 400);
  const body = await json(bad);
  assert.equal(body.error.code, 'bad_request');
  assert.ok(body.error.details.length >= 1);

  const missing = await api('/cases/c_missing');
  assert.equal(missing.status, 404);
  assert.equal((await json(missing)).error.code, 'not_found');

  const noDocs = (await json(await post('/cases', { title: 'Empty' }))).case.id;
  assert.equal((await api(`/cases/${noDocs}/process`, { method: 'POST' })).status, 400);

  const badLang = await api(`/cases/${noDocs}/documents`, {
    method: 'POST', body: uploadForm([{ name: 'a.pdf', bytes: await makePdf(1) }], 'klingon'),
  });
  assert.equal(badLang.status, 400);
});

test('API token guard blocks requests without the token when API_TOKEN is set', async () => {
  const guarded = await startTestEnv({ docai, chat }, { API_TOKEN: 'secret' });
  try {
    assert.equal((await fetch(`${guarded.url}/cases`)).status, 401);
    assert.equal((await fetch(`${guarded.url}/cases`, { headers: { 'x-api-token': 'secret' } })).status, 401); // token ok, but not signed in
    assert.equal((await fetch(`${guarded.url}/cases`, { headers: { 'x-api-token': 'secret', cookie: guarded.cookie } })).status, 200);
  } finally {
    await guarded.close();
  }
});

test('CORS: localhost ports (Live Server, Next.js) are allowed in dev, other sites are not', async () => {
  const acao = async (origin: string) =>
    (await fetch(`${env.url}/cases`, { headers: { Origin: origin } })).headers.get('access-control-allow-origin');
  assert.equal(await acao('http://127.0.0.1:5500'), 'http://127.0.0.1:5500');
  assert.equal(await acao('http://localhost:3000'), 'http://localhost:3000');
  assert.equal(await acao('https://evil.example'), env.ctx.config.CLIENT_ORIGIN); // not echoed back

  const pre = await fetch(`${env.url}/cases`, {
    method: 'OPTIONS',
    headers: { Origin: 'http://127.0.0.1:5500', 'Access-Control-Request-Method': 'POST', 'Access-Control-Request-Headers': 'content-type,x-api-token' },
  });
  assert.equal(pre.status, 204);
  assert.match(pre.headers.get('access-control-allow-headers') ?? '', /x-api-token/);
});

/** Read an SSE response into parsed messages until `stop` says so (or a timeout). */
async function readSse(res: Response, stop: (m: { event: string; data: any }) => boolean, ms = 8000) {
  const reader = res.body!.getReader();
  const dec = new TextDecoder();
  const messages: { event: string; data: any }[] = [];
  let buf = '';
  const timer = setTimeout(() => reader.cancel(), ms);
  try {
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      buf += dec.decode(value, { stream: true });
      let i: number;
      while ((i = buf.indexOf('\n\n')) >= 0) {
        const block = buf.slice(0, i);
        buf = buf.slice(i + 2);
        const event = /^event: (.*)$/m.exec(block)?.[1];
        const data = /^data: (.*)$/m.exec(block)?.[1];
        if (!event || !data) continue; // "retry:" and ": ping" lines
        const m = { event, data: JSON.parse(data) };
        messages.push(m);
        if (stop(m)) return messages;
      }
    }
  } finally {
    clearTimeout(timer);
    await reader.cancel().catch(() => {});
  }
  return messages;
}

test('SSE: a snapshot first, then live updates until the case is processed (no polling)', async () => {
  const caseId = (await json(await post('/cases', { title: 'SSE case' }))).case.id as string;
  await api(`/cases/${caseId}/documents`, { method: 'POST', body: uploadForm([{ name: 's.pdf', bytes: await makePdf(2) }], 'hi-IN') });

  const stream = await api(`/cases/${caseId}/stream`);
  assert.equal(stream.status, 200);
  assert.match(stream.headers.get('content-type') ?? '', /text\/event-stream/);

  const collecting = readSse(stream, (m) => m.data.status === 'processed');
  await new Promise((r) => setTimeout(r, 100)); // let the snapshot arrive before we start the work
  assert.equal((await api(`/cases/${caseId}/process`, { method: 'POST' })).status, 202);
  const msgs = await collecting;

  assert.equal(msgs[0]!.event, 'snapshot');
  assert.equal(msgs[0]!.data.status, 'created');
  assert.ok(msgs.slice(1).every((m) => m.event === 'update'));
  const last = msgs[msgs.length - 1]!;
  assert.equal(last.data.status, 'processed');
  assert.deepEqual(last.data.stages.map((s: any) => s.status), ['done', 'done', 'done', 'done', 'done', 'done']);
  // we saw it move through states, not just the end result
  assert.ok(msgs.some((m) => m.data.status === 'processing'));
  assert.ok(msgs.some((m) => m.data.stages.some((s: any) => s.status === 'running')));

  // a client connecting AFTER the work is done still gets the truth immediately
  const late = await readSse(await api(`/cases/${caseId}/stream`), () => true);
  assert.equal(late[0]!.event, 'snapshot');
  assert.equal(late[0]!.data.status, 'processed');

  // unknown case -> ordinary JSON 404, not an empty stream
  assert.equal((await api('/cases/c_nope/stream')).status, 404);
});

test('SSE: the token can travel in ?token= (EventSource cannot send headers)', async () => {
  const guarded = await startTestEnv({ docai, chat }, { API_TOKEN: 'secret' });
  try {
    const hdr = { 'x-api-token': 'secret', 'content-type': 'application/json', cookie: guarded.cookie };
    const caseId = (await (await fetch(`${guarded.url}/cases`, { method: 'POST', headers: hdr, body: '{"title":"t"}' })).json() as any).case.id;
    const signedIn = { cookie: guarded.cookie };
    assert.equal((await fetch(`${guarded.url}/cases/${caseId}/stream`, { headers: signedIn })).status, 401);
    assert.equal((await fetch(`${guarded.url}/cases/${caseId}/stream?token=wrong`, { headers: signedIn })).status, 401);
    const ok = await fetch(`${guarded.url}/cases/${caseId}/stream?token=secret`, { headers: signedIn });
    assert.equal(ok.status, 200);
    await ok.body!.cancel();
    // the query token must NOT work on ordinary routes
    assert.equal((await fetch(`${guarded.url}/cases?token=secret`, { headers: signedIn })).status, 401);
  } finally {
    await guarded.close();
  }
});

test('refreshOcrDetails upgrades old blocks from the saved job output, and never touches text that differs', async () => {
  const caseId = (await json(await post('/cases', { title: 'Refresh case' }))).case.id as string;
  const up = await json(await api(`/cases/${caseId}/documents`, { method: 'POST', body: uploadForm([{ name: 'r.pdf', bytes: await makePdf(1) }], 'hi-IN') }));
  const docId = up.documents[0].id as string;
  await processAndWait(caseId);
  const eventsBefore = (await json(await api(`/cases/${caseId}/timeline`))).events.map((e: any) => `${e.id}:${e.verified}`);

  // Put the data back the way it was before boxes / confidence were captured.
  const old = (sql: string) => env.ctx.db.exec(sql.replace('DOC', `'${docId}'`));
  old(`UPDATE ocr_blocks SET tag = NULL, bbox_json = NULL, bbox_norm_json = NULL, confidence = NULL WHERE document_id = DOC`);
  old(`UPDATE pages SET image_width = NULL, image_height = NULL WHERE document_id = DOC`);
  let page = await json(await api(`/documents/${docId}/pages/1`));
  assert.equal(page.blocks[0].bbox_norm, null);
  assert.equal(page.blocks[0].confidence, null);

  const calls = docai.calls.length;
  const r = await refreshOcrDetails(env.ctx, docai, caseId);
  assert.deepEqual({ chunks: r.chunks, updated: r.blocksUpdated, skipped: r.skipped.length }, { chunks: 1, updated: 1, skipped: 0 });
  assert.equal(docai.calls.length, calls, 'refreshing must not run OCR again');

  page = await json(await api(`/documents/${docId}/pages/1`));
  assert.deepEqual(page.blocks[0].bbox_norm, [0.1, 0.1, 0.9, 0.17]);
  assert.equal(page.blocks[0].confidence, 0.8);
  assert.equal(page.blocks[0].tag, 'paragraph');
  assert.equal(page.page.image_width, 400);

  // events and their citations are untouched
  const eventsAfter = (await json(await api(`/cases/${caseId}/timeline`))).events.map((e: any) => `${e.id}:${e.verified}`);
  assert.deepEqual(eventsAfter, eventsBefore);

  // a block whose stored text differs from the saved output is skipped, not overwritten
  old(`UPDATE ocr_blocks SET text = 'edited', bbox_norm_json = NULL, confidence = NULL WHERE document_id = DOC`);
  const r2 = await refreshOcrDetails(env.ctx, docai, caseId);
  assert.equal(r2.blocksUpdated, 0);
  assert.equal(r2.skipped.length, 1);
  page = await json(await api(`/documents/${docId}/pages/1`));
  assert.equal(page.blocks[0].text, 'edited');
  assert.equal(page.blocks[0].confidence, null);
});
