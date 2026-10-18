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
  isCrux: boolean;
  chapterNumber: number;
  actNumber: number;
  /** The fight in this scene, if there is one. */
  combat?: CombatState;
  /** The story planner's note on how this scene should echo the heroes' earlier choices. */
  directorNote?: string;
  /** Beats the heroes went round to get here. They count as done once this scene opens. */
  bypassed?: string[];
}

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
 * with a travel scene whenever the party needs to change region, going round
 * any beat the heroes have already got past. Thread bearers are placed in
 * decisive scenes so a payoff can be plausible.
 */
export function nextSceneSpec(index: WorldIndex, story: StoryState, loom: LoomState): SceneSpec | null {
  const route = nextBeatRoute(index, story, loom);
  if (!route) return null;
  const { ref, bypassed } = route;
  const spec =
    ref.beat.region !== story.regionId
      ? travelScene(index, story, ref, bypassed)
      : beatScene(index, ref, loom, bypassed);
  return bypassed.length > 0 ? { ...spec, bypassed: bypassed.map((b) => b.beatId) } : spec;
}

/** A beat the heroes went round, and how they did (null when the story's own telling already showed it). */
interface Bypass {
  beatId: string;
  how: string | null;
}

/**
 * The next beat to play, going round the ones the heroes have got past: a beat whose authored bypass their
 * deeds have opened, or one the storyteller said the story itself carried them beyond. Never round a decisive
 * beat.
 */
export function nextBeatRoute(
  index: WorldIndex,
  story: StoryState,
  loom: LoomState,
): { ref: BeatRef; bypassed: Bypass[] } | null {
  const done = new Set(story.completedBeats);
  const bypassed: Bypass[] = [];
  const reported = story.arrivedAt ? index.beats.get(story.arrivedAt) : undefined;
  const arrival = reported && !reported.beat.decisive && !reported.beat.crux ? reported : undefined;
  for (;;) {
    const ref = nextPlayableBeat(index, [...done], story.branches ?? []);
    if (!ref) return null;
    const { beat } = ref;
    if (beat.decisive || beat.crux || beat.branch) return { ref, bypassed };
    const way = beat.bypass;
    const opened = Boolean(
      way &&
        loom.deeds.some(
          (d) => (way.deeds as readonly string[]).includes(d.tag) && d.anchor?.id === way.target,
        ),
    );
    const passed = Boolean(arrival && arrival.chapter.id === ref.chapter.id && arrival.order > ref.order);
    if (!opened && !passed) return { ref, bypassed };
    done.add(beat.id);
    bypassed.push({ beatId: beat.id, how: opened && way ? way.how : null });
  }
}

/**
 * Later beats of this scene's chapter, in this scene's region, that the story could bring the heroes to on its
 * own, in order: never a decisive one, or anything past it. For a journey, the ones beyond where it ends.
 */
export function laterInChapter(index: WorldIndex, story: StoryState, spec: SceneSpec): BeatRef[] {
  const done = new Set(story.completedBeats);
  const here = spec.beatId
    ? index.beats.get(spec.beatId)
    : nextPlayableBeat(index, story.completedBeats, story.branches ?? []);
  if (!here) return [];
  const out: BeatRef[] = [];
  for (const ref of index.beatOrder) {
    if (ref.chapter.id !== here.chapter.id || ref.order <= here.order) continue;
    if (ref.beat.branch || done.has(ref.beat.id)) continue;
    if (ref.beat.decisive || ref.beat.crux) break;
    // Somewhere in another region needs a journey of its own, so the story can't simply arrive there.
    if (ref.beat.region === spec.regionId) out.push(ref);
  }
  return out;
}

/** Where a beat happens, by name. */
export function beatPlace(index: WorldIndex, ref: BeatRef): string {
  return (ref.beat.poi ? index.pois.get(ref.beat.poi)?.poi.name : undefined) ?? ref.beat.title;
}

function travelScene(index: WorldIndex, story: StoryState, ref: BeatRef, bypassed: Bypass[]): SceneSpec {
  const from = index.regions.get(story.regionId);
  const to = index.regions.get(ref.beat.region);
  const edge = from?.edges.find((e) => e.to === ref.beat.region);
  const days = edge?.travelDays ?? 2;
  const end = beatPlace(index, ref);
  const route = bypassed.flatMap((b) => (b.how ? [b.how] : [])).join(" ");
  return {
    kind: "travel",
    beatId: null,
    regionId: ref.beat.region,
    poiId: null,
    title: `The Road to ${to?.name ?? ref.beat.region}`,
    summary: `The heroes travel from ${from?.name ?? "here"} to ${to?.name ?? "the next region"}, ${days} day${days === 1 ? "" : "s"} ${edge?.road ? "along the road" : "through wild country"}. ${to?.description ?? ""} ${route ? `${route} ` : ""}The journey ends at ${end}: the heroes go no further this scene.`,
    goals: [`Reach ${end}.`],
    entities: [],
    offeredShortcuts: [],
    opportunities: [],
    isCrux: false,
    chapterNumber: ref.chapter.number,
    actNumber: ref.act.number,
  };
}

function beatScene(index: WorldIndex, ref: BeatRef, loom: LoomState, bypassed: Bypass[] = []): SceneSpec {
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
  const route = bypassed.flatMap((b) => (b.how ? [b.how] : [])).join(" ");
  return {
    kind: beat.kind,
    beatId: beat.id,
    regionId: beat.region,
    poiId: beat.poi ?? null,
    title: beat.title,
    summary: `${route ? `How the heroes got here: ${route} ` : ""}${beat.summary}${poi ? ` (${poi.name}: ${poi.description})` : ""}`,
    goals: beat.goals,
    entities,
    offeredShortcuts,
    opportunities,
    isCrux: Boolean(beat.crux),
    chapterNumber: ref.chapter.number,
    actNumber: ref.act.number,
  };
}
