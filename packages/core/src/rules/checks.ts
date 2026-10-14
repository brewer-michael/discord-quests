import type { Rng } from "../rng/index";

export type RollMode = "normal" | "advantage" | "disadvantage";

/** Advantage and disadvantage cancel out, regardless of how many sources of each. */
export function combineMode(advantage: boolean, disadvantage: boolean): RollMode {
  if (advantage && !disadvantage) return "advantage";
  if (disadvantage && !advantage) return "disadvantage";
  return "normal";
}

export interface D20Roll {
  mode: RollMode;
  rolls: number[];
  natural: number;
}

export function rollD20(rng: Rng, mode: RollMode = "normal"): D20Roll {
  const first = rng.int(1, 20);
  if (mode === "normal") return { mode, rolls: [first], natural: first };
  const second = rng.int(1, 20);
  const natural = mode === "advantage" ? Math.max(first, second) : Math.min(first, second);
  return { mode, rolls: [first, second], natural };
}

export interface CheckInput {
  modifier: number;
  dc: number;
  mode?: RollMode;
  /** Extra dice like Bless or Guidance, already rolled by the caller. */
  bonus?: number;
}

export interface CheckResult extends D20Roll {
  modifier: number;
  bonus: number;
  total: number;
  dc: number;
  success: boolean;
  /** total - dc. Positive means success by that much. */
  margin: number;
  natural20: boolean;
  natural1: boolean;
}

/**
 * Ability checks and saving throws. Per the SRD, a natural 20 or 1 has no
 * special effect on these (only on attack rolls).
 */
export function resolveCheck(input: CheckInput, rng: Rng): CheckResult {
  const roll = rollD20(rng, input.mode ?? "normal");
  const bonus = input.bonus ?? 0;
  const total = roll.natural + input.modifier + bonus;
  return {
    ...roll,
    modifier: input.modifier,
    bonus,
    total,
    dc: input.dc,
    success: total >= input.dc,
    margin: total - input.dc,
    natural20: roll.natural === 20,
    natural1: roll.natural === 1,
  };
}

/** Exact probability that d20 + modifier >= dc under the given mode. */
export function successProbability(modifier: number, dc: number, mode: RollMode = "normal"): number {
  const needed = dc - modifier; // natural roll required
  const single = Math.min(1, Math.max(0, (21 - needed) / 20));
  if (mode === "advantage") return 1 - (1 - single) ** 2;
  if (mode === "disadvantage") return single ** 2;
  return single;
}

/** Attack rolls: natural 20 always hits (critical), natural 1 always misses. */
export function attackHitProbability(
  attackBonus: number,
  targetAc: number,
  mode: RollMode = "normal",
): number {
  const needed = Math.min(20, Math.max(2, targetAc - attackBonus));
  const single = (21 - needed) / 20;
  if (mode === "advantage") return 1 - (1 - single) ** 2;
  if (mode === "disadvantage") return single ** 2;
  return single;
}

export const DIFFICULTY = {
  veryEasy: 5,
  easy: 10,
  medium: 15,
  hard: 20,
  veryHard: 25,
  nearlyImpossible: 30,
} as const;

export type DifficultyName = keyof typeof DIFFICULTY;

/** Friendly labels so young players see "Hard" instead of "DC 20". */
export function difficultyLabel(dc: number): string {
  if (dc <= 5) return "Very easy";
  if (dc <= 10) return "Easy";
  if (dc <= 15) return "Medium";
  if (dc <= 20) return "Hard";
  if (dc <= 25) return "Very hard";
  return "Nearly impossible";
}
