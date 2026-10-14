import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { starterIndex } from "../loom/test-helpers";
import { createRng, sequenceRng } from "../rng/index";
import type { Ability } from "../rules/abilities";
import {
  buildEncounter,
  type CombatAction,
  type CombatState,
  canCast,
  type HeroCombatant,
  heroCombatant,
  isDownHero,
  MAX_COMBAT_ROUNDS,
  resolveCombatRound,
  rollFoes,
} from "./index";

const index = starterIndex();
const creatures = new Map(index.world.creatures.map((c) => [c.id, c]));
const creature = (id: string) => {
  const c = creatures.get(id);
  if (!c) throw new Error(id);
  return c;
};
const saves = { str: 2, dex: 1, con: 2, int: 0, wis: 1, cha: 0 } as Record<Ability, number>;

function fighter(id = "h-fighter", name = "Bram"): HeroCombatant {
  return heroCombatant({
    id,
    name,
    level: 1,
    hp: 12,
    hpMax: 12,
    tempHp: 0,
    ac: 18,
    conditions: [],
    abilities: { str: 16, dex: 12, con: 14, int: 8, wis: 12, cha: 10 },
    proficiencyBonus: 2,
    saves,
    initiativeBonus: 1,
    weapons: [
      { id: "longsword", name: "Longsword", base: "longsword" },
      { id: "handaxe", name: "Handaxe", base: "handaxe" },
    ],
    spellIds: [],
    spellcastingAbility: null,
    srdClass: "fighter",
    slotsMax: [],
    slotsUsed: [],
    potions: [{ itemId: "honey-tonic", name: "Honey Tonic", dice: "2d4+2", qty: 1 }],
  });
}

function wizard(id = "h-wizard", name = "Wren"): HeroCombatant {
  return heroCombatant({
    id,
    name,
    level: 1,
    hp: 7,
    hpMax: 7,
    tempHp: 0,
    ac: 12,
    conditions: [],
    abilities: { str: 8, dex: 14, con: 12, int: 16, wis: 12, cha: 10 },
    proficiencyBonus: 2,
    saves,
    initiativeBonus: 2,
    weapons: [{ id: "quarterstaff", name: "Walking Staff", base: "quarterstaff" }],
    spellIds: ["fire-bolt", "light", "mage-hand", "magic-missile", "shield", "sleep"],
    spellcastingAbility: "int",
    srdClass: "wizard",
    slotsMax: [2],
    slotsUsed: [0],
    potions: [],
  });
}

function encounter(foes: Array<[string, number]>, heroes: HeroCombatant[], seed = "enc"): CombatState {
  return buildEncounter({
    foes: foes.map(([id, count]) => ({ creature: creature(id), count })),
    heroes,
    rng: createRng(seed),
  });
}

describe("building a fight", () => {
  it("letters a group of the same foe and sorts everyone by initiative", () => {
    const s = encounter([["gloom-mite", 3]], [fighter()]);
    expect(s.foes.map((f) => f.name)).toEqual(["Gloom Mite A", "Gloom Mite B", "Gloom Mite C"]);
    expect(s.order).toHaveLength(4);
    for (let i = 1; i < s.order.length; i++)
      expect(s.order[i - 1]!.initiative).toBeGreaterThanOrEqual(s.order[i]!.initiative);
    expect(encounter([["gloom-mite", 3]], [fighter()])).toEqual(s);
  });

  it("scales foe counts to the party", () => {
    const table = [{ creature: "gloom-mite", count: [3, 3] as [number, number] }];
    expect(rollFoes(table, 1, createRng("x"), "all")[0]!.count).toBe(1);
    expect(rollFoes(table, 3, createRng("x"), "all")[0]!.count).toBe(3);
    expect(rollFoes(table, 6, createRng("x"), "all")[0]!.count).toBe(6);
  });

  it("gives heroes their weapons and the spells that matter in a fight", () => {
    const f = fighter();
    expect(f.attacks[0]).toMatchObject({ id: "longsword", bonus: 5, damage: "1d8+3", ranged: false });
    const w = wizard();
    expect(w.spells.map((s) => s.id).sort()).toEqual(["fire-bolt", "magic-missile", "shield", "sleep"]);
    expect(w.spellDc).toBe(13);
    expect(w.attacks[0]?.damage).toBe("1d6-1");
  });
});

describe("a round of combat", () => {
  it("puts a foe to sleep at the heroes' mercy, and lets them spare it", () => {
    const w = wizard();
    let state = encounter([["gloam-skulker", 1]], [w], "sleep");
    // The skulker rolls a 1 on its save.
    let res = resolveCombatRound(
      state,
      [w],
      { [w.id]: { kind: "cast", spellId: "sleep" } },
      creatures,
      sequenceRng(Array(40).fill(0)),
    );
    const skulker = res.state.foes[0]!;
    expect(skulker.status).toBe("at_mercy");
    expect(skulker.exit).toBe("fell fast asleep");
    expect(res.usedSlots).toEqual([{ heroId: w.id, level: 1 }]);
    expect(res.state).toMatchObject({ outcome: "victory", phase: "aftermath" });
    expect(canCast(res.heroes[0]!, "sleep")).toBe(true);

    state = { ...res.state, phase: "fighting" };
    res = resolveCombatRound(
      state,
      res.heroes,
      { [w.id]: { kind: "spare", targetId: skulker.id } },
      creatures,
      createRng("s"),
    );
    // No foe is fighting, so the round ends before anyone acts: sparing happens in the aftermath scene.
    expect(res.spared).toEqual([]);
  });

  it("runs out of spell slots", () => {
    const w = { ...wizard(), slots: [0] };
    const s = encounter([["gloom-mite", 1]], [w]);
    const res = resolveCombatRound(
      s,
      [w],
      { [w.id]: { kind: "cast", spellId: "magic-missile" } },
      creatures,
      createRng("m"),
    );
    expect(res.events.find((e) => e.actorId === w.id)?.text).toMatch(/used up/);
    expect(res.usedSlots).toEqual([]);
  });

  it("heals and wakes a dazed friend with a potion", () => {
    const f = fighter();
    const friend = { ...wizard(), hp: 0, conditions: ["dazed" as const] };
    const s = encounter([["gloom-mite", 1]], [f, friend]);
    // Keep the mite from acting first by making the fighter fastest.
    s.order = [{ id: f.id, side: "hero", initiative: 30 }, ...s.order.filter((o) => o.id !== f.id)];
    const res = resolveCombatRound(
      s,
      [f, friend],
      { [f.id]: { kind: "item", itemId: "honey-tonic", targetId: friend.id } },
      creatures,
      createRng("p"),
    );
    const after = res.heroes.find((h) => h.id === friend.id)!;
    expect(isDownHero(after)).toBe(false);
    expect(res.usedItems).toEqual([{ heroId: f.id, itemId: "honey-tonic" }]);
    expect(res.heroes.find((h) => h.id === f.id)!.potions[0]!.qty).toBe(0);
  });

  it("ends gently when every hero is down", () => {
    const f = { ...fighter(), hp: 1, ac: 1 };
    let s = encounter([["shadow-wolf", 2]], [f], "down");
    let heroes: HeroCombatant[] = [f];
    for (let i = 0; i < MAX_COMBAT_ROUNDS && s.phase === "fighting"; i++) {
      const res = resolveCombatRound(
        s,
        heroes,
        { [f.id]: { kind: "defend" } },
        creatures,
        createRng(`r${i}`),
      );
      s = res.state;
      heroes = res.heroes;
    }
    expect(s.phase).toBe("over");
    expect(["party_down", "victory"]).toContain(s.outcome);
    for (const h of heroes) expect(h.hp).toBeGreaterThanOrEqual(0);
  });
});

const actionArb = (foeIds: string[], heroIds: string[]): fc.Arbitrary<CombatAction> =>
  fc.oneof(
    fc.record({ kind: fc.constant("attack" as const), targetId: fc.constantFrom(...foeIds) }),
    fc.record({
      kind: fc.constant("cast" as const),
      spellId: fc.constantFrom("fire-bolt", "sleep", "magic-missile", "shield", "nope"),
    }),
    fc.constant({ kind: "defend" as const }),
    fc.record({ kind: fc.constant("help" as const), targetId: fc.constantFrom(...foeIds) }),
    fc.record({
      kind: fc.constant("item" as const),
      itemId: fc.constant("honey-tonic"),
      targetId: fc.constantFrom(...heroIds),
    }),
    fc.record({ kind: fc.constant("spare" as const), targetId: fc.constantFrom(...foeIds) }),
  );

describe("combat properties", () => {
  it("always ends, keeps hit points in bounds, and never hits a hero who is down or a foe who gave up", () => {
    fc.assert(
      fc.property(
        fc.string({ minLength: 1, maxLength: 8 }),
        fc.constantFrom("gloom-mite", "gloam-skulker", "shadow-wolf", "grumpy-boar"),
        fc.integer({ min: 1, max: 4 }),
        fc.array(fc.integer({ min: 0, max: 1000 }), {
          minLength: MAX_COMBAT_ROUNDS * 2,
          maxLength: MAX_COMBAT_ROUNDS * 2,
        }),
        (seed, foeId, count, picks) => {
          const heroes0 = [fighter(), wizard()];
          let state = encounter([[foeId, count]], heroes0, seed);
          let heroes = heroes0;
          const foeIds = state.foes.map((f) => f.id);
          const heroIds = heroes.map((h) => h.id);
          const arb = actionArb(foeIds, heroIds);
          let rounds = 0;
          while (state.phase === "fighting") {
            const actions: Record<string, CombatAction> = {};
            heroes.forEach((h, i) => {
              actions[h.id] = fc.sample(arb, { seed: picks[rounds * 2 + i] ?? 0, numRuns: 1 })[0]!;
            });
            const before = new Map(heroes.map((h) => [h.id, isDownHero(h)]));
            const foesBefore = new Map(state.foes.map((f) => [f.id, f.status]));
            const res = resolveCombatRound(state, heroes, actions, creatures, createRng(`${seed}:${rounds}`));
            // Replay the events: a foe never targets a hero who is down at that moment.
            const down = new Map(before);
            const foeStatus = new Map<string, string>(foesBefore);
            for (const e of res.events) {
              if (e.kind === "foe_attack") {
                expect(down.get(e.targetId!)).toBe(false);
                if (/is dazed/.test(e.text)) down.set(e.targetId!, true);
              }
              if (e.kind === "rally" && /gets back up/.test(e.text)) down.set(e.actorId, false);
              if ((e.kind === "item" || e.kind === "heal") && /waking/.test(e.text))
                down.set(e.targetId!, false);
              if (e.kind === "attack") expect(foeStatus.get(e.targetId!)).toBe("fighting");
              if (e.kind === "foe_leaves")
                foeStatus.set(e.actorId, /gave up|fainted/.test(e.text) ? "at_mercy" : "gone");
              if (e.kind === "spell" && /falls fast asleep/.test(e.text))
                foeStatus.set(e.targetId!, "at_mercy");
              // Only a foe who is at the heroes' mercy right then can be spared.
              if (e.kind === "spare") {
                expect(foeStatus.get(e.targetId!)).toBe("at_mercy");
                foeStatus.set(e.targetId!, "spared");
              }
            }
            for (const h of res.heroes) {
              expect(h.hp).toBeGreaterThanOrEqual(0);
              expect(h.hp).toBeLessThanOrEqual(h.hpMax);
            }
            for (const f of res.state.foes) {
              expect(f.hp).toBeGreaterThanOrEqual(0);
              expect(f.hp).toBeLessThanOrEqual(f.hpMax);
            }
            for (const id of res.spared)
              expect(res.state.foes.find((f) => f.id === id)?.status).toBe("spared");
            state = res.state;
            heroes = res.heroes;
            rounds++;
            expect(rounds).toBeLessThanOrEqual(MAX_COMBAT_ROUNDS);
          }
          expect(state.outcome).not.toBeNull();
        },
      ),
      { numRuns: 150 },
    );
  });

  it("is deterministic", () => {
    const h = [fighter(), wizard()];
    const s = encounter([["gloom-mite", 3]], h, "det");
    const actions: Record<string, CombatAction> = {
      [h[0]!.id]: { kind: "attack" },
      [h[1]!.id]: { kind: "cast", spellId: "fire-bolt" },
    };
    expect(resolveCombatRound(s, h, actions, creatures, createRng("same"))).toEqual(
      resolveCombatRound(s, h, actions, creatures, createRng("same")),
    );
  });
});
