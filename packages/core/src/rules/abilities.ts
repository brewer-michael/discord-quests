export const ABILITIES = ["str", "dex", "con", "int", "wis", "cha"] as const;
export type Ability = (typeof ABILITIES)[number];
export type AbilityScores = Record<Ability, number>;

export const ABILITY_NAMES: Record<Ability, string> = {
  str: "Strength",
  dex: "Dexterity",
  con: "Constitution",
  int: "Intelligence",
  wis: "Wisdom",
  cha: "Charisma",
};

/** Plain-language descriptions for young players. */
export const ABILITY_KID_HINTS: Record<Ability, string> = {
  str: "How strong you are: lifting, climbing, pushing.",
  dex: "How quick and nimble you are: sneaking, dodging, aiming.",
  con: "How tough you are: staying healthy and not giving up.",
  int: "How much you know and how well you figure things out.",
  wis: "How well you notice things and understand people.",
  cha: "How well you talk, perform, and make friends.",
};

export const MIN_SCORE = 1;
export const MAX_SCORE = 20;

export function isAbility(value: string): value is Ability {
  return (ABILITIES as readonly string[]).includes(value);
}

export function abilityModifier(score: number): number {
  return Math.floor((score - 10) / 2);
}

export function formatModifier(mod: number): string {
  return mod >= 0 ? `+${mod}` : `${mod}`;
}

export function modifiers(scores: AbilityScores): AbilityScores {
  return {
    str: abilityModifier(scores.str),
    dex: abilityModifier(scores.dex),
    con: abilityModifier(scores.con),
    int: abilityModifier(scores.int),
    wis: abilityModifier(scores.wis),
    cha: abilityModifier(scores.cha),
  };
}

export function emptyScores(value = 10): AbilityScores {
  return { str: value, dex: value, con: value, int: value, wis: value, cha: value };
}

export type AbilityIncrements = Partial<Record<Ability, number>>;

/** Adds increments to scores. Throws if any result would exceed the cap. */
export function addIncrements(scores: AbilityScores, inc: AbilityIncrements, cap = MAX_SCORE): AbilityScores {
  const out = { ...scores };
  for (const ability of ABILITIES) {
    const add = inc[ability] ?? 0;
    if (add === 0) continue;
    const next = out[ability] + add;
    if (next > cap) throw new RangeError(`${ABILITY_NAMES[ability]} would exceed ${cap}`);
    out[ability] = next;
  }
  return out;
}

export function incrementTotal(inc: AbilityIncrements): number {
  return ABILITIES.reduce((sum, a) => sum + (inc[a] ?? 0), 0);
}
