import { describe, expect, it } from "vitest";
import { starterIndex } from "../loom/test-helpers";
import { type DeltaContext, type DeltaProposal, validateDeltas } from "./index";

const index = starterIndex();

function ctx(over: Partial<DeltaContext> = {}): DeltaContext {
  return {
    index,
    partyRegionId: "hearthmoor",
    characters: new Map([
      ["h1", { level: 1, hp: 10, hpMax: 12, gold: 10, inventory: new Map([["lamp-oil", 1]]) }],
    ]),
    ruledHpChanges: new Map(),
    allowedLoot: new Set(["honey-tonic", "lantern-of-steady-light", "oakheart-shield-charm"]),
    milestoneBeats: new Set(),
    sceneHasHazard: false,
    npcs: new Map([["snibbet", { protected: true }]]),
    quests: new Set(["fetch-new-flame"]),
    promises: new Set(),
    knownEntityNames: new Set(["snibbet"]),
    bannedTerms: index.world.content.bannedTerms,
    ...over,
  };
}

const run = (d: DeltaProposal[], c = ctx()) => validateDeltas(d, c);

describe("delta validation", () => {
  it("hit points must match the rules engine", () => {
    const c = ctx({ ruledHpChanges: new Map([["h1", -5]]) });
    expect(
      run([{ kind: "hp_change", characterId: "h1", amount: -5, source: "combat" }], c).accepted,
    ).toHaveLength(1);
    expect(
      run([{ kind: "hp_change", characterId: "h1", amount: -9, source: "combat" }], c).rejected,
    ).toHaveLength(1);
    expect(run([{ kind: "hp_change", characterId: "h1", amount: 20, source: "heal" }]).rejected).toHaveLength(
      1,
    );
  });

  it("allows small hazard damage only where there is a hazard", () => {
    const d: DeltaProposal = { kind: "hp_change", characterId: "h1", amount: -3, source: "hazard" };
    expect(run([d]).rejected).toHaveLength(1);
    expect(run([d], ctx({ sceneHasHazard: true })).accepted).toHaveLength(1);
    expect(run([{ ...d, amount: -10 }], ctx({ sceneHasHazard: true })).rejected).toHaveLength(1);
  });

  it("only grants items available in the scene and suitable for the level", () => {
    expect(
      run([{ kind: "item_grant", characterId: "h1", itemId: "honey-tonic", qty: 1 }]).accepted,
    ).toHaveLength(1);
    expect(
      run([{ kind: "item_grant", characterId: "h1", itemId: "warden-cloak", qty: 1 }]).rejected[0]?.reason,
    ).toContain("not available");
    expect(
      run([{ kind: "item_grant", characterId: "h1", itemId: "oakheart-shield-charm", qty: 1 }]).rejected[0]
        ?.reason,
    ).toContain("too rare");
    expect(
      run([{ kind: "item_grant", characterId: "h1", itemId: "sword-of-everything", qty: 1 }]).rejected,
    ).toHaveLength(1);
  });

  it("never lets the narrator award XP on its own", () => {
    expect(run([{ kind: "xp_milestone", beatId: "ch1-gloam-in-the-garden" }]).rejected).toHaveLength(1);
    const c = ctx({ milestoneBeats: new Set(["ch1-gloam-in-the-garden"]) });
    expect(run([{ kind: "xp_milestone", beatId: "ch1-gloam-in-the-garden" }], c).accepted).toHaveLength(1);
  });

  it("protected npcs flee instead of being defeated", () => {
    const out = run([{ kind: "npc_status", npcId: "snibbet", status: "defeated" }]);
    expect(out.accepted[0]).toMatchObject({ status: "fled" });
  });

  it("only moves the party to neighboring regions", () => {
    expect(run([{ kind: "move_party", regionId: "whisperwood", poiId: null }]).accepted).toHaveLength(1);
    expect(run([{ kind: "move_party", regionId: "gloamhold", poiId: null }]).rejected).toHaveLength(1);
    expect(
      run([{ kind: "move_party", regionId: "whisperwood", poiId: "lantern-hall" }]).rejected,
    ).toHaveLength(1);
  });

  it("checks new names for banned words and duplicates", () => {
    const base = {
      kind: "introduce_entity" as const,
      entityKind: "npc" as const,
      description: "A friendly baker.",
      tags: [],
    };
    expect(run([{ ...base, name: "Marigold Bun" }]).accepted).toHaveLength(1);
    expect(run([{ ...base, name: "Snibbet" }]).rejected).toHaveLength(1);
    expect(run([{ ...base, name: "Bloody Bob" }]).rejected[0]?.reason).toContain("banned");
  });

  it("only the rules engine can daze a hero, and gold gains are capped", () => {
    expect(
      run([{ kind: "condition", characterId: "h1", condition: "dazed", action: "add" }]).rejected,
    ).toHaveLength(1);
    expect(run([{ kind: "gold", characterId: "h1", amount: 500 }]).rejected).toHaveLength(1);
    expect(run([{ kind: "gold", characterId: "h1", amount: -20 }]).rejected).toHaveLength(1);
  });
});
