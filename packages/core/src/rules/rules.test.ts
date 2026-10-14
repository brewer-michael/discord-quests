import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { createRng, faceValue, sequenceRng } from "../rng/index";
import { abilityModifier, addIncrements } from "./abilities";
import { deriveStats, hitPointMax } from "./character";
import {
  attackHitProbability,
  combineMode,
  difficultyLabel,
  resolveCheck,
  successProbability,
} from "./checks";
import { applyDamageToHero, healHero, moraleCheck, partyIsDown, rollAttack, rollRally } from "./combat";
import { attackRollMode } from "./conditions";
import { averageDice, parseDice, rollDice } from "./dice";
import { levelForXp, previewLevelUp } from "./leveling";
import {
  basePointBuyScores,
  canIncrement,
  isLegalAsi,
  isLegalBackgroundBonus,
  isLegalPointBuy,
  pointsRemaining,
  pointsSpent,
} from "./pointbuy";
import { proficiencyBonus } from "./skills";

describe("abilities", () => {
  it("computes modifiers", () => {
    expect([1, 8, 9, 10, 11, 12, 15, 20].map(abilityModifier)).toEqual([-5, -1, -1, 0, 0, 1, 2, 5]);
  });

  it("refuses to raise a score above 20", () => {
    const scores = { str: 20, dex: 10, con: 10, int: 10, wis: 10, cha: 10 };
    expect(() => addIncrements(scores, { str: 1 })).toThrow();
    expect(addIncrements(scores, { dex: 2 }).dex).toBe(12);
  });
});

describe("dice", () => {
  it("parses notation", () => {
    expect(parseDice("1d20+5").terms).toHaveLength(2);
    expect(parseDice("4d6kh3").terms[0]).toMatchObject({
      kind: "dice",
      count: 4,
      sides: 6,
      keep: { highest: true, n: 3 },
    });
    expect(parseDice("d8").terms[0]).toMatchObject({ count: 1, sides: 8 });
    expect(parseDice("2d6 - 1").terms[1]).toMatchObject({ kind: "flat", sign: -1, value: 1 });
  });

  it("rejects nonsense", () => {
    for (const bad of ["", "abc", "1d1", "0d6", "1000d6", "1d20+", "4d6kh5", "1d6*2"]) {
      expect(() => parseDice(bad), bad).toThrow();
    }
  });

  it("rolls within bounds", () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 10 }),
        fc.constantFrom(4, 6, 8, 10, 12, 20),
        fc.string(),
        (n, sides, seed) => {
          const r = rollDice(`${n}d${sides}`, createRng(seed));
          return r.total >= n && r.total <= n * sides;
        },
      ),
    );
  });

  it("doubles dice, not modifiers, on a critical", () => {
    const r = rollDice("1d8+3", createRng("crit"), { critical: true });
    expect(r.terms[0]?.rolls).toHaveLength(2);
    expect(r.terms[1]?.subtotal).toBe(3);
  });

  it("keeps the highest dice", () => {
    const rng = sequenceRng([faceValue(1, 6), faceValue(6, 6), faceValue(5, 6), faceValue(2, 6)]);
    expect(rollDice("4d6kh3", rng).total).toBe(13);
  });

  it("averages", () => {
    expect(averageDice("2d6+2")).toBe(9);
    expect(averageDice("1d4")).toBe(2);
  });
});

describe("checks", () => {
  it("combines advantage and disadvantage", () => {
    expect(combineMode(true, true)).toBe("normal");
    expect(combineMode(true, false)).toBe("advantage");
  });

  it("resolves checks against a DC", () => {
    const rng = sequenceRng([faceValue(12, 20)]);
    const r = resolveCheck({ modifier: 3, dc: 15 }, rng);
    expect(r).toMatchObject({ natural: 12, total: 15, success: true, margin: 0 });
  });

  it("takes the higher roll with advantage", () => {
    const rng = sequenceRng([faceValue(4, 20), faceValue(17, 20)]);
    expect(resolveCheck({ modifier: 0, dc: 10, mode: "advantage" }, rng).natural).toBe(17);
  });

  it("computes exact success probabilities", () => {
    expect(successProbability(0, 11)).toBeCloseTo(0.5);
    expect(successProbability(0, 11, "advantage")).toBeCloseTo(0.75);
    expect(successProbability(0, 11, "disadvantage")).toBeCloseTo(0.25);
    expect(successProbability(5, 30)).toBe(0);
    expect(successProbability(10, 5)).toBe(1);
  });

  it("probability matches simulation", () => {
    const rng = createRng("sim");
    let wins = 0;
    const n = 20000;
    for (let i = 0; i < n; i++)
      if (resolveCheck({ modifier: 4, dc: 16, mode: "advantage" }, rng).success) wins++;
    expect(wins / n).toBeCloseTo(successProbability(4, 16, "advantage"), 1);
  });

  it("attack rolls: nat 20 always hits, nat 1 always misses", () => {
    expect(rollAttack(0, 30, "normal", sequenceRng([faceValue(20, 20)])).hit).toBe(true);
    expect(rollAttack(30, 5, "normal", sequenceRng([faceValue(1, 20)])).hit).toBe(false);
    expect(attackHitProbability(0, 40)).toBeCloseTo(0.05);
    expect(attackHitProbability(40, 5)).toBeCloseTo(0.95);
  });

  it("labels difficulty for kids", () => {
    expect(difficultyLabel(10)).toBe("Easy");
    expect(difficultyLabel(28)).toBe("Nearly impossible");
  });
});

describe("point buy", () => {
  it("prices the standard legal arrays at 27", () => {
    expect(pointsSpent({ str: 15, con: 14, dex: 13, wis: 12, cha: 10, int: 8 })).toBe(27);
    expect(isLegalPointBuy({ str: 15, con: 15, dex: 15, wis: 8, cha: 8, int: 8 })).toBe(true);
    expect(isLegalPointBuy({ str: 15, con: 15, dex: 15, wis: 9, cha: 8, int: 8 })).toBe(false);
  });

  it("guards the +/- buttons", () => {
    const s = basePointBuyScores();
    expect(pointsRemaining(s)).toBe(27);
    expect(canIncrement({ ...s, str: 15 }, "str")).toBe(false);
    expect(canIncrement({ str: 15, dex: 15, con: 15, int: 8, wis: 8, cha: 8 }, "int")).toBe(false);
  });

  it("validates background bonuses and ASIs", () => {
    expect(isLegalBackgroundBonus({ str: 2, con: 1 }, ["str", "con", "wis"])).toBe(true);
    expect(isLegalBackgroundBonus({ str: 1, con: 1, wis: 1 }, ["str", "con", "wis"])).toBe(true);
    expect(isLegalBackgroundBonus({ str: 2, dex: 1 }, ["str", "con", "wis"])).toBe(false);
    expect(isLegalBackgroundBonus({ str: 3 }, ["str", "con", "wis"])).toBe(false);
    expect(isLegalAsi({ str: 2 })).toBe(true);
    expect(isLegalAsi({ str: 1, con: 1 })).toBe(true);
    expect(isLegalAsi({ str: 1, con: 1, dex: 1 })).toBe(false);
    expect(isLegalAsi({ str: 1 })).toBe(false);
  });
});

describe("character", () => {
  const fighter = {
    classId: "fighter" as const,
    level: 1,
    abilities: { str: 17, dex: 12, con: 15, int: 8, wis: 13, cha: 10 },
    skillProficiencies: ["athletics", "perception"] as const,
    expertise: [] as const,
    armorId: "chain-mail",
    shield: true,
  };

  it("derives level-1 fighter stats", () => {
    const d = deriveStats(fighter);
    expect(d.proficiencyBonus).toBe(2);
    expect(d.hitPointMax).toBe(12);
    expect(d.armorClass).toBe(18);
    expect(d.savingThrows.str).toBe(5);
    expect(d.savingThrows.dex).toBe(1);
    expect(d.skills.athletics).toBe(5);
    expect(d.passivePerception).toBe(13);
    expect(d.spellSaveDc).toBeNull();
  });

  it("uses fixed hit points by default", () => {
    expect(hitPointMax({ ...fighter, level: 3 })).toBe(12 + 8 + 8);
  });

  it("gives bards Jack of All Trades from level 2", () => {
    const bard = {
      classId: "bard" as const,
      level: 2,
      abilities: { str: 8, dex: 14, con: 12, int: 10, wis: 13, cha: 15 },
      skillProficiencies: ["performance"] as const,
      expertise: ["persuasion"] as const,
    };
    const d = deriveStats(bard);
    expect(d.skills.athletics).toBe(-1 + 1);
    expect(d.skills.persuasion).toBe(2 + 4);
    expect(d.spellSaveDc).toBe(12);
    expect(d.spellSlots).toEqual([3]);
  });

  it("computes proficiency bonus by level", () => {
    expect([1, 4, 5, 8, 9, 13, 17].map(proficiencyBonus)).toEqual([2, 2, 3, 3, 4, 5, 6]);
  });
});

describe("leveling", () => {
  it("maps XP to levels, capped for the campaign", () => {
    expect(levelForXp(0)).toBe(1);
    expect(levelForXp(299)).toBe(1);
    expect(levelForXp(300)).toBe(2);
    expect(levelForXp(1_000_000)).toBe(10);
  });

  it("previews features and ASIs", () => {
    expect(previewLevelUp("fighter", 3).abilityScoreImprovement).toBe(true);
    expect(previewLevelUp("fighter", 5).abilityScoreImprovement).toBe(true);
    expect(previewLevelUp("rogue", 5).expertiseChoices).toBe(2);
    expect(previewLevelUp("wizard", 4).newFeatures.map((f) => f.id)).toContain("memorize-spell");
  });
});

describe("gentle combat", () => {
  const hero = { hp: 5, hpMax: 10, tempHp: 2, conditions: [] as never[] };

  it("temp HP absorbs first, and 0 HP means Dazed, not dying", () => {
    const out = applyDamageToHero(hero, 20);
    expect(out.absorbedByTemp).toBe(2);
    expect(out.vitality.hp).toBe(0);
    expect(out.vitality.conditions).toContain("dazed");
    expect(out.droppedToZero).toBe(true);
  });

  it("healing wakes a dazed hero", () => {
    const down = applyDamageToHero(hero, 20).vitality;
    const up = healHero(down, 3);
    expect(up.hp).toBe(3);
    expect(up.conditions).not.toContain("dazed");
  });

  it("rally gets a hero back up on 10+", () => {
    const down = applyDamageToHero(hero, 20).vitality;
    expect(rollRally(down, sequenceRng([faceValue(9, 20)])).success).toBe(false);
    const ok = rollRally(down, sequenceRng([faceValue(10, 20)]));
    expect(ok.success).toBe(true);
    expect(ok.vitality.hp).toBe(1);
  });

  it("knows when the whole party is down", () => {
    const down = applyDamageToHero(hero, 20).vitality;
    expect(partyIsDown([down, down])).toBe(true);
    expect(partyIsDown([down, hero])).toBe(false);
  });

  it("brave creatures never flee", () => {
    expect(moraleCheck("brave", createRng("x")).breaks).toBe(false);
    expect(moraleCheck("skittish", createRng("x")).breaks).toBe(true);
  });

  it("prone targets are easier up close, harder at range", () => {
    expect(attackRollMode({ attacker: [], target: ["prone"], melee: true })).toBe("advantage");
    expect(attackRollMode({ attacker: [], target: ["prone"], melee: false })).toBe("disadvantage");
    expect(attackRollMode({ attacker: ["poisoned"], target: ["restrained"], melee: true })).toBe("normal");
  });
});
