import { EFFORTS, type Effort } from "@dq/core/llm";
import type { ModelSpecView, ReasoningStyle } from "./types";

const rank = (e: Effort) => EFFORTS.indexOf(e);

/** The documented level nearest the one asked for; between two equally near, the deeper one. */
export function nearestEffort(want: Effort, supported: readonly Effort[]): Effort {
  if (supported.length === 0 || supported.includes(want)) return want;
  return [...supported].sort(
    (a, b) => Math.abs(rank(a) - rank(want)) - Math.abs(rank(b) - rank(want)) || rank(b) - rank(a),
  )[0] as Effort;
}

/**
 * The level to ask a model for, from how hard the job wants it to reason and what the provider documents for the
 * model. Undefined means send nothing: the job didn't say, or the model doesn't reason.
 */
export function effortFor(spec: ModelSpecView | undefined, want: Effort | undefined): Effort | undefined {
  if (!want) return undefined;
  const r = spec?.reasoning;
  if (!r) return want;
  if (r.mode === "none") return undefined;
  const levels = r.efforts ?? [];
  // A model that always reasons can't be switched off: the lightest documented level, or its default.
  if (r.mode === "always" && want === "none") {
    const lightest = levels.filter((e) => e !== "none").sort((a, b) => rank(a) - rank(b))[0];
    return lightest;
  }
  return nearestEffort(want, levels);
}

/** Without a documented list, the three levels every reasoning_effort service accepts. */
function plainLevel(e: Effort): Effort {
  if (e === "none") return "none";
  if (e === "minimal" || e === "low") return "low";
  if (e === "medium") return "medium";
  return "high";
}

/**
 * The request fields that carry the level, in the provider's own format. `levels` are the ones the provider
 * documents for the model, when it lists any.
 */
export function reasoningFields(
  style: ReasoningStyle,
  effort: Effort | undefined,
  levels: readonly Effort[] = [],
): Record<string, unknown> {
  if (!effort || style === "none") return {};
  const level = levels.length > 0 ? effort : plainLevel(effort);
  switch (style) {
    case "reasoning_effort":
      return { reasoning_effort: level };
    case "openrouter":
      return { reasoning: { effort: level } };
    case "thinking_type":
      // Thinking switches on or off; models that list levels (DeepSeek V4) also take reasoning_effort.
      return {
        thinking: { type: effort === "none" ? "disabled" : "enabled" },
        ...(effort !== "none" && levels.length > 0 ? { reasoning_effort: effort } : {}),
      };
    case "reasoning_enabled":
      // reasoning_effort for the level; switching it off is its own field (Together).
      return effort === "none" ? { reasoning: { enabled: false } } : { reasoning_effort: level };
    case "enable_thinking":
      return { chat_template_kwargs: { enable_thinking: effort !== "none" } };
  }
}

/** How much of a thinking budget each level spends, for models that take a token budget instead of a level. */
const SHARE: Record<Effort, number> = {
  none: 0,
  minimal: 0.1,
  low: 0.25,
  medium: 0.5,
  high: 0.75,
  xhigh: 0.9,
  max: 1,
};

/**
 * A thinking budget in tokens, within the range the provider documents for the model. 0 switches thinking off,
 * where the model allows it.
 */
export function budgetFor(
  budget: { min: number; max: number },
  want: Effort,
  mode: "always" | "optional" | "none",
): number {
  if (want === "none" && mode === "optional") return 0;
  return Math.min(budget.max, Math.max(budget.min, Math.round(budget.max * SHARE[want])));
}

/** The answer without any reasoning a server left inline (<think>…</think>). */
export function withoutThinking(text: string): string {
  return text.replace(/<(think|thinking)>[\s\S]*?<\/\1>/gi, "").trim();
}
