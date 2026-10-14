import {
  ABILITIES,
  type Ability,
  type AbilityIncrements,
  type AbilityScores,
  incrementTotal,
} from "./abilities";

export const POINT_BUY_BUDGET = 27;
export const POINT_BUY_MIN = 8;
export const POINT_BUY_MAX = 15;
export const STANDARD_ARRAY = [15, 14, 13, 12, 10, 8] as const;

const COST: Record<number, number> = { 8: 0, 9: 1, 10: 2, 11: 3, 12: 4, 13: 5, 14: 7, 15: 9 };

export function pointCost(score: number): number {
  const cost = COST[score];
  if (cost === undefined) throw new RangeError(`Point-buy scores must be ${POINT_BUY_MIN}-${POINT_BUY_MAX}`);
  return cost;
}

export function pointsSpent(scores: AbilityScores): number {
  return ABILITIES.reduce((sum, a) => sum + pointCost(scores[a]), 0);
}

export function pointsRemaining(scores: AbilityScores): number {
  return POINT_BUY_BUDGET - pointsSpent(scores);
}

export function isLegalPointBuy(scores: AbilityScores): boolean {
  for (const a of ABILITIES) {
    if (scores[a] < POINT_BUY_MIN || scores[a] > POINT_BUY_MAX) return false;
  }
  return pointsSpent(scores) <= POINT_BUY_BUDGET;
}

/** Used by the +/- buttons in the character wizard. */
export function canIncrement(scores: AbilityScores, ability: Ability): boolean {
  const next = scores[ability] + 1;
  if (next > POINT_BUY_MAX) return false;
  return pointsSpent(scores) - pointCost(scores[ability]) + pointCost(next) <= POINT_BUY_BUDGET;
}

export function canDecrement(scores: AbilityScores, ability: Ability): boolean {
  return scores[ability] > POINT_BUY_MIN;
}

export function basePointBuyScores(): AbilityScores {
  return { str: 8, dex: 8, con: 8, int: 8, wis: 8, cha: 8 };
}

/**
 * Background bonus (SRD 5.2): +2 to one and +1 to another, or +1 to all three,
 * chosen from the background's three listed abilities. Max 20.
 */
export function isLegalBackgroundBonus(inc: AbilityIncrements, allowed: readonly Ability[]): boolean {
  const entries = ABILITIES.filter((a) => (inc[a] ?? 0) !== 0);
  if (entries.some((a) => !allowed.includes(a))) return false;
  const values = entries.map((a) => inc[a] ?? 0).sort();
  if (incrementTotal(inc) !== 3) return false;
  return (
    (values.length === 2 && values[0] === 1 && values[1] === 2) ||
    (values.length === 3 && values.every((v) => v === 1))
  );
}

/** Ability Score Improvement: +2 to one ability or +1 to two. */
export function isLegalAsi(inc: AbilityIncrements): boolean {
  const values = ABILITIES.map((a) => inc[a] ?? 0).filter((v) => v !== 0);
  if (values.some((v) => v < 0 || v > 2)) return false;
  return incrementTotal(inc) === 2 && values.length >= 1 && values.length <= 2;
}
