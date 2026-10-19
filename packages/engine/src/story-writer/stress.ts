/**
 * `pnpm writer:stress`: the story writer under load. Twenty campaigns play on a test database while two workers
 * write their stories (the whole story at creation, then chapters, side quests and recaps as play reaches them)
 * with a slow scripted AI (0.2 to 2 seconds a call). One worker is killed in the middle of a job, then another;
 * each is replaced. Turns go on throughout, with a couple of rewinds, and one more campaign's daily spending limit
 * has run out.
 *
 * Everything is measured from the pino log lines the engine and the workers write (`turn resolved`, `writer job
 * claimed`, `writer step done`, `writer job done`, `writer job failed`), checked against the queue and what was
 * published. Writes reports/story-writer-stress.md. Needs TEST_DATABASE_URL.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import type { CallScope, LlmGateway, StructuredCall, StructuredOutcome } from "@dq/core/llm";
import { createRng } from "@dq/core/rng";
import { chapterSummaries, storyJobs, storyPlans } from "@dq/db";
import { createTestDb, TEST_DATABASE_URL } from "@dq/db/testing";
import { sql } from "drizzle-orm";
import { seededDice } from "../deps";
import { createEngine, type Engine } from "../index";
import { createLogger } from "../logger";
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

/** The pino log lines everything is measured from, as JSON. */
const lines: string[] = [];
const log = createLogger({ service: "stress", format: "json", write: (line) => lines.push(line) });
type Line = Record<string, unknown> & { msg: string };
const parsed = (from = 0, to = lines.length): Line[] =>
  lines.slice(from, to).map((l) => JSON.parse(l) as Line);

/** The step of a job an AI call is for, by the shape it asks for. */
const STEP: Record<string, string> = {
  outline: "outline",
  bible: "bible",
  spine: "spine",
  chapter_detail: "chapter",
  side_quests: "side_quests",
  rework: "rework",
  self_check: "self_check",
  recap: "draft",
};

const fake = new FakeLlm();
let broke = "";

/** The scripted AI, slow for the writer's jobs and quick for turns; one campaign's spending limit has run out. */
const slow: LlmGateway = {
  async structured<T>(call: StructuredCall<T>, scope: CallScope): Promise<StructuredOutcome<T>> {
    if (call.task === "writer" || call.task === "summarizer") {
      if (scope.campaignId === broke) return { ok: false, stop: "budget" };
      await sleep(rng.int(200, 2000));
    }
    return fake.structured(call, scope);
  },
};

/** AI answers each job's steps got, by job and step: a step asked again shows up as more than one. */
const answered = new Map<string, number>();

/** A worker that can be killed: from then on its AI calls and its queue writes never come back. */
function killable(db: Engine["deps"]["db"], name: string) {
  const state = { dead: false };
  const ref: { writer?: StoryWriter } = {};
  const llm: LlmGateway = {
    async structured<T>(call: StructuredCall<T>, scope: CallScope) {
      if (state.dead) return hang<StructuredOutcome<T>>();
      const job = ref.writer?.job?.id;
      const res = await slow.structured(call, scope);
      if (state.dead) return hang<StructuredOutcome<T>>();
      // The reviewer's read of a recap belongs to the recap's draft step, with the chronicler's call.
      if (res.ok && job && call.task !== "judge") {
        const key = `${job}:${STEP[call.schemaName ?? ""] ?? call.schemaName}`;
        answered.set(key, (answered.get(key) ?? 0) + 1);
      }
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
        return value.apply(target, args);
      };
    },
  }) as StoryJobs;
  ref.writer = new StoryWriter({
    db,
    llm,
    worlds,
    jobs,
    log,
    worker: name,
    pollMs: 100,
    heartbeatMs: 1_000,
  });
  return { writer: ref.writer, kill: () => (state.dead = true), name };
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
  const engine = createEngine({ db: db.db, worlds, llm: slow, dice: seededDice, log });
  const problems: string[] = [];

  const campaigns: string[] = [];
  for (let i = 0; i <= CAMPAIGNS; i++) {
    const c = await engine.campaigns.create({
      guildId: `g-stress-${i}`,
      channelId: `ch-stress-${i}`,
      name: i === CAMPAIGNS ? "Out of budget" : `Stress ${i}`,
      mode: "ai_dm",
      createdBy: "host",
    });
    await makeHero(engine, c.id, "host", `Hero ${i}`);
    await engine.turns.openCampaign(c.id, "host");
    if (i === CAMPAIGNS) broke = c.id;
    else campaigns.push(c.id);
  }

  const play = async (id: string, turns: number, rewindAt?: number) => {
    for (let t = 0; t < turns; t++) {
      const round = await engine.turns.currentRound(id);
      if (!round) return;
      await engine.turns.submitAction({ roundId: round.id, userId: "host", kind: "choice", choiceIndex: 0 });
      const res = await engine.turns.resolveRound(round.id);
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
  await Promise.all(campaigns.map((id) => play(id, TURNS_BEFORE)));
  const writersFrom = lines.length;

  // Two workers, each killed once in the middle of a job and replaced.
  const workers = [killable(db.db, "w1"), killable(db.db, "w2")];
  for (const w of workers) w.writer.start();
  const kills: Array<{ at: number; worker: string; job: string | null; jobId: string | null }> = [];
  const t0 = Date.now();
  const killer = (async () => {
    for (const [i, at] of KILLS_AT_MS.entries()) {
      while (Date.now() - t0 < at || !workers[i]?.writer.job) await sleep(50);
      const victim = workers[i] as (typeof workers)[number];
      kills.push({
        at: Date.now() - t0,
        worker: victim.name,
        job: victim.writer.job?.kind ?? null,
        jobId: victim.writer.job?.id ?? null,
      });
      victim.kill();
      const replacement = killable(db.db, `${victim.name}-again`);
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

  await Promise.all(campaigns.map((id, i) => play(id, TURNS_DURING, i < 2 ? 10 + i * 3 : undefined)));
  const turnsTo = lines.length;
  await killer;
  const rewound = new Set(campaigns.slice(0, 2));

  // Let the writers finish everything that's due (the out-of-budget campaign's job waits for tomorrow).
  const deadline = Date.now() + 10 * 60_000;
  for (;;) {
    const [{ open } = { open: 0 }] = await db.db
      .select({ open: sql<number>`count(*)::int` })
      .from(storyJobs)
      .where(
        sql`(${storyJobs.status} = 'running' or (${storyJobs.status} = 'queued' and ${storyJobs.runAfter} <= now()))`,
      );
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

  // ---- what the logs say
  const all = parsed();
  const before = parsed(0, writersFrom).filter((l) => l.msg === "turn resolved");
  const during = parsed(writersFrom, turnsTo).filter((l) => l.msg === "turn resolved");
  const turnMs = {
    before: before.map((l) => Number(l.totalMs)),
    during: during.map((l) => Number(l.totalMs)),
  };
  const count = (msg: string) => all.filter((l) => l.msg === msg).length;
  const claimed = all.filter((l) => l.msg === "writer job claimed");
  const stepsDone = new Map<string, number>();
  for (const l of all.filter((l) => l.msg === "writer step done")) {
    const key = `${l.jobId}:${l.step}`;
    stepsDone.set(key, (stepsDone.get(key) ?? 0) + 1);
  }
  const savedTwice = [...stepsDone.values()].filter((n) => n > 1).length;
  const budgetStops = all.filter(
    (l) =>
      l.msg === "writer job failed" &&
      l.campaignId === broke &&
      l.reason === "today's spending limit was reached",
  );

  // ---- what the queue and the published material say
  const jobs = await db.db.select().from(storyJobs);
  const mine = jobs.filter((j) => j.campaignId !== broke);
  const byStatus = (s: string) => mine.filter((j) => j.status === s).length;
  // Each job a killed worker held was claimed again by another worker, which carried on from its last saved step.
  const takeovers = kills.map((k) => {
    const again = claimed.find((l) => l.jobId === k.jobId && Number(l.attempt) > 1);
    return { ...k, resumeAfter: (again?.resumeAfter as string[] | undefined) ?? null };
  });
  const takenOver = takeovers.filter(
    (t) => t.resumeAfter !== null && mine.find((j) => j.id === t.jobId)?.status === "done",
  );
  const brokeJob = jobs.find((j) => j.campaignId === broke && j.kind === "bible");
  const plans = await db.db.select().from(storyPlans);
  const recaps = await db.db.select().from(chapterSummaries);
  const writing = new Set(["bible", "chapter", "side_quest", "rework"]);
  const publishedFor = (id: string) => plans.filter((p) => p.campaignId === id).length;
  const doneFor = (id: string) =>
    mine.filter((j) => j.campaignId === id && j.status === "done" && writing.has(j.kind)).length;
  const misPublished = campaigns.filter((id) => publishedFor(id) !== doneFor(id));
  const doneRecaps = mine.filter((j) => j.kind === "recap" && j.status === "done").length;
  // A rewind sets a job aside and the same thing may be asked for again, so rewound campaigns don't count here;
  // neither do jobs whose try failed, which run their failed step again by design.
  const failedTry = new Set(all.filter((l) => l.msg === "writer job failed").map((l) => String(l.jobId)));
  const askedAgain = [...answered.entries()].filter(([key, n]) => {
    const id = key.split(":")[0] as string;
    return n > 1 && !failedTry.has(id) && !rewound.has(mine.find((j) => j.id === id)?.campaignId ?? "");
  });
  const rejected = all.filter((l) => l.msg === "writer material rejected");
  const why = new Map<string, number>();
  for (const l of rejected)
    for (const p of l.problems as string[]) {
      const kind = p.replace(/"[^"]*"|\b(ch\d+-[a-z0-9-]+|chapter \d+|Scene \d+)\b/g, "…");
      why.set(kind, (why.get(kind) ?? 0) + 1);
    }
  const durations = mine
    .filter((j) => j.status === "done" && j.startedAt && j.finishedAt)
    .map((j) => +(j.finishedAt as Date) - +(j.startedAt as Date));
  const waits = mine.filter((j) => j.startedAt).map((j) => +(j.startedAt as Date) - +j.createdAt);
  const kinds = [...new Set(mine.map((j) => j.kind))].sort();

  if (byStatus("queued") + byStatus("running") > 0) problems.push("jobs left open");
  if (byStatus("failed") > 0) problems.push(`${byStatus("failed")} jobs failed`);
  if (savedTwice > 0) problems.push(`${savedTwice} steps were saved twice`);
  if (askedAgain.length > kills.length)
    problems.push(
      `${askedAgain.length} AI steps were asked again (only ${kills.length} were under way at a kill)`,
    );
  if (misPublished.length > 0)
    problems.push(
      `${misPublished.length} campaigns published a different number of story versions than jobs done`,
    );
  if (recaps.length !== doneRecaps)
    problems.push(`${recaps.length} recaps saved for ${doneRecaps} finished recap jobs`);
  if (doubleRunning > 0) problems.push(`two jobs ran at once for one campaign ${doubleRunning} times`);
  if (takenOver.length < kills.length)
    problems.push(`only ${takenOver.length} jobs were taken over after ${kills.length} kills`);
  if (budgetStops.length === 0)
    problems.push("the spending limit never stopped the out-of-budget campaign's job");
  if (brokeJob?.attempts !== 0 || brokeJob.status !== "queued" || !brokeJob.notice?.text.includes("tomorrow"))
    problems.push("the out-of-budget campaign's job didn't wait for tomorrow with a notice for the DM room");
  const slower = pct(turnMs.during, 50) > Math.max(2 * pct(turnMs.before, 50), pct(turnMs.before, 50) + 50);
  if (slower) problems.push("turns were noticeably slower while the writer was busy");

  const ms = (n: number) => `${Math.round(n)} ms`;
  const s = (n: number) => `${(n / 1000).toFixed(1)} s`;
  const report = `# Story writer stress test

Run with \`pnpm writer:stress\` on ${new Date().toISOString().slice(0, 10)}. ${problems.length === 0 ? "**Passed.**" : `**Failed:** ${problems.join("; ")}.`}

## Setup

- ${CAMPAIGNS} campaigns on a fresh test database, one hero each, played turn by turn ${TURNS_BEFORE} turns with no writer running, then up to ${TURNS_DURING} more with it running. Two campaigns rewound two turns partway.
- Each campaign asked for its whole story when it was created (outline, bible, spine, chapter 1, side quests, self-check), then chapters, side quests, reworks and recaps as play reached them.
- One more campaign whose daily spending limit had run out.
- Two writer workers in one process, with a scripted AI that takes 0.2 to 2 seconds for each writer call (turns use the quick scripted AI).
- Leases of ${LEASE_MS / 1000} s renewed every second, so a takeover comes quickly (the service uses 2-minute leases renewed every 30 seconds).
- At ${kills.map((k) => s(k.at)).join(" and ")} a worker was killed in the middle of a job (${kills.map((k) => `${k.worker}, ${k.job ?? "?"}`).join("; ")}): from then on its AI calls and queue writes never returned, like a process that died. Each was replaced by a new worker.
- Everything below comes from the pino log lines (${all.length} of them), checked against the queue and what was published.

## Results

| | |
|---|---|
| Jobs | ${mine.length}: ${byStatus("done")} done, ${byStatus("stale")} set aside by rewinds, ${byStatus("failed")} failed, ${byStatus("queued") + byStatus("running")} left open |
| By kind | ${kinds.map((k) => `${mine.filter((j) => j.kind === k).length} ${k}`).join(", ")} |
| Log: claimed, done, failed, stale, lost | ${count("writer job claimed")}, ${count("writer job done")}, ${count("writer job failed")}, ${count("writer job stale")}, ${count("writer job lost")} |
| Taken over after a kill and finished from the last saved step | ${takenOver.length} of ${kills.length}: ${takeovers.map((t) => `${t.job} resumed after ${t.resumeAfter?.length ? t.resumeAfter.join(", ") : "nothing saved yet"}`).join("; ")} |
| Published | ${plans.length} story versions (one per finished writing job in every campaign: ${misPublished.length === 0 ? "yes" : "no"}), ${recaps.length} recaps |
| Steps saved twice | ${savedTwice} |
| Material sent back by the checks | ${rejected.length}${why.size ? `: ${[...why.entries()].map(([k, n]) => `${k} (${n})`).join("; ")}` : ""} |
| AI steps asked again | ${askedAgain.length} (the steps under way when a worker was killed; nothing saved was asked again) |
| Two jobs running for one campaign | ${doubleRunning === 0 ? "never" : `${doubleRunning} times`} |
| Spending limit | stopped the out-of-budget campaign's job ${budgetStops.length} time${budgetStops.length === 1 ? "" : "s"}; it waits for tomorrow without using a try, and the DM room was told: "${brokeJob?.notice?.text ?? "nothing"}" |
| Busiest moment | ${peakRunning} jobs running, ${peakQueued} waiting |
| Job time (claimed to done) | median ${s(pct(durations, 50))}, 95th percentile ${s(pct(durations, 95))} |
| Wait in the queue | median ${s(pct(waits, 50))}, 95th percentile ${s(pct(waits, 95))} |
| Whole run | ${s(elapsed)} |

## Turns while the writer works (from \`turn resolved\`)

| | Turns | Median | 95th percentile |
|---|---|---|---|
| No writer running | ${turnMs.before.length} | ${ms(pct(turnMs.before, 50))} | ${ms(pct(turnMs.before, 95))} |
| Writer busy | ${turnMs.during.length} | ${ms(pct(turnMs.during, 50))} | ${ms(pct(turnMs.during, 95))} |

Turns queue the writer's jobs inside their own transaction and never wait for them.

## Log lines

${[...new Set(all.map((l) => l.msg))]
  .sort()
  .map((msg) => `- \`${msg}\`: ${count(msg)}`)
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
