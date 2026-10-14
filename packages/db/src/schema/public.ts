import { sql } from "drizzle-orm";
import {
  bigint,
  bigserial,
  boolean,
  customType,
  date,
  index,
  integer,
  jsonb,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

export const bytea = customType<{ data: Buffer; driverData: Buffer }>({
  dataType: () => "bytea",
});

const createdAt = () => timestamp("created_at", { withTimezone: true }).notNull().defaultNow();
const updatedAt = () => timestamp("updated_at", { withTimezone: true }).notNull().defaultNow();

// ------------------------------------------------------------------ tenancy

export const guilds = pgTable("guilds", {
  id: text("id").primaryKey(),
  name: text("name").notNull().default(""),
  settings: jsonb("settings").$type<Record<string, unknown>>().notNull().default({}),
  installedAt: createdAt(),
  updatedAt: updatedAt(),
});

/** Encrypted API keys. Write-only from the setup page; decrypted only when calling a provider. */
export const secrets = pgTable("secrets", {
  id: uuid("id").primaryKey().defaultRandom(),
  guildId: text("guild_id"),
  ciphertext: bytea("ciphertext").notNull(),
  iv: bytea("iv").notNull(),
  tag: bytea("tag").notNull(),
  keyVersion: text("key_version").notNull(),
  last4: text("last4").notNull(),
  createdBy: text("created_by"),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

export const providerConfigs = pgTable(
  "provider_configs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    /** Null for platform defaults configured from the environment. */
    guildId: text("guild_id"),
    kind: text("kind").$type<"llm" | "image">().notNull(),
    name: text("name").notNull(),
    presetId: text("preset_id").notNull(),
    adapterId: text("adapter_id").notNull(),
    baseUrl: text("base_url"),
    auth: jsonb("auth").$type<Record<string, unknown>>().notNull().default({}),
    secretId: uuid("secret_id").references(() => secrets.id, { onDelete: "set null" }),
    extraHeaders: jsonb("extra_headers").$type<Record<string, string>>().notNull().default({}),
    modelDefaults: jsonb("model_defaults").$type<Record<string, unknown>>().notNull().default({}),
    capabilityOverrides: jsonb("capability_overrides").$type<Record<string, unknown>>().notNull().default({}),
    pricing: jsonb("pricing").$type<Record<string, unknown>>().notNull().default({}),
    genericSpec: jsonb("generic_spec").$type<Record<string, unknown> | null>(),
    enabled: boolean("enabled").notNull().default(true),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index("provider_configs_guild_idx").on(t.guildId)],
);

export const taskRoutes = pgTable(
  "task_routes",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    guildId: text("guild_id"),
    campaignId: uuid("campaign_id"),
    task: text("task").notNull(),
    providerConfigId: uuid("provider_config_id")
      .notNull()
      .references(() => providerConfigs.id, { onDelete: "cascade" }),
    model: text("model").notNull(),
    params: jsonb("params").$type<Record<string, unknown>>().notNull().default({}),
    priority: integer("priority").notNull().default(0),
  },
  (t) => [index("task_routes_lookup_idx").on(t.guildId, t.task)],
);

export const usageLedger = pgTable(
  "usage_ledger",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    guildId: text("guild_id").notNull(),
    campaignId: uuid("campaign_id"),
    task: text("task").notNull(),
    providerConfigId: uuid("provider_config_id"),
    model: text("model").notNull(),
    inputTokens: integer("input_tokens").notNull().default(0),
    outputTokens: integer("output_tokens").notNull().default(0),
    cacheReadTokens: integer("cache_read_tokens").notNull().default(0),
    cacheWriteTokens: integer("cache_write_tokens").notNull().default(0),
    images: integer("images").notNull().default(0),
    costMicros: bigint("cost_micros", { mode: "number" }).notNull().default(0),
    fellBack: boolean("fell_back").notNull().default(false),
    createdAt: createdAt(),
  },
  (t) => [index("usage_ledger_guild_idx").on(t.guildId, t.createdAt)],
);

export const usageDaily = pgTable(
  "usage_daily",
  {
    guildId: text("guild_id").notNull(),
    day: date("day").notNull(),
    costMicros: bigint("cost_micros", { mode: "number" }).notNull().default(0),
    tokens: bigint("tokens", { mode: "number" }).notNull().default(0),
    images: integer("images").notNull().default(0),
  },
  (t) => [primaryKey({ columns: [t.guildId, t.day] })],
);

export const auditLog = pgTable("audit_log", {
  id: bigserial("id", { mode: "number" }).primaryKey(),
  guildId: text("guild_id"),
  userId: text("user_id"),
  action: text("action").notNull(),
  target: text("target"),
  detail: jsonb("detail").$type<Record<string, unknown>>().notNull().default({}),
  at: timestamp("at", { withTimezone: true }).notNull().defaultNow(),
});

// ---------------------------------------------------------------- campaigns

export type CampaignMode = "ai_dm" | "assist";
export type CampaignStatus = "setup" | "active" | "paused" | "ended";

export const campaigns = pgTable(
  "campaigns",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    guildId: text("guild_id").notNull(),
    channelId: text("channel_id").notNull(),
    threadId: text("thread_id"),
    dmThreadId: text("dm_thread_id"),
    name: text("name").notNull(),
    worldId: text("world_id").notNull(),
    worldVersion: text("world_version").notNull(),
    mode: text("mode").$type<CampaignMode>().notNull(),
    dmUserId: text("dm_user_id"),
    createdBy: text("created_by").notNull(),
    status: text("status").$type<CampaignStatus>().notNull().default("setup"),
    settings: jsonb("settings").$type<Record<string, unknown>>().notNull().default({}),
    /** Public story position: beats done, clocks, region. The plan for what comes next lives in spoiler. */
    story: jsonb("story").$type<Record<string, unknown>>().notNull(),
    turnSeq: integer("turn_seq").notNull().default(0),
    leaseOwner: text("lease_owner"),
    leaseUntil: timestamp("lease_until", { withTimezone: true }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index("campaigns_guild_idx").on(t.guildId), index("campaigns_thread_idx").on(t.threadId)],
);

export const campaignMembers = pgTable(
  "campaign_members",
  {
    campaignId: uuid("campaign_id")
      .notNull()
      .references(() => campaigns.id, { onDelete: "cascade" }),
    userId: text("user_id").notNull(),
    role: text("role").$type<"player" | "dm" | "guardian" | "spectator">().notNull(),
    joinedAt: createdAt(),
  },
  (t) => [primaryKey({ columns: [t.campaignId, t.userId] })],
);

export const characters = pgTable(
  "characters",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    campaignId: uuid("campaign_id")
      .notNull()
      .references(() => campaigns.id, { onDelete: "cascade" }),
    userId: text("user_id").notNull(),
    status: text("status").$type<"draft" | "active" | "retired">().notNull().default("draft"),
    name: text("name").notNull().default(""),
    look: text("look").notNull().default(""),
    classId: text("class_id"),
    pathId: text("path_id"),
    backgroundId: text("background_id"),
    speciesId: text("species_id"),
    guided: boolean("guided").notNull().default(true),
    level: integer("level").notNull().default(1),
    xp: integer("xp").notNull().default(0),
    abilities: jsonb("abilities").$type<Record<string, number>>().notNull().default({}),
    skills: jsonb("skills").$type<string[]>().notNull().default([]),
    expertise: jsonb("expertise").$type<string[]>().notNull().default([]),
    armorId: text("armor_id"),
    shield: boolean("shield").notNull().default(false),
    hp: integer("hp").notNull().default(0),
    hpMax: integer("hp_max").notNull().default(0),
    tempHp: integer("temp_hp").notNull().default(0),
    conditions: jsonb("conditions").$type<string[]>().notNull().default([]),
    resources: jsonb("resources").$type<Record<string, number>>().notNull().default({}),
    gold: integer("gold").notNull().default(0),
    keepsakeId: text("keepsake_id"),
    /** Character-creation wizard progress. */
    creation: jsonb("creation").$type<Record<string, unknown>>().notNull().default({}),
    version: integer("version").notNull().default(0),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    index("characters_campaign_idx").on(t.campaignId),
    index("characters_user_idx").on(t.campaignId, t.userId),
  ],
);

export const inventoryItems = pgTable(
  "inventory_items",
  {
    characterId: uuid("character_id")
      .notNull()
      .references(() => characters.id, { onDelete: "cascade" }),
    itemId: text("item_id").notNull(),
    qty: integer("qty").notNull().default(1),
    equipped: boolean("equipped").notNull().default(false),
  },
  (t) => [primaryKey({ columns: [t.characterId, t.itemId] })],
);

export const npcs = pgTable(
  "npcs",
  {
    campaignId: uuid("campaign_id")
      .notNull()
      .references(() => campaigns.id, { onDelete: "cascade" }),
    id: text("id").notNull(),
    name: text("name").notNull(),
    archetypeId: text("archetype_id"),
    factionId: text("faction_id"),
    status: text("status").notNull().default("active"),
    regionId: text("region_id"),
    disposition: integer("disposition").notNull().default(0),
    tags: jsonb("tags").$type<string[]>().notNull().default([]),
    details: jsonb("details").$type<Record<string, unknown>>().notNull().default({}),
    firstMetTurn: integer("first_met_turn"),
  },
  (t) => [primaryKey({ columns: [t.campaignId, t.id] })],
);

export const campaignRegions = pgTable(
  "campaign_regions",
  {
    campaignId: uuid("campaign_id")
      .notNull()
      .references(() => campaigns.id, { onDelete: "cascade" }),
    regionId: text("region_id").notNull(),
    state: text("state").$type<"rumored" | "discovered" | "visited">().notNull(),
  },
  (t) => [primaryKey({ columns: [t.campaignId, t.regionId] })],
);

export const quests = pgTable(
  "quests",
  {
    campaignId: uuid("campaign_id")
      .notNull()
      .references(() => campaigns.id, { onDelete: "cascade" }),
    questId: text("quest_id").notNull(),
    title: text("title").notNull(),
    objective: text("objective").notNull(),
    status: text("status").$type<"active" | "completed" | "failed">().notNull().default("active"),
  },
  (t) => [primaryKey({ columns: [t.campaignId, t.questId] })],
);

export const promises = pgTable("promises", {
  id: uuid("id").primaryKey().defaultRandom(),
  campaignId: uuid("campaign_id")
    .notNull()
    .references(() => campaigns.id, { onDelete: "cascade" }),
  npcId: text("npc_id").notNull(),
  text: text("text").notNull(),
  status: text("status").$type<"pending" | "kept" | "broken">().notNull().default("pending"),
  madeTurn: integer("made_turn").notNull(),
});

export const canonEntities = pgTable(
  "canon_entities",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    campaignId: uuid("campaign_id")
      .notNull()
      .references(() => campaigns.id, { onDelete: "cascade" }),
    kind: text("kind").$type<"npc" | "place" | "item">().notNull(),
    name: text("name").notNull(),
    description: text("description").notNull(),
    tags: jsonb("tags").$type<string[]>().notNull().default([]),
    introducedTurn: integer("introduced_turn").notNull(),
  },
  (t) => [uniqueIndex("canon_entities_name_idx").on(t.campaignId, sql`lower(${t.name})`)],
);

export const scenes = pgTable(
  "scenes",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    campaignId: uuid("campaign_id")
      .notNull()
      .references(() => campaigns.id, { onDelete: "cascade" }),
    beatId: text("beat_id"),
    kind: text("kind").notNull(),
    regionId: text("region_id").notNull(),
    poiId: text("poi_id"),
    title: text("title").notNull(),
    state: jsonb("state").$type<Record<string, unknown>>().notNull().default({}),
    startedTurn: integer("started_turn").notNull(),
    endedTurn: integer("ended_turn"),
    imageAssetId: uuid("image_asset_id"),
  },
  (t) => [index("scenes_campaign_idx").on(t.campaignId)],
);

export const rounds = pgTable(
  "rounds",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    campaignId: uuid("campaign_id")
      .notNull()
      .references(() => campaigns.id, { onDelete: "cascade" }),
    sceneId: uuid("scene_id")
      .notNull()
      .references(() => scenes.id, { onDelete: "cascade" }),
    kind: text("kind").$type<"exploration" | "combat">().notNull().default("exploration"),
    n: integer("n").notNull(),
    status: text("status")
      .$type<"collecting" | "resolving" | "resolved" | "cancelled">()
      .notNull()
      .default("collecting"),
    deadlineAt: timestamp("deadline_at", { withTimezone: true }),
    /** Choices offered this round, with hidden intent tags. Buttons carry only an index. */
    choices: jsonb("choices").$type<unknown[]>().notNull().default([]),
    initiative: jsonb("initiative").$type<unknown[]>().notNull().default([]),
    createdAt: createdAt(),
  },
  (t) => [index("rounds_campaign_idx").on(t.campaignId, t.status)],
);

export const pendingActions = pgTable(
  "pending_actions",
  {
    roundId: uuid("round_id")
      .notNull()
      .references(() => rounds.id, { onDelete: "cascade" }),
    characterId: uuid("character_id")
      .notNull()
      .references(() => characters.id, { onDelete: "cascade" }),
    userId: text("user_id").notNull(),
    kind: text("kind").$type<"choice" | "freeform" | "pass">().notNull(),
    payload: jsonb("payload").$type<Record<string, unknown>>().notNull().default({}),
    interactionId: text("interaction_id"),
    submittedAt: createdAt(),
  },
  (t) => [
    primaryKey({ columns: [t.roundId, t.characterId] }),
    uniqueIndex("pending_actions_interaction_idx").on(t.interactionId),
  ],
);

/** One row per resolved round. Committed turns are append-only (enforced by a trigger). */
export const turns = pgTable(
  "turns",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    campaignId: uuid("campaign_id")
      .notNull()
      .references(() => campaigns.id, { onDelete: "cascade" }),
    seq: integer("seq").notNull(),
    roundId: uuid("round_id"),
    status: text("status")
      .$type<"draft" | "awaiting_approval" | "committed" | "rejected">()
      .notNull()
      .default("draft"),
    stage: text("stage").notNull().default("start"),
    /** Stage checkpoints: inputs, intents, rolls, loom, narration. Lets a crash resume without re-rolling. */
    data: jsonb("data").$type<Record<string, unknown>>().notNull().default({}),
    discordMessageId: text("discord_message_id"),
    createdAt: createdAt(),
    committedAt: timestamp("committed_at", { withTimezone: true }),
  },
  (t) => [uniqueIndex("turns_campaign_seq_idx").on(t.campaignId, t.seq)],
);

export const events = pgTable(
  "events",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    campaignId: uuid("campaign_id")
      .notNull()
      .references(() => campaigns.id, { onDelete: "cascade" }),
    turnSeq: integer("turn_seq").notNull(),
    type: text("type").notNull(),
    payload: jsonb("payload").$type<Record<string, unknown>>().notNull().default({}),
    createdAt: createdAt(),
  },
  (t) => [index("events_campaign_idx").on(t.campaignId, t.turnSeq)],
);

export const approvalRequests = pgTable("approval_requests", {
  id: uuid("id").primaryKey().defaultRandom(),
  campaignId: uuid("campaign_id")
    .notNull()
    .references(() => campaigns.id, { onDelete: "cascade" }),
  turnId: uuid("turn_id")
    .notNull()
    .references(() => turns.id, { onDelete: "cascade" }),
  dmUserId: text("dm_user_id").notNull(),
  status: text("status")
    .$type<"pending" | "approved" | "edited" | "rejected" | "stale">()
    .notNull()
    .default("pending"),
  draft: jsonb("draft").$type<Record<string, unknown>>().notNull(),
  dmEdits: jsonb("dm_edits").$type<Record<string, unknown>>(),
  discordMessageId: text("discord_message_id"),
  createdAt: createdAt(),
  decidedAt: timestamp("decided_at", { withTimezone: true }),
});

export const imageAssets = pgTable(
  "image_assets",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    guildId: text("guild_id").notNull(),
    cacheKey: text("cache_key").notNull(),
    scope: text("scope").$type<"region" | "scene" | "portrait" | "map">().notNull(),
    providerConfigId: uuid("provider_config_id"),
    model: text("model"),
    prompt: text("prompt").notNull(),
    mime: text("mime").notNull(),
    width: integer("width").notNull(),
    height: integer("height").notNull(),
    bytes: bytea("bytes"),
    storageKey: text("storage_key"),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex("image_assets_cache_idx").on(t.guildId, t.cacheKey)],
);

/** What safety blocked, never the text itself. Purged after 30 days. */
export const safetyEvents = pgTable("safety_events", {
  id: bigserial("id", { mode: "number" }).primaryKey(),
  guildId: text("guild_id").notNull(),
  campaignId: uuid("campaign_id"),
  userId: text("user_id"),
  stage: text("stage").$type<"input" | "output" | "image" | "xcard">().notNull(),
  verdict: text("verdict").notNull(),
  categories: jsonb("categories").$type<string[]>().notNull().default([]),
  contentHash: text("content_hash"),
  createdAt: createdAt(),
});

export const chapterSummaries = pgTable(
  "chapter_summaries",
  {
    campaignId: uuid("campaign_id")
      .notNull()
      .references(() => campaigns.id, { onDelete: "cascade" }),
    chapter: integer("chapter").notNull(),
    text: text("text").notNull(),
    createdAt: createdAt(),
  },
  (t) => [primaryKey({ columns: [t.campaignId, t.chapter] })],
);
