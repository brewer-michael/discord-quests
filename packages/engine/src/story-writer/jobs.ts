/**
 * The story writer's queue. Turns add jobs and never wait on them; the writer service claims one at a time,
 * saves each step as it finishes, and publishes the result. Only one job runs per campaign at once, and a job
 * for the same thing (a chapter's plan, say) is only ever queued once until it fails or a rewind undoes it.
 */
import {
  type Db,
  type DbOrTx,
  type StoryJobNotice,
  type StoryJobStatus,
  type StoryJobStep,
  storyJobs,
} from "@dq/db";
import { and, desc, eq, gt, inArray, lte, or, sql } from "drizzle-orm";

/**
 * What a job writes: the whole story when a campaign is created (bible), a chapter in detail (chapter), side
 * quests when the party goes off course (side_quest), material reworked after a DM's change (rework), and a
 * chapter's recap (recap).
 */
export type StoryJobKind = "bible" | "chapter" | "side_quest" | "rework" | "recap";
export type StoryJob = typeof storyJobs.$inferSelect;

/** What a job is for, as the DM and the setup page read it. */
export function jobTitle(job: Pick<StoryJob, "kind" | "key">): string {
  const chapter = job.key.split("+")[0];
  switch (job.kind) {
    case "bible":
      return "The story: outline, bible, spine, first chapter, side quests";
    case "chapter":
      return job.key.includes("+") ? `More of chapter ${chapter}` : `Chapter ${chapter}`;
    case "side_quest":
      return "Side quests for where the party went";
    case "rework":
      return `Rework after the DM's turn ${job.key}`;
    case "recap":
      return `Recap of chapter ${job.key}`;
    default:
      return job.kind;
  }
}

/** How long a claimed job is the worker's before another may take it over. The runner renews it. */
export const LEASE_MS = 2 * 60_000;
/** Minutes to wait before each retry. A job that fails once more after the last is given up on. */
export const RETRY_MINUTES = [1, 4, 16];
export const MAX_TRIES = RETRY_MINUTES.length + 1;

export interface EnqueueArgs {
  campaignId: string;
  kind: StoryJobKind;
  key: string | number;
  reason: string;
  /** The campaign's turn now. */
  seq: number;
}

export interface FailOptions {
  /** Try again at this time instead of after the usual wait. */
  retryAt?: Date;
  /** Don't count this try, as when the day's spending limit stopped it. */
  free?: boolean;
  /** Retrying won't help: give up now. */
  final?: boolean;
  /** Tokens the failed try spent, which count toward the job's allowance. */
  tokens?: number;
}

export class StoryJobs {
  private readonly leaseMs: number;

  constructor(
    private readonly db: Db,
    private readonly now: () => Date = () => new Date(),
    opts: { leaseMs?: number } = {},
  ) {
    this.leaseMs = opts.leaseMs ?? LEASE_MS;
  }

  /** Queues a job unless the same one is already queued, running or done. Returns whether it was queued. */
  async enqueue(args: EnqueueArgs, tx: DbOrTx = this.db): Promise<boolean> {
    const rows = await tx
      .insert(storyJobs)
      .values({
        campaignId: args.campaignId,
        kind: args.kind,
        key: String(args.key),
        reason: args.reason,
        enqueuedSeq: args.seq,
        runAfter: this.now(),
      })
      .onConflictDoNothing()
      .returning({ id: storyJobs.id });
    return rows.length > 0;
  }

  /**
   * Takes the next job that's due, or one a crashed worker left running, for `worker`. Never takes a second
   * job for a campaign that already has one running. Returns null when there's nothing to do. `campaignId`
   * keeps a worker to one campaign's jobs, for tests.
   */
  async claim(worker: string, campaignId?: string): Promise<StoryJob | null> {
    const now = this.now();
    try {
      return await this.db.transaction(async (tx) => {
        const [due] = await tx
          .select({ id: storyJobs.id })
          .from(storyJobs)
          .where(
            and(
              campaignId ? eq(storyJobs.campaignId, campaignId) : undefined,
              or(
                and(
                  eq(storyJobs.status, "queued"),
                  lte(storyJobs.runAfter, now),
                  sql`not exists (select 1 from ${storyJobs} as r where r.campaign_id = ${storyJobs.campaignId} and r.status = 'running')`,
                ),
                and(eq(storyJobs.status, "running"), sql`${storyJobs.leaseUntil} < ${now}`),
              ),
            ),
          )
          .orderBy(storyJobs.runAfter, storyJobs.createdAt)
          .limit(1)
          .for("update", { skipLocked: true });
        if (!due) return null;
        const [job] = await tx
          .update(storyJobs)
          .set({
            status: "running",
            leaseOwner: worker,
            leaseUntil: new Date(now.getTime() + this.leaseMs),
            heartbeatAt: now,
            attempts: sql`${storyJobs.attempts} + 1`,
            startedAt: sql`coalesce(${storyJobs.startedAt}, ${now})`,
            updatedAt: now,
          })
          .where(eq(storyJobs.id, due.id))
          .returning();
        return job ?? null;
      });
    } catch (e) {
      // Another worker started a job for the same campaign at the same moment: leave this one for later.
      if (isUniqueViolation(e)) return null;
      throw e;
    }
  }

  private mine(job: StoryJob) {
    return and(
      eq(storyJobs.id, job.id),
      eq(storyJobs.status, "running"),
      eq(storyJobs.leaseOwner, job.leaseOwner ?? ""),
    );
  }

  /** Renews the lease. False when the job is no longer this worker's (it went stale or was taken over). */
  async heartbeat(job: StoryJob): Promise<boolean> {
    const now = this.now();
    const rows = await this.db
      .update(storyJobs)
      .set({ leaseUntil: new Date(now.getTime() + this.leaseMs), heartbeatAt: now, updatedAt: now })
      .where(this.mine(job))
      .returning({ id: storyJobs.id });
    return rows.length > 0;
  }

  /** Sets what the DM room should hear about a running job. */
  async announce(job: StoryJob, notice: StoryJobNotice): Promise<void> {
    await this.db.update(storyJobs).set({ notice, updatedAt: this.now() }).where(this.mine(job));
  }

  /** Saves a finished step. False when the job is no longer this worker's. */
  async checkpoint(job: StoryJob, step: StoryJobStep): Promise<boolean> {
    const rows = await this.db
      .update(storyJobs)
      .set({
        steps: sql`${storyJobs.steps} || ${JSON.stringify([step])}::jsonb`,
        tokensUsed: sql`${storyJobs.tokensUsed} + ${step.tokens}`,
        updatedAt: this.now(),
      })
      .where(this.mine(job))
      .returning({ id: storyJobs.id });
    return rows.length > 0;
  }

  /** Locks the job row inside a transaction and says whether it's still this worker's to publish. */
  async lockMine(tx: DbOrTx, job: StoryJob): Promise<boolean> {
    const [row] = await tx.select({ id: storyJobs.id }).from(storyJobs).where(this.mine(job)).for("update");
    return Boolean(row);
  }

  async finish(job: StoryJob, notice: StoryJobNotice | null, tx: DbOrTx = this.db): Promise<void> {
    const now = this.now();
    await tx
      .update(storyJobs)
      .set({
        status: "done",
        leaseOwner: null,
        leaseUntil: null,
        error: null,
        notice,
        finishedAt: now,
        updatedAt: now,
      })
      .where(eq(storyJobs.id, job.id));
  }

  /**
   * Records a failed try. The job waits and runs again (1, 4, then 16 minutes) unless that was its last try;
   * then it's given up on until someone in the DM room asks for another go. `recorded` is false when the job
   * was no longer this worker's to fail.
   */
  async fail(
    job: StoryJob,
    reason: string,
    label: string,
    opts: FailOptions = {},
  ): Promise<{ retryAt: Date | null; recorded: boolean }> {
    const now = this.now();
    const attempts = opts.free ? Math.max(0, job.attempts - 1) : job.attempts;
    const last = opts.final || attempts >= MAX_TRIES;
    const retryAt = last
      ? null
      : (opts.retryAt ?? new Date(now.getTime() + (RETRY_MINUTES[attempts - 1] ?? 1) * 60_000));
    const notice: StoryJobNotice = retryAt
      ? {
          kind: "retrying",
          text: `⚠️ The story writer couldn't write ${label}: ${reason}. Trying again ${when(now, retryAt)}.`,
        }
      : {
          kind: "gave_up",
          text: `⚠️ The story writer couldn't write ${label}: ${reason}. Gave up after ${tries(Math.max(1, attempts))}.`,
        };
    const rows = await this.db
      .update(storyJobs)
      .set({
        status: retryAt ? "queued" : "failed",
        attempts,
        tokensUsed: sql`${storyJobs.tokensUsed} + ${Math.round(opts.tokens ?? 0)}`,
        runAfter: retryAt ?? now,
        leaseOwner: null,
        leaseUntil: null,
        error: reason,
        notice,
        finishedAt: retryAt ? null : now,
        updatedAt: now,
      })
      .where(this.mine(job))
      .returning({ id: storyJobs.id });
    return { retryAt, recorded: rows.length > 0 };
  }

  /** Marks a job whose work a rewind undid. Nothing it wrote is published. */
  async markStale(job: StoryJob, tx: DbOrTx = this.db): Promise<void> {
    const now = this.now();
    await tx
      .update(storyJobs)
      .set({
        status: "stale",
        leaseOwner: null,
        leaseUntil: null,
        notice: null,
        finishedAt: now,
        updatedAt: now,
      })
      .where(eq(storyJobs.id, job.id));
  }

  /** Hands a job back on shutdown: its saved steps stay, and this try doesn't count. */
  async release(job: StoryJob): Promise<void> {
    const now = this.now();
    await this.db
      .update(storyJobs)
      .set({
        status: "queued",
        attempts: sql`greatest(${storyJobs.attempts} - 1, 0)`,
        leaseOwner: null,
        leaseUntil: null,
        runAfter: now,
        updatedAt: now,
      })
      .where(this.mine(job));
  }

  /** Another go at a job that was given up on, from the DM room. */
  async retry(jobId: string): Promise<{ ok: boolean; job: StoryJob | null }> {
    const [job] = await this.db.select().from(storyJobs).where(eq(storyJobs.id, jobId));
    if (job?.status !== "failed") return { ok: false, job: job ?? null };
    const now = this.now();
    try {
      const [row] = await this.db
        .update(storyJobs)
        .set({
          status: "queued",
          attempts: 0,
          runAfter: now,
          error: null,
          notice: null,
          finishedAt: null,
          updatedAt: now,
        })
        .where(and(eq(storyJobs.id, jobId), eq(storyJobs.status, "failed")))
        .returning();
      return { ok: Boolean(row), job: row ?? job };
    } catch (e) {
      // The same thing has been queued again since.
      if (isUniqueViolation(e)) return { ok: false, job };
      throw e;
    }
  }

  /** Every turn after `toSeq` was undone: jobs queued in those turns are stale, and their results unused. */
  async staleAfter(tx: DbOrTx, campaignId: string, toSeq: number): Promise<number> {
    const now = this.now();
    const rows = await tx
      .update(storyJobs)
      .set({
        status: "stale",
        leaseOwner: null,
        leaseUntil: null,
        notice: null,
        finishedAt: now,
        updatedAt: now,
      })
      .where(
        and(
          eq(storyJobs.campaignId, campaignId),
          gt(storyJobs.enqueuedSeq, toSeq),
          inArray(storyJobs.status, ["queued", "running", "done"] satisfies StoryJobStatus[]),
        ),
      )
      .returning({ id: storyJobs.id });
    return rows.length;
  }

  /** Jobs with something to tell the DM room, oldest first; one campaign's when `campaignId` is given. */
  async pendingNotices(limit = 20, campaignId?: string): Promise<StoryJob[]> {
    return this.db
      .select()
      .from(storyJobs)
      .where(
        and(
          sql`${storyJobs.notice} is not null`,
          campaignId ? eq(storyJobs.campaignId, campaignId) : undefined,
        ),
      )
      .orderBy(storyJobs.updatedAt)
      .limit(limit);
  }

  /** Clears a notice once posted, unless a newer one replaced it meanwhile. */
  async markNoticed(job: StoryJob): Promise<void> {
    if (!job.notice) return;
    await this.db
      .update(storyJobs)
      .set({ notice: null })
      .where(and(eq(storyJobs.id, job.id), sql`${storyJobs.notice}->>'text' = ${job.notice.text}`));
  }

  /** A campaign's latest jobs, newest first, for the setup page. */
  async recent(campaignId: string, limit = 12): Promise<StoryJob[]> {
    return this.db
      .select()
      .from(storyJobs)
      .where(eq(storyJobs.campaignId, campaignId))
      .orderBy(desc(storyJobs.createdAt))
      .limit(limit);
  }

  /** About how long a job of this kind takes, from the last ten finished ones; `fallback` until there are any. */
  async typicalMinutes(kind: StoryJobKind | string, fallback: number): Promise<number> {
    const rows = await this.db
      .select({ startedAt: storyJobs.startedAt, finishedAt: storyJobs.finishedAt })
      .from(storyJobs)
      .where(and(eq(storyJobs.kind, kind), eq(storyJobs.status, "done")))
      .orderBy(desc(storyJobs.finishedAt))
      .limit(10);
    const spans = rows
      .filter((r) => r.startedAt && r.finishedAt)
      .map((r) => ((r.finishedAt as Date).getTime() - (r.startedAt as Date).getTime()) / 60_000)
      .sort((a, b) => a - b);
    if (spans.length === 0) return fallback;
    return Math.max(1, Math.round(spans[Math.floor(spans.length / 2)] as number));
  }

  /** Whether a job of this kind is queued or running for the campaign. */
  async pending(campaignId: string, kind: StoryJobKind, tx: DbOrTx = this.db): Promise<boolean> {
    const [row] = await tx
      .select({ id: storyJobs.id })
      .from(storyJobs)
      .where(
        and(
          eq(storyJobs.campaignId, campaignId),
          eq(storyJobs.kind, kind),
          inArray(storyJobs.status, ["queued", "running"] satisfies StoryJobStatus[]),
        ),
      )
      .limit(1);
    return Boolean(row);
  }

  async get(jobId: string): Promise<StoryJob | null> {
    const [job] = await this.db.select().from(storyJobs).where(eq(storyJobs.id, jobId));
    return job ?? null;
  }
}

/** Postgres's unique violation, as thrown or as wrapped by drizzle. */
function isUniqueViolation(e: unknown): boolean {
  const err = e as { code?: string; cause?: { code?: string } };
  return err.code === "23505" || err.cause?.code === "23505";
}

function tries(n: number): string {
  return n === 1 ? "1 try" : `${n} tries`;
}

function when(now: Date, at: Date): string {
  const minutes = Math.round((at.getTime() - now.getTime()) / 60_000);
  if (minutes <= 1) return "in a minute";
  if (minutes < 90) return `in ${minutes} minutes`;
  if (at.getUTCDate() !== now.getUTCDate()) return "tomorrow";
  return `in ${Math.round(minutes / 60)} hours`;
}

/** Just after the next UTC midnight, when the day's spending limits start again. */
export function nextBudgetDay(now: Date): Date {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1, 0, 5));
}
