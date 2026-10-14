/**
 * A small sliding-window limit per person. Typed actions each cost a safety
 * check (and AI calls), so they're capped; buttons aren't.
 */
export class RateLimiter {
  private readonly hits = new Map<string, number[]>();

  constructor(
    private readonly max: number,
    private readonly windowMs: number,
  ) {}

  /** Records an attempt. Returns 0 if allowed, or the seconds to wait. */
  take(key: string, now = Date.now()): number {
    const recent = (this.hits.get(key) ?? []).filter((t) => now - t < this.windowMs);
    if (recent.length >= this.max) {
      this.hits.set(key, recent);
      return Math.max(1, Math.ceil(((recent[0] as number) + this.windowMs - now) / 1000));
    }
    recent.push(now);
    this.hits.set(key, recent);
    if (this.hits.size > 10_000) this.prune(now);
    return 0;
  }

  private prune(now: number) {
    for (const [k, v] of this.hits) if (v.every((t) => now - t >= this.windowMs)) this.hits.delete(k);
  }
}

/** Six typed actions a minute is plenty for play, and stops a stuck key from running up a bill. */
export const typedActions = new RateLimiter(6, 60_000);
