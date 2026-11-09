// Schema for Chronicle. Original LLM output and human corrections are stored
// separately (events.corrected_json) so we can show what a person changed.
export const SCHEMA = `
CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  email TEXT NOT NULL UNIQUE,               -- stored lower-case
  name TEXT NOT NULL,
  password_hash TEXT NOT NULL,              -- scrypt$N$r$p$salt$key, never the password
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

-- Only a SHA-256 of the session token is stored, so a leaked database cannot be replayed as cookies.
CREATE TABLE IF NOT EXISTS sessions (
  token_hash TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  expires_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS cases (
  id TEXT PRIMARY KEY,
  owner_id TEXT REFERENCES users(id) ON DELETE CASCADE,  -- NULL only for cases made before accounts existed
  title TEXT NOT NULL,
  case_type TEXT NOT NULL DEFAULT 'general',
  claim_summary TEXT NOT NULL DEFAULT '',
  output_language TEXT NOT NULL DEFAULT 'en-IN',
  status TEXT NOT NULL DEFAULT 'created',
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

CREATE TABLE IF NOT EXISTS documents (
  id TEXT PRIMARY KEY,
  case_id TEXT NOT NULL REFERENCES cases(id) ON DELETE CASCADE,
  filename TEXT NOT NULL,
  sha256 TEXT NOT NULL,
  mime TEXT NOT NULL,
  page_count INTEGER,
  language TEXT,
  path TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  UNIQUE (case_id, sha256)
);

CREATE TABLE IF NOT EXISTS ocr_chunks (
  id TEXT PRIMARY KEY,
  document_id TEXT NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
  idx INTEGER NOT NULL,
  page_offset INTEGER NOT NULL,
  page_count INTEGER NOT NULL,
  path TEXT NOT NULL,
  sha256 TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',   -- pending | done | partial | failed
  sarvam_job_id TEXT,
  error TEXT,
  UNIQUE (document_id, idx)
);

CREATE TABLE IF NOT EXISTS ocr_blocks (
  block_id TEXT NOT NULL,                   -- p<page>.b<n>, unique within a document
  document_id TEXT NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
  page_no INTEGER NOT NULL,
  seq INTEGER NOT NULL,
  text TEXT NOT NULL,
  text_en TEXT,
  tag TEXT,                                 -- Sarvam layout type: header | paragraph | section-title | image | footer
  bbox_json TEXT,                           -- box in image pixels {x1,y1,x2,y2}
  bbox_norm_json TEXT,                      -- same box as 0..1 fractions [x1,y1,x2,y2]
  confidence REAL,                          -- Sarvam's per-block score, 0..1
  PRIMARY KEY (document_id, block_id)
);

CREATE TABLE IF NOT EXISTS pages (
  document_id TEXT NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
  page_no INTEGER NOT NULL,
  doc_type TEXT,                            -- set once the page has been extracted
  ocr_status TEXT NOT NULL DEFAULT 'pending', -- pending | ok | no_text | failed
  script TEXT,
  language TEXT,
  language_tier INTEGER,
  warning TEXT,
  image_width INTEGER,                      -- size of the page image the OCR boxes refer to
  image_height INTEGER,
  PRIMARY KEY (document_id, page_no)
);

CREATE TABLE IF NOT EXISTS events (
  id TEXT PRIMARY KEY,
  case_id TEXT NOT NULL REFERENCES cases(id) ON DELETE CASCADE,
  seq INTEGER NOT NULL,
  type TEXT NOT NULL,
  raw_date TEXT,
  occurred_at_iso TEXT,
  precision TEXT,
  basis TEXT,
  actor_role TEXT,
  summary_en TEXT NOT NULL,
  details_json TEXT NOT NULL DEFAULT '{}',
  legibility TEXT NOT NULL DEFAULT 'clear',
  review_status TEXT NOT NULL DEFAULT 'unreviewed', -- unreviewed | confirmed | rejected | corrected
  corrected_json TEXT,
  date_note TEXT,                          -- why a date is inferred or uncertain, in plain words
  duplicate_of TEXT,                        -- id of the first copy when this event repeats another
  origin TEXT NOT NULL DEFAULT 'extracted', -- extracted | manual (added by a reviewer)
  created_by TEXT,                          -- user who added a manual event
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  UNIQUE (case_id, seq)
);

CREATE TABLE IF NOT EXISTS event_sources (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  event_id TEXT NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  document_id TEXT NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
  page_no INTEGER NOT NULL,
  block_ids_json TEXT NOT NULL,
  quote_original TEXT NOT NULL,
  quote_en TEXT,
  verified INTEGER,                         -- NULL = not checked yet, 1 = ok, 0 = failed
  verify_reason TEXT
);

CREATE TABLE IF NOT EXISTS pipeline_runs (
  case_id TEXT NOT NULL REFERENCES cases(id) ON DELETE CASCADE,
  stage TEXT NOT NULL,
  status TEXT NOT NULL,                     -- pending | running | done | failed
  progress TEXT,
  error TEXT,
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  PRIMARY KEY (case_id, stage)
);

CREATE TABLE IF NOT EXISTS api_cache (
  request_hash TEXT PRIMARY KEY,
  endpoint TEXT NOT NULL,
  response_json TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

CREATE TABLE IF NOT EXISTS findings (
  id TEXT PRIMARY KEY,
  case_id TEXT NOT NULL REFERENCES cases(id) ON DELETE CASCADE,
  category TEXT NOT NULL,                   -- missing_record | documentation_gap | timeline_conflict | possible_care_deviation
  severity TEXT NOT NULL,                   -- critical | high | medium | low
  title TEXT NOT NULL,
  explanation TEXT NOT NULL,
  evidence_event_ids_json TEXT NOT NULL DEFAULT '[]',
  question_for_expert TEXT NOT NULL,
  origin TEXT NOT NULL DEFAULT 'rule',      -- rule | llm | expert
  status TEXT NOT NULL DEFAULT 'open',      -- open | accepted | dismissed
  rule_key TEXT,                            -- stable identity across re-runs, so reviews are never lost
  confidence REAL,                          -- 0..1, how sure the rule or model is
  expert_note TEXT,                         -- the reviewing expert's comment
  edited_json TEXT,                         -- expert's edits to title/explanation/severity (original kept)
  reviewed_by TEXT,
  reviewed_at TEXT,
  created_by TEXT,                          -- user who wrote an expert observation
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

-- Every review action on a finding, with who and when: the audit trail an expert opinion needs.
CREATE TABLE IF NOT EXISTS finding_reviews (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  finding_id TEXT NOT NULL REFERENCES findings(id) ON DELETE CASCADE,
  user_id TEXT,
  action TEXT NOT NULL,                     -- created | accepted | dismissed | reopened | edited | noted
  note TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

-- Expected documents for a case and what happened to each (missing-record analysis).
CREATE TABLE IF NOT EXISTS record_checklist (
  case_id TEXT NOT NULL REFERENCES cases(id) ON DELETE CASCADE,
  doc_type TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'missing',   -- missing | requested | received | unavailable  ('present' is computed)
  note TEXT,
  updated_by TEXT,
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  PRIMARY KEY (case_id, doc_type)
);

CREATE TABLE IF NOT EXISTS briefs (
  id TEXT PRIMARY KEY,
  case_id TEXT NOT NULL UNIQUE REFERENCES cases(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  content_md TEXT NOT NULL,
  sections_json TEXT NOT NULL DEFAULT '{}',
  output_language TEXT NOT NULL DEFAULT 'en-IN',
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

-- Case assignments to lawyers, investigators and medical experts
CREATE TABLE IF NOT EXISTS case_assignments (
  id TEXT PRIMARY KEY,
  case_id TEXT NOT NULL REFERENCES cases(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role TEXT NOT NULL DEFAULT 'lawyer',       -- lawyer | expert | investigator
  assigned_by TEXT REFERENCES users(id),
  assigned_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  UNIQUE(case_id, user_id)
);

-- Structured patient & case metadata management
CREATE TABLE IF NOT EXISTS case_metadata (
  case_id TEXT PRIMARY KEY REFERENCES cases(id) ON DELETE CASCADE,
  patient_name TEXT,
  patient_age INTEGER,
  patient_gender TEXT,
  incident_date TEXT,
  admission_date TEXT,
  discharge_date TEXT,
  hospital_name TEXT,
  priority TEXT NOT NULL DEFAULT 'medium',   -- low | medium | high | urgent
  notes TEXT,
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

-- Activity logs for case collaboration & audit trail
CREATE TABLE IF NOT EXISTS activity_logs (
  id TEXT PRIMARY KEY,
  case_id TEXT NOT NULL REFERENCES cases(id) ON DELETE CASCADE,
  user_id TEXT REFERENCES users(id),
  action TEXT NOT NULL,
  details_json TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

-- Case collaboration comments on findings or timeline events
CREATE TABLE IF NOT EXISTS comments (
  id TEXT PRIMARY KEY,
  case_id TEXT NOT NULL REFERENCES cases(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  target_type TEXT NOT NULL,                -- case | finding | event
  target_id TEXT NOT NULL,
  content TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

-- AI Medical-Legal Copilot chat conversation history
CREATE TABLE IF NOT EXISTS copilot_messages (
  id TEXT PRIMARY KEY,
  case_id TEXT NOT NULL REFERENCES cases(id) ON DELETE CASCADE,
  user_id TEXT REFERENCES users(id),
  role TEXT NOT NULL,                       -- user | assistant
  content TEXT NOT NULL,
  references_json TEXT NOT NULL DEFAULT '[]',
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

-- Audio recordings & voice statements (Sarvam Saaras transcription)
CREATE TABLE IF NOT EXISTS audio_records (
  id TEXT PRIMARY KEY,
  case_id TEXT NOT NULL REFERENCES cases(id) ON DELETE CASCADE,
  filename TEXT NOT NULL,
  duration_seconds REAL,
  transcript TEXT NOT NULL DEFAULT '',
  diarization_json TEXT NOT NULL DEFAULT '[]',
  language_code TEXT NOT NULL DEFAULT 'hi-IN',
  status TEXT NOT NULL DEFAULT 'transcribed', -- pending | transcribed | failed
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

-- Medical Expert Marketplace
CREATE TABLE IF NOT EXISTS marketplace_profiles (
  user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  specialty TEXT NOT NULL,
  experience_years INTEGER NOT NULL DEFAULT 0,
  medical_council_no TEXT,
  fee_per_case REAL NOT NULL DEFAULT 5000,
  bio TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'verified',  -- pending | verified | suspended
  rating REAL NOT NULL DEFAULT 5.0,
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

CREATE TABLE IF NOT EXISTS marketplace_requests (
  id TEXT PRIMARY KEY,
  case_id TEXT NOT NULL REFERENCES cases(id) ON DELETE CASCADE,
  expert_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  requester_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'requested', -- requested | accepted | declined | completed
  fee REAL NOT NULL DEFAULT 0,
  commission REAL NOT NULL DEFAULT 0,
  scheduled_at TEXT,
  notes TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

-- Insurance Claim Intelligence
CREATE TABLE IF NOT EXISTS insurance_claims (
  id TEXT PRIMARY KEY,
  case_id TEXT NOT NULL UNIQUE REFERENCES cases(id) ON DELETE CASCADE,
  claim_no TEXT NOT NULL,
  policy_no TEXT,
  insurer TEXT,
  billed_amount REAL NOT NULL DEFAULT 0,
  approved_amount REAL NOT NULL DEFAULT 0,
  fraud_risk_score REAL NOT NULL DEFAULT 0, -- 0..1
  status TEXT NOT NULL DEFAULT 'under_investigation', -- pending | under_investigation | approved | flagged
  discrepancies_json TEXT NOT NULL DEFAULT '[]',
  report_md TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

-- Hospital Clinical Audit
CREATE TABLE IF NOT EXISTS clinical_audits (
  id TEXT PRIMARY KEY,
  case_id TEXT NOT NULL UNIQUE REFERENCES cases(id) ON DELETE CASCADE,
  completeness_score REAL NOT NULL DEFAULT 0,       -- 0..100
  nursing_consistency_score REAL NOT NULL DEFAULT 0, -- 0..100
  missing_observations_json TEXT NOT NULL DEFAULT '[]',
  adverse_events_json TEXT NOT NULL DEFAULT '[]',
  audit_report_md TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

-- SaaS Administration & Organizations
CREATE TABLE IF NOT EXISTS organizations (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  plan TEXT NOT NULL DEFAULT 'starter',     -- starter | professional | enterprise
  quota_pages INTEGER NOT NULL DEFAULT 1000,
  pages_used INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

CREATE TABLE IF NOT EXISTS api_keys (
  id TEXT PRIMARY KEY,
  org_id TEXT REFERENCES organizations(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  key_hash TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  prefix TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  revoked_at TEXT
);

CREATE INDEX IF NOT EXISTS idx_blocks_page ON ocr_blocks (document_id, page_no, seq);
CREATE INDEX IF NOT EXISTS idx_events_case ON events (case_id, seq);
CREATE INDEX IF NOT EXISTS idx_sources_event ON event_sources (event_id);
CREATE INDEX IF NOT EXISTS idx_findings_case ON findings (case_id);
CREATE INDEX IF NOT EXISTS idx_copilot_case ON copilot_messages (case_id, created_at);
CREATE INDEX IF NOT EXISTS idx_activities_case ON activity_logs (case_id, created_at);
`;
