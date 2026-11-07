import AdmZip from 'adm-zip';
import type { Config } from '../../config/index.ts';
import { failIfNotOk, RateLimiter, SarvamError, sleep, withRetry } from './http.ts';

// Sarvam Document AI "Parse": POST /doc-ai/v1/job/parse
//   -> poll GET /doc-ai/v1/job/{id}/status
//   -> GET /doc-ai/v1/job/{id}/download-url, then download the ZIP (no API key on that URL).
// We call it with fetch, not the JS SDK: as of sarvamai 1.1.12 the SDK cannot send
// output_format, so it always returns HTML and we need JSON blocks with bounding boxes.

export interface OcrBlock {
  /** 1-based page number within the submitted file (chunk). */
  page: number;
  text: string;
  /** Sarvam's layout type: header, paragraph, section-title, image, footer ... */
  tag: string | null;
  /** Box in image pixels: { x1, y1, x2, y2 } (see page width/height). */
  bbox: unknown;
  /** The same box as fractions of the page, [x1, y1, x2, y2], each 0..1. Resolution-independent. */
  bboxNorm: [number, number, number, number] | null;
  /** Sarvam's own score for this block (0..1). Handwriting scores noticeably lower than print. */
  confidence: number | null;
}

export interface PageInfo {
  /** 1-based, within the submitted file. */
  page: number;
  /** Size of the page image the boxes refer to. */
  width: number | null;
  height: number | null;
}

export interface ParseResult {
  jobId: string;
  /** 'completed' or 'partially_completed' */
  status: string;
  blocks: OcrBlock[];
  /** Pages in the file that the output contained. */
  pageCount: number;
  /** Per-page image size. Absent in results cached before it was captured. */
  pages?: PageInfo[];
}

export class OcrFormatError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'OcrFormatError';
  }
}

export interface DocAiInput {
  bytes: Uint8Array;
  filename: string;
  mime: string;
  /** BCP-47 code. Omit to let Parse use its Indic default. Never default to en-IN. */
  language?: string | null;
}

const TERMINAL = new Set(['completed', 'partially_completed', 'failed', 'rejected']);

export interface DocAiClient {
  parse(input: DocAiInput): Promise<ParseResult>;
}

/** The real client also exposes the untouched ZIP (spike script) and saved-result re-reads. */
export interface DocAiClientFull extends DocAiClient {
  parseRawZip(input: DocAiInput): Promise<{ jobId: string; status: string; zip: Buffer }>;
  /** Re-download the saved output of a job that already finished. No new OCR, so no new charge. */
  getResult(jobId: string): Promise<ParseResult>;
}

export function makeDocAi(
  cfg: Pick<Config, 'SARVAM_API_KEY' | 'SARVAM_BASE_URL' | 'DOCAI_RPM' | 'DOCAI_POLL_SECONDS'>,
  fetchImpl: typeof fetch = fetch,
): DocAiClientFull {
  const limiter = new RateLimiter(cfg.DOCAI_RPM);
  const headers = { 'api-subscription-key': cfg.SARVAM_API_KEY };
  const base = cfg.SARVAM_BASE_URL;

  async function submit(input: DocAiInput): Promise<string> {
    const form = new FormData();
    form.append('file', new Blob([Buffer.from(input.bytes)], { type: input.mime }), input.filename);
    form.append('output_format', 'json');
    if (input.language) form.append('language', input.language); // NOT language_code: that is ignored
    await limiter.wait();
    const res = await fetchImpl(`${base}/doc-ai/v1/job/parse`, { method: 'POST', headers, body: form });
    await failIfNotOk(res, 'Parse submit');
    const json = (await res.json()) as { job_id?: string };
    if (!json.job_id) throw new SarvamError(502, 'Parse submit returned no job_id');
    return json.job_id;
  }

  async function waitForJob(jobId: string): Promise<string> {
    for (;;) {
      const res = await fetchImpl(`${base}/doc-ai/v1/job/${jobId}/status`, { headers });
      await failIfNotOk(res, 'Parse status');
      const { status } = (await res.json()) as { status: string };
      if (TERMINAL.has(status)) return status;
      await sleep(cfg.DOCAI_POLL_SECONDS * 1000);
    }
  }

  async function download(jobId: string): Promise<Buffer> {
    const res = await fetchImpl(`${base}/doc-ai/v1/job/${jobId}/download-url`, { headers });
    await failIfNotOk(res, 'Parse download-url');
    const { url } = (await res.json()) as { url: string };
    const file = await fetchImpl(url); // pre-signed URL: no API key header
    await failIfNotOk(file, 'Parse download');
    return Buffer.from(await file.arrayBuffer());
  }

  async function parseRawZip(input: DocAiInput) {
    const jobId = await withRetry(() => submit(input));
    const status = await waitForJob(jobId);
    if (status === 'failed' || status === 'rejected') {
      throw new SarvamError(422, `Parse job ${jobId} ended as '${status}'`);
    }
    const zip = await withRetry(() => download(jobId));
    return { jobId, status, zip };
  }

  return {
    parseRawZip,
    async parse(input) {
      const { jobId, status, zip } = await parseRawZip(input);
      const { blocks, pageCount, pages } = readParseZip(zip);
      return { jobId, status, blocks, pageCount, pages };
    },
    async getResult(jobId) {
      const zip = await withRetry(() => download(jobId));
      const { blocks, pageCount, pages } = readParseZip(zip);
      return { jobId, status: 'completed', blocks, pageCount, pages };
    },
  };
}

// ---------------------------------------------------------------------------
// Reading the output ZIP.
//
// Layout:   manifest.json
//           <file>/<file>.json            (primary file for output_format=json)
//
// REAL FORMAT, confirmed against live jobs (3 documents: English, Hindi mix, Telugu/Kannada):
//   { document_id, filename, page_count,
//     pages: [ { page_num, image_width, image_height, created_at,
//                blocks: [ { block_id: "p1-b1",
//                            coordinates: { x1, y1, x2, y2 },     // pixels
//                            bbox_norm: [x1, y1, x2, y2],          // 0..1
//                            layout_tag: "header" | "paragraph" | "section-title" | "image" | "footer",
//                            confidence: 0.46,  reading_order: 1,  text: "..." } ] } ] }
// The docs did not publish these names (and said there was no confidence score). Older/guessed
// shapes are still accepted so existing tests and cached results keep working; anything else
// fails loudly with OcrFormatError listing the keys it saw.
// ---------------------------------------------------------------------------

export function readParseZip(zipBytes: Buffer): { blocks: OcrBlock[]; pageCount: number; pages: PageInfo[] } {
  const zip = new AdmZip(zipBytes);
  const entries = zip.getEntries().filter((e) => !e.isDirectory);
  const primary = entries.find((e) => {
    const n = e.entryName.replace(/\\/g, '/');
    return n.endsWith('.json') && !n.includes('/metadata/') && !n.endsWith('manifest.json') && n !== 'manifest.json';
  });
  if (!primary) {
    throw new OcrFormatError(`No primary .json in Parse output. Files: ${entries.map((e) => e.entryName).join(', ')}`);
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(primary.getData().toString('utf8'));
  } catch (err) {
    throw new OcrFormatError(`Primary file ${primary.entryName} is not valid JSON: ${(err as Error).message}`);
  }
  return extractBlocks(parsed);
}

type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj => typeof v === 'object' && v !== null && !Array.isArray(v);
const pick = (o: Obj, keys: string[]) => keys.map((k) => o[k]).find((v) => v !== undefined);

const isFraction4 = (v: unknown): v is [number, number, number, number] =>
  Array.isArray(v) && v.length === 4 && v.every((n) => typeof n === 'number' && Number.isFinite(n));

function toBlock(raw: unknown, pageFallback: number): OcrBlock | null {
  if (!isObj(raw)) return null;
  const text = pick(raw, ['text', 'content', 'value']);
  if (typeof text !== 'string') return null;
  const page = pick(raw, ['page_number', 'page_no', 'page']);
  const tag = pick(raw, ['layout_tag', 'tag', 'type', 'label', 'category']);
  const norm = raw.bbox_norm;
  const confidence = raw.confidence;
  return {
    page: typeof page === 'number' ? page : pageFallback,
    text,
    tag: typeof tag === 'string' ? tag : null,
    bbox: pick(raw, ['coordinates', 'bbox', 'bounding_box', 'box', 'polygon']) ?? null,
    bboxNorm: isFraction4(norm) ? norm : null,
    confidence: typeof confidence === 'number' && Number.isFinite(confidence) ? confidence : null,
  };
}

export function extractBlocks(root: unknown): { blocks: OcrBlock[]; pageCount: number; pages: PageInfo[] } {
  const blocks: OcrBlock[] = [];
  const pageInfos: PageInfo[] = [];
  let pageCount = 0;

  const fromPages = (pages: unknown[]) => {
    pages.forEach((p, i) => {
      if (!isObj(p)) return;
      const list = pick(p, ['blocks', 'elements', 'items']);
      const pageNo = pick(p, ['page_num', 'page_number', 'page_no', 'page']);
      const n = typeof pageNo === 'number' ? pageNo : i + 1;
      pageCount = Math.max(pageCount, n);
      pageInfos.push({
        page: n,
        width: typeof p.image_width === 'number' ? p.image_width : null,
        height: typeof p.image_height === 'number' ? p.image_height : null,
      });
      if (Array.isArray(list)) {
        for (const b of list) {
          const blk = toBlock(b, n);
          if (blk) blocks.push({ ...blk, page: n });
        }
      }
    });
  };

  if (Array.isArray(root)) {
    if (root.some((p) => isObj(p) && Array.isArray(pick(p, ['blocks', 'elements', 'items'])))) fromPages(root);
    else for (const b of root) { const blk = toBlock(b, 1); if (blk) blocks.push(blk); }
  } else if (isObj(root)) {
    const pages = pick(root, ['pages', 'page_results']);
    const flat = pick(root, ['blocks', 'elements']);
    if (Array.isArray(pages)) fromPages(pages);
    else if (Array.isArray(flat)) {
      for (const b of flat) { const blk = toBlock(b, 1); if (blk) blocks.push(blk); }
    } else {
      throw new OcrFormatError(`Unrecognised Parse JSON. Top-level keys: ${Object.keys(root).join(', ')}`);
    }
  } else {
    throw new OcrFormatError('Parse JSON is neither an object nor an array');
  }

  for (const b of blocks) pageCount = Math.max(pageCount, b.page);
  return { blocks, pageCount, pages: pageInfos };
}
