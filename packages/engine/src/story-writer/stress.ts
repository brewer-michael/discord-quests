/**
 * `pnpm writer:stress`: the story writer under load. Twenty campaigns play on a test database while two
 * workers write their chapters with a slow scripted AI (0.2 to 2 seconds a call). One worker is killed in the
 * middle of a job, then another; each is replaced. Turns go on throughout, with a couple of rewinds.
 *
 * Checks that every job finishes exactly once, that no step a worker saved is ever run again, that a campaign
 * never has two jobs running, and that turns take no longer while the writer is busy. Writes
 * reports/story-writer-stress.md. Needs TEST_DATABASE_URL.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import type { CallScope, LlmGateway, StructuredCall, StructuredOutcome } from "@dq/core/llm";
import { createRng } from "@dq/core/rng";
import { chapterSummaries, storyJobs, storyPlans } from "@dq/db";
import { createTestDb, TEST_DATABASE_URL } from "@dq/db/testing";
import { sql } from "drizzle-orm";
import { type Logger, seededDice } from "../deps";
import { createEngine, type Engine } from "../index";
import { FakeLlm } from "../testing";
import { WorldCache } from "../world-cache";
import { StoryWriter } from "./index";
import { StoryJobs } from "./jobs";

const CAMPAIGNS = 20;
const TURNS_BEFORE = 4;
const TURNS_DURING = 26;
const LEASE_MS = 4_000;
const KILLS_AT_MS = [15_000, 45_000];

if (!TEST_DATABASE_URL) {
  console.error("Set TEST_DATABASE_URL to a Postgres server where the user may create databases.");
  process.exit(1);
}

const rng = createRng("story-writer-stress");
const hang = <T>() => new Promise<T>(() => {});
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const pct = (xs: number[], p: number) => {
  const s = [...xs].sort((a, b) => a - b);
  return s.length ? (s[Math.min(s.length - 1, Math.floor((p / 100) * s.length))] as number) : 0;
};

/** Which step of which job an AI call belongs to, from the prompt the writer sends. */
function stepOf(call: StructuredCall<unknown>, scope: CallScope): string {
  const user = call.user.map((b) => b.text).join("\n");
  const chapter = user.match(/## Chapter (\d+)'s scenes/)?.[1] ?? user.match(/^Chapter (\d+):/)?.[1] ?? "?";
  return `${scope.campaignId}:${call.schemaName}:${chapter}`;
}

const fake = new FakeLlm();
const completed = new Map<string, number>();
let aiCalls = 0;

/** The scripted AI, slow for the writer's jobs and quick for turns. */
const slow: LlmGateway = {
  async structured<T>(call: StructuredCall<T>, scope: CallScope): Promise<StructuredOutcome<T>> {
    if (call.task === "writer" || call.task === "summarizer") {
      aiCalls++;
      await sleep(rng.int(200, 2000));
    }
    return fake.structured(call, scope);
  },
};

/** A worker that can be killed: from then on its AI calls and its queue writes never come back. */
function killable(db: Engine["deps"]["db"], name: string, counts: Map<string, number>, log: Logger) {
  const state = { dead: false };
  const llm: LlmGateway = {
    async structured<T>(call: StructuredCall<T>, scope: CallScope) {
      if (state.dead) return hang<StructuredOutcome<T>>();
      const res = await slow.structured(call, scope);
      if (state.dead) return hang<StructuredOutcome<T>>();
      if (res.ok) completed.set(stepOf(call, scope), (completed.get(stepOf(call, scope)) ?? 0) + 1);
      return res;
    },
  };
  const real = new StoryJobs(db, undefined, { leaseMs: LEASE_MS });
  const jobs = new Proxy(real, {
    get(target, prop, receiver) {
      const value = Reflect.get(target, prop, receiver);
      if (typeof value !== "function") return value;
      return async (...args: unknown[]) => {
        // A dead worker never holds a lock: inside the publishing transaction it simply finds the job gone.
        if (state.dead && prop === "lockMine") return false;
        if (state.dead && prop !== "finish" && prop !== "markStale") return hang();
        const out = await value.apply(target, args);
        if (prop === "checkpoint" && out === true) {
          const [job, step] = args as [{ id: string }, { name: string }];
          const key = `${job.id}:${step.name}`;
          counts.set(key, (counts.get(key) ?? 0) + 1);
        }
        return out;
      };
    },
  }) as StoryJobs;
  const writer = new StoryWriter({
    db,
    llm,
    worlds,
    jobs,
    log,
    worker: name,
    pollMs: 100,
    heartbeatMs: 1_000,
  });
  return { writer, kill: () => (state.dead = true), name };
}

const worlds = new WorldCache();

async function makeHero(engine: Engine, campaignId: string, userId: string, name: string) {
  await engine.characters.startDraft(campaignId, userId);
  for (const op of [
    { op: "class", classId: "shieldheart" },
    { op: "path", pathId: "long-road" },
    { op: "background", backgroundId: "farmhand" },
    { op: "species", speciesId: "pipkin" },
    { op: "recommended" },
    { op: "keepsake", keepsakeId: "carved-wooden-bird" },
    { op: "name", name, look: "Freckles and a big grin." },
  ])
    await engine.characters.updateDraft(campaignId, userId, op as never);
  await engine.characters.finalize(campaignId, userId);
}

async function main() {
  const started = Date.now();
  const db = await createTestDb();
  const logCounts = new Map<string, number>();
  const log: Logger = {
    info: (msg) => logCounts.set(msg, (logCounts.get(msg) ?? 0) + 1),
    warn: (msg) => logCounts.set(msg, (logCounts.get(msg) ?? 0) + 1),
    error: (msg) => logCounts.set(msg, (logCounts.get(msg) ?? 0) + 1),
  };
  const engine = createEngine({ db: db.db, worlds, llm: slow, dice: seededDice });
  const saved = new Map<string, number>();
  const problems: string[] = [];

  const campaigns: string[] = [];
  for (let i = 0; i < CAMPAIGNS; i++) {
    const c = await engine.campaigns.create({
      guildId: `g-stress-${i}`,
      channelId: `ch-stress-${i}`,
      name: `Stress ${i}`,
      mode: "ai_dm",
      createdBy: "host",
    });
    await makeHero(engine, c.id, "host", `Hero ${i}`);
    await engine.turns.openCampaign(c.id, "host");
    campaigns.push(c.id);
  }

  const turnMs: { before: number[]; during: number[] } = { before: [], during: [] };
  const play = async (id: string, turns: number, into: number[], rewindAt?: number) => {
    for (let t = 0; t < turns; t++) {
      const round = await engine.turns.currentRound(id);
      if (!round) return;
      await engine.turns.submitAction({ roundId: round.id, userId: "host", kind: "choice", choiceIndex: 0 });
      const t0 = performance.now();
      const res = await engine.turns.resolveRound(round.id);
      into.push(performance.now() - t0);
      if (res?.kind !== "turn")
        problems.push(`campaign ${id}: a turn didn't resolve (${res?.kind ?? "null"})`);
      if (res?.kind === "turn" && res.view.campaignEnded) return;
      if (rewindAt === t) {
        const c = await engine.campaigns.require(id);
        await engine.turns.rewind(id, "host", c.turnSeq - 2, "stress test");
      }
    }
  };

  // Turns with no writer running, for comparison.
  await Promise.all(campaigns.map((id) => play(id, TURNS_BEFORE, turnMs.before)));

  // Two workers, each killed once in the middle of a job and replaced.
  const workers = [killable(db.db, "w1", saved, log), killable(db.db, "w2", saved, log)];
  for (const w of workers) w.writer.start();
  const kills: Array<{ at: number; worker: string; job: string | null }> = [];
  const t0 = Date.now();
  const killer = (async () => {
    for (const [i, at] of KILLS_AT_MS.entries()) {
      while (Date.now() - t0 < at || !workers[i]?.writer.job) await sleep(50);
      const victim = workers[i] as (typeof workers)[number];
      kills.push({ at: Date.now() - t0, worker: victim.name, job: victim.writer.job?.kind ?? null });
      victim.kill();
      const replacement = killable(db.db, `${victim.name}-again`, saved, log);
      replacement.writer.start();
      workers.push(replacement);
    }
  })();

  // Two running jobs for one campaign must never be seen.
  let doubleRunning = 0;
  let peakRunning = 0;
  let peakQueued = 0;
  const watcher = setInterval(async () => {
    const rows = await db.db
      .select({ status: storyJobs.status, campaignId: storyJobs.campaignId })
      .from(storyJobs)
      .where(sql`${storyJobs.status} in ('queued', 'running')`);
    const running = rows.filter((r) => r.status === "running");
    peakRunning = Math.max(peakRunning, running.length);
    peakQueued = Math.max(peakQueued, rows.length - running.length);
    if (new Set(running.map((r) => r.campaignId)).size !== running.length) doubleRunning++;
  }, 250);

  await Promise.all(
    campaigns.map((id, i) => play(id, TURNS_DURING, turnMs.during, i < 2 ? 10 + i * 3 : undefined)),
  );
  await killer;
  const rewound = new Set(campaigns.slice(0, 2));

  // Let the writers finish everything that's left.
  const deadline = Date.now() + 10 * 60_000;
  for (;;) {
    const [{ open } = { open: 0 }] = await db.db
      .select({ open: sql<number>`count(*)::int` })
      .from(storyJobs)
      .where(sql`${storyJobs.status} in ('queued', 'running')`);
    if (open === 0) break;
    if (Date.now() > deadline) {
      problems.push(`${open} jobs still open after 10 minutes`);
      break;
    }
    await sleep(500);
  }
  clearInterval(watcher);
  const elapsed = Date.now() - started;
  // The killed workers never come back; the others stop cleanly.
  const killed = new Set(kills.map((k) => k.worker));
  await Promise.all(workers.filter((w) => !killed.has(w.name)).map((w) => w.writer.stop(5_000)));

  // ---- what happened
  const jobs = await db.db.select().from(storyJobs);
  const byStatus = (s: string) => jobs.filter((j) => j.status === s).length;
  const plans = await db.db.select().from(storyPlans);
  const recaps = await db.db.select().from(chapterSummaries);
  const plansPer = new Map<string, number>();
  for (const p of plans) {
    const key = `${p.campaignId}:${(p.plan as { chapter: number }).chapter}`;
    plansPer.set(key, (plansPer.get(key) ?? 0) + 1);
  }
  const duplicatePlans = [...plansPer.values()].filter((n) => n > 1).length;
  const doneRecaps = jobs.filter((j) => j.kind === "chapter_recap" && j.status === "done").length;
  const savedTwice = [...saved.entries()].filter(([, n]) => n > 1);
  // A rewind sets a job aside and the chapter is asked for again, so the rewound campaigns don't count here.
  const repeatedCalls = [...completed.entries()].filter(
    ([key, n]) => n > 1 && !rewound.has(key.split(":")[0] as string),
  );
  const resumed = jobs.filter((j) => j.attempts > 1 && j.status === "done");
  const durations = jobs
    .filter((j) => j.status === "done" && j.startedAt && j.finishedAt)
    .map((j) => +(j.finishedAt as Date) - +(j.startedAt as Date));
  const waits = jobs.filter((j) => j.startedAt).map((j) => +(j.startedAt as Date) - +j.createdAt);
  const done = byStatus("done");

  if (byStatus("queued") + byStatus("running") > 0) problems.push("jobs left open");
  if (byStatus("failed") > 0) problems.push(`${byStatus("failed")} jobs failed`);
  if (savedTwice.length > 0) problems.push(`${savedTwice.length} steps were saved twice`);
  if (repeatedCalls.length > kills.length)
    problems.push(
      `${repeatedCalls.length} AI steps were asked again (only ${kills.length} were under way at a kill)`,
    );
  if (duplicatePlans > 0) problems.push(`${duplicatePlans} chapters were published twice`);
  if (recaps.length !== doneRecaps)
    problems.push(`${recaps.length} recaps saved for ${doneRecaps} finished recap jobs`);
  if (doubleRunning > 0) problems.push(`two jobs ran at once for one campaign ${doubleRunning} times`);
  if (resumed.length < kills.length)
    problems.push(`only ${resumed.length} jobs were taken over after ${kills.length} kills`);
  const slower = pct(turnMs.during, 50) > Math.max(2 * pct(turnMs.before, 50), pct(turnMs.before, 50) + 50);
  if (slower) problems.push("turns were noticeably slower while the writer was busy");

  const ms = (n: number) => `${Math.round(n)} ms`;
  const s = (n: number) => `${(n / 1000).toFixed(1)} s`;
  const report = `# Story writer stress test

Run with \`pnpm writer:stress\` on ${new Date().toISOString().slice(0, 10)}. ${problems.length === 0 ? "**Passed.**" : `**Failed:** ${problems.join("; ")}.`}

## Setup

- ${CAMPAIGNS} campaigns on a fresh test database, one hero each, played turn by turn ${TURNS_BEFORE} turns with no writer running, then up to ${TURNS_DURING} more with it running. Two campaigns rewound two turns partway.
- Two writer workers in one process, with a scripted AI that takes 0.2 to 2 seconds for each writer call (turns use the quick scripted AI).
- Leases of ${LEASE_MS / 1000} s renewed every second, so a takeover comes quickly (the service uses 2-minute leases renewed every 30 seconds).
- At ${kills.map((k) => s(k.at)).join(" and ")} a worker was killed in the middle of a job (${kills.map((k) => `${k.worker}, ${k.job ?? "?"}`).join("; ")}): from then on its AI calls and queue writes never returned, like a process that died. Each was replaced by a new worker.

## Results

| | |
|---|---|
| Jobs | ${jobs.length}: ${done} done, ${byStatus("stale")} set aside by rewinds, ${byStatus("failed")} failed, ${byStatus("queued") + byStatus("running")} left open |
| By kind | ${jobs.filter((j) => j.kind === "chapter_plan").length} chapter plans, ${jobs.filter((j) => j.kind === "chapter_recap").length} recaps |
| Taken over after a kill and finished | ${resumed.length} |
| Published | ${plans.length} chapter plans (${duplicatePlans} chapters twice), ${recaps.length} recaps |
| Steps saved twice | ${savedTwice.length} |
| AI steps asked again | ${repeatedCalls.length} (the steps under way when a worker was killed; nothing saved was asked again) |
| Two jobs running for one campaign | ${doubleRunning === 0 ? "never" : `${doubleRunning} times`} |
| Busiest moment | ${peakRunning} jobs running, ${peakQueued} waiting |
| AI calls by the writer | ${aiCalls} |
| Job time (claimed to done) | median ${s(pct(durations, 50))}, 95th percentile ${s(pct(durations, 95))} |
| Wait in the queue | median ${s(pct(waits, 50))}, 95th percentile ${s(pct(waits, 95))} |
| Whole run | ${s(elapsed)} |

## Turns while the writer works

| | Turns | Median | 95th percentile |
|---|---|---|---|
| No writer running | ${turnMs.before.length} | ${ms(pct(turnMs.before, 50))} | ${ms(pct(turnMs.before, 95))} |
| Writer busy | ${turnMs.during.length} | ${ms(pct(turnMs.during, 50))} | ${ms(pct(turnMs.during, 95))} |

Turns queue the writer's jobs inside their own transaction and never wait for them.

## Log lines

${[...logCounts.entries()]
  .sort()
  .map(([msg, n]) => `- \`${msg}\`: ${n}`)
  .join("\n")}
`;
  const reports = new URL("../../../../reports/", import.meta.url);
  mkdirSync(reports, { recursive: true });
  writeFileSync(new URL("story-writer-stress.md", reports), report);
  console.log(report);
  await db.drop();
  process.exit(problems.length === 0 ? 0 : 1);
}

await main();
