import type { Rng } from "../rng/index";
import { bearerOutputs, pruneBearers } from "./bearers";
import type { LoomContext } from "./context";
import { resolveCrux } from "./convergence";
import { recordDeeds } from "./deeds";
import { considerDetour, settleDetours } from "./detours";
import { considerMinorGrace } from "./grace";
import { markDueSnares, springSnares } from "./snares";
import { refreshThreadStates, reserveForFinale } from "./threads";
import type {
  AuditEntry,
  CruxResolution,
  DirectorConstraint,
  Ledger,
  LoomInput,
  LoomResult,
  LoomState,
  NarrativeDirective,
  RuleEffect,
} from "./types";

/**
 * Runs the loom for one turn. Pure: the same state, input and RNG always give
 * the same result. The order of steps is fixed and part of the contract.
 */
export function evaluateLoom(prev: LoomState, input: LoomInput, ctx: LoomContext, rng: Rng): LoomResult {
  const state = structuredClone(prev);
  const audit: AuditEntry[] = [];
  const directives: NarrativeDirective[] = [];
  const constraints: DirectorConstraint[] = [];
  const effects: RuleEffect[] = [];
  let crux: CruxResolution | null = null;

  // 1. Threads ripen with story progress.
  refreshThreadStates(state, input.story.progress, ctx);

  // 2. Record what the heroes did.
  recordDeeds(state, input, ctx, audit);
  refreshThreadStates(state, input.story.progress, ctx);
  reserveForFinale(state, ctx);

  // 3. Debts come due.
  markDueSnares(state, input);
  const sprung = springSnares(state, input, ctx, audit);
  directives.push(...sprung.directives);
  effects.push(...sprung.effects);
  constraints.push(...sprung.constraints);

  // 4. Decisive moments.
  if (input.check?.kind === "crux") {
    const out = resolveCrux(state, input as Parameters<typeof resolveCrux>[1], ctx, rng, audit);
    if (out) {
      crux = out.resolution;
      directives.push(...out.directives);
    }
  }

  // 5. Quiet-hand detours pay off (or find a new purpose).
  directives.push(...settleDetours(state, input, ctx, audit));

  // 6. Small graces.
  const grace = considerMinorGrace(state, input, ctx, rng, audit);
  directives.push(...grace.directives);
  effects.push(...grace.effects);

  // 7. New detours.
  const detour = considerDetour(state, input, ctx, rng, audit);
  directives.push(...detour.directives);
  constraints.push(...detour.constraints);

  // 8. Keep bearers alive and nearby.
  pruneBearers(state);
  const bearers = bearerOutputs(state, input, ctx, rng);
  directives.push(...bearers.directives);
  constraints.push(...bearers.constraints);

  // 9. Parties carrying debt are tempted more often.
  state.ledgers = computeLedgers(state);
  const debt = Object.values(state.ledgers).reduce((sum, l) => sum + l.debt, 0);
  if (debt >= 4) constraints.push({ kind: "tempt", intensity: 2 });
  else if (debt >= 2) constraints.push({ kind: "tempt", intensity: 1 });

  return { state, directives, constraints, effects, crux, audit };
}

/** The hidden per-hero stat: grace planted and debt still owed. */
export function computeLedgers(state: LoomState): Record<string, Ledger> {
  const ledgers: Record<string, Ledger> = {};
  const get = (id: string) => {
    ledgers[id] ??= { grace: 0, debt: 0 };
    return ledgers[id];
  };
  for (const t of state.threads) {
    if (t.state === "lapsed") continue;
    const share = (t.weight * t.sincerity) / Math.max(1, t.actorIds.length);
    for (const id of t.actorIds) get(id).grace += share;
  }
  for (const s of state.snares) {
    if (s.state !== "latent" && s.state !== "due") continue;
    const share = s.severity / Math.max(1, s.actorIds.length);
    for (const id of s.actorIds) get(id).debt += share;
  }
  return ledgers;
}

/** Combined grace of the party, used for gentle table weighting (never more than about 15%). */
export function tableBias(state: LoomState): number {
  const ledgers = Object.values(computeLedgers(state));
  const grace = ledgers.reduce((s, l) => s + l.grace, 0);
  const debt = ledgers.reduce((s, l) => s + l.debt, 0);
  return Math.max(-0.15, Math.min(0.15, (grace - debt) * 0.03));
}
