import { finalCrux } from "../story/progress";
import type { CruxSpec } from "../world/schema";
import { clamp, type LoomContext } from "./context";
import type { LoomState, SceneFacts, Thread } from "./types";

export function ripeness(t: Thread, progress: number): number {
  if (t.ripenSpan <= 0) return 1;
  return clamp((progress - t.plantedProgress) / t.ripenSpan, 0, 1);
}

export function isLive(t: Thread): boolean {
  return t.state !== "woven" && t.state !== "lapsed";
}

/** Updates dormant -> ripening -> ripe as the story moves on. */
export function refreshThreadStates(state: LoomState, progress: number, ctx: LoomContext): void {
  for (const t of state.threads) {
    if (!isLive(t)) continue;
    const r = ripeness(t, progress);
    t.state = r >= 1 ? "ripe" : r >= ctx.tuning.minRipeness ? "ripening" : "dormant";
  }
}

type Socket = CruxSpec["sockets"][number];

/** Fit of a thread whose anchor is exactly who an anchor-tagged socket was written for. */
export const ANCHORED_FIT = 1.5;

/**
 * How well a thread fits a payoff socket: 0 means it can't. Sockets can require
 * an anchor tag (the Gollum socket needs someone who covets the Ember), which
 * is the strongest fit of all because the world wrote that moment for them, or
 * prefer a faction (River Folk boats).
 */
export function socketFit(t: Thread, socket: Socket, ctx: LoomContext): number {
  if (!socket.accepts.includes(t.tag)) return 0;
  const anchor = t.anchor;
  const npc = anchor?.kind === "npc" ? ctx.index.namedNpcs.get(anchor.id) : undefined;
  const tags = new Set([...(anchor?.tags ?? []), ...(npc?.tags ?? [])]);
  const faction = anchor?.faction ?? npc?.faction ?? (anchor?.kind === "faction" ? anchor.id : undefined);
  if (socket.anchorTag) return tags.has(socket.anchorTag) ? ANCHORED_FIT : 0;
  // For an enemy blunder the faction is the enemy, not a helper: any fitting virtue counts.
  if (socket.type === "enemy_blunder") return socket.faction && faction === socket.faction ? 1 : 0.8;
  if (socket.faction) return faction === socket.faction ? 1 : 0.4;
  return 0.8;
}

export function presenceFactor(t: Thread, scene: SceneFacts | null, state: LoomState): number {
  if (t.anchor?.kind !== "npc") return 1;
  if (scene?.entities.some((e) => e.ref.id === t.anchor?.id && e.present)) return 1;
  const bearer = state.bearers.find((b) => b.npcId === t.anchor?.id);
  if (bearer?.mustSurvive) return 0.9;
  return 0.7;
}

export interface ScoredThread {
  thread: Thread;
  socket: Socket;
  score: number;
}

/** Best socket and score for each eligible thread, best first. */
export function scoreThreads(
  threads: readonly Thread[],
  sockets: readonly Socket[],
  progress: number,
  scene: SceneFacts | null,
  state: LoomState,
  ctx: LoomContext,
): ScoredThread[] {
  const out: ScoredThread[] = [];
  for (const t of threads) {
    const r = ripeness(t, progress);
    if (r < ctx.tuning.minRipeness) continue;
    let best: ScoredThread | null = null;
    for (const socket of sockets) {
      const fit = socketFit(t, socket, ctx);
      if (fit <= 0) continue;
      const score = t.weight * r * t.sincerity * fit * presenceFactor(t, scene, state);
      if (!best || score > best.score) best = { thread: t, socket, score };
    }
    if (best) out.push(best);
  }
  return out.sort((a, b) => b.score - a.score || a.thread.id.localeCompare(b.thread.id));
}

/**
 * Keeps the strongest thread for each anchor-tagged socket of the final crux
 * (the Gollum socket) out of earlier payoffs, so the climax is never spent early.
 */
export function reserveForFinale(state: LoomState, ctx: LoomContext): void {
  const finale = finalCrux(ctx.index);
  const crux = finale?.beat.crux;
  if (!finale || !crux) return;
  for (const socket of crux.sockets) {
    if (!socket.anchorTag) continue;
    const live = state.threads.filter((t) => isLive(t) && socketFit(t, socket, ctx) > 0);
    if (live.length === 0) continue;
    const already = live.find((t) => t.reservedForBeat === finale.beat.id);
    const strongest = [...live].sort(
      (a, b) => b.weight * b.sincerity - a.weight * a.sincerity || a.id.localeCompare(b.id),
    )[0];
    if (!strongest) continue;
    if (
      already &&
      already.id !== strongest.id &&
      already.weight * already.sincerity >= strongest.weight * strongest.sincerity
    )
      continue;
    if (already && already.id !== strongest.id) delete already.reservedForBeat;
    strongest.reservedForBeat = finale.beat.id;
  }
}

export function availableFor(t: Thread, beatId: string): boolean {
  return isLive(t) && (!t.reservedForBeat || t.reservedForBeat === beatId);
}
