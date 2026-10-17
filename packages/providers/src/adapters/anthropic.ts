import Anthropic from "@anthropic-ai/sdk";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import type { PromptBlock } from "@dq/core/llm";
import type {
  AdapterResult,
  CallContext,
  LlmAdapter,
  ResolvedProviderConfig,
  StructuredRequest,
} from "../types";

/** Models that accept the server-side refusal fallback ("default" routing). */
const SERVER_FALLBACK_MODELS = new Set([
  "claude-fable-5-1",
  "claude-opus-5-5",
  "claude-opus-5",
  "claude-sonnet-5-5",
]);
const FALLBACK_BETA = "server-side-fallback-2026-07-01";
/** Above this, non-streaming requests risk HTTP timeouts; stream instead. */
const NON_STREAMING_MAX = 16000;

function blocks(list: PromptBlock[]): Anthropic.Beta.BetaTextBlockParam[] {
  return list.map((b) => ({
    type: "text" as const,
    text: b.text,
    ...(b.cache ? { cache_control: { type: "ephemeral" as const, ttl: b.cache } } : {}),
  }));
}

/**
 * Claude, through the official SDK. Thinking is left to the model (adaptive
 * by default on current models); depth is controlled with effort. Structured
 * output uses output_config.format, re-validated with zod.
 */
export const anthropicAdapter: LlmAdapter = {
  id: "anthropic",

  async generateStructured<T>(
    req: StructuredRequest<T>,
    cfg: ResolvedProviderConfig,
    ctx: CallContext,
  ): Promise<AdapterResult<T>> {
    const client = new Anthropic({
      apiKey: cfg.apiKey ?? undefined,
      ...(cfg.baseUrl ? { baseURL: cfg.baseUrl } : {}),
      fetch: ctx.fetch,
      maxRetries: 2,
      defaultHeaders: cfg.extraHeaders,
    });
    const officialEndpoint = !cfg.baseUrl || cfg.baseUrl.startsWith("https://api.anthropic.com");
    const useFallbacks =
      cfg.capabilities.serverFallbacks !== false && officialEndpoint && SERVER_FALLBACK_MODELS.has(req.model);
    const format = betaZodOutputFormat(req.schema);
    // Its API won't take a request without a cap, so one this project doesn't document gets a generous one.
    const maxTokens = req.maxOutputTokens ?? 32000;
    const effort = req.effort === "none" ? undefined : req.effort === "minimal" ? "low" : req.effort;
    const params: Anthropic.Beta.MessageCreateParamsNonStreaming = {
      model: req.model,
      max_tokens: maxTokens,
      system: blocks(req.system),
      messages: [{ role: "user", content: blocks(req.user) }],
      output_config: {
        format: { type: "json_schema", schema: format.schema },
        ...(effort && cfg.capabilities.effort !== false ? { effort } : {}),
      },
      ...(useFallbacks ? { betas: [FALLBACK_BETA], fallbacks: "default" as const } : {}),
    };

    let message: Anthropic.Beta.BetaMessage;
    try {
      message =
        maxTokens <= NON_STREAMING_MAX
          ? await client.beta.messages.create(params, { signal: ctx.signal })
          : await client.beta.messages.stream(params, { signal: ctx.signal }).finalMessage();
    } catch (e) {
      if (
        e instanceof Anthropic.RateLimitError ||
        e instanceof Anthropic.InternalServerError ||
        e instanceof Anthropic.APIConnectionError
      ) {
        return { ok: false, stop: "error", error: e.message, retryable: true };
      }
      if (e instanceof Anthropic.APIError) {
        return {
          ok: false,
          stop: "error",
          error: `${e.status ?? ""} ${e.message}`.trim(),
          retryable: (e.status ?? 0) >= 500,
        };
      }
      return { ok: false, stop: "error", error: (e as Error).message, retryable: true };
    }

    const usage = {
      inputTokens: message.usage.input_tokens,
      outputTokens: message.usage.output_tokens,
      cacheReadTokens: message.usage.cache_read_input_tokens ?? 0,
      cacheWriteTokens: message.usage.cache_creation_input_tokens ?? 0,
    };
    const iterations =
      (message.usage as unknown as { iterations?: Array<{ type?: string }> }).iterations ?? [];
    const fellBack = iterations.some((i) => i.type === "fallback_message");

    if (message.stop_reason === "refusal") return { ok: false, stop: "refusal", usage, retryable: false };
    if (message.stop_reason === "max_tokens")
      return { ok: false, stop: "max_tokens", usage, retryable: false };
    const text = message.content
      .filter((b): b is Anthropic.Beta.BetaTextBlock => b.type === "text")
      .map((b) => b.text)
      .join("");
    let json: unknown;
    try {
      json = JSON.parse(text);
    } catch {
      return { ok: false, stop: "invalid", error: "response was not JSON", usage, retryable: false };
    }
    const parsed = req.schema.safeParse(json);
    if (!parsed.success)
      return {
        ok: false,
        stop: "invalid",
        error: parsed.error.message.slice(0, 500),
        usage,
        retryable: false,
      };
    return { ok: true, value: parsed.data, usage, model: message.model, fellBack };
  },

  async listModels(cfg, ctx) {
    const client = new Anthropic({
      apiKey: cfg.apiKey ?? undefined,
      ...(cfg.baseUrl ? { baseURL: cfg.baseUrl } : {}),
      fetch: ctx.fetch,
    });
    const out: string[] = [];
    for await (const m of client.models.list()) out.push(m.id);
    return out;
  },
};
