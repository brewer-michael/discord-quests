import type { Rng } from "../rng/index";
import { type LoomContext, markProvidence, providenceAllowed } from "./context";
import { projectedCruxThreads } from "./convergence";
import { isLive, ripeness } from "./threads";
import { MUST_NOT_EXPLAIN } from "./tuning";
import type { AuditEntry, LoomInput, LoomState, NarrativeDirective, RuleEffect } from "./types";

/**
 * Small graces outside decisive moments: a meaningful failure softened, or a
 * downed hero helped up. Rare, never back to back, and never spending a
 * thread the next crux may need.
 */
export function considerMinorGrace(
  state: LoomState,
  input: LoomInput,
  ctx: LoomContext,
  rng: Rng,
  audit: AuditEntry[],
): { directives: NarrativeDirective[]; effects: RuleEffect[] } {
  const none = { directives: [], effects: [] };
  const { tuning } = ctx;
  if (input.scene.kind === "crux") return none;
  const failure = input.check?.kind === "failure" && input.check.stakes !== "low" && input.check.margin >= -5;
  const downed = input.heroesDowned.length > 0;
  if (!failure && !downed) return none;
  if (state.counters.lastMinorGraceChapter === input.story.chapterNumber) return none;
  if (state.counters.lastSnareSceneId === input.scene.id) return none;
  if (!providenceAllowed(state, input.story.turn, tuning)) return none;

  const protectedIds = projectedCruxThreads(state, input, ctx);
  const candidates = state.threads
    .filter(
      (t) => isLive(t) && !t.reservedFor && !protectedIds.has(t.id) && ripeness(t, input.story.progress) >= 1,
    )
    .map((t) => ({ t, present: input.scene.entities.some((e) => e.present && e.ref.id === t.anchor?.id) }))
    .sort(
      (a, b) =>
        Number(b.present) - Number(a.present) || a.t.weight - b.t.weight || a.t.id.localeCompare(b.t.id),
    );
  const roll = rng.next();
  const pick = candidates[0];
  if (!pick || roll >= tuning.minorGraceChance) return none;

  const t = pick.t;
  const agent = pick.present ? (t.anchor?.name ?? null) : null;
  const effects: RuleEffect[] = [];
  let text: string;
  if (downed) {
    const heroId = input.heroesDowned[0] as string;
    effects.push({ kind: "hero_rallies", characterId: heroId });
    text = agent
      ? `${agent} is suddenly there, helping the dazed hero back onto their feet.`
      : "Just as things look worst, the dazed hero blinks, shakes their head and gets back up, as if something had steadied them.";
  } else {
    effects.push({ kind: "failure_softened" });
    text = agent
      ? `The attempt goes wrong, but ${agent} happens to be right there and turns it into a near miss instead of a disaster.`
      : "The attempt goes wrong, but the trouble turns aside at the last moment: a gust of wind, a lucky stumble, a door that wasn't quite latched.";
  }
  t.state = "woven";
  t.wovenTurn = input.story.turn;
  t.wovenAs = {
    momentId: input.scene.momentId ?? input.scene.id,
    socket: "minor_grace",
    payoffSummary: text,
    lead: true,
  };
  state.counters.minorGraces += 1;
  state.counters.lastMinorGraceChapter = input.story.chapterNumber;
  state.counters.lastMinorGraceSceneId = input.scene.id;
  markProvidence(state, input.story.turn);
  audit.push({ step: "grace", detail: `minor grace from ${t.id}` });
  return { directives: [{ kind: "minor_grace", text, mustNot: [...MUST_NOT_EXPLAIN] }], effects };
}
