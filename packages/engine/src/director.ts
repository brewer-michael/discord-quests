import type { CombatState } from "@dq/core/combat";
import { type AnchorRef, bearersForScene, type LoomState } from "@dq/core/loom";
import type { OpportunityView } from "@dq/core/narration";
import type { SceneKind } from "@dq/core/story";
import { nextPlayableBeat } from "@dq/core/story";
import type { BeatRef, WorldIndex } from "@dq/core/world";
import type { StoryState } from "./story-state";

export type EntityStatus =
  | "hostile"
  | "at_mercy"
  | "friendly"
  | "neutral"
  | "fled"
  | "captured"
  | "befriended"
  | "away";

export interface SceneEntityState {
  ref: AnchorRef;
  kind: "npc" | "creature" | "place" | "item";
  status: EntityStatus;
  lowly: boolean;
  present: boolean;
  note?: string;
}

/** What the director decides the next scene is. Stored on the scene row. */
export interface SceneSpec {
  kind: SceneKind;
  beatId: string | null;
  regionId: string;
  poiId: string | null;
  title: string;
  summary: string;
  goals: string[];
  entities: SceneEntityState[];
  offeredShortcuts: string[];
  opportunities: OpportunityView[];
  /** Rounds before the scene closes on its own. */
  targetRounds: number;
  isCrux: boolean;
  chapterNumber: number;
  actNumber: number;
  /** The fight in this scene, if there is one. */
  combat?: CombatState;
}

const TARGET_ROUNDS: Record<SceneKind, number> = {
  exploration: 2,
  social: 2,
  combat: 2,
  travel: 1,
  rest: 1,
  crux: 1,
  choice: 1,
};

export function npcAnchor(index: WorldIndex, npcId: string): AnchorRef {
  const npc = index.namedNpcs.get(npcId);
  return {
    kind: "npc",
    id: npcId,
    name: npc?.name ?? npcId,
    tags: npc?.tags ?? [],
    ...(npc?.faction ? { faction: npc.faction } : {}),
  };
}

/**
 * The deterministic story director: the next scene follows the arc in order,
 * with a travel scene whenever the party needs to change region. Thread
 * bearers are placed in decisive scenes so a payoff can be plausible.
 */
export function nextSceneSpec(index: WorldIndex, story: StoryState, loom: LoomState): SceneSpec | null {
  const ref = nextPlayableBeat(index, story.completedBeats);
  if (!ref) return null;
  if (ref.beat.region !== story.regionId) return travelScene(index, story, ref);
  return beatScene(index, ref, loom);
}

function travelScene(index: WorldIndex, story: StoryState, ref: BeatRef): SceneSpec {
  const from = index.regions.get(story.regionId);
  const to = index.regions.get(ref.beat.region);
  const edge = from?.edges.find((e) => e.to === ref.beat.region);
  const days = edge?.travelDays ?? 2;
  return {
    kind: "travel",
    beatId: null,
    regionId: ref.beat.region,
    poiId: null,
    title: `The Road to ${to?.name ?? ref.beat.region}`,
    summary: `The heroes travel from ${from?.name ?? "here"} to ${to?.name ?? "the next region"}, ${days} day${days === 1 ? "" : "s"} ${edge?.road ? "along the road" : "through wild country"}. ${to?.description ?? ""}`,
    goals: [`Reach ${to?.name ?? "the next region"}.`],
    entities: [],
    offeredShortcuts: [],
    opportunities: [],
    targetRounds: TARGET_ROUNDS.travel,
    isCrux: false,
    chapterNumber: ref.chapter.number,
    actNumber: ref.act.number,
  };
}

function beatScene(index: WorldIndex, ref: BeatRef, loom: LoomState): SceneSpec {
  const beat = ref.beat;
  const entities: SceneEntityState[] = [];
  const add = (npcId: string, status: EntityStatus) => {
    const existing = entities.find((e) => e.ref.id === npcId);
    if (existing) {
      if (status === "at_mercy") existing.status = status;
      return;
    }
    const anchor = npcAnchor(index, npcId);
    entities.push({
      ref: anchor,
      kind: "npc",
      status,
      lowly: (anchor.tags ?? []).includes("lowly"),
      present: true,
    });
  };
  for (const id of beat.introduces) add(id, "neutral");
  for (const v of beat.virtueOpportunities)
    if (v.target && index.namedNpcs.has(v.target)) add(v.target, v.tag === "mercy" ? "at_mercy" : "neutral");
  if (beat.decisive) {
    for (const id of bearersForScene(loom, beat.id)) {
      if (!entities.some((e) => e.ref.id === id)) {
        add(id, "neutral");
        const e = entities.find((x) => x.ref.id === id);
        if (e) e.note = "lurking nearby, unnoticed unless someone looks for them";
      }
    }
  }
  const offeredShortcuts = beat.offersShortcuts.filter(
    (id) => (index.shortcuts.get(id)?.minChapter ?? 1) <= ref.chapter.number,
  );
  const opportunities: OpportunityView[] = [
    ...beat.virtueOpportunities.map((v) => ({
      kind: "virtue" as const,
      key: v.tag,
      ...(v.target ? { targetRef: v.target } : {}),
      text: v.note,
    })),
    ...offeredShortcuts.map((id) => {
      const s = index.shortcuts.get(id);
      return {
        kind: "shortcut" as const,
        key: id,
        text: `${s?.name ?? id}: ${s?.offer.replace(/\s+/g, " ").trim() ?? ""}`,
      };
    }),
  ];
  const poi = beat.poi ? index.pois.get(beat.poi)?.poi : undefined;
  return {
    kind: beat.kind,
    beatId: beat.id,
    regionId: beat.region,
    poiId: beat.poi ?? null,
    title: beat.title,
    summary: `${beat.summary}${poi ? ` (${poi.name}: ${poi.description})` : ""}`,
    goals: beat.goals,
    entities,
    offeredShortcuts,
    opportunities,
    targetRounds: TARGET_ROUNDS[beat.kind],
    isCrux: Boolean(beat.crux),
    chapterNumber: ref.chapter.number,
    actNumber: ref.act.number,
  };
}
