import type { Effort, PromptBlock } from "@dq/core/llm";
import { joinUrl, requestJson } from "../http";
import { strictJsonSchema } from "../json-schema";
import { budgetFor, effortFor } from "../reasoning";
import {
  type AdapterResult,
  type CallContext,
  type LlmAdapter,
  type ModelSpecView,
  ProviderError,
  type ResolvedProviderConfig,
  type StructuredRequest,
} from "../types";

const join = (blocks: PromptBlock[]) => blocks.map((b) => b.text).join("\n\n");

interface GeminiResponse {
  modelVersion?: string;
  promptFeedback?: { blockReason?: string };
  candidates?: Array<{
    finishReason?: string;
    content?: { parts?: Array<{ text?: string; thought?: boolean }> };
  }>;
  usageMetadata?: {
    promptTokenCount?: number;
    candidatesTokenCount?: number;
    thoughtsTokenCount?: number;
    cachedContentTokenCount?: number;
  };
}

const SAFETY = [
  "HARM_CATEGORY_HARASSMENT",
  "HARM_CATEGORY_HATE_SPEECH",
  "HARM_CATEGORY_SEXUALLY_EXPLICIT",
  "HARM_CATEGORY_DANGEROUS_CONTENT",
].map((category) => ({ category, threshold: "BLOCK_LOW_AND_ABOVE" }));

/**
 * How hard the model thinks, in the field its generation takes: a level for Gemini 3 and later, a token budget for
 * Gemini 2.5. Never both: Gemini rejects a request that sends both. Nothing for a model the docs don't cover.
 */
export function thinkingConfig(
  spec: ModelSpecView | undefined,
  want: Effort | undefined,
): Record<string, unknown> | undefined {
  const r = spec?.reasoning;
  if (!want || !r || r.mode === "none") return undefined;
  if (r.budget) return { thinkingBudget: budgetFor(r.budget, want, r.mode) };
  const level = effortFor(spec, want);
  return level && level !== "none" ? { thinkingLevel: level } : undefined;
}

/** Google Gemini over its REST API, with JSON-schema responses and strict safety settings. */
export const geminiAdapter: LlmAdapter = {
  id: "gemini",

  async generateStructured<T>(
    req: StructuredRequest<T>,
    cfg: ResolvedProviderConfig,
    ctx: CallContext,
  ): Promise<AdapterResult<T>> {
    const base = cfg.baseUrl ?? "https://generativelanguage.googleapis.com/v1beta";
    const thinking = thinkingConfig(cfg.models[req.model], req.effort);
    const body = {
      systemInstruction: { parts: [{ text: join(req.system) }] },
      contents: [{ role: "user", parts: [{ text: join(req.user) }] }],
      generationConfig: {
        responseMimeType: "application/json",
        responseJsonSchema: strictJsonSchema(req.schema),
        ...(req.maxOutputTokens ? { maxOutputTokens: req.maxOutputTokens } : {}),
        ...(thinking ? { thinkingConfig: thinking } : {}),
      },
      safetySettings: SAFETY,
    };
    let res: GeminiResponse;
    try {
      res = (await requestJson(
        ctx.fetch,
        cfg,
        joinUrl(base, `models/${encodeURIComponent(req.model)}:generateContent`),
        {
          body,
          signal: ctx.signal,
        },
      )) as GeminiResponse;
    } catch (e) {
      return {
        ok: false,
        stop: "error",
        error: (e as Error).message,
        retryable: e instanceof ProviderError ? e.retryable : true,
      };
    }
    const usage = {
      inputTokens: res.usageMetadata?.promptTokenCount ?? 0,
      // Thinking is billed as output.
      outputTokens:
        (res.usageMetadata?.candidatesTokenCount ?? 0) + (res.usageMetadata?.thoughtsTokenCount ?? 0),
      cacheReadTokens: res.usageMetadata?.cachedContentTokenCount ?? 0,
    };
    if (res.promptFeedback?.blockReason)
      return { ok: false, stop: "filtered", error: res.promptFeedback.blockReason, usage, retryable: false };
    const cand = res.candidates?.[0];
    if (cand?.finishReason === "MAX_TOKENS")
      return { ok: false, stop: "max_tokens", usage, retryable: false };
    if (cand?.finishReason === "SAFETY" || cand?.finishReason === "PROHIBITED_CONTENT") {
      return { ok: false, stop: "filtered", usage, retryable: false };
    }
    const text = (cand?.content?.parts ?? [])
      .filter((p) => !p.thought)
      .map((p) => p.text ?? "")
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
    return { ok: true, value: parsed.data, usage, model: res.modelVersion ?? req.model, fellBack: false };
  },

  async listModels(cfg, ctx) {
    const base = cfg.baseUrl ?? "https://generativelanguage.googleapis.com/v1beta";
    const res = (await requestJson(ctx.fetch, cfg, joinUrl(base, "models"), {})) as {
      models?: Array<{ name: string }>;
    };
    return (res.models ?? []).map((m) => m.name.replace(/^models\//, "")).sort();
  },
};
