import { z } from 'zod';

export const FINDING_CATEGORIES = [
  'missing_record',
  'documentation_gap',
  'timeline_conflict',
  'possible_care_deviation',
] as const;

export const FINDING_SEVERITIES = ['critical', 'high', 'medium', 'low'] as const;

export const FINDING_STATUSES = ['open', 'accepted', 'dismissed'] as const;

export const PatchFinding = z.object({
  status: z.enum(FINDING_STATUSES),
});

export type FindingCategory = (typeof FINDING_CATEGORIES)[number];
export type FindingSeverity = (typeof FINDING_SEVERITIES)[number];
export type FindingStatus = (typeof FINDING_STATUSES)[number];

export interface Finding {
  id: string;
  case_id: string;
  category: FindingCategory;
  severity: FindingSeverity;
  title: string;
  explanation: string;
  evidence_event_ids: string[];
  question_for_expert: string;
  origin: 'rule' | 'llm';
  status: FindingStatus;
  created_at: string;
}

export interface FindingsSummary {
  total: number;
  open: number;
  accepted: number;
  dismissed: number;
  by_severity: Record<FindingSeverity, number>;
  by_category: Record<FindingCategory, number>;
}
