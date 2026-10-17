import { describe, expect, it } from "vitest";
import { starterIndex } from "../loom/test-helpers";
import type { Ability } from "../rules/abilities";
import { balanceEncounter, creatureXp, encounterXp, testFights, xpBudget } from "./balance";
import { type HeroCombatant, heroCombatant } from "./index";

const index = starterIndex();
const creatures = new Map(index.world.creatures.map((c) => [c.id, c]));
const creature = (id: string) => {
  const c = creatures.get(id);
  if (!c) throw new Error(id);
  return c;
};
const saves = { str: 0, dex: 3, con: 1, int: 0, wis: 1, cha: 0 } as Record<Ability, number>;

/** A level-1 archer like the one in the bug report: longbow at +5, 12 hit points, armor 13. */
function archer(id = "h-archer", level = 1, hp = 12): HeroCombatant {
  return heroCombatant({
    id,
    name: "Cuthbert",
    level,
    hp,
    hpMax: hp,
    tempHp: 0,
    ac: 13,
    conditions: [],
    abilities: { str: 10, dex: 16, con: 12, int: 10, wis: 14, cha: 8 },
    proficiencyBonus: 2,
    saves,
    initiativeBonus: 3,
    weapons: [
      { id: "longbow", name: "Longbow", base: "longbow" },
      { id: "shortsword", name: "Shortsword", base: "shortsword" },
    ],
    spellIds: [],
    spellcastingAbility: null,
    srdClass: "ranger",
    slotsMax: [],
    slotsUsed: [],
    potions: [],
  });
}

const party = (n: number, level = 1) => Array.from({ length: n }, (_, i) => archer(`h${i}`, level));

describe("encounter budget", () => {
  it("follows the SRD 5.2.1 XP budget per character", () => {
    expect(xpBudget([1], "low")).toBe(50);
    expect(xpBudget([1], "moderate")).toBe(75);
    expect(xpBudget([1], "high")).toBe(100);
    expect(xpBudget([1, 1, 1], "moderate")).toBe(225);
    expect(xpBudget([5, 4], "high")).toBe(1600);
    expect(creatureXp(creature("shadow-wolf"))).toBe(100);
    expect(creatureXp(creature("gloam-knight"))).toBe(450);
  });

  it("counts foes beyond the party's size extra, and weaker foes for less", () => {
    const mite = { creature: creature("gloom-mite"), count: 3, hpScale: 1 };
    expect(encounterXp([mite], 3)).toBe(75);
    expect(encounterXp([mite], 1)).toBe(75 * 1.5);
    expect(encounterXp([{ ...mite, count: 1, hpScale: 0.5 }], 1)).toBe(12.5);
  });
});

describe("balancing a fight", () => {
  it("never sends a shadow wolf against a lone level-1 hero, who beats one less than half the time", () => {
    const hero = archer();
    // Chapter 2's fight for a lone hero: a wolf and a mite (the world writes two wolves for a party of three).
    const r = balanceEncounter({
      foes: [
        { creature: creature("shadow-wolf"), count: 1 },
        { creature: creature("gloom-mite"), count: 1 },
      ],
      heroes: [hero],
      difficulty: "moderate",
      creatures,
    });
    expect(r.xp).toBeLessThanOrEqual(75);
    expect(r.winRate).toBeGreaterThanOrEqual(0.9);
    // Even at half strength a wolf wins too often against one level-1 hero; the mite fights alone.
    expect(r.foes.map((f) => f.creature.id)).toEqual(["gloom-mite"]);
    expect(
      testFights([{ creature: creature("shadow-wolf"), count: 1, hpScale: 1 }], [hero], creatures),
    ).toBeLessThan(0.6);
    // Unbalanced, the fight as it was goes badly far too often.
    expect(
      testFights(
        [
          { creature: creature("shadow-wolf"), count: 1, hpScale: 1 },
          { creature: creature("gloom-mite"), count: 1, hpScale: 1 },
        ],
        [hero],
        creatures,
      ),
    ).toBeLessThan(0.8);
  });

  it("plays its test fights by the table's rules", () => {
    const hero = archer();
    const wolf = [{ creature: creature("shadow-wolf"), count: 1, hpScale: 1 }];
    const srd = testFights(wolf, [hero], creatures, 400);
    const partial = testFights(wolf, [hero], creatures, 400, { partialHits: true, defenseMix: false });
    expect(partial).toBeGreaterThan(srd);
  });

  it("swaps in a weaker creature of the same side when even a weakened one is too much", () => {
    const r = balanceEncounter({
      foes: [{ creature: creature("gloam-knight"), count: 1 }],
      heroes: [archer()],
      difficulty: "low",
      creatures,
    });
    expect(r.foes.some((f) => f.creature.id === "gloam-knight")).toBe(false);
    expect(r.foes.every((f) => f.creature.faction === "gloam-host")).toBe(true);
    expect(r.xp).toBeLessThanOrEqual(50);
    expect(r.winRate).toBeGreaterThanOrEqual(0.97);
  });

  it("sends the wolf once the hero is a little stronger", () => {
    const r = balanceEncounter({
      foes: [
        { creature: creature("shadow-wolf"), count: 1 },
        { creature: creature("gloom-mite"), count: 1 },
      ],
      heroes: [archer("h", 3, 28)],
      difficulty: "moderate",
      creatures,
    });
    expect(r.foes[0]?.creature.id).toBe("shadow-wolf");
    expect(r.winRate).toBeGreaterThanOrEqual(0.9);
  });

  it("keeps the fight as written for a full party at the level it was written for", () => {
    // Chapter 1, for three level-1 heroes: three mites and a skulker.
    const r = balanceEncounter({
      foes: [
        { creature: creature("gloom-mite"), count: 3 },
        { creature: creature("gloam-skulker"), count: 1 },
      ],
      heroes: party(3),
      difficulty: "moderate",
      creatures,
    });
    expect(r.foes.map((f) => [f.creature.id, f.count, f.hpScale])).toEqual([
      ["gloom-mite", 3, 1],
      ["gloam-skulker", 1, 1],
    ]);
  });

  it("gives hurt heroes an easier fight than fresh ones", () => {
    const wanted = [{ creature: creature("gloam-skulker"), count: 3 }];
    const fresh = balanceEncounter({ foes: wanted, heroes: party(2, 2), difficulty: "moderate", creatures });
    const hurt = balanceEncounter({
      foes: wanted,
      heroes: [archer("h0", 2, 4), archer("h1", 2, 4)],
      difficulty: "moderate",
      creatures,
    });
    expect(hurt.xp).toBeLessThan(fresh.xp);
  });

  it("is quick enough to run whenever a scene needs a fight", () => {
    const started = performance.now();
    balanceEncounter({
      foes: [
        { creature: creature("gloam-knight"), count: 2 },
        { creature: creature("gloam-skulker"), count: 3 },
      ],
      heroes: party(4, 3),
      difficulty: "moderate",
      creatures,
    });
    expect(performance.now() - started).toBeLessThan(2000);
  });
});
