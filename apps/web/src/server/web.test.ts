import { randomBytes } from "node:crypto";
import { auditLog, campaigns, guilds, secrets, webSessions } from "@dq/db";
import { createTestDb, TEST_DATABASE_URL } from "@dq/db/testing";
import { serverGameDefaults, serverStoryDefaults } from "@dq/engine";
import { BudgetGuard, ProviderStore } from "@dq/providers";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { deleteCampaign, grantSpoilerConsent, hasSpoilerConsent, SPOILER_WINDOW_MS } from "./campaigns";
import { authorizeUrl, canManage, inviteUrl } from "./discord";
import { secureCookies, webEnv } from "./env";
import {
  buildRow,
  checkBaseUrl,
  clean,
  deleteProvider,
  listModels,
  listProviders,
  parseProviderForm,
  providerFormValues,
  saveProvider,
  testProvider,
} from "./providers";
import { guildRoutes, parseRouteForm, saveTaskRoutes } from "./routes";
import { createSession, findSession, hashToken, sessionAccessToken } from "./session";
import { DEFAULT_GAME, saveServerSettings, serverSettings } from "./settings";

const form = (o: Record<string, string>) => {
  const fd = new FormData();
  for (const [k, v] of Object.entries(o)) fd.set(k, v);
  return fd;
};
const parse = (o: Record<string, string>) => {
  const r = parseProviderForm(form(o));
  if (!r.ok) throw new Error(JSON.stringify(r.errors));
  return r.value;
};

describe("Discord helpers", () => {
  it("lets owners, admins and Manage Server holders in, and nobody else", () => {
    expect(canManage({ owner: true, permissions: "0" })).toBe(true);
    expect(canManage({ owner: false, permissions: "8" })).toBe(true);
    expect(canManage({ owner: false, permissions: String(0x20) })).toBe(true);
    expect(canManage({ owner: false, permissions: String(0x400 | 0x800) })).toBe(false);
    expect(canManage({ owner: false, permissions: "not a number" })).toBe(false);
  });

  it("builds sign-in and invite links", () => {
    const a = new URL(
      authorizeUrl({ clientId: "123", redirectUri: "https://x.test/auth/callback", state: "s" }),
    );
    expect(a.searchParams.get("scope")).toBe("identify guilds");
    expect(a.searchParams.get("state")).toBe("s");
    const i = new URL(inviteUrl("123", "999"));
    expect(i.searchParams.get("guild_id")).toBe("999");
    expect(i.searchParams.get("scope")).toBe("bot applications.commands");
  });
});

describe("setup page configuration", () => {
  const envFor = (WEB_BASE_URL: string) =>
    webEnv({
      NODE_ENV: "test",
      DATABASE_URL: "postgres://dq:dq@localhost:5432/dq",
      MASTER_KEYS: `v1:${randomBytes(32).toString("base64")}`,
      DISCORD_CLIENT_ID: "123456789",
      DISCORD_CLIENT_SECRET: "not-a-secret",
      WEB_BASE_URL,
    });

  it("ignores a trailing slash on the site address, so the sign-in redirect still matches", () => {
    const env = envFor("https://quests.example.com/");
    expect(env.WEB_BASE_URL).toBe("https://quests.example.com");
    expect(`${env.WEB_BASE_URL}/auth/callback`).toBe("https://quests.example.com/auth/callback");
    expect(secureCookies(env)).toBe(true);
    expect(envFor("http://localhost:3000").WEB_BASE_URL).toBe("http://localhost:3000");
    expect(secureCookies(envFor("http://localhost:3000"))).toBe(false);
  });
});

describe("provider form", () => {
  it("requires an address for custom endpoints and HTTPS unless private endpoints are allowed", () => {
    const base = { kind: "llm", presetId: "custom-openai", name: "Mine", enabled: "on" };
    expect(buildRow(parse(base), { allowPrivate: false })).toMatchObject({
      ok: false,
      errors: { baseUrl: expect.any(String) },
    });
    expect(
      buildRow(parse({ ...base, baseUrl: "http://10.0.0.5:8000/v1" }), { allowPrivate: false }),
    ).toMatchObject({ ok: false, errors: { baseUrl: "Use an https:// address" } });
    expect(buildRow(parse({ ...base, baseUrl: "http://10.0.0.5:8000/v1" }), { allowPrivate: true }).ok).toBe(
      true,
    );
    expect(checkBaseUrl("https://user:pw@example.com", false)).toMatch(/credentials/);
    expect(checkBaseUrl("ftp://example.com", true)).toMatch(/http/);
  });

  it("ignores address changes for fixed services", () => {
    const r = buildRow(
      parse({ kind: "llm", presetId: "openai", name: "OpenAI", baseUrl: "https://evil.test/v1" }),
      {
        allowPrivate: false,
      },
    );
    expect(r.ok && r.row.values.baseUrl).toBe(null);
  });

  it("checks custom auth, headers and generic image specs", () => {
    const base = { kind: "image", presetId: "custom-http", name: "Pics", baseUrl: "https://img.test" };
    const bad = buildRow(
      parse({
        ...base,
        authType: "header",
        authName: "bad header!",
        extraHeaders: "Cookie: x",
        genericSpec: "{",
      }),
      { allowPrivate: false },
    );
    expect(bad).toMatchObject({
      ok: false,
      errors: {
        authName: expect.any(String),
        extraHeaders: expect.stringMatching(/Cookie/),
        genericSpec: "That isn't valid JSON",
      },
    });
    const noImagePath = JSON.stringify({
      request: { method: "POST", url: "{{baseUrl}}/go" },
      response: { mode: "sync" },
    });
    expect(buildRow(parse({ ...base, genericSpec: noImagePath }), { allowPrivate: false })).toMatchObject({
      ok: false,
      errors: { genericSpec: expect.stringMatching(/where the image is/) },
    });
    const good = JSON.stringify({
      request: { method: "POST", url: "{{baseUrl}}/go", body: '{"p": {{json prompt}}}' },
      response: { mode: "sync", imageBase64Path: "$.images[0]" },
    });
    const ok = buildRow(
      parse({
        ...base,
        genericSpec: good,
        authType: "header",
        authName: "X-Key",
        extraHeaders: "X-Team: kids",
      }),
      { allowPrivate: false },
    );
    expect(ok.ok && ok.row.values).toMatchObject({
      auth: { type: "header", headerName: "X-Key" },
      extraHeaders: { "X-Team": "kids" },
      genericSpec: { response: { imageBase64Path: "$.images[0]" } },
    });
  });

  it("won't point the story at a picture service", () => {
    expect(
      buildRow(parse({ kind: "image", presetId: "openai-images", name: "x", useFor: "story" }), {
        allowPrivate: false,
      }),
    ).toMatchObject({ ok: false, errors: { useFor: expect.any(String) } });
    expect(
      buildRow(parse({ kind: "llm", presetId: "openai-images", name: "x" }), { allowPrivate: false }),
    ).toMatchObject({
      ok: false,
      errors: { presetId: expect.any(String) },
    });
  });

  it("asks for a model's longest answer where the provider cuts answers short without one", () => {
    const fw = { kind: "llm", presetId: "fireworks", name: "fw" };
    expect(
      buildRow(parse({ ...fw, model: "accounts/fireworks/models/kimi-k3" }), { allowPrivate: false }),
    ).toMatchObject({ ok: false, errors: { maxOutput: expect.stringContaining("2,048") } });
    // A model whose limit the provider documents needs nothing entered.
    expect(
      buildRow(parse({ ...fw, model: "accounts/fireworks/routers/kimi-k3-fast" }), { allowPrivate: false })
        .ok,
    ).toBe(true);
    const entered = buildRow(
      parse({ ...fw, model: "accounts/fireworks/models/kimi-k3", maxOutput: "100000" }),
      { allowPrivate: false },
    );
    expect(entered).toMatchObject({
      ok: true,
      row: {
        values: { modelDefaults: { model: "accounts/fireworks/models/kimi-k3", maxOutputTokens: 100000 } },
      },
    });
  });

  it("lets a model on the server's own machine be told not to reason", () => {
    const r = buildRow(
      parse({
        kind: "llm",
        presetId: "ollama",
        name: "local",
        baseUrl: "http://10.0.0.5:11434/v1",
        reasoning: "none",
      }),
      { allowPrivate: true },
    );
    expect(r).toMatchObject({ ok: true, row: { values: { capabilityOverrides: { reasoning: "none" } } } });
    // A hosted service's reasoning comes from its docs only.
    expect(
      buildRow(parse({ kind: "llm", presetId: "openai", name: "o", reasoning: "none" }), {
        allowPrivate: false,
      }),
    ).toMatchObject({ ok: true, row: { values: { capabilityOverrides: {} } } });
  });

  it("hides key-shaped text in provider errors", () => {
    expect(clean("401: invalid key sk-proj-abcdefghijklmnop1234 provided")).not.toContain("abcdefghijklmnop");
  });

  it("reads routing slots and skips empty ones", () => {
    const id = "123e4567-e89b-42d3-a456-426614174000";
    expect(
      parseRouteForm(form({ "providerId.0": id, "model.0": "m", "effort.0": "low", "providerId.1": "" })),
    ).toEqual({
      ok: true,
      rows: [{ providerId: id, model: "m", effort: "low" }],
    });
    expect(parseRouteForm(form({ "providerId.0": id, "model.0": "" }))).toMatchObject({ ok: false });
  });
});

describe.skipIf(!TEST_DATABASE_URL)("setup page data", () => {
  let db: Awaited<ReturnType<typeof createTestDb>>;
  const keys = [{ version: "v1", key: randomBytes(32) }];
  const env = { MASTER_KEYS: `v1:${keys[0]!.key.toString("base64")}` };
  const guild = { id: "g1", name: "Lantern Club" };
  const SECRET = "sk-test-VERYSECRETVALUE-4321";

  beforeAll(async () => {
    db = await createTestDb();
  });
  afterAll(async () => {
    await db?.drop();
  });

  it("encrypts keys, never hands them back, and keeps them when the field is left empty", async () => {
    const res = await saveProvider(db.db, keys, {
      guild,
      userId: "u1",
      allowPrivate: false,
      input: parse({
        kind: "llm",
        presetId: "anthropic",
        name: "Claude",
        apiKey: SECRET,
        enabled: "on",
        useFor: "story",
      }),
    });
    if (!res.ok) throw new Error(JSON.stringify(res.errors));
    const [stored] = await db.db.select().from(secrets);
    expect(stored!.ciphertext.toString("utf8")).not.toContain("VERYSECRET");
    expect(stored!.last4).toBe("4321");

    const values = await providerFormValues(db.db, guild.id, res.id);
    expect(JSON.stringify(values)).not.toContain("VERYSECRET");
    expect(values?.keyMask).toBe("•••• 4321");
    expect(JSON.stringify(await listProviders(db.db, guild.id))).not.toContain("VERYSECRET");

    const store = new ProviderStore(db.db, env);
    expect((await store.resolve(res.id))?.apiKey).toBe(SECRET);
    // Every story job now uses it, with the preset's default model and effort.
    const routes = await guildRoutes(db.db, guild.id);
    expect(routes.narrator).toEqual([{ providerId: res.id, model: "claude-opus-5-5", effort: "medium" }]);
    expect(routes.image).toEqual([]);
    expect((await store.routes("narrator", { guildId: guild.id }))[0]?.configId).toBe(res.id);

    // Saving again without a key keeps the old one.
    const again = await saveProvider(db.db, keys, {
      guild,
      userId: "u1",
      allowPrivate: false,
      existingId: res.id,
      input: parse({ kind: "llm", presetId: "anthropic", name: "Claude (main)", enabled: "on" }),
    });
    expect(again.ok).toBe(true);
    store.invalidate();
    expect((await store.resolve(res.id))?.apiKey).toBe(SECRET);

    // A required key can't be removed without a new one.
    const removed = await saveProvider(db.db, keys, {
      guild,
      userId: "u1",
      allowPrivate: false,
      existingId: res.id,
      input: parse({ kind: "llm", presetId: "anthropic", name: "Claude", removeKey: "on", enabled: "on" }),
    });
    expect(removed).toMatchObject({ ok: false, errors: { apiKey: expect.any(String) } });

    const log = await db.db.select().from(auditLog).where(eq(auditLog.guildId, guild.id));
    expect(log.map((l) => l.action)).toEqual(expect.arrayContaining(["provider.create", "provider.update"]));
    expect(JSON.stringify(log)).not.toContain("VERYSECRET");
  });

  it("keeps each server's providers to itself", async () => {
    const mine = (await listProviders(db.db, guild.id))[0]!;
    expect(await providerFormValues(db.db, "g2", mine.id)).toBeNull();
    expect(await deleteProvider(db.db, "g2", "intruder", mine.id)).toBe(false);
    const hijack = await saveProvider(db.db, keys, {
      guild: { id: "g2", name: "Other" },
      userId: "intruder",
      allowPrivate: false,
      existingId: mine.id,
      input: parse({ kind: "llm", presetId: "anthropic", name: "mine now", apiKey: "sk-x", enabled: "on" }),
    });
    expect(hijack).toMatchObject({ ok: false });
    expect(
      await saveTaskRoutes(db.db, {
        guildId: "g2",
        userId: "intruder",
        task: "narrator",
        rows: [{ providerId: mine.id, model: "m", effort: null }],
      }),
    ).toMatchObject({ ok: false });
  });

  it("tests a connection with a real call and records its cost", async () => {
    const res = await saveProvider(db.db, keys, {
      guild,
      userId: "u1",
      allowPrivate: true,
      input: parse({
        kind: "llm",
        presetId: "custom-openai",
        name: "Home server",
        baseUrl: "http://192.168.1.20:8000/v1",
        model: "tiny-model",
        priceInput: "1",
        priceOutput: "2",
        selfHosted: "on",
        structured: "json_object",
        enabled: "on",
      }),
    });
    if (!res.ok) throw new Error(JSON.stringify(res.errors));
    const calls: string[] = [];
    const fetch = (async (url: string | URL) => {
      calls.push(String(url));
      const body = String(url).endsWith("/models")
        ? { data: [{ id: "tiny-model" }, { id: "big-model" }] }
        : {
            model: "tiny-model",
            choices: [{ finish_reason: "stop", message: { content: '{"word":"lantern"}' } }],
            usage: { prompt_tokens: 1000, completion_tokens: 1000 },
          };
      return new Response(JSON.stringify(body), { headers: { "content-type": "application/json" } });
    }) as typeof globalThis.fetch;
    const store = new ProviderStore(db.db, env);
    const budget = new BudgetGuard(db.db, env);
    const out = await testProvider(
      { db: db.db, store, budget, allowPrivate: true, fetch },
      { guildId: guild.id, userId: "tester-1", id: res.id },
    );
    expect(out).toMatchObject({ ok: true, model: "tiny-model" });
    expect(calls[0]).toBe("http://192.168.1.20:8000/v1/chat/completions");
    expect((await budget.todayUsage(guild.id)).costMicros).toBe(3000);
    // Rate limited per person.
    expect(
      (
        await testProvider(
          { db: db.db, store, budget, allowPrivate: true, fetch },
          { guildId: guild.id, userId: "tester-1", id: res.id },
        )
      ).ok,
    ).toBe(false);
    expect(
      await listModels({ db: db.db, store, allowPrivate: true, fetch }, { guildId: guild.id, id: res.id }),
    ).toEqual(["big-model", "tiny-model"]);
  });

  it("saves routes in order and refuses the wrong kind of service", async () => {
    const providers = await listProviders(db.db, guild.id);
    const claude = providers.find((p) => p.presetId === "anthropic")!;
    const home = providers.find((p) => p.presetId === "custom-openai")!;
    expect(
      await saveTaskRoutes(db.db, {
        guildId: guild.id,
        userId: "u1",
        task: "intent",
        rows: [
          { providerId: home.id, model: "tiny-model", effort: null },
          { providerId: claude.id, model: "claude-opus-5-5", effort: "low" },
        ],
      }),
    ).toEqual({ ok: true });
    const store = new ProviderStore(db.db, env);
    expect((await store.routes("intent", { guildId: guild.id })).map((r) => r.configId)).toEqual([
      home.id,
      claude.id,
    ]);
    expect(
      await saveTaskRoutes(db.db, {
        guildId: guild.id,
        userId: "u1",
        task: "image",
        rows: [{ providerId: claude.id, model: "x", effort: null }],
      }),
    ).toMatchObject({ ok: false, error: expect.stringMatching(/picture/) });
  });

  it("saves budgets and game defaults, which new campaigns pick up", async () => {
    const res = await saveServerSettings(db.db, {
      guild,
      userId: "u1",
      fd: form({
        dailyBudgetUsd: "2.5",
        dailyImageCap: "",
        imagePolicy: "cruxes_only",
        epilogueStyle: "explicit",
        roundTimerSeconds: "0",
        loomMode: "auto",
        pace: "post",
        pingPlayers: "on",
        intensity: "epic",
        length: "short",
        voice: "cinematic",
        humor: "rare",
        art: "painterly",
      }),
    });
    expect(res).toEqual({ ok: true });
    const s = await serverSettings(db.db, guild.id);
    expect(s).toMatchObject({ usePlatformDefaults: false, dailyBudgetUsd: 2.5, dailyImageCap: null });
    expect(s.game).toEqual({
      imagePolicy: "cruxes_only",
      epilogueStyle: "explicit",
      roundTimerSeconds: 0,
      loomMode: "auto",
      pace: "post",
      pingPlayers: true,
      intensity: "epic",
      length: "short",
      voice: "cinematic",
      humor: "rare",
      art: "painterly",
    });
    expect(s.rooms).toEqual({});
    // New campaigns start from the server's story defaults.
    const [g] = await db.db.select().from(guilds).where(eq(guilds.id, guild.id));
    expect(serverStoryDefaults(g?.settings as Record<string, unknown>)).toMatchObject({
      intensity: "epic",
      length: "short",
      voice: "cinematic",
      humor: "rare",
      art: "painterly",
    });
    expect(await new ProviderStore(db.db, env).guildSettings(guild.id)).toMatchObject({
      dailyBudgetUsd: 2.5,
    });
    expect(
      await saveServerSettings(db.db, {
        guild,
        userId: "u1",
        fd: form({ roundTimerSeconds: "5", imagePolicy: "off", epilogueStyle: "off", loomMode: "off" }),
      }),
    ).toMatchObject({ ok: false });
  });

  it("picking play by post alone gives a day per turn and pings", async () => {
    const save = (o: Record<string, string>) =>
      saveServerSettings(db.db, {
        guild,
        userId: "u1",
        fd: form({ imagePolicy: "off", epilogueStyle: "off", loomMode: "auto", ...o }),
      });
    const stored = async () => {
      const [g] = await db.db.select().from(guilds).where(eq(guilds.id, guild.id));
      return g?.settings as Record<string, unknown>;
    };

    expect(await save({ pace: "post", roundTimerSeconds: "", pingPlayers: "" })).toEqual({ ok: true });
    const s = await serverSettings(db.db, guild.id);
    expect(s.game.roundTimerSeconds).toBeUndefined();
    expect(s.game.pingPlayers).toBeUndefined();
    expect(serverGameDefaults(await stored())).toMatchObject({
      pace: "post",
      roundTimerSeconds: 86_400,
      pingPlayers: true,
    });

    expect(await save({ pace: "post", roundTimerSeconds: "180", pingPlayers: "" })).toMatchObject({
      ok: false,
      error: expect.stringMatching(/12 hours/),
    });
    expect(await save({ pace: "live", roundTimerSeconds: "0", pingPlayers: "off" })).toEqual({ ok: true });
    expect((await serverSettings(db.db, guild.id)).game).toMatchObject({
      roundTimerSeconds: 0,
      pingPlayers: false,
    });

    // The older page saved "play by post, 3 minutes"; the form now shows the usual time for the pace instead.
    await db.db
      .update(guilds)
      .set({
        settings: {
          ...(await stored()),
          gameDefaults: { ...DEFAULT_GAME, pace: "post", roundTimerSeconds: 180, pingPlayers: false },
        },
      })
      .where(eq(guilds.id, guild.id));
    expect((await serverSettings(db.db, guild.id)).game).toMatchObject({ pace: "post", pingPlayers: false });
    expect((await serverSettings(db.db, guild.id)).game.roundTimerSeconds).toBeUndefined();
  });

  it("stores sessions by hash with the Discord token encrypted, and expires them", async () => {
    const now = new Date();
    const { token } = await createSession(
      db.db,
      keys,
      {
        user: { id: "u9", username: "Hattie", avatar: null },
        accessToken: "discord-access-token-xyz",
        expiresInSeconds: 3600,
        guilds: [{ id: "g1", name: "Lantern Club", icon: null, owner: true, permissions: "0" }],
      },
      now,
    );
    const [row] = await db.db.select().from(webSessions);
    expect(row!.id).toBe(hashToken(token));
    expect(row!.tokenCiphertext.toString("utf8")).not.toContain("discord-access-token");
    const s = await findSession(db.db, token, now);
    expect(s && sessionAccessToken(s, keys)).toBe("discord-access-token-xyz");
    expect(await findSession(db.db, "wrong", now)).toBeNull();
    expect(await findSession(db.db, token, new Date(now.getTime() + 3601_000))).toBeNull();
    expect(await db.db.select().from(webSessions)).toHaveLength(0);
  });

  it("gates the hidden hand behind a recorded, short-lived consent, and deletes only on the exact name", async () => {
    await db.db.insert(guilds).values({ id: "g3", name: "x" }).onConflictDoNothing();
    const [c] = await db.db
      .insert(campaigns)
      .values({
        guildId: guild.id,
        channelId: "ch",
        name: "Lights Out",
        worldId: "lanternreach",
        worldVersion: "v",
        mode: "ai_dm",
        createdBy: "u1",
        story: {},
      })
      .returning();
    expect(await hasSpoilerConsent(db.db, "u1", c!.id)).toBe(false);
    expect(await grantSpoilerConsent(db.db, { guildId: "g3", userId: "u1", campaignId: c!.id })).toBe(false);
    expect(await grantSpoilerConsent(db.db, { guildId: guild.id, userId: "u1", campaignId: c!.id })).toBe(
      true,
    );
    expect(await hasSpoilerConsent(db.db, "u1", c!.id)).toBe(true);
    expect(await hasSpoilerConsent(db.db, "u2", c!.id)).toBe(false);
    expect(await hasSpoilerConsent(db.db, "u1", c!.id, new Date(Date.now() + SPOILER_WINDOW_MS + 1000))).toBe(
      false,
    );

    expect(
      await deleteCampaign(db.db, {
        guildId: guild.id,
        userId: "u1",
        campaignId: c!.id,
        confirmName: "lights out",
      }),
    ).toMatchObject({ ok: false });
    expect(
      await deleteCampaign(db.db, {
        guildId: "g3",
        userId: "u1",
        campaignId: c!.id,
        confirmName: "Lights Out",
      }),
    ).toMatchObject({
      ok: false,
    });
    expect(
      await deleteCampaign(db.db, {
        guildId: guild.id,
        userId: "u1",
        campaignId: c!.id,
        confirmName: "Lights Out",
      }),
    ).toEqual({
      ok: true,
    });
    expect(await db.db.select().from(campaigns)).toHaveLength(0);
  });
});
