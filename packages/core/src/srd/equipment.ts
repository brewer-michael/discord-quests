import type { Ability } from "../rules/abilities";
import type { ArmorCategory } from "./classes";

export type WeaponProperty =
  | "finesse"
  | "light"
  | "heavy"
  | "thrown"
  | "versatile"
  | "two-handed"
  | "loading"
  | "ammunition"
  | "reach";

export interface SrdWeapon {
  id: string;
  name: string;
  category: "simple" | "martial";
  kind: "melee" | "ranged";
  damage: string;
  damageType: "slashing" | "piercing" | "bludgeoning";
  versatile?: string;
  range?: [number, number];
  properties: WeaponProperty[];
}

export interface SrdArmor {
  id: string;
  name: string;
  category: ArmorCategory;
  /** Base AC, or the bonus for a shield. */
  ac: number;
  /** null = add full Dexterity modifier; 0 = add none. */
  maxDex: number | null;
  stealthDisadvantage: boolean;
  strengthRequired?: number;
}

const w = (weapon: SrdWeapon) => weapon;

export const SRD_WEAPONS: Record<string, SrdWeapon> = Object.fromEntries(
  [
    w({
      id: "club",
      name: "Club",
      category: "simple",
      kind: "melee",
      damage: "1d4",
      damageType: "bludgeoning",
      properties: ["light"],
    }),
    w({
      id: "dagger",
      name: "Dagger",
      category: "simple",
      kind: "melee",
      damage: "1d4",
      damageType: "piercing",
      range: [20, 60],
      properties: ["finesse", "light", "thrown"],
    }),
    w({
      id: "handaxe",
      name: "Handaxe",
      category: "simple",
      kind: "melee",
      damage: "1d6",
      damageType: "slashing",
      range: [20, 60],
      properties: ["light", "thrown"],
    }),
    w({
      id: "javelin",
      name: "Javelin",
      category: "simple",
      kind: "melee",
      damage: "1d6",
      damageType: "piercing",
      range: [30, 120],
      properties: ["thrown"],
    }),
    w({
      id: "mace",
      name: "Mace",
      category: "simple",
      kind: "melee",
      damage: "1d6",
      damageType: "bludgeoning",
      properties: [],
    }),
    w({
      id: "quarterstaff",
      name: "Quarterstaff",
      category: "simple",
      kind: "melee",
      damage: "1d6",
      damageType: "bludgeoning",
      versatile: "1d8",
      properties: ["versatile"],
    }),
    w({
      id: "spear",
      name: "Spear",
      category: "simple",
      kind: "melee",
      damage: "1d6",
      damageType: "piercing",
      versatile: "1d8",
      range: [20, 60],
      properties: ["thrown", "versatile"],
    }),
    w({
      id: "light-crossbow",
      name: "Light Crossbow",
      category: "simple",
      kind: "ranged",
      damage: "1d8",
      damageType: "piercing",
      range: [80, 320],
      properties: ["ammunition", "loading", "two-handed"],
    }),
    w({
      id: "shortbow",
      name: "Shortbow",
      category: "simple",
      kind: "ranged",
      damage: "1d6",
      damageType: "piercing",
      range: [80, 320],
      properties: ["ammunition", "two-handed"],
    }),
    w({
      id: "sling",
      name: "Sling",
      category: "simple",
      kind: "ranged",
      damage: "1d4",
      damageType: "bludgeoning",
      range: [30, 120],
      properties: ["ammunition"],
    }),
    w({
      id: "longsword",
      name: "Longsword",
      category: "martial",
      kind: "melee",
      damage: "1d8",
      damageType: "slashing",
      versatile: "1d10",
      properties: ["versatile"],
    }),
    w({
      id: "rapier",
      name: "Rapier",
      category: "martial",
      kind: "melee",
      damage: "1d8",
      damageType: "piercing",
      properties: ["finesse"],
    }),
    w({
      id: "scimitar",
      name: "Scimitar",
      category: "martial",
      kind: "melee",
      damage: "1d6",
      damageType: "slashing",
      properties: ["finesse", "light"],
    }),
    w({
      id: "shortsword",
      name: "Shortsword",
      category: "martial",
      kind: "melee",
      damage: "1d6",
      damageType: "piercing",
      properties: ["finesse", "light"],
    }),
    w({
      id: "warhammer",
      name: "Warhammer",
      category: "martial",
      kind: "melee",
      damage: "1d8",
      damageType: "bludgeoning",
      versatile: "1d10",
      properties: ["versatile"],
    }),
    w({
      id: "greatsword",
      name: "Greatsword",
      category: "martial",
      kind: "melee",
      damage: "2d6",
      damageType: "slashing",
      properties: ["heavy", "two-handed"],
    }),
    w({
      id: "longbow",
      name: "Longbow",
      category: "martial",
      kind: "ranged",
      damage: "1d8",
      damageType: "piercing",
      range: [150, 600],
      properties: ["ammunition", "heavy", "two-handed"],
    }),
  ].map((x) => [x.id, x]),
);

export const SRD_ARMOR: Record<string, SrdArmor> = Object.fromEntries(
  (
    [
      {
        id: "padded",
        name: "Padded Armor",
        category: "light",
        ac: 11,
        maxDex: null,
        stealthDisadvantage: true,
      },
      {
        id: "leather",
        name: "Leather Armor",
        category: "light",
        ac: 11,
        maxDex: null,
        stealthDisadvantage: false,
      },
      {
        id: "studded-leather",
        name: "Studded Leather",
        category: "light",
        ac: 12,
        maxDex: null,
        stealthDisadvantage: false,
      },
      { id: "hide", name: "Hide Armor", category: "medium", ac: 12, maxDex: 2, stealthDisadvantage: false },
      {
        id: "chain-shirt",
        name: "Chain Shirt",
        category: "medium",
        ac: 13,
        maxDex: 2,
        stealthDisadvantage: false,
      },
      {
        id: "scale-mail",
        name: "Scale Mail",
        category: "medium",
        ac: 14,
        maxDex: 2,
        stealthDisadvantage: true,
      },
      {
        id: "breastplate",
        name: "Breastplate",
        category: "medium",
        ac: 14,
        maxDex: 2,
        stealthDisadvantage: false,
      },
      { id: "ring-mail", name: "Ring Mail", category: "heavy", ac: 14, maxDex: 0, stealthDisadvantage: true },
      {
        id: "chain-mail",
        name: "Chain Mail",
        category: "heavy",
        ac: 16,
        maxDex: 0,
        stealthDisadvantage: true,
        strengthRequired: 13,
      },
      {
        id: "splint",
        name: "Splint Armor",
        category: "heavy",
        ac: 17,
        maxDex: 0,
        stealthDisadvantage: true,
        strengthRequired: 15,
      },
      {
        id: "plate",
        name: "Plate Armor",
        category: "heavy",
        ac: 18,
        maxDex: 0,
        stealthDisadvantage: true,
        strengthRequired: 15,
      },
      { id: "shield", name: "Shield", category: "shield", ac: 2, maxDex: 0, stealthDisadvantage: false },
    ] satisfies SrdArmor[]
  ).map((x) => [x.id, x]),
);

/** Which ability a weapon attack uses: finesse weapons use the better of STR and DEX. */
export function weaponAbility(weapon: SrdWeapon, mods: Record<Ability, number>): Ability {
  if (weapon.kind === "ranged") return "dex";
  if (weapon.properties.includes("finesse")) return mods.dex > mods.str ? "dex" : "str";
  return "str";
}

export function isWeaponId(id: string): boolean {
  return id in SRD_WEAPONS;
}

export function isArmorId(id: string): boolean {
  return id in SRD_ARMOR;
}
