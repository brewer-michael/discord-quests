/**
 * Runs one story-writer job: its steps in order, each saved as it finishes, then the result published in the
 * same transaction that marks the job done. A step already saved by an earlier try is never run again, so a
 * crash or a deploy costs at most the step that was under way.
 */
import type { CallScope, LlmGateway, StructuredCall, StructuredOutcome } from "@dq/core/llm";
import type { NarrationStory } from "@dq/core/narration";
import type { WorldIndex } from "@dq/core/world";
import { campaigns, type Db, type StoryJobNotice, type Tx } from "@dq/db";
import { eq } from "drizzle-orm";
import { type Logger, silentLogger } from "../deps";
import { campaignStory } from "../story-profile";
import { isRewound } from "../story-state";
import type { WorldCache } from "../world-cache";
import { type FailOptions, nextBudgetDay, type StoryJob, type StoryJobKind, type StoryJobs } from "./jobs";

export interface WriterDeps {
  db: Db;
  llm: LlmGateway;
  worlds: WorldCache;
  jobs: StoryJobs;
  log?: Logger;
  now?: () => Date;
  /** The most AI tokens one job may use. */
  jobTokens?: number;
  /** How long one try may run. */
  deadlineMs?: number;
  /** How often a running job renews its lease. */
  heartbeatMs?: number;
}

export const DEFAULT_JOB_TOKENS = 200_000;
export const DEFAULT_DEADLINE_MS = 30 * 60_000;
const HEARTBEAT_MS = 30_000;

/** A step that couldn't finish, with what the DM room is told. */
export class StepFailure extends Error {
  constructor(
    reason: string,
    readonly opts: FailOptions = {},
  ) {
    super(reason);
  }
}

class Lost extends Error {}

type CampaignRow = typeof campaigns.$inferSelect;

export interface StepContext {
  db: Db;
  log: Logger;
  job: StoryJob;
  campaign: CampaignRow;
  index: WorldIndex;
  telling: NarrationStory;
  scope: CallScope;
  /** What the steps finished so far produced, by name. */
  outputs: Record<string, unknown>;
  /** One AI call; its tokens count toward the job's allowance. Throws a StepFailure if it fails. */
  ask<T>(call: StructuredCall<T>): Promise<T>;
}

export interface WriterKind {
  kind: StoryJobKind;
  /** What the DM room calls the job: "chapter 3", "the recap of chapter 2". */
  label(job: StoryJob): string;
  /** What the DM room hears when the job first starts, if anything. */
  started?(job: StoryJob): StoryJobNotice;
  steps: Array<{ name: string; run(ctx: StepContext): Promise<unknown> }>;
  /** Saves the result, inside the transaction that marks the job done. Returns what the DM room hears. */
  publish(tx: Tx, ctx: StepContext): Promise<StoryJobNotice | null>;
}

export type RunOutcome = "done" | "failed" | "retrying" | "stale" | "lost";

const STOPS: Record<Exclude<StructuredOutcome<unknown>, { ok: true }>["stop"], string> = {
  unconfigured: "no AI service is set up for it on the setup page",
  budget: "today's spending limit was reached",
  refusal: "the AI service declined to write it",
  max_tokens: "the answer ran past the service's length limit",
  filtered: "the AI service's content filter stopped it",
  invalid: "the answer didn't come back in the shape it was asked for",
  error: "the AI service failed",
};

export async function runJob(
  job: StoryJob,
  kinds: Record<string, WriterKind>,
  deps: WriterDeps,
): Promise<RunOutcome> {
  const log = deps.log ?? silentLogger;
  const now = deps.now ?? (() => new Date());
  const fields = { jobId: job.id, kind: job.kind, key: job.key, campaignId: job.campaignId };
  const kind = kinds[job.kind];
  if (!kind) {
    await deps.jobs.fail(job, `there's no writer for "${job.kind}" jobs`, job.kind, { final: true });
    log.error("writer job failed", { ...fields, reason: "unknown kind" });
    return "failed";
  }
  const label = kind.label(job);
  const [campaign] = await deps.db.select().from(campaigns).where(eq(campaigns.id, job.campaignId));
  if (!campaign) {
    await deps.jobs.markStale(job);
    return "stale";
  }
  log.info("writer job claimed", {
    ...fields,
    attempt: job.attempts,
    resumeAfter: job.steps.map((s) => s.name),
  });
  if (job.attempts === 1 && job.steps.length === 0 && kind.started)
    await deps.jobs.announce(job, kind.started(job));

  const ceiling = deps.jobTokens ?? DEFAULT_JOB_TOKENS;
  const limitMs = deps.deadlineMs ?? DEFAULT_DEADLINE_MS;
  const deadline = Date.now() + limitMs;
  let tokensUsed = job.tokensUsed;
  let stepTokens = 0;

  // The lease is renewed while the job runs. If it's lost (a rewind made the job stale, or the worker stalled
  // long enough for another to take over), the job stops here and saves nothing more.
  let lose: (e: Error) => void = () => {};
  const lost = new Promise<never>((_, reject) => {
    lose = reject;
  });
  lost.catch(() => {});
  const beat = setInterval(() => {
    deps.jobs.heartbeat(job).then(
      (mine) => mine || lose(new Lost("lease lost")),
      (e) => log.warn("writer heartbeat failed", { ...fields, error: (e as Error).message }),
    );
  }, deps.heartbeatMs ?? HEARTBEAT_MS);

  try {
    const ctx: StepContext = {
      db: deps.db,
      log,
      job,
      campaign,
      index: deps.worlds.get(campaign.worldId).index,
      telling: (await campaignStory(deps.db, campaign)).story,
      scope: { guildId: campaign.guildId, campaignId: campaign.id },
      outputs: Object.fromEntries(job.steps.map((s) => [s.name, s.output])),
      ask: async <T>(call: StructuredCall<T>) => {
        const res = await deps.llm.structured(call, { guildId: campaign.guildId, campaignId: campaign.id });
        if (res.usage) stepTokens += Math.round(res.usage.inputTokens + res.usage.outputTokens);
        if (res.ok) return res.value;
        const why = STOPS[res.stop];
        if (res.stop === "budget") throw new StepFailure(why, { retryAt: nextBudgetDay(now()), free: true });
        throw new StepFailure(
          res.stop === "error" && res.error ? `${why} (${res.error.slice(0, 160)})` : why,
        );
      },
    };

    for (const step of kind.steps) {
      if (step.name in ctx.outputs) continue;
      if (tokensUsed >= ceiling)
        throw new StepFailure(`it used up its allowance of ${ceiling.toLocaleString("en")} tokens`, {
          final: true,
        });
      const started = Date.now();
      stepTokens = 0;
      const output = await within(step.run(ctx), deadline, limitMs, lost);
      tokensUsed += stepTokens;
      const saved = await deps.jobs.checkpoint(job, {
        name: step.name,
        output,
        tokens: stepTokens,
        ms: Date.now() - started,
        finishedAt: now().toISOString(),
      });
      if (!saved) throw new Lost("lease lost");
      ctx.outputs[step.name] = output;
      log.info("writer step done", {
        ...fields,
        step: step.name,
        ms: Date.now() - started,
        tokens: stepTokens,
      });
    }

    const outcome = await deps.db.transaction(async (tx) => {
      const [locked] = await tx
        .select()
        .from(campaigns)
        .where(eq(campaigns.id, job.campaignId))
        .for("update");
      if (!locked || !(await deps.jobs.lockMine(tx, job))) return "lost" as const;
      if (isRewound(locked.story, job.enqueuedSeq)) {
        await deps.jobs.markStale(job, tx);
        return "stale" as const;
      }
      await deps.jobs.finish(job, await kind.publish(tx, ctx), tx);
      return "done" as const;
    });
    if (outcome === "lost") throw new Lost("lease lost");
    if (outcome === "stale") {
      log.info("writer job stale", fields);
      return "stale";
    }
    log.info("writer job done", { ...fields, attempt: job.attempts, tokens: tokensUsed });
    return "done";
  } catch (e) {
    const failure =
      e instanceof Lost || e instanceof StepFailure
        ? e
        : new StepFailure("something went wrong in the story writer");
    if (!(e instanceof Lost || e instanceof StepFailure))
      log.error("writer job crashed", { ...fields, error: (e as Error).message });
    if (failure instanceof StepFailure) {
      const { retryAt, recorded } = await deps.jobs.fail(job, failure.message, label, failure.opts);
      if (recorded) {
        log.warn("writer job failed", {
          ...fields,
          reason: failure.message,
          attempt: job.attempts,
          retryAt: retryAt?.toISOString() ?? null,
        });
        return retryAt ? "retrying" : "failed";
      }
    }
    // The job stopped being this worker's: a rewind made it stale, shutdown handed it back, or another worker
    // took it over.
    const row = await deps.jobs.get(job.id);
    const stale = row?.status === "stale";
    log.info(stale ? "writer job stale" : "writer job lost", { ...fields, status: row?.status });
    return stale ? "stale" : "lost";
  } finally {
    clearInterval(beat);
  }
}

/** A step, unless the job runs out of time or loses its lease first. */
async function within<T>(
  work: Promise<T>,
  deadline: number,
  limitMs: number,
  lost: Promise<never>,
): Promise<T> {
  let timer: NodeJS.Timeout | undefined;
  const late = new Promise<never>((_, reject) => {
    timer = setTimeout(
      () => reject(new StepFailure(`it ran past its ${span(limitMs)} limit`)),
      Math.max(0, deadline - Date.now()),
    );
  });
  try {
    return await Promise.race([work, late, lost]);
  } finally {
    clearTimeout(timer);
  }
}

function span(ms: number): string {
  return ms >= 60_000 ? `${Math.round(ms / 60_000)}-minute` : `${Math.max(1, Math.round(ms / 1000))}-second`;
}
