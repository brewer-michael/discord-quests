import { createTestDb, TEST_DATABASE_URL } from "@dq/db/testing";
import { createEngine, type DraftView, type TurnView, WorldCache } from "@dq/engine";
import { FakeLlm } from "@dq/engine/testing";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { commandsJson } from "./commands";
import { decodeId, encodeId } from "./ids";
import { countComponents, textLength } from "./render/common";
import { renderHub } from "./render/hub";
import { renderAbout, renderHelp, renderJournal, renderPrivacy } from "./render/misc";
import { freezeComponents, renderTurn } from "./render/turn";
import { renderWizard } from "./render/wizard";

const UUID = "123e4567-e89b-42d3-a456-426614174000";
const worlds = new WorldCache();
const world = worlds.get("lanternreach").index.world;

/** Every limit Discord enforces on a Components V2 message. */
function checkLimits(payload: { components: Array<{ toJSON(): unknown }> }) {
  const json = payload.components.map((c) => c.toJSON());
  expect(countComponents(json)).toBeLessThanOrEqual(40);
  expect(textLength(json)).toBeLessThanOrEqual(4000);
  const walk = (n: unknown) => {
    if (Array.isArray(n)) return n.forEach(walk);
    if (!n || typeof n !== "object") return;
    const o = n as Record<string, unknown>;
    if (typeof o.custom_id === "string") {
      expect(o.custom_id.length).toBeLessThanOrEqual(100);
      expect(decodeId(o.custom_id), o.custom_id).not.toBeNull();
    }
    if (o.type === 2 && typeof o.label === "string") expect(o.label.length).toBeLessThanOrEqual(80);
    if (o.type === 1) expect((o.components as unknown[]).length).toBeLessThanOrEqual(5);
    if (o.type === 3) expect((o.options as unknown[]).length).toBeLessThanOrEqual(25);
    for (const v of Object.values(o)) if (typeof v === "object") walk(v);
  };
  walk(json);
  return json;
}

describe("custom ids", () => {
  it("round-trip and stay short", () => {
    const ids = [
      { kind: "choice", roundId: UUID, index: 3 },
      { kind: "freeform", roundId: UUID },
      { kind: "wizard", campaignId: UUID, page: 1, action: "inc-str" },
      { kind: "levelup", characterId: UUID },
      { kind: "map-focus", campaignId: UUID },
    ] as const;
    for (const id of ids) {
      const raw = encodeId(id);
      expect(raw.length).toBeLessThanOrEqual(100);
      expect(decodeId(raw)).toEqual(id);
    }
  });

  it("rejects anything that isn't ours", () => {
    for (const raw of [
      "",
      "hello",
      "dq:zz:" + UUID,
      "dq:ch:not-a-uuid:1",
      `dq:ch:${UUID}:99`,
      `other:ch:${UUID}:1`,
    ]) {
      expect(decodeId(raw), raw).toBeNull();
    }
  });
});

describe("slash commands", () => {
  it("are valid", () => {
    const json = commandsJson();
    expect(json.map((c) => c.name)).toEqual(
      expect.arrayContaining(["campaign", "character", "act", "map", "xcard"]),
    );
    for (const c of json) {
      expect(c.name).toMatch(/^[a-z]{1,32}$/);
      expect(c.description.length).toBeLessThanOrEqual(100);
    }
  });
});

describe("renderers stay within Discord's limits", () => {
  const view: TurnView = {
    campaignId: UUID,
    seq: 3,
    sceneTitle: "The Thief in the Lamp-House",
    sceneKind: "social",
    locationName: "The Lamp-House",
    regionId: "hearthmoor",
    narration: "x".repeat(1800),
    npcLines: Array.from({ length: 4 }, (_, i) => ({ name: `NPC ${i}`, line: "y".repeat(300) })),
    rolls: Array.from({ length: 3 }, () => ({
      characterName: "Pip",
      label: "Perception",
      natural: 14,
      rolls: [14, 9],
      modifier: 3,
      total: 17,
      difficulty: "Medium",
      success: true,
      mode: "advantage" as const,
    })),
    choices: Array.from({ length: 4 }, (_, i) => ({ index: i, label: "z".repeat(80) })),
    roundId: UUID,
    sceneChanged: true,
    imageBrief: null,
    levelUps: [],
    campaignEnded: false,
    fallback: false,
  };

  it("turn messages, even at maximum length", () => {
    checkLimits(renderTurn(view, { waitingOn: ["Pip", "Mira"], image: { name: "scene.png" } }));
    checkLimits(renderTurn({ ...view, campaignEnded: true, roundId: null, choices: [] }));
  });

  it("finished turns lose their buttons but keep the story", () => {
    const json = renderTurn(view, { waitingOn: [] }).components.map((c) => c.toJSON());
    const frozen = JSON.stringify(freezeComponents(json));
    expect(frozen).not.toContain('"type":1,');
    expect(frozen).toContain("The Thief in the Lamp-House");
    expect(frozen).not.toContain("What do you do?");
  });

  it("the hub and info pages", () => {
    checkLimits(
      renderHub({
        campaignId: UUID,
        name: "Lights Out",
        worldName: "Lanternreach",
        tagline: world.meta.tagline,
        mode: "ai_dm",
        dmUserId: null,
        status: "setup",
        audience: "family",
        heroes: Array.from({ length: 6 }, (_, i) => ({ name: `Hero ${i}`, userId: "1", ready: i % 2 === 0 })),
      }),
    );
    checkLimits(renderAbout());
    checkLimits(renderPrivacy());
    checkLimits(renderHelp());
    checkLimits(
      renderJournal({
        quests: [{ title: "Q", objective: "o", status: "active" }],
        promises: [],
        recent: ["a".repeat(900)],
      }),
    );
  });

  it("every wizard page in both modes", () => {
    const draft: DraftView = {
      characterId: UUID,
      mode: "guided",
      name: "Pip",
      look: "Freckles",
      classId: "shieldheart",
      pathId: "long-road",
      backgroundId: "farmhand",
      speciesId: "pipkin",
      upbringingId: "forge-apprentice",
      keepsakeId: "old-key",
      base: { str: 15, dex: 13, con: 14, int: 8, wis: 12, cha: 10 },
      bonus: { str: 2, con: 1 },
      final: { str: 17, dex: 13, con: 15, int: 8, wis: 12, cha: 10 },
      pointsRemaining: 0,
      canIncrement: { str: false, dex: true, con: true, int: true, wis: true, cha: true },
      canDecrement: { str: true, dex: true, con: true, int: false, wis: true, cha: true },
      formativeOptions: Array.from({ length: 7 }, (_, i) => ({
        id: `o${i}`,
        label: `Option ${i}`,
        description: "d".repeat(150),
        selected: i === 0,
      })),
      skillOptions: Array.from({ length: 16 }, (_, i) => ({
        id: `s${i}`,
        name: `Skill ${i}`,
        selected: i < 2,
      })),
      skillCount: 3,
      keepsakeOptions: world.items.keepsakes.map((k) => ({
        id: k.id,
        name: k.name,
        description: k.description,
      })),
      preview: { hpMax: 13, armorClass: 18, topSkills: ["Athletics +5"] },
      missing: [],
    };
    for (const mode of ["guided", "advanced"] as const) {
      for (let page = 0; page < 4; page++) checkLimits(renderWizard(world, UUID, { ...draft, mode }, page));
    }
  });
});

describe.skipIf(!TEST_DATABASE_URL)("a whole campaign renders cleanly", () => {
  let db: Awaited<ReturnType<typeof createTestDb>>;
  beforeAll(async () => {
    db = await createTestDb();
  }, 30_000);
  afterAll(async () => {
    await db?.drop();
  });

  it("every turn of a full playthrough passes Discord's limits", async () => {
    const engine = createEngine({ db: db.db, worlds, llm: new FakeLlm() });
    const c = await engine.campaigns.create({
      guildId: "g",
      channelId: "c",
      name: "Render Test",
      mode: "ai_dm",
      createdBy: "u1",
    });
    await engine.characters.startDraft(c.id, "u1");
    for (const op of [
      { op: "class", classId: "scout" },
      { op: "path", pathId: "quick-way" },
      { op: "background", backgroundId: "street-scamp" },
      { op: "species", speciesId: "burrowkin" },
      { op: "recommended" },
      { op: "keepsake", keepsakeId: "lucky-button" },
      { op: "name", name: "Nib Quickfoot", look: "" },
    ] as const) {
      const draft = await engine.characters.updateDraft(c.id, "u1", op);
      for (let page = 0; page < 4; page++) checkLimits(renderWizard(world, c.id, draft, page));
    }
    await engine.characters.finalize(c.id, "u1");
    let view = await engine.turns.openCampaign(c.id, "u1");
    let turns = 0;
    while (!view.campaignEnded && turns < 80) {
      checkLimits(renderTurn(view, { waitingOn: [] }));
      const roundId = view.roundId as string;
      await engine.turns.submitAction({
        roundId,
        userId: "u1",
        kind: "choice",
        choiceIndex: turns % Math.max(1, view.choices.length),
      });
      view = (await engine.turns.resolveRound(roundId)) as TurnView;
      turns++;
    }
    checkLimits(renderTurn(view));
    expect(view.campaignEnded).toBe(true);
  }, 60_000);
});
