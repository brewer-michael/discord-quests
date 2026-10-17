import type { Rng } from "../rng/index";
import type { DetourDef } from "../world/index";
import {
  type LoomContext,
  type LoomMoment,
  markProvidence,
  momentById,
  nextId,
  providenceAllowed,
} from "./context";
import { MUST_NOT_EXPLAIN } from "./tuning";
import type {
  AuditEntry,
  DetourPlan,
  DirectorConstraint,
  LoomInput,
  LoomState,
  NarrativeDirective,
} from "./types";
import type { SocketType } from "./vocab";

export function momentSockets(m: LoomMoment): SocketType[] {
  return m.sockets.map((s) => s.type);
}

export function renderDetourText(text: string, plan: DetourPlan, ctx: LoomContext): string {
  const target = momentById(ctx, plan.target.momentId);
  return capitalize(
    text
      .replaceAll("{{npc}}", plan.introduced.name)
      .replaceAll("{{place}}", plan.introduced.name)
      .replaceAll("{{item}}", plan.introduced.name)
      .replaceAll("{{target}}", target?.placeName ?? "the place ahead"),
  );
}

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

/** Decisive moments ahead that are neither too close nor too far off, with an open socket this detour serves. */
function candidateTargets(
  ctx: LoomContext,
  input: LoomInput,
  template: DetourDef,
  state: LoomState,
): LoomMoment[] {
  const done = new Set(input.story.doneMoments);
  const from = input.story.progress;
  const taken = new Set(
    state.detours.filter((d) => d.state === "planted").map((d) => `${d.target.momentId}|${d.target.socket}`),
  );
  return ctx.moments.filter(
    (m) =>
      !m.done &&
      !done.has(m.id) &&
      m.at >= from + 2 &&
      m.at <= from + 10 &&
      momentSockets(m).some((s) => template.serves.includes(s) && !taken.has(`${m.id}|${s}`)),
  );
}

/** Maybe plant a quiet-hand detour: an odd bit of bad luck with a purpose registered in advance. */
export function considerDetour(
  state: LoomState,
  input: LoomInput,
  ctx: LoomContext,
  rng: Rng,
  audit: AuditEntry[],
): { directives: NarrativeDirective[]; constraints: DirectorConstraint[] } {
  const none = { directives: [], constraints: [] };
  const { index, tuning } = ctx;
  if (!input.story.sceneChanged || input.scene.kind === "crux" || input.scene.kind === "combat") return none;
  if (state.detours.some((d) => d.state === "planted")) return none;
  if (state.detours.some((d) => d.plantedChapter === input.story.chapterNumber)) return none;
  const last = state.counters.lastDetourTurn;
  if (last !== null && input.story.turn - last < tuning.detourCooldownTurns) return none;
  if (!providenceAllowed(state, input.story.turn, tuning)) return none;

  const options: Array<{ template: DetourDef; target: LoomMoment; socket: SocketType }> = [];
  for (const template of index.world.detours) {
    if (!template.when.sceneKinds.includes(input.scene.kind)) continue;
    if (
      template.when.terrain.length > 0 &&
      !template.when.terrain.some((t) => input.scene.terrain.includes(t))
    )
      continue;
    for (const target of candidateTargets(ctx, input, template, state)) {
      const socket = momentSockets(target).find((s) => template.serves.includes(s));
      if (socket) options.push({ template, target, socket });
    }
  }
  // Draw the chance even with no options, so detours never shift other draws.
  const roll = rng.next();
  if (options.length === 0 || roll >= tuning.detourChance) return none;

  const choice = rng.pick(options);
  const plan: DetourPlan = {
    id: nextId(state, "q"),
    templateId: choice.template.id,
    state: "planted",
    target: { momentId: choice.target.id, socket: choice.socket },
    introduced: {
      kind: choice.template.introduces.kind,
      name: choice.template.introduces.name,
      tags: choice.template.introduces.tags,
      ...(choice.template.introduces.archetype ? { archetype: choice.template.introduces.archetype } : {}),
    },
    plantedTurn: input.story.turn,
    plantedProgress: input.story.progress,
    plantedChapter: input.story.chapterNumber,
    earliestPayoffProgress: input.story.progress + 2,
    deadlineProgress: choice.target.at + 6,
  };
  state.detours.push(plan);
  state.counters.lastDetourTurn = input.story.turn;
  markProvidence(state, input.story.turn);
  audit.push({
    step: "detour",
    detail: `planted ${plan.id} (${plan.templateId}) for ${plan.target.momentId}/${plan.target.socket}`,
  });
  return {
    directives: [
      {
        kind: "detour_setup",
        text: choice.template.setup,
        introduce: { kind: plan.introduced.kind, name: plan.introduced.name },
        mustNot: [
          "Play it as ordinary bad luck.",
          "Do not suggest it happens for a reason.",
          MUST_NOT_EXPLAIN[2] as string,
        ],
      },
    ],
    constraints: [
      { kind: "need_socket", momentId: plan.target.momentId, socket: plan.target.socket, detourId: plan.id },
    ],
  };
}

/** Pays off planted detours whose moment has come, and retargets any that lost their purpose. */
export function settleDetours(
  state: LoomState,
  input: LoomInput,
  ctx: LoomContext,
  audit: AuditEntry[],
): NarrativeDirective[] {
  const { index } = ctx;
  const directives: NarrativeDirective[] = [];
  const done = new Set(input.story.doneMoments);
  for (const plan of state.detours) {
    if (plan.state !== "planted") continue;
    const template = index.detours.get(plan.templateId);
    if (!template) {
      plan.state = "abandoned";
      continue;
    }
    if (input.scene.momentId === plan.target.momentId) {
      if (input.story.progress < plan.earliestPayoffProgress && input.scene.kind !== "crux") continue;
      plan.state = "paid_off";
      plan.payoffTurn = input.story.turn;
      markProvidence(state, input.story.turn);
      audit.push({ step: "detour", detail: `paid off ${plan.id}` });
      directives.push({
        kind: "detour_payoff",
        text: renderDetourText(template.payoff, plan, ctx),
        mustNot: [
          "Let the heroes notice the connection to the earlier bad luck themselves. Do not explain it.",
          MUST_NOT_EXPLAIN[1] as string,
        ],
      });
      continue;
    }
    const targetPassed = done.has(plan.target.momentId);
    const overdue = input.story.progress > plan.deadlineProgress;
    if (!targetPassed && !overdue) continue;
    // Repurpose: find another decisive moment ahead that this detour can serve.
    const next = candidateTargets(ctx, input, template, state).find((m) => m.id !== plan.target.momentId);
    const socket = next ? momentSockets(next).find((s) => template.serves.includes(s)) : undefined;
    if (next && socket) {
      plan.target = { momentId: next.id, socket };
      plan.deadlineProgress = next.at + 6;
      plan.earliestPayoffProgress = Math.min(plan.earliestPayoffProgress, input.story.progress + 1);
      audit.push({ step: "detour", detail: `repurposed ${plan.id} for ${next.id}` });
      continue;
    }
    plan.state = "repurposed";
    plan.payoffTurn = input.story.turn;
    audit.push({ step: "detour", detail: `${plan.id} paid off as a small kindness` });
    directives.push({
      kind: "detour_payoff",
      text: capitalize(
        `${plan.introduced.name} from before turns up again, just when a little help is needed.`,
      ),
      mustNot: ["Do not explain the connection.", MUST_NOT_EXPLAIN[1] as string],
    });
  }
  return directives;
}

/** Detours planted for this crux add their weight to it. */
export function detourBoost(state: LoomState, momentId: string, openSockets: readonly SocketType[]): number {
  return state.detours
    .filter(
      (d) =>
        (d.state === "planted" || d.state === "paid_off") &&
        d.target.momentId === momentId &&
        openSockets.includes(d.target.socket),
    )
    .reduce((sum) => sum + 0.5, 0);
}
