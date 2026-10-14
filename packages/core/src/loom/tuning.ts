import type { VirtueTag } from "./vocab";

/** All of the loom's knobs in one place. Changed only by tuning, never by players. */
export interface LoomTuning {
  baseWeight: Record<VirtueTag, number>;
  /** Story progress needed before a thread is ripe. */
  ripenSpan: Record<VirtueTag, number>;
  maxWeight: number;
  /** Narrator-detected deeds count for less than chosen or parsed ones. */
  narratorFactor: number;
  /** Each repeat of the same virtue in a chapter counts for less. */
  chapterDecay: number;
  /** Threads below this ripeness can't be woven. */
  minRipeness: number;
  /** +/- fraction of seeded tension near the threshold. */
  jitter: number;
  /** Fraction of required grace for a costly success. */
  costlyFraction: number;
  snarePressureFactor: number;
  minorGraceChance: number;
  detourChance: number;
  detourCooldownTurns: number;
  /** Max visible providence events in any window of this many turns. */
  providenceWindowTurns: number;
  providenceWindowMax: number;
  /** Bearers glimpse every N to M progress units. */
  glimpseEvery: [number, number];
  /** Threads exploited within this much progress lose sincerity. */
  sincerityWindow: number;
  sincerityPenalty: number;
}

export const DEFAULT_TUNING: LoomTuning = {
  baseWeight: {
    mercy: 1.0,
    honesty_at_cost: 0.6,
    patience: 0.6,
    promise_kept: 0.7,
    kindness_to_lowly: 0.7,
    self_sacrifice: 0.8,
    keepsake_kept: 0.6,
    amends: 0.8,
  },
  ripenSpan: {
    mercy: 10,
    honesty_at_cost: 5,
    patience: 5,
    promise_kept: 6,
    kindness_to_lowly: 6,
    self_sacrifice: 6,
    keepsake_kept: 8,
    amends: 6,
  },
  maxWeight: 1.5,
  narratorFactor: 0.5,
  chapterDecay: 0.85,
  minRipeness: 0.3,
  jitter: 0.1,
  costlyFraction: 0.6,
  snarePressureFactor: 0.3,
  minorGraceChance: 0.5,
  detourChance: 0.25,
  detourCooldownTurns: 15,
  providenceWindowTurns: 10,
  providenceWindowMax: 2,
  glimpseEvery: [4, 7],
  sincerityWindow: 3,
  sincerityPenalty: 0.3,
};

/** The sentence every providence directive carries, so the narrator never explains it. */
export const MUST_NOT_EXPLAIN = [
  "Do not say or hint that this happened because of anything the heroes did earlier.",
  "Do not mention luck, fate, destiny, providence, or anything being meant to be.",
  "Do not mention any hidden score, stat, thread, seed or tally.",
];
