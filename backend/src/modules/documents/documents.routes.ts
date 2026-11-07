import { Router } from 'express';
import multer from 'multer';
import { z } from 'zod';
import type { Ctx } from '../../core/context.ts';
import { badRequest } from '../../core/errors.ts';
import { parseInput } from '../../core/http/middleware.ts';
import { caseOwner, documentOwner } from '../../core/http/ownership.ts';
import { addDocuments, documentFile, fixFilename, getPage, listDocuments } from './documents.service.ts';

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 100 * 1024 * 1024, files: 30 },
});

const UploadFields = z.object({
  // One language for the whole upload. Leave out to let Sarvam use its Indic default.
  language: z.string().optional(),
});

export function documentsRouter(ctx: Ctx): Router {
  const r = Router();
  r.param('caseId', caseOwner(ctx));
  r.param('id', documentOwner(ctx));

  r.post('/cases/:caseId/documents', upload.array('files', 30), (req, res) => {
    const { language } = parseInput(UploadFields, req.body ?? {});
    const files = ((req.files as Express.Multer.File[] | undefined) ?? []).map((f) => ({
      filename: fixFilename(f.originalname),
      bytes: f.buffer,
    }));
    const added = addDocuments(ctx, String(req.params.caseId), files, language?.trim() || null);
    res.status(201).json({ documents: added });
  });

  r.get('/cases/:caseId/documents', (req, res) => {
    res.json({ documents: listDocuments(ctx, String(req.params.caseId)) });
  });

  r.get('/documents/:id/file', (req, res) => {
    const doc = documentFile(ctx, String(req.params.id));
    res.type(doc.mime);
    res.setHeader('Content-Disposition', `inline; filename*=UTF-8''${encodeURIComponent(doc.filename)}`);
    res.sendFile(doc.path);
  });

  r.get('/documents/:id/pages/:n', (req, res) => {
    const n = Number(req.params.n);
    if (!Number.isInteger(n) || n < 1) throw badRequest('Page number must be a positive integer');
    res.json(getPage(ctx, String(req.params.id), n));
  });

  return r;
}
