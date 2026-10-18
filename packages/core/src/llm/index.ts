import type { z } from "zod";

/**
 * The contract between the game and whatever AI writes the story. Providers
 * (whichever services the server configured) implement LlmGateway; the
 * engine only ever talks to this interface.
 */

export type LlmTask = "narrator" | "director" | "intent" | "safety" | "summarizer" | "judge" | "writer";
export const LLM_TASKS: readonly LlmTask[] = [
  "narrator",
  "director",
  "intent",
  "safety",
  "summarizer",
  "judge",
  "writer",
];

/** How hard a model reasons before it answers. "none" asks it not to, where the service allows. */
export type Effort = "none" | "minimal" | "low" | "medium" | "high" | "xhigh" | "max";

/** Every effort level, from no reasoning to the most. */
export const EFFORTS: readonly Effort[] = ["none", "minimal", "low", "medium", "high", "xhigh", "max"];

/** A block of prompt text. Stable blocks go first and may be cached by providers that support it. */
export interface PromptBlock {
  text: string;
  cache?: "5m" | "1h";
}

export interface StructuredCall<T> {
  task: LlmTask;
  system: PromptBlock[];
  user: PromptBlock[];
  schema: z.ZodType<T>;
  schemaName: string;
  /**
   * Roughly how long the answer runs, in tokens. Used only to estimate spending before the call; it is never sent
   * as a limit. Limits come from the service's own settings.
   */
  expectTokens: number;
  /** The task's usual reasoning depth. The server's per-job setting, when there is one, wins. */
  effort?: Effort;
}

export interface LlmUsage {
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens?: number;
  cacheWriteTokens?: number;
}

export type StructuredOutcome<T> =
  | { ok: true; value: T; usage: LlmUsage; model: string; fellBack: boolean }
  | {
      ok: false;
      stop: "refusal" | "max_tokens" | "filtered" | "error" | "invalid" | "budget" | "unconfigured";
      error?: string;
      usage?: LlmUsage;
    };

export interface CallScope {
  guildId: string;
  campaignId?: string;
}

export interface LlmGateway {
  structured<T>(call: StructuredCall<T>, scope: CallScope): Promise<StructuredOutcome<T>>;
}
