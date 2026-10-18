import type { LlmGateway } from "@dq/core/llm";
import { chapterSummaries, storyJobs, storyPlans } from "@dq/db";
import { createTestDb, TEST_DATABASE_URL } from "@dq/db/testing";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createEngine, type Engine } from "../index";
import { planFor } from "../planner";
import { FAKE_ANSWERS, FakeLlm } from "../testing";
import { WorldCache } from "../world-cache";
import { StoryWriter, type StoryWriterOptions } from "./index";
import { MAX_TRIES, nextBudgetDay, StoryJobs } from "./jobs";

const worlds = new WorldCache();

describe.skipIf(!TEST_DATABASE_URL)("story writer", () => {
  let db: Awaited<ReturnType<typeof createTestDb>>;
  beforeAll(async () => {
    db = await createTestDb();
  }, 30_000);
  afterAll(async () => {
    await db?.drop();
  });

  let n = 0;
  async function campaign(engine: Engine) {
    n += 1;
    return engine.campaigns.create({
      guildId: `g-writer-${n}`,
      channelId: `ch-writer-${n}`,
      name: `Writer ${n}`,
      mode: "ai_dm",
      createdBy: "host",
    });
  }

  function setup(llm: LlmGateway = new FakeLlm(), clock?: { now: Date }) {
    const now = clock ? () => clock.now : undefined;
    const jobs = new StoryJobs(db.db, now);
    const engine = createEngine({ db: db.db, worlds, llm, ...(now ? { now } : {}) });
    const writer = (campaignId: string, opts: Partial<StoryWriterOptions> = {}) =>
      new StoryWriter({ db: db.db, llm, worlds, jobs, campaignId, ...(now ? { now } : {}), ...opts });
    return { jobs, engine, writer };
  }

  const plan = (campaignId: string, key: number, seq = 0) => ({
    campaignId,
    kind: "chapter_plan" as const,
    key,
    reason: "test",
    seq,
  });

  it("queues the same job once, until it fails or a rewind undoes it", async () => {
    const { jobs, engine } = setup();
    const c = await campaign(engine);
    expect(await jobs.enqueue(plan(c.id, 2))).toBe(true);
    expect(await jobs.enqueue(plan(c.id, 2))).toBe(false);
    expect(await jobs.enqueue(plan(c.id, 3))).toBe(true);
    // Done counts too: a chapter written ahead isn't written again when the chapter arrives.
    await db.db.update(storyJobs).set({ status: "done" }).where(eq(storyJobs.key, "2"));
    expect(await jobs.enqueue(plan(c.id, 2))).toBe(false);
    for (const status of ["failed", "stale"] as const) {
      await db.db.update(storyJobs).set({ status }).where(eq(storyJobs.key, "2"));
      expect(await jobs.enqueue(plan(c.id, 2))).toBe(true);
      await db.db.delete(storyJobs).where(eq(storyJobs.status, "queued"));
    }
  });

  it("never runs two jobs for one campaign at once, even when workers race", async () => {
    const { jobs, engine } = setup();
    const c = await campaign(engine);
    const other = await campaign(engine);
    for (const key of [1, 2, 3]) await jobs.enqueue(plan(c.id, key));
    await jobs.enqueue(plan(other.id, 1));
    const claimed = await Promise.all(Array.from({ length: 6 }, (_, i) => jobs.claim(`w${i}`)));
    const got = claimed.filter((j) => j !== null);
    expect(got.filter((j) => j.campaignId === c.id)).toHaveLength(1);
    expect(got.filter((j) => j.campaignId === other.id)).toHaveLength(1);
    expect(await jobs.claim("late", c.id)).toBeNull();
  });

  it("takes over a job whose worker stopped answering, and the old worker can't save over it", async () => {
    const { jobs, engine } = setup();
    const c = await campaign(engine);
    await jobs.enqueue(plan(c.id, 1));
    const first = await jobs.claim("w-crashed", c.id);
    if (!first) throw new Error("not claimed");
    expect(await jobs.claim("w-new", c.id)).toBeNull();
    await db.db
      .update(storyJobs)
      .set({ leaseUntil: new Date(Date.now() - 1000) })
      .where(eq(storyJobs.id, first.id));
    const taken = await jobs.claim("w-new", c.id);
    expect(taken?.id).toBe(first.id);
    expect(taken?.attempts).toBe(2);
    const step = { name: "facts", output: {}, tokens: 0, ms: 1, finishedAt: new Date().toISOString() };
    expect(await jobs.checkpoint(first, step)).toBe(false);
    expect(await jobs.heartbeat(first)).toBe(false);
    expect(await jobs.checkpoint(taken as NonNullable<typeof taken>, step)).toBe(true);
  });

  it("resumes after the last finished step without asking the AI again", async () => {
    let revisions = 0;
    const llm = new FakeLlm({
      writer: (call, scope) =>
        call.schemaName === "chapter_plan_revised" && revisions++ === 0
          ? new Error("connection reset")
          : FAKE_ANSWERS.writer?.(call, scope),
    });
    const { jobs, engine, writer } = setup(llm);
    const c = await campaign(engine);
    await jobs.enqueue(plan(c.id, 1));
    const [first] = await writer(c.id).drain();
    expect(first?.outcome).toBe("retrying");
    const saved = await jobs.get(first?.job.id as string);
    expect(saved?.steps.map((s) => s.name)).toEqual(["facts", "draft"]);
    expect(saved?.error).toContain("the AI service failed (connection reset)");
    expect(saved?.notice?.text).toMatch(/couldn't write chapter 1: .*Trying again in a minute\./);

    await db.db
      .update(storyJobs)
      .set({ runAfter: new Date() })
      .where(eq(storyJobs.id, saved?.id as string));
    const [second] = await writer(c.id).drain();
    expect(second?.outcome).toBe("done");
    const drafts = llm.calls.filter((x) => x.task === "writer" && !x.user.includes("## The planner's draft"));
    expect(drafts).toHaveLength(1);
    expect(llm.calls.filter((x) => x.user.includes("## The planner's draft"))).toHaveLength(2);
    const done = await jobs.get(saved?.id as string);
    expect(done?.status).toBe("done");
    expect(done?.notice?.text).toBe("✅ Chapter 1 is ready; it shapes the scenes from here.");
    const published = await planFor(db.db, c.id, 1, c.story);
    expect(published?.source).toBe("writer");
    expect(Object.keys(published?.beats ?? {}).length).toBeGreaterThan(0);
  });

  it("waits 1, 4, then 16 minutes between tries, then gives up and tells the DM room, until asked again", async () => {
    const clock = { now: new Date("2026-03-01T12:00:00Z") };
    const llm = new FakeLlm({ writer: () => new Error("overloaded") });
    const { jobs, engine, writer } = setup(llm, clock);
    const c = await campaign(engine);
    await jobs.enqueue(plan(c.id, 1));
    const waits: number[] = [];
    for (let i = 0; i < MAX_TRIES; i++) {
      const [ran] = await writer(c.id).drain();
      const job = await jobs.get(ran?.job.id as string);
      if (ran?.outcome === "retrying") {
        waits.push((+(job?.runAfter as Date) - +clock.now) / 60_000);
        // Not due yet.
        expect(await writer(c.id).drain()).toEqual([]);
        clock.now = job?.runAfter as Date;
      } else {
        expect(ran?.outcome).toBe("failed");
        expect(job?.notice).toEqual({
          kind: "gave_up",
          text: "⚠️ The story writer couldn't write chapter 1: the AI service failed (overloaded). Gave up after 4 tries.",
        });
      }
    }
    expect(waits).toEqual([1, 4, 16]);

    const [failed] = await jobs.recent(c.id);
    // The notice is posted once.
    expect((await jobs.pendingNotices()).some((j) => j.id === failed?.id)).toBe(true);
    await jobs.markNoticed(failed as NonNullable<typeof failed>);
    expect((await jobs.pendingNotices()).some((j) => j.id === failed?.id)).toBe(false);
    // Only the host, a DM or a guardian can ask for another go, and only once the adventure has started.
    await expect(engine.turns.retryStoryJob(failed?.id as string, "stranger")).rejects.toThrow();
    expect((await jobs.retry(failed?.id as string)).ok).toBe(true);
    expect((await jobs.retry(failed?.id as string)).ok).toBe(false);
    expect((await jobs.get(failed?.id as string))?.attempts).toBe(0);
  });

  it("stops a try that runs past its time limit or a job past its token allowance", async () => {
    const slow = new FakeLlm({
      writer: () => new Promise((resolve) => setTimeout(() => resolve(null), 2000)),
    });
    const timed = setup(slow);
    const c = await campaign(timed.engine);
    await timed.jobs.enqueue(plan(c.id, 1));
    const [late] = await timed.writer(c.id, { deadlineMs: 200 }).drain();
    expect(late?.outcome).toBe("retrying");
    expect((await timed.jobs.get(late?.job.id as string))?.error).toBe("it ran past its 1-second limit");

    const greedy = setup();
    const d = await campaign(greedy.engine);
    await greedy.jobs.enqueue(plan(d.id, 1));
    const [over] = await greedy.writer(d.id, { jobTokens: 50 }).drain();
    expect(over?.outcome).toBe("failed");
    const job = await greedy.jobs.get(over?.job.id as string);
    expect(job?.error).toBe("it used up its allowance of 50 tokens");
    expect(job?.steps.map((s) => s.name)).toEqual(["facts", "draft"]);
    expect(job?.tokensUsed).toBeGreaterThanOrEqual(50);
  });

  it("waits for tomorrow when the day's spending limit stops a job, without counting the try", async () => {
    const clock = { now: new Date("2026-03-01T15:00:00Z") };
    const broke: LlmGateway = { structured: async () => ({ ok: false, stop: "budget" }) };
    const { jobs, engine, writer } = setup(broke, clock);
    const c = await campaign(engine);
    await jobs.enqueue(plan(c.id, 1));
    const [ran] = await writer(c.id).drain();
    expect(ran?.outcome).toBe("retrying");
    const job = await jobs.get(ran?.job.id as string);
    expect(job?.attempts).toBe(0);
    expect(job?.runAfter.toISOString()).toBe(nextBudgetDay(clock.now).toISOString());
    expect(job?.runAfter.toISOString()).toBe("2026-03-02T00:05:00.000Z");
    expect(job?.notice?.text).toContain("today's spending limit was reached. Trying again tomorrow.");
  });

  it("hands a job back on shutdown, keeping its finished steps", async () => {
    const llm = new FakeLlm({
      writer: () => new Promise((resolve) => setTimeout(() => resolve(null), 1500)),
    });
    const { jobs, engine, writer } = setup(llm);
    const c = await campaign(engine);
    await jobs.enqueue(plan(c.id, 1));
    const w = writer(c.id);
    const running = w.runOnce();
    for (let i = 0; i < 50 && !(await jobs.recent(c.id))[0]?.steps.length; i++)
      await new Promise((r) => setTimeout(r, 20));
    await w.stop(100);
    const [job] = await jobs.recent(c.id);
    expect(job?.status).toBe("queued");
    expect(job?.attempts).toBe(0);
    expect(job?.steps.map((s) => s.name)).toEqual(["facts"]);
    expect(await running).toEqual(expect.objectContaining({ outcome: "lost" }));
  });

  it("gives up on the recap of a chapter that has no scenes", async () => {
    const { jobs, engine, writer } = setup();
    const c = await campaign(engine);
    await jobs.enqueue({ campaignId: c.id, kind: "chapter_recap", key: 1, reason: "test", seq: 0 });
    const [ran] = await writer(c.id).drain();
    // No scenes yet: nothing to recap, and retrying won't help.
    expect(ran?.outcome).toBe("failed");
    expect((await jobs.get(ran?.job.id as string))?.error).toBe("chapter 1 has no scenes");
    expect(await db.db.select().from(chapterSummaries).where(eq(chapterSummaries.campaignId, c.id))).toEqual(
      [],
    );
  });

  it("sets aside jobs and plans from turns a rewind undid", async () => {
    const llm = new FakeLlm();
    const { jobs, engine } = setup(llm);
    const c = await campaign(engine);
    await engine.characters.startDraft(c.id, "host");
    for (const [op, value] of [
      ["class", { classId: "shieldheart" }],
      ["path", { pathId: "long-road" }],
      ["background", { backgroundId: "farmhand" }],
      ["species", { speciesId: "pipkin" }],
      ["recommended", {}],
      ["keepsake", { keepsakeId: "carved-wooden-bird" }],
      ["name", { name: "Bram Stout", look: "Tall." }],
    ] as const)
      await engine.characters.updateDraft(c.id, "host", { op, ...value } as never);
    await engine.characters.finalize(c.id, "host");
    await engine.turns.openCampaign(c.id, "host");
    const step = async () => {
      const roundId = (await engine.turns.currentRound(c.id))?.id as string;
      await engine.turns.submitAction({ roundId, userId: "host", kind: "choice", choiceIndex: 0 });
      return engine.turns.resolveRound(roundId);
    };
    await step();
    const kept = (await engine.campaigns.require(c.id)).turnSeq;
    await step();
    await step();
    const now = (await engine.campaigns.require(c.id)).turnSeq;
    // The opening asked for chapter 1; these were asked for in turns about to be undone.
    await jobs.enqueue(plan(c.id, 4, now));
    await db.db.insert(storyPlans).values({
      campaignId: c.id,
      version: 99,
      plan: { chapter: 4, theme: "", beats: {}, source: "writer", seq: now },
      reason: "chapter 4",
      createdBy: "writer",
    });
    expect(await planFor(db.db, c.id, 4, (await engine.campaigns.require(c.id)).story)).not.toBeNull();

    await engine.turns.rewind(c.id, "host", kept);
    const after = await jobs.recent(c.id);
    expect(after.find((j) => j.key === "4")?.status).toBe("stale");
    expect(after.find((j) => j.key === "1")?.status).not.toBe("stale");
    expect(await planFor(db.db, c.id, 4, (await engine.campaigns.require(c.id)).story)).toBeNull();
    // Asked for again, it can be written again.
    expect(await jobs.enqueue(plan(c.id, 4, kept + 4))).toBe(true);
  });
});
