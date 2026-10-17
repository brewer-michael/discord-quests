import { describe, expect, it } from "vitest";
import { starterIndex } from "../loom/test-helpers";
import { createRng } from "../rng/index";
import type { Ability } from "../rules/abilities";
import { parseDice } from "../rules/dice";
import { checkNarration } from "../safety/index";
import { SRD_BESTIARY } from "../srd/bestiary.generated";
import { CreatureDef } from "../world/schema";
import { balanceEncounter, creatureXp } from "./balance";
import { creatureAllowed, matchesTopic, pickWild, regionHabitats } from "./bestiary";
import {
  buildEncounter,
  type CombatState,
  defenseOf,
  type HeroCombatant,
  heroCombatant,
  resolveCombatRound,
} from "./index";

const index = starterIndex();
const world = index.world;
const creature = (id: string) => {
  const c = index.creatures.get(id);
  if (!c) throw new Error(id);
  return c;
};
const saves = { str: 1, dex: 2, con: 2, int: 0, wis: 1, cha: 0 } as Record<Ability, number>;

function hero(id: string, level = 1, hp = 12, weapon = "longsword"): HeroCombatant {
  return heroCombatant({
    id,
    name: `Hero ${id}`,
    level,
    hp,
    hpMax: hp,
    tempHp: 0,
    ac: 15,
    conditions: [],
    abilities: { str: 16, dex: 14, con: 14, int: 10, wis: 12, cha: 10 },
    proficiencyBonus: level >= 5 ? 3 : 2,
    saves,
    initiativeBonus: 2,
    weapons: [{ id: weapon, name: weapon, base: weapon }],
    spellIds: [],
    spellcastingAbility: null,
    srdClass: "fighter",
    slotsMax: [],
    slotsUsed: [],
    potions: [],
  });
}

describe("the SRD bestiary", () => {
  it("has a real roster: hundreds of creatures from CR 0 to 13, every one a valid stat block", () => {
    expect(SRD_BESTIARY.length).toBeGreaterThanOrEqual(240);
    const crs = new Set(SRD_BESTIARY.map((c) => c.cr));
    for (const cr of ["0", "1/8", "1/4", "1/2", "1", "2", "3", "5", "8", "10", "13"])
      expect(crs).toContain(cr);
    for (const c of SRD_BESTIARY) {
      expect(CreatureDef.safeParse(c).success, c.id).toBe(true);
      parseDice(c.hp);
      for (const a of c.attacks) parseDice(a.damage);
      for (const s of c.specials) if (s.damage) parseDice(s.damage);
      for (const m of c.multiattack ?? [])
        expect(
          c.attacks.map((a) => a.name),
          c.id,
        ).toContain(m.attack);
      expect(c.habitats.length, c.id).toBeGreaterThan(0);
    }
  });

  it("is safe at each creature's own intensity: names, descriptions, attacks and traits", () => {
    for (const c of SRD_BESTIARY) {
      const words = [
        c.name,
        c.description,
        ...c.attacks.map((a) => a.name),
        ...c.specials.map((s) => s.name),
        ...c.traits.map((t) => `${t.name}. ${t.description}`),
      ];
      for (const text of words)
        expect(checkNarration(text, world, { intensity: c.minIntensity }).ok, `${c.id}: ${text}`).toBe(true);
    }
  });

  it("joins every world's index, with the world's own creatures alongside", () => {
    expect(index.creatures.size).toBe(SRD_BESTIARY.length + world.creatures.length);
    expect(index.creatures.get("gloom-mite")?.name).toBe("Gloom Mite");
    expect(index.creatures.get("owlbear")?.multiattack).toEqual([{ attack: "Rend", count: 2 }]);
  });

  it("keeps creatures to the stories they suit, and out of the ones that left them out", () => {
    const light = { intensity: "light" as const, avoid: [] };
    expect(creatureAllowed(creature("wolf"), light)).toBe(true);
    expect(creatureAllowed(creature("giant-spider"), light)).toBe(false);
    expect(creatureAllowed(creature("giant-spider"), { intensity: "classic", avoid: [] })).toBe(true);
    expect(creatureAllowed(creature("wraith"), { intensity: "classic", avoid: [] })).toBe(false);
    expect(creatureAllowed(creature("wraith"), { intensity: "epic", avoid: [] })).toBe(true);
    for (const id of ["giant-spider", "phase-spider", "ettercap", "giant-wolf-spider"])
      expect(matchesTopic(creature(id), "spiders"), id).toBe(true);
    expect(matchesTopic(creature("wolf"), "spiders")).toBe(false);
    for (const id of ["wolf", "dire-wolf", "worg", "winter-wolf"])
      expect(matchesTopic(creature(id), "wolves"), id).toBe(true);
    expect(matchesTopic(creature("skeleton"), "the undead")).toBe(true);
    expect(matchesTopic(creature("young-red-dragon"), "dragons")).toBe(true);
    expect(matchesTopic(creature("swarm-of-venomous-snakes"), "snakes")).toBe(true);
    expect(matchesTopic(creature("wolf"), "being lost in the dark")).toBe(false);
    // Grotesque things never made it in.
    for (const id of ["zombie", "ghoul", "vampire-vampire", "lich", "succubus", "balor", "gibbering-mouther"])
      expect(index.creatures.has(id), id).toBe(false);
  });

  it("finds wild foes where they live, at the table's intensity, never friends or left-out topics", () => {
    const wood = index.regions.get("whisperwood");
    if (!wood) throw new Error("whisperwood");
    expect([...regionHabitats(wood)].sort()).toEqual(["forest", "river"]);
    const rng = createRng("wild");
    const seen = new Set<string>();
    for (let i = 0; i < 300; i++) {
      const picked = pickWild({
        creatures: index.creatures,
        region: wood,
        levels: [1],
        difficulty: "low",
        rules: { intensity: "light", avoid: ["bears"] },
        rng,
      });
      for (const { creature: c } of picked) {
        seen.add(c.id);
        expect(c.friendly, c.id).toBe(false);
        expect(c.minIntensity, c.id).toBe("light");
        expect(matchesTopic(c, "bears"), c.id).toBe(false);
        expect(creatureXp(c) * 0.5, c.id).toBeLessThanOrEqual(50);
      }
    }
    // A real mix: the world's own creatures and the forest's.
    expect(seen.size).toBeGreaterThan(5);
    expect([...seen].some((id) => !world.creatures.some((c) => c.id === id))).toBe(true);
  });
});

describe("real stat blocks in a fight", () => {
  const fight = (foeId: string, heroes: HeroCombatant[], seed: string, hpScale = 1): CombatState =>
    buildEncounter({
      foes: [{ creature: creature(foeId), count: 1, hpScale }],
      heroes,
      rng: createRng(seed),
    });

  it("makes every attack of a multiattack", () => {
    const heroes = [hero("a", 5, 60)];
    const state = fight("owlbear", heroes, "owl");
    const r = resolveCombatRound(
      state,
      heroes,
      { a: { kind: "defend" } },
      index.creatures,
      createRng("owl-1"),
    );
    expect(r.events.filter((e) => e.kind === "foe_attack" && e.roll?.label === "Rend")).toHaveLength(2);
  });

  it("breathes on up to two heroes, who each roll a save, then waits for the breath to come back", () => {
    const heroes = [hero("a", 10, 150), hero("b", 10, 150), hero("c", 10, 150)];
    let state = fight("young-red-dragon", heroes, "breath");
    let current = heroes;
    const r = resolveCombatRound(state, current, {}, index.creatures, createRng("breath-1"));
    const breaths = r.events.filter((e) => e.roll?.label.startsWith("Fire Breath"));
    expect(breaths.length).toBeGreaterThanOrEqual(1);
    expect(breaths.length).toBeLessThanOrEqual(2);
    for (const b of breaths) {
      expect(b.roll?.against).toBe("DC 17");
      expect(b.roll?.label).toMatch(/'s DEX save$/);
    }
    expect(r.state.foes[0]?.spent).toEqual(["Fire Breath"]);
    // Until it recharges, the dragon claws instead.
    state = r.state;
    current = r.heroes;
    let clawed = false;
    for (let i = 0; i < 6 && !clawed; i++) {
      const next = resolveCombatRound(state, current, {}, index.creatures, createRng(`breath-${i + 2}`));
      if (next.events.some((e) => e.roll?.label === "Rend")) clawed = true;
      state = next.state;
      current = next.heroes;
    }
    expect(clawed).toBe(true);
  });

  it("hurts what is weak to the blow twice as much, and can't hurt what is immune", () => {
    const maceHeroes = [hero("a", 3, 40, "mace")];
    let skeletonHits = 0;
    for (let i = 0; i < 30; i++) {
      const state = fight("skeleton", maceHeroes, `bones-${i}`);
      const r = resolveCombatRound(
        state,
        maceHeroes,
        { a: { kind: "attack" } },
        index.creatures,
        createRng(`b-${i}`),
      );
      const hit = r.events.find((e) => e.kind === "attack" && e.roll?.success);
      if (hit) {
        skeletonHits++;
        expect(hit.text).toContain("twice as much");
      }
    }
    expect(skeletonHits).toBeGreaterThan(0);
    const swordHeroes = [hero("a", 3, 40, "longsword")];
    for (let i = 0; i < 30; i++) {
      const state = fight("black-pudding", swordHeroes, `ooze-${i}`);
      const r = resolveCombatRound(
        state,
        swordHeroes,
        { a: { kind: "attack" } },
        index.creatures,
        createRng(`o-${i}`),
      );
      expect(r.state.foes[0]?.hp).toBe(state.foes[0]?.hp);
    }
  });

  it("only sends a young dragon at heroes who can stand up to it", () => {
    const wanted = [{ creature: creature("young-red-dragon"), count: 1 }];
    const strong = balanceEncounter({
      foes: wanted,
      heroes: [hero("a", 10, 90), hero("b", 10, 90), hero("c", 10, 90), hero("d", 10, 90)],
      difficulty: "high",
      creatures: index.creatures,
    });
    expect(strong.foes[0]?.creature.id).toBe("young-red-dragon");
    const weak = balanceEncounter({
      foes: wanted,
      heroes: [hero("a")],
      difficulty: "high",
      creatures: index.creatures,
    });
    expect(weak.foes.some((f) => f.creature.id === "young-red-dragon")).toBe(false);
    expect(weak.foes.every((f) => !f.creature.friendly)).toBe(true);
  });
});

describe("defenses and misses", () => {
  it("knows where a creature's defense comes from", () => {
    expect(defenseOf(creature("wolf"))).toBe("agile");
    expect(defenseOf(creature("shadow-wolf"))).toBe("agile");
    expect(defenseOf(creature("owlbear"))).toBe("hide");
    expect(defenseOf(creature("knight"))).toBe("armor");
    expect(defenseOf(creature("gloam-knight"))).toBe("armor");
    expect(defenseOf(creature("mage"))).toBe("ward");
  });

  it("plays misses as the SRD has them, with or without the partial-hits flag until it's built", () => {
    const h = hero("a");
    const wolfFight = buildEncounter({
      foes: [{ creature: creature("shadow-wolf"), count: 1 }],
      heroes: [h],
      rng: createRng("w"),
    });
    const foe = wolfFight.foes[0] as NonNullable<(typeof wolfFight.foes)[number]>;
    let misses = 0;
    for (let i = 0; i < 200; i++) {
      for (const partialHits of [false, true]) {
        const r = resolveCombatRound(
          wolfFight,
          [h],
          { a: { kind: "attack" } },
          index.creatures,
          createRng(`n${i}`),
          { partialHits },
        );
        // The wolf may get there first and knock the hero down before they swing.
        const swing = r.events.find((e) => e.kind === "attack");
        if (!swing?.roll) continue;
        expect(swing.roll.against).toBe(`defense ${foe.ac}`);
        if (!swing.roll.success) {
          misses++;
          expect(swing.roll.damage).toBeUndefined();
          expect(r.state.foes[0]?.hp).toBe(foe.hp);
        }
      }
    }
    expect(misses).toBeGreaterThan(0);
  });
});
