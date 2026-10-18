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
  private current: { job: StoryJob; run: Promise<RunOutcome> } | null = null;
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
    const run = runJob(job, this.opts.kinds ?? WRITER_KINDS, this.opts);
    this.current = { job, run };
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
    this.loop = (async () => {
      while (!this.stopping) {
        let ran = false;
        try {
          ran = (await this.runOnce()) !== null;
        } catch (e) {
          log.error("writer loop error", { worker: this.worker, error: (e as Error).message });
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
    const current = this.current;
    if (!current) return void (await this.loop);
    let timer: NodeJS.Timeout | undefined;
    const finished = await Promise.race([
      current.run.then(() => true),
      new Promise<boolean>((resolve) => {
        timer = setTimeout(() => resolve(false), graceMs);
      }),
    ]);
    clearTimeout(timer);
    if (finished) return void (await this.loop);
    await this.opts.jobs.release(current.job);
    (this.opts.log ?? silentLogger).info("writer job released", {
      jobId: current.job.id,
      kind: current.job.kind,
      campaignId: current.job.campaignId,
    });
  }
}
