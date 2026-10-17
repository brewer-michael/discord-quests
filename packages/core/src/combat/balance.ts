/**
 * Encounter balance: how much of what a party can take on.
 *
 * Fights are budgeted the way SRD 5.2.1 builds them: an XP budget per hero by level and difficulty, spent on
 * creatures at their XP by challenge rating. One house rule on top, for small parties: every foe beyond the
 * number of heroes counts a quarter extra, since a lone hero has no one to share the blows with.
 *
 * Then each fight that fits the budget is played out against the heroes' own sheets before anyone sees it,
 * and stepped down (fewer foes, or weaker ones of the same kind) until the heroes come through often enough.
 * The world's files say which creatures a fight is about; this decides how many, and how tough.
 */
import { createRng, type Rng } from "../rng/index";
import { averageDice } from "../rules/dice";
import { XP_BY_CR } from "../rules/leveling";
import type { CreatureDef } from "../world/schema";
import {
  buildEncounter,
  type CombatAction,
  type CombatState,
  type HeroCombatant,
  MAX_COMBAT_ROUNDS,
  resolveCombatRound,
} from "./index";

export type Difficulty = "low" | "moderate" | "high";

/** SRD 5.2.1 XP budget per character, by level (index = level - 1): low, moderate, high. */
const XP_BUDGET: ReadonlyArray<readonly [number, number, number]> = [
  [50, 75, 100],
  [100, 150, 200],
  [150, 225, 400],
  [250, 375, 500],
  [500, 750, 1100],
  [600, 1000, 1400],
  [750, 1300, 1700],
  [1000, 1700, 2100],
  [1300, 2000, 2600],
  [1600, 2300, 3100],
  [1900, 2900, 4100],
  [2200, 3700, 4700],
  [2600, 4200, 5400],
  [2900, 4900, 6200],
  [3300, 5400, 7800],
  [3800, 6100, 9800],
  [4500, 7200, 11700],
  [5000, 8700, 14200],
  [5500, 10700, 17200],
  [6400, 13200, 22000],
];

const COLUMN: Record<Difficulty, 0 | 1 | 2> = { low: 0, moderate: 1, high: 2 };

/** How often the heroes must come through (not all knocked down) in the test fights. */
const MUST_WIN: Record<Difficulty, number> = { low: 0.97, moderate: 0.9, high: 0.75 };

/** Weaker ones of a kind: the share of their usual hit points they fight with. */
const HP_STEPS = [1, 0.75, 0.5] as const;
const WEAKEST = 0.5;

const TRIALS = 150;

export function xpBudget(levels: readonly number[], difficulty: Difficulty): number {
  return levels.reduce((sum, level) => {
    const row = XP_BUDGET[
      Math.min(XP_BUDGET.length, Math.max(1, Math.floor(level))) - 1
    ] as readonly number[];
    return sum + (row[COLUMN[difficulty]] as number);
  }, 0);
}

export function creatureXp(c: Pick<CreatureDef, "cr">): number {
  return XP_BY_CR[c.cr] ?? 0;
}

export interface BalancedFoe {
  creature: CreatureDef;
  count: number;
  /** 1 for the creature as written; less for a weaker one of its kind. */
  hpScale: number;
}

/** A fight's XP for budgeting: weaker foes count for less, and foes beyond the party's size for more. */
export function encounterXp(foes: ReadonlyArray<BalancedFoe>, partySize: number): number {
  const count = foes.reduce((n, f) => n + f.count, 0);
  const xp = foes.reduce((sum, f) => sum + f.count * creatureXp(f.creature) * f.hpScale, 0);
  const extra = Math.min(4, Math.max(0, count - Math.max(1, partySize)));
  return xp * (1 + 0.25 * extra);
}

export interface BalanceResult {
  foes: BalancedFoe[];
  difficulty: Difficulty;
  budget: number;
  xp: number;
  /** Share of test fights the heroes came through. */
  winRate: number;
}

/**
 * Picks the fight: the strongest version of what the world asked for that fits the budget and that the
 * heroes come through often enough. The first creature listed leads; it stays in the fight if it can.
 */
export function balanceEncounter(args: {
  /** What the world calls for, already scaled to the party's size. The first entry leads. */
  foes: ReadonlyArray<{ creature: CreatureDef; count: number }>;
  heroes: readonly HeroCombatant[];
  difficulty: Difficulty;
  /** Every creature in the world, for weaker stand-ins when nothing asked for fits. */
  creatures: ReadonlyMap<string, CreatureDef>;
  /** Which stand-ins the table allows (its intensity and the topics it left out). */
  allowed?: (c: CreatureDef) => boolean;
}): BalanceResult {
  const { heroes, difficulty, creatures } = args;
  const allowed = (c: CreatureDef) => !c.friendly && (args.allowed?.(c) ?? true);
  const budget = xpBudget(
    heroes.map((h) => h.level),
    difficulty,
  );
  const wanted = args.foes.filter((f) => f.count > 0);
  const fits = (foes: BalancedFoe[]) => encounterXp(foes, heroes.length) <= budget;

  let candidates = options(wanted).filter(fits);
  if (candidates.length === 0)
    candidates = options(standIns(wanted, [...creatures.values()].filter(allowed), budget)).filter(fits);
  if (candidates.length === 0) {
    // Nothing in the world is small enough: the gentlest creature there is, at half strength.
    const gentlest = [...creatures.values()].filter(allowed).sort((a, b) => creatureXp(a) - creatureXp(b))[0];
    const foes = gentlest ? [{ creature: gentlest, count: 1, hpScale: WEAKEST }] : [];
    return { foes, difficulty, budget, xp: encounterXp(foes, heroes.length), winRate: 0 };
  }

  // The leader stays in if it can; then the most XP; then the fewest weakened foes.
  const leader = wanted[0]?.creature.id;
  const ranked = candidates
    .map((foes) => ({
      foes,
      leads: foes.some((f) => f.creature.id === leader) ? 1 : 0,
      xp: encounterXp(foes, heroes.length),
      scale: foes.reduce((s, f) => s + f.hpScale * f.count, 0) / foes.reduce((n, f) => n + f.count, 0),
    }))
    .sort((a, b) => b.leads - a.leads || b.xp - a.xp || b.scale - a.scale);

  let bestTried: { foes: BalancedFoe[]; xp: number; winRate: number } | undefined;
  for (const c of ranked.slice(0, 60)) {
    const { passed, winRate } = trial(c.foes, heroes, creatures, TRIALS, MUST_WIN[difficulty]);
    if (passed) return { foes: c.foes, difficulty, budget, xp: c.xp, winRate };
    if (!bestTried || winRate > bestTried.winRate) bestTried = { ...c, winRate };
  }
  // Nothing tested well enough: the smallest fight that fits, unless one already tried did better.
  const smallest = ranked.reduce((a, b) => (b.xp < a.xp ? b : a));
  const smallestRate = testFights(smallest.foes, heroes, creatures);
  const pick =
    bestTried && bestTried.winRate > smallestRate ? bestTried : { ...smallest, winRate: smallestRate };
  return { foes: pick.foes, difficulty, budget, xp: pick.xp, winRate: pick.winRate };
}

/** Every mix of the wanted creatures: from none to as many as asked of each, at full or reduced strength. */
function options(wanted: ReadonlyArray<{ creature: CreatureDef; count: number }>): BalancedFoe[][] {
  let mixes: BalancedFoe[][] = [[]];
  for (const w of wanted.slice(0, 3)) {
    const next: BalancedFoe[][] = [];
    for (const mix of mixes) {
      next.push(mix);
      for (let count = 1; count <= Math.min(6, w.count); count++)
        for (const hpScale of HP_STEPS) next.push([...mix, { creature: w.creature, count, hpScale }]);
    }
    mixes = next;
  }
  return mixes.filter((m) => m.length > 0);
}

/**
 * Weaker creatures of the same side or kind, when even the weakest version of what was asked is too much:
 * the same faction first, then those sharing a habitat, then the strongest that could fit.
 */
function standIns(
  wanted: ReadonlyArray<{ creature: CreatureDef; count: number }>,
  creatures: readonly CreatureDef[],
  budget: number,
): Array<{ creature: CreatureDef; count: number }> {
  const factions = new Set(wanted.map((w) => w.creature.faction).filter(Boolean));
  const kinds = new Set(wanted.map((w) => w.creature.kind));
  const habitats = new Set(wanted.flatMap((w) => w.creature.habitats));
  const asked = new Set(wanted.map((w) => w.creature.id));
  const count = Math.max(1, ...wanted.map((w) => w.count));
  const sameSide = (c: CreatureDef) => Number(Boolean(c.faction && factions.has(c.faction)));
  const nearby = (c: CreatureDef) => Number(c.habitats.some((h) => habitats.has(h)));
  return creatures
    .filter(
      (c) =>
        !asked.has(c.id) &&
        !c.tags.includes("boss") &&
        creatureXp(c) * WEAKEST <= budget &&
        (sameSide(c) === 1 || kinds.has(c.kind)),
    )
    .sort((a, b) => sameSide(b) - sameSide(a) || nearby(b) - nearby(a) || creatureXp(b) - creatureXp(a))
    .slice(0, 3)
    .map((creature) => ({ creature, count }));
}

/** Plays the fight out many times with plain attacks, and counts how often the heroes come through. */
export function testFights(
  foes: ReadonlyArray<BalancedFoe>,
  heroes: readonly HeroCombatant[],
  creatures: ReadonlyMap<string, CreatureDef>,
  trials = TRIALS,
): number {
  return trial(foes, heroes, creatures, trials, 0).winRate;
}

/** Whether the heroes come through often enough, stopping as soon as they can't (then winRate is a bound). */
function trial(
  foes: ReadonlyArray<BalancedFoe>,
  heroes: readonly HeroCombatant[],
  creatures: ReadonlyMap<string, CreatureDef>,
  trials: number,
  mustWin: number,
): { passed: boolean; winRate: number } {
  // Seeded from the fight itself, so the same party and foes always test the same.
  const key = [
    ...heroes.map((h) => `${h.id}:${h.hp}:${h.ac}`),
    ...foes.map((f) => `${f.creature.id}x${f.count}@${f.hpScale}`),
  ].join("|");
  const rng = createRng(`balance|${key}`);
  const allowedLosses = trials - Math.ceil(trials * mustWin - 1e-9);
  let lost = 0;
  for (let t = 0; t < trials; t++) {
    if (playOut(foes, heroes, creatures, rng) === "party_down") lost++;
    if (lost > allowedLosses) return { passed: false, winRate: (trials - lost) / trials };
  }
  return { passed: true, winRate: (trials - lost) / trials };
}

function playOut(
  foes: ReadonlyArray<BalancedFoe>,
  heroList: readonly HeroCombatant[],
  creatures: ReadonlyMap<string, CreatureDef>,
  rng: Rng,
): CombatState["outcome"] {
  let state = buildEncounter({ foes, heroes: heroList, rng });
  let heroes = [...heroList];
  for (let round = 0; round < MAX_COMBAT_ROUNDS && state.phase === "fighting"; round++) {
    const actions: Record<string, CombatAction> = {};
    for (const h of heroes) actions[h.id] = plainAction(h);
    const result = resolveCombatRound(state, heroes, actions, creatures, rng);
    state = result.state;
    heroes = result.heroes;
  }
  return state.outcome;
}

/** What a hero does in a test fight: their best damaging cantrip if it beats their weapon, else their weapon. */
function plainAction(h: HeroCombatant): CombatAction {
  const weapon = h.attacks[0];
  const cantrip = h.spells
    .filter((s) => s.level === 0 && (s.effect.kind === "attack" || s.effect.kind === "save-damage"))
    .sort((a, b) => spellAverage(b) - spellAverage(a))[0];
  if (cantrip && (!weapon || spellAverage(cantrip) > averageDice(weapon.damage)))
    return { kind: "cast", spellId: cantrip.id };
  return { kind: "attack" };
}

function spellAverage(s: HeroCombatant["spells"][number]): number {
  return "damage" in s.effect ? averageDice(s.effect.damage) : 0;
}
