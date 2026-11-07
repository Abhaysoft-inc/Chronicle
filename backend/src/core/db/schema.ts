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

CREATE INDEX IF NOT EXISTS idx_blocks_page ON ocr_blocks (document_id, page_no, seq);
CREATE INDEX IF NOT EXISTS idx_events_case ON events (case_id, seq);
CREATE INDEX IF NOT EXISTS idx_sources_event ON event_sources (event_id);
`;
