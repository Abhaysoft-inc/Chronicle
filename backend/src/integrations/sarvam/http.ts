// Shared plumbing for Sarvam calls: errors, rate limiting, retries.

export class SarvamError extends Error {
  status: number;
  body: string;
  constructor(status: number, message: string, body = '') {
    super(message);
    this.name = 'SarvamError';
    this.status = status;
    this.body = body;
  }
}

/** 402: free credit is gone. Retrying cannot help, so this stops the pipeline. */
export class QuotaError extends SarvamError {
  constructor(body = '') {
    super(402, 'Sarvam credits exhausted (402). Top up and re-run; finished work is cached.', body);
    this.name = 'QuotaError';
  }
}

export class CacheMissError extends Error {
  constructor(what: string) {
    super(`CACHE_ONLY is on and nothing is cached for ${what}`);
    this.name = 'CacheMissError';
  }
}

export const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

/** Spaces calls so no more than `rpm` start per minute. Calls run one after another in order. */
export class RateLimiter {
  private nextSlot = 0;
  private readonly gap: number;
  constructor(rpm: number) {
    this.gap = 60_000 / rpm;
  }
  async wait(): Promise<void> {
    const now = Date.now();
    const slot = Math.max(now, this.nextSlot);
    this.nextSlot = slot + this.gap;
    if (slot > now) await sleep(slot - now);
  }
}

export interface RetryOptions {
  retries?: number;
  baseMs?: number;
}

/** Retry 429/503/network errors with exponential backoff. Never retries 402 or other 4xx. */
export async function withRetry<T>(fn: () => Promise<T>, opts: RetryOptions = {}): Promise<T> {
  const retries = opts.retries ?? 4;
  const baseMs = opts.baseMs ?? 1000;
  let lastErr: unknown;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastErr = err;
      if (err instanceof QuotaError) throw err;
      const retryable =
        err instanceof SarvamError ? err.status === 429 || err.status === 503 || err.status >= 500
        : err instanceof TypeError; // fetch network failure
      if (!retryable || attempt === retries) throw err;
      await sleep(baseMs * 2 ** attempt + Math.random() * 250);
    }
  }
  throw lastErr;
}

/** Turn a non-2xx response into a typed error. */
export async function failIfNotOk(res: Response, what: string): Promise<void> {
  if (res.ok) return;
  const body = await res.text().catch(() => '');
  if (res.status === 402) throw new QuotaError(body);
  throw new SarvamError(res.status, `${what} failed with HTTP ${res.status}: ${body.slice(0, 300)}`, body);
}
