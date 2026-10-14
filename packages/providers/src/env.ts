import type { LlmTask } from "@dq/core/llm";
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
  params: { effort?: "low" | "medium" | "high" | "xhigh" | "max"; maxTokens?: number };
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

  const anthropic = preset("anthropic");
  for (const task of LLM_TASKS) {
    const list: Route[] = [];
    if (configs.has("env:anthropic") && anthropic) {
      list.push({
        configId: "env:anthropic",
        model: anthropic.defaultModels[task] ?? "claude-opus-5-5",
        params: (anthropic.defaultParams[task] ?? {}) as Route["params"],
        priority: 0,
      });
    }
    routes[task] = list;
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
