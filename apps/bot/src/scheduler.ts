/**
 * Round timers. In live play, a round resolves when everyone has acted or the
 * timer runs out. Deadlines live in the database, so timers come back after a
 * restart.
 */
export class RoundScheduler {
  private readonly timers = new Map<string, NodeJS.Timeout>();

  schedule(roundId: string, at: Date, fire: () => void) {
    this.cancel(roundId);
    const delay = Math.max(1000, at.getTime() - Date.now());
    const t = setTimeout(
      () => {
        this.timers.delete(roundId);
        fire();
      },
      Math.min(delay, 2 ** 31 - 1),
    );
    t.unref?.();
    this.timers.set(roundId, t);
  }

  cancel(roundId: string) {
    const t = this.timers.get(roundId);
    if (t) clearTimeout(t);
    this.timers.delete(roundId);
  }

  size() {
    return this.timers.size;
  }

  stopAll() {
    for (const t of this.timers.values()) clearTimeout(t);
    this.timers.clear();
  }
}
