import type { PromptBlock } from "@dq/core/llm";
import { joinUrl, requestJson } from "../http";
import { strictJsonSchema } from "../json-schema";
import {
  type AdapterResult,
  type CallContext,
  type LlmAdapter,
  ProviderError,
  type ResolvedProviderConfig,
  type StructuredRequest,
} from "../types";

const join = (blocks: PromptBlock[]) => blocks.map((b) => b.text).join("\n\n");

interface GeminiResponse {
  modelVersion?: string;
  promptFeedback?: { blockReason?: string };
  candidates?: Array<{ finishReason?: string; content?: { parts?: Array<{ text?: string }> } }>;
  usageMetadata?: {
    promptTokenCount?: number;
    candidatesTokenCount?: number;
    cachedContentTokenCount?: number;
  };
}

const SAFETY = [
  "HARM_CATEGORY_HARASSMENT",
  "HARM_CATEGORY_HATE_SPEECH",
  "HARM_CATEGORY_SEXUALLY_EXPLICIT",
  "HARM_CATEGORY_DANGEROUS_CONTENT",
].map((category) => ({ category, threshold: "BLOCK_LOW_AND_ABOVE" }));

/** Google Gemini over its REST API, with JSON-schema responses and strict safety settings. */
export const geminiAdapter: LlmAdapter = {
  id: "gemini",

  async generateStructured<T>(
    req: StructuredRequest<T>,
    cfg: ResolvedProviderConfig,
    ctx: CallContext,
  ): Promise<AdapterResult<T>> {
    const base = cfg.baseUrl ?? "https://generativelanguage.googleapis.com/v1beta";
    const body = {
      systemInstruction: { parts: [{ text: join(req.system) }] },
      contents: [{ role: "user", parts: [{ text: join(req.user) }] }],
      generationConfig: {
        responseMimeType: "application/json",
        responseJsonSchema: strictJsonSchema(req.schema),
        maxOutputTokens: req.maxOutputTokens,
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
      outputTokens: res.usageMetadata?.candidatesTokenCount ?? 0,
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
    const text = (cand?.content?.parts ?? []).map((p) => p.text ?? "").join("");
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
