import { createHash } from "node:crypto";
import { buildImagePrompt, type ImageBrief } from "@dq/core/safety";
import type { World } from "@dq/core/world";
import { type Db, imageAssets } from "@dq/db";
import { and, eq } from "drizzle-orm";
import { type BudgetGuard, costMicros } from "./budget";
import { imageAdapter } from "./registry";
import { createSafeFetch } from "./safe-fetch";
import type { ProviderStore } from "./store";

export interface SceneImage {
  assetId: string;
  bytes: Buffer;
  mime: string;
  cached: boolean;
}

export const SCENE_SIZE = { width: 1536, height: 1024 };

/**
 * Scene art. Prompts are built only from the narrator's structured image
 * brief and the world's art style, never from raw player text. Results are
 * cached so a region's establishing shot is generated once.
 */
export class ImageService {
  private readonly safeFetch: typeof fetch;
  private readonly privateFetch: typeof fetch;

  constructor(
    private readonly db: Db,
    private readonly store: ProviderStore,
    private readonly budget: BudgetGuard,
    opts: { fetch?: typeof fetch; log?: { warn(msg: string, data?: Record<string, unknown>): void } } = {},
  ) {
    this.safeFetch = opts.fetch ?? createSafeFetch();
    this.privateFetch =
      opts.fetch ?? createSafeFetch({ allowPrivate: store.env.ALLOW_PRIVATE_ENDPOINTS === "true" });
    this.log = opts.log;
  }

  private readonly log?: { warn(msg: string, data?: Record<string, unknown>): void };

  /** Whether this server (or the bot's built-in services) has a picture service to paint with. */
  async available(scope: { guildId: string; campaignId?: string }): Promise<boolean> {
    return (await this.store.routes("image", scope)).length > 0;
  }

  async sceneImage(
    scope: { guildId: string; campaignId?: string },
    brief: ImageBrief,
    world: Pick<World, "meta" | "content">,
    opts: { cacheScope?: "scene" | "region"; cacheHint?: string } = {},
  ): Promise<SceneImage | null> {
    const { prompt, negativePrompt } = buildImagePrompt(brief, world);
    const routes = await this.store.routes("image", scope);
    const settings = await this.store.guildSettings(scope.guildId);
    for (const route of routes) {
      const cfg = await this.store.resolve(route.configId).catch(() => null);
      if (!cfg) continue;
      const adapter = imageAdapter(cfg.adapterId);
      if (!adapter) continue;
      const cacheKey = createHash("sha256")
        .update(
          [
            opts.cacheScope === "region" ? opts.cacheHint : prompt,
            cfg.id,
            route.model,
            SCENE_SIZE.width,
            SCENE_SIZE.height,
          ].join("|"),
        )
        .digest("hex");
      const [hit] = await this.db
        .select()
        .from(imageAssets)
        .where(and(eq(imageAssets.guildId, scope.guildId), eq(imageAssets.cacheKey, cacheKey)));
      if (hit?.bytes) return { assetId: hit.id, bytes: hit.bytes, mime: hit.mime, cached: true };

      const pricing = cfg.pricing[route.model];
      const gate = await this.budget.allow(scope.guildId, {
        estimateMicros: costMicros(pricing, { images: 1 }),
        estimateTokens: 0,
        images: 1,
        platform: this.store.isPlatformConfig(cfg.id),
        guildBudgetUsd: settings.dailyBudgetUsd,
        guildImageCap: settings.dailyImageCap,
      });
      if (!gate.ok) return null;
      try {
        const result = await adapter.generate(
          { prompt, negativePrompt, model: route.model, ...SCENE_SIZE },
          cfg,
          { fetch: cfg.selfHosted ? this.privateFetch : this.safeFetch },
        );
        await this.budget.record({
          guildId: scope.guildId,
          ...(scope.campaignId ? { campaignId: scope.campaignId } : {}),
          task: "image",
          providerConfigId: cfg.id,
          model: route.model,
          usage: {},
          images: 1,
          costMicros: costMicros(pricing, { images: 1 }),
        });
        const bytes = Buffer.from(result.bytes);
        const [row] = await this.db
          .insert(imageAssets)
          .values({
            guildId: scope.guildId,
            cacheKey,
            scope: opts.cacheScope ?? "scene",
            providerConfigId: cfg.id.startsWith("env:") ? null : cfg.id,
            model: route.model,
            prompt,
            mime: result.mime,
            width: SCENE_SIZE.width,
            height: SCENE_SIZE.height,
            bytes,
          })
          .onConflictDoNothing()
          .returning();
        return { assetId: row?.id ?? cacheKey, bytes, mime: result.mime, cached: false };
      } catch (e) {
        this.log?.warn("image provider failed", { configId: cfg.id, error: (e as Error).message });
      }
    }
    return null;
  }
}
