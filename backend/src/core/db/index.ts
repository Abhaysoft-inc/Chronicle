import fs from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { SCHEMA } from './schema.ts';

export type Db = DatabaseSync;

// CREATE TABLE IF NOT EXISTS leaves an existing table untouched, so a column added to the
// schema later must also be added here for databases created before it existed.
const ADDED_COLUMNS: [table: string, column: string, type: string][] = [
  ['ocr_blocks', 'bbox_norm_json', 'TEXT'],
  ['ocr_blocks', 'confidence', 'REAL'],
  ['pages', 'image_width', 'INTEGER'],
  ['pages', 'image_height', 'INTEGER'],
  ['cases', 'owner_id', 'TEXT'],
  ['events', 'date_note', 'TEXT'],
  ['events', 'duplicate_of', 'TEXT'],
  ['events', 'origin', "TEXT NOT NULL DEFAULT 'extracted'"],
  ['events', 'created_by', 'TEXT'],
];

function migrate(db: Db): void {
  for (const [table, column, type] of ADDED_COLUMNS) {
    const have = (db.prepare(`PRAGMA table_info(${table})`).all() as { name: string }[]).map((c) => c.name);
    if (!have.includes(column)) db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${type}`);
  }
  // Created here, not in SCHEMA: on an older database the column only exists after the ALTER above.
  db.exec('CREATE INDEX IF NOT EXISTS idx_cases_owner ON cases (owner_id)');
  db.exec('CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions (user_id)');
}

/** Open the database. Pass ':memory:' in tests. */
export function openDb(file: string): Db {
  if (file !== ':memory:') fs.mkdirSync(path.dirname(file), { recursive: true });
  const db = new DatabaseSync(file);
  db.exec('PRAGMA foreign_keys = ON;');
  if (file !== ':memory:') db.exec('PRAGMA journal_mode = WAL;');
  db.exec(SCHEMA);
  migrate(db);
  return db;
}

/** Run fn inside a transaction; roll back if it throws. */
export function tx<T>(db: Db, fn: () => T): T {
  db.exec('BEGIN');
  try {
    const out = fn();
    db.exec('COMMIT');
    return out;
  } catch (err) {
    db.exec('ROLLBACK');
    throw err;
  }
}

export function newId(prefix: string): string {
  return `${prefix}_${crypto.randomUUID().replace(/-/g, '').slice(0, 12)}`;
}

export type Row = Record<string, string | number | null | Uint8Array | bigint>;

export function all<T = Row>(db: Db, sql: string, ...params: (string | number | null)[]): T[] {
  return db.prepare(sql).all(...params) as unknown as T[];
}

export function get<T = Row>(db: Db, sql: string, ...params: (string | number | null)[]): T | undefined {
  return db.prepare(sql).get(...params) as unknown as T | undefined;
}

export function run(db: Db, sql: string, ...params: (string | number | null)[]) {
  return db.prepare(sql).run(...params);
}
