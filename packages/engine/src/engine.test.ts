import { campaigns, chapterSummaries, characters, events, safetyEvents, storyPlans, turns } from "@dq/db";
import { campaignLoom } from "@dq/db/loom";
import { createTestDb, TEST_DATABASE_URL } from "@dq/db/testing";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { serverGameDefaults } from "./campaign-service";
import { createEngine, createLogger, type Engine } from "./index";
import { loadLoom } from "./loom-store";
import { describeTimer, paceOf, reminderAt, whenTimeIsUp } from "./pace";
import { planChapter } from "./planner";
import { asStory } from "./story-state";
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

describe("pace", () => {
  it("reads older campaigns sensibly and fills in defaults", () => {
    expect(paceOf({})).toEqual({ pace: "live", roundTimerSeconds: 180, pingPlayers: false });
    expect(paceOf({ roundTimerSeconds: 86_400 })).toEqual({
      pace: "post",
      roundTimerSeconds: 86_400,
      pingPlayers: true,
    });
    expect(paceOf({ roundTimerSeconds: 0 })).toMatchObject({ pace: "post", roundTimerSeconds: 0 });
    expect(paceOf({ roundTimerSeconds: 5 })).toMatchObject({ roundTimerSeconds: 180 });
  });

  it("reminds once before a long deadline, daily when there is none, and never at game night", () => {
    const opened = new Date("2026-01-01T00:00:00Z");
    const day = { createdAt: opened, deadlineAt: new Date("2026-01-02T00:00:00Z"), remindedAt: null };
    const post = paceOf({ pace: "post", roundTimerSeconds: 86_400 });
    expect(reminderAt(post, day)?.toISOString()).toBe("2026-01-01T18:00:00.000Z");
    expect(reminderAt(post, { ...day, remindedAt: new Date("2026-01-01T18:00:00Z") })).toBeNull();
    const week = paceOf({ pace: "post", roundTimerSeconds: 604_800 });
    expect(reminderAt(week, { ...day, deadlineAt: new Date("2026-01-08T00:00:00Z") })?.toISOString()).toBe(
      "2026-01-07T12:00:00.000Z",
    );
    const open = paceOf({ pace: "post", roundTimerSeconds: 0 });
    expect(reminderAt(open, { createdAt: opened, deadlineAt: null, remindedAt: null })?.toISOString()).toBe(
      "2026-01-02T00:00:00.000Z",
    );
    expect(reminderAt(paceOf({ pace: "live" }), day)).toBeNull();
    expect(describeTimer(0)).toBe("no time limit");
    // Time's up: go on if anyone chose; if nobody did, play by post tries again and game night waits.
    expect(whenTimeIsUp(post, 3, 1)).toBe("resolve");
    expect(whenTimeIsUp(post, 3, 3)).toBe("extend");
    expect(whenTimeIsUp(paceOf({ pace: "live" }), 3, 3)).toBe("wait");
    expect(whenTimeIsUp(open, 3, 3)).toBe("wait");
    expect(describeTimer(172_800)).toBe("2 days");
  });
});

describe("server defaults for new campaigns", () => {
  it("takes valid values from the setup page and ignores anything else", () => {
    expect(
      serverGameDefaults({
        gameDefaults: {
          imagePolicy: "off",
          epilogueStyle: "explicit",
          roundTimerSeconds: 43200,
          loomMode: "off",
        },
      }),
    ).toEqual({ imagePolicy: "off", epilogueStyle: "explicit", roundTimerSeconds: 43200, loomMode: "off" });
    expect(
      serverGameDefaults({
        gameDefaults: { imagePolicy: "always", roundTimerSeconds: 5, contentLevel: "adventurous" },
      }),
    ).toEqual({});
    expect(serverGameDefaults(undefined)).toEqual({});
  });

  it("lets the turn timer and pings follow the pace unless the server chose them", () => {
    const pick = (gameDefaults: Record<string, unknown>) => {
      const d = serverGameDefaults({ gameDefaults });
      return [d.pace, d.roundTimerSeconds, d.pingPlayers];
    };
    expect(pick({ pace: "post" })).toEqual(["post", 86_400, true]);
    expect(pick({ pace: "live" })).toEqual(["live", 180, false]);
    expect(pick({ pace: "post", roundTimerSeconds: 0, pingPlayers: false })).toEqual(["post", 0, false]);
    expect(pick({ pace: "post", roundTimerSeconds: 259_200 })).toEqual(["post", 259_200, true]);
    // Saved by the older setup page, which kept "3 minutes" when the pace changed to play by post.
    expect(pick({ pace: "post", roundTimerSeconds: 180, pingPlayers: false })).toEqual([
      "post",
      86_400,
      false,
    ]);
    expect(pick({ pace: "live", roundTimerSeconds: 86_400 })).toEqual(["live", 180, false]);
  });
});

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
    let fightRounds = 0;
    let sawMercyChoice = false;
    while (!view.campaignEnded && rounds < 160) {
      rounds += 1;
      const roundId = view.roundId as string;
      const fighting = view.combat?.phase === "fighting";
      if (fighting) {
        fightRounds += 1;
        expect(view.choices).toEqual([]);
        expect(view.combat?.foes.length).toBeGreaterThan(0);
      }
      if (view.choices[0]?.label.startsWith("Let ")) sawMercyChoice = true;
      for (const user of ["host", "kid"]) {
        const options = fighting ? await engine.turns.combatOptions(roundId, user) : null;
        if (fighting) expect(options?.foes.length).toBeGreaterThan(0);
        const res = await engine.turns.submitAction(
          fighting
            ? {
                roundId,
                userId: user,
                kind: "combat",
                action: { kind: "attack", targetId: options?.foes[0]?.id },
                interactionId: `${roundId}-${user}`,
              }
            : { roundId, userId: user, kind: "choice", choiceIndex: 0, interactionId: `${roundId}-${user}` },
        );
        expect(res.ok).toBe(true);
      }
      const next = await engine.turns.resolveRound(roundId);
      expect(next?.kind).toBe("turn");
      view = (next as { kind: "turn"; view: typeof view }).view;
      if (!sawSnibbetMercy) {
        const loom = await loadLoom(db.db, c.id);
        sawSnibbetMercy = loom.state.threads.some((t) => t.anchor?.id === "snibbet" && t.tag === "mercy");
      }
    }
    expect(view.campaignEnded).toBe(true);
    expect(sawSnibbetMercy).toBe(true);
    expect(rounds).toBeGreaterThan(20);
    // Both Act I fights were fought round by round, and HP never went out of bounds.
    expect(fightRounds).toBeGreaterThanOrEqual(2);
    for (const p of await db.db.select().from(characters).where(eq(characters.campaignId, c.id))) {
      expect(p.hp).toBeGreaterThanOrEqual(0);
      expect(p.hp).toBeLessThanOrEqual(p.hpMax);
    }
    void sawMercyChoice;

    const [final] = await db.db.select().from(campaigns).where(eq(campaigns.id, c.id));
    expect(final?.status).toBe("ended");

    // The hidden hand is never written into public history.
    const history = JSON.stringify(await db.db.select().from(turns).where(eq(turns.campaignId, c.id)));
    for (const secret of ["reservedForBeat", "sincerity", "ripenSpan", "masterSeed", "Keep it small"]) {
      expect(history).not.toContain(secret);
    }
    // Each new chapter is tailored by the planner, and the storyteller sees its notes.
    const plans = await db.db.select().from(storyPlans).where(eq(storyPlans.campaignId, c.id));
    expect(plans.length).toBeGreaterThanOrEqual(6);
    expect(
      llm.calls
        .filter((x) => x.task === "director")
        .every((x) => !/reservedForBeat|ripen|weight|thread/i.test(x.user)),
    ).toBe(true);
    expect(
      llm.calls.some(
        (x) => x.task === "narrator" && x.user.includes("Story notes (weave these in naturally)"),
      ),
    ).toBe(true);
    // Every chapter gets a recap, which the storyteller and the journal both use.
    const recaps = await db.db.select().from(chapterSummaries).where(eq(chapterSummaries.campaignId, c.id));
    expect(recaps.length).toBeGreaterThanOrEqual(7);
    expect(llm.calls.some((x) => x.task === "narrator" && x.user.includes("## The story so far"))).toBe(true);
    expect((await engine.campaigns.journal(c.id)).chapters.length).toBeGreaterThan(3);
    const loom = await loadLoom(db.db, c.id);
    expect(loom.state.deeds.length).toBeGreaterThan(5);
    const evs = await db.db.select().from(events).where(eq(events.campaignId, c.id));
    expect(evs.length).toBeGreaterThan(rounds);

    // The narrator never receives loom state.
    for (const call of llm.calls.filter((x) => x.task === "narrator")) {
      expect(call.user).not.toMatch(/reservedForBeat|sincerity|ripenSpan|grace/);
    }
  }, 120_000);

  it("fights round by round, then lets the heroes choose mercy", async () => {
    const llm = new FakeLlm();
    const engine = createEngine({ db: db.db, worlds, llm });
    const c = await engine.campaigns.create({
      guildId: "g-fight",
      channelId: "ch-fight",
      name: "Gloam in the Garden",
      mode: "ai_dm",
      createdBy: "a",
    });
    // A fixed seed keeps the dice the same every run.
    await db.db
      .update(campaignLoom)
      .set({ masterSeed: "fight-test-seed" })
      .where(eq(campaignLoom.campaignId, c.id));
    await engine.campaigns.join(c.id, "b");
    await makeHero(engine, c.id, "a", "shieldheart", "Bram Stout");
    await makeHero(engine, c.id, "b", "lanternkeeper", "Wren Pebble");
    let view = await engine.turns.openCampaign(c.id, "a");
    const act = async (user: string, input: Record<string, unknown>) =>
      engine.turns.submitAction({ roundId: view.roundId as string, userId: user, ...input } as never);
    const next = async () => {
      const r = await engine.turns.resolveRound(view.roundId as string);
      view = (r as { kind: "turn"; view: typeof view }).view;
    };

    // Walk the story to the first fight.
    for (let i = 0; i < 20 && view.combat?.phase !== "fighting"; i++) {
      expect(await act("a", { kind: "combat", action: { kind: "defend" } })).toMatchObject({ ok: false });
      await act("a", { kind: "choice", choiceIndex: 0 });
      await act("b", { kind: "choice", choiceIndex: 0 });
      await next();
    }
    expect(view.combat?.phase).toBe("fighting");
    expect(view.sceneTitle).toBe("Gloam in the Garden");
    expect(view.combat?.foes.map((f) => f.name).join(", ")).toMatch(/Gloom Mite.*Gloam Skulker/);
    expect(view.choices).toEqual([]);
    expect(await act("a", { kind: "choice", choiceIndex: 0 })).toMatchObject({ ok: false });
    expect(await act("a", { kind: "combat", action: { kind: "fly-away" } })).toMatchObject({ ok: false });

    const callsBeforeFight = llm.calls.length;
    const wren = await engine.turns.combatOptions(view.roundId as string, "b");
    expect(wren?.spells.map((x) => x.id)).toEqual(
      expect.arrayContaining(["sacred-flame", "healing-word", "bless"]),
    );
    expect(wren?.attacks.length).toBeGreaterThan(0);

    for (let i = 0; i < 10 && view.combat?.phase === "fighting"; i++) {
      const opts = await engine.turns.combatOptions(view.roundId as string, "a");
      const target = opts?.foes.find((f) => f.name.includes("Skulker"))?.id ?? opts?.foes[0]?.id;
      expect((await act("a", { kind: "combat", action: { kind: "attack", targetId: target } })).ok).toBe(
        true,
      );
      expect(
        (
          await act("b", {
            kind: "combat",
            action: { kind: "cast", spellId: "sacred-flame", targetId: target },
          })
        ).ok,
      ).toBe(true);
      await next();
      const heroes = await db.db.select().from(characters).where(eq(characters.campaignId, c.id));
      for (const h of heroes) {
        const shown = view.combat?.heroes.find((x) => x.id === h.id);
        if (shown) expect(shown.hp).toBe(h.hp);
      }
    }

    expect(view.combat?.phase).toBe("aftermath");
    // The storyteller is told what the dice decided.
    const fightPrompts = llm.calls.slice(callsBeforeFight).filter((x) => x.task === "narrator");
    expect(fightPrompts.every((x) => x.user.includes("## The fight, round"))).toBe(true);
    expect(fightPrompts.at(-1)?.user).toMatch(/Gloam Skulker is beaten and waiting/);
    {
      // The beaten Gloam Skulker waits; letting it go is mercy toward the Gloam Host.
      expect(view.choices[0]?.label).toMatch(/^Let .* go free$/);
      await act("a", { kind: "choice", choiceIndex: 0 });
      await act("b", { kind: "choice", choiceIndex: 0 });
      await next();
      const loom = await loadLoom(db.db, c.id);
      const mercy = loom.state.threads.find((t) => t.tag === "mercy" && t.anchor?.faction === "gloam-host");
      expect(mercy?.anchor?.name).toMatch(/Gloam Skulker/);
      expect(loom.state.bearers.some((b) => b.npcId.startsWith("foe-"))).toBe(false);
    }
    // The garden fight is over (the road ahead may hold a new one).
    expect(view.sceneTitle).not.toBe("Gloam in the Garden");
  });

  it("switches pace, stops the clock while paused, and remembers the server's rooms", async () => {
    const engine = createEngine({ db: db.db, worlds, llm: new FakeLlm() });
    const c = await engine.campaigns.create({
      guildId: "g-pace",
      channelId: "table-1",
      name: "Slow and Steady",
      mode: "ai_dm",
      createdBy: "host",
      settings: { pace: "post", roundTimerSeconds: 86_400, pingPlayers: true },
    });
    await engine.campaigns.setThreads(c.id, "thread-1", null);
    await engine.campaigns.join(c.id, "kid");
    await makeHero(engine, c.id, "kid", "scout", "Nib Quickfoot");
    expect(await engine.campaigns.pace(c.id)).toEqual({
      pace: "post",
      roundTimerSeconds: 86_400,
      pingPlayers: true,
    });
    await expect(engine.campaigns.setPace(c.id, "kid", { pace: "live" })).rejects.toThrow(/not host/);
    await expect(engine.campaigns.setPace(c.id, "host", { roundTimerSeconds: 17 })).rejects.toThrow(
      /bad timer/,
    );
    expect(await engine.campaigns.setPace(c.id, "host", { pace: "live" })).toEqual({
      pace: "live",
      roundTimerSeconds: 180,
      pingPlayers: false,
    });
    expect(await engine.campaigns.setPace(c.id, "host", { pace: "post", roundTimerSeconds: 0 })).toEqual({
      pace: "post",
      roundTimerSeconds: 0,
      pingPlayers: true,
    });

    const view = await engine.turns.openCampaign(c.id, "host");
    const roundId = view.roundId as string;
    expect(await engine.turns.waitingOnPlayers(roundId, c.id)).toEqual([
      { userId: "kid", name: "Nib Quickfoot" },
    ]);
    // Paused: a deadline that fires anyway moves nothing on.
    await engine.campaigns.setStatus(c.id, "host", "paused");
    expect(await engine.turns.resolveRound(roundId)).toBeNull();
    expect((await engine.turns.getRound(roundId))?.status).toBe("collecting");
    expect(await engine.turns.openRounds().then((r) => r.filter((x) => x.campaign.id === c.id))).toEqual([]);
    await engine.campaigns.setStatus(c.id, "host", "active");
    const deadline = new Date(Date.now() + 3_600_000);
    await engine.turns.setRoundDeadline(roundId, deadline);
    await engine.turns.markReminded(roundId);
    const open = (await engine.turns.openRounds()).find((x) => x.round.id === roundId);
    expect(open?.round.deadlineAt?.getTime()).toBe(deadline.getTime());
    expect(open?.round.remindedAt).not.toBeNull();
    await engine.turns.setRoundDeadline(roundId, null);
    expect((await engine.turns.getRound(roundId))?.remindedAt).toBeNull();
    expect((await engine.turns.resolveRound(roundId))?.kind).toBe("turn");
    expect((await engine.campaigns.status(c.id)).pace.pace).toBe("post");

    // Rooms are per server, and a room can host only one campaign played right in it.
    expect(await engine.campaigns.rooms("g-pace")).toEqual({});
    await engine.campaigns.setRooms(
      { id: "g-pace", name: "Pace Club" },
      { table: { id: "table-1", name: "quest-table" } },
    );
    expect(
      await engine.campaigns.setRooms(
        { id: "g-pace", name: "Pace Club" },
        { dm: { id: "dm-1", name: "dm-screen" } },
      ),
    ).toEqual({ table: { id: "table-1", name: "quest-table" }, dm: { id: "dm-1", name: "dm-screen" } });
    expect(await engine.campaigns.runningIn("thread-1")).toMatchObject({ id: c.id });
    expect(await engine.campaigns.runningIn("elsewhere")).toBeNull();
    const later = await engine.campaigns.create({
      guildId: "g-pace",
      channelId: "table-1",
      name: "Next",
      mode: "ai_dm",
      createdBy: "host",
    });
    await engine.campaigns.setThreads(later.id, "thread-1", null);
    await engine.campaigns.setStatus(c.id, "host", "ended");
    expect((await engine.campaigns.findByThread("thread-1"))?.id).toBe(later.id);
  });

  it("lets a guardian watch over the table without seeing what was typed", async () => {
    const engine = createEngine({ db: db.db, worlds, llm: new FakeLlm() });
    const c = await engine.campaigns.create({
      guildId: "g-fam",
      channelId: "ch-fam",
      name: "Family",
      mode: "ai_dm",
      createdBy: "host",
    });
    await engine.campaigns.join(c.id, "kid");
    await engine.campaigns.join(c.id, "mum", "guardian");
    await makeHero(engine, c.id, "kid", "scout", "Nib Quickfoot");
    const view = await engine.turns.openCampaign(c.id, "host");
    const blocked = await engine.turns.submitAction({
      roundId: view.roundId as string,
      userId: "kid",
      kind: "freeform",
      text: "this is sh1t",
    });
    expect(blocked.ok).toBe(false);
    await engine.turns.xcard(c.id, "kid");

    const log = await engine.campaigns.safetyLog(c.id, "mum");
    expect(log).toHaveLength(2);
    expect(log.find((e) => e.stage === "input")).toMatchObject({
      userId: "kid",
      categories: ["banned_word"],
    });
    expect(log.find((e) => e.stage === "xcard")?.userId).toBeNull();
    expect(JSON.stringify(log)).not.toContain("sh1t");
    await expect(engine.campaigns.safetyLog(c.id, "kid")).rejects.toThrow(/not guardian/);

    await engine.campaigns.setStatus(c.id, "mum", "paused");
    expect((await engine.campaigns.require(c.id)).status).toBe("paused");
    await expect(engine.campaigns.setStatus(c.id, "mum", "ended")).rejects.toThrow(/not host/);
    await expect(engine.campaigns.setStatus(c.id, "kid", "active")).rejects.toThrow();
    await engine.campaigns.setStatus(c.id, "mum", "active");
  });

  it("throws away planner notes that would give the game away", async () => {
    const llm = new FakeLlm({
      director: () => ({
        theme: "Karma is coming for them.",
        beats: [
          {
            beatId: "ch2-the-fork-in-the-road",
            note: "Their hidden luck score is high, so fate helps them.",
            callback: null,
            featured: [],
          },
          {
            beatId: "ch2-shadow-wolves",
            note: "Remember how brave the heroes were in the garden.",
            callback: null,
            featured: ["nobody-real", "hattie-wick"],
          },
        ],
      }),
    });
    const { index } = worlds.get("lanternreach");
    const c = await createEngine({ db: db.db, worlds, llm }).campaigns.create({
      guildId: "g-plan",
      channelId: "ch-plan",
      name: "Plans",
      mode: "ai_dm",
      createdBy: "p",
    });
    const plan = await planChapter({
      db: db.db,
      llm,
      index,
      log: { info: () => {}, warn: () => {}, error: () => {} },
      campaignId: c.id,
      guildId: "g-plan",
      chapter: 2,
      story: asStory(c.story),
      contentLevel: "gentle",
    });
    expect(plan?.beats["ch2-the-fork-in-the-road"]).toBeUndefined();
    expect(plan?.beats["ch2-shadow-wolves"]).toEqual({
      note: "Remember how brave the heroes were in the garden.",
      featured: ["hattie-wick"],
    });
    expect(plan?.theme).not.toMatch(/karma/i);
  });

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
    expect(next?.kind === "turn" && next.view.narration.length).toBeGreaterThan(10);
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

  it("in Assist mode, turns wait for the DM, who can redo, edit and approve them", async () => {
    const engine = createEngine({ db: db.db, worlds, llm: new FakeLlm() });
    const c = await engine.campaigns.create({
      guildId: "g7",
      channelId: "ch9",
      name: "Assisted",
      mode: "assist",
      createdBy: "dm1",
      dmUserId: "dm1",
    });
    await engine.campaigns.join(c.id, "kid1");
    await makeHero(engine, c.id, "kid1", "shieldheart", "Tumbleweed");
    const opening = await engine.turns.openCampaign(c.id, "dm1");
    await engine.turns.submitAction({
      roundId: opening.roundId as string,
      userId: "kid1",
      kind: "choice",
      choiceIndex: 0,
    });
    const res = await engine.turns.resolveRound(opening.roundId as string);
    expect(res?.kind).toBe("draft");
    const draft = (res as { kind: "draft"; draft: import("./views").DmDraft }).draft;
    expect(draft.choices.length).toBeGreaterThan(0);

    // Players can't act while the DM decides, and only the DM can decide.
    expect(await engine.turns.resolveRound(opening.roundId as string)).toBeNull();
    await expect(engine.turns.approveDraft(draft.approvalId, "kid1")).rejects.toThrow();

    const redone = await engine.turns.regenerateDraft(draft.approvalId, "dm1", "Make the geese funnier.");
    expect(redone.approvalId).toBe(draft.approvalId);
    const view = await engine.turns.approveDraft(draft.approvalId, "dm1", {
      narration: "The geese honk in perfect harmony, and everyone laughs.",
      choices: ["Bow to the geese", "Ask Hattie what's going on"],
    });
    expect(view.narration).toContain("geese honk");
    expect(view.choices.map((x) => x.label)).toEqual(["Bow to the geese", "Ask Hattie what's going on"]);
    await expect(engine.turns.approveDraft(draft.approvalId, "dm1")).rejects.toThrow(/decided/);

    // Committed history still holds no hidden state.
    const history = JSON.stringify(await db.db.select().from(turns).where(eq(turns.campaignId, c.id)));
    expect(history).not.toContain("sincerity");
  });

  it("gives the Assist DM loom tools: view, plant, switch off", async () => {
    const engine = createEngine({ db: db.db, worlds, llm: new FakeLlm() });
    const c = await engine.campaigns.create({
      guildId: "g8",
      channelId: "ch10",
      name: "Loom tools",
      mode: "assist",
      createdBy: "dm2",
      dmUserId: "dm2",
    });
    await expect(engine.dm.loomView(c.id, "someone")).rejects.toThrow();
    await engine.dm.plant(c.id, "dm2", {
      tag: "mercy",
      npcId: "snibbet",
      summary: "spared Snibbet at the mill",
      size: "large",
    });
    const view = await engine.dm.loomView(c.id, "dm2");
    expect(view.threads[0]).toMatchObject({
      deed: "spared Snibbet at the mill",
      anchor: "Snibbet",
      reservedForFinale: true,
    });
    expect(view.bearers).toEqual([{ name: "Snibbet", presence: "shadowing" }]);
    await engine.dm.setLoomMode(c.id, "dm2", "off");
    expect((await engine.campaigns.get(c.id))?.settings).toMatchObject({ loomMode: "off" });
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

describe("logs", () => {
  it("are JSON lines with secrets redacted", () => {
    const lines: string[] = [];
    const log = createLogger({ format: "json", service: "bot", write: (l) => lines.push(l) });
    log.warn("provider failed with key sk-ant-api03-ABCDEFGHIJKLMNOP", {
      apiKey: "sk-live-123456789",
      headers: { authorization: "Bearer abcdefghijklmnopqrstuvwxyz" },
      detail: "upstream said: invalid x-api-key sk-proj-ZZZZZZZZZZZZZZZZ",
      campaignId: "c-1",
    });
    const entry = JSON.parse(lines[0] as string);
    expect(entry).toMatchObject({ level: "warn", service: "bot", campaignId: "c-1", apiKey: "[redacted]" });
    expect(lines[0]).not.toMatch(/sk-(ant|live|proj)|abcdefghijklmnop/);
  });
});
