import type { LoomContext } from "./context";
import { MUST_NOT_EXPLAIN } from "./tuning";
import type {
  AuditEntry,
  DirectorConstraint,
  LoomInput,
  LoomState,
  NarrativeDirective,
  RuleEffect,
  Snare,
} from "./types";

function anchorPresent(s: Snare, input: LoomInput): boolean {
  return input.scene.entities.some(
    (e) =>
      e.present &&
      ((s.anchor && e.ref.id === s.anchor.id) ||
        (s.faction && (e.ref.id === s.faction || e.ref.faction === s.faction))),
  );
}

/** Marks snares as due when their condition is met. Crux snares are handled by the crux itself. */
export function markDueSnares(state: LoomState, input: LoomInput): void {
  for (const s of state.snares) {
    if (s.state !== "latent") continue;
    switch (s.due.kind) {
      case "crux":
        if (input.scene.kind === "crux") s.state = "due";
        break;
      case "anchor_reappears":
        if (input.story.turn > s.createdTurn && anchorPresent(s, input)) s.state = "due";
        break;
      case "after_beats":
        if (input.story.progress >= s.createdProgress + s.due.beats) s.state = "due";
        break;
      case "chapter_end":
        if (input.story.chapterEnded) s.state = "due";
        break;
    }
  }
}

/** Total severity of unpaid snares that weigh on a crux. Raises its difficulty. */
export function snarePressure(state: LoomState): number {
  return state.snares
    .filter(
      (s) =>
        (s.state === "latent" || s.state === "due") &&
        s.due.kind === "crux" &&
        s.effect !== "withhold_socket",
    )
    .reduce((sum, s) => sum + s.severity, 0);
}

export interface SnareOutput {
  directives: NarrativeDirective[];
  effects: RuleEffect[];
  constraints: DirectorConstraint[];
}

/**
 * Springs at most one due snare per scene (never in a crux scene, where snares
 * work through difficulty and withheld payoffs instead).
 */
export function springSnares(
  state: LoomState,
  input: LoomInput,
  ctx: LoomContext,
  audit: AuditEntry[],
): SnareOutput {
  const out: SnareOutput = { directives: [], effects: [], constraints: [] };
  if (input.scene.kind === "crux") return out;
  if (state.counters.lastSnareSceneId === input.scene.id) return out;
  const due = state.snares
    .filter((s) => s.state === "due" && s.effect !== "withhold_socket" && s.due.kind !== "crux")
    .sort((a, b) => b.severity - a.severity || a.id.localeCompare(b.id));
  const s = due[0];
  if (!s) return out;

  s.state = "sprung";
  s.sprungTurn = input.story.turn;
  state.counters.lastSnareSceneId = input.scene.id;
  audit.push({ step: "snare", detail: `sprang ${s.id} (${s.effect})` });

  const factionId = s.faction ?? s.anchor?.faction;
  const factionName = factionId
    ? (ctx.index.factions.get(factionId)?.name ?? factionId)
    : "people hereabouts";
  const mustNot = [MUST_NOT_EXPLAIN[2] as string, "Do not lecture the heroes or call them bad."];
  switch (s.effect) {
    case "borrowed_luck_recalled":
      out.effects.push({ kind: "disadvantage_next_roll", characterIds: s.actorIds });
      out.directives.push({
        kind: "snare_springs",
        effect: s.effect,
        text: "Things that went oddly smoothly before start going oddly wrong now: a slipping foot, a dropped tool, a sneeze at the worst moment.",
        mustNot,
      });
      break;
    case "trust_lost":
      if (factionId) out.effects.push({ kind: "faction_disposition", factionId, delta: -s.severity });
      out.directives.push({
        kind: "snare_springs",
        effect: s.effect,
        text: `Word has got around about what happened earlier. ${factionName} are cooler toward the heroes now, and slower to help.`,
        mustNot,
      });
      break;
    case "fox_collects":
      out.constraints.push({ kind: "snare_hook", anchor: s.anchor, effect: s.effect });
      out.directives.push({
        kind: "snare_springs",
        effect: s.effect,
        text: "Saffron the Bargain Fox appears, all smiles, to collect what she is owed. It is a small favor. It is a very inconvenient favor.",
        mustNot,
      });
      break;
    case "longer_way":
      out.effects.push({ kind: "route_blocked", regionId: input.scene.regionId });
      out.constraints.push({ kind: "snare_hook", anchor: s.anchor, effect: s.effect });
      out.directives.push({
        kind: "snare_springs",
        effect: s.effect,
        text: "The easy way ahead turns out to be closed to the heroes. They will have to go the long way round.",
        mustNot,
      });
      break;
    case "withhold_socket":
      break;
  }
  return out;
}
