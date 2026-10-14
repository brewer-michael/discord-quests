import { anthropicAdapter } from "./adapters/anthropic";
import { geminiAdapter } from "./adapters/gemini";
import { IMAGE_ADAPTERS } from "./adapters/images";
import { openAiCompatAdapter } from "./adapters/openai-compat";
import type { ImageAdapter, ImageAdapterId, LlmAdapter, LlmAdapterId } from "./types";

const LLM: Record<LlmAdapterId, LlmAdapter> = {
  anthropic: anthropicAdapter,
  openai_compat: openAiCompatAdapter,
  gemini: geminiAdapter,
};

const IMAGE = Object.fromEntries(IMAGE_ADAPTERS.map((a) => [a.id, a])) as Record<
  ImageAdapterId,
  ImageAdapter
>;

export function llmAdapter(id: string): LlmAdapter | undefined {
  return LLM[id as LlmAdapterId];
}

export function imageAdapter(id: string): ImageAdapter | undefined {
  return IMAGE[id as ImageAdapterId];
}

export function isLlmAdapter(id: string): id is LlmAdapterId {
  return id in LLM;
}
