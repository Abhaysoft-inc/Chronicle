import fs from 'node:fs';
import path from 'node:path';
import type { Ctx } from '../../core/context.ts';
import { uploadsDir } from '../../core/context.ts';
import { all, newId, run } from '../../core/db/index.ts';
import { requireCase, requireDocument, type DocumentRow } from '../../core/db/lookups.ts';
import { badRequest } from '../../core/errors.ts';
import { isSupportedLanguage } from '../../shared/indic/languages.ts';
import { ALLOWED_MIME, documentExists, sha256 } from './ingest.ts';

/** Decide the file type from its first bytes. A client-supplied content type is not trusted. */
export function sniffMime(b: Uint8Array): string | null {
  if (b.length >= 5 && b[0] === 0x25 && b[1] === 0x50 && b[2] === 0x44 && b[3] === 0x46) return 'application/pdf';
  if (b.length >= 4 && b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47) return 'image/png';
  if (b.length >= 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return 'image/jpeg';
  return null;
}

/** Multer decodes filenames as latin-1, which garbles Indic names. Undo that. */
export function fixFilename(name: string): string {
  const decoded = Buffer.from(name, 'latin1').toString('utf8');
  return decoded.includes('�') ? name : decoded;
}

export interface NewFile {
  filename: string;
  bytes: Uint8Array;
}

export interface AddResult {
  id: string;
  filename: string;
  duplicate: boolean;
}

export function addDocuments(ctx: Ctx, caseId: string, files: NewFile[], language: string | null): AddResult[] {
  requireCase(ctx.db, caseId);
  if (files.length === 0) throw badRequest('No files uploaded. Send them in the "files" field.');
  if (language && !isSupportedLanguage(language)) {
    throw badRequest(`Unsupported language code '${language}'. Use codes like hi-IN, ta-IN, en-IN.`);
  }

  fs.mkdirSync(uploadsDir(ctx.config), { recursive: true });
  const results: AddResult[] = [];
  for (const f of files) {
    const mime = sniffMime(f.bytes);
    if (!mime || !(mime in ALLOWED_MIME)) {
      throw badRequest(`'${f.filename}' is not a PDF, JPG or PNG file.`);
    }
    const hash = sha256(f.bytes);
    const dup = documentExists(ctx, caseId, hash);
    if (dup) {
      results.push({ id: dup, filename: f.filename, duplicate: true });
      continue;
    }
    const id = newId('d');
    const file = path.join(uploadsDir(ctx.config), `${id}${ALLOWED_MIME[mime]}`);
    fs.writeFileSync(file, f.bytes);
    run(
      ctx.db,
      `INSERT INTO documents (id, case_id, filename, sha256, mime, language, path)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      id, caseId, f.filename, hash, mime, language, file,
    );
    results.push({ id, filename: f.filename, duplicate: false });
  }
  return results;
}

export function listDocuments(ctx: Ctx, caseId: string) {
  return all(
    ctx.db,
    `SELECT d.id, d.filename, d.mime, d.page_count, d.language, d.created_at,
            (SELECT COUNT(*) FROM pages p WHERE p.document_id = d.id AND p.ocr_status = 'failed') AS failed_pages,
            (SELECT COUNT(*) FROM pages p WHERE p.document_id = d.id AND p.warning IS NOT NULL) AS pages_with_warnings
     FROM documents d WHERE d.case_id = ? ORDER BY d.created_at, d.id`,
    caseId,
  );
}

export function getPage(ctx: Ctx, documentId: string, pageNo: number) {
  const doc = requireDocument(ctx.db, documentId);
  const [page] = all(ctx.db, 'SELECT * FROM pages WHERE document_id = ? AND page_no = ?', doc.id, pageNo);
  if (!page) throw badRequest(`Page ${pageNo} does not exist in this document`);
  const blocks = all<{
    block_id: string; text: string; text_en: string | null; tag: string | null;
    bbox_json: string | null; bbox_norm_json: string | null; confidence: number | null;
  }>(
    ctx.db,
    `SELECT block_id, text, text_en, tag, bbox_json, bbox_norm_json, confidence
     FROM ocr_blocks WHERE document_id = ? AND page_no = ? ORDER BY seq`,
    doc.id, pageNo,
  ).map(({ bbox_json, bbox_norm_json, ...b }) => ({
    ...b,
    /** Box in image pixels. */
    bbox: bbox_json ? JSON.parse(bbox_json) : null,
    /** Box as 0..1 fractions of the page: [x1, y1, x2, y2]. What the page viewer draws. */
    bbox_norm: bbox_norm_json ? (JSON.parse(bbox_norm_json) as number[]) : null,
  }));
  return { document: { id: doc.id, filename: doc.filename, language: doc.language }, page, blocks };
}

export function documentFile(ctx: Ctx, documentId: string): DocumentRow {
  return requireDocument(ctx.db, documentId);
}
