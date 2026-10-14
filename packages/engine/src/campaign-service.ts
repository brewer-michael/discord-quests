import { randomBytes } from "node:crypto";
import {
  campaignMembers,
  campaignRegions,
  campaigns,
  characters,
  guilds,
  promises,
  quests,
  rounds,
  safetyEvents,
  scenes,
  turns,
} from "@dq/db";
import { and, desc, eq, inArray, sql } from "drizzle-orm";
import { chapterRecaps } from "./chronicle";
import { type EngineDeps, GameError } from "./deps";
import { createLoom } from "./loom-store";
import { PACES, type Pace, type PaceSettings, paceOf, validTimer } from "./pace";
import { asStory, initialStoryState } from "./story-state";
import { DEFAULT_WORLD_ID } from "./world-cache";

export interface CampaignSettings {
  contentLevel: "gentle" | "adventurous";
  audience: "family" | "teen";
  epilogueStyle: "subtle" | "explicit" | "off";
  /** Seconds players have to act before the round resolves anyway. 0 waits for everyone. */
  roundTimerSeconds: number;
  /** Game night or play by post. */
  pace?: Pace;
  /** Mention players when a turn opens, and remind them before it closes. */
  pingPlayers?: boolean;
  imagePolicy: "new_scenes" | "cruxes_only" | "off";
  /** "off" switches the hidden hand off for this campaign. */
  loomMode?: "auto" | "off";
}

/** The server's defaults for new campaigns, from the setup page. Anything unexpected is ignored. */
export function serverGameDefaults(
  guildSettings: Record<string, unknown> | undefined,
): Partial<CampaignSettings> {
  const d = (guildSettings?.gameDefaults ?? {}) as Record<string, unknown>;
  const out: Partial<CampaignSettings> = {};
  if (d.imagePolicy === "new_scenes" || d.imagePolicy === "cruxes_only" || d.imagePolicy === "off")
    out.imagePolicy = d.imagePolicy;
  if (d.epilogueStyle === "subtle" || d.epilogueStyle === "explicit" || d.epilogueStyle === "off")
    out.epilogueStyle = d.epilogueStyle;
  if (validTimer(d.roundTimerSeconds)) out.roundTimerSeconds = d.roundTimerSeconds;
  if (d.pace === "live" || d.pace === "post") out.pace = d.pace;
  if (typeof d.pingPlayers === "boolean") out.pingPlayers = d.pingPlayers;
  if (d.loomMode === "auto" || d.loomMode === "off") out.loomMode = d.loomMode;
  return out;
}

export const DEFAULT_SETTINGS: CampaignSettings = {
  contentLevel: "gentle",
  audience: "family",
  epilogueStyle: "subtle",
  roundTimerSeconds: 180,
  imagePolicy: "new_scenes",
  pace: "live",
  pingPlayers: false,
};

export interface ServerRooms {
  /** Where play happens: dice, actions, the story. */
  table?: { id: string; name: string };
  /** Private to the DMs and the bot: Assist-mode DM screens live here. */
  dm?: { id: string; name: string };
}

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
    const [guild] = await this.deps.db.select().from(guilds).where(eq(guilds.id, input.guildId));
    const settings: CampaignSettings = {
      ...DEFAULT_SETTINGS,
      ...serverGameDefaults(guild?.settings),
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

  async updateSettings(campaignId: string, patch: Record<string, unknown>) {
    const c = await this.require(campaignId);
    await this.deps.db
      .update(campaigns)
      .set({ settings: { ...(c.settings as Record<string, unknown>), ...patch }, updatedAt: new Date() })
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
  /** The campaign played in a thread (or room), preferring one that's still running. */
  async findByThread(threadId: string) {
    const rows = await this.deps.db
      .select()
      .from(campaigns)
      .where(sql`${campaigns.threadId} = ${threadId} or ${campaigns.dmThreadId} = ${threadId}`)
      .orderBy(desc(campaigns.createdAt));
    return rows.find((c) => c.status !== "ended") ?? rows[0] ?? null;
  }

  /** Is a campaign already being played right in this room? */
  async runningIn(channelId: string) {
    const [c] = await this.deps.db
      .select()
      .from(campaigns)
      .where(
        and(eq(campaigns.threadId, channelId), inArray(campaigns.status, ["setup", "active", "paused"])),
      );
    return c ?? null;
  }

  async pace(campaignId: string): Promise<PaceSettings> {
    return paceOf((await this.require(campaignId)).settings as Record<string, unknown>);
  }

  /**
   * Switches between game night and play by post (or adjusts the timer or pings).
   * Choosing a pace brings its usual timer and pings unless they're given too.
   */
  async setPace(
    campaignId: string,
    userId: string,
    patch: { pace?: Pace; roundTimerSeconds?: number; pingPlayers?: boolean },
  ): Promise<PaceSettings> {
    if (!(await this.isHostOrDm(campaignId, userId)))
      throw new GameError("not host", "Only the host or the DM can change the pace.");
    if (patch.roundTimerSeconds !== undefined && !validTimer(patch.roundTimerSeconds))
      throw new GameError("bad timer", "Pick a time from the list.");
    const preset = patch.pace ? PACES[patch.pace] : undefined;
    const next: PaceSettings = {
      ...(await this.pace(campaignId)),
      ...(preset
        ? { pace: preset.pace, roundTimerSeconds: preset.roundTimerSeconds, pingPlayers: preset.pingPlayers }
        : {}),
      ...(patch.roundTimerSeconds !== undefined ? { roundTimerSeconds: patch.roundTimerSeconds } : {}),
      ...(patch.pingPlayers !== undefined ? { pingPlayers: patch.pingPlayers } : {}),
    };
    await this.updateSettings(campaignId, { ...next });
    return next;
  }

  async rooms(guildId: string): Promise<ServerRooms> {
    const [g] = await this.deps.db.select().from(guilds).where(eq(guilds.id, guildId));
    return ((g?.settings as Record<string, unknown> | undefined)?.rooms as ServerRooms | undefined) ?? {};
  }

  /** Saves the server's table room and DM room. Discord permissions are checked by the bot before this. */
  async setRooms(guild: { id: string; name: string }, rooms: ServerRooms): Promise<ServerRooms> {
    return this.deps.db.transaction(async (tx) => {
      await tx
        .insert(guilds)
        .values({ id: guild.id, name: guild.name })
        .onConflictDoUpdate({ target: guilds.id, set: { name: guild.name, updatedAt: new Date() } });
      const [g] = await tx.select().from(guilds).where(eq(guilds.id, guild.id)).for("update");
      const settings = (g?.settings ?? {}) as Record<string, unknown>;
      const merged = { ...((settings.rooms as ServerRooms | undefined) ?? {}), ...rooms };
      await tx
        .update(guilds)
        .set({ settings: { ...settings, rooms: merged }, updatedAt: new Date() })
        .where(eq(guilds.id, guild.id));
      return merged;
    });
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
    const insert = this.deps.db.insert(campaignMembers).values({ campaignId, userId, role });
    // Becoming a guardian is an upgrade a player can make too (a grown-up can watch over and play).
    if (role === "guardian")
      await insert.onConflictDoUpdate({
        target: [campaignMembers.campaignId, campaignMembers.userId],
        set: { role },
      });
    else await insert.onConflictDoNothing();
  }

  /** Host, DM, or a guardian looking after the table. */
  async canSupervise(campaignId: string, userId: string): Promise<boolean> {
    if (await this.isHostOrDm(campaignId, userId)) return true;
    const [m] = await this.deps.db
      .select()
      .from(campaignMembers)
      .where(and(eq(campaignMembers.campaignId, campaignId), eq(campaignMembers.userId, userId)));
    return m?.role === "guardian";
  }

  /**
   * What the safety checks stopped, for grown-ups: when, what kind, and who typed it.
   * Never the words themselves, and never who used "Not this".
   */
  async safetyLog(campaignId: string, userId: string, limit = 25) {
    if (!(await this.canSupervise(campaignId, userId)))
      throw new GameError("not guardian", "Only the host, the DM or a guardian can see the safety log.");
    const rows = await this.deps.db
      .select()
      .from(safetyEvents)
      .where(eq(safetyEvents.campaignId, campaignId))
      .orderBy(desc(safetyEvents.createdAt))
      .limit(limit);
    return rows.map((r) => ({
      at: r.createdAt,
      stage: r.stage,
      verdict: r.verdict,
      categories: r.categories,
      userId: r.stage === "xcard" ? null : r.userId,
    }));
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
    // Guardians can pause and resume the table; only the host or DM can end it.
    const allowed =
      status === "ended"
        ? await this.isHostOrDm(campaignId, userId)
        : await this.canSupervise(campaignId, userId);
    if (!allowed)
      throw new GameError(
        "not host",
        status === "ended"
          ? "Only the host or the DM can do that."
          : "Only the host, the DM or a guardian can do that.",
      );
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
      pace: paceOf(c.settings as Record<string, unknown>),
      deadline:
        (
          await this.deps.db
            .select({ deadlineAt: rounds.deadlineAt })
            .from(rounds)
            .where(and(eq(rounds.campaignId, campaignId), eq(rounds.status, "collecting")))
            .limit(1)
        )[0]?.deadlineAt ?? null,
    };
  }

  /** What the heroes know: quests, promises and the story so far. Nothing hidden. */
  async journal(campaignId: string) {
    const c = await this.require(campaignId);
    const { index } = this.deps.worlds.get(c.worldId);
    const [questRows, promiseRows, recent, chapters] = await Promise.all([
      this.deps.db.select().from(quests).where(eq(quests.campaignId, campaignId)),
      this.deps.db.select().from(promises).where(eq(promises.campaignId, campaignId)),
      this.deps.db
        .select()
        .from(turns)
        .where(eq(turns.campaignId, campaignId))
        .orderBy(sql`${turns.seq} desc`)
        .limit(3),
      chapterRecaps(this.deps.db, campaignId, 8),
    ]);
    const npcName = (id: string) => index.namedNpcs.get(id)?.name ?? id;
    return {
      quests: questRows.map((q) => ({ title: q.title, objective: q.objective, status: q.status })),
      promises: promiseRows.map((p) => ({ to: npcName(p.npcId), text: p.text, status: p.status })),
      chapters,
      recent: recent
        .reverse()
        .map((t) => String((t.data.narration as { narration?: string } | undefined)?.narration ?? ""))
        .filter(Boolean),
    };
  }

  /** Everything the map renderer needs: what's known, where the party is, and where it's been. */
  async mapState(campaignId: string) {
    const c = await this.require(campaignId);
    const { index } = this.deps.worlds.get(c.worldId);
    const story = asStory(c.story);
    const regionRows = await this.deps.db
      .select()
      .from(campaignRegions)
      .where(eq(campaignRegions.campaignId, campaignId));
    const sceneRows = await this.deps.db
      .select()
      .from(scenes)
      .where(eq(scenes.campaignId, campaignId))
      .orderBy(scenes.startedTurn);
    const states: Record<string, "rumored" | "discovered" | "visited"> = {};
    for (const id of story.discoveredRegions) states[id] = "rumored";
    for (const r of regionRows) states[r.regionId] = r.state;
    states[story.regionId] = "visited";
    const trail: string[] = [];
    for (const sc of sceneRows) {
      if (sc.kind === "travel" && sc.endedTurn === null) continue;
      if (trail.at(-1) !== sc.regionId) trail.push(sc.regionId);
    }
    if (trail.length === 0) trail.push(story.regionId);
    return { world: index.world, states, partyRegionId: story.regionId, trail };
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
