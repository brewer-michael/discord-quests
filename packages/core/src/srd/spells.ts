import type { Ability } from "../rules/abilities";
import type { Condition } from "../rules/conditions";
import type { SrdClassId } from "./classes";

/**
 * A kid-friendly subset of SRD spells, with mechanics only. Descriptions are
 * our own. `effect` tells the combat engine how to resolve the spell.
 */
export type SpellEffect =
  | { kind: "attack"; damage: string; damageType: string; scalesAtLevels?: number[] }
  | {
      kind: "save-damage";
      save: Ability;
      damage: string;
      damageType: string;
      halfOnSave: boolean;
      scalesAtLevels?: number[];
    }
  | { kind: "save-condition"; save: Ability; condition: Condition; rounds: number }
  | { kind: "heal"; dice: string; addModifier: boolean; perSlotAbove?: string }
  | { kind: "auto-damage"; darts: number; dartDamage: string; damageType: string }
  | {
      kind: "buff";
      bonus: string;
      targets: number;
      rounds: number;
      appliesTo: Array<"attack" | "save" | "check" | "ac">;
    }
  | { kind: "utility" };

export interface SrdSpell {
  id: string;
  name: string;
  level: number;
  classes: SrdClassId[];
  castingTime: "action" | "bonus" | "reaction" | "minute";
  range: string;
  concentration: boolean;
  summary: string;
  effect: SpellEffect;
}

const s = (spell: SrdSpell) => spell;

export const SRD_SPELLS: Record<string, SrdSpell> = Object.fromEntries(
  [
    // Cantrips
    s({
      id: "fire-bolt",
      name: "Fire Bolt",
      level: 0,
      classes: ["wizard"],
      castingTime: "action",
      range: "120 ft",
      concentration: false,
      summary: "Fling a mote of fire.",
      effect: { kind: "attack", damage: "1d10", damageType: "fire", scalesAtLevels: [5, 11, 17] },
    }),
    s({
      id: "ray-of-frost",
      name: "Ray of Frost",
      level: 0,
      classes: ["wizard"],
      castingTime: "action",
      range: "60 ft",
      concentration: false,
      summary: "A chilly beam that slows a foe.",
      effect: { kind: "attack", damage: "1d8", damageType: "cold", scalesAtLevels: [5, 11, 17] },
    }),
    s({
      id: "sacred-flame",
      name: "Sacred Flame",
      level: 0,
      classes: ["cleric"],
      castingTime: "action",
      range: "60 ft",
      concentration: false,
      summary: "Bright light falls on a foe.",
      effect: {
        kind: "save-damage",
        save: "dex",
        damage: "1d8",
        damageType: "radiant",
        halfOnSave: false,
        scalesAtLevels: [5, 11, 17],
      },
    }),
    s({
      id: "vicious-mockery",
      name: "Stinging Rhyme",
      level: 0,
      classes: ["bard"],
      castingTime: "action",
      range: "60 ft",
      concentration: false,
      summary: "A rhyme so cheeky it throws a foe off balance.",
      effect: {
        kind: "save-damage",
        save: "wis",
        damage: "1d6",
        damageType: "psychic",
        halfOnSave: false,
        scalesAtLevels: [5, 11, 17],
      },
    }),
    s({
      id: "guidance",
      name: "Guidance",
      level: 0,
      classes: ["cleric"],
      castingTime: "action",
      range: "touch",
      concentration: true,
      summary: "Add 1d4 to a friend's next ability check.",
      effect: { kind: "buff", bonus: "1d4", targets: 1, rounds: 10, appliesTo: ["check"] },
    }),
    s({
      id: "light",
      name: "Light",
      level: 0,
      classes: ["wizard", "cleric", "bard"],
      castingTime: "action",
      range: "touch",
      concentration: false,
      summary: "Make an object glow like a torch.",
      effect: { kind: "utility" },
    }),
    s({
      id: "mage-hand",
      name: "Mage Hand",
      level: 0,
      classes: ["wizard", "bard"],
      castingTime: "action",
      range: "30 ft",
      concentration: false,
      summary: "A floating hand that can carry small things.",
      effect: { kind: "utility" },
    }),
    s({
      id: "minor-illusion",
      name: "Minor Illusion",
      level: 0,
      classes: ["wizard", "bard"],
      castingTime: "action",
      range: "30 ft",
      concentration: false,
      summary: "Create a small sound or picture that isn't really there.",
      effect: { kind: "utility" },
    }),
    s({
      id: "prestidigitation",
      name: "Prestidigitation",
      level: 0,
      classes: ["wizard", "bard"],
      castingTime: "action",
      range: "10 ft",
      concentration: false,
      summary: "Small magic tricks: sparks, smells, cleaning.",
      effect: { kind: "utility" },
    }),
    // Level 1
    s({
      id: "cure-wounds",
      name: "Cure Wounds",
      level: 1,
      classes: ["cleric", "bard", "ranger"],
      castingTime: "action",
      range: "touch",
      concentration: false,
      summary: "Heal a friend you touch.",
      effect: { kind: "heal", dice: "2d8", addModifier: true, perSlotAbove: "2d8" },
    }),
    s({
      id: "healing-word",
      name: "Healing Word",
      level: 1,
      classes: ["cleric", "bard"],
      castingTime: "bonus",
      range: "60 ft",
      concentration: false,
      summary: "A kind word that heals from afar.",
      effect: { kind: "heal", dice: "2d4", addModifier: true, perSlotAbove: "2d4" },
    }),
    s({
      id: "bless",
      name: "Bless",
      level: 1,
      classes: ["cleric"],
      castingTime: "action",
      range: "30 ft",
      concentration: true,
      summary: "Up to three friends add 1d4 to attacks and saves.",
      effect: { kind: "buff", bonus: "1d4", targets: 3, rounds: 10, appliesTo: ["attack", "save"] },
    }),
    s({
      id: "shield-of-faith",
      name: "Shield of Faith",
      level: 1,
      classes: ["cleric"],
      castingTime: "bonus",
      range: "60 ft",
      concentration: true,
      summary: "A shimmering shield gives a friend +2 AC.",
      effect: { kind: "buff", bonus: "2", targets: 1, rounds: 100, appliesTo: ["ac"] },
    }),
    s({
      id: "magic-missile",
      name: "Magic Missile",
      level: 1,
      classes: ["wizard"],
      castingTime: "action",
      range: "120 ft",
      concentration: false,
      summary: "Three glowing darts that never miss.",
      effect: { kind: "auto-damage", darts: 3, dartDamage: "1d4+1", damageType: "force" },
    }),
    s({
      id: "shield",
      name: "Shield",
      level: 1,
      classes: ["wizard"],
      castingTime: "reaction",
      range: "self",
      concentration: false,
      summary: "An invisible barrier: +5 AC until your next turn.",
      effect: { kind: "buff", bonus: "5", targets: 1, rounds: 1, appliesTo: ["ac"] },
    }),
    s({
      id: "sleep",
      name: "Sleep",
      level: 1,
      classes: ["wizard", "bard"],
      castingTime: "action",
      range: "60 ft",
      concentration: true,
      summary: "A drowsy cloud that makes creatures nod off.",
      effect: { kind: "save-condition", save: "wis", condition: "stunned", rounds: 10 },
    }),
    s({
      id: "thunderwave",
      name: "Thunderwave",
      level: 1,
      classes: ["wizard", "bard"],
      castingTime: "action",
      range: "self (15 ft cube)",
      concentration: false,
      summary: "A booming wave that pushes foes back.",
      effect: { kind: "save-damage", save: "con", damage: "2d8", damageType: "thunder", halfOnSave: true },
    }),
    s({
      id: "entangle",
      name: "Entangle",
      level: 1,
      classes: ["ranger"],
      castingTime: "action",
      range: "90 ft",
      concentration: true,
      summary: "Grasping vines tangle up foes.",
      effect: { kind: "save-condition", save: "str", condition: "restrained", rounds: 10 },
    }),
    s({
      id: "hunters-mark",
      name: "Hunter's Mark",
      level: 1,
      classes: ["ranger"],
      castingTime: "bonus",
      range: "90 ft",
      concentration: true,
      summary: "Mark a quarry: your hits on it deal an extra 1d6.",
      effect: { kind: "buff", bonus: "1d6", targets: 1, rounds: 600, appliesTo: ["attack"] },
    }),
    s({
      id: "goodberry",
      name: "Goodberry",
      level: 1,
      classes: ["ranger"],
      castingTime: "action",
      range: "self",
      concentration: false,
      summary: "Ten magic berries that each heal 1 hit point.",
      effect: { kind: "utility" },
    }),
    s({
      id: "faerie-fire",
      name: "Faerie Fire",
      level: 1,
      classes: ["bard"],
      castingTime: "action",
      range: "60 ft",
      concentration: true,
      summary: "Sparkling light outlines foes so they're easier to hit.",
      effect: { kind: "save-condition", save: "dex", condition: "blinded", rounds: 10 },
    }),
    s({
      id: "detect-magic",
      name: "Detect Magic",
      level: 1,
      classes: ["wizard", "cleric", "bard", "ranger"],
      castingTime: "action",
      range: "self",
      concentration: true,
      summary: "Sense magic nearby.",
      effect: { kind: "utility" },
    }),
    // Level 2
    s({
      id: "lesser-restoration",
      name: "Lesser Restoration",
      level: 2,
      classes: ["cleric", "bard", "ranger"],
      castingTime: "bonus",
      range: "touch",
      concentration: false,
      summary: "End one condition such as Queasy or Can't See.",
      effect: { kind: "utility" },
    }),
    s({
      id: "misty-step",
      name: "Misty Step",
      level: 2,
      classes: ["wizard"],
      castingTime: "bonus",
      range: "self",
      concentration: false,
      summary: "Vanish in silver mist and appear up to 30 feet away.",
      effect: { kind: "utility" },
    }),
    s({
      id: "hold-person",
      name: "Hold Person",
      level: 2,
      classes: ["wizard", "cleric", "bard"],
      castingTime: "action",
      range: "60 ft",
      concentration: true,
      summary: "Freeze a person in place.",
      effect: { kind: "save-condition", save: "wis", condition: "stunned", rounds: 10 },
    }),
    s({
      id: "aid",
      name: "Aid",
      level: 2,
      classes: ["cleric", "bard", "ranger"],
      castingTime: "action",
      range: "30 ft",
      concentration: false,
      summary: "Bolster three friends with extra hit points.",
      effect: { kind: "utility" },
    }),
  ].map((x) => [x.id, x]),
);

export function spellsForClass(classId: SrdClassId, maxLevel: number): SrdSpell[] {
  return Object.values(SRD_SPELLS).filter((sp) => sp.classes.includes(classId) && sp.level <= maxLevel);
}

/** Number of damage dice multiplier for cantrips at a character level. */
export function cantripScale(levels: number[] | undefined, characterLevel: number): number {
  if (!levels) return 1;
  return 1 + levels.filter((l) => characterLevel >= l).length;
}
