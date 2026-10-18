import { randomBytes } from "node:crypto";
import { secrets, storyJobs } from "@dq/db";
import { parseMasterKeys } from "@dq/db/crypto";
import { createTestDb, TEST_DATABASE_URL } from "@dq/db/testing";
import { createEngine, StoryWriter, WorldCache } from "@dq/engine";
import { FakeLlm, UnconfiguredLlm } from "@dq/engine/testing";
import { BudgetGuard, ProviderGateway, ProviderStore } from "@dq/providers";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { keyVariable, type PlayIO, playSession, routeEverythingTo, useService } from "./play";
import { battleChoices, formatJournal } from "./play-format";
import { startMockProvider } from "./play-mock";

const worlds = new WorldCache();

/** A player who types the given lines in order, and whatever was said back. */
function scripted(lines: string[]) {
  const out: string[] = [];
  const io: PlayIO = {
    say: (t) => out.push(t),
    ask: async (prompt) => {
      const line = lines.shift() ?? null;
      out.push(`${prompt}${line ?? ""}`);
      return line;
    },
  };
  return { io, text: () => out.join("\n") };
}

describe("play format", () => {
  it("offers every battle action, a spell once per target, and says when the journal is empty", () => {
    const options = {
      down: false,
      attacks: [{ id: "mace", name: "Mace", ranged: false }],
      spells: [
        { id: "flame", name: "Sacred Flame", level: 0, target: "foe", available: true },
        { id: "word", name: "Healing Word", level: 1, target: "ally", available: true },
        { id: "spent", name: "Bless", level: 1, target: "self", available: false },
      ],
      potions: [{ itemId: "tonic", name: "Honey Tonic", qty: 2 }],
      foes: [
        { id: "f1", name: "Gloom Mite", condition: "fresh" },
        { id: "f2", name: "Bramble Rat", condition: "hurt" },
      ],
      atMercy: [{ id: "f3", name: "Snibbet" }],
      allies: [
        { id: "h1", name: "Wren", hp: 8, hpMax: 10 },
        { id: "h2", name: "Bram", hp: 12, hpMax: 12 },
      ],
    };
    expect(battleChoices(options, "Wren").map((c) => c.label)).toEqual([
      "Attack Gloom Mite (fresh) with Mace",
      "Attack Bramble Rat (hurt) with Mace",
      "Cast Sacred Flame on Gloom Mite",
      "Cast Sacred Flame on Bramble Rat",
      "Cast Healing Word on Wren",
      "Cast Healing Word on Bram",
      "Defend",
      "Help Bram",
      "Drink Honey Tonic (2 left)",
      "Spare Snibbet",
    ]);
    expect(battleChoices(options, "Wren")[8]?.action).toEqual({
      kind: "item",
      itemId: "tonic",
      targetId: "h1",
    });
    expect(formatJournal({ quests: [], promises: [], chapters: [] })).toBe("Journal: nothing written yet.");
  });
});

describe.skipIf(!TEST_DATABASE_URL)("pnpm play", () => {
  let db: Awaited<ReturnType<typeof createTestDb>>;
  beforeAll(async () => {
    db = await createTestDb();
  }, 30_000);
  afterAll(async () => {
    await db?.drop();
  });

  it("plays rounds on its own, with the DM room's notices, and no Discord anywhere", async () => {
    const engine = createEngine({ db: db.db, worlds, llm: new FakeLlm() });
    const { io, text } = scripted([]);
    const done = await playSession(
      {
        engine,
        guildId: "g-play-auto",
        auto: 8,
        writer: "between-turns",
        heroes: [
          { name: "Wren", classId: "lanternkeeper" },
          { name: "Bram", classId: "shieldheart" },
        ],
      },
      io,
    );
    expect(done.rounds).toBe(8);
    const out = text();
    expect(out).toContain("═══ The Last Flame · Lantern Square ═══");
    expect(out).toContain("What do you do?");
    expect(out).toMatch(/Wren: .+\nBram: .+/);
    expect(out).toContain("[DM room] ✅ Chapter 1 is ready; it shapes the scenes from here.");
  });

  it("lets the DM approve, redo and edit drafts in Assist mode, and answers commands", async () => {
    const engine = createEngine({ db: db.db, worlds, llm: new FakeLlm() });
    const { io, text } = scripted([
      "/sheet",
      "I hum a song to calm everyone",
      "maybe",
      "r",
      "Make it funnier",
      "e",
      "The square falls quiet, and a small voice calls from the lamp-house.",
      "Follow the voice | Ask Hattie",
      "/jobs",
      "2",
      "o",
      "/rewind 1",
      "/quit",
    ]);
    const done = await playSession(
      { engine, guildId: "g-play-assist", mode: "assist", writer: "between-turns" },
      io,
    );
    expect(done.ended).toBe(false);
    const out = text();
    expect(out).toMatch(/Wren: level 1 Pipkin Lanternkeeper/);
    expect(out).toContain("┌─ DM room: draft · The Last Flame");
    expect(out).toContain("Answer o, e or r.");
    expect(out).toContain("Guidance for the storyteller> Make it funnier");
    expect(out).toContain("The square falls quiet, and a small voice calls from the lamp-house.");
    expect(out).toMatch(/1\) Follow the voice\n {2}2\) Ask Hattie/);
    expect(out).toContain("chapter 1: done (done: facts, draft, revise)");
    expect(out).toContain("⏪ Back 1 turn.");
  });

  it("hands a turn the storyteller couldn't tell to the DM, who tells it", async () => {
    const engine = createEngine({ db: db.db, worlds, llm: new UnconfiguredLlm() });
    const { io, text } = scripted([
      "w",
      "The lanterns gutter, and Hattie waves the heroes over.",
      "Go to Hattie | Search the square",
      "/quit",
    ]);
    await playSession({ engine, guildId: "g-play-handoff", writer: "off" }, io);
    const out = text();
    expect(out).toContain("┌─ DM room: the storyteller couldn't tell this turn · The Last Flame");
    expect(out).toContain("│ Why:");
    expect(out).toContain("│ Settled:");
    expect(out).toMatch(
      /The lanterns gutter, and Hattie waves the heroes over\.\n\nWhat do you do\?\n {2}1\) Go to Hattie/,
    );
  });

  it("plays with any listed service and its key, stored encrypted the way the setup page stores it", async () => {
    expect(keyVariable("zai")).toBe("ZAI_API_KEY");
    expect(keyVariable("custom-openai")).toBe("CUSTOM_OPENAI_API_KEY");
    // Z.ai's own settings (plain JSON answers, its models per job), sent to the stand-in instead of Z.ai.
    const mock = await startMockProvider();
    try {
      const raw = `v1:${randomBytes(32).toString("base64")}`;
      await useService(db.db, "g-play-zai", {
        presetId: "zai",
        baseUrl: mock.url,
        selfHosted: true,
        apiKey: "zai-test-key-1234",
        masterKeys: parseMasterKeys(raw),
      });
      const [stored] = await db.db.select().from(secrets).where(eq(secrets.guildId, "g-play-zai"));
      expect(stored?.last4).toBe("1234");
      expect(stored?.ciphertext.toString("utf8")).not.toContain("zai-test-key");
      const env = { MASTER_KEYS: raw, ALLOW_PRIVATE_ENDPOINTS: "true" };
      const llm = new ProviderGateway(new ProviderStore(db.db, env), new BudgetGuard(db.db, env));
      const engine = createEngine({ db: db.db, worlds, llm });
      const { io, text } = scripted([]);
      await playSession({ engine, guildId: "g-play-zai", auto: 3, writer: "between-turns" }, io);
      expect(text()).toContain("[DM room] ✅ Chapter 1 is ready");
      expect(mock.last.authorization).toBe("Bearer zai-test-key-1234");
      expect(mock.stats.byTask.narrator).toBeGreaterThan(0);
      expect(mock.stats.byTask.writer).toBe(2);
      expect(["glm-5.3", "glm-5.3-flash"]).toContain(mock.last.model);
    } finally {
      await mock.close();
    }
  });

  it("goes through the real provider code with the stand-in AI, and cuts off a request that runs too long", async () => {
    const mock = await startMockProvider();
    try {
      const env = { ALLOW_PRIVATE_ENDPOINTS: "true" };
      await routeEverythingTo(db.db, "g-play-mock", mock.url, "mock");
      const store = new ProviderStore(db.db, env);
      const lines: string[] = [];
      const log = { info: (m: string) => lines.push(m), warn: (m: string) => lines.push(m), error: () => {} };
      const llm = new ProviderGateway(store, new BudgetGuard(db.db, env), { log });
      const engine = createEngine({ db: db.db, worlds, llm });
      const { io, text } = scripted([]);
      await playSession({ engine, guildId: "g-play-mock", auto: 3, writer: "between-turns" }, io);
      expect(text()).toContain("[DM room] ✅ Chapter 1 is ready");
      expect(mock.stats.byTask.narrator).toBeGreaterThan(0);
      expect(mock.stats.byTask.writer).toBe(2);
      expect(lines.filter((l) => l === "ai call").length).toBe(mock.stats.answered);
    } finally {
      await mock.close();
    }

    // A slow service: the writer's step runs past its limit, and the request is cut off rather than left running.
    const slow = await startMockProvider({ delayMs: [1_500, 1_500] });
    try {
      const env = { ALLOW_PRIVATE_ENDPOINTS: "true" };
      await routeEverythingTo(db.db, "g-play-slow", slow.url, "mock");
      const store = new ProviderStore(db.db, env);
      const llm = new ProviderGateway(store, new BudgetGuard(db.db, env));
      const engine = createEngine({ db: db.db, worlds, llm: new FakeLlm() });
      const c = await engine.campaigns.create({
        guildId: "g-play-slow",
        channelId: "ch-play-slow",
        name: "Slow",
        mode: "ai_dm",
        createdBy: "host",
      });
      await engine.storyJobs.enqueue({
        campaignId: c.id,
        kind: "chapter_plan",
        key: 1,
        reason: "test",
        seq: 0,
      });
      const writer = new StoryWriter({
        db: db.db,
        llm,
        worlds,
        jobs: engine.storyJobs,
        campaignId: c.id,
        deadlineMs: 300,
      });
      const [ran] = await writer.drain();
      expect(ran?.outcome).toBe("retrying");
      const [job] = await db.db.select().from(storyJobs).where(eq(storyJobs.campaignId, c.id));
      expect(job?.error).toBe("it ran past its 1-second limit");
      await new Promise((r) => setTimeout(r, 1_800));
      expect(slow.stats.abandoned).toBe(1);
      expect(slow.stats.answered).toBe(0);
    } finally {
      await slow.close();
    }
  }, 30_000);
});
