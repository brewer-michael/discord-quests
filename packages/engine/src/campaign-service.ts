import { randomBytes } from "node:crypto";
import { campaignMembers, campaignRegions, campaigns, characters, guilds, quests } from "@dq/db";
import { and, eq, inArray, sql } from "drizzle-orm";
import { type EngineDeps, GameError } from "./deps";
import { createLoom } from "./loom-store";
import { asStory, initialStoryState } from "./story-state";
import { DEFAULT_WORLD_ID } from "./world-cache";

export interface CampaignSettings {
  contentLevel: "gentle" | "adventurous";
  audience: "family" | "teen";
  epilogueStyle: "subtle" | "explicit" | "off";
  /** Seconds players have to act in a live round before it resolves anyway. */
  roundTimerSeconds: number;
  imagePolicy: "new_scenes" | "cruxes_only" | "off";
}

export const DEFAULT_SETTINGS: CampaignSettings = {
  contentLevel: "gentle",
  audience: "family",
  epilogueStyle: "subtle",
  roundTimerSeconds: 180,
  imagePolicy: "new_scenes",
};

export class CampaignService {
  constructor(private readonly deps: EngineDeps) {}

  async create(input: {
    guildId: string;
    guildName?: string;
    channelId: string;
    name: string;
    mode: "ai_dm" | "assist";
    createdBy: string;
    dmUserId?: string | null;
    worldId?: string;
    settings?: Partial<CampaignSettings>;
  }) {
    const worldId = input.worldId ?? DEFAULT_WORLD_ID;
    const { index, version } = this.deps.worlds.get(worldId);
    const name = input.name.trim().slice(0, 60) || "A New Adventure";
    if (input.mode === "assist" && !input.dmUserId)
      throw new GameError("no dm", "Assist mode needs a human DM.");
    const audience = input.settings?.audience ?? DEFAULT_SETTINGS.audience;
    const settings: CampaignSettings = {
      ...DEFAULT_SETTINGS,
      contentLevel: audience === "family" ? "gentle" : "adventurous",
      ...input.settings,
    };
    const story = initialStoryState(index);
    return this.deps.db.transaction(async (tx) => {
      await tx
        .insert(guilds)
        .values({ id: input.guildId, name: input.guildName ?? "" })
        .onConflictDoUpdate({
          target: guilds.id,
          set: { name: input.guildName ?? sql`${guilds.name}`, updatedAt: new Date() },
        });
      const [c] = await tx
        .insert(campaigns)
        .values({
          guildId: input.guildId,
          channelId: input.channelId,
          name,
          worldId,
          worldVersion: version,
          mode: input.mode,
          dmUserId: input.dmUserId ?? null,
          createdBy: input.createdBy,
          settings: settings as unknown as Record<string, unknown>,
          story: story as unknown as Record<string, unknown>,
        })
        .returning();
      if (!c) throw new Error("could not create campaign");
      await createLoom(tx, c.id, randomBytes(32).toString("hex"));
      await tx.insert(campaignMembers).values({
        campaignId: c.id,
        userId: input.createdBy,
        role: input.dmUserId === input.createdBy ? "dm" : "player",
      });
      if (input.dmUserId && input.dmUserId !== input.createdBy) {
        await tx.insert(campaignMembers).values({ campaignId: c.id, userId: input.dmUserId, role: "dm" });
      }
      await tx.insert(campaignRegions).values(
        story.discoveredRegions.map((regionId) => ({
          campaignId: c.id,
          regionId,
          state: regionId === story.regionId ? ("visited" as const) : ("rumored" as const),
        })),
      );
      return c;
    });
  }

  async setThreads(campaignId: string, threadId: string, dmThreadId?: string | null) {
    await this.deps.db
      .update(campaigns)
      .set({ threadId, dmThreadId: dmThreadId ?? null, updatedAt: new Date() })
      .where(eq(campaigns.id, campaignId));
  }

  async get(campaignId: string) {
    const [c] = await this.deps.db.select().from(campaigns).where(eq(campaigns.id, campaignId));
    return c ?? null;
  }

  async require(campaignId: string) {
    const c = await this.get(campaignId);
    if (!c) throw new GameError("no campaign", "That campaign doesn't exist.");
    return c;
  }

  /** The campaign whose thread (or DM thread) a command was used in. */
  async findByThread(threadId: string) {
    const [c] = await this.deps.db
      .select()
      .from(campaigns)
      .where(sql`${campaigns.threadId} = ${threadId} or ${campaigns.dmThreadId} = ${threadId}`);
    return c ?? null;
  }

  async listForGuild(guildId: string) {
    return this.deps.db
      .select()
      .from(campaigns)
      .where(and(eq(campaigns.guildId, guildId), inArray(campaigns.status, ["setup", "active", "paused"])))
      .orderBy(sql`${campaigns.createdAt} desc`);
  }

  async join(campaignId: string, userId: string, role: "player" | "guardian" | "spectator" = "player") {
    const c = await this.require(campaignId);
    if (c.status === "ended") throw new GameError("ended", "That campaign has ended.");
    await this.deps.db.insert(campaignMembers).values({ campaignId, userId, role }).onConflictDoNothing();
  }

  async leave(campaignId: string, userId: string) {
    await this.deps.db
      .update(characters)
      .set({ status: "retired" })
      .where(
        and(
          eq(characters.campaignId, campaignId),
          eq(characters.userId, userId),
          eq(characters.status, "active"),
        ),
      );
    await this.deps.db
      .delete(campaignMembers)
      .where(and(eq(campaignMembers.campaignId, campaignId), eq(campaignMembers.userId, userId)));
  }

  async members(campaignId: string) {
    return this.deps.db.select().from(campaignMembers).where(eq(campaignMembers.campaignId, campaignId));
  }

  async isHostOrDm(campaignId: string, userId: string): Promise<boolean> {
    const c = await this.require(campaignId);
    return c.createdBy === userId || c.dmUserId === userId;
  }

  async setStatus(campaignId: string, userId: string, status: "paused" | "active" | "ended") {
    if (!(await this.isHostOrDm(campaignId, userId)))
      throw new GameError("not host", "Only the host or the DM can do that.");
    const c = await this.require(campaignId);
    if (c.status === "setup" && status !== "ended")
      throw new GameError("not started", "Start the campaign first.");
    await this.deps.db
      .update(campaigns)
      .set({ status, updatedAt: new Date() })
      .where(eq(campaigns.id, campaignId));
  }

  async status(campaignId: string) {
    const c = await this.require(campaignId);
    const { index } = this.deps.worlds.get(c.worldId);
    const story = asStory(c.story);
    const party = await this.deps.db
      .select()
      .from(characters)
      .where(and(eq(characters.campaignId, campaignId), inArray(characters.status, ["active", "draft"])));
    const questRows = await this.deps.db.select().from(quests).where(eq(quests.campaignId, campaignId));
    const beat = story.beatId ? index.beats.get(story.beatId) : undefined;
    return {
      campaign: c,
      worldName: index.world.meta.name,
      regionName: index.regions.get(story.regionId)?.name ?? story.regionId,
      chapter: beat ? `Chapter ${beat.chapter.number}: ${beat.chapter.title}` : null,
      party: party.map((p) => ({
        name: p.name || "(unnamed hero)",
        userId: p.userId,
        ready: p.status === "active",
        level: p.level,
      })),
      quests: questRows,
    };
  }

  /** Permanently deletes a campaign and its history (privacy purge). */
  async purge(campaignId: string, userId: string) {
    if (!(await this.isHostOrDm(campaignId, userId)))
      throw new GameError("not host", "Only the host or the DM can delete a campaign.");
    await this.deps.db.transaction(async (tx) => {
      await tx.execute(sql`SET LOCAL app.purge = 'on'`);
      await tx.delete(campaigns).where(eq(campaigns.id, campaignId));
    });
  }
}
