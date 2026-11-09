import { z } from 'zod';

export const EVENT_TYPES = [
  'admission', 'symptom_report', 'observation_vitals', 'examination',
  'investigation_ordered', 'investigation_result', 'diagnosis',
  'medication_ordered', 'medication_administered', 'consent', 'procedure',
  'anaesthesia', 'transfer', 'escalation_or_review', 'discharge', 'death', 'other',
] as const;

export const DOC_TYPES = [
  'doctor_notes', 'nursing_chart', 'prescription', 'lab_report', 'imaging_report',
  'consent_form', 'operation_notes', 'anaesthesia_record', 'discharge_summary',
  'death_summary', 'bill', 'diagnostic_report', 'referral_note', 'other',
] as const;

export const LEGIBILITY = ['clear', 'partial', 'illegible'] as const;

const SourceOut = z.object({
  page_no: z.number().int(),
  block_ids: z.array(z.string()).min(1),
  /** Copied exactly from the block, in the ORIGINAL script. */
  quote_original: z.string().min(1),
  /** English rendering of the quote. Machine-generated, shown as such. */
  quote_en: z.string().nullable().default(null),
});

const EventOut = z.object({
  type: z.enum(EVENT_TYPES).catch('other'),
  /** The date/time exactly as written. Do not convert. */
  occurred_at_raw: z.string().nullable().default(null),
  actor_role: z.string().nullable().default(null),
  summary_en: z.string().min(1),
  /** drug / drug_raw / dose / dose_raw / route / frequency / test / value / unit ... */
  details: z.record(z.string(), z.union([z.string(), z.number(), z.null()])).default({}),
  legibility: z.enum(LEGIBILITY).catch('clear'),
  sources: z.array(SourceOut).min(1),
});

export const ExtractionOut = z.object({
  pages: z.array(z.object({ page_no: z.number().int(), doc_type: z.enum(DOC_TYPES).catch('other') })),
  events: z.array(EventOut),
});

export type ExtractionResult = z.infer<typeof ExtractionOut>;
export type ExtractedEvent = z.infer<typeof EventOut>;
