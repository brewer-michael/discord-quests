import type { PromptBlock } from "@dq/core/llm";
import { joinUrl, requestJson } from "../http";
import { extractJson, strictJsonSchema } from "../json-schema";
import { effortFor, reasoningFields, withoutThinking } from "../reasoning";
import {
  type AdapterResult,
  type CallContext,
  type LlmAdapter,
  ProviderError,
  type ResolvedProviderConfig,
  type StructuredRequest,
} from "../types";

const join = (blocks: PromptBlock[]) => blocks.map((b) => b.text).join("\n\n");

/** Mistral answers in chunks when it reasons: thinking chunks, then text chunks. */
interface ContentChunk {
  type?: string;
  text?: string;
}

const answerText = (content: string | ContentChunk[] | null | undefined) =>
  Array.isArray(content)
    ? content
        .filter((c) => c.type === "text")
        .map((c) => c.text ?? "")
        .join("")
    : (content ?? "");

interface ChatResponse {
  model?: string;
  choices?: Array<{
    finish_reason?: string;
    message?: { content?: string | ContentChunk[] | null; refusal?: string | null };
  }>;
  usage?: {
    prompt_tokens?: number;
    completion_tokens?: number;
    prompt_tokens_details?: { cached_tokens?: number };
  };
}

/**
 * Any OpenAI-compatible chat completions API: Z.ai, OpenAI, OpenRouter, Groq,
 * Together, Fireworks, DeepSeek, Mistral, xAI, Ollama, LM Studio, vLLM,
 * llama.cpp, or a custom endpoint. For each model it uses what the provider
 * documents: how reasoning is set and at which levels, the structured-output
 * mode, the longest answer, and any fields its docs say every request needs.
 * It reads the answer past any reasoning left inline or in thinking chunks,
 * and always validates the result.
 */
export const openAiCompatAdapter: LlmAdapter = {
  id: "openai_compat",

  async generateStructured<T>(
    req: StructuredRequest<T>,
    cfg: ResolvedProviderConfig,
    ctx: CallContext,
  ): Promise<AdapterResult<T>> {
    const base = cfg.baseUrl ?? "https://api.openai.com/v1";
    const spec = cfg.models[req.model];
    const mode = spec?.structured ?? cfg.capabilities.structured ?? "json_schema";
    const schema = strictJsonSchema(req.schema);
    let system = join(req.system);
    if (mode !== "json_schema") {
      system += `\n\nRespond with a single JSON object matching this JSON Schema, and nothing else:\n${JSON.stringify(schema)}`;
    }
    const maxParam = cfg.capabilities.maxTokensParam ?? "max_tokens";
    const body: Record<string, unknown> = {
      ...cfg.capabilities.requestFields,
      model: req.model,
      messages: [
        { role: "system", content: system },
        { role: "user", content: join(req.user) },
      ],
      ...(req.maxOutputTokens ? { [maxParam]: req.maxOutputTokens } : {}),
      ...reasoningFields(
        cfg.capabilities.reasoning ?? "none",
        effortFor(spec, req.effort),
        spec?.reasoning?.efforts?.filter((e) => e !== "none"),
      ),
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
    const usage = {
      inputTokens: res.usage?.prompt_tokens ?? 0,
      outputTokens: res.usage?.completion_tokens ?? 0,
      cacheReadTokens: res.usage?.prompt_tokens_details?.cached_tokens ?? 0,
    };
    if (choice?.message?.refusal)
      return { ok: false, stop: "refusal", error: choice.message.refusal, usage, retryable: false };
    if (choice?.finish_reason === "length") return { ok: false, stop: "max_tokens", usage, retryable: false };
    if (choice?.finish_reason === "content_filter")
      return { ok: false, stop: "filtered", usage, retryable: false };
    const content = withoutThinking(answerText(choice?.message?.content));
    let json: unknown;
    try {
      json = extractJson(content);
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
    return { ok: true, value: parsed.data, usage, model: res.model ?? req.model, fellBack: false };
  },

  async listModels(cfg, ctx) {
    const base = cfg.baseUrl ?? "https://api.openai.com/v1";
    const res = (await requestJson(ctx.fetch, cfg, joinUrl(base, "models"), {})) as {
      data?: Array<{ id: string }>;
    };
    return (res.data ?? []).map((m) => m.id).sort();
  },
};
