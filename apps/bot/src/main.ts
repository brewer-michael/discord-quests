import { createServer } from "node:http";
import { connect, runMigrations } from "@dq/db";
import { createEngine, createLogger, logLevel, WorldCache } from "@dq/engine";
import { BudgetGuard, ImageService, ProviderGateway, ProviderStore } from "@dq/providers";
import { sql } from "drizzle-orm";
import { createClient, wire } from "./bot";
import type { BotContext } from "./context";
import { loadEnv } from "./env";
import { registerCommands } from "./register";
import { RoundScheduler } from "./scheduler";

const env = loadEnv();
const log = createLogger({
  service: "bot",
  format:
    process.env.LOG_FORMAT === "json" ? "json" : process.env.LOG_FORMAT === "pretty" ? "pretty" : undefined,
  level: logLevel(process.env.LOG_LEVEL),
});
const handle = connect(env.DATABASE_URL);
if (env.RUN_MIGRATIONS !== "false") {
  await runMigrations(handle.db);
  log.info("database migrations applied");
}

const store = new ProviderStore(handle.db, env);
const budget = new BudgetGuard(handle.db, env);
const llm = new ProviderGateway(store, budget, { log, logOutput: process.env.LOG_AI_OUTPUT === "true" });
const images = new ImageService(handle.db, store, budget, { log });
const worlds = new WorldCache();
const engine = createEngine({ db: handle.db, worlds, llm, log });
const client = createClient();
const scheduler = new RoundScheduler();
const ctx: BotContext = { engine, images, worlds, client, scheduler, log, env, resolving: new Set() };
wire(ctx);

const health = createServer(async (req, res) => {
  if (req.url !== "/healthz") {
    res.writeHead(404).end();
    return;
  }
  try {
    await handle.db.execute(sql`select 1`);
    const ready = client.isReady();
    res
      .writeHead(ready ? 200 : 503, { "content-type": "application/json" })
      .end(JSON.stringify({ ok: ready, timers: scheduler.size() }));
  } catch {
    res.writeHead(503).end(JSON.stringify({ ok: false }));
  }
});
health.listen(env.HEALTH_PORT);

async function shutdown(signal: string) {
  log.info(`received ${signal}, shutting down`);
  scheduler.stopAll();
  health.close();
  await client.destroy();
  await handle.close();
  process.exit(0);
}
process.on("SIGTERM", () => void shutdown("SIGTERM"));
process.on("SIGINT", () => void shutdown("SIGINT"));

if (env.REGISTER_COMMANDS !== "false") {
  try {
    const { count, scope } = await registerCommands({
      token: env.DISCORD_TOKEN,
      clientId: env.DISCORD_CLIENT_ID,
      guildId: env.DISCORD_DEV_GUILD_ID,
    });
    log.info(`registered ${count} slash commands ${scope}`);
  } catch (err) {
    // The commands registered last time keep working; try again on the next start.
    log.warn("could not register slash commands", {
      error: err instanceof Error ? err.message : String(err),
    });
  }
}

await client.login(env.DISCORD_TOKEN);
