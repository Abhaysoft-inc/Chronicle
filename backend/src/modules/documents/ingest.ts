import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import AdmZip from 'adm-zip';
import { PDFDocument } from 'pdf-lib';
import { all, get, newId, run, tx } from '../../core/db/index.ts';
import { chunksDir, type Ctx } from '../../core/context.ts';

/** Pages per Sarvam request. The docs state 10, 20 and 30 in different places; 10 is safe everywhere. */
export const MAX_PAGES_PER_CHUNK = 10;

export const sha256 = (b: Uint8Array) => createHash('sha256').update(b).digest('hex');

export const ALLOWED_MIME: Record<string, string> = {
  'application/pdf': '.pdf',
  'image/jpeg': '.jpg',
  'image/png': '.png',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': '.docx',
};

export class IngestError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'IngestError';
  }
}

/** Extract paragraphs and text from a DOCX document (OpenXML). */
export function parseDocx(bytes: Uint8Array): { paragraphs: string[]; text: string } {
  try {
    const zip = new AdmZip(Buffer.from(bytes));
    const entry = zip.getEntry('word/document.xml');
    if (!entry) return { paragraphs: [], text: '' };
    const xml = entry.getData().toString('utf8');
    const pMatches = xml.match(/<w:p(?:\s|>)[^]*?<\/w:p>/g) ?? [];
    const paragraphs: string[] = [];
    for (const p of pMatches) {
      const texts = [...p.matchAll(/<w:t(?:\s[^>]*)?>([^<]*)<\/w:t>/g)].map((m) => m[1]);
      const line = texts.join('').trim();
      if (line) paragraphs.push(line);
    }
    return { paragraphs, text: paragraphs.join('\n') };
  } catch {
    return { paragraphs: [], text: '' };
  }
}

/** Split a PDF into chunks of at most `size` pages. Returns bytes plus the offset into the original. */
export async function splitPdf(
  bytes: Uint8Array,
  size = MAX_PAGES_PER_CHUNK,
): Promise<{ pageCount: number; chunks: { offset: number; count: number; bytes: Uint8Array }[] }> {
  let src: PDFDocument;
  try {
    src = await PDFDocument.load(bytes);
  } catch (err) {
    throw new IngestError(`Cannot read PDF (encrypted or corrupt?): ${(err as Error).message}`);
  }
  const pageCount = src.getPageCount();
  if (pageCount === 0) throw new IngestError('PDF has no pages');
  const chunks: { offset: number; count: number; bytes: Uint8Array }[] = [];
  for (let start = 0; start < pageCount; start += size) {
    const count = Math.min(size, pageCount - start);
    const out = await PDFDocument.create();
    const copied = await out.copyPages(src, Array.from({ length: count }, (_, i) => start + i));
    copied.forEach((p) => out.addPage(p));
    chunks.push({ offset: start, count, bytes: await out.save() });
  }
  return { pageCount, chunks };
}

/**
 * Stage 1. For each document not yet split: cut it into <=10-page chunks, record them,
 * and create a page row for every page. Safe to re-run.
 */
export async function ingestCase(ctx: Ctx, caseId: string): Promise<void> {
  const docs = all<{ id: string; path: string; mime: string; filename: string }>(
    ctx.db,
    `SELECT d.id, d.path, d.mime, d.filename FROM documents d
     WHERE d.case_id = ? AND NOT EXISTS (SELECT 1 FROM ocr_chunks c WHERE c.document_id = d.id)`,
    caseId,
  );
  fs.mkdirSync(chunksDir(ctx.config), { recursive: true });

  for (const doc of docs) {
    const bytes = fs.readFileSync(doc.path);
    const parts =
      doc.mime === 'application/pdf'
        ? await splitPdf(bytes)
        : { pageCount: 1, chunks: [{ offset: 0, count: 1, bytes }] };

    const ext = ALLOWED_MIME[doc.mime] ?? '';
    const written = parts.chunks.map((c, idx) => {
      const file = path.join(chunksDir(ctx.config), `${doc.id}_${idx}${ext}`);
      fs.writeFileSync(file, c.bytes);
      return { ...c, idx, file, hash: sha256(c.bytes) };
    });

    tx(ctx.db, () => {
      run(ctx.db, 'UPDATE documents SET page_count = ? WHERE id = ?', parts.pageCount, doc.id);
      for (const c of written) {
        run(
          ctx.db,
          `INSERT INTO ocr_chunks (id, document_id, idx, page_offset, page_count, path, sha256)
           VALUES (?, ?, ?, ?, ?, ?, ?)`,
          newId('ch'), doc.id, c.idx, c.offset, c.count, c.file, c.hash,
        );
      }
      for (let p = 1; p <= parts.pageCount; p++) {
        run(ctx.db, 'INSERT OR IGNORE INTO pages (document_id, page_no) VALUES (?, ?)', doc.id, p);
      }
    });
  }
}

export function documentExists(ctx: Ctx, caseId: string, hash: string): string | null {
  const row = get<{ id: string }>(ctx.db, 'SELECT id FROM documents WHERE case_id = ? AND sha256 = ?', caseId, hash);
  return row?.id ?? null;
}
