import type { Rng } from "../rng/index";
import { type LoomContext, markProvidence, momentById, nextMoment } from "./context";
import { detourBoost } from "./detours";
import { snarePressure } from "./snares";
import { availableFor, scoreThreads } from "./threads";
import { MUST_NOT_EXPLAIN } from "./tuning";
import type { AuditEntry, CruxResolution, LoomInput, LoomState, NarrativeDirective } from "./types";
import type { SocketType } from "./vocab";

/** A payoff's text names whoever the heroes' deed reached: "{{agent}}" in a hint becomes their name. */
export function withAgent(text: string, name: string | null): string {
  if (!text.includes("{{agent}}")) return text;
  const who = name ?? "someone the heroes once helped";
  return text
    .replace(/^\{\{agent\}\}/, who.charAt(0).toUpperCase() + who.slice(1))
    .replaceAll("{{agent}}", who);
}

/** Worse failures need more grace to turn around. */
export function marginBand(margin: number): number {
  if (margin >= -2) return 0;
  if (margin >= -6) return 1;
  return 2;
}

export interface CruxOutput {
  resolution: CruxResolution;
  directives: NarrativeDirective[];
}

/**
 * The heart of the loom. When the heroes' own effort fails at a decisive
 * moment, ripe threads can still carry the day: the enemy stumbles, a spared
 * one acts, help arrives. The heroes' roll is never changed; the world turns.
 */
export function resolveCrux(
  state: LoomState,
  input: LoomInput & { check: { kind: "crux" } & NonNullable<LoomInput["check"]> },
  ctx: LoomContext,
  rng: Rng,
  audit: AuditEntry[],
): CruxOutput | null {
  const check = input.check;
  const crux = momentById(ctx, check.momentId);
  if (!crux) return null;

  // Snares that withhold a payoff close that socket entirely. Debts tied to the crux raise the bar.
  const withheld = new Set<SocketType>();
  for (const s of state.snares) {
    if ((s.state === "latent" || s.state === "due") && s.effect === "withhold_socket" && s.socket) {
      if (crux.sockets.some((x) => x.type === s.socket)) {
        withheld.add(s.socket);
        s.state = "sprung";
        s.sprungTurn = input.story.turn;
        audit.push({ step: "crux", detail: `${s.id} withholds ${s.socket}` });
      }
    }
  }
  const pressure = snarePressure(state);
  for (const s of state.snares) {
    if ((s.state === "latent" || s.state === "due") && s.due.kind === "crux") {
      s.state = "sprung";
      s.sprungTurn = input.story.turn;
    }
  }

  const base = {
    momentId: check.momentId,
    withheldSockets: [...withheld],
    available: 0,
    required: 0,
    wovenThreadIds: [],
    socket: null,
  };
  if (check.success) {
    audit.push({ step: "crux", detail: `${check.momentId}: the heroes succeeded on their own` });
    return { resolution: { ...base, outcome: "success" }, directives: [] };
  }

  const sockets = crux.sockets.filter((s) => !withheld.has(s.type));
  const pool = state.threads.filter((t) => availableFor(t, check.momentId));
  const scored = scoreThreads(pool, sockets, input.story.progress, input.scene, state, ctx);
  const top = scored.slice(0, 3);
  const boost = detourBoost(
    state,
    check.momentId,
    sockets.map((s) => s.type),
  );
  const raw = top.reduce((sum, s) => sum + s.score, 0) + boost;
  const available = raw * rng.jitter(ctx.tuning.jitter);
  const required =
    crux.requiredGrace * (1 + 0.1 * marginBand(check.margin)) + pressure * ctx.tuning.snarePressureFactor;
  audit.push({
    step: "crux",
    detail: `${check.momentId}: available ${available.toFixed(2)} (threads ${top.length}, detours ${boost}) vs required ${required.toFixed(2)}`,
  });

  let outcome: CruxResolution["outcome"];
  if (available >= required) outcome = "success_by_convergence";
  else if (available >= ctx.tuning.costlyFraction * required) outcome = "costly_success";
  else outcome = "fail_forward";

  if (outcome === "fail_forward") {
    return {
      resolution: { ...base, outcome, available, required },
      directives: [
        {
          kind: "fail_forward",
          text: crux.onFailForward,
          mustNot: ["Keep hope alive: the story goes on."],
        },
      ],
    };
  }

  // Weave the smallest set of threads that covers what was needed (prefer one strong thread).
  const woven: typeof top = [];
  let sum = boost;
  for (const s of top) {
    if (outcome === "success_by_convergence" && sum >= required) break;
    woven.push(s);
    sum += s.score;
  }
  const lead = woven[0] ?? top[0];
  const socket = lead?.socket ?? sockets[0];
  const agentName = lead?.thread.anchor?.name ?? null;
  const hint = socket ? withAgent(socket.hint, agentName) : undefined;
  // Every woven thread shares the one thing that actually happened: the lead socket's moment.
  for (const s of woven) {
    s.thread.state = "woven";
    s.thread.wovenTurn = input.story.turn;
    s.thread.wovenAs = {
      momentId: check.momentId,
      socket: s.socket.type,
      payoffSummary: hint ?? crux.onSuccess,
      ...(s === lead ? { lead: true } : {}),
    };
  }
  state.counters.convergences += 1;
  markProvidence(state, input.story.turn);

  const text =
    outcome === "costly_success" ? `${hint ?? ""} ${crux.onCostlySuccess}`.trim() : (hint ?? crux.onSuccess);
  return {
    resolution: {
      ...base,
      outcome,
      available,
      required,
      wovenThreadIds: woven.map((s) => s.thread.id),
      socket: socket?.type ?? null,
    },
    directives: [
      {
        kind: "convergence",
        outcome,
        socket: (socket?.type ?? "enemy_blunder") as SocketType,
        agentName,
        text,
        mustNot: [
          "The heroes' own attempt must still fall short first. Show that clearly.",
          "Then let the world turn in a way nobody could have planned.",
          ...MUST_NOT_EXPLAIN,
        ],
      },
    ],
  };
}

/** Thread ids most likely to matter at the next crux. Minor graces never spend these. */
export function projectedCruxThreads(state: LoomState, input: LoomInput, ctx: LoomContext): Set<string> {
  const next = nextMoment(ctx, input.story.doneMoments);
  if (!next) return new Set();
  const pool = state.threads.filter((t) => availableFor(t, next.id));
  const scored = scoreThreads(pool, next.sockets, input.story.progress + 6, null, state, ctx);
  return new Set(scored.slice(0, 3).map((s) => s.thread.id));
}
