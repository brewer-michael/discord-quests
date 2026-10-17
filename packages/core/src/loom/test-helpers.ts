import { fileURLToPath } from "node:url";
import { storyProgress } from "../story/living";
import type { SceneKind } from "../story/vocab";
import { readWorldFiles } from "../world/fs";
import { indexWorld, type WorldIndex } from "../world/index-world";
import { loadWorld } from "../world/load";
import type { World } from "../world/types";
import { type LoomContext, type LoomMoment, loomContext } from "./context";
import type { LoomTuning } from "./tuning";
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

/**
 * A campaign of The Dimming played in a sensible order, for tests: each step is a set piece or one of the seed's
 * decisive moments, with the chapter it falls in.
 */
export const DIMMING_TIMELINE: Array<{ id: string; chapter: number }> = [
  ["the-last-flame", 1],
  ["the-thief-in-the-lamp-house", 1],
  ["hatties-request", 1],
  ["gloam-in-the-garden", 1],
  ["the-fork-in-the-road", 2],
  ["the-lost-river-child", 2],
  ["the-hollow-oak", 2],
  ["shadow-wolves", 2],
  ["the-toll-bridge", 3],
  ["lantern-hall", 3],
  ["siege-of-lantern-hall", 3],
  ["the-road-ahead", 3],
  ["bellhollow", 4],
  ["the-tinkers-gate", 4],
  ["the-dark-lighthouse", 5],
  ["lost-in-mistfen", 5],
  ["wardens-watch", 6],
  ["raid-on-the-watch", 6],
  ["race-to-the-waystone", 6],
  ["the-singing-dunes", 7],
  ["the-cold-kitchens", 7],
  ["the-knights-patrol", 7],
  ["the-ember-vault", 7],
  ["the-thousand-steps", 8],
  ["the-last-step", 8],
].map(([id, chapter]) => ({ id: id as string, chapter: chapter as number }));

function position(id: string): number {
  const i = DIMMING_TIMELINE.findIndex((s) => s.id === id);
  if (i < 0) throw new Error(`not in the timeline: ${id}`);
  return i;
}

/** Story progress when the scene at this position starts. */
function progressAt(pos: number, index: WorldIndex): number {
  const seed = index.seeds.get("the-dimming");
  const before = DIMMING_TIMELINE.slice(0, pos);
  const milestones = before.filter((s) => seed?.moments.some((m) => m.id === s.id)).length;
  return storyProgress(before.length, milestones);
}

/** The Dimming's decisive moments as the hidden hand sees them, placed where the timeline plays them. */
export function dimmingMoments(index: WorldIndex, doneBefore = 0): LoomMoment[] {
  const seed = index.seeds.get("the-dimming");
  if (!seed) throw new Error("no seed the-dimming");
  return seed.moments.map((m) => {
    const pos = position(m.id);
    return {
      id: m.id,
      title: m.title,
      placeName: (m.poi ? index.pois.get(m.poi)?.poi.name : undefined) ?? m.title,
      sockets: m.crux.sockets,
      requiredGrace: m.crux.requiredGrace,
      onSuccess: m.crux.onSuccess,
      onCostlySuccess: m.crux.onCostlySuccess,
      onFailForward: m.crux.onFailForward,
      finale: m.finale,
      at: progressAt(pos, index),
      done: pos < doneBefore,
    };
  });
}

/** A loom context for The Dimming. */
export function starterContext(index: WorldIndex, tuning: Partial<LoomTuning> = {}): LoomContext {
  return loomContext(index, dimmingMoments(index), tuning);
}

/** Builds a loom input positioned at a step of the timeline, with every earlier step played. */
export function inputAt(
  index: WorldIndex,
  id: string,
  opts: Partial<Omit<LoomInput, "scene" | "story">> & {
    turn?: number;
    scene?: Partial<SceneFacts>;
    sceneChanged?: boolean;
    chapterEnded?: boolean;
  } = {},
): LoomInput {
  const pos = position(id);
  const step = DIMMING_TIMELINE[pos] as { id: string; chapter: number };
  const seed = index.seeds.get("the-dimming");
  const moment = seed?.moments.find((m) => m.id === id);
  const situation = index.situations.get(id);
  const regionId = moment?.region ?? situation?.region ?? index.world.meta.startRegion;
  const region = index.regions.get(regionId);
  const doneMoments = DIMMING_TIMELINE.slice(0, pos)
    .map((s) => s.id)
    .filter((sid) => seed?.moments.some((m) => m.id === sid));
  return {
    story: {
      turn: opts.turn ?? pos * 3 + 1,
      progress: progressAt(pos, index),
      chapterNumber: step.chapter,
      doneMoments,
      sceneChanged: opts.sceneChanged ?? true,
      chapterEnded: opts.chapterEnded ?? false,
    },
    scene: {
      id: `scene-${id}`,
      kind: (moment ? "crux" : situation?.kind) as SceneKind,
      momentId: moment ? id : null,
      regionId,
      terrain: region?.terrain ?? [],
      entities: [],
      offeredShortcuts: situation?.offersShortcuts ?? [],
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
