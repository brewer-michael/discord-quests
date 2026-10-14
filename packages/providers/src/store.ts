import { type Db, guilds, providerConfigs, secrets, taskRoutes } from "@dq/db";
import { decryptSecret, type MasterKey, parseMasterKeys } from "@dq/db/crypto";
import { and, eq, isNull, or, sql } from "drizzle-orm";
import { type EnvDefaults, envDefaults, type ProviderEnv, type Route, type RouteTask } from "./env";
import { preset } from "./presets";
import type { GenericHttpSpec, ResolvedProviderConfig } from "./types";

export interface GuildProviderSettings {
  usePlatformDefaults: boolean;
  dailyBudgetUsd: number | null;
  dailyImageCap: number | null;
}

/** Where provider configurations and routes come from: the setup page (DB), then server defaults (env). */
export class ProviderStore {
  readonly defaults: EnvDefaults;
  private readonly keys: MasterKey[] | null;
  private readonly cache = new Map<string, { at: number; cfg: ResolvedProviderConfig }>();

  constructor(
    private readonly db: Db,
    readonly env: ProviderEnv,
  ) {
    this.defaults = envDefaults(env);
    this.keys =
      env.MASTER_KEYS && !env.MASTER_KEYS.includes("REPLACE_ME") ? parseMasterKeys(env.MASTER_KEYS) : null;
  }

  async guildSettings(guildId: string): Promise<GuildProviderSettings> {
    const [g] = await this.db.select().from(guilds).where(eq(guilds.id, guildId));
    const s = (g?.settings ?? {}) as Record<string, unknown>;
    return {
      usePlatformDefaults: s.usePlatformDefaults !== false,
      dailyBudgetUsd: typeof s.dailyBudgetUsd === "number" ? s.dailyBudgetUsd : null,
      dailyImageCap: typeof s.dailyImageCap === "number" ? s.dailyImageCap : null,
    };
  }

  /** Routes for a task, best first: campaign-specific, then guild, then server defaults. */
  async routes(task: RouteTask, scope: { guildId: string; campaignId?: string }): Promise<Route[]> {
    const rows = await this.db
      .select()
      .from(taskRoutes)
      .innerJoin(providerConfigs, eq(providerConfigs.id, taskRoutes.providerConfigId))
      .where(
        and(
          eq(taskRoutes.task, task),
          eq(providerConfigs.enabled, true),
          or(
            scope.campaignId ? eq(taskRoutes.campaignId, scope.campaignId) : sql`false`,
            and(eq(taskRoutes.guildId, scope.guildId), isNull(taskRoutes.campaignId)),
          ),
        ),
      );
    const own = rows
      .map((r) => r.task_routes)
      .sort(
        (a, b) => Number(Boolean(b.campaignId)) - Number(Boolean(a.campaignId)) || a.priority - b.priority,
      )
      .map((r) => ({
        configId: r.providerConfigId,
        model: r.model,
        params: r.params as Route["params"],
        priority: r.priority,
      }));
    if (own.length > 0) return own;
    const settings = await this.guildSettings(scope.guildId);
    return settings.usePlatformDefaults ? (this.defaults.routes[task] ?? []) : [];
  }

  isPlatformConfig(configId: string): boolean {
    return configId.startsWith("env:");
  }

  async resolve(configId: string): Promise<ResolvedProviderConfig | null> {
    if (configId.startsWith("env:")) return this.defaults.configs.get(configId) ?? null;
    const hit = this.cache.get(configId);
    if (hit && Date.now() - hit.at < 30_000) return hit.cfg;
    const [row] = await this.db.select().from(providerConfigs).where(eq(providerConfigs.id, configId));
    if (!row?.enabled) return null;
    const p = preset(row.presetId);
    let apiKey: string | null = null;
    if (row.secretId) {
      if (!this.keys) throw new Error("MASTER_KEYS is not configured, so stored API keys can't be decrypted");
      const [s] = await this.db.select().from(secrets).where(eq(secrets.id, row.secretId));
      if (s) apiKey = decryptSecret(s, this.keys, s.guildId, s.id);
    }
    const cfg: ResolvedProviderConfig = {
      id: row.id,
      name: row.name,
      presetId: row.presetId,
      adapterId: row.adapterId as ResolvedProviderConfig["adapterId"],
      baseUrl: row.baseUrl ?? p?.baseUrl ?? null,
      auth: (Object.keys(row.auth).length > 0
        ? row.auth
        : (p?.auth ?? { type: "bearer" })) as ResolvedProviderConfig["auth"],
      apiKey,
      extraHeaders: row.extraHeaders,
      selfHosted: (p?.selfHosted ?? false) || row.selfHosted,
      capabilities: { ...(p?.capabilities ?? {}), ...(row.capabilityOverrides as object) },
      pricing: {
        ...Object.fromEntries((p?.models ?? []).filter((m) => m.pricing).map((m) => [m.id, m.pricing ?? {}])),
        ...(row.pricing as ResolvedProviderConfig["pricing"]),
      },
      genericSpec: (row.genericSpec ??
        (p?.genericSpec as GenericHttpSpec | undefined) ??
        null) as GenericHttpSpec | null,
    };
    this.cache.set(configId, { at: Date.now(), cfg });
    return cfg;
  }

  invalidate(configId?: string) {
    if (configId) this.cache.delete(configId);
    else this.cache.clear();
  }
}
