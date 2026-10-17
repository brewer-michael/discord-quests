import type { PromptBlock } from "@dq/core/llm";
import { joinUrl, requestJson } from "../http";
import { extractJson, strictJsonSchema } from "../json-schema";
import {
  type AdapterResult,
  type CallContext,
  type CallTrace,
  type LlmAdapter,
  ProviderError,
  type ResolvedProviderConfig,
  type StructuredRequest,
} from "../types";

const join = (blocks: PromptBlock[]) => blocks.map((b) => b.text).join("\n\n");

interface ChatResponse {
  model?: string;
  choices?: Array<{
    finish_reason?: string;
    message?: {
      content?: string | null;
      refusal?: string | null;
      /** Reasoning returned apart from the answer: reasoning_content (llama.cpp, DeepSeek, vLLM) or reasoning. */
      reasoning_content?: string | null;
      reasoning?: string | null;
    };
  }>;
  usage?: {
    prompt_tokens?: number;
    completion_tokens?: number;
    prompt_tokens_details?: { cached_tokens?: number };
    completion_tokens_details?: { reasoning_tokens?: number };
  };
  /** llama.cpp's own timings for the request. */
  timings?: Record<string, unknown>;
}

/** What the logs keep from a response besides the answer. */
function traceOf(res: ChatResponse): CallTrace {
  const message = res.choices?.[0]?.message;
  const reasoning = message?.reasoning_content ?? message?.reasoning;
  const reasoningTokens = res.usage?.completion_tokens_details?.reasoning_tokens;
  const timings = Object.fromEntries(
    Object.entries(res.timings ?? {}).filter((e): e is [string, number] => typeof e[1] === "number"),
  );
  return {
    ...(typeof message?.content === "string" ? { answer: message.content } : {}),
    ...(typeof reasoning === "string" && reasoning ? { reasoning } : {}),
    ...(typeof reasoningTokens === "number" ? { reasoningTokens } : {}),
    ...(Object.keys(timings).length > 0 ? { timings } : {}),
  };
}

/**
 * Any OpenAI-compatible chat completions API: OpenAI, OpenRouter, Groq,
 * Together, Fireworks, DeepSeek, Mistral, xAI, Ollama, LM Studio, vLLM,
 * llama.cpp, or a custom endpoint. Uses the strongest structured-output mode
 * the endpoint supports, and always validates the result.
 */
export const openAiCompatAdapter: LlmAdapter = {
  id: "openai_compat",

  async generateStructured<T>(
    req: StructuredRequest<T>,
    cfg: ResolvedProviderConfig,
    ctx: CallContext,
  ): Promise<AdapterResult<T>> {
    const base = cfg.baseUrl ?? "https://api.openai.com/v1";
    const mode = cfg.capabilities.structured ?? "json_schema";
    const schema = strictJsonSchema(req.schema);
    let system = join(req.system);
    if (mode !== "json_schema") {
      system += `\n\nRespond with a single JSON object matching this JSON Schema, and nothing else:\n${JSON.stringify(schema)}`;
    }
    const maxParam = (cfg.capabilities as { maxTokensParam?: string }).maxTokensParam ?? "max_tokens";
    const body: Record<string, unknown> = {
      model: req.model,
      messages: [
        { role: "system", content: system },
        { role: "user", content: join(req.user) },
      ],
      [maxParam]: req.maxOutputTokens,
    };
    if (mode === "json_schema")
      body.response_format = {
        type: "json_schema",
        json_schema: { name: req.schemaName, schema, strict: true },
      };
    else if (mode === "json_object") body.response_format = { type: "json_object" };

    let res: ChatResponse;
    try {
      res = (await requestJson(ctx.fetch, cfg, joinUrl(base, "chat/completions"), {
        body,
        signal: ctx.signal,
      })) as ChatResponse;
    } catch (e) {
      const retryable = e instanceof ProviderError ? e.retryable : true;
      return { ok: false, stop: "error", error: (e as Error).message, retryable };
    }
    const choice = res.choices?.[0];
    const trace = traceOf(res);
    const usage = {
      inputTokens: res.usage?.prompt_tokens ?? 0,
      outputTokens: res.usage?.completion_tokens ?? 0,
      cacheReadTokens: res.usage?.prompt_tokens_details?.cached_tokens ?? 0,
    };
    if (choice?.message?.refusal)
      return { ok: false, stop: "refusal", error: choice.message.refusal, usage, retryable: false, trace };
    if (choice?.finish_reason === "length")
      return { ok: false, stop: "max_tokens", usage, retryable: false, trace };
    if (choice?.finish_reason === "content_filter")
      return { ok: false, stop: "filtered", usage, retryable: false, trace };
    const content = choice?.message?.content ?? "";
    let json: unknown;
    try {
      json = mode === "json_schema" ? JSON.parse(content) : extractJson(content);
    } catch {
      return { ok: false, stop: "invalid", error: "response was not JSON", usage, retryable: false, trace };
    }
    const parsed = req.schema.safeParse(json);
    if (!parsed.success)
      return {
        ok: false,
        stop: "invalid",
        error: parsed.error.message.slice(0, 500),
        usage,
        retryable: false,
        trace,
      };
    return { ok: true, value: parsed.data, usage, model: res.model ?? req.model, fellBack: false, trace };
  },

  async listModels(cfg, ctx) {
    const base = cfg.baseUrl ?? "https://api.openai.com/v1";
    const res = (await requestJson(ctx.fetch, cfg, joinUrl(base, "models"), {})) as {
      data?: Array<{ id: string }>;
    };
    return (res.data ?? []).map((m) => m.id).sort();
  },
};
