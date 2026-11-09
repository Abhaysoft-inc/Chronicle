import { Router } from 'express';
import multer from 'multer';
import { z } from 'zod';
import type { Ctx } from '../../core/context.ts';
import { parseInput } from '../../core/http/middleware.ts';
import { caseOwner } from '../../core/http/ownership.ts';
import { addAudioRecord, ConvertAudioEventInput, convertStatementToEvent, generateVoiceSummary, listAudioRecords } from './voice.service.ts';
import { badRequest } from '../../core/errors.ts';

const audioUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 50 * 1024 * 1024 },
});

const VoiceSummaryQuery = z.object({
  target_lang: z.string().default('hi-IN'),
  speaker: z.string().default('meera'),
});

export function voiceRouter(ctx: Ctx): Router {
  const r = Router();
  r.param('caseId', caseOwner(ctx));

  r.post('/cases/:caseId/audio', audioUpload.single('file'), async (req, res, next) => {
    try {
      const file = req.file;
      if (!file) throw badRequest('No audio file uploaded in "file" field');
      const lang = typeof req.body?.language_code === 'string' ? req.body.language_code : 'hi-IN';
      const record = await addAudioRecord(ctx, String(req.params.caseId), file.originalname, file.buffer, lang);
      res.status(201).json({ audio: record });
    } catch (err) {
      next(err);
    }
  });

  r.get('/cases/:caseId/audio', (req, res, next) => {
    try {
      res.json({ audio_records: listAudioRecords(ctx, String(req.params.caseId)) });
    } catch (err) {
      next(err);
    }
  });

  r.post('/cases/:caseId/audio/:audioId/to-event', (req, res, next) => {
    try {
      const input = parseInput(ConvertAudioEventInput, req.body ?? {});
      const event = convertStatementToEvent(ctx, String(req.params.caseId), String(req.params.audioId), input, req.user!.id);
      res.status(201).json({ event });
    } catch (err) {
      next(err);
    }
  });

  r.post('/cases/:caseId/voice-summary', async (req, res, next) => {
    try {
      const input = parseInput(VoiceSummaryQuery, req.body ?? {});
      const result = await generateVoiceSummary(ctx, String(req.params.caseId), input.target_lang, input.speaker);
      res.json(result);
    } catch (err) {
      next(err);
    }
  });

  return r;
}
