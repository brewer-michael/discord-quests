import type { LlmGateway } from "@dq/core/llm";
import { chapterSummaries, storyJobs } from "@dq/db";
import { createTestDb, TEST_DATABASE_URL } from "@dq/db/testing";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createEngine, type Engine } from "../index";
import { FAKE_ANSWERS, FakeLlm } from "../testing";
import { WorldCache } from "../world-cache";
import { StoryWriter, type StoryWriterOptions } from "./index";
import { MAX_TRIES, nextBudgetDay, StoryJobs } from "./jobs";
import { checkMaterial, materialFor, mergeMaterial, publishMaterial, type WriterFacts } from "./material";

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

  /** An AI that never answers until its request is stopped, and remembers each request. */
  function hanging() {
    const calls: Array<{ signal?: AbortSignal; timeoutMs?: number }> = [];
    const llm: LlmGateway = {
      structured: (call) => {
        calls.push({
          ...(call.signal ? { signal: call.signal } : {}),
          ...(call.timeoutMs ? { timeoutMs: call.timeoutMs } : {}),
        });
        return new Promise((resolve) =>
          call.signal?.addEventListener(
            "abort",
            () => resolve({ ok: false, stop: "error", error: "stopped before an answer came" }),
            { once: true },
          ),
        );
      },
    };
    return { llm, calls };
  }

  const plan = (campaignId: string, key: number, seq = 0) => ({
    campaignId,
    kind: "chapter" as const,
    key,
    reason: "test",
    seq,
  });
  /** The whole-story job every campaign gets when it's created. */
  const storyJob = async (jobs: StoryJobs, campaignId: string) =>
    (await jobs.recent(campaignId)).find((j) => j.kind === "bible");

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

  it("writes the whole story when a campaign is created: outline, bible, spine, chapter 1, side quests, self-check", async () => {
    const llm = new FakeLlm();
    const { jobs, engine, writer } = setup(llm);
    const c = await campaign(engine);
    const queued = await storyJob(jobs, c.id);
    expect(queued).toEqual(expect.objectContaining({ key: "story", status: "queued", enqueuedSeq: 0 }));
    const [ran] = await writer(c.id).drain();
    expect(ran?.outcome).toBe("done");
    const job = await jobs.get(queued?.id as string);
    expect(job?.steps.map((s) => s.name)).toEqual([
      "outline",
      "bible",
      "spine",
      "chapter",
      "side_quests",
      "self_check",
    ]);
    // Each step is one AI call.
    expect(llm.calls.filter((x) => x.task === "writer")).toHaveLength(6);
    expect(job?.notice?.text).toBe("✅ The story is ready: its outline, bible, spine and first chapter.");
    const m = await materialFor(db.db, c.id, c.story);
    expect(m?.ready).toBe(true);
    expect(m?.outline?.pitch).toBeTruthy();
    expect(m?.bible?.cast.length).toBeGreaterThan(0);
    expect(m?.spine?.endings).toHaveLength(3);
    const beats = (m?.chapters["1"]?.scenes ?? []).map((sc) => sc.beatId).filter(Boolean);
    expect(beats).toContain("ch1-the-thief-in-the-lamp-house");
    expect(m?.sideQuests.length).toBeGreaterThan(0);
  });

  it("resumes after the last finished step without asking the AI again", async () => {
    let spines = 0;
    const llm = new FakeLlm({
      writer: (call, scope) =>
        call.schemaName === "spine" && spines++ === 0
          ? new Error("connection reset")
          : FAKE_ANSWERS.writer?.(call, scope),
    });
    const { jobs, engine, writer } = setup(llm);
    const c = await campaign(engine);
    const [first] = await writer(c.id).drain();
    expect(first?.outcome).toBe("retrying");
    const saved = await jobs.get(first?.job.id as string);
    expect(saved?.steps.map((s) => s.name)).toEqual(["outline", "bible"]);
    expect(saved?.error).toContain("the AI service failed (connection reset)");
    expect(saved?.notice?.text).toMatch(/couldn't write the story: .*Trying again in a minute\./);

    await db.db
      .update(storyJobs)
      .set({ runAfter: new Date() })
      .where(eq(storyJobs.id, saved?.id as string));
    const [second] = await writer(c.id).drain();
    expect(second?.outcome).toBe("done");
    const asked = (name: string) =>
      llm.calls.filter((x) => x.task === "writer" && x.user.includes(name)).length;
    // The outline and the bible weren't asked for again; the spine was asked twice (the failed try, then this one).
    expect(llm.calls.filter((x) => x.task === "writer")).toHaveLength(7);
    expect(asked("Write the outline")).toBe(1);
    expect(asked("Write the story bible")).toBe(1);
    expect(asked("Write the plot spine")).toBe(2);
  });

  it("sends back material that breaks the checks, and the next try is told what failed", async () => {
    let checks = 0;
    const llm = new FakeLlm({
      writer: async (call, scope) => {
        const answer = (await FAKE_ANSWERS.writer?.(call, scope)) as Record<string, unknown>;
        if (call.schemaName !== "self_check" || checks++ > 0) return answer;
        // The first self-check lets through a scene somewhere that doesn't exist, with someone nobody cast.
        const chapter = answer.chapter as { scenes: Array<{ place: string; people: string[] }> };
        chapter.scenes[0] = {
          ...(chapter.scenes[0] as object),
          place: "the-moon",
          people: ["nobody-at-all"],
        } as never;
        return answer;
      },
    });
    const { jobs, engine, writer } = setup(llm);
    const c = await campaign(engine);
    const [first] = await writer(c.id).drain();
    expect(first?.outcome).toBe("retrying");
    const job = await jobs.get(first?.job.id as string);
    expect(job?.error).toContain('"the-moon", which isn\'t a place in this world');
    expect(job?.error).toContain('"nobody-at-all", who isn\'t in the cast');
    expect(await materialFor(db.db, c.id, c.story)).toBeNull();
    await db.db
      .update(storyJobs)
      .set({ runAfter: new Date() })
      .where(eq(storyJobs.id, job?.id as string));
    const [second] = await writer(c.id).drain();
    expect(second?.outcome).toBe("done");
    const retried = llm.calls.filter((x) => x.task === "writer").at(-1);
    expect(retried?.user).toContain("Last time, the checks found: its material didn't pass the checks");
  });

  it("checks material against what has happened: people who are gone, beats already played, the content rules", () => {
    const index = worlds.get("lanternreach").index;
    const facts: WriterFacts = {
      chapter: 1,
      completedBeats: ["ch1-the-last-flame"],
      place: "hearthmoor-square",
      premise: "",
      heroes: [],
      story: [],
      thisChapter: [],
      people: [],
      promises: [],
      quests: [],
      away: ["snibbet"],
      material: null,
    };
    const scene = {
      beatId: "ch1-the-last-flame",
      place: "lamp-house",
      situation: "Snibbet is back, hiding in the larder.",
      question: "Will they catch him?",
      people: ["snibbet"],
      clues: [{ text: "A sooty footprint.", alsoAt: [] }],
      encounter: ["not-a-creature"],
      temptation: null,
    };
    const problems = checkMaterial(index, facts, { chapter: { chapter: 1, scenes: [scene] } }, "classic");
    expect(problems).toEqual(
      expect.arrayContaining([
        expect.stringContaining("prepares ch1-the-last-flame, which the heroes have already played"),
        expect.stringContaining("has snibbet, who is gone from the story right now"),
        expect.stringContaining("a clue found in only one place"),
        expect.stringContaining('"not-a-creature", which isn\'t a creature'),
      ]),
    );
    const leaky = {
      ...scene,
      beatId: null,
      people: [],
      clues: [],
      encounter: null,
      situation: "Their luck score is high.",
    };
    expect(
      checkMaterial(index, facts, { chapter: { chapter: 1, scenes: [leaky] } }, "classic").join(" "),
    ).toContain("breaks the content rules");
    expect(
      checkMaterial(
        index,
        { ...facts, chapter: 2 },
        { chapter: { chapter: 1, scenes: [leaky] } },
        "classic",
      ).join(" "),
    ).toContain("Chapter 1 is already finished");
  });

  it("waits 1, 4, then 16 minutes between tries, then gives up and tells the DM room, until asked again", async () => {
    const clock = { now: new Date("2026-03-01T12:00:00Z") };
    const llm = new FakeLlm({ writer: () => new Error("overloaded") });
    const { jobs, engine, writer } = setup(llm, clock);
    const c = await campaign(engine);
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
          text: "⚠️ The story writer couldn't write the story: the AI service failed (overloaded). Gave up after 4 tries.",
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
    const slow = hanging();
    const timed = setup(slow.llm);
    const c = await campaign(timed.engine);
    const [late] = await timed.writer(c.id, { deadlineMs: 200 }).drain();
    expect(late?.outcome).toBe("retrying");
    expect((await timed.jobs.get(late?.job.id as string))?.error).toBe("it ran past its 1-second limit");
    // The AI request under way was stopped too, rather than left running (and paid for). Each call has the usual
    // three-minute cap.
    expect(slow.calls).toHaveLength(1);
    expect(slow.calls[0]?.signal?.aborted).toBe(true);
    expect(slow.calls[0]?.timeoutMs).toBeUndefined();

    const greedy = setup();
    const d = await campaign(greedy.engine);
    const [over] = await greedy.writer(d.id, { jobTokens: 50 }).drain();
    expect(over?.outcome).toBe("failed");
    const job = await greedy.jobs.get(over?.job.id as string);
    expect(job?.error).toBe("it used up its allowance of 50 tokens");
    expect(job?.steps.map((s) => s.name)).toEqual(["outline"]);
    expect(job?.tokensUsed).toBeGreaterThanOrEqual(50);
  });

  it("waits for tomorrow when the day's spending limit stops a job, without counting the try", async () => {
    const clock = { now: new Date("2026-03-01T15:00:00Z") };
    const broke: LlmGateway = { structured: async () => ({ ok: false, stop: "budget" }) };
    const { jobs, engine, writer } = setup(broke, clock);
    const c = await campaign(engine);
    const [ran] = await writer(c.id).drain();
    expect(ran?.outcome).toBe("retrying");
    const job = await jobs.get(ran?.job.id as string);
    expect(job?.attempts).toBe(0);
    expect(job?.runAfter.toISOString()).toBe(nextBudgetDay(clock.now).toISOString());
    expect(job?.runAfter.toISOString()).toBe("2026-03-02T00:05:00.000Z");
    expect(job?.notice?.text).toContain("today's spending limit was reached. Trying again tomorrow.");
  });

  it("counts a failed try's tokens toward the job's allowance", async () => {
    const costly: LlmGateway = {
      structured: async () => ({
        ok: false,
        stop: "invalid",
        error: "not the shape asked for",
        usage: { inputTokens: 100, outputTokens: 50 },
      }),
    };
    const { jobs, engine, writer } = setup(costly);
    const c = await campaign(engine);
    const used: number[] = [];
    let outcome: string | undefined;
    for (let i = 0; i < 3; i++) {
      const [ran] = await writer(c.id, { jobTokens: 200 }).drain();
      outcome = ran?.outcome;
      const job = await jobs.get(ran?.job.id as string);
      used.push(job?.tokensUsed ?? 0);
      await db.db.update(storyJobs).set({ runAfter: new Date() }).where(eq(storyJobs.campaignId, c.id));
    }
    expect(used).toEqual([150, 300, 300]);
    expect(outcome).toBe("failed");
    expect((await jobs.recent(c.id))[0]?.error).toBe("it used up its allowance of 200 tokens");
  });

  it("hands back a job it claims while being told to stop", async () => {
    const { jobs, engine } = setup();
    const c = await campaign(engine);
    let open: () => void = () => {};
    const gate = new Promise<void>((resolve) => {
      open = resolve;
    });
    // Claiming takes a moment, and the stop comes in the middle of it.
    const slowClaims = new Proxy(jobs, {
      get(target, prop, receiver) {
        const value = Reflect.get(target, prop, receiver);
        if (typeof value !== "function") return value;
        return prop === "claim"
          ? async (...args: unknown[]) => {
              await gate;
              return value.apply(target, args);
            }
          : value.bind(target);
      },
    });
    const w = new StoryWriter({ db: db.db, llm: new FakeLlm(), worlds, jobs: slowClaims, campaignId: c.id });
    const running = w.runOnce();
    const stopping = w.stop(1_000);
    open();
    expect(await running).toBeNull();
    await stopping;
    const [job] = await jobs.recent(c.id);
    expect(job?.status).toBe("queued");
    expect(job?.attempts).toBe(0);
    expect(job?.steps).toEqual([]);
  });

  it("hands a job back on shutdown, keeping its finished steps", async () => {
    const slow = hanging();
    const fake = new FakeLlm();
    // The outline comes back; the bible never does until the request is stopped.
    const llm: LlmGateway = {
      structured: (call, scope) =>
        call.schemaName === "outline" ? fake.structured(call, scope) : slow.llm.structured(call, scope),
    };
    const { jobs, engine, writer } = setup(llm);
    const c = await campaign(engine);
    const w = writer(c.id);
    const running = w.runOnce();
    for (let i = 0; i < 50 && !(await jobs.recent(c.id))[0]?.steps.length; i++)
      await new Promise((r) => setTimeout(r, 20));
    await w.stop(100);
    const [job] = await jobs.recent(c.id);
    expect(job?.status).toBe("queued");
    expect(job?.attempts).toBe(0);
    expect(job?.steps.map((s) => s.name)).toEqual(["outline"]);
    expect(await running).toEqual(expect.objectContaining({ outcome: "lost" }));
    // Its AI request was stopped with it.
    expect(slow.calls[0]?.signal?.aborted).toBe(true);
  });

  it("gives up on the recap of a chapter that has no scenes", async () => {
    const { jobs, engine, writer } = setup();
    const c = await campaign(engine);
    await db.db.delete(storyJobs).where(eq(storyJobs.campaignId, c.id));
    await jobs.enqueue({ campaignId: c.id, kind: "recap", key: 1, reason: "test", seq: 0 });
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
    // The campaign asked for the whole story when it was created; these were asked for in turns about to be undone.
    await jobs.enqueue(plan(c.id, 4, now));
    await publishMaterial(db.db, c.id, mergeMaterial(null, { sideQuests: [] }, now), "test");
    expect(await materialFor(db.db, c.id, (await engine.campaigns.require(c.id)).story)).not.toBeNull();

    await engine.turns.rewind(c.id, "host", kept);
    const after = await jobs.recent(c.id);
    expect(after.find((j) => j.key === "4")?.status).toBe("stale");
    expect(after.find((j) => j.key === "story")?.status).not.toBe("stale");
    expect(await materialFor(db.db, c.id, (await engine.campaigns.require(c.id)).story)).toBeNull();
    // Asked for again, it can be written again.
    expect(await jobs.enqueue(plan(c.id, 4, kept + 4))).toBe(true);
  });
});
