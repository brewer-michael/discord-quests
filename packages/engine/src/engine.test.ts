import type { NarratorOutput } from "@dq/core/narration";
import {
  campaigns,
  chapterSummaries,
  characters,
  events,
  inventoryItems,
  safetyEvents,
  storyPlans,
  turns,
} from "@dq/db";
import { campaignLoom } from "@dq/db/loom";
import { createTestDb, TEST_DATABASE_URL } from "@dq/db/testing";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { serverGameDefaults } from "./campaign-service";
import { createEngine, createLogger, type Engine, seededDice, withLogContext } from "./index";
import { loadLoom } from "./loom-store";
import { describeTimer, paceOf, reminderAt, whenTimeIsUp } from "./pace";
import { planChapter } from "./planner";
import { asStory } from "./story-state";
import { FakeLlm } from "./testing";
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

  it("story settings: who may change them, Epic's guardian, and checked words", async () => {
    const engine = createEngine({ db: db.db, worlds, llm: new FakeLlm() });
    const family = await engine.campaigns.create({
      guildId: "g-story",
      channelId: "ch-story",
      name: "Story Test",
      mode: "ai_dm",
      createdBy: "host",
    });
    // New campaigns start at Classic with the classic storybook voice.
    const fresh = await engine.campaigns.storyFor(family.id);
    expect([fresh.profile.intensity, fresh.profile.voice, fresh.story.intensity]).toEqual([
      "classic",
      "classic",
      "classic",
    ]);

    // Only the host, the DM or a guardian may change them, and on a family campaign only a guardian picks Epic.
    await expect(engine.campaigns.setStory(family.id, "stranger", { humor: "rare" })).rejects.toMatchObject({
      message: "not host",
    });
    await expect(engine.campaigns.setStory(family.id, "host", { intensity: "epic" })).rejects.toMatchObject({
      message: "needs guardian",
    });
    await engine.campaigns.join(family.id, "grownup", "guardian");
    const epic = await engine.campaigns.setStory(family.id, "grownup", { intensity: "epic" });
    expect([epic.profile.intensity, epic.story.intensity, epic.capped]).toEqual(["epic", "epic", false]);
    // Once the guardian leaves, the story is told at Classic until one returns.
    await engine.campaigns.leave(family.id, "grownup");
    const capped = await engine.campaigns.storyFor(family.id);
    expect([capped.profile.intensity, capped.story.intensity, capped.capped]).toEqual([
      "epic",
      "classic",
      true,
    ]);
    // The host can still change other things, and lower the intensity.
    const lighter = await engine.campaigns.setStory(family.id, "host", {
      intensity: "light",
      humor: "plenty",
    });
    expect([lighter.story.intensity, lighter.profile.humor]).toEqual(["light", "plenty"]);

    // What the table types is checked: the premise like player text (at the new intensity), topics only for
    // personal details, since leaving out "blood" has to name it.
    await expect(
      engine.campaigns.setStory(family.id, "host", { premise: "A dragon killed the king." }),
    ).rejects.toMatchObject({ message: "unsafe story text" });
    const classic = await engine.campaigns.setStory(family.id, "host", {
      intensity: "classic",
      premise: "A dragon killed the king, and his daughter wants the mountain back.",
      lines: ["blood", "spiders"],
      veils: ["drowning"],
    });
    expect(classic.story.premise).toContain("dragon");
    expect(classic.story.lines).toEqual(["blood", "spiders"]);
    await expect(
      engine.campaigns.setStory(family.id, "host", { lines: ["write to me at kid@example.com"] }),
    ).rejects.toMatchObject({ message: "unsafe story text" });

    // Teen campaigns can choose Epic without a guardian.
    const teen = await engine.campaigns.create({
      guildId: "g-story",
      channelId: "ch-story-2",
      name: "Teen Story",
      mode: "ai_dm",
      createdBy: "host",
      settings: { audience: "teen" },
    });
    expect((await engine.campaigns.setStory(teen.id, "host", { intensity: "epic" })).story.intensity).toBe(
      "epic",
    );
  });

  it("hero picture cards: from the player's words when given, from the world otherwise, saved and reused", async () => {
    let card =
      "a stout little grown-up called Pip Thistle with freckles, a big grin and a dented round shield";
    const llm = new FakeLlm({
      summarizer: (call) => (call.schemaName === "appearance" ? { appearance: card } : new Error("not here")),
    });
    const engine = createEngine({ db: db.db, worlds, llm });
    const c = await engine.campaigns.create({
      guildId: "g-look",
      channelId: "ch-look",
      name: "Look Test",
      mode: "ai_dm",
      createdBy: "u1",
    });
    await makeHero(engine, c.id, "u1", "shieldheart", "Pip Thistle");
    const look = await engine.campaigns.pictureLook(c.id);
    // The player's own words, without the hero's name; written once and saved.
    expect(look.heroes).toEqual([
      "a stout little grown-up with freckles, a big grin and a dented round shield",
    ]);
    expect(look.style).toContain("book illustration");
    expect([look.cartoonish, look.childrenOk, look.avoid]).toEqual([false, false, []]);
    card = "something else entirely";
    expect((await engine.campaigns.pictureLook(c.id)).heroes[0]).toContain("freckles");

    // /character describe rewrites the card; an unsafe card falls back to the world's own words.
    card = "a tall, grey-cloaked woman with a blood-red scarf";
    const described = await engine.characters.describe(c.id, "u1", "Tall now, with a grey cloak.");
    expect(described.look).toBe("Tall now, with a grey cloak.");
    expect(described.appearance).toContain("grown-up of the little folk");
    expect(described.appearance).toContain("chain mail");
    expect((await engine.campaigns.pictureLook(c.id)).heroes[0]).toBe(described.appearance);
    await expect(engine.characters.describe(c.id, "u1", "Covered in blood.")).rejects.toMatchObject({
      message: "unsafe look",
    });
    await expect(engine.characters.describe(c.id, "nobody", "Tall.")).rejects.toMatchObject({
      message: "no hero",
    });
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
    // Seeded dice, so this fight plays out the same every run.
    const engine = createEngine({ db: db.db, worlds, llm, dice: seededDice });
    const c = await engine.campaigns.create({
      guildId: "g-fight",
      channelId: "ch-fight",
      name: "Gloam in the Garden",
      mode: "ai_dm",
      createdBy: "a",
    });
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
      telling: { intensity: "light", voice: "fireside", humor: "plenty", premise: "", lines: [], veils: [] },
    });
    expect(plan?.beats["ch2-the-fork-in-the-road"]).toBeUndefined();
    expect(plan?.beats["ch2-shadow-wolves"]).toEqual({
      note: "Remember how brave the heroes were in the garden.",
      featured: ["hattie-wick"],
    });
    expect(plan?.theme).not.toMatch(/karma/i);
  });

  it("hands a turn the AI can't tell to a person in the DM room, with everything they need", async () => {
    // The storyteller is down until it comes back below; the action reader works.
    let down = true;
    const told: NarratorOutput = {
      narration: "Footprints in the soot lead from the square towards the lamp-house.",
      npcLines: [],
      proposedDeltas: [],
      choices: [
        {
          label: "Follow the footprints",
          intent: {
            approach: "follow",
            skill: "survival",
            difficulty: "medium",
            deed: "none",
            targetRef: null,
            shortcutId: null,
          },
        },
        {
          label: "Ask Hattie about them",
          intent: {
            approach: "ask",
            skill: "none",
            difficulty: "easy",
            deed: "none",
            targetRef: null,
            shortcutId: null,
          },
        },
      ],
      sceneOver: false,
      imageBrief: null,
      significance: "minor",
    };
    const llm = new FakeLlm({ narrator: () => (down ? new Error("service down") : told) });
    const engine = createEngine({ db: db.db, worlds, llm });
    const c = await engine.campaigns.create({
      guildId: "g3",
      channelId: "ch5",
      name: "Handed over",
      mode: "ai_dm",
      createdBy: "solo",
    });
    await engine.campaigns.join(c.id, "gran", "guardian");
    await makeHero(engine, c.id, "solo", "scout", "Quill Swift");

    // The opening: nothing is made up; it waits for a person, and the adventure starts when they've told it.
    const started = await engine.turns.startCampaign(c.id, "solo");
    if (started.kind !== "draft") throw new Error("expected the opening to be handed over");
    const opening = started.draft;
    expect(opening.narration).toBe("");
    expect(opening.handoff?.reasons.join(" ")).toMatch(/returned an error.*service down/);
    expect(opening.handoff?.scene.title).toBe("The Last Flame");
    expect((await engine.campaigns.require(c.id)).status).toBe("setup");
    await expect(
      engine.turns.approveDraft(opening.approvalId, "stranger", { narration: "Hello there, everyone." }),
    ).rejects.toMatchObject({ userMessage: expect.stringMatching(/host, the DM or a guardian/) });
    await expect(engine.turns.approveDraft(opening.approvalId, "solo")).rejects.toMatchObject({
      userMessage: expect.stringMatching(/Write what happens first/),
    });
    const view = await engine.turns.approveDraft(opening.approvalId, "solo", {
      narration: "Lanterns gutter all over Hearthmoor as the heroes gather in the square.",
      choices: ["Look for the lamplighter", "Search the square"],
    });
    expect(view.narration).toContain("Lanterns gutter");
    expect(view.choices.map((x) => x.label)).toEqual(["Look for the lamplighter", "Search the square"]);
    expect((await engine.campaigns.require(c.id)).status).toBe("active");

    // A turn: the dice are rolled and on the draft with what's settled, and nothing moves until it's told.
    await engine.turns.submitAction({
      roundId: view.roundId as string,
      userId: "solo",
      kind: "freeform",
      text: "I search the square for footprints",
    });
    const next = await engine.turns.resolveRound(view.roundId as string);
    if (next?.kind !== "draft") throw new Error("expected the turn to be handed over");
    expect(next.draft.actions).toEqual([expect.stringMatching(/search/)]);
    expect(next.draft.rolls.map((r) => r.label)).toEqual(["Investigation"]);
    expect(next.draft.handoff?.decisions).toContain("The heroes stay in this scene.");
    expect(next.draft.handoff?.scene.goals.length).toBeGreaterThan(0);
    expect((await engine.campaigns.require(c.id)).turnSeq).toBe(1);

    // Once the storyteller is back, asking again fills the draft in; a guardian can send it.
    down = false;
    const again = await engine.turns.regenerateDraft(next.draft.approvalId, "gran", "");
    expect(again.handoff).toBeNull();
    const sent = await engine.turns.approveDraft(next.draft.approvalId, "gran");
    expect(sent.narration).toContain("Footprints in the soot");
    expect((await engine.campaigns.require(c.id)).turnSeq).toBe(2);
  });

  it("never guesses at what a player typed when the action reader can't read it", async () => {
    const engine = createEngine({
      db: db.db,
      worlds,
      llm: new FakeLlm({ intent: () => new Error("reader down") }),
    });
    const c = await engine.campaigns.create({
      guildId: "g3b",
      channelId: "ch5b",
      name: "Unread",
      mode: "ai_dm",
      createdBy: "solo",
    });
    await makeHero(engine, c.id, "solo", "scout", "Quill Swift");
    const view = await engine.turns.openCampaign(c.id, "solo");
    await engine.turns.submitAction({
      roundId: view.roundId as string,
      userId: "solo",
      kind: "freeform",
      text: "I climb the bell tower to look around",
    });
    const next = await engine.turns.resolveRound(view.roundId as string);
    if (next?.kind !== "draft") throw new Error("expected the turn to be handed over");
    const reasons = next.draft.handoff?.reasons.join("\n") ?? "";
    expect(reasons).toMatch(/action reader didn't answer.*reader down/);
    expect(reasons).toContain('Not read: Quill Swift tries this: "I climb the bell tower to look around"');
    expect(next.draft.rolls).toEqual([]);
    // Asking the storyteller again doesn't change that: a person has to say what came of it.
    const again = await engine.turns.regenerateDraft(next.draft.approvalId, "solo", "");
    expect(again.handoff?.reasons.join("\n")).toContain("Not read: Quill Swift");
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

  it("spends extra AI calls only where they matter: the reviewer at Epic, the AI safety read at Light", async () => {
    for (const [intensity, audience] of [
      ["light", "family"],
      ["classic", "family"],
      ["epic", "teen"],
    ] as const) {
      const llm = new FakeLlm();
      const engine = createEngine({ db: db.db, worlds, llm });
      const c = await engine.campaigns.create({
        guildId: "g-cost",
        channelId: `ch-cost-${intensity}`,
        name: `Cost ${intensity}`,
        mode: "ai_dm",
        createdBy: `cost-${intensity}`,
        settings: { audience, story: { intensity } as never },
      });
      await makeHero(engine, c.id, `cost-${intensity}`, "scout", "Quill Swift");
      const view = await engine.turns.openCampaign(c.id, `cost-${intensity}`);
      await engine.turns.submitAction({
        roundId: view.roundId as string,
        userId: `cost-${intensity}`,
        kind: "freeform",
        text: "I look around the square",
      });
      const tasks = llm.calls.map((x) => x.task);
      expect(tasks.includes("safety")).toBe(intensity === "light");
      // The opening has no hidden-hand notes, so only an Epic story has it reviewed.
      expect(tasks.includes("judge")).toBe(intensity === "epic");
    }
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

  it("keep token counts, which aren't secrets", () => {
    const lines: string[] = [];
    const log = createLogger({ format: "json", write: (l) => lines.push(l) });
    log.info("ai call", { inputTokens: 5147, outputTokens: 4224, maxOutputTokens: 16000, token: "abc" });
    expect(JSON.parse(lines[0] as string)).toMatchObject({
      inputTokens: 5147,
      outputTokens: 4224,
      maxOutputTokens: 16000,
      token: "[redacted]",
    });
  });

  it("carry the fields of the work they were logged in, and skip levels below the one set", async () => {
    const lines: string[] = [];
    const log = createLogger({ format: "json", level: "warn", write: (l) => lines.push(l) });
    await withLogContext({ roundId: "r-1" }, async () => {
      await Promise.resolve();
      log.info("not shown");
      log.warn("inside", { seq: 2 });
    });
    log.warn("outside");
    expect(lines.map((l) => JSON.parse(l))).toEqual([
      expect.objectContaining({ msg: "inside", roundId: "r-1", seq: 2 }),
      expect.not.objectContaining({ roundId: "r-1" }),
    ]);
  });

  it("read as one line each while developing", () => {
    const lines: Array<[string, string]> = [];
    const log = createLogger({ format: "pretty", write: (l, level) => lines.push([l, level]) });
    log.info("turn resolved", { totalMs: 1200 });
    expect(lines[0]?.[0]).toMatch(/^\d\d:\d\d:\d\d INFO {2}turn resolved \{"totalMs":1200\}$/);
    expect(lines[0]?.[1]).toBe("info");
  });
});

describe.skipIf(!TEST_DATABASE_URL)("rewinding", () => {
  let db: Awaited<ReturnType<typeof createTestDb>>;
  beforeAll(async () => {
    db = await createTestDb();
  }, 30_000);
  afterAll(async () => {
    await db?.drop();
  });

  async function playing(guildId: string) {
    const llm = new FakeLlm();
    const engine = createEngine({ db: db.db, worlds, llm, dice: seededDice });
    const c = await engine.campaigns.create({
      guildId,
      channelId: `${guildId}-ch`,
      name: "Rewind Road",
      mode: "ai_dm",
      createdBy: "host",
    });
    await engine.campaigns.join(c.id, "player");
    await makeHero(engine, c.id, "host", "shieldheart", "Bram Stout");
    let view = await engine.turns.openCampaign(c.id, "host");
    // Always the round that's open now, so a rewind or a rebuilt fight carries on from its own round.
    const step = async () => {
      const roundId = (await engine.turns.currentRound(c.id))?.id as string;
      await engine.turns.submitAction({ roundId, userId: "host", kind: "choice", choiceIndex: 0 });
      const r = await engine.turns.resolveRound(roundId);
      view = (r as { kind: "turn"; view: typeof view }).view;
      return view;
    };
    return { llm, engine, c, step, view: () => view };
  }

  it("puts the party, their packs and the scene back, and the storyteller forgets the undone turns", async () => {
    const { llm, engine, c, step, view } = await playing("g-rewind");
    await step();
    const kept = await step();
    const heroBefore = (await db.db.select().from(characters).where(eq(characters.campaignId, c.id)))[0];
    if (!heroBefore) throw new Error("no hero");
    const packBefore = await db.db
      .select()
      .from(inventoryItems)
      .where(eq(inventoryItems.characterId, heroBefore.id));
    expect(packBefore.length).toBeGreaterThan(0);

    // Then something goes wrong: the hero is left at 1 hit point, knocked down, with an empty pack.
    await step();
    await db.db
      .update(characters)
      .set({ hp: 1, conditions: ["prone"] })
      .where(eq(characters.id, heroBefore.id));
    await db.db.delete(inventoryItems).where(eq(inventoryItems.characterId, heroBefore.id));
    await step();

    // Only the host, a DM or a guardian may rewind.
    await expect(engine.turns.rewindPoints(c.id, "player")).rejects.toThrow();
    const points = await engine.turns.rewindPoints(c.id, "host");
    const target = points.points.find((p) => p.turnSeq === kept.seq);
    expect(target?.turnsBack).toBe(2);

    const { view: back, undone } = await engine.turns.rewind(c.id, "host", kept.seq, "the fight went wrong");
    expect(undone).toBe(2);
    const heroAfter = (await db.db.select().from(characters).where(eq(characters.id, heroBefore.id)))[0];
    expect([heroAfter?.hp, heroAfter?.conditions]).toEqual([heroBefore.hp, heroBefore.conditions]);
    const packAfter = await db.db
      .select()
      .from(inventoryItems)
      .where(eq(inventoryItems.characterId, heroBefore.id));
    expect(packAfter.map((x) => [x.itemId, x.qty]).sort()).toEqual(
      packBefore.map((x) => [x.itemId, x.qty]).sort(),
    );
    expect(back.sceneTitle).toBe(kept.sceneTitle);
    expect(back.choices.map((x) => x.label)).toEqual(kept.choices.map((x) => x.label));
    expect(back.roundId).not.toBeNull();
    expect((await engine.turns.currentRound(c.id))?.id).toBe(back.roundId);

    // History stays: the undone turns are still there, marked, and the rewind is recorded.
    const history = await db.db.select().from(turns).where(eq(turns.campaignId, c.id));
    expect(history.map((t) => t.seq).sort((a, b) => a - b)).toEqual(
      Array.from({ length: kept.seq + 3 }, (_, i) => i + 1),
    );
    const [camp] = await db.db.select().from(campaigns).where(eq(campaigns.id, c.id));
    expect(asStory(camp?.story).rewound).toEqual([[kept.seq + 1, kept.seq + 3]]);
    const log = await db.db.select().from(events).where(eq(events.campaignId, c.id));
    expect(log.find((e) => e.type === "rewound")?.payload).toMatchObject({ toSeq: kept.seq, by: "host" });

    // The story goes on from there, and the storyteller hears only about turns that still happened.
    const undoneLines = history
      .filter((t) => t.seq > kept.seq && t.seq <= kept.seq + 2)
      .map((t) => String((t.data.narration as { narration?: string } | undefined)?.narration ?? ""));
    const keptLines = history
      .filter((t) => t.seq <= kept.seq)
      .map((t) => String((t.data.narration as { narration?: string } | undefined)?.narration ?? ""));
    const callsBefore = llm.calls.length;
    await step();
    const prompt = llm.calls
      .slice(callsBefore)
      .filter((x) => x.task === "narrator")
      .map((x) => x.user)
      .join("\n");
    const recently = prompt.split("## Recently")[1]?.split("\n## ")[0] ?? "";
    for (const line of recently.split("\n").filter((l) => l.startsWith("- ")))
      expect(keptLines.some((k) => k.startsWith(line.slice(2, 60)))).toBe(true);
    expect(undoneLines.length).toBe(2);
    expect(view().roundId).not.toBeNull();

    // An undone turn can't be rewound to.
    await expect(engine.turns.rewind(c.id, "host", kept.seq + 1)).rejects.toThrow(/undone/);
  });

  it("matches a typed idea in a fight against the foe's defense, under the new fight rules", async () => {
    const { llm, engine, c, step, view } = await playing("g-defense");
    await engine.turns.setPartialHits(c.id, "host", true);
    for (let i = 0; i < 20 && view().combat?.phase !== "fighting"; i++) await step();
    expect(view().combat?.phase).toBe("fighting");
    const roundId = (await engine.turns.currentRound(c.id))?.id as string;
    // The scripted AI reads a jump as Athletics: Strength, so Fortitude.
    await engine.turns.submitAction({
      roundId,
      userId: "host",
      kind: "freeform",
      text: "I jump at it and knock it off its feet",
    });
    const r = await engine.turns.resolveRound(roundId);
    const rolls = (r as { kind: "turn"; view: ReturnType<typeof view> }).view.rolls;
    expect(rolls.find((x) => x.label === "Athletics")?.difficulty).toMatch(/^defense \d+$/);
    // The intent reader was told that anything done against a foe needs a roll.
    expect(llm.calls.filter((x) => x.task === "intent").at(-1)?.user).toContain("A fight is on.");
  });

  it("mends the party and rebuilds a fight, for campaigns from before restore points too", async () => {
    const { engine, c, step, view } = await playing("g-mend");
    const hero = (await db.db.select().from(characters).where(eq(characters.campaignId, c.id)))[0];
    if (!hero) throw new Error("no hero");
    await db.db
      .update(characters)
      .set({ hp: 2, conditions: ["prone"] })
      .where(eq(characters.id, hero.id));
    await expect(engine.turns.mendParty(c.id, "player")).rejects.toThrow();
    expect(await engine.turns.mendParty(c.id, "host")).toEqual(["Bram Stout"]);
    const mended = (await db.db.select().from(characters).where(eq(characters.id, hero.id)))[0];
    expect([mended?.hp, mended?.conditions]).toEqual([hero.hpMax, []]);

    // Partial hits switch on and off from the DM room, for the host, a DM or a guardian only.
    expect((await engine.turns.rewindPoints(c.id, "host")).partialHits).toBe(false);
    await expect(engine.turns.setPartialHits(c.id, "player", true)).rejects.toThrow();
    await engine.turns.setPartialHits(c.id, "host", true);
    expect((await engine.turns.rewindPoints(c.id, "host")).partialHits).toBe(true);
    await engine.turns.setPartialHits(c.id, "host", false);
    expect((await engine.turns.rewindPoints(c.id, "host")).partialHits).toBe(false);

    await expect(engine.turns.rebuildFight(c.id, "host")).rejects.toThrow(/no fight/i);
    for (let i = 0; i < 20 && view().combat?.phase !== "fighting"; i++) await step();
    expect(view().combat?.phase).toBe("fighting");
    const rebuilt = await engine.turns.rebuildFight(c.id, "host");
    expect(rebuilt.combat?.phase).toBe("fighting");
    expect(rebuilt.combat?.foes.length).toBeGreaterThan(0);
    expect(rebuilt.roundId).not.toBe(view().roundId);
    expect((await engine.turns.currentRound(c.id))?.id).toBe(rebuilt.roundId);
  });
});
