/**
 * The story writer: deep story work done in the background, ahead of the table, by its own service. Turns
 * queue jobs and never wait for them.
 */
import { randomUUID } from "node:crypto";
import { silentLogger } from "../deps";
import { chapterPlanKind } from "./chapter-plan";
import { chapterRecapKind } from "./chapter-recap";
import type { StoryJob } from "./jobs";
import { type RunOutcome, runJob, type WriterDeps, type WriterKind } from "./runner";

export * from "./jobs";
export {
  DEFAULT_DEADLINE_MS,
  DEFAULT_JOB_TOKENS,
  type RunOutcome,
  StepFailure,
  type WriterDeps,
} from "./runner";

export const WRITER_KINDS: Record<string, WriterKind> = {
  chapter_plan: chapterPlanKind,
  chapter_recap: chapterRecapKind,
};

export interface StoryWriterOptions extends WriterDeps {
  /** Who this worker is, in the queue's leases. */
  worker?: string;
  /** How long to wait between looks at the queue when there's nothing to do. */
  pollMs?: number;
  kinds?: Record<string, WriterKind>;
  /** Only this campaign's jobs, for tests. */
  campaignId?: string;
}

/** One worker: takes a job, runs it, takes the next. Run as many as you like; they never share a campaign. */
export class StoryWriter {
  readonly worker: string;
  private stopping = false;
  private current: { job: StoryJob; run: Promise<RunOutcome>; stop: AbortController } | null = null;
  private loop: Promise<void> | null = null;
  private wake: (() => void) | null = null;

  constructor(private readonly opts: StoryWriterOptions) {
    this.worker = opts.worker ?? `writer-${randomUUID().slice(0, 8)}`;
  }

  /** The job under way, if any. */
  get job(): StoryJob | null {
    return this.current?.job ?? null;
  }

  /** Runs the next due job, if there is one. */
  async runOnce(): Promise<{ job: StoryJob; outcome: RunOutcome } | null> {
    if (this.stopping) return null;
    const job = await this.opts.jobs.claim(this.worker, this.opts.campaignId);
    if (!job) return null;
    // Told to stop while it was claiming: the job goes straight back, untouched.
    if (this.stopping) {
      await this.opts.jobs.release(job);
      return null;
    }
    const stop = new AbortController();
    const run = runJob(job, this.opts.kinds ?? WRITER_KINDS, this.opts, stop.signal);
    this.current = { job, run, stop };
    try {
      return { job, outcome: await run };
    } finally {
      this.current = null;
    }
  }

  /** Runs jobs until none are due. For tests and the stress test. */
  async drain(max = 100): Promise<Array<{ job: StoryJob; outcome: RunOutcome }>> {
    const done: Array<{ job: StoryJob; outcome: RunOutcome }> = [];
    for (let i = 0; i < max; i++) {
      const r = await this.runOnce();
      if (!r) break;
      done.push(r);
    }
    return done;
  }

  /** Works through the queue until stopped, looking again every `pollMs` when there's nothing to do. */
  start(): void {
    if (this.loop) return;
    const log = this.opts.log ?? silentLogger;
    const pollMs = this.opts.pollMs ?? 5_000;
    let waitingSaid = 0;
    this.loop = (async () => {
      while (!this.stopping) {
        let ran = false;
        try {
          ran = (await this.runOnce()) !== null;
        } catch (e) {
          // Started before the bot migrated the database: say so once a minute, not every look at the queue.
          if (missingTable(e)) {
            if (Date.now() - waitingSaid > 60_000) {
              log.warn("writer waiting for the database to be migrated", { worker: this.worker });
              waitingSaid = Date.now();
            }
          } else log.error("writer loop error", { worker: this.worker, error: (e as Error).message });
        }
        if (!ran && !this.stopping)
          await new Promise<void>((resolve) => {
            const t = setTimeout(resolve, pollMs);
            this.wake = () => {
              clearTimeout(t);
              resolve();
            };
          });
      }
    })();
  }

  /**
   * Stops taking jobs and gives the one under way up to `graceMs` to finish. If it doesn't, its lease is handed
   * back: the steps it finished stay saved and the next worker carries on from there.
   */
  async stop(graceMs = 25_000): Promise<void> {
    this.stopping = true;
    this.wake?.();
    let timer: NodeJS.Timeout | undefined;
    const graceOver = new Promise<false>((resolve) => {
      timer = setTimeout(() => resolve(false), graceMs);
    });
    const current = this.current;
    if (!current) {
      // Maybe in the middle of claiming: runOnce hands back anything it claims from now on.
      await Promise.race([this.loop, graceOver]);
      clearTimeout(timer);
      return;
    }
    const finished = await Promise.race([current.run.then(() => true), graceOver]);
    clearTimeout(timer);
    if (finished) return void (await this.loop);
    // Handed back first, then stopped, so the cut-off try isn't recorded as a failure.
    await this.opts.jobs.release(current.job);
    current.stop.abort();
    (this.opts.log ?? silentLogger).info("writer job released", {
      jobId: current.job.id,
      kind: current.job.kind,
      campaignId: current.job.campaignId,
    });
  }
}

/** Postgres's "relation does not exist", as thrown or as wrapped by drizzle. */
function missingTable(e: unknown): boolean {
  const err = e as { code?: string; cause?: { code?: string } };
  return err.code === "42P01" || err.cause?.code === "42P01";
}
