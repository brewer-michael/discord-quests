import { z } from "zod";

const Env = z.object({
  DISCORD_TOKEN: z.string().min(10, "DISCORD_TOKEN is required"),
  DISCORD_CLIENT_ID: z.string().min(5, "DISCORD_CLIENT_ID is required"),
  DISCORD_DEV_GUILD_ID: z.string().optional(),
  DATABASE_URL: z.string().url("DATABASE_URL must be a postgres URL"),
  MASTER_KEYS: z.string().optional(),
  WEB_BASE_URL: z.string().optional(),
  ANTHROPIC_API_KEY: z.string().optional(),
  OPENAI_API_KEY: z.string().optional(),
  GEMINI_API_KEY: z.string().optional(),
  ALLOW_PRIVATE_ENDPOINTS: z.string().optional(),
  DEFAULT_DAILY_BUDGET_USD: z.string().optional(),
  DEFAULT_DAILY_IMAGE_CAP: z.string().optional(),
  DEFAULT_DAILY_TOKEN_CAP: z.string().optional(),
  HEALTH_PORT: z.coerce.number().default(8080),
  RUN_MIGRATIONS: z.string().default("true"),
  REGISTER_COMMANDS: z.string().default("true"),
});
export type BotEnv = z.infer<typeof Env>;

/** The story writer service: no Discord, just the database, the AI services and its limits. */
const WriterEnv = Env.omit({
  DISCORD_TOKEN: true,
  DISCORD_CLIENT_ID: true,
  DISCORD_DEV_GUILD_ID: true,
  WEB_BASE_URL: true,
  REGISTER_COMMANDS: true,
}).extend({
  // 8081 so it can run beside the bot on one machine; the Docker image sets 8080.
  HEALTH_PORT: z.coerce.number().default(8081),
  RUN_MIGRATIONS: z.string().default("false"),
  WRITER_JOB_TOKENS: z.coerce.number().int().positive().default(200_000),
  WRITER_WORKERS: z.coerce.number().int().min(1).max(8).default(1),
});
export type WriterEnv = z.infer<typeof WriterEnv>;

function parse<T extends z.ZodType>(schema: T, source: NodeJS.ProcessEnv): z.infer<T> {
  const parsed = schema.safeParse(Object.fromEntries(Object.entries(source).filter(([, v]) => v !== "")));
  if (!parsed.success) {
    const lines = parsed.error.issues.map((i) => `- ${i.path.join(".")}: ${i.message}`);
    throw new Error(`Configuration problems:\n${lines.join("\n")}\nSee .env.example.`);
  }
  return parsed.data;
}

export function loadEnv(source: NodeJS.ProcessEnv = process.env): BotEnv {
  return parse(Env, source);
}

export function loadWriterEnv(source: NodeJS.ProcessEnv = process.env): WriterEnv {
  return parse(WriterEnv, source);
}
