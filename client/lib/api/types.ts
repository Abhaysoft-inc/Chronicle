// Shapes returned by the Chronicle backend. Kept by hand next to the API calls; if the backend
// changes a response, this is the one file to update.

export type CaseStatus = 'created' | 'processing' | 'processed' | 'processed_with_warnings' | 'failed' | 'interrupted';

export interface CaseSummary {
  id: string;
  title: string;
  case_type: string;
  claim_summary: string;
  output_language: string;
  status: CaseStatus | string;
  created_at: string;
  document_count?: number;
}

export interface DocumentSummary {
  id: string;
  filename: string;
  mime: string;
  /** null until the ingest stage has split the file. */
  page_count: number | null;
  language: string | null;
  created_at: string;
  failed_pages: number;
  pages_with_warnings: number;
}

export type StageStatus = 'pending' | 'running' | 'done' | 'failed';

export interface PipelineStage {
  stage: string;
  status: StageStatus | string;
  progress: string | null;
  error: string | null;
  updated_at: string | null;
}

/** What the SSE stream and GET /pipeline both return. */
export interface PipelineSnapshot {
  status: CaseStatus | string;
  stages: PipelineStage[];
}

export interface PageIssue {
  document_id: string;
  page_no: number;
  ocr_status: string;
  warning: string | null;
}

export interface CaseDetail {
  case: CaseSummary;
  documents: DocumentSummary[];
  pipeline: PipelineStage[];
  /** Pages that were NOT analysed. A missing page must never be read as missing care. */
  page_issues: PageIssue[];
  events: { total: number; unverified: number };
}

export interface SourceRef {
  document_id: string;
  page_no: number;
  block_ids: string[];
  /** Exactly as OCR read it, in the original script. This is the evidence. */
  quote_original: string;
  /** Machine-generated English rendering. Never the evidence. */
  quote_en: string | null;
  quote_en_is_machine_generated: boolean;
  verified: boolean | null;
  verify_reason: string | null;
}

export type ReviewStatus = 'unreviewed' | 'confirmed' | 'rejected' | 'corrected';

export interface TimelineEvent {
  id: string;
  label: string;
  type: string;
  raw_date: string | null;
  /** Sortable date: '2026-03-12' or '2026-03-12T22:00:00+05:30'. Null when no date could be read. */
  occurred_at_iso: string | null;
  precision: 'minute' | 'hour' | 'part_of_day' | 'day' | 'month' | string | null;
  /** 'stated' when read as written; 'inferred' when filled in (missing year, the page date, POD n). */
  basis: 'stated' | 'inferred' | string | null;
  /** Why a date is inferred or uncertain, in plain words. */
  date_note: string | null;
  actor_role: string | null;
  summary_en: string;
  details: Record<string, string | number | null>;
  legibility: 'clear' | 'partial' | 'illegible' | string;
  review_status: ReviewStatus | string;
  corrected: { summary_en?: string; raw_date?: string | null; details?: Record<string, unknown> } | null;
  /** 'manual' when a reviewer added it by hand. */
  origin: 'extracted' | 'manual';
  /** Label of the first copy when this event repeats another (e.g. 'E003'). */
  duplicate_of: string | null;
  /** True when every cited quote was found in the OCR text, or a person added the event. */
  verified: boolean;
  sources: SourceRef[];
}

export interface Timeline {
  events: TimelineEvent[];
  total: number;
  verified: number;
  duplicates: number;
  undated: number;
}

export interface OcrBlock {
  block_id: string;
  text: string;
  text_en: string | null;
  /** Sarvam's layout type: header, paragraph, section-title, image, footer. */
  tag: string | null;
  /** Box in image pixels: { x1, y1, x2, y2 }. */
  bbox: unknown;
  /** Box as fractions of the page, [x1, y1, x2, y2], each 0..1. What the viewer draws. Null for pages read before boxes were captured. */
  bbox_norm: [number, number, number, number] | null;
  /** Sarvam's score for this block, 0..1. Handwriting scores lower than print. */
  confidence: number | null;
}

export interface PageData {
  document: { id: string; filename: string; language: string | null };
  page: {
    document_id: string;
    page_no: number;
    doc_type: string | null;
    ocr_status: 'pending' | 'ok' | 'no_text' | 'failed' | string;
    script: string | null;
    language: string | null;
    language_tier: number | null;
    warning: string | null;
    image_width: number | null;
    image_height: number | null;
  };
  blocks: OcrBlock[];
}

export interface UploadResult {
  documents: { id: string; filename: string; duplicate: boolean }[];
}

export interface AuthUser {
  id: string;
  email: string;
  name: string;
}

export interface MeResult {
  user: AuthUser | null;
  /** False when the server has turned off new sign-ups. */
  signupOpen: boolean;
}

export interface DashboardData {
  totals: {
    cases: number;
    casesInProgress: number;
    documents: number;
    pages: number;
    pagesRead: number;
    pagesNotAnalysed: number;
    events: number;
    verifiedEvents: number;
    unverifiedEvents: number;
    /** 0..1, or null when there are no events yet. */
    verifiedRate: number | null;
    /** 0..1 average of Sarvam's per-block score, or null before any OCR. */
    avgConfidence: number | null;
  };
  review: { unreviewed: number; confirmed: number; corrected: number; rejected: number };
  eventsByType: { type: string; count: number }[];
  /** The last 14 days, oldest first, zero days included. */
  eventsPerDay: { day: string; count: number }[];
  attention: { caseId: string; title: string; reasons: string[] }[];
  recentCases: {
    id: string; title: string; caseType: string; status: string; createdAt: string;
    documents: number; events: number; reviewed: number; unverified: number;
  }[];
}

export type FindingCategory = 'missing_record' | 'documentation_gap' | 'timeline_conflict' | 'possible_care_deviation';
export type FindingSeverity = 'critical' | 'high' | 'medium' | 'low';
export type FindingStatus = 'open' | 'accepted' | 'dismissed';

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

export interface FindingsData {
  findings: Finding[];
  summary: FindingsSummary;
}

export interface Brief {
  id: string;
  case_id: string;
  title: string;
  content_md: string;
  sections: {
    snapshot: string;
    records_reviewed: string;
    chronology: string;
    issues_for_opinion: string;
    questions_for_expert: string;
    limits: string;
  };
  output_language: string;
  created_at: string;
  updated_at: string;
}

