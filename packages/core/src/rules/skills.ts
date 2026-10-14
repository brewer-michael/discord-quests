import type { Ability } from "./abilities";

export const SKILLS = {
  acrobatics: "dex",
  animalHandling: "wis",
  arcana: "int",
  athletics: "str",
  deception: "cha",
  history: "int",
  insight: "wis",
  intimidation: "cha",
  investigation: "int",
  medicine: "wis",
  nature: "int",
  perception: "wis",
  performance: "cha",
  persuasion: "cha",
  religion: "int",
  sleightOfHand: "dex",
  stealth: "dex",
  survival: "wis",
} as const satisfies Record<string, Ability>;

export type Skill = keyof typeof SKILLS;
export const SKILL_IDS = Object.keys(SKILLS) as Skill[];

export const SKILL_NAMES: Record<Skill, string> = {
  acrobatics: "Acrobatics",
  animalHandling: "Animal Handling",
  arcana: "Arcana",
  athletics: "Athletics",
  deception: "Deception",
  history: "History",
  insight: "Insight",
  intimidation: "Intimidation",
  investigation: "Investigation",
  medicine: "Medicine",
  nature: "Nature",
  perception: "Perception",
  performance: "Performance",
  persuasion: "Persuasion",
  religion: "Religion",
  sleightOfHand: "Sleight of Hand",
  stealth: "Stealth",
  survival: "Survival",
};

export function isSkill(value: string): value is Skill {
  return value in SKILLS;
}

export function skillAbility(skill: Skill): Ability {
  return SKILLS[skill];
}

export function proficiencyBonus(level: number): number {
  if (level < 1 || level > 20) throw new RangeError(`Level must be 1-20, got ${level}`);
  return 2 + Math.floor((level - 1) / 4);
}
