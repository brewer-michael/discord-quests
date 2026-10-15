import { z } from "zod";

const Env = z.object({
  DATABASE_URL: z.string().url("DATABASE_URL must be a postgres URL"),
  MASTER_KEYS: z
    .string({ error: "MASTER_KEYS is required to store API keys safely" })
    .refine((v) => !v.includes("REPLACE_ME"), "MASTER_KEYS still has the placeholder value"),
  DISCORD_CLIENT_ID: z.string().min(5, "DISCORD_CLIENT_ID is required"),
  DISCORD_CLIENT_SECRET: z.string().min(5, "DISCORD_CLIENT_SECRET is required"),
  WEB_BASE_URL: z
    .string()
    .url("WEB_BASE_URL must be the public address of this site")
    // "https://quests.example.com/" would otherwise make the sign-in redirect "…//auth/callback".
    .transform((u) => u.replace(/\/+$/, "")),
  /** Overridable for tests. */
  DISCORD_API_BASE: z.string().url().default("https://discord.com/api/v10"),
  ANTHROPIC_API_KEY: z.string().optional(),
  OPENAI_API_KEY: z.string().optional(),
  GEMINI_API_KEY: z.string().optional(),
  ALLOW_PRIVATE_ENDPOINTS: z.string().optional(),
  DEFAULT_DAILY_BUDGET_USD: z.string().optional(),
  DEFAULT_DAILY_IMAGE_CAP: z.string().optional(),
  DEFAULT_DAILY_TOKEN_CAP: z.string().optional(),
});
export type WebEnv = z.infer<typeof Env>;

let cached: WebEnv | null = null;

/** Read lazily so `next build` works without production secrets. */
export function webEnv(source: NodeJS.ProcessEnv = process.env): WebEnv {
  if (cached && source === process.env) return cached;
  const parsed = Env.safeParse(Object.fromEntries(Object.entries(source).filter(([, v]) => v !== "")));
  if (!parsed.success) {
    const lines = parsed.error.issues.map((i) => `- ${i.path.join(".")}: ${i.message}`);
    throw new Error(`Setup page configuration problems:\n${lines.join("\n")}\nSee .env.example.`);
  }
  if (source === process.env) cached = parsed.data;
  return parsed.data;
}

/** Cookies are marked Secure whenever the site is served over HTTPS. */
export function secureCookies(env: WebEnv): boolean {
  return env.WEB_BASE_URL.startsWith("https://");
}
