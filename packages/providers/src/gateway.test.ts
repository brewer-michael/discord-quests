import { randomBytes } from "node:crypto";
import { guilds, providerConfigs, secrets, taskRoutes, usageDaily } from "@dq/db";
import { encryptSecret, parseMasterKeys } from "@dq/db/crypto";
import { createTestDb, TEST_DATABASE_URL } from "@dq/db/testing";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { z } from "zod";
import { BudgetGuard } from "./budget";
import { ProviderGateway } from "./gateway";
import { ImageService } from "./images";
import { ProviderStore } from "./store";
import { fakeFetch, json, PNG_B64 } from "./test-fetch";

const Answer = z.object({ answer: z.string() });
const call = {
  task: "narrator" as const,
  system: [{ text: "sys" }],
  user: [{ text: "hi" }],
  schema: Answer,
  schemaName: "a",
  expectTokens: 1000,
};
const chat = (answer: string) =>
  json({
    model: "m",
    choices: [{ finish_reason: "stop", message: { content: JSON.stringify({ answer }) } }],
    usage: { prompt_tokens: 10, completion_tokens: 5 },
  });

describe.skipIf(!TEST_DATABASE_URL)("provider gateway", () => {
  let db: Awaited<ReturnType<typeof createTestDb>>;
  const masterKeys = `v1:${randomBytes(32).toString("base64")}`;

  async function addConfig(
    guildId: string,
    name: string,
    baseUrl: string,
    apiKey: string,
    priority: number,
    model = "m",
  ) {
    const secretId = crypto.randomUUID();
    const enc = encryptSecret(apiKey, parseMasterKeys(masterKeys), guildId, secretId);
    await db.db.insert(secrets).values({ id: secretId, guildId, ...enc });
    const [cfg] = await db.db
      .insert(providerConfigs)
      .values({
        guildId,
        kind: "llm",
        name,
        presetId: "custom-openai",
        adapterId: "openai_compat",
        baseUrl,
        secretId,
        capabilityOverrides: { structured: "json_schema" },
      })
      .returning();
    await db.db
      .insert(taskRoutes)
      .values({ guildId, task: "narrator", providerConfigId: cfg?.id as string, model, priority });
    return cfg?.id as string;
  }

  beforeAll(async () => {
    db = await createTestDb();
  }, 30_000);
  afterAll(async () => {
    await db?.drop();
  });

  it("uses the guild's own encrypted key and records usage", async () => {
    await addConfig("g1", "primary", "https://primary.example/v1", "sk-guild-secret", 0);
    const { fetch, calls } = fakeFetch(() => chat("from primary"));
    const store = new ProviderStore(db.db, { MASTER_KEYS: masterKeys });
    const gw = new ProviderGateway(store, new BudgetGuard(db.db, {}), { fetch });
    const res = await gw.structured(call, { guildId: "g1" });
    expect(res).toMatchObject({ ok: true, value: { answer: "from primary" } });
    expect(calls[0]?.headers.authorization).toBe("Bearer sk-guild-secret");
    const [usage] = await db.db.select().from(usageDaily).where(eq(usageDaily.guildId, "g1"));
    expect(usage?.tokens).toBe(15);
  });

  it("fails over to the next route on outages and broken answers, but not on refusals", async () => {
    await addConfig("g2", "flaky", "https://flaky.example/v1", "k1", 0);
    await addConfig("g2", "backup", "https://backup.example/v1", "k2", 1);
    const store = new ProviderStore(db.db, { MASTER_KEYS: masterKeys });
    const outage = fakeFetch((r) =>
      r.url.hostname === "flaky.example" ? json({ error: "down" }, 503) : chat("from backup"),
    );
    expect(
      await new ProviderGateway(store, new BudgetGuard(db.db, {}), { fetch: outage.fetch }).structured(call, {
        guildId: "g2",
      }),
    ).toMatchObject({
      ok: true,
      value: { answer: "from backup" },
    });
    // A broken answer gets the next service's try.
    const bad = fakeFetch((r) =>
      r.url.hostname === "flaky.example"
        ? json({ choices: [{ finish_reason: "stop", message: { content: '{"nope":1}' } }] })
        : chat("fixed by backup"),
    );
    expect(
      await new ProviderGateway(store, new BudgetGuard(db.db, {}), { fetch: bad.fetch }).structured(call, {
        guildId: "g2",
      }),
    ).toMatchObject({ ok: true, value: { answer: "fixed by backup" } });
    // A refusal is the engine's to handle, not another service's.
    const refused = fakeFetch((r) =>
      r.url.hostname === "flaky.example"
        ? json({ choices: [{ finish_reason: "stop", message: { content: null, refusal: "no" } }] })
        : chat("x"),
    );
    expect(
      await new ProviderGateway(store, new BudgetGuard(db.db, {}), { fetch: refused.fetch }).structured(
        call,
        {
          guildId: "g2",
        },
      ),
    ).toMatchObject({ ok: false, stop: "refusal" });
    expect(refused.calls.every((c) => c.url.hostname === "flaky.example")).toBe(true);
  });

  it("calls a custom endpoint at a documented service's address the way that service documents", async () => {
    await addConfig("g-zai", "zai", "https://api.z.ai/api/coding/paas/v4", "k", 0, "glm-5.3");
    const store = new ProviderStore(db.db, { MASTER_KEYS: masterKeys });
    const z = fakeFetch(() => chat("told"));
    expect(
      await new ProviderGateway(store, new BudgetGuard(db.db, {}), { fetch: z.fetch }).structured(
        { ...call, effort: "medium" },
        { guildId: "g-zai" },
      ),
    ).toMatchObject({ ok: true });
    expect(z.calls[0]?.url.toString()).toBe("https://api.z.ai/api/coding/paas/v4/chat/completions");
    // GLM-5.3 takes low, high or max; medium goes to the nearest, deeper one. No thinking object.
    expect(z.calls[0]?.body).toMatchObject({ reasoning_effort: "high", max_tokens: 131072 });
    expect(z.calls[0]?.body).not.toHaveProperty("thinking");
  });

  it("falls back to server defaults, and says so when there are none", async () => {
    const none = new ProviderGateway(new ProviderStore(db.db, {}), new BudgetGuard(db.db, {}), {
      fetch: fakeFetch(() => chat("x")).fetch,
    });
    expect(await none.structured(call, { guildId: "g-empty" })).toMatchObject({
      ok: false,
      stop: "unconfigured",
    });

    const openai = fakeFetch(() => chat("from the server's key"));
    const env = new ProviderGateway(
      new ProviderStore(db.db, { OPENAI_API_KEY: "sk-openai" }),
      new BudgetGuard(db.db, {}),
      { fetch: openai.fetch },
    );
    expect(await env.structured(call, { guildId: "g-env" })).toMatchObject({
      ok: true,
      value: { answer: "from the server's key" },
    });
    expect(openai.calls[0]?.headers.authorization).toBe("Bearer sk-openai");
    expect(openai.calls[0]?.url.hostname).toBe("api.openai.com");
    expect((openai.calls[0]!.body as { model: string }).model).toBe("gpt-6.1-sol");
  });

  it("respects a guild that opts out of server defaults", async () => {
    await db.db.insert(guilds).values({ id: "g-opt", settings: { usePlatformDefaults: false } });
    const gw = new ProviderGateway(
      new ProviderStore(db.db, { ANTHROPIC_API_KEY: "sk-ant" }),
      new BudgetGuard(db.db, {}),
      { fetch: fakeFetch(() => chat("x")).fetch },
    );
    expect(await gw.structured(call, { guildId: "g-opt" })).toMatchObject({
      ok: false,
      stop: "unconfigured",
    });
  });

  it("stops at the daily budget for server-default keys", async () => {
    await db.db.insert(usageDaily).values({
      guildId: "g-broke",
      day: new Date().toISOString().slice(0, 10),
      costMicros: 6_000_000,
      tokens: 0,
      images: 0,
    });
    const anthropic = fakeFetch(() => chat("x"));
    const gw = new ProviderGateway(
      new ProviderStore(db.db, { ANTHROPIC_API_KEY: "sk-ant" }),
      new BudgetGuard(db.db, { DEFAULT_DAILY_BUDGET_USD: "5" }),
      {
        fetch: anthropic.fetch,
      },
    );
    expect(await gw.structured(call, { guildId: "g-broke" })).toMatchObject({ ok: false, stop: "budget" });
    expect(anthropic.calls).toHaveLength(0);
  });

  it("generates scene images once and serves repeats from the cache", async () => {
    const { fetch, calls } = fakeFetch(() => json({ data: [{ b64_json: PNG_B64 }] }));
    const store = new ProviderStore(db.db, { OPENAI_API_KEY: "sk-oa" });
    const images = new ImageService(db.db, store, new BudgetGuard(db.db, {}), { fetch });
    const world = {
      meta: { artStyle: "storybook watercolor" },
      content: { bannedTerms: ["blood"], levels: { light: { bannedTerms: [] } } },
    } as never;
    const brief = { setting: "a marsh hall", subjects: ["heroes"], mood: "hopeful", timeOfDay: "dusk" };
    const first = await images.sceneImage({ guildId: "g-img" }, brief, world);
    const second = await images.sceneImage({ guildId: "g-img" }, brief, world);
    expect(first?.cached).toBe(false);
    expect(second?.cached).toBe(true);
    expect(calls).toHaveLength(1);
    expect((calls[0]!.body as { prompt: string }).prompt).toContain("storybook watercolor");
  });
});
