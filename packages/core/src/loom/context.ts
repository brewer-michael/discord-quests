import type { Rng } from "../rng/index";
import type { WorldIndex } from "../world/index-world";
import type { CruxSpec } from "../world/schema";
import { DEFAULT_TUNING, type LoomTuning } from "./tuning";
import type { LoomState } from "./types";

/** One of the campaign's decisive moments, as the hidden hand sees it. */
export interface LoomMoment {
  id: string;
  title: string;
  /** Where it's expected to happen, for detour text ("the place ahead"). */
  placeName: string;
  sockets: CruxSpec["sockets"];
  requiredGrace: number;
  onSuccess: string;
  onCostlySuccess: string;
  onFailForward: string;
  finale: boolean;
  /** About when in story progress it's expected: a guide for planning, never a schedule. */
  at: number;
  done: boolean;
}

export interface LoomContext {
  index: WorldIndex;
  tuning: LoomTuning;
  /** The campaign's decisive moments, in story order, the finale last. */
  moments: LoomMoment[];
}

export function loomContext(
  index: WorldIndex,
  moments: LoomMoment[] = [],
  tuning: Partial<LoomTuning> = {},
): LoomContext {
  return { index, moments, tuning: { ...DEFAULT_TUNING, ...tuning } };
}

/** The next decisive moment still ahead. */
export function nextMoment(ctx: LoomContext, doneMoments: readonly string[] = []): LoomMoment | null {
  return ctx.moments.find((m) => !m.done && !doneMoments.includes(m.id)) ?? null;
}

export function finaleMoment(ctx: LoomContext): LoomMoment | null {
  return ctx.moments.find((m) => m.finale) ?? null;
}

export function momentById(ctx: LoomContext, id: string): LoomMoment | null {
  return ctx.moments.find((m) => m.id === id) ?? null;
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
