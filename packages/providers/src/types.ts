import type { Effort, LlmTask, LlmUsage, PromptBlock } from "@dq/core/llm";
import type { z } from "zod";

export type LlmAdapterId = "anthropic" | "openai_compat" | "gemini";
export type ImageAdapterId =
  | "openai_images"
  | "openai_compat_images"
  | "google_imagen"
  | "gemini_image"
  | "stability"
  | "replicate"
  | "fal"
  | "generic_http";

export type AuthSpec =
  | { type: "none" }
  | { type: "bearer" }
  | { type: "header"; headerName: string; prefix?: string }
  | { type: "query"; paramName: string };

export interface ModelPricing {
  /** USD per million input tokens. */
  input?: number;
  output?: number;
  cacheRead?: number;
  /** USD per image. */
  image?: number;
}

/** A provider configuration with its secret decrypted, ready to call. */
export interface ResolvedProviderConfig {
  id: string;
  name: string;
  presetId: string;
  adapterId: LlmAdapterId | ImageAdapterId;
  baseUrl: string | null;
  auth: AuthSpec;
  apiKey: string | null;
  extraHeaders: Record<string, string>;
  /** Self-hosted endpoints may live on private networks (when the operator allows it). */
  selfHosted: boolean;
  capabilities: Partial<LlmCapabilities>;
  pricing: Record<string, ModelPricing>;
  /**
   * The longest answer each model can give, in tokens: from the provider's documentation, or what the server
   * entered for a model on its own machine or a custom endpoint.
   */
  maxOutput: Record<string, number>;
  /** Each documented model's reasoning support and structured-output mode. */
  models: Record<string, ModelSpecView>;
  genericSpec: GenericHttpSpec | null;
}

/**
 * How a service is told how hard to reason. OpenAI-compatible services don't agree on it:
 * - reasoning_effort: a top-level "reasoning_effort" (OpenAI, Z.ai, Groq, xAI, Fireworks, Mistral, Ollama, vLLM).
 * - openrouter: a "reasoning": { effort } object.
 * - thinking_type: a "thinking": { type: "enabled" | "disabled" } object, plus "reasoning_effort" for models
 *   that list levels (DeepSeek).
 * - reasoning_enabled: "reasoning_effort" for the level, and "reasoning": { enabled: false } to switch it off
 *   (Together).
 * - enable_thinking: "chat_template_kwargs": { enable_thinking } (Qwen-style servers).
 * - none: nothing is sent; the model reasons (or not) as it does by default.
 */
export type ReasoningStyle =
  | "none"
  | "reasoning_effort"
  | "openrouter"
  | "thinking_type"
  | "reasoning_enabled"
  | "enable_thinking";

export interface LlmCapabilities {
  structured: "json_schema" | "json_object" | "prompt_only";
  promptCache: "explicit" | "implicit" | "none";
  effort: boolean;
  serverFallbacks: boolean;
  reasoning: ReasoningStyle;
  maxTokensParam: "max_tokens" | "max_completion_tokens";
  /** Fields the provider's docs say to add to every request. */
  requestFields: Record<string, unknown>;
}

/** What a provider documents about one model, for building requests. */
export interface ModelSpecView {
  reasoning?: {
    mode: "always" | "optional" | "none";
    efforts?: Effort[];
    default?: string;
    /** For models that take a thinking budget in tokens instead of a level. */
    budget?: { min: number; max: number };
  };
  structured?: LlmCapabilities["structured"];
}

export interface CallContext {
  fetch: typeof fetch;
  signal?: AbortSignal;
}

export interface StructuredRequest<T> {
  task: LlmTask;
  model: string;
  system: PromptBlock[];
  user: PromptBlock[];
  schema: z.ZodType<T>;
  schemaName: string;
  /** The longest answer allowed, when the service has a limit set. Without one, nothing caps the answer. */
  maxOutputTokens?: number;
  effort?: Effort;
}

/** What came back alongside the answer, for the logs only. Nothing in the game reads it. */
export interface CallTrace {
  /** The answer text as the service sent it. */
  answer?: string;
  /** The model's reasoning, when the service returns it apart from the answer. */
  reasoning?: string;
  /** Output tokens the service says went to reasoning. */
  reasoningTokens?: number;
  /** The service's own timings, as it names them (llama.cpp: prompt_n, prompt_ms, predicted_n, cache_n...). */
  timings?: Record<string, number>;
}

export type AdapterResult<T> =
  | { ok: true; value: T; usage: LlmUsage; model: string; fellBack: boolean; trace?: CallTrace }
  | {
      ok: false;
      stop: "refusal" | "max_tokens" | "filtered" | "error" | "invalid";
      error?: string;
      usage?: LlmUsage;
      retryable: boolean;
      trace?: CallTrace;
    };

export interface LlmAdapter {
  readonly id: LlmAdapterId;
  generateStructured<T>(
    req: StructuredRequest<T>,
    cfg: ResolvedProviderConfig,
    ctx: CallContext,
  ): Promise<AdapterResult<T>>;
  listModels?(cfg: ResolvedProviderConfig, ctx: CallContext): Promise<string[]>;
}

export interface ImageRequest {
  prompt: string;
  negativePrompt: string;
  width: number;
  height: number;
  model: string;
  seed?: number;
}

export interface ImageResult {
  bytes: Uint8Array;
  mime: "image/png" | "image/webp" | "image/jpeg";
  revisedPrompt?: string;
}

export interface ImageAdapter {
  readonly id: ImageAdapterId;
  generate(req: ImageRequest, cfg: ResolvedProviderConfig, ctx: CallContext): Promise<ImageResult>;
}

/** A custom image endpoint described as a templated request and a response mapping. */
export interface GenericHttpSpec {
  request: {
    method: "POST" | "GET";
    url: string;
    headers?: Record<string, string>;
    body?: string;
  };
  response:
    | { mode: "sync"; imageBase64Path?: string; imageUrlPath?: string }
    | {
        mode: "poll";
        idPath: string;
        statusUrl: string;
        statusPath: string;
        done: string[];
        failed: string[];
        resultBase64Path?: string;
        resultUrlPath?: string;
        intervalMs?: number;
        timeoutMs?: number;
      };
}

export class ProviderError extends Error {
  constructor(
    message: string,
    readonly retryable: boolean,
    readonly status?: number,
  ) {
    super(message);
  }
}
