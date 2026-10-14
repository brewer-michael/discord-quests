import type { Rng } from "../rng/index";
import type { WorldIndex } from "../world/index-world";
import { DEFAULT_TUNING, type LoomTuning } from "./tuning";
import type { LoomState } from "./types";

export interface LoomContext {
  index: WorldIndex;
  tuning: LoomTuning;
}

export function loomContext(index: WorldIndex, tuning: Partial<LoomTuning> = {}): LoomContext {
  return { index, tuning: { ...DEFAULT_TUNING, ...tuning } };
}

/** Deterministic ids: the same inputs always produce the same ids. */
export function nextId(state: LoomState, prefix: string): string {
  const id = `${prefix}${state.counters.nextId}`;
  state.counters.nextId += 1;
  return id;
}

export function providenceAllowed(state: LoomState, turn: number, tuning: LoomTuning): boolean {
  const since = turn - tuning.providenceWindowTurns;
  const recent = state.counters.providenceTurns.filter((t) => t > since).length;
  return recent < tuning.providenceWindowMax;
}

export function markProvidence(state: LoomState, turn: number): void {
  state.counters.providenceTurns = [...state.counters.providenceTurns.slice(-19), turn];
}

export function clamp(x: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, x));
}

export type { Rng };
