import type { CallScope, LlmGateway, StructuredCall, StructuredOutcome } from "@dq/core/llm";
import { type BudgetGuard, costMicros } from "./budget";
import { llmAdapter } from "./registry";
import { createSafeFetch } from "./safe-fetch";
import type { ProviderStore } from "./store";
import type { AdapterResult, ResolvedProviderConfig } from "./types";

type LogFn = (msg: string, data?: Record<string, unknown>) => void;

export interface GatewayOptions {
  /** For tests: replaces network access. */
  fetch?: typeof fetch;
  log?: { info: LogFn; warn: LogFn };
  /** Also log each answer in full, with any reasoning the service returned (LOG_AI_OUTPUT). */
  logOutput?: boolean;
}

/**
 * The engine's door to the story AI: picks the route for each task, enforces
 * budgets, calls the adapter, records usage, and fails over to the next
 * route on outages, broken answers and answers cut short. Refusals are
 * returned, not retried elsewhere, so the engine can handle them.
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
      // Only a limit set for this job or this service's model caps the answer; nothing here invents one.
      const limit = route.params.maxTokens ?? cfg.maxOutput[route.model];
      const expected = call.expectTokens;
      const estimateTokens = Math.ceil(promptChars / 4) + expected;
      const pricing = cfg.pricing[route.model];
      const gate = await this.budget.allow(scope.guildId, {
        estimateMicros: costMicros(pricing, {
          inputTokens: Math.ceil(promptChars / 4),
          outputTokens: expected,
        }),
        estimateTokens,
        platform: this.store.isPlatformConfig(cfg.id),
        guildBudgetUsd: settings.dailyBudgetUsd,
        guildImageCap: settings.dailyImageCap,
      });
      if (!gate.ok) return { ok: false, stop: "budget", error: `daily ${gate.reason} limit reached` };

      // What the server chose for this job comes first; the task's usual depth only fills in when it chose nothing.
      const effort = route.params.effort ?? call.effort;
      const started = Date.now();
      const res = await adapter.generateStructured(
        {
          task: call.task,
          model: route.model,
          system: call.system,
          user: call.user,
          schema: call.schema,
          schemaName: call.schemaName,
          ...(limit ? { maxOutputTokens: limit } : {}),
          ...(effort ? { effort } : {}),
        },
        cfg,
        { fetch: this.fetchFor(cfg) },
      );
      this.logCall(res, Date.now() - started, {
        task: call.task,
        guildId: scope.guildId,
        ...(scope.campaignId ? { campaignId: scope.campaignId } : {}),
        provider: cfg.name,
        configId: cfg.id,
        model: res.ok ? res.model : route.model,
        ...(effort ? { effort } : {}),
        ...(limit ? { maxOutputTokens: limit } : {}),
        expectTokens: expected,
        promptChars,
      });
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
      // A broken or cut-short answer is worth the next service's try; a refusal is the engine's to handle.
      if (!res.retryable && res.stop !== "invalid" && res.stop !== "max_tokens") return last;
      this.opts.log?.warn("provider failed, trying next route", {
        configId: cfg.id,
        stop: res.stop,
        error: res.error,
      });
    }
    return last;
  }

  /**
   * One line per AI call: how long it took, what it cost in tokens, how it ended, and what the service said
   * about its own work (reasoning, timings). With logOutput, a second line has the answer and reasoning.
   */
  private logCall<T>(res: AdapterResult<T>, ms: number, fields: Record<string, unknown>) {
    const log = this.opts.log;
    if (!log) return;
    const usage = res.usage;
    const trace = res.trace;
    const line = {
      ...fields,
      ms,
      ok: res.ok,
      ...(res.ok ? {} : { stop: res.stop, ...(res.error ? { error: res.error } : {}) }),
      ...(usage
        ? {
            inputTokens: usage.inputTokens,
            outputTokens: usage.outputTokens,
            ...(usage.cacheReadTokens ? { cacheReadTokens: usage.cacheReadTokens } : {}),
            ...(usage.cacheWriteTokens ? { cacheWriteTokens: usage.cacheWriteTokens } : {}),
          }
        : {}),
      ...(trace?.answer !== undefined ? { answerChars: trace.answer.length } : {}),
      ...(trace?.reasoning !== undefined ? { reasoningChars: trace.reasoning.length } : {}),
      ...(trace?.reasoningTokens !== undefined ? { reasoningTokens: trace.reasoningTokens } : {}),
      ...(trace?.timings ? { serverTimings: trace.timings } : {}),
    };
    if (res.ok) log.info("ai call", line);
    else log.warn("ai call failed", line);
    if (this.opts.logOutput && (trace?.answer !== undefined || trace?.reasoning !== undefined))
      log.info("ai output", {
        task: fields.task,
        ...(fields.campaignId ? { campaignId: fields.campaignId } : {}),
        ...(trace.reasoning !== undefined ? { reasoning: trace.reasoning } : {}),
        ...(trace.answer !== undefined ? { answer: trace.answer } : {}),
      });
  }
}
