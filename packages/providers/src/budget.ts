import type { LlmUsage } from "@dq/core/llm";
import { type Db, usageDaily, usageLedger } from "@dq/db";
import { and, eq, sql } from "drizzle-orm";
import type { ProviderEnv } from "./env";
import type { ModelPricing } from "./types";

export function costMicros(
  pricing: ModelPricing | undefined,
  usage: Partial<LlmUsage> & { images?: number },
): number {
  if (!pricing) return 0;
  const usd =
    ((usage.inputTokens ?? 0) * (pricing.input ?? 0)) / 1e6 +
    ((usage.outputTokens ?? 0) * (pricing.output ?? 0)) / 1e6 +
    ((usage.cacheReadTokens ?? 0) * (pricing.cacheRead ?? pricing.input ?? 0)) / 1e6 +
    (usage.images ?? 0) * (pricing.image ?? 0);
  return Math.round(usd * 1e6);
}

export interface UsageEntry {
  guildId: string;
  campaignId?: string;
  task: string;
  providerConfigId: string | null;
  model: string;
  usage: Partial<LlmUsage>;
  images?: number;
  costMicros: number;
  fellBack?: boolean;
}

/** Daily spending and image caps per server, so nobody gets a surprise bill. */
export class BudgetGuard {
  private readonly platformBudgetMicros: number;
  private readonly platformImageCap: number;
  private readonly platformTokenCap: number;

  constructor(
    private readonly db: Db,
    env: ProviderEnv,
  ) {
    this.platformBudgetMicros = Math.round(Number(env.DEFAULT_DAILY_BUDGET_USD ?? "5") * 1e6);
    this.platformImageCap = Number(env.DEFAULT_DAILY_IMAGE_CAP ?? "30");
    this.platformTokenCap = Number(env.DEFAULT_DAILY_TOKEN_CAP ?? "3000000");
  }

  private today(): string {
    return new Date().toISOString().slice(0, 10);
  }

  async todayUsage(guildId: string) {
    const [row] = await this.db
      .select()
      .from(usageDaily)
      .where(and(eq(usageDaily.guildId, guildId), eq(usageDaily.day, this.today())));
    return row ?? { guildId, day: this.today(), costMicros: 0, tokens: 0, images: 0 };
  }

  /**
   * May this call go ahead? Platform (server default) keys always have caps;
   * a server's own keys are capped only if the server set a cap.
   */
  async allow(
    guildId: string,
    opts: {
      estimateMicros: number;
      estimateTokens: number;
      images?: number;
      platform: boolean;
      guildBudgetUsd: number | null;
      guildImageCap: number | null;
    },
  ): Promise<{ ok: true } | { ok: false; reason: "budget" | "images" | "tokens" }> {
    const used = await this.todayUsage(guildId);
    const budget =
      opts.guildBudgetUsd !== null
        ? Math.round(opts.guildBudgetUsd * 1e6)
        : opts.platform
          ? this.platformBudgetMicros
          : Number.POSITIVE_INFINITY;
    const imageCap = opts.guildImageCap ?? (opts.platform ? this.platformImageCap : Number.POSITIVE_INFINITY);
    if (used.costMicros + opts.estimateMicros > budget) return { ok: false, reason: "budget" };
    if ((opts.images ?? 0) > 0 && used.images + (opts.images ?? 0) > imageCap)
      return { ok: false, reason: "images" };
    if (opts.platform && used.tokens + opts.estimateTokens > this.platformTokenCap)
      return { ok: false, reason: "tokens" };
    return { ok: true };
  }

  async record(e: UsageEntry): Promise<void> {
    const tokens = (e.usage.inputTokens ?? 0) + (e.usage.outputTokens ?? 0);
    await this.db.insert(usageLedger).values({
      guildId: e.guildId,
      campaignId: e.campaignId ?? null,
      task: e.task,
      providerConfigId:
        e.providerConfigId && !e.providerConfigId.startsWith("env:") ? e.providerConfigId : null,
      model: e.model,
      inputTokens: e.usage.inputTokens ?? 0,
      outputTokens: e.usage.outputTokens ?? 0,
      cacheReadTokens: e.usage.cacheReadTokens ?? 0,
      cacheWriteTokens: e.usage.cacheWriteTokens ?? 0,
      images: e.images ?? 0,
      costMicros: e.costMicros,
      fellBack: e.fellBack ?? false,
    });
    await this.db
      .insert(usageDaily)
      .values({
        guildId: e.guildId,
        day: this.today(),
        costMicros: e.costMicros,
        tokens,
        images: e.images ?? 0,
      })
      .onConflictDoUpdate({
        target: [usageDaily.guildId, usageDaily.day],
        set: {
          costMicros: sql`${usageDaily.costMicros} + ${e.costMicros}`,
          tokens: sql`${usageDaily.tokens} + ${tokens}`,
          images: sql`${usageDaily.images} + ${e.images ?? 0}`,
        },
      });
  }
}
