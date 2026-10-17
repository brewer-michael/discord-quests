import type { Effort, LlmTask } from "@dq/core/llm";
import { preset } from "./presets";
import type { ResolvedProviderConfig } from "./types";

export interface ProviderEnv {
  ANTHROPIC_API_KEY?: string;
  OPENAI_API_KEY?: string;
  GEMINI_API_KEY?: string;
  MASTER_KEYS?: string;
  ALLOW_PRIVATE_ENDPOINTS?: string;
  DEFAULT_DAILY_BUDGET_USD?: string;
  DEFAULT_DAILY_IMAGE_CAP?: string;
  DEFAULT_DAILY_TOKEN_CAP?: string;
}

export interface Route {
  configId: string;
  model: string;
  params: { effort?: Effort; maxTokens?: number };
  priority: number;
}

export type RouteTask = LlmTask | "image";

export interface EnvDefaults {
  configs: Map<string, ResolvedProviderConfig>;
  routes: Partial<Record<RouteTask, Route[]>>;
}

const LLM_TASKS: LlmTask[] = ["narrator", "director", "intent", "safety", "judge", "summarizer"];

function fromPreset(id: string, presetId: string, apiKey: string): ResolvedProviderConfig | null {
  const p = preset(presetId);
  if (!p) return null;
  return {
    id,
    name: `${p.label} (server default)`,
    presetId,
    adapterId: p.adapter,
    baseUrl: p.baseUrl,
    auth: p.auth,
    apiKey,
    extraHeaders: {},
    selfHosted: false,
    capabilities: p.capabilities,
    pricing: Object.fromEntries(p.models.filter((m) => m.pricing).map((m) => [m.id, m.pricing ?? {}])),
    maxOutput: Object.fromEntries(
      p.models.filter((m) => m.maxOutput).map((m) => [m.id, m.maxOutput as number]),
    ),
    models: Object.fromEntries(
      p.models.map((m) => [
        m.id,
        {
          ...(m.reasoning ? { reasoning: m.reasoning } : {}),
          ...(m.structured ? { structured: m.structured } : {}),
        },
      ]),
    ),
    genericSpec: null,
  };
}

/**
 * Platform-wide defaults from environment variables, so a server can play
 * before anyone has configured providers on the setup page. Guild settings
 * always take precedence.
 */
export function envDefaults(env: ProviderEnv): EnvDefaults {
  const configs = new Map<string, ResolvedProviderConfig>();
  const routes: EnvDefaults["routes"] = {};
  const add = (cfg: ResolvedProviderConfig | null) => cfg && configs.set(cfg.id, cfg);

  if (env.ANTHROPIC_API_KEY) add(fromPreset("env:anthropic", "anthropic", env.ANTHROPIC_API_KEY));
  if (env.OPENAI_API_KEY) {
    add(fromPreset("env:openai", "openai", env.OPENAI_API_KEY));
    add(fromPreset("env:openai-images", "openai-images", env.OPENAI_API_KEY));
  }
  if (env.GEMINI_API_KEY) {
    add(fromPreset("env:gemini", "gemini", env.GEMINI_API_KEY));
    add(fromPreset("env:gemini-image", "gemini-image", env.GEMINI_API_KEY));
  }

  // Every story key the operator set gets the story jobs, in this order of preference.
  const story = [
    ["env:openai", "openai"],
    ["env:gemini", "gemini"],
    ["env:anthropic", "anthropic"],
  ].flatMap(([configId, presetId]) => {
    const p = preset(presetId as string);
    return p && configs.has(configId as string) ? [{ configId: configId as string, p }] : [];
  });
  for (const task of LLM_TASKS) {
    routes[task] = story.flatMap(({ configId, p }, priority) => {
      const model = p.defaultModels[task] ?? p.defaultModels.narrator;
      return model
        ? [{ configId, model, params: (p.defaultParams[task] ?? {}) as Route["params"], priority }]
        : [];
    });
  }
  const images: Route[] = [];
  if (configs.has("env:openai-images"))
    images.push({ configId: "env:openai-images", model: "gpt-image-1", params: {}, priority: 0 });
  if (configs.has("env:gemini-image")) {
    images.push({
      configId: "env:gemini-image",
      model: preset("gemini-image")?.defaultModels.image ?? "gemini-2.5-flash-image",
      params: {},
      priority: 1,
    });
  }
  routes.image = images;
  return { configs, routes };
}
