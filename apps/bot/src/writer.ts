/**
 * The story writer service: writes chapters ahead of the table, in the background, from the queue the bot
 * fills. Runs beside the bot from the same image; restarting either never interrupts the other. A job cut off
 * by a restart carries on from its last finished step.
 */
import { createServer } from "node:http";
import { connect, runMigrations } from "@dq/db";
import { createLogger, logLevel, StoryJobs, StoryWriter, WorldCache } from "@dq/engine";
import { BudgetGuard, ProviderGateway, ProviderStore } from "@dq/providers";
import { sql } from "drizzle-orm";
import { loadWriterEnv } from "./env";

const env = loadWriterEnv();
const log = createLogger({
  service: "writer",
  format:
    process.env.LOG_FORMAT === "json" ? "json" : process.env.LOG_FORMAT === "pretty" ? "pretty" : undefined,
  level: logLevel(process.env.LOG_LEVEL),
});
const handle = connect(env.DATABASE_URL, { max: env.WRITER_WORKERS + 2 });
if (env.RUN_MIGRATIONS !== "false") {
  await runMigrations(handle.db);
  log.info("database migrations applied");
}

const store = new ProviderStore(handle.db, env);
const budget = new BudgetGuard(handle.db, env);
const llm = new ProviderGateway(store, budget, { log, logOutput: process.env.LOG_AI_OUTPUT === "true" });
const jobs = new StoryJobs(handle.db);
const worlds = new WorldCache();
const writers = Array.from(
  { length: env.WRITER_WORKERS },
  () => new StoryWriter({ db: handle.db, llm, worlds, jobs, log, jobTokens: env.WRITER_JOB_TOKENS }),
);
for (const w of writers) w.start();
log.info("story writer started", { workers: writers.map((w) => w.worker), jobTokens: env.WRITER_JOB_TOKENS });

const health = createServer(async (req, res) => {
  if (req.url !== "/healthz") {
    res.writeHead(404).end();
    return;
  }
  try {
    await handle.db.execute(sql`select 1`);
    const busy = writers.flatMap((w) => (w.job ? [{ jobId: w.job.id, kind: w.job.kind }] : []));
    res.writeHead(200, { "content-type": "application/json" }).end(JSON.stringify({ ok: true, busy }));
  } catch {
    res.writeHead(503).end(JSON.stringify({ ok: false }));
  }
});
health.listen(env.HEALTH_PORT);

async function shutdown(signal: string) {
  log.info(`received ${signal}, shutting down`);
  health.close();
  // Up to 25 seconds for the steps under way; anything still running is handed back to the queue.
  await Promise.all(writers.map((w) => w.stop(25_000)));
  await handle.close();
  process.exit(0);
}
process.on("SIGTERM", () => void shutdown("SIGTERM"));
process.on("SIGINT", () => void shutdown("SIGINT"));
