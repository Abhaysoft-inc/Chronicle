import { test } from 'node:test';
import assert from 'node:assert/strict';
import AdmZip from 'adm-zip';
import { extractBlocks, makeDocAi, OcrFormatError, readParseZip } from './docai.ts';
import { QuotaError } from './http.ts';

const cfg = { SARVAM_API_KEY: 'k', SARVAM_BASE_URL: 'https://api.test', DOCAI_RPM: 6000, DOCAI_POLL_SECONDS: 0 };

function zipOf(primaryJson: unknown): Buffer {
  const z = new AdmZip();
  z.addFile('manifest.json', Buffer.from('{}'));
  z.addFile('doc.pdf/doc.json', Buffer.from(JSON.stringify(primaryJson)));
  z.addFile('doc.pdf/metadata/page_001.json', Buffer.from('{}'));
  return z.toBuffer();
}

const sample = {
  pages: [
    { page_number: 1, blocks: [{ text: 'मरीज़ को बुखार है', tag: 'paragraph', bbox: [1, 2, 3, 4] }] },
    { page_number: 2, blocks: [{ text: 'BP 120/80', tag: 'line', bbox: [5, 6, 7, 8] }] },
  ],
};

test('parse: sends the right request, polls, downloads without the API key', async () => {
  const seen: { url: string; method: string; headers: Headers; form?: FormData }[] = [];
  let polls = 0;
  const fakeFetch = (async (url: string | URL | Request, init?: RequestInit) => {
    const u = String(url);
    const headers = new Headers(init?.headers);
    seen.push({ url: u, method: init?.method ?? 'GET', headers, form: init?.body instanceof FormData ? init.body : undefined });
    if (u.endsWith('/doc-ai/v1/job/parse')) return Response.json({ job_id: 'job1', status: 'pending', run_id: 'r' }, { status: 201 });
    if (u.endsWith('/job1/status')) return Response.json({ status: ++polls < 3 ? 'running' : 'completed' });
    if (u.endsWith('/job1/download-url')) return Response.json({ method: 'GET', url: 'https://files.test/out.zip' });
    if (u === 'https://files.test/out.zip') return new Response(new Uint8Array(zipOf(sample)));
    return new Response('unexpected', { status: 500 });
  }) as typeof fetch;

  const r = await makeDocAi(cfg, fakeFetch).parse({
    bytes: new Uint8Array([1, 2, 3]), filename: 'x.pdf', mime: 'application/pdf', language: 'hi-IN',
  });

  assert.equal(r.jobId, 'job1');
  assert.equal(r.status, 'completed');
  assert.equal(r.pageCount, 2);
  assert.equal(r.blocks.length, 2);
  assert.deepEqual(r.blocks[0], { page: 1, text: 'मरीज़ को बुखार है', tag: 'paragraph', bbox: [1, 2, 3, 4], bboxNorm: null, confidence: null });

  const submit = seen.find((s) => s.url.endsWith('/parse'))!;
  assert.equal(submit.method, 'POST');
  assert.equal(submit.headers.get('api-subscription-key'), 'k');
  assert.equal(submit.form!.get('output_format'), 'json');
  assert.equal(submit.form!.get('language'), 'hi-IN');
  assert.equal(submit.form!.has('language_code'), false); // ignored by Sarvam, must never be sent
  assert.equal(polls, 3);
  const download = seen.find((s) => s.url === 'https://files.test/out.zip')!;
  assert.equal(download.headers.has('api-subscription-key'), false); // pre-signed URL
});

test('parse: no language field is sent when none is given (Sarvam then assumes Indic)', async () => {
  let form: FormData | undefined;
  const fakeFetch = (async (url: string | URL | Request, init?: RequestInit) => {
    const u = String(url);
    if (u.endsWith('/parse')) { form = init!.body as FormData; return Response.json({ job_id: 'j' }, { status: 201 }); }
    if (u.endsWith('/status')) return Response.json({ status: 'completed' });
    if (u.endsWith('/download-url')) return Response.json({ url: 'https://f.test/z' });
    return new Response(new Uint8Array(zipOf(sample)));
  }) as typeof fetch;
  await makeDocAi(cfg, fakeFetch).parse({ bytes: new Uint8Array([1]), filename: 'x.png', mime: 'image/png' });
  assert.equal(form!.has('language'), false);
});

test('parse: partially_completed still returns blocks and says so', async () => {
  const fakeFetch = (async (url: string | URL | Request) => {
    const u = String(url);
    if (u.endsWith('/parse')) return Response.json({ job_id: 'j' }, { status: 201 });
    if (u.endsWith('/status')) return Response.json({ status: 'partially_completed' });
    if (u.endsWith('/download-url')) return Response.json({ url: 'https://f.test/z' });
    return new Response(new Uint8Array(zipOf(sample)));
  }) as typeof fetch;
  const r = await makeDocAi(cfg, fakeFetch).parse({ bytes: new Uint8Array([1]), filename: 'x.pdf', mime: 'application/pdf' });
  assert.equal(r.status, 'partially_completed');
  assert.equal(r.blocks.length, 2);
});

test('parse: failed and rejected jobs throw; 402 becomes QuotaError', async () => {
  const failing = (status: string) => (async (url: string | URL | Request) => {
    const u = String(url);
    if (u.endsWith('/parse')) return Response.json({ job_id: 'j' }, { status: 201 });
    return Response.json({ status });
  }) as typeof fetch;
  await assert.rejects(makeDocAi(cfg, failing('failed')).parse({ bytes: new Uint8Array([1]), filename: 'a.pdf', mime: 'application/pdf' }), /failed/);
  await assert.rejects(makeDocAi(cfg, failing('rejected')).parse({ bytes: new Uint8Array([1]), filename: 'a.pdf', mime: 'application/pdf' }), /rejected/);

  const noCredit = (async () => new Response('{"detail":"insufficient_quota_error"}', { status: 402 })) as typeof fetch;
  await assert.rejects(
    makeDocAi(cfg, noCredit).parse({ bytes: new Uint8Array([1]), filename: 'a.pdf', mime: 'application/pdf' }),
    (e: unknown) => e instanceof QuotaError,
  );
});

test('output reader accepts the likely JSON shapes and fails loudly on unknown ones', () => {
  assert.equal(extractBlocks(sample).blocks.length, 2);
  // flat blocks with a per-block page field
  const flat = extractBlocks({ blocks: [{ text: 'a', page: 1 }, { text: 'b', page: 3, type: 'table', bounding_box: [0] }] });
  assert.equal(flat.pageCount, 3);
  assert.equal(flat.blocks[1]!.tag, 'table');
  assert.deepEqual(flat.blocks[1]!.bbox, [0]);
  // bare array of pages
  assert.equal(extractBlocks([{ page_no: 2, elements: [{ content: 'x' }] }]).blocks[0]!.page, 2);

  assert.throws(() => extractBlocks({ something: 'else' }), (e: unknown) => e instanceof OcrFormatError && /something/.test((e as Error).message));
  const noJson = new AdmZip();
  noJson.addFile('doc/doc.md', Buffer.from('# hi'));
  assert.throws(() => readParseZip(noJson.toBuffer()), OcrFormatError);
});

// Trimmed from a REAL Sarvam Parse result (a handwritten fitness certificate, 387x516 px).
// The docs did not publish these field names; this pins down what the live API actually returns.
const REAL = {
  document_id: '01a1b1cb-56a0-7095-91a5-4589ee5380a2',
  filename: 'd_349eb54cb53f_0',
  page_count: 1,
  pages: [{
    page_num: 1, image_width: 387, image_height: 516, created_at: '2026-11-06T16:57:35Z',
    blocks: [
      { block_id: 'p1-b1', coordinates: { x1: 31.26, y1: 23.21, x2: 380.08, y2: 133.98 },
        bbox_norm: [0.0808, 0.045, 0.9821, 0.2597], layout_tag: 'header', confidence: 0.4635, reading_order: 1,
        text: 'NISHNAI CLINIC\nनिष्णाई क्लिनिक' },
      { block_id: 'p1-b5', coordinates: { x1: 147, y1: 222, x2: 271, y2: 232 },
        bbox_norm: [0.38, 0.43, 0.7, 0.45], layout_tag: 'section-title', confidence: 0.8145, reading_order: 5,
        text: 'FITNESS CERTIFICATE' },
    ],
  }],
};

test('reads the REAL Sarvam block format: layout tag, pixel box, normalised box, confidence, page size', () => {
  const r = extractBlocks(REAL);
  assert.equal(r.pageCount, 1);
  assert.deepEqual(r.pages, [{ page: 1, width: 387, height: 516 }]);
  assert.equal(r.blocks.length, 2);
  const [header, title] = r.blocks;
  assert.equal(header!.tag, 'header');
  assert.equal(title!.tag, 'section-title');
  assert.deepEqual(header!.bbox, { x1: 31.26, y1: 23.21, x2: 380.08, y2: 133.98 });
  assert.deepEqual(header!.bboxNorm, [0.0808, 0.045, 0.9821, 0.2597]);
  assert.equal(header!.confidence, 0.4635);
  assert.equal(title!.confidence, 0.8145);
  assert.equal(header!.text, 'NISHNAI CLINIC\nनिष्णाई क्लिनिक'); // newlines inside a block are kept
});

test('a malformed box or score is dropped, not trusted', () => {
  const r = extractBlocks({ pages: [{ page_num: 1, blocks: [
    { text: 'a', bbox_norm: [0.1, 0.2, 'x', 0.4], confidence: 'high' },
    { text: 'b', bbox_norm: [0.1, 0.2, 0.3], confidence: NaN },
  ] }] });
  assert.equal(r.blocks[0]!.bboxNorm, null);
  assert.equal(r.blocks[0]!.confidence, null);
  assert.equal(r.blocks[1]!.bboxNorm, null);
  assert.equal(r.blocks[1]!.confidence, null);
  assert.deepEqual(r.pages, [{ page: 1, width: null, height: null }]);
});

test('getResult re-downloads a finished job without submitting a new one', async () => {
  const calls: string[] = [];
  const fakeFetch = (async (url: string | URL | Request, init?: RequestInit) => {
    const u = String(url);
    calls.push(`${init?.method ?? 'GET'} ${u.replace('https://api.test', '')}`);
    if (u.endsWith('/job9/download-url')) return Response.json({ url: 'https://files.test/z' });
    return new Response(new Uint8Array(zipOf(REAL)));
  }) as typeof fetch;
  const r = await makeDocAi(cfg, fakeFetch).getResult('job9');
  assert.equal(r.jobId, 'job9');
  assert.equal(r.blocks[0]!.confidence, 0.4635);
  assert.ok(calls.every((c) => !c.startsWith('POST')), 'must never submit new work (it would cost money)');
});
