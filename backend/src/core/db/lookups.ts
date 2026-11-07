import { notFound } from '../errors.ts';
import { get, type Db } from './index.ts';

// "Does this id exist?" checks shared by every module, so no module needs to import
// another module just to return a 404.

export interface CaseRow {
  id: string;
  owner_id: string | null;
  title: string;
  case_type: string;
  claim_summary: string;
  output_language: string;
  status: string;
  created_at: string;
}

export function requireCase(db: Db, id: string): CaseRow {
  const row = get<CaseRow>(db, 'SELECT * FROM cases WHERE id = ?', id);
  if (!row) throw notFound(`Case ${id}`);
  return row;
}

export interface DocumentRow {
  id: string;
  case_id: string;
  filename: string;
  sha256: string;
  mime: string;
  page_count: number | null;
  language: string | null;
  path: string;
  created_at: string;
}

export function requireDocument(db: Db, id: string): DocumentRow {
  const row = get<DocumentRow>(db, 'SELECT * FROM documents WHERE id = ?', id);
  if (!row) throw notFound(`Document ${id}`);
  return row;
}
