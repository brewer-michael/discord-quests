import type { ClockState, SceneKind } from "@dq/core/story";
import type { WorldIndex } from "@dq/core/world";

/** Public story position, stored on the campaign row. */
export interface StoryState {
  completedBeats: string[];
  regionId: string;
  poiId: string | null;
  sceneId: string | null;
  sceneKind: SceneKind | null;
  beatId: string | null;
  roundsInScene: number;
  /** The narrator said the scene's goal was met; the next round closes the scene. */
  closeNextRound: boolean;
  clocks: ClockState;
  factionDisposition: Record<string, number>;
  discoveredRegions: string[];
  ended: boolean;
  /** A player used the X-card: the next narration steers gently away. */
  steerAway?: boolean;
  /** Branch beats opened by failed cruxes. */
  branches?: string[];
  /** Turns undone by a rewind, as [first, last] seq ranges. Still in the history, but they never happened. */
  rewound?: Array<[number, number]>;
}

export function initialStoryState(index: WorldIndex): StoryState {
  const start = index.world.meta.startRegion;
  const neighbors = index.regions.get(start)?.edges.map((e) => e.to) ?? [];
  return {
    completedBeats: [],
    regionId: start,
    poiId: null,
    sceneId: null,
    sceneKind: null,
    beatId: null,
    roundsInScene: 0,
    closeNextRound: false,
    clocks: {},
    factionDisposition: Object.fromEntries(index.world.factions.map((f) => [f.id, f.startingDisposition])),
    discoveredRegions: [start, ...neighbors],
    ended: false,
  };
}

export function asStory(value: unknown): StoryState {
  return value as StoryState;
}

/** Whether a turn was undone by a rewind. */
export function isRewound(story: unknown, seq: number): boolean {
  return (asStory(story)?.rewound ?? []).some(([from, to]) => seq >= from && seq <= to);
}
