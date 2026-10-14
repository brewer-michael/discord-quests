import { SRD_CLASSES, type SrdClassId, spellSlots } from "../srd/classes";
import { SRD_ARMOR, type SrdArmor } from "../srd/equipment";
import { ABILITIES, type Ability, type AbilityScores, abilityModifier, modifiers } from "./abilities";
import { proficiencyBonus, SKILL_IDS, SKILLS, type Skill } from "./skills";

export interface CharacterBuild {
  classId: SrdClassId;
  level: number;
  abilities: AbilityScores;
  skillProficiencies: readonly Skill[];
  expertise: readonly Skill[];
  armorId?: string | null;
  shield?: boolean;
  /** Species walking speed in feet. */
  speed?: number;
  /** Extra hit points per level (e.g. a sturdy species trait). */
  hpBonusPerLevel?: number;
  /** Hit points gained at levels 2+; defaults to the fixed average. */
  hpRolls?: readonly number[];
}

export interface DerivedStats {
  level: number;
  proficiencyBonus: number;
  modifiers: AbilityScores;
  savingThrows: Record<Ability, number>;
  skills: Record<Skill, number>;
  passivePerception: number;
  initiative: number;
  armorClass: number;
  hitPointMax: number;
  hitDie: number;
  speed: number;
  spellSaveDc: number | null;
  spellAttackBonus: number | null;
  spellSlots: number[];
  cantripsKnown: number;
  preparedSpells: number;
}

/** Hit points gained at a level-up when taking the fixed value: half the die + 1. */
export function fixedHpPerLevel(hitDie: number): number {
  return hitDie / 2 + 1;
}

export function hitPointMax(build: CharacterBuild): number {
  const cls = SRD_CLASSES[build.classId];
  const con = abilityModifier(build.abilities.con);
  const bonus = build.hpBonusPerLevel ?? 0;
  let hp = cls.hitDie + con + bonus;
  for (let lvl = 2; lvl <= build.level; lvl++) {
    const gained = build.hpRolls?.[lvl - 2] ?? fixedHpPerLevel(cls.hitDie);
    hp += Math.max(1, gained + con) + bonus;
  }
  return Math.max(1, hp);
}

export function armorClass(abilities: AbilityScores, armor: SrdArmor | null, shield: boolean): number {
  const dex = abilityModifier(abilities.dex);
  let ac: number;
  if (!armor) ac = 10 + dex;
  else if (armor.maxDex === null) ac = armor.ac + dex;
  else ac = armor.ac + Math.min(dex, armor.maxDex);
  return ac + (shield ? 2 : 0);
}

export function deriveStats(build: CharacterBuild): DerivedStats {
  if (build.level < 1 || build.level > 20) throw new RangeError("Level must be 1-20");
  const cls = SRD_CLASSES[build.classId];
  const pb = proficiencyBonus(build.level);
  const mods = modifiers(build.abilities);
  const jackOfAllTrades = build.classId === "bard" && build.level >= 2;

  const savingThrows = Object.fromEntries(
    ABILITIES.map((a) => [a, mods[a] + (cls.savingThrows.includes(a) ? pb : 0)]),
  ) as Record<Ability, number>;

  const skills = Object.fromEntries(
    SKILL_IDS.map((skill) => {
      const base = mods[SKILLS[skill]];
      if (build.expertise.includes(skill)) return [skill, base + pb * 2];
      if (build.skillProficiencies.includes(skill)) return [skill, base + pb];
      return [skill, base + (jackOfAllTrades ? Math.floor(pb / 2) : 0)];
    }),
  ) as Record<Skill, number>;

  const armor = build.armorId ? (SRD_ARMOR[build.armorId] ?? null) : null;
  const castingAbility = cls.spellcastingAbility;

  return {
    level: build.level,
    proficiencyBonus: pb,
    modifiers: mods,
    savingThrows,
    skills,
    passivePerception: 10 + skills.perception,
    initiative: mods.dex,
    armorClass: armorClass(build.abilities, armor, build.shield ?? false),
    hitPointMax: hitPointMax(build),
    hitDie: cls.hitDie,
    speed: build.speed ?? 30,
    spellSaveDc: castingAbility ? 8 + pb + mods[castingAbility] : null,
    spellAttackBonus: castingAbility ? pb + mods[castingAbility] : null,
    spellSlots: spellSlots(cls.caster, build.level),
    cantripsKnown: cls.cantripsKnown?.[Math.min(build.level, 10) - 1] ?? 0,
    preparedSpells: cls.preparedSpells?.[Math.min(build.level, 10) - 1] ?? 0,
  };
}

/** Is the character trained to use this armor? */
export function canWearArmor(classId: SrdClassId, armorId: string): boolean {
  const armor = SRD_ARMOR[armorId];
  if (!armor) return false;
  return SRD_CLASSES[classId].armorTraining.includes(armor.category);
}
