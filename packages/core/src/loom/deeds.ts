import type { ShortcutDef } from "../world/schema";
import { upsertBearer } from "./bearers";
import { clamp, type LoomContext, nextId } from "./context";
import type {
  AuditEntry,
  CostEvidence,
  Deed,
  DeedCandidate,
  LoomInput,
  LoomState,
  Snare,
  Thread,
} from "./types";
import { type DeedTag, isShortcutTag, isVirtueTag, type VirtueTag } from "./vocab";

type Qualified = { ok: true; tag: DeedTag; costFloor?: number } | { ok: false; reason: string };

/**
 * Checks a candidate deed against what actually happened in the scene. The
 * loom never takes a player's (or the narrator's) word for it.
 */
export function qualifyDeed(
  c: DeedCandidate,
  input: LoomInput,
  state: LoomState,
  ctx: LoomContext,
): Qualified {
  const scene = input.scene;
  const entity = c.anchor ? scene.entities.find((e) => e.ref.id === c.anchor?.id) : undefined;
  const anchorTags = new Set([...(c.anchor?.tags ?? []), ...(entity?.ref.tags ?? [])]);
  const lowly = Boolean(entity?.lowly) || anchorTags.has("lowly");

  if (isShortcutTag(c.tag)) {
    if (c.shortcutId && ctx.index.shortcuts.has(c.shortcutId)) return { ok: true, tag: c.tag };
    if (c.confidence >= 0.6) return { ok: true, tag: c.tag };
    return { ok: false, reason: "shortcut not confirmed" };
  }

  switch (c.tag as VirtueTag) {
    case "mercy":
      if (entity?.status === "at_mercy") return { ok: true, tag: "mercy" };
      if (entity && lowly) return { ok: true, tag: "kindness_to_lowly" };
      return { ok: false, reason: "no one was at the heroes' mercy" };
    case "kindness_to_lowly":
      if (!c.anchor) return { ok: false, reason: "kindness needs someone to be kind to" };
      if (c.evidence.rewardExpected) return { ok: true, tag: c.tag, costFloor: 0.3 };
      return lowly ? { ok: true, tag: c.tag } : { ok: true, tag: c.tag, costFloor: 0.3 };
    case "honesty_at_cost": {
      const deceiveOffered = scene.offeredShortcuts.some(
        (id) => ctx.index.shortcuts.get(id)?.tag === "deceive",
      );
      if (scene.lieBenefit || deceiveOffered || (c.evidence.forgoneBenefit ?? 0) > 0)
        return { ok: true, tag: c.tag };
      return { ok: true, tag: c.tag, costFloor: 0.3 };
    }
    case "patience": {
      const declined = c.evidence.shortcutDeclined;
      if (declined && scene.offeredShortcuts.includes(declined)) return { ok: true, tag: c.tag };
      if (scene.offeredShortcuts.length > 0 && !input.deedCandidates.some((d) => isShortcutTag(d.tag))) {
        return { ok: true, tag: c.tag };
      }
      return { ok: false, reason: "no shortcut was on offer" };
    }
    case "promise_kept":
      if (c.anchor && input.promisesKept.includes(c.anchor.id)) return { ok: true, tag: c.tag };
      return { ok: false, reason: "no promise was fulfilled" };
    case "self_sacrifice": {
      const e = c.evidence;
      if (
        (e.hpSpent ?? 0) > 0 ||
        (e.goldForgone ?? 0) > 0 ||
        (e.daysLost ?? 0) > 0 ||
        e.itemGiven ||
        e.riskTaken
      ) {
        return { ok: true, tag: c.tag };
      }
      return { ok: false, reason: "nothing was given up" };
    }
    case "keepsake_kept": {
      const keepsakeOffer = scene.offeredShortcuts.some(
        (id) => ctx.index.shortcuts.get(id)?.price.kind === "keepsake",
      );
      const traded = input.deedCandidates.some((d) => d.tag === "trade_keepsake" || d.tag === "fox_bargain");
      if (keepsakeOffer && !traded) return { ok: true, tag: c.tag };
      return { ok: false, reason: "no one asked for the keepsake" };
    }
    case "amends": {
      const open = state.snares.filter((s) => s.state !== "unknotted" && snareMatchesAnchor(s, c.anchor));
      if (open.length > 0) return { ok: true, tag: c.tag };
      return { ok: false, reason: "nothing to make amends for" };
    }
  }
  return { ok: false, reason: "unknown deed" };
}

export function snareMatchesAnchor(s: Snare, anchor: DeedCandidate["anchor"]): boolean {
  if (!anchor) return false;
  if (s.anchor && s.anchor.id === anchor.id) return true;
  if (s.faction && (anchor.id === s.faction || anchor.faction === s.faction)) return true;
  if (s.shortcutId && anchor.kind === "npc") return false;
  return false;
}

/** How much a deed cost. A virtue that cost nothing counts for little. */
export function costFactor(e: CostEvidence): number {
  let score = 0;
  score += clamp(e.forgoneBenefit ?? 0, 0, 3) * 0.35;
  score += clamp(e.daysLost ?? 0, 0, 3) * 0.2;
  if ((e.hpSpent ?? 0) > 0) score += 0.2;
  if ((e.goldForgone ?? 0) > 0) score += clamp((e.goldForgone ?? 0) / 100, 0, 1) * 0.2;
  if (e.itemGiven) score += 0.2;
  if (e.riskTaken) score += 0.25;
  if (e.shortcutDeclined) score += 0.35;
  if (e.rewardExpected) score -= 0.3;
  return clamp(0.3 + score, 0.3, 1.5);
}

export interface DeedOutcome {
  deeds: Deed[];
  threads: Thread[];
  snares: Snare[];
  unknotted: Snare[];
}

/** Records qualifying deeds as threads (virtues) or snares (shortcuts). Mutates `state`. */
export function recordDeeds(
  state: LoomState,
  input: LoomInput,
  ctx: LoomContext,
  audit: AuditEntry[],
): DeedOutcome {
  const out: DeedOutcome = { deeds: [], threads: [], snares: [], unknotted: [] };
  const { tuning, index } = ctx;
  const seen = new Set<string>();

  for (const candidate of input.deedCandidates) {
    const q = qualifyDeed(candidate, input, state, ctx);
    if (!q.ok) {
      audit.push({ step: "deed", detail: `rejected ${candidate.tag}: ${q.reason}` });
      continue;
    }
    const key = `${q.tag}|${candidate.anchor?.id ?? "-"}`;
    if (seen.has(key)) continue;
    seen.add(key);

    const previousSame = state.deeds.filter(
      (d) => d.tag === q.tag && d.anchor?.id === candidate.anchor?.id,
    ).length;
    const sameThisChapter = state.deeds.filter(
      (d) => d.tag === q.tag && d.chapter === input.story.chapterNumber,
    ).length;
    const novelty = (1 / (1 + previousSame)) * tuning.chapterDecay ** sameThisChapter;
    const sourceFactor = candidate.source === "narrator" ? tuning.narratorFactor : 1;
    const cost = Math.max(q.costFloor ?? 0, costFactor(candidate.evidence));
    const base = isVirtueTag(q.tag) ? tuning.baseWeight[q.tag] : 1;
    const weight = clamp(
      base * cost * novelty * sourceFactor * clamp(candidate.confidence, 0.3, 1),
      0,
      tuning.maxWeight,
    );

    const deed: Deed = {
      id: nextId(state, "d"),
      turn: input.story.turn,
      tag: q.tag,
      actorIds: candidate.actorIds,
      anchor: candidate.anchor,
      evidence: candidate.evidence,
      source: candidate.source,
      weight,
      progress: input.story.progress,
      chapter: input.story.chapterNumber,
      summary: candidate.summary,
      ...(candidate.shortcutId ? { shortcutId: candidate.shortcutId } : {}),
    };
    state.deeds.push(deed);
    out.deeds.push(deed);

    if (isVirtueTag(q.tag)) {
      if (q.tag === "amends") {
        for (const s of state.snares) {
          if (s.state !== "unknotted" && snareMatchesAnchor(s, candidate.anchor)) {
            s.state = "unknotted";
            out.unknotted.push(s);
            audit.push({ step: "amends", detail: `unknotted ${s.id}` });
          }
        }
        const redemption = out.unknotted.reduce((sum, s) => sum + s.severity * 0.4, 0) * 1.2;
        deed.weight = clamp(Math.max(weight, redemption), 0, tuning.maxWeight);
      }
      if (deed.weight <= 0.05) continue;
      const thread: Thread = {
        id: nextId(state, "t"),
        deedId: deed.id,
        tag: q.tag,
        actorIds: deed.actorIds,
        anchor: deed.anchor,
        weight: deed.weight,
        sincerity: 1,
        plantedProgress: input.story.progress,
        plantedTurn: input.story.turn,
        ripenSpan: tuning.ripenSpan[q.tag],
        state: "dormant",
        summary: deed.summary,
      };
      state.threads.push(thread);
      out.threads.push(thread);
      if (thread.anchor?.kind === "npc") upsertBearer(state, thread, input, ctx);
      audit.push({
        step: "thread",
        detail: `${thread.id} ${thread.tag} w=${thread.weight.toFixed(2)} anchor=${thread.anchor?.id ?? "-"}`,
      });
    } else {
      // A shortcut exploiting someone the heroes were recently kind to makes that kindness ring hollow.
      if (candidate.anchor) {
        for (const t of state.threads) {
          if (
            t.anchor?.id === candidate.anchor.id &&
            t.state !== "woven" &&
            input.story.progress - t.plantedProgress <= tuning.sincerityWindow
          ) {
            t.sincerity = Math.min(t.sincerity, tuning.sincerityPenalty);
            audit.push({ step: "sincerity", detail: `${t.id} sincerity cut` });
          }
        }
      }
      const def = candidate.shortcutId ? index.shortcuts.get(candidate.shortcutId) : undefined;
      const snare = makeSnare(state, deed, def, input);
      state.snares.push(snare);
      out.snares.push(snare);
      audit.push({
        step: "snare",
        detail: `${snare.id} ${snare.tag} sev=${snare.severity} effect=${snare.effect}`,
      });
    }
  }
  return out;
}

function makeSnare(state: LoomState, deed: Deed, def: ShortcutDef | undefined, input: LoomInput): Snare {
  const tag = deed.tag as Snare["tag"];
  const base = {
    id: nextId(state, "s"),
    deedId: deed.id,
    shortcutId: def?.id ?? null,
    tag,
    actorIds: deed.actorIds,
    anchor: deed.anchor,
    state: "latent" as const,
    createdTurn: input.story.turn,
    createdProgress: input.story.progress,
    createdChapter: input.story.chapterNumber,
    summary: deed.summary,
  };
  if (def) {
    return {
      ...base,
      severity: def.snare.severity as 1 | 2 | 3,
      due: def.snare.due,
      effect: def.snare.effect,
      hint: def.snare.hint,
      ...(def.snare.socket ? { socket: def.snare.socket } : {}),
      ...(def.snare.faction ? { faction: def.snare.faction } : {}),
    };
  }
  const faction = deed.anchor?.faction ?? (deed.anchor?.kind === "faction" ? deed.anchor.id : undefined);
  return {
    ...base,
    severity: 1,
    due: deed.anchor ? { kind: "anchor_reappears" } : { kind: "after_scenes", scenes: 3 },
    effect: faction ? "trust_lost" : "longer_way",
    hint: "What the heroes did comes back around.",
    ...(faction ? { faction } : {}),
  };
}
