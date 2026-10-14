import { campaigns, events, safetyEvents, turns } from "@dq/db";
import { createTestDb, TEST_DATABASE_URL } from "@dq/db/testing";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createEngine, type Engine } from "./index";
import { loadLoom } from "./loom-store";
import { FakeLlm, UnconfiguredLlm } from "./testing";
import { WorldCache } from "./world-cache";

const worlds = new WorldCache();

async function makeHero(engine: Engine, campaignId: string, userId: string, classId: string, name: string) {
  await engine.characters.startDraft(campaignId, userId);
  await engine.characters.updateDraft(campaignId, userId, { op: "class", classId });
  await engine.characters.updateDraft(campaignId, userId, { op: "path", pathId: "long-road" });
  await engine.characters.updateDraft(campaignId, userId, { op: "background", backgroundId: "farmhand" });
  await engine.characters.updateDraft(campaignId, userId, { op: "species", speciesId: "pipkin" });
  await engine.characters.updateDraft(campaignId, userId, { op: "recommended" });
  await engine.characters.updateDraft(campaignId, userId, {
    op: "keepsake",
    keepsakeId: "carved-wooden-bird",
  });
  const draft = await engine.characters.updateDraft(campaignId, userId, {
    op: "name",
    name,
    look: "Freckles and a big grin.",
  });
  expect(draft.missing).toEqual([]);
  return engine.characters.finalize(campaignId, userId);
}

describe.skipIf(!TEST_DATABASE_URL)("engine (end to end)", () => {
  let db: Awaited<ReturnType<typeof createTestDb>>;

  beforeAll(async () => {
    db = await createTestDb();
  }, 30_000);
  afterAll(async () => {
    await db?.drop();
  });

  it("builds heroes through the guided wizard", async () => {
    const engine = createEngine({ db: db.db, worlds, llm: new FakeLlm() });
    const c = await engine.campaigns.create({
      guildId: "g1",
      channelId: "ch1",
      name: "Wizard Test",
      mode: "ai_dm",
      createdBy: "u1",
    });
    const sheet = await makeHero(engine, c.id, "u1", "shieldheart", "Pip Thistle");
    expect(sheet.className).toBe("Shieldheart");
    expect(sheet.hpMax).toBeGreaterThan(8);
    expect(sheet.armorClass).toBe(18);
    expect(sheet.inventory.map((i) => i.name)).toContain("Carved Wooden Bird");
    await expect(engine.characters.startDraft(c.id, "u1")).rejects.toThrow(/already has a hero/);
  });

  it("guards the advanced +/- buttons", async () => {
    const engine = createEngine({ db: db.db, worlds, llm: new FakeLlm() });
    const c = await engine.campaigns.create({
      guildId: "g1",
      channelId: "ch2",
      name: "Buttons",
      mode: "ai_dm",
      createdBy: "u9",
    });
    await engine.characters.startDraft(c.id, "u9");
    await engine.characters.updateDraft(c.id, "u9", { op: "mode", mode: "advanced" });
    let v = await engine.characters.updateDraft(c.id, "u9", { op: "ability", ability: "str", delta: 1 });
    expect(v.base.str).toBe(9);
    for (let i = 0; i < 10; i++)
      v = await engine.characters.updateDraft(c.id, "u9", { op: "ability", ability: "str", delta: 1 });
    expect(v.base.str).toBe(15);
    expect(v.canIncrement.str).toBe(false);
    expect(v.pointsRemaining).toBe(18);
  });

  it("rejects unsafe names", async () => {
    const engine = createEngine({ db: db.db, worlds, llm: new FakeLlm() });
    const c = await engine.campaigns.create({
      guildId: "g1",
      channelId: "ch3",
      name: "Names",
      mode: "ai_dm",
      createdBy: "u8",
    });
    await engine.characters.startDraft(c.id, "u8");
    await expect(
      engine.characters.updateDraft(c.id, "u8", { op: "name", name: "My real name is Sam", look: "" }),
    ).rejects.toThrow();
  });

  it("plays a whole campaign from opening to epilogue", async () => {
    const llm = new FakeLlm();
    const engine = createEngine({ db: db.db, worlds, llm });
    const c = await engine.campaigns.create({
      guildId: "g2",
      channelId: "ch4",
      name: "Lights Out",
      mode: "ai_dm",
      createdBy: "host",
    });
    await engine.campaigns.join(c.id, "kid");
    await makeHero(engine, c.id, "host", "shieldheart", "Bram Junior");
    await makeHero(engine, c.id, "kid", "lanternkeeper", "Wren Pebble");

    let view = await engine.turns.openCampaign(c.id, "host");
    expect(view.choices.length).toBeGreaterThanOrEqual(2);
    expect(view.sceneTitle).toBe("The Last Flame");

    let rounds = 0;
    let sawSnibbetMercy = false;
    while (!view.campaignEnded && rounds < 120) {
      rounds += 1;
      const roundId = view.roundId as string;
      for (const user of ["host", "kid"]) {
        const res = await engine.turns.submitAction({
          roundId,
          userId: user,
          kind: "choice",
          choiceIndex: 0,
          interactionId: `${roundId}-${user}`,
        });
        expect(res.ok).toBe(true);
      }
      const next = await engine.turns.resolveRound(roundId);
      expect(next).not.toBeNull();
      view = next as NonNullable<typeof next>;
      if (!sawSnibbetMercy) {
        const loom = await loadLoom(db.db, c.id);
        sawSnibbetMercy = loom.state.threads.some((t) => t.anchor?.id === "snibbet" && t.tag === "mercy");
      }
    }
    expect(view.campaignEnded).toBe(true);
    expect(sawSnibbetMercy).toBe(true);
    expect(rounds).toBeGreaterThan(20);

    const [final] = await db.db.select().from(campaigns).where(eq(campaigns.id, c.id));
    expect(final?.status).toBe("ended");

    // The hidden hand is never written into public history.
    const history = JSON.stringify(await db.db.select().from(turns).where(eq(turns.campaignId, c.id)));
    for (const secret of ["reservedForBeat", "sincerity", "ripenSpan", "masterSeed", "Keep it small"]) {
      expect(history).not.toContain(secret);
    }
    const loom = await loadLoom(db.db, c.id);
    expect(loom.state.deeds.length).toBeGreaterThan(5);
    const evs = await db.db.select().from(events).where(eq(events.campaignId, c.id));
    expect(evs.length).toBeGreaterThan(rounds);

    // The narrator never receives loom state.
    for (const call of llm.calls.filter((x) => x.task === "narrator")) {
      expect(call.user).not.toMatch(/reservedForBeat|sincerity|ripenSpan|grace/);
    }
  }, 120_000);

  it("keeps playing when no AI is configured", async () => {
    const engine = createEngine({ db: db.db, worlds, llm: new UnconfiguredLlm() });
    const c = await engine.campaigns.create({
      guildId: "g3",
      channelId: "ch5",
      name: "Offline",
      mode: "ai_dm",
      createdBy: "solo",
    });
    await makeHero(engine, c.id, "solo", "scout", "Quill Swift");
    const view = await engine.turns.openCampaign(c.id, "solo");
    expect(view.fallback).toBe(true);
    expect(view.narration).toContain("The Last Flame");
    const res = await engine.turns.submitAction({
      roundId: view.roundId as string,
      userId: "solo",
      kind: "freeform",
      text: "I search the square for footprints",
    });
    expect(res.ok).toBe(true);
    const next = await engine.turns.resolveRound(view.roundId as string);
    expect(next?.narration.length).toBeGreaterThan(10);
  });

  it("blocks unsafe text and deflects questions about hidden luck", async () => {
    const engine = createEngine({ db: db.db, worlds, llm: new FakeLlm() });
    const c = await engine.campaigns.create({
      guildId: "g4",
      channelId: "ch6",
      name: "Safety",
      mode: "ai_dm",
      createdBy: "p1",
    });
    await makeHero(engine, c.id, "p1", "songspinner", "Lark Melody");
    const view = await engine.turns.openCampaign(c.id, "p1");
    const roundId = view.roundId as string;
    const blocked = await engine.turns.submitAction({
      roundId,
      userId: "p1",
      kind: "freeform",
      text: "I'm 9 years old and I live in Springfield",
    });
    expect(blocked).toMatchObject({ ok: false });
    const meta = await engine.turns.submitAction({
      roundId,
      userId: "p1",
      kind: "freeform",
      text: "what's my hidden luck score?",
    });
    expect(meta).toHaveProperty("deflection");
    const logged = await db.db.select().from(safetyEvents).where(eq(safetyEvents.campaignId, c.id));
    expect(logged).toHaveLength(1);
    expect(JSON.stringify(logged)).not.toContain("Springfield");
  });

  it("lets only one resolver win a round", async () => {
    const engine = createEngine({ db: db.db, worlds, llm: new FakeLlm() });
    const c = await engine.campaigns.create({
      guildId: "g5",
      channelId: "ch7",
      name: "Race",
      mode: "ai_dm",
      createdBy: "r1",
    });
    await makeHero(engine, c.id, "r1", "wayfarer", "Fern Arrow");
    const view = await engine.turns.openCampaign(c.id, "r1");
    await engine.turns.submitAction({ roundId: view.roundId as string, userId: "r1", kind: "pass" });
    const results = await Promise.all([
      engine.turns.resolveRound(view.roundId as string),
      engine.turns.resolveRound(view.roundId as string),
    ]);
    expect(results.filter(Boolean)).toHaveLength(1);
  });

  it("purges a campaign completely", async () => {
    const engine = createEngine({ db: db.db, worlds, llm: new FakeLlm() });
    const c = await engine.campaigns.create({
      guildId: "g6",
      channelId: "ch8",
      name: "Gone",
      mode: "ai_dm",
      createdBy: "z1",
    });
    await makeHero(engine, c.id, "z1", "lorewright", "Ink Wells");
    await engine.turns.openCampaign(c.id, "z1");
    await expect(engine.campaigns.purge(c.id, "someone-else")).rejects.toThrow();
    await engine.campaigns.purge(c.id, "z1");
    expect(await engine.campaigns.get(c.id)).toBeNull();
  });
});
