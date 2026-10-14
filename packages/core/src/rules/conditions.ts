import type { RollMode } from "./checks";
import { combineMode } from "./checks";

/**
 * Conditions, with kid-friendly names. `dazed` replaces "unconscious and dying":
 * at 0 hit points a hero is Dazed, never dying.
 */
export const CONDITIONS = {
  blinded: {
    name: "Can't See",
    description: "Can't see. Attacks against you are easier; your attacks are harder.",
  },
  charmed: {
    name: "Beguiled",
    description: "Won't attack the one who beguiled you, who has an easier time talking to you.",
  },
  frightened: {
    name: "Spooked",
    description: "Your checks and attacks are harder while the scary thing is in sight.",
  },
  grappled: {
    name: "Grabbed",
    description: "Held in place. Your attacks on anyone but the grabber are harder.",
  },
  invisible: {
    name: "Unseen",
    description: "Nobody can see you. Your attacks are easier; attacks against you are harder.",
  },
  poisoned: { name: "Queasy", description: "Feeling sick. Your attacks and checks are harder." },
  prone: {
    name: "Knocked Down",
    description: "On the ground. Nearby attackers have it easier; your attacks are harder.",
  },
  restrained: {
    name: "Tangled",
    description: "Stuck fast. Attacks against you are easier; yours and Dexterity saves are harder.",
  },
  stunned: { name: "Dizzy", description: "Too dizzy to act. Attacks against you are easier." },
  dazed: {
    name: "Dazed",
    description: "Knocked out of the fight. A friend's help or a Rally roll brings you back.",
  },
} as const;

export type Condition = keyof typeof CONDITIONS;

export function isCondition(value: string): value is Condition {
  return value in CONDITIONS;
}

/** Conditions that stop a creature from taking actions. */
export function isIncapacitated(conditions: readonly Condition[]): boolean {
  return conditions.includes("stunned") || conditions.includes("dazed");
}

export interface AttackContext {
  attacker: readonly Condition[];
  target: readonly Condition[];
  /** Attacker is within 5 feet of the target (matters for prone). */
  melee: boolean;
  extraAdvantage?: boolean;
  extraDisadvantage?: boolean;
}

/** Roll mode for an attack roll, from both creatures' conditions. */
export function attackRollMode(ctx: AttackContext): RollMode {
  let adv = ctx.extraAdvantage ?? false;
  let dis = ctx.extraDisadvantage ?? false;
  const a = ctx.attacker;
  const t = ctx.target;
  if (a.includes("blinded") || a.includes("frightened") || a.includes("poisoned")) dis = true;
  if (a.includes("prone") || a.includes("restrained")) dis = true;
  if (a.includes("invisible")) adv = true;
  if (t.includes("blinded") || t.includes("restrained") || t.includes("stunned") || t.includes("dazed"))
    adv = true;
  if (t.includes("invisible")) dis = true;
  if (t.includes("prone")) {
    if (ctx.melee) adv = true;
    else dis = true;
  }
  return combineMode(adv, dis);
}

/** Roll mode for an ability check from the actor's conditions. */
export function checkRollMode(
  conditions: readonly Condition[],
  extra: { advantage?: boolean; disadvantage?: boolean } = {},
): RollMode {
  const dis =
    (extra.disadvantage ?? false) || conditions.includes("frightened") || conditions.includes("poisoned");
  return combineMode(extra.advantage ?? false, dis);
}
