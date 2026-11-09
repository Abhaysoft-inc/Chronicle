import { z } from 'zod';

export const FINDING_CATEGORIES = [
  'missing_record',
  'documentation_gap',
  'timeline_conflict',
  'possible_care_deviation',
] as const;

export const FINDING_SEVERITIES = ['critical', 'high', 'medium', 'low'] as const;

export const FINDING_STATUSES = ['open', 'accepted', 'dismissed'] as const;

export type FindingCategory = (typeof FINDING_CATEGORIES)[number];
export type FindingSeverity = (typeof FINDING_SEVERITIES)[number];
export type FindingStatus = (typeof FINDING_STATUSES)[number];
/** rule = a fixed check found it; llm = an AI concern to verify; expert = written by a reviewing expert. */
export type FindingOrigin = 'rule' | 'llm' | 'expert';

/** An expert reviews a finding: accept, dismiss or reopen it, add a note, or reword it (the original is kept). */
export const PatchFinding = z
  .object({
    status: z.enum(FINDING_STATUSES).optional(),
    note: z.string().trim().max(4000).optional(),
    edit: z
      .object({
        title: z.string().trim().min(3).max(300).optional(),
        explanation: z.string().trim().min(3).max(4000).optional(),
        severity: z.enum(FINDING_SEVERITIES).optional(),
      })
      .optional(),
  })
  .refine((v) => v.status || v.note !== undefined || v.edit, 'Provide a status, a note, or an edit');

/** An expert adds their own observation, independent of the automated checks. */
export const CreateFinding = z.object({
  category: z.enum(FINDING_CATEGORIES),
  severity: z.enum(FINDING_SEVERITIES),
  title: z.string().trim().min(3).max(300),
  explanation: z.string().trim().min(3).max(4000),
  question_for_expert: z.string().trim().max(1000).default(''),
  evidence_event_ids: z.array(z.string()).max(50).default([]),
});

export interface EvidenceSource {
  document_id: string;
  filename: string;
  page_no: number;
  block_ids: string[];
  quote_original: string;
  verified: boolean | null;
}

export interface EvidenceEvent {
  event_id: string;
  label: string;
  type: string;
  summary: string;
  occurred_at_iso: string | null;
  precision: string | null;
  sources: EvidenceSource[];
}

export interface FindingReview {
  action: string;
  note: string | null;
  user_name: string | null;
  created_at: string;
}

export interface Finding {
  id: string;
  case_id: string;
  category: FindingCategory;
  severity: FindingSeverity;
  title: string;
  explanation: string;
  evidence_event_ids: string[];
  /** The cited events with their quotes and pages, so every finding can be checked at the source. */
  evidence: EvidenceEvent[];
  question_for_expert: string;
  origin: FindingOrigin;
  status: FindingStatus;
  confidence: number | null;
  expert_note: string | null;
  /** True when an expert reworded it; `original` then holds the automated wording. */
  edited: boolean;
  original: { title: string; explanation: string; severity: FindingSeverity } | null;
  reviewed_by_name: string | null;
  reviewed_at: string | null;
  history: FindingReview[];
  created_at: string;
}

export interface FindingsSummary {
  total: number;
  open: number;
  accepted: number;
  dismissed: number;
  by_severity: Record<FindingSeverity, number>;
  by_category: Record<FindingCategory, number>;
  by_origin: Record<FindingOrigin, number>;
}
