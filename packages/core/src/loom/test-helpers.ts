import { fileURLToPath } from "node:url";
import { storyProgress } from "../story/progress";
import { readWorldFiles } from "../world/fs";
import { indexWorld, type WorldIndex } from "../world/index-world";
import { loadWorld } from "../world/load";
import type { World } from "../world/types";
import type { AnchorRef, DeedCandidate, LoomInput, SceneEntity, SceneFacts } from "./types";

let cached: WorldIndex | null = null;

export function starterIndex(): WorldIndex {
  if (cached) return cached;
  const dir = fileURLToPath(new URL("../../../../worlds/lanternreach", import.meta.url));
  const { world, issues } = loadWorld(readWorldFiles(dir));
  if (!world) throw new Error(`starter world failed to load: ${JSON.stringify(issues.slice(0, 3))}`);
  cached = indexWorld(world as World);
  return cached;
}

export const SNIBBET: AnchorRef = {
  kind: "npc",
  id: "snibbet",
  name: "Snibbet",
  tags: ["covets-ember", "pitiable", "lowly"],
};
export const TUMBLE: AnchorRef = {
  kind: "npc",
  id: "tumble",
  name: "Tumble",
  tags: ["lowly"],
  faction: "river-folk",
};

export function entity(
  ref: AnchorRef,
  status: SceneEntity["status"] = "neutral",
  lowly = false,
): SceneEntity {
  return { ref, status, lowly, present: true };
}

/** Builds a loom input positioned at a beat, with all earlier beats complete. */
export function inputAt(
  index: WorldIndex,
  beatId: string,
  opts: Partial<Omit<LoomInput, "scene" | "story">> & {
    turn?: number;
    scene?: Partial<SceneFacts>;
    sceneChanged?: boolean;
    chapterEnded?: boolean;
  } = {},
): LoomInput {
  const ref = index.beats.get(beatId);
  if (!ref) throw new Error(`no beat ${beatId}`);
  const completed = index.beatOrder.filter((b) => b.order < ref.order).map((b) => b.beat.id);
  const region = index.regions.get(ref.beat.region);
  return {
    story: {
      turn: opts.turn ?? ref.order * 3 + 1,
      progress: storyProgress(index, completed),
      chapterNumber: ref.chapter.number,
      actNumber: ref.act.number,
      completedBeats: completed,
      sceneChanged: opts.sceneChanged ?? true,
      chapterEnded: opts.chapterEnded ?? false,
    },
    scene: {
      id: `scene-${beatId}`,
      kind: ref.beat.kind,
      beatId,
      regionId: ref.beat.region,
      terrain: region?.terrain ?? [],
      entities: [],
      offeredShortcuts: ref.beat.offersShortcuts,
      lieBenefit: false,
      ...opts.scene,
    },
    deedCandidates: opts.deedCandidates ?? [],
    promisesKept: opts.promisesKept ?? [],
    check: opts.check ?? null,
    heroesDowned: opts.heroesDowned ?? [],
    partyDown: opts.partyDown ?? false,
  };
}

export function deed(
  tag: DeedCandidate["tag"],
  anchor: AnchorRef | null,
  extra: Partial<DeedCandidate> = {},
): DeedCandidate {
  return {
    tag,
    actorIds: ["hero-a"],
    anchor,
    evidence: { forgoneBenefit: 1 },
    source: "choice",
    confidence: 1,
    summary: `${tag} toward ${anchor?.name ?? "someone"}`,
    ...extra,
  };
}
