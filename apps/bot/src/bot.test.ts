import { VIRTUE_TAGS } from "@dq/core/loom";
import { createTestDb, TEST_DATABASE_URL } from "@dq/db/testing";
import { createEngine, type DraftView, type TurnView, WorldCache } from "@dq/engine";
import { FakeLlm } from "@dq/engine/testing";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { commandsJson } from "./commands";
import { battleMenu } from "./handlers/battle";
import { decodeId, encodeId } from "./ids";
import { countComponents, textLength } from "./render/common";
import { draftModal, renderDraft } from "./render/draft";
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
      { kind: "approval", approvalId: UUID, action: "redo" },
      { kind: "approval-modal", approvalId: UUID, action: "write" },
      { kind: "battle", roundId: UUID, action: "magic" },
      { kind: "battle-pick", roundId: UUID, action: "magic", arg: "healing-word" },
      { kind: "battle-pick", roundId: UUID, action: "attack" },
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
      `dq:ap:${UUID}:launch`,
      `dq:bt:${UUID}:explode`,
      `dq:bp:${UUID}:magic:Not_An_Id`,
      `dq:ap:${UUID}`,
    ]) {
      expect(decodeId(raw), raw).toBeNull();
    }
  });
});

describe("slash commands", () => {
  it("are valid", () => {
    const json = commandsJson();
    expect(json.map((c) => c.name)).toEqual(
      expect.arrayContaining(["campaign", "character", "act", "map", "xcard", "dm", "loom"]),
    );
    for (const c of json) {
      expect(c.name).toMatch(/^[a-z]{1,32}$/);
      expect(c.description.length).toBeLessThanOrEqual(100);
    }
  });
});

describe("/loom plant", () => {
  it("offers exactly the deeds the engine accepts", () => {
    const loom = commandsJson().find((c) => c.name === "loom");
    const plant = loom?.options?.find((o) => o.name === "plant") as
      | { options: Array<{ name: string; choices?: Array<{ value: string }> }> }
      | undefined;
    const kinds = plant?.options.find((o) => o.name === "kind")?.choices?.map((c) => c.value);
    expect(kinds?.toSorted()).toEqual([...VIRTUE_TAGS].sort());
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
    combat: null,
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

  it("the DM's draft screen, even at maximum length", () => {
    const draft = {
      approvalId: UUID,
      campaignId: UUID,
      seq: 7,
      sceneTitle: "The Siege of Lantern Hall",
      narration: "x".repeat(3500),
      npcLines: Array.from({ length: 4 }, () => "y".repeat(400)),
      rolls: view.rolls,
      choices: Array.from({ length: 4 }, () => "z".repeat(80)),
      actions: Array.from({ length: 6 }, () => "a".repeat(200)),
      dmNotes: Array.from({ length: 6 }, () => "n".repeat(500)),
      fallback: true,
    };
    const json = JSON.stringify(checkLimits(renderDraft(draft)));
    expect(json).toContain("Send it");
    for (const action of ["edit", "redo", "write"] as const) {
      const modal = draftModal(draft, UUID, action).toJSON();
      expect(modal.custom_id.length).toBeLessThanOrEqual(100);
      expect(decodeId(modal.custom_id)).toEqual({ kind: "approval-modal", approvalId: UUID, action });
      expect(modal.title.length).toBeLessThanOrEqual(45);
    }
  });

  it("battles, even with a crowd", () => {
    const battle: TurnView = {
      ...view,
      sceneKind: "combat",
      choices: [],
      combat: {
        phase: "fighting",
        round: 3,
        foes: Array.from({ length: 8 }, (_, i) => ({
          id: `foe-${i + 1}`,
          name: `Extremely Long-Named Gloam Skulker ${"ABCDEFGH"[i]}`,
          condition: i === 7 ? "gave up" : "nearly done",
          status: i === 7 ? "at_mercy" : i === 6 ? "fled" : "fighting",
        })),
        heroes: Array.from({ length: 6 }, (_, i) => ({
          id: `h${i}`,
          name: `Hero Number ${i}`,
          hp: i,
          hpMax: 12,
          down: i === 0,
        })),
        order: Array.from({ length: 14 }, (_, i) => `Combatant With A Long Name ${i}`),
        log: [],
      },
    };
    const json = JSON.stringify(checkLimits(renderTurn(battle, { waitingOn: ["Pip", "Mira"] })));
    expect(json).toContain("Spare");
    expect(json).toContain("Battle · round 4");
    expect(json).not.toContain("What do you do?");
    const over = JSON.stringify(
      checkLimits(
        renderTurn({ ...battle, combat: { ...battle.combat!, phase: "aftermath" }, choices: view.choices }),
      ),
    );
    expect(over).toContain("The fight is over");
    expect(over).not.toContain('"Attack"');
    const picks = Array.from({ length: 30 }, (_, i) => ({
      label: "x".repeat(120),
      value: `foe-${i}`,
      description: "y".repeat(120),
    }));
    checkLimits(battleMenu(UUID, "magic", "healing-word", "Who gets Healing Word?", picks));
  });

  it("a long journal", () => {
    checkLimits(
      renderJournal({
        quests: Array.from({ length: 20 }, (_, i) => ({
          title: `Quest ${i}`,
          objective: "o".repeat(200),
          status: "active",
        })),
        promises: Array.from({ length: 20 }, (_, i) => ({
          to: `Friend ${i}`,
          text: "p".repeat(200),
          status: "pending",
        })),
        recent: ["r".repeat(2000), "s".repeat(2000)],
        chapters: Array.from({ length: 8 }, (_, i) => ({ chapter: i + 1, text: "c".repeat(900) })),
      }),
    );
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
    let fights = 0;
    while (!view.campaignEnded && turns < 120) {
      checkLimits(renderTurn(view, { waitingOn: [] }));
      const roundId = view.roundId as string;
      if (view.combat?.phase === "fighting") {
        fights++;
        const options = await engine.turns.combatOptions(roundId, "u1");
        checkLimits(
          battleMenu(
            roundId,
            "attack",
            undefined,
            "Which foe?",
            (options?.foes ?? []).map((f) => ({ label: f.name, value: f.id })),
          ),
        );
        await engine.turns.submitAction({
          roundId,
          userId: "u1",
          kind: "combat",
          action: { kind: "attack", targetId: options?.foes[0]?.id },
        });
      } else
        await engine.turns.submitAction({
          roundId,
          userId: "u1",
          kind: "choice",
          choiceIndex: turns % Math.max(1, view.choices.length),
        });
      const res = await engine.turns.resolveRound(roundId);
      if (res?.kind !== "turn") throw new Error("expected a turn");
      view = res.view;
      turns++;
    }
    checkLimits(renderTurn(view));
    expect(view.campaignEnded).toBe(true);
    expect(fights).toBeGreaterThan(0);
  }, 60_000);
});
