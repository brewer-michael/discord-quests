import type { Rng } from "../rng/index";
import { nextCrux } from "../story/progress";
import type { LoomContext } from "./context";
import { isLive, scoreThreads } from "./threads";
import type {
  Bearer,
  BearerPresence,
  DirectorConstraint,
  LoomInput,
  LoomState,
  NarrativeDirective,
  Thread,
} from "./types";

/**
 * Anyone who anchors a live thread becomes a bearer: they must survive, and
 * the story keeps them near the heroes, the way Gollum kept following Frodo.
 */
export function upsertBearer(state: LoomState, thread: Thread, input: LoomInput, ctx: LoomContext): void {
  const anchor = thread.anchor;
  if (anchor?.kind !== "npc") return;
  const named = ctx.index.namedNpcs.get(anchor.id);
  const tags = new Set([...(anchor.tags ?? []), ...(named?.tags ?? [])]);
  const factionId = anchor.faction ?? named?.faction;
  const faction = factionId ? ctx.index.factions.get(factionId) : undefined;
  let presence: BearerPresence = "elsewhere";
  if (thread.tag === "mercy" || tags.has("covets-ember") || tags.has("pitiable")) presence = "shadowing";
  else if (faction && (faction.alignment === "long-road" || faction.alignment === "neutral"))
    presence = "ally_waiting";

  const existing = state.bearers.find((b) => b.npcId === anchor.id);
  if (existing) {
    if (!existing.threadIds.includes(thread.id)) existing.threadIds.push(thread.id);
    if (presence === "shadowing") existing.presence = "shadowing";
    existing.mustSurvive = true;
    return;
  }
  const bearer: Bearer = {
    npcId: anchor.id,
    name: anchor.name ?? named?.name ?? anchor.id,
    threadIds: [thread.id],
    mustSurvive: true,
    presence,
    lastSeenTurn: input.story.turn,
    nextGlimpseProgress: input.story.progress + ctx.tuning.glimpseEvery[0],
  };
  state.bearers.push(bearer);
}

/** Bearers stop being bearers once none of their threads are live. */
export function pruneBearers(state: LoomState): void {
  for (const b of state.bearers) {
    const live = b.threadIds.some((id) => {
      const t = state.threads.find((x) => x.id === id);
      return t ? isLive(t) : false;
    });
    b.mustSurvive = live;
  }
}

export function bearerOutputs(
  state: LoomState,
  input: LoomInput,
  ctx: LoomContext,
  rng: Rng,
): { constraints: DirectorConstraint[]; directives: NarrativeDirective[] } {
  const constraints: DirectorConstraint[] = [];
  const directives: NarrativeDirective[] = [];
  const crux = nextCrux(ctx.index, input.story.completedBeats);

  // Who could matter at the next crux? Schedule them to be nearby.
  const candidates = new Set<string>();
  if (crux?.beat.crux) {
    const live = state.threads.filter(
      (t) => isLive(t) && (!t.reservedForBeat || t.reservedForBeat === crux.beat.id),
    );
    for (const s of scoreThreads(
      live,
      crux.beat.crux.sockets,
      input.story.progress + 4,
      null,
      state,
      ctx,
    ).slice(0, 3)) {
      if (s.thread.anchor?.kind === "npc") candidates.add(s.thread.anchor.id);
    }
  }
  for (const t of state.threads) {
    if (isLive(t) && t.reservedForBeat && t.anchor?.kind === "npc") candidates.add(t.anchor.id);
  }

  for (const b of state.bearers) {
    if (!b.mustSurvive) continue;
    constraints.push({ kind: "keep_alive", npcId: b.npcId });
    if (candidates.has(b.npcId) && crux) {
      constraints.push({
        kind: "schedule_presence",
        npcId: b.npcId,
        nearBeatId: crux.beat.id,
        mode: b.presence,
      });
    }
    const present = input.scene.entities.some((e) => e.ref.id === b.npcId && e.present);
    if (present) {
      b.lastSeenTurn = input.story.turn;
      continue;
    }
    if (
      b.presence === "shadowing" &&
      input.story.sceneChanged &&
      input.scene.kind !== "crux" &&
      input.story.progress >= b.nextGlimpseProgress
    ) {
      directives.push({
        kind: "bearer_glimpse",
        text: `Keep it small: a glimpse of ${b.name} at the edge of sight, someone small following the heroes at a distance. They slip away if anyone looks.`,
        mustNot: [
          "Do not let the heroes catch or talk to them this scene.",
          "Do not explain why they are following.",
        ],
      });
      const [lo, hi] = ctx.tuning.glimpseEvery;
      b.nextGlimpseProgress = input.story.progress + rng.int(lo, hi);
    }
  }
  return { constraints, directives };
}

/** NPCs who should be quietly present in a crux scene so a payoff can be plausible. */
export function bearersForScene(state: LoomState, beatId: string): string[] {
  const ids = new Set<string>();
  for (const t of state.threads) {
    if (!isLive(t) || t.anchor?.kind !== "npc") continue;
    if (!t.reservedForBeat || t.reservedForBeat === beatId) ids.add(t.anchor.id);
  }
  return [...ids].filter((id) => state.bearers.some((b) => b.npcId === id && b.mustSurvive));
}
