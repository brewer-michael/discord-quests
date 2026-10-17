import type { SceneKind } from "@dq/core/story";
import type { WorldIndex } from "@dq/core/world";

/**
 * Where the story stands, as players may know it: stored on the campaign row. The campaign's own story plan
 * (threats, secrets, what's ahead) lives hidden in the spoiler schema.
 */
export interface StoryState {
  regionId: string;
  poiId: string | null;
  sceneId: string | null;
  sceneKind: SceneKind | null;
  /** The decisive moment being played, if this scene is one. */
  momentId: string | null;
  roundsInScene: number;
  /** The storyteller said this scene's question was answered; the heroes' next move closes it. */
  closeNextRound: boolean;
  scenesDone: number;
  milestones: number;
  /** scenesDone when the last milestone came, so milestones are earned, not handed out every scene. */
  lastMilestoneAt: number;
  chapter: number;
  /** A chapter ended with the last scene change; the hidden hand hears it on the next turn. */
  chapterEnded?: boolean;
  /** What the heroes have found out: the clues they've uncovered. */
  discoveries: string[];
  factionDisposition: Record<string, number>;
  discoveredRegions: string[];
  ended: boolean;
  /** A player used the X-card: the next narration steers gently away. */
  steerAway?: boolean;
  /** Turns undone by a rewind, as [first, last] seq ranges. Still in the history, but they never happened. */
  rewound?: Array<[number, number]>;
}

export function initialStoryState(index: WorldIndex, regionId = index.world.meta.startRegion): StoryState {
  const neighbors = index.regions.get(regionId)?.edges.map((e) => e.to) ?? [];
  return {
    regionId,
    poiId: null,
    sceneId: null,
    sceneKind: null,
    momentId: null,
    roundsInScene: 0,
    closeNextRound: false,
    scenesDone: 0,
    milestones: 0,
    lastMilestoneAt: 0,
    chapter: 1,
    discoveries: [],
    factionDisposition: Object.fromEntries(index.world.factions.map((f) => [f.id, f.startingDisposition])),
    discoveredRegions: [regionId, ...neighbors],
    ended: false,
  };
}

/** The story state on a campaign row, including one saved before the living story (a fixed arc's beats). */
export function asStory(value: unknown): StoryState {
  const v = (value ?? {}) as Partial<StoryState> & { completedBeats?: string[] };
  return {
    regionId: v.regionId ?? "",
    poiId: v.poiId ?? null,
    sceneId: v.sceneId ?? null,
    sceneKind: v.sceneKind ?? null,
    momentId: v.momentId ?? null,
    roundsInScene: v.roundsInScene ?? 0,
    closeNextRound: v.closeNextRound ?? false,
    scenesDone: v.scenesDone ?? v.completedBeats?.length ?? 0,
    milestones: v.milestones ?? 0,
    lastMilestoneAt: v.lastMilestoneAt ?? 0,
    chapter: v.chapter ?? 1,
    ...(v.chapterEnded ? { chapterEnded: true } : {}),
    discoveries: v.discoveries ?? [],
    factionDisposition: v.factionDisposition ?? {},
    discoveredRegions: v.discoveredRegions ?? (v.regionId ? [v.regionId] : []),
    ended: v.ended ?? false,
    ...(v.steerAway ? { steerAway: true } : {}),
    ...(v.rewound ? { rewound: v.rewound } : {}),
  };
}

/** Whether a turn was undone by a rewind. */
export function isRewound(story: unknown, seq: number): boolean {
  return (asStory(story).rewound ?? []).some(([from, to]) => seq >= from && seq <= to);
}
