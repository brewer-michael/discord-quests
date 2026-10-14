/** Shared values for the end-to-end run. Nothing here is a real credential. */
export const PORT = 3100;
export const MOCK_PORT = 3199;
export const BASE_URL = `http://localhost:${PORT}`;
export const SESSION_TOKEN = "e2e-session-token-0123456789abcdefghijklmnopqrstuv";
export const USER_ID = "100000000000000001";
export const GUILD_ID = "200000000000000001";
export const OTHER_GUILD_ID = "200000000000000002";
export const FORBIDDEN_GUILD_ID = "200000000000000003";
/** 32 zero bytes: fine for a throwaway test database, never for real use. */
export const MASTER_KEYS = `v1:${Buffer.alloc(32).toString("base64")}`;

export function e2eDatabaseUrl(): string {
  const base =
    process.env.E2E_DATABASE_URL ??
    process.env.TEST_DATABASE_URL ??
    "postgres://dq:dq@localhost:5432/dq_test";
  const u = new URL(base);
  u.pathname = "/dq_e2e";
  return u.toString();
}

export function serverEnv(): Record<string, string> {
  return {
    DATABASE_URL: e2eDatabaseUrl(),
    MASTER_KEYS,
    DISCORD_CLIENT_ID: "300000000000000001",
    DISCORD_CLIENT_SECRET: "e2e-client-secret",
    WEB_BASE_URL: BASE_URL,
    DISCORD_API_BASE: `http://127.0.0.1:${MOCK_PORT}/discord`,
    ALLOW_PRIVATE_ENDPOINTS: "true",
    ANTHROPIC_API_KEY: "",
    OPENAI_API_KEY: "",
    GEMINI_API_KEY: "",
  };
}
