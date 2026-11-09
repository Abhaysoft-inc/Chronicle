import fs from 'node:fs';
import path from 'node:path';
import { z } from 'zod';
import type { Ctx } from '../../core/context.ts';
import { uploadsDir } from '../../core/context.ts';
import { all, get, newId, run } from '../../core/db/index.ts';
import { requireCase } from '../../core/db/lookups.ts';
import { badRequest, notFound } from '../../core/errors.ts';
import { addEvent } from '../timeline/index.ts';
import { getBrief } from '../brief/index.ts';

export interface AudioRecord {
  id: string;
  case_id: string;
  filename: string;
  transcript: string;
  diarization: { speaker_id: string; transcript: string; start_time_seconds: number; end_time_seconds: number }[];
  language_code: string;
  status: string;
  created_at: string;
}

export const ConvertAudioEventInput = z.object({
  statement_text: z.string().trim().min(2).max(1000),
  speaker: z.string().trim().default('Speaker 1'),
  raw_date: z.string().trim().optional(),
  event_type: z.enum([
    'symptom_report', 'observation_vitals', 'examination', 'medication_ordered',
    'medication_administered', 'consent', 'procedure', 'escalation_or_review', 'other',
  ]).default('symptom_report'),
});

export async function addAudioRecord(
  ctx: Ctx,
  caseId: string,
  filename: string,
  audioBytes: Uint8Array,
  languageCode = 'hi-IN',
): Promise<AudioRecord> {
  requireCase(ctx.db, caseId);
  fs.mkdirSync(uploadsDir(ctx.config), { recursive: true });

  const id = newId('aud');
  const ext = path.extname(filename) || '.mp3';
  const filePath = path.join(uploadsDir(ctx.config), `${id}${ext}`);
  fs.writeFileSync(filePath, audioBytes);

  // Transcribe using Sarvam Saaras
  const res = await ctx.saaras.transcribe(audioBytes, filename, languageCode);

  const diarization = res.diarized_transcript?.entries ?? [
    { speaker_id: 'speaker_1', transcript: res.transcript, start_time_seconds: 0, end_time_seconds: 0 },
  ];

  run(
    ctx.db,
    `INSERT INTO audio_records (id, case_id, filename, transcript, diarization_json, language_code, status)
     VALUES (?, ?, ?, ?, ?, ?, 'transcribed')`,
    id, caseId, filename, res.transcript, JSON.stringify(diarization), res.language_code,
  );

  return {
    id,
    case_id: caseId,
    filename,
    transcript: res.transcript,
    diarization,
    language_code: res.language_code,
    status: 'transcribed',
    created_at: new Date().toISOString(),
  };
}

export function listAudioRecords(ctx: Ctx, caseId: string): AudioRecord[] {
  requireCase(ctx.db, caseId);
  const rows = all<{
    id: string;
    case_id: string;
    filename: string;
    transcript: string;
    diarization_json: string;
    language_code: string;
    status: string;
    created_at: string;
  }>(ctx.db, 'SELECT * FROM audio_records WHERE case_id = ? ORDER BY created_at DESC', caseId);

  return rows.map((r) => ({
    id: r.id,
    case_id: r.case_id,
    filename: r.filename,
    transcript: r.transcript,
    diarization: JSON.parse(r.diarization_json || '[]'),
    language_code: r.language_code,
    status: r.status,
    created_at: r.created_at,
  }));
}

export function convertStatementToEvent(
  ctx: Ctx,
  caseId: string,
  audioId: string,
  input: z.infer<typeof ConvertAudioEventInput>,
  userId: string,
) {
  requireCase(ctx.db, caseId);
  const audio = get<{ filename: string }>(ctx.db, 'SELECT filename FROM audio_records WHERE id = ?', audioId);
  if (!audio) throw notFound(`Audio recording ${audioId}`);

  const summary = `Audio Statement (${input.speaker} in ${audio.filename}): ${input.statement_text}`;
  return addEvent(ctx, caseId, {
    type: input.event_type,
    summary_en: summary,
    raw_date: input.raw_date ?? null,
    actor_role: input.speaker,
  }, userId);
}

export async function generateVoiceSummary(
  ctx: Ctx,
  caseId: string,
  targetLang = 'hi-IN',
  speaker = 'meera',
): Promise<{ text: string; audioBase64: string }> {
  const caseRow = requireCase(ctx.db, caseId);
  let summaryText = `MedLex case synopsis for ${caseRow.title}. Case type is ${caseRow.case_type}.`;

  try {
    const brief = getBrief(ctx, caseId);
    if (brief.sections.snapshot) {
      summaryText = brief.sections.snapshot.replace(/[*#`-]/g, ' ').slice(0, 600);
    }
  } catch {
    // If no brief yet, use case metadata
    summaryText = `${caseRow.title}. Case type: ${caseRow.case_type}. ${caseRow.claim_summary || 'No claim summary specified.'}`;
  }

  const { audioBase64 } = await ctx.bulbul.synthesize(summaryText, targetLang, speaker);
  return { text: summaryText, audioBase64 };
}
