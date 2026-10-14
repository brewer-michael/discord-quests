import type { CallScope, LlmGateway, StructuredCall, StructuredOutcome } from "@dq/core/llm";
import { type BudgetGuard, costMicros } from "./budget";
import { llmAdapter } from "./registry";
import { createSafeFetch } from "./safe-fetch";
import type { ProviderStore } from "./store";
import type { ResolvedProviderConfig } from "./types";

export interface GatewayOptions {
  /** For tests: replaces network access. */
  fetch?: typeof fetch;
  log?: { warn(msg: string, data?: Record<string, unknown>): void };
}

/**
 * The engine's door to the story AI: picks the route for each task, enforces
 * budgets, calls the adapter, records usage, and fails over to the next
 * route on outages. Refusals and bad output are returned, not retried
 * elsewhere, so the engine can handle them.
 */
export class ProviderGateway implements LlmGateway {
  private readonly safeFetch: typeof fetch;
  private readonly privateFetch: typeof fetch;

  constructor(
    private readonly store: ProviderStore,
    private readonly budget: BudgetGuard,
    private readonly opts: GatewayOptions = {},
  ) {
    this.safeFetch = opts.fetch ?? createSafeFetch();
    const allowPrivate = store.env.ALLOW_PRIVATE_ENDPOINTS === "true";
    this.privateFetch = opts.fetch ?? createSafeFetch({ allowPrivate });
  }

  fetchFor(cfg: ResolvedProviderConfig): typeof fetch {
    return cfg.selfHosted ? this.privateFetch : this.safeFetch;
  }

  async structured<T>(call: StructuredCall<T>, scope: CallScope): Promise<StructuredOutcome<T>> {
    const routes = await this.store.routes(call.task, scope);
    if (routes.length === 0)
      return { ok: false, stop: "unconfigured", error: `no provider configured for ${call.task}` };
    const settings = await this.store.guildSettings(scope.guildId);
    let last: StructuredOutcome<T> = { ok: false, stop: "error", error: "no route succeeded" };
    const promptChars = [...call.system, ...call.user].reduce((s, b) => s + b.text.length, 0);

    for (const route of routes) {
      const cfg = await this.store.resolve(route.configId).catch((e: Error) => {
        this.opts.log?.warn("provider config unavailable", { configId: route.configId, error: e.message });
        return null;
      });
      if (!cfg) continue;
      const adapter = llmAdapter(cfg.adapterId);
      if (!adapter) continue;
      const maxOutputTokens = Math.min(
        call.maxOutputTokens,
        route.params.maxTokens ?? Number.POSITIVE_INFINITY,
      );
      const estimateTokens = Math.ceil(promptChars / 4) + Math.ceil(maxOutputTokens * 0.3);
      const pricing = cfg.pricing[route.model];
      const gate = await this.budget.allow(scope.guildId, {
        estimateMicros: costMicros(pricing, {
          inputTokens: Math.ceil(promptChars / 4),
          outputTokens: Math.ceil(maxOutputTokens * 0.3),
        }),
        estimateTokens,
        platform: this.store.isPlatformConfig(cfg.id),
        guildBudgetUsd: settings.dailyBudgetUsd,
        guildImageCap: settings.dailyImageCap,
      });
      if (!gate.ok) return { ok: false, stop: "budget", error: `daily ${gate.reason} limit reached` };

      const effort = call.effort ?? route.params.effort;
      const res = await adapter.generateStructured(
        {
          task: call.task,
          model: route.model,
          system: call.system,
          user: call.user,
          schema: call.schema,
          schemaName: call.schemaName,
          maxOutputTokens,
          ...(effort ? { effort } : {}),
        },
        cfg,
        { fetch: this.fetchFor(cfg) },
      );
      if (res.usage || res.ok) {
        const usage = res.ok ? res.usage : (res.usage ?? {});
        await this.budget.record({
          guildId: scope.guildId,
          ...(scope.campaignId ? { campaignId: scope.campaignId } : {}),
          task: call.task,
          providerConfigId: cfg.id,
          model: res.ok ? res.model : route.model,
          usage,
          costMicros: costMicros(pricing, usage),
          fellBack: res.ok ? res.fellBack : false,
        });
      }
      if (res.ok)
        return { ok: true, value: res.value, usage: res.usage, model: res.model, fellBack: res.fellBack };
      last = {
        ok: false,
        stop: res.stop,
        ...(res.error ? { error: res.error } : {}),
        ...(res.usage ? { usage: res.usage } : {}),
      };
      if (!res.retryable) return last;
      this.opts.log?.warn("provider failed, trying next route", { configId: cfg.id, error: res.error });
    }
    return last;
  }
}
