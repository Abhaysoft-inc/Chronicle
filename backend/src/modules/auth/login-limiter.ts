/**
 * Slows down password guessing: after `max` failed attempts for the same (address, email) within
 * `windowMs`, further attempts are refused until the window passes. In memory, so it resets on
 * restart and is per server process. That is enough for a single-server prototype.
 */
export class LoginLimiter {
  private readonly attempts = new Map<string, { count: number; resetAt: number }>();
  private readonly max: number;
  private readonly windowMs: number;
  private readonly now: () => number;

  constructor(max = 10, windowMs = 15 * 60_000, now: () => number = Date.now) {
    this.max = max;
    this.windowMs = windowMs;
    this.now = now;
  }

  /** Seconds the caller must wait, or 0 if they may try. */
  retryAfter(key: string): number {
    const entry = this.attempts.get(key);
    if (!entry || entry.resetAt <= this.now()) return 0;
    return entry.count >= this.max ? Math.ceil((entry.resetAt - this.now()) / 1000) : 0;
  }

  fail(key: string): void {
    const t = this.now();
    const entry = this.attempts.get(key);
    if (!entry || entry.resetAt <= t) this.attempts.set(key, { count: 1, resetAt: t + this.windowMs });
    else entry.count++;
    if (this.attempts.size > 5000) this.sweep(t); // never grow without bound
  }

  succeed(key: string): void {
    this.attempts.delete(key);
  }

  private sweep(t: number): void {
    for (const [k, v] of this.attempts) if (v.resetAt <= t) this.attempts.delete(k);
  }
}
