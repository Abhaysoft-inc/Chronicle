import { createHash } from 'node:crypto';
import type { Db } from '../../core/db/index.ts';
import { get, run } from '../../core/db/index.ts';
import { CacheMissError } from './http.ts';

export function hashOf(...parts: unknown[]): string {
  const h = createHash('sha256');
  for (const p of parts) {
    if (p instanceof Uint8Array) h.update(p);
    else h.update(typeof p === 'string' ? p : JSON.stringify(p));
    h.update('\u0000');
  }
  return h.digest('hex');
}

export interface Cache {
  /** Return the cached value, or compute it with fn and store it. */
  through<T>(endpoint: string, key: string, fn: () => Promise<T>): Promise<T>;
}

export function makeCache(db: Db, cacheOnly: boolean): Cache {
  return {
    async through<T>(endpoint: string, key: string, fn: () => Promise<T>): Promise<T> {
      const row = get<{ response_json: string }>(db, 'SELECT response_json FROM api_cache WHERE request_hash = ?', key);
      if (row) return JSON.parse(row.response_json) as T;
      if (cacheOnly) throw new CacheMissError(`${endpoint} ${key.slice(0, 10)}`);
      const value = await fn();
      run(
        db,
        'INSERT OR REPLACE INTO api_cache (request_hash, endpoint, response_json) VALUES (?, ?, ?)',
        key, endpoint, JSON.stringify(value),
      );
      return value;
    },
  };
}
