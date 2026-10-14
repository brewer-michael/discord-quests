import type { Rng } from "../rng/index";
import { type D20Roll, type RollMode, rollD20 } from "./checks";
import type { Condition } from "./conditions";
import { type DiceResult, rollDice } from "./dice";

export interface AttackResult extends D20Roll {
  attackBonus: number;
  total: number;
  targetAc: number;
  hit: boolean;
  critical: boolean;
  fumble: boolean;
}

/** Natural 20 always hits and is a critical; natural 1 always misses. */
export function rollAttack(attackBonus: number, targetAc: number, mode: RollMode, rng: Rng): AttackResult {
  const roll = rollD20(rng, mode);
  const total = roll.natural + attackBonus;
  const critical = roll.natural === 20;
  const fumble = roll.natural === 1;
  return {
    ...roll,
    attackBonus,
    total,
    targetAc,
    hit: critical || (!fumble && total >= targetAc),
    critical,
    fumble,
  };
}

export function rollDamage(dice: string, critical: boolean, rng: Rng): DiceResult {
  const result = rollDice(dice, rng, { critical });
  return { ...result, total: Math.max(0, result.total) };
}

export interface Vitality {
  hp: number;
  hpMax: number;
  tempHp: number;
  conditions: Condition[];
}

export interface DamageOutcome {
  vitality: Vitality;
  absorbedByTemp: number;
  taken: number;
  droppedToZero: boolean;
}

/**
 * Applies damage to a hero. At 0 hit points a hero becomes Dazed rather than
 * dying: there are no death saves in this game.
 */
export function applyDamageToHero(v: Vitality, amount: number): DamageOutcome {
  const dmg = Math.max(0, Math.floor(amount));
  const absorbedByTemp = Math.min(v.tempHp, dmg);
  const rest = dmg - absorbedByTemp;
  const hp = Math.max(0, v.hp - rest);
  const droppedToZero = v.hp > 0 && hp === 0;
  const conditions =
    hp === 0 && !v.conditions.includes("dazed") ? [...v.conditions, "dazed" as const] : v.conditions;
  return {
    vitality: { ...v, hp, tempHp: v.tempHp - absorbedByTemp, conditions },
    absorbedByTemp,
    taken: v.hp - hp,
    droppedToZero,
  };
}

/** Healing a Dazed hero wakes them up. */
export function healHero(v: Vitality, amount: number): Vitality {
  const hp = Math.min(v.hpMax, v.hp + Math.max(0, Math.floor(amount)));
  const conditions = hp > 0 ? v.conditions.filter((c) => c !== "dazed") : v.conditions;
  return { ...v, hp, conditions };
}

export const RALLY_DC = 10;

export interface RallyResult {
  natural: number;
  success: boolean;
  vitality: Vitality;
}

/**
 * The gentle replacement for death saves: a Dazed hero rolls a d20 at the start
 * of their turn; 10 or higher gets them back up with 1 hit point (a natural 20
 * gets them up with 1d4 + 1). Failing has no lasting effect.
 */
export function rollRally(v: Vitality, rng: Rng): RallyResult {
  const natural = rng.int(1, 20);
  if (natural < RALLY_DC) return { natural, success: false, vitality: v };
  const amount = natural === 20 ? rng.int(1, 4) + 1 : 1;
  return { natural, success: true, vitality: healHero(v, amount) };
}

export function isDown(v: Vitality): boolean {
  return v.hp <= 0 || v.conditions.includes("dazed");
}

export function partyIsDown(party: readonly Vitality[]): boolean {
  return party.length > 0 && party.every(isDown);
}

/** How a creature leaves a fight. No creature ever dies on screen. */
export type DefeatStyle = "faints" | "flees" | "surrenders" | "poofs";
export type Morale = "brave" | "normal" | "skittish";

export interface MoraleResult {
  breaks: boolean;
  natural: number | null;
}

/**
 * When a creature is first bloodied (at or below half hit points), check
 * whether it gives up. Brave creatures never break; skittish ones always do.
 */
export function moraleCheck(morale: Morale, rng: Rng): MoraleResult {
  if (morale === "brave") return { breaks: false, natural: null };
  if (morale === "skittish") return { breaks: true, natural: null };
  const natural = rng.int(1, 20);
  return { breaks: natural < 8, natural };
}

export function initiativeOrder<T extends { id: string; initiativeBonus: number }>(
  combatants: readonly T[],
  rng: Rng,
): Array<T & { initiative: number }> {
  const rolled = combatants.map((c) => ({
    ...c,
    initiative: rng.int(1, 20) + c.initiativeBonus,
    tiebreak: rng.next(),
  }));
  rolled.sort(
    (a, b) => b.initiative - a.initiative || b.initiativeBonus - a.initiativeBonus || b.tiebreak - a.tiebreak,
  );
  return rolled.map(({ tiebreak: _t, ...rest }) => rest as unknown as T & { initiative: number });
}
