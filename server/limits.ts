/**
 * Numbers on the things that had none.
 *
 * An unbounded resource is the one class of bug that gets strictly harder to
 * fix as a project grows, because by then it is unbounded in six places. This
 * app had three, and one of them was serious: `/api/login` forwards credentials
 * to Jellyfin's own authenticate endpoint with nothing in front of it, so
 * Matcher was a rate-limit-free amplifier for guessing passwords against the
 * media server — worse on the public hostname the README used to recommend
 * (R77).
 *
 * Deliberately in-memory and deliberately small. Rooms already live in memory
 * and die with the process; a counter that outlived them would be stranger
 * than one that does not, and a dependency for this would be worse than both.
 */

/** Failed logins from one address before it has to wait. */
export const LOGIN_ATTEMPTS = 8;
/** How long that address waits. */
export const LOGIN_WINDOW_MS = 10 * 60 * 1000;
/** Rooms one socket may create, so a script cannot fill the process with them. */
/**
 * Attempts to take a seat, per address, per window (R86). Room codes are four
 * characters and user ids are a global counter, so an unlimited join endpoint
 * enumerates both. Generous enough that a household reconnecting on flaky wifi
 * never meets it: a phone rejoining costs one attempt and a success clears the
 * count.
 */
export const JOIN_ATTEMPTS = 30;
export const JOIN_WINDOW_MS = 60 * 1000;

export const ROOMS_PER_SOCKET = 20;
/** Total live rooms. A household needs one; this is a ceiling, not a budget. */
export const MAX_ROOMS = 500;

type Bucket = { count: number; resetAt: number };

/**
 * A fixed-window counter. Not a token bucket: the failure mode of a fixed
 * window is that a burst can straddle the boundary and get 2x the budget,
 * which for "somebody is guessing passwords" is fine, and the simpler thing
 * is easier to reason about at 11pm.
 */
export class RateLimiter {
  private readonly buckets = new Map<string, Bucket>();

  constructor(
    private readonly limit: number,
    private readonly windowMs: number,
    private readonly now: () => number = Date.now,
  ) {}

  /** True when this key is over budget. Does not count the attempt. */
  isLimited(key: string): boolean {
    const bucket = this.buckets.get(key);
    if (!bucket || this.now() >= bucket.resetAt) return false;
    return bucket.count >= this.limit;
  }

  /** Count one attempt against the key. Returns whether it is now over. */
  record(key: string): boolean {
    const now = this.now();
    const bucket = this.buckets.get(key);
    if (!bucket || now >= bucket.resetAt) {
      this.buckets.set(key, { count: 1, resetAt: now + this.windowMs });
      return this.limit <= 1;
    }
    bucket.count += 1;
    return bucket.count >= this.limit;
  }

  /** A successful login clears the address, so a fumbled password is not a ban. */
  clear(key: string): void {
    this.buckets.delete(key);
  }

  /** Seconds until this key is free again, for an honest error message. */
  retryAfterSec(key: string): number {
    const bucket = this.buckets.get(key);
    if (!bucket) return 0;
    return Math.max(0, Math.ceil((bucket.resetAt - this.now()) / 1000));
  }

  /** Drop expired buckets so the map cannot grow without bound either. */
  sweep(): void {
    const now = this.now();
    for (const [key, bucket] of this.buckets) {
      if (now >= bucket.resetAt) this.buckets.delete(key);
    }
  }

  /** For /healthz: how many keys are currently being tracked. */
  size(): number {
    return this.buckets.size;
  }
}
