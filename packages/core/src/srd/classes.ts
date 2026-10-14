import type { Ability } from "../rules/abilities";
import type { Skill } from "../rules/skills";

export const SRD_CLASS_IDS = ["fighter", "rogue", "wizard", "cleric", "ranger", "bard"] as const;
export type SrdClassId = (typeof SRD_CLASS_IDS)[number];
export type ArmorCategory = "light" | "medium" | "heavy" | "shield";
export type CasterKind = "full" | "half" | "none";

export interface ClassFeature {
  level: number;
  id: string;
  name: string;
  /** Our own plain-language summary of what the feature does in play. */
  summary: string;
}

export interface SrdClass {
  id: SrdClassId;
  name: string;
  hitDie: 6 | 8 | 10 | 12;
  primaryAbilities: Ability[];
  savingThrows: [Ability, Ability];
  skillChoices: { count: number; from: Skill[] | "any" };
  armorTraining: ArmorCategory[];
  weaponTraining: Array<"simple" | "martial">;
  caster: CasterKind;
  spellcastingAbility?: Ability;
  /** Indexed by level - 1, levels 1-10. */
  cantripsKnown?: number[];
  preparedSpells?: number[];
  asiLevels: number[];
  /** Levels at which the class gains Expertise in this many skills. */
  expertiseAt?: Record<number, number>;
  features: ClassFeature[];
}

const ASI = (level: number): ClassFeature => ({
  level,
  id: `asi-${level}`,
  name: "Ability Score Improvement",
  summary: "Raise one ability by 2, or two abilities by 1 each (max 20).",
});

export const SRD_CLASSES: Record<SrdClassId, SrdClass> = {
  fighter: {
    id: "fighter",
    name: "Fighter",
    hitDie: 10,
    primaryAbilities: ["str", "dex"],
    savingThrows: ["str", "con"],
    skillChoices: {
      count: 2,
      from: [
        "acrobatics",
        "animalHandling",
        "athletics",
        "history",
        "insight",
        "intimidation",
        "persuasion",
        "perception",
        "survival",
      ],
    },
    armorTraining: ["light", "medium", "heavy", "shield"],
    weaponTraining: ["simple", "martial"],
    caster: "none",
    asiLevels: [4, 6, 8],
    features: [
      {
        level: 1,
        id: "fighting-style",
        name: "Fighting Style",
        summary: "A trained combat specialty, such as defense or archery.",
      },
      {
        level: 1,
        id: "second-wind",
        name: "Second Wind",
        summary: "Catch your breath to regain 1d10 + your level in hit points.",
      },
      {
        level: 2,
        id: "action-surge",
        name: "Action Surge",
        summary: "Once per rest, take one extra action on your turn.",
      },
      { level: 3, id: "subclass", name: "Fighter Specialty", summary: "Choose a fighting tradition." },
      ASI(4),
      {
        level: 5,
        id: "extra-attack",
        name: "Extra Attack",
        summary: "Attack twice when you take the Attack action.",
      },
      ASI(6),
      {
        level: 7,
        id: "subclass-7",
        name: "Specialty Feature",
        summary: "Your tradition grants a new ability.",
      },
      ASI(8),
      {
        level: 9,
        id: "indomitable",
        name: "Indomitable",
        summary: "Reroll a failed saving throw once per long rest.",
      },
      {
        level: 10,
        id: "subclass-10",
        name: "Specialty Feature",
        summary: "Your tradition grants a new ability.",
      },
    ],
  },
  rogue: {
    id: "rogue",
    name: "Rogue",
    hitDie: 8,
    primaryAbilities: ["dex"],
    savingThrows: ["dex", "int"],
    skillChoices: {
      count: 4,
      from: [
        "acrobatics",
        "athletics",
        "deception",
        "insight",
        "intimidation",
        "investigation",
        "perception",
        "persuasion",
        "sleightOfHand",
        "stealth",
      ],
    },
    armorTraining: ["light"],
    weaponTraining: ["simple", "martial"],
    caster: "none",
    asiLevels: [4, 8, 10],
    expertiseAt: { 1: 2, 6: 2 },
    features: [
      {
        level: 1,
        id: "expertise",
        name: "Expertise",
        summary: "Double your proficiency bonus for two chosen skills.",
      },
      {
        level: 1,
        id: "sneak-attack",
        name: "Sneak Attack",
        summary: "Extra damage once per turn when you have the upper hand.",
      },
      {
        level: 2,
        id: "cunning-action",
        name: "Cunning Action",
        summary: "Dash, Disengage or Hide as a bonus action.",
      },
      { level: 3, id: "subclass", name: "Rogue Specialty", summary: "Choose a rogue tradition." },
      {
        level: 3,
        id: "steady-aim",
        name: "Steady Aim",
        summary: "Hold still to give your next attack advantage.",
      },
      ASI(4),
      {
        level: 5,
        id: "uncanny-dodge",
        name: "Uncanny Dodge",
        summary: "Halve the damage from an attack you can see.",
      },
      { level: 6, id: "expertise-6", name: "Expertise", summary: "Two more skills gain Expertise." },
      { level: 7, id: "evasion", name: "Evasion", summary: "Dodge out of the way of area effects." },
      {
        level: 7,
        id: "reliable-talent",
        name: "Reliable Talent",
        summary: "Treat low rolls on trained skills as a 10.",
      },
      ASI(8),
      {
        level: 9,
        id: "subclass-9",
        name: "Specialty Feature",
        summary: "Your tradition grants a new ability.",
      },
      ASI(10),
    ],
  },
  wizard: {
    id: "wizard",
    name: "Wizard",
    hitDie: 6,
    primaryAbilities: ["int"],
    savingThrows: ["int", "wis"],
    skillChoices: {
      count: 2,
      from: ["arcana", "history", "insight", "investigation", "medicine", "nature", "religion"],
    },
    armorTraining: [],
    weaponTraining: ["simple"],
    caster: "full",
    spellcastingAbility: "int",
    cantripsKnown: [3, 3, 3, 4, 4, 4, 4, 4, 4, 5],
    preparedSpells: [4, 5, 6, 7, 9, 10, 11, 12, 14, 15],
    asiLevels: [4, 8],
    features: [
      {
        level: 1,
        id: "spellcasting",
        name: "Spellcasting",
        summary: "Cast wizard spells using Intelligence.",
      },
      {
        level: 1,
        id: "arcane-recovery",
        name: "Arcane Recovery",
        summary: "Recover some spell slots after a short rest.",
      },
      { level: 2, id: "scholar", name: "Scholar", summary: "Gain Expertise in one knowledge skill." },
      { level: 3, id: "subclass", name: "Wizard School", summary: "Choose a school of magic." },
      ASI(4),
      {
        level: 5,
        id: "memorize-spell",
        name: "Memorize Spell",
        summary: "Swap a prepared spell after a short rest.",
      },
      { level: 6, id: "subclass-6", name: "School Feature", summary: "Your school grants a new ability." },
      ASI(8),
      { level: 10, id: "subclass-10", name: "School Feature", summary: "Your school grants a new ability." },
    ],
  },
  cleric: {
    id: "cleric",
    name: "Cleric",
    hitDie: 8,
    primaryAbilities: ["wis"],
    savingThrows: ["wis", "cha"],
    skillChoices: { count: 2, from: ["history", "insight", "medicine", "persuasion", "religion"] },
    armorTraining: ["light", "medium", "shield"],
    weaponTraining: ["simple"],
    caster: "full",
    spellcastingAbility: "wis",
    cantripsKnown: [3, 3, 3, 4, 4, 4, 4, 4, 4, 5],
    preparedSpells: [4, 5, 6, 7, 9, 10, 11, 12, 14, 15],
    asiLevels: [4, 8],
    features: [
      { level: 1, id: "spellcasting", name: "Spellcasting", summary: "Cast cleric spells using Wisdom." },
      {
        level: 1,
        id: "divine-order",
        name: "Calling",
        summary: "Choose to be a protector or a scholar of the light.",
      },
      {
        level: 2,
        id: "channel-divinity",
        name: "Channel Light",
        summary: "Call on the light for special effects a few times per rest.",
      },
      { level: 3, id: "subclass", name: "Domain", summary: "Choose a domain of the light." },
      ASI(4),
      {
        level: 5,
        id: "sear",
        name: "Searing Light",
        summary: "Your Channel Light can drive back creatures of shadow.",
      },
      { level: 6, id: "subclass-6", name: "Domain Feature", summary: "Your domain grants a new ability." },
      {
        level: 7,
        id: "blessed-strikes",
        name: "Blessed Strikes",
        summary: "Your attacks or cantrips carry extra light.",
      },
      ASI(8),
      {
        level: 10,
        id: "divine-intervention",
        name: "Call for Aid",
        summary: "Once per long rest, ask the light for help.",
      },
    ],
  },
  ranger: {
    id: "ranger",
    name: "Ranger",
    hitDie: 10,
    primaryAbilities: ["dex", "wis"],
    savingThrows: ["str", "dex"],
    skillChoices: {
      count: 3,
      from: [
        "animalHandling",
        "athletics",
        "insight",
        "investigation",
        "nature",
        "perception",
        "stealth",
        "survival",
      ],
    },
    armorTraining: ["light", "medium", "shield"],
    weaponTraining: ["simple", "martial"],
    caster: "half",
    spellcastingAbility: "wis",
    preparedSpells: [2, 3, 4, 5, 6, 6, 7, 7, 9, 9],
    asiLevels: [4, 8],
    expertiseAt: { 2: 1, 9: 2 },
    features: [
      { level: 1, id: "spellcasting", name: "Spellcasting", summary: "Cast ranger spells using Wisdom." },
      {
        level: 1,
        id: "favored-enemy",
        name: "Favored Quarry",
        summary: "Always have Hunter's Mark ready, with free uses.",
      },
      {
        level: 2,
        id: "deft-explorer",
        name: "Deft Explorer",
        summary: "Expertise in one skill and extra languages.",
      },
      { level: 2, id: "fighting-style", name: "Fighting Style", summary: "A trained combat specialty." },
      { level: 3, id: "subclass", name: "Ranger Path", summary: "Choose a ranger path." },
      ASI(4),
      {
        level: 5,
        id: "extra-attack",
        name: "Extra Attack",
        summary: "Attack twice when you take the Attack action.",
      },
      { level: 6, id: "roving", name: "Roving", summary: "Move faster, and climb and swim easily." },
      { level: 7, id: "subclass-7", name: "Path Feature", summary: "Your path grants a new ability." },
      ASI(8),
      { level: 9, id: "expertise-9", name: "Expertise", summary: "Two more skills gain Expertise." },
      {
        level: 10,
        id: "tireless",
        name: "Tireless",
        summary: "Shake off weariness and gain temporary hit points.",
      },
    ],
  },
  bard: {
    id: "bard",
    name: "Bard",
    hitDie: 8,
    primaryAbilities: ["cha"],
    savingThrows: ["dex", "cha"],
    skillChoices: { count: 3, from: "any" },
    armorTraining: ["light"],
    weaponTraining: ["simple"],
    caster: "full",
    spellcastingAbility: "cha",
    cantripsKnown: [2, 2, 2, 3, 3, 3, 3, 3, 3, 4],
    preparedSpells: [4, 5, 6, 7, 9, 10, 11, 12, 14, 15],
    asiLevels: [4, 8],
    expertiseAt: { 2: 2, 9: 2 },
    features: [
      {
        level: 1,
        id: "bardic-inspiration",
        name: "Inspiration",
        summary: "Give a friend a bonus die to add to a roll.",
      },
      { level: 1, id: "spellcasting", name: "Spellcasting", summary: "Cast bard spells using Charisma." },
      {
        level: 2,
        id: "expertise",
        name: "Expertise",
        summary: "Double your proficiency bonus for two chosen skills.",
      },
      {
        level: 2,
        id: "jack-of-all-trades",
        name: "Jack of All Trades",
        summary: "Add half your proficiency to checks you're untrained in.",
      },
      { level: 3, id: "subclass", name: "Bard College", summary: "Choose a college of song." },
      ASI(4),
      {
        level: 5,
        id: "font-of-inspiration",
        name: "Font of Inspiration",
        summary: "Regain Inspiration on a short rest.",
      },
      { level: 6, id: "subclass-6", name: "College Feature", summary: "Your college grants a new ability." },
      {
        level: 7,
        id: "countercharm",
        name: "Countercharm",
        summary: "Help friends shake off spooks and beguiling.",
      },
      ASI(8),
      { level: 9, id: "expertise-9", name: "Expertise", summary: "Two more skills gain Expertise." },
      {
        level: 10,
        id: "magical-secrets",
        name: "Magical Secrets",
        summary: "Learn spells from other spell lists.",
      },
    ],
  },
};

export function isSrdClassId(value: string): value is SrdClassId {
  return (SRD_CLASS_IDS as readonly string[]).includes(value);
}

/** Spell slots per spell level, indexed [characterLevel - 1][spellLevel - 1]. Levels 1-10. */
export const SPELL_SLOTS: Record<Exclude<CasterKind, "none">, number[][]> = {
  full: [
    [2],
    [3],
    [4, 2],
    [4, 3],
    [4, 3, 2],
    [4, 3, 3],
    [4, 3, 3, 1],
    [4, 3, 3, 2],
    [4, 3, 3, 3, 1],
    [4, 3, 3, 3, 2],
  ],
  half: [[2], [2], [3], [3], [4, 2], [4, 2], [4, 3], [4, 3], [4, 3, 2], [4, 3, 2]],
};

export function spellSlots(caster: CasterKind, level: number): number[] {
  if (caster === "none") return [];
  const row = SPELL_SLOTS[caster][Math.min(level, 10) - 1];
  return row ? [...row] : [];
}

export function sneakAttackDice(level: number): string {
  return `${Math.ceil(level / 2)}d6`;
}

export function bardicInspirationDie(level: number): string {
  if (level >= 15) return "1d12";
  if (level >= 10) return "1d10";
  if (level >= 5) return "1d8";
  return "1d6";
}

export function secondWindUses(level: number): number {
  if (level >= 10) return 4;
  if (level >= 4) return 3;
  return 2;
}

export function channelDivinityUses(level: number): number {
  if (level >= 18) return 4;
  if (level >= 6) return 3;
  if (level >= 2) return 2;
  return 0;
}
