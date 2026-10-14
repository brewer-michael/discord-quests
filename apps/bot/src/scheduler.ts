/**
 * Round timers and reminders. Deadlines live in the database, so they come
 * back after a restart; this only holds the in-process timers.
 */
const MAX_TIMEOUT = 2 ** 31 - 1;

export class RoundScheduler {
  private readonly timers = new Map<string, NodeJS.Timeout>();

  /** Runs `fire` at `at`. Re-arms itself for times further away than a timer can wait (about 24 days). */
  schedule(key: string, at: Date, fire: () => void, now = Date.now) {
    this.cancel(key);
    const arm = () => {
      const delay = at.getTime() - now();
      const t = setTimeout(
        () => {
          if (at.getTime() - now() > 1000) return arm();
          this.timers.delete(key);
          fire();
        },
        Math.max(1000, Math.min(delay, MAX_TIMEOUT)),
      );
      t.unref?.();
      this.timers.set(key, t);
    };
    arm();
  }

  cancel(key: string) {
    const t = this.timers.get(key);
    if (t) clearTimeout(t);
    this.timers.delete(key);
  }

  /** Cancels a round's deadline and reminder. */
  cancelRound(roundId: string) {
    this.cancel(`${roundId}:deadline`);
    this.cancel(`${roundId}:reminder`);
  }

  has(key: string) {
    return this.timers.has(key);
  }

  size() {
    return this.timers.size;
  }

  stopAll() {
    for (const t of this.timers.values()) clearTimeout(t);
    this.timers.clear();
  }
}
