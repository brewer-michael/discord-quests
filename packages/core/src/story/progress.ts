import type { BeatRef, CruxSpec } from "../world/index";
import type { WorldIndex } from "../world/index-world";

/** Story progress: beats completed, plus a bonus for each finished chapter. Idling never advances it. */
export const CHAPTER_PROGRESS_BONUS = 3;

export interface StoryPosition {
  completedBeats: readonly string[];
  /** Beat currently being played, if any. */
  currentBeatId: string | null;
}

export function chapterComplete(
  index: WorldIndex,
  chapterId: string,
  completed: ReadonlySet<string>,
): boolean {
  const refs = index.beatOrder.filter((b) => b.chapter.id === chapterId);
  return refs.every((b) => b.beat.optional || b.beat.branch || completed.has(b.beat.id));
}

export function storyProgress(index: WorldIndex, completedBeats: readonly string[]): number {
  const done = new Set(completedBeats);
  const chapterIds = [...new Set(index.beatOrder.map((b) => b.chapter.id))];
  const finishedChapters = chapterIds.filter((id) => chapterComplete(index, id, done)).length;
  const beats = index.beatOrder.filter((b) => done.has(b.beat.id)).length;
  return beats + CHAPTER_PROGRESS_BONUS * finishedChapters;
}

/** Beats not yet completed, in story order, whose requirements are met or will be met in order. */
export function upcomingBeats(
  index: WorldIndex,
  completedBeats: readonly string[],
  limit = Number.POSITIVE_INFINITY,
): BeatRef[] {
  const done = new Set(completedBeats);
  // Branches may never be played, so nothing is planned around them.
  return index.beatOrder.filter((b) => !done.has(b.beat.id) && !b.beat.branch).slice(0, limit);
}

/** The next beat to play: first incomplete beat whose requirements are all complete. */
export function nextPlayableBeat(
  index: WorldIndex,
  completedBeats: readonly string[],
  /** Branch beats a failed crux has opened. */
  branches: readonly string[] = [],
): BeatRef | null {
  const done = new Set(completedBeats);
  for (const ref of index.beatOrder) {
    if (done.has(ref.beat.id)) continue;
    if (ref.beat.branch && !branches.includes(ref.beat.id)) continue;
    if (ref.beat.requires.every((r) => done.has(r))) return ref;
  }
  return null;
}

export function nextCrux(index: WorldIndex, completedBeats: readonly string[]): BeatRef | null {
  return upcomingBeats(index, completedBeats).find((b) => b.beat.decisive) ?? null;
}

export function finalCrux(index: WorldIndex): BeatRef | null {
  return [...index.beatOrder].reverse().find((b) => b.beat.decisive) ?? null;
}

/** Beats between two beats in story order (exclusive of `from`, inclusive of `to`). */
export function beatsBetween(index: WorldIndex, fromBeatId: string, toBeatId: string): number {
  const a = index.beats.get(fromBeatId);
  const b = index.beats.get(toBeatId);
  if (!a || !b) return Number.POSITIVE_INFINITY;
  return b.order - a.order;
}

export type ClockKey = `${string}/${string}`;
export type ClockState = Record<ClockKey, number>;

export function clockKey(faction: string, clock: string): ClockKey {
  return `${faction}/${clock}`;
}

export function clockSegments(index: WorldIndex, key: ClockKey): number {
  const [faction, clock] = key.split("/") as [string, string];
  return index.factions.get(faction)?.clocks.find((c) => c.id === clock)?.segments ?? 0;
}

/** Advances a faction clock, capped at its segment count. */
export function tickClock(index: WorldIndex, clocks: ClockState, key: ClockKey, by = 1): ClockState {
  const max = clockSegments(index, key);
  const now = Math.min(max, Math.max(0, (clocks[key] ?? 0) + by));
  return { ...clocks, [key]: now };
}

export function clockFull(index: WorldIndex, clocks: ClockState, key: ClockKey): boolean {
  const max = clockSegments(index, key);
  return max > 0 && (clocks[key] ?? 0) >= max;
}

/**
 * Difficulty of a crux check. Late in the story, filled enemy clocks and the
 * party's unpaid snares push it toward the impossible.
 */
export function cruxDc(crux: CruxSpec, clocks: ClockState, snarePressure: number): number {
  const filled = crux.clock ? (clocks[clockKey(crux.clock.faction, crux.clock.clock)] ?? 0) : 0;
  const dc =
    crux.check.dc.base +
    crux.check.dc.perEnemyClockSegment * filled +
    crux.check.dc.perSnareSeverity * snarePressure;
  return Math.min(crux.check.dc.max, Math.round(dc));
}
