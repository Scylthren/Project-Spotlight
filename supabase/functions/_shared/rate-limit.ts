/**
 * A crude fixed-window request limiter, kept in memory (Gate 3 cleanup).
 *
 * BEST EFFORT ONLY. The count lives in one function instance (a Deno
 * isolate): the hosted runtime may run several isolates at once and starts
 * fresh ones whenever it likes, and each has its own count. It is not a
 * per-user limit either: every caller with the development token shares
 * one window. It only caps how fast one warm instance calls the model, so a
 * runaway loop in the app or a leaked token cannot spend much per minute.
 * Gate 4 (real accounts) replaces it with a per-user limit kept in the
 * database.
 *
 * The functions count every request that passed the token check, before
 * the body is read (a bad body counts too).
 */

export interface RateLimit {
  /** Requests allowed per window. */
  limit: number;
  /** Window length in milliseconds. */
  windowMs: number;
}

export type RateDecision = { ok: true } | { ok: false; retryAfterSeconds: number };

export class FixedWindowRateLimiter {
  private windowStart = Number.NEGATIVE_INFINITY;
  private count = 0;

  constructor(private readonly rate: RateLimit) {
    if (!Number.isInteger(rate.limit) || rate.limit < 1) throw new Error('limit must be a positive integer');
    if (!(rate.windowMs > 0)) throw new Error('windowMs must be positive');
  }

  /**
   * Counts one request at `now` (milliseconds). Allowed while the window has
   * room; refused requests are not counted. A new window starts at the first
   * request after the previous one ended.
   */
  take(now: number): RateDecision {
    if (now - this.windowStart >= this.rate.windowMs || now < this.windowStart) {
      this.windowStart = now;
      this.count = 0;
    }
    if (this.count >= this.rate.limit) {
      const waitMs = this.windowStart + this.rate.windowMs - now;
      return { ok: false, retryAfterSeconds: Math.max(1, Math.ceil(waitMs / 1000)) };
    }
    this.count += 1;
    return { ok: true };
  }
}
