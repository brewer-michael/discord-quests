import { randomBytes } from "node:crypto";
import { describeProfile, parseProfile, type StoryProfile } from "@dq/core/narration";
import { checkPlayerText, findPersonalInfo, type ImageBrief } from "@dq/core/safety";
import type { WorldIndex } from "@dq/core/world";
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
import { and, desc, eq, inArray, isNotNull, isNull, ne, sql } from "drizzle-orm";
import { partyAppearances, pictureLook } from "./appearance";
import { chapterRecaps } from "./chronicle";
import { type EngineDeps, GameError } from "./deps";
import { createLoom } from "./loom-store";
import { PACES, type Pace, type PaceSettings, paceOf, timerFitsPace, validTimer } from "./pace";
import { audienceOf, type CampaignStory, campaignStory, profileOf } from "./story-profile";
import { asStory, initialStoryState } from "./story-state";
import { DEFAULT_WORLD_ID } from "./world-cache";

export interface CampaignSettings {
  /** Campaigns made before story settings existed. Read so they keep their feel until changed. */
  contentLevel?: "gentle" | "adventurous";
  audience: "family" | "teen";
  /** How dark the story gets, how it's told, its pictures, and what the table wants in it or left out. */
  story?: StoryProfile;
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
  const pace = d.pace === "live" || d.pace === "post" ? d.pace : undefined;
  if (pace) out.pace = pace;
  // The turn timer and pings follow the pace unless the server set them, as /campaign pace does. A timer that
  // doesn't suit the pace (older setup pages saved "play by post, 3 minutes") follows the pace too.
  if (validTimer(d.roundTimerSeconds) && (!pace || timerFitsPace(pace, d.roundTimerSeconds)))
    out.roundTimerSeconds = d.roundTimerSeconds;
  else if (pace) out.roundTimerSeconds = PACES[pace].roundTimerSeconds;
  if (typeof d.pingPlayers === "boolean") out.pingPlayers = d.pingPlayers;
  else if (pace) out.pingPlayers = PACES[pace].pingPlayers;
  if (d.loomMode === "auto" || d.loomMode === "off") out.loomMode = d.loomMode;
  return out;
}

/** The server's default story settings for new campaigns (intensity, voice, humor, art), from the setup page. */
export function serverStoryDefaults(guildSettings: Record<string, unknown> | undefined): StoryProfile {
  const d = (guildSettings?.gameDefaults ?? {}) as Record<string, unknown>;
  return parseProfile({ intensity: d.intensity, voice: d.voice, humor: d.humor, art: d.art });
}

export const DEFAULT_SETTINGS: CampaignSettings = {
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
      ...input.settings,
      audience,
      story: parseProfile({ ...serverStoryDefaults(guild?.settings), ...(input.settings?.story ?? {}) }),
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

  /** How this campaign's pictures should look: its art style, its heroes' cards (written if missing), its topics. */
  async pictureLook(campaignId: string) {
    const c = await this.require(campaignId);
    const { index } = this.deps.worlds.get(c.worldId);
    const heroes = await this.deps.db
      .select()
      .from(characters)
      .where(and(eq(characters.campaignId, c.id), eq(characters.status, "active")))
      .orderBy(characters.createdAt);
    const cards = await partyAppearances({
      db: this.deps.db,
      llm: this.deps.llm,
      index,
      heroes,
      scope: { guildId: c.guildId, campaignId: c.id },
    });
    return pictureLook(profileOf(c), cards);
  }

  /** The campaign's story settings, and the intensity it's told at right now. */
  async storyFor(campaignId: string): Promise<CampaignStory> {
    return campaignStory(this.deps.db, await this.require(campaignId));
  }

  /**
   * Changes the story settings. The host, the DM or a guardian may; on a family campaign only a guardian can
   * choose Epic. What the table typed (premise, picture style, topics) is checked like anything players type.
   */
  async setStory(campaignId: string, userId: string, patch: Partial<StoryProfile>): Promise<CampaignStory> {
    const c = await this.require(campaignId);
    const [member] = await this.deps.db
      .select()
      .from(campaignMembers)
      .where(and(eq(campaignMembers.campaignId, campaignId), eq(campaignMembers.userId, userId)));
    const guardian = member?.role === "guardian";
    if (!guardian && !(await this.isHostOrDm(campaignId, userId)))
      throw new GameError("not host", "Only the host, the DM or a guardian can change the story settings.");
    const current = profileOf(c);
    const next = parseProfile({ ...current, ...patch }, undefined, current);
    if (next.intensity === "epic" && current.intensity !== "epic" && audienceOf(c) === "family" && !guardian)
      throw new GameError(
        "needs guardian",
        "On a family campaign, Epic is chosen by a guardian: a grown-up joins with `/campaign guardian`, then picks it.",
      );
    const { index } = this.deps.worlds.get(c.worldId);
    const told = next.intensity === "epic" ? "classic" : next.intensity;
    for (const [label, value] of [
      ["premise", next.premise],
      ["picture style", next.art === "custom" ? next.artCustom : ""],
    ] as const) {
      if (!value) continue;
      const verdict = checkPlayerText(value, index.world, told);
      if (!verdict.allow) throw new GameError("unsafe story text", `The ${label}: ${verdict.message}`);
    }
    // Topics to leave out naturally name the very things they leave out, so only personal details are refused.
    for (const topic of [...next.lines, ...next.veils])
      if (findPersonalInfo(topic).length > 0)
        throw new GameError("unsafe story text", "Let's keep real-life details out of the story settings.");
    await this.updateSettings(campaignId, { story: next });
    return campaignStory(this.deps.db, { id: c.id, settings: { ...(c.settings as object), story: next } });
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
      story: await campaignStory(this.deps.db, c).then((s) => describeProfile(s.profile, s.story.intensity)),
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

  /**
   * The scenes the table has played, oldest first, with what to paint for each: the narrator's picture brief from
   * the turn that opened the scene, or the place's own description when that turn was told without AI.
   */
  async sceneGallery(campaignId: string): Promise<SceneGalleryEntry[]> {
    const c = await this.require(campaignId);
    const { index } = this.deps.worlds.get(c.worldId);
    const sceneRows = await this.deps.db
      .select()
      .from(scenes)
      .where(eq(scenes.campaignId, campaignId))
      .orderBy(scenes.startedTurn);
    if (sceneRows.length === 0) return [];
    const openers = await this.deps.db
      .select({ seq: turns.seq, data: turns.data })
      .from(turns)
      .where(
        and(
          eq(turns.campaignId, campaignId),
          eq(turns.status, "committed"),
          inArray(
            turns.seq,
            sceneRows.map((s) => s.startedTurn),
          ),
        ),
      );
    const briefs = new Map(
      openers.map((t) => [
        t.seq,
        asBrief((t.data.narration as { imageBrief?: unknown } | undefined)?.imageBrief),
      ]),
    );
    // A scene whose opening turn the players haven't seen yet (a draft waiting for the DM) isn't shown.
    return sceneRows
      .filter((s) => briefs.has(s.startedTurn))
      .map((s) => {
        const region = index.regions.get(s.regionId);
        const poi = s.poiId ? index.pois.get(s.poiId)?.poi : undefined;
        return {
          sceneId: s.id,
          title: s.title,
          kind: s.kind,
          locationName: poi?.name ?? region?.name ?? s.regionId,
          chapter: index.beatOrder.find((b) => b.beat.id === s.beatId)?.chapter.number ?? null,
          imageAssetId: s.imageAssetId,
          brief: briefs.get(s.startedTurn) ?? placeBrief(index, s),
        };
      });
  }

  /**
   * A picture this campaign already has of a scene's place, for a return visit: same region and landmark, road
   * pictures only for road scenes. Decisive moments always get their own picture and never lend theirs.
   */
  async placePicture(sceneId: string): Promise<string | null> {
    const [scene] = await this.deps.db.select().from(scenes).where(eq(scenes.id, sceneId));
    if (!scene || scene.kind === "crux") return null;
    const [other] = await this.deps.db
      .select({ assetId: scenes.imageAssetId })
      .from(scenes)
      .where(
        and(
          eq(scenes.campaignId, scene.campaignId),
          eq(scenes.regionId, scene.regionId),
          scene.poiId ? eq(scenes.poiId, scene.poiId) : isNull(scenes.poiId),
          scene.kind === "travel" ? eq(scenes.kind, "travel") : ne(scenes.kind, "travel"),
          ne(scenes.kind, "crux"),
          ne(scenes.id, scene.id),
          isNotNull(scenes.imageAssetId),
        ),
      )
      .orderBy(desc(scenes.startedTurn))
      .limit(1);
    return other?.assetId ?? null;
  }

  /**
   * The campaign's pictures, one per picture (a place visited three times shows once), in story order. With search
   * words, only scenes whose name, place, story or picture notes mention them, best matches first.
   */
  async findPictures(campaignId: string, words: string[] = []): Promise<SceneGalleryEntry[]> {
    const all = (await this.sceneGallery(campaignId)).filter((s) => s.imageAssetId);
    let ordered = all;
    if (words.length > 0) {
      const query = words.map((w) => `${w}:*`).join(" | ");
      const { rows } = await this.deps.db.execute<{ id: string; rank: number }>(sql`
        select x.id, ts_rank(x.doc, q) as rank
        from (
          select s.id, to_tsvector('english', concat_ws(' ',
            s.title,
            replace(s.region_id, '-', ' '),
            replace(coalesce(s.poi_id, ''), '-', ' '),
            s.state->>'summary',
            t.data->'narration'->>'narration',
            t.data->'narration'->'imageBrief'->>'setting',
            t.data->'narration'->'imageBrief'->>'subjects',
            t.data->'narration'->'imageBrief'->>'mood'
          )) as doc
          from scenes s
          left join turns t
            on t.campaign_id = s.campaign_id and t.seq = s.started_turn and t.status = 'committed'
          where s.campaign_id = ${campaignId} and s.image_asset_id is not null
        ) x, to_tsquery('english', ${query}) q
        where x.doc @@ q
      `);
      const rank = new Map(rows.map((r) => [r.id, Number(r.rank)]));
      // Place names come from the world; match those here too ("Bellhollow" finds every scene there).
      for (const s of all) {
        const nameWords = pictureSearchWords(s.locationName);
        if (words.some((w) => nameWords.some((n) => n.startsWith(w))))
          rank.set(s.sceneId, (rank.get(s.sceneId) ?? 0) + 1);
      }
      ordered = all
        .filter((s) => rank.has(s.sceneId))
        .sort((a, b) => (rank.get(b.sceneId) ?? 0) - (rank.get(a.sceneId) ?? 0));
    }
    const seen = new Set<string>();
    return ordered.filter((s) => {
      if (seen.has(s.imageAssetId as string)) return false;
      seen.add(s.imageAssetId as string);
      return true;
    });
  }

  /** Remembers a scene's picture, so it isn't painted again. */
  async setSceneImage(sceneId: string, assetId: string) {
    await this.deps.db.update(scenes).set({ imageAssetId: assetId }).where(eq(scenes.id, sceneId));
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

export interface SceneGalleryEntry {
  sceneId: string;
  title: string;
  kind: string;
  locationName: string;
  chapter: number | null;
  imageAssetId: string | null;
  brief: ImageBrief;
}

/**
 * The words of a picture search, cleaned for the full-text query and short enough to ride in a button id:
 * lowercase letters and digits only, at most 6 words and 44 characters joined with "+".
 */
export function pictureSearchWords(text: string | null | undefined): string[] {
  const out: string[] = [];
  for (const w of (text ?? "").toLowerCase().match(/[\p{L}\p{N}]+/gu) ?? []) {
    const word = w
      .normalize("NFKD")
      .replace(/[^a-z0-9]/g, "")
      .slice(0, 20);
    if (word.length < 2 || out.includes(word)) continue;
    if ([...out, word].join("+").length > 44) break;
    out.push(word);
    if (out.length === 6) break;
  }
  return out;
}

function asBrief(v: unknown): ImageBrief | null {
  const b = v as Partial<ImageBrief> | null | undefined;
  if (!b || typeof b.setting !== "string" || !b.setting.trim()) return null;
  return {
    setting: b.setting,
    subjects: Array.isArray(b.subjects) ? b.subjects.filter((x): x is string => typeof x === "string") : [],
    mood: typeof b.mood === "string" ? b.mood : "",
    timeOfDay: typeof b.timeOfDay === "string" ? b.timeOfDay : "",
  };
}

const SCENE_MOODS: Record<string, string> = {
  exploration: "curious and full of wonder",
  social: "warm and friendly",
  combat: "brave and exciting, but never scary",
  travel: "a long road and a sense of adventure",
  rest: "cozy and peaceful",
  crux: "dramatic and hopeful",
  choice: "thoughtful",
};

/** A picture brief from the world's own description of the place, for scenes told without AI. */
function placeBrief(
  index: WorldIndex,
  s: { title: string; kind: string; regionId: string; poiId: string | null },
): ImageBrief {
  const region = index.regions.get(s.regionId);
  const poi = s.poiId ? index.pois.get(s.poiId)?.poi : undefined;
  return {
    setting: [poi?.description, region?.description].filter(Boolean).join(" ") || s.title,
    subjects: ["a small party of young adventurers"],
    mood: SCENE_MOODS[s.kind] ?? "hopeful",
    timeOfDay: "daytime",
  };
}
