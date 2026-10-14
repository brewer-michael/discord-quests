CREATE SCHEMA "loom";
--> statement-breakpoint
CREATE SCHEMA "spoiler";
--> statement-breakpoint
CREATE TABLE "loom"."campaign_loom" (
	"campaign_id" uuid PRIMARY KEY NOT NULL,
	"master_seed" text NOT NULL,
	"tuning" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"state" jsonb NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "loom"."evaluations" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"campaign_id" uuid NOT NULL,
	"turn_seq" integer NOT NULL,
	"input_hash" text NOT NULL,
	"result" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "approval_requests" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"campaign_id" uuid NOT NULL,
	"turn_id" uuid NOT NULL,
	"dm_user_id" text NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"draft" jsonb NOT NULL,
	"dm_edits" jsonb,
	"discord_message_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"decided_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "audit_log" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"guild_id" text,
	"user_id" text,
	"action" text NOT NULL,
	"target" text,
	"detail" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "campaign_members" (
	"campaign_id" uuid NOT NULL,
	"user_id" text NOT NULL,
	"role" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "campaign_members_campaign_id_user_id_pk" PRIMARY KEY("campaign_id","user_id")
);
--> statement-breakpoint
CREATE TABLE "campaign_regions" (
	"campaign_id" uuid NOT NULL,
	"region_id" text NOT NULL,
	"state" text NOT NULL,
	CONSTRAINT "campaign_regions_campaign_id_region_id_pk" PRIMARY KEY("campaign_id","region_id")
);
--> statement-breakpoint
CREATE TABLE "campaigns" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"guild_id" text NOT NULL,
	"channel_id" text NOT NULL,
	"thread_id" text,
	"dm_thread_id" text,
	"name" text NOT NULL,
	"world_id" text NOT NULL,
	"world_version" text NOT NULL,
	"mode" text NOT NULL,
	"dm_user_id" text,
	"created_by" text NOT NULL,
	"status" text DEFAULT 'setup' NOT NULL,
	"settings" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"story" jsonb NOT NULL,
	"turn_seq" integer DEFAULT 0 NOT NULL,
	"lease_owner" text,
	"lease_until" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "canon_entities" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"campaign_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"name" text NOT NULL,
	"description" text NOT NULL,
	"tags" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"introduced_turn" integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE "chapter_summaries" (
	"campaign_id" uuid NOT NULL,
	"chapter" integer NOT NULL,
	"text" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "chapter_summaries_campaign_id_chapter_pk" PRIMARY KEY("campaign_id","chapter")
);
--> statement-breakpoint
CREATE TABLE "characters" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"campaign_id" uuid NOT NULL,
	"user_id" text NOT NULL,
	"status" text DEFAULT 'draft' NOT NULL,
	"name" text DEFAULT '' NOT NULL,
	"look" text DEFAULT '' NOT NULL,
	"class_id" text,
	"path_id" text,
	"background_id" text,
	"species_id" text,
	"guided" boolean DEFAULT true NOT NULL,
	"level" integer DEFAULT 1 NOT NULL,
	"xp" integer DEFAULT 0 NOT NULL,
	"abilities" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"skills" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"expertise" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"armor_id" text,
	"shield" boolean DEFAULT false NOT NULL,
	"hp" integer DEFAULT 0 NOT NULL,
	"hp_max" integer DEFAULT 0 NOT NULL,
	"temp_hp" integer DEFAULT 0 NOT NULL,
	"conditions" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"resources" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"gold" integer DEFAULT 0 NOT NULL,
	"keepsake_id" text,
	"creation" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"version" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "events" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"campaign_id" uuid NOT NULL,
	"turn_seq" integer NOT NULL,
	"type" text NOT NULL,
	"payload" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "guilds" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text DEFAULT '' NOT NULL,
	"settings" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "image_assets" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"guild_id" text NOT NULL,
	"cache_key" text NOT NULL,
	"scope" text NOT NULL,
	"provider_config_id" uuid,
	"model" text,
	"prompt" text NOT NULL,
	"mime" text NOT NULL,
	"width" integer NOT NULL,
	"height" integer NOT NULL,
	"bytes" "bytea",
	"storage_key" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "inventory_items" (
	"character_id" uuid NOT NULL,
	"item_id" text NOT NULL,
	"qty" integer DEFAULT 1 NOT NULL,
	"equipped" boolean DEFAULT false NOT NULL,
	CONSTRAINT "inventory_items_character_id_item_id_pk" PRIMARY KEY("character_id","item_id")
);
--> statement-breakpoint
CREATE TABLE "npcs" (
	"campaign_id" uuid NOT NULL,
	"id" text NOT NULL,
	"name" text NOT NULL,
	"archetype_id" text,
	"faction_id" text,
	"status" text DEFAULT 'active' NOT NULL,
	"region_id" text,
	"disposition" integer DEFAULT 0 NOT NULL,
	"tags" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"details" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"first_met_turn" integer,
	CONSTRAINT "npcs_campaign_id_id_pk" PRIMARY KEY("campaign_id","id")
);
--> statement-breakpoint
CREATE TABLE "pending_actions" (
	"round_id" uuid NOT NULL,
	"character_id" uuid NOT NULL,
	"user_id" text NOT NULL,
	"kind" text NOT NULL,
	"payload" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"interaction_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "pending_actions_round_id_character_id_pk" PRIMARY KEY("round_id","character_id")
);
--> statement-breakpoint
CREATE TABLE "promises" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"campaign_id" uuid NOT NULL,
	"npc_id" text NOT NULL,
	"text" text NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"made_turn" integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE "provider_configs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"guild_id" text,
	"kind" text NOT NULL,
	"name" text NOT NULL,
	"preset_id" text NOT NULL,
	"adapter_id" text NOT NULL,
	"base_url" text,
	"auth" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"secret_id" uuid,
	"extra_headers" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"model_defaults" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"capability_overrides" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"pricing" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"generic_spec" jsonb,
	"enabled" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "quests" (
	"campaign_id" uuid NOT NULL,
	"quest_id" text NOT NULL,
	"title" text NOT NULL,
	"objective" text NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	CONSTRAINT "quests_campaign_id_quest_id_pk" PRIMARY KEY("campaign_id","quest_id")
);
--> statement-breakpoint
CREATE TABLE "rounds" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"campaign_id" uuid NOT NULL,
	"scene_id" uuid NOT NULL,
	"kind" text DEFAULT 'exploration' NOT NULL,
	"n" integer NOT NULL,
	"status" text DEFAULT 'collecting' NOT NULL,
	"deadline_at" timestamp with time zone,
	"choices" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"initiative" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "safety_events" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"guild_id" text NOT NULL,
	"campaign_id" uuid,
	"user_id" text,
	"stage" text NOT NULL,
	"verdict" text NOT NULL,
	"categories" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"content_hash" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "scenes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"campaign_id" uuid NOT NULL,
	"beat_id" text,
	"kind" text NOT NULL,
	"region_id" text NOT NULL,
	"poi_id" text,
	"title" text NOT NULL,
	"state" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"started_turn" integer NOT NULL,
	"ended_turn" integer,
	"image_asset_id" uuid
);
--> statement-breakpoint
CREATE TABLE "secrets" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"guild_id" text,
	"ciphertext" "bytea" NOT NULL,
	"iv" "bytea" NOT NULL,
	"tag" "bytea" NOT NULL,
	"key_version" text NOT NULL,
	"last4" text NOT NULL,
	"created_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "task_routes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"guild_id" text,
	"campaign_id" uuid,
	"task" text NOT NULL,
	"provider_config_id" uuid NOT NULL,
	"model" text NOT NULL,
	"params" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"priority" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "turns" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"campaign_id" uuid NOT NULL,
	"seq" integer NOT NULL,
	"round_id" uuid,
	"status" text DEFAULT 'draft' NOT NULL,
	"stage" text DEFAULT 'start' NOT NULL,
	"data" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"discord_message_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"committed_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "usage_daily" (
	"guild_id" text NOT NULL,
	"day" date NOT NULL,
	"cost_micros" bigint DEFAULT 0 NOT NULL,
	"tokens" bigint DEFAULT 0 NOT NULL,
	"images" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "usage_daily_guild_id_day_pk" PRIMARY KEY("guild_id","day")
);
--> statement-breakpoint
CREATE TABLE "usage_ledger" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"guild_id" text NOT NULL,
	"campaign_id" uuid,
	"task" text NOT NULL,
	"provider_config_id" uuid,
	"model" text NOT NULL,
	"input_tokens" integer DEFAULT 0 NOT NULL,
	"output_tokens" integer DEFAULT 0 NOT NULL,
	"cache_read_tokens" integer DEFAULT 0 NOT NULL,
	"cache_write_tokens" integer DEFAULT 0 NOT NULL,
	"images" integer DEFAULT 0 NOT NULL,
	"cost_micros" bigint DEFAULT 0 NOT NULL,
	"fell_back" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "spoiler"."story_plans" (
	"campaign_id" uuid NOT NULL,
	"version" integer NOT NULL,
	"plan" jsonb NOT NULL,
	"reason" text NOT NULL,
	"created_by" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "story_plans_campaign_id_version_pk" PRIMARY KEY("campaign_id","version")
);
--> statement-breakpoint
ALTER TABLE "loom"."campaign_loom" ADD CONSTRAINT "campaign_loom_campaign_id_campaigns_id_fk" FOREIGN KEY ("campaign_id") REFERENCES "public"."campaigns"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "loom"."evaluations" ADD CONSTRAINT "evaluations_campaign_id_campaigns_id_fk" FOREIGN KEY ("campaign_id") REFERENCES "public"."campaigns"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "approval_requests" ADD CONSTRAINT "approval_requests_campaign_id_campaigns_id_fk" FOREIGN KEY ("campaign_id") REFERENCES "public"."campaigns"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "approval_requests" ADD CONSTRAINT "approval_requests_turn_id_turns_id_fk" FOREIGN KEY ("turn_id") REFERENCES "public"."turns"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "campaign_members" ADD CONSTRAINT "campaign_members_campaign_id_campaigns_id_fk" FOREIGN KEY ("campaign_id") REFERENCES "public"."campaigns"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "campaign_regions" ADD CONSTRAINT "campaign_regions_campaign_id_campaigns_id_fk" FOREIGN KEY ("campaign_id") REFERENCES "public"."campaigns"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "canon_entities" ADD CONSTRAINT "canon_entities_campaign_id_campaigns_id_fk" FOREIGN KEY ("campaign_id") REFERENCES "public"."campaigns"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chapter_summaries" ADD CONSTRAINT "chapter_summaries_campaign_id_campaigns_id_fk" FOREIGN KEY ("campaign_id") REFERENCES "public"."campaigns"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "characters" ADD CONSTRAINT "characters_campaign_id_campaigns_id_fk" FOREIGN KEY ("campaign_id") REFERENCES "public"."campaigns"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "events" ADD CONSTRAINT "events_campaign_id_campaigns_id_fk" FOREIGN KEY ("campaign_id") REFERENCES "public"."campaigns"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inventory_items" ADD CONSTRAINT "inventory_items_character_id_characters_id_fk" FOREIGN KEY ("character_id") REFERENCES "public"."characters"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "npcs" ADD CONSTRAINT "npcs_campaign_id_campaigns_id_fk" FOREIGN KEY ("campaign_id") REFERENCES "public"."campaigns"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pending_actions" ADD CONSTRAINT "pending_actions_round_id_rounds_id_fk" FOREIGN KEY ("round_id") REFERENCES "public"."rounds"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pending_actions" ADD CONSTRAINT "pending_actions_character_id_characters_id_fk" FOREIGN KEY ("character_id") REFERENCES "public"."characters"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "promises" ADD CONSTRAINT "promises_campaign_id_campaigns_id_fk" FOREIGN KEY ("campaign_id") REFERENCES "public"."campaigns"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "provider_configs" ADD CONSTRAINT "provider_configs_secret_id_secrets_id_fk" FOREIGN KEY ("secret_id") REFERENCES "public"."secrets"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quests" ADD CONSTRAINT "quests_campaign_id_campaigns_id_fk" FOREIGN KEY ("campaign_id") REFERENCES "public"."campaigns"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rounds" ADD CONSTRAINT "rounds_campaign_id_campaigns_id_fk" FOREIGN KEY ("campaign_id") REFERENCES "public"."campaigns"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rounds" ADD CONSTRAINT "rounds_scene_id_scenes_id_fk" FOREIGN KEY ("scene_id") REFERENCES "public"."scenes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "scenes" ADD CONSTRAINT "scenes_campaign_id_campaigns_id_fk" FOREIGN KEY ("campaign_id") REFERENCES "public"."campaigns"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "task_routes" ADD CONSTRAINT "task_routes_provider_config_id_provider_configs_id_fk" FOREIGN KEY ("provider_config_id") REFERENCES "public"."provider_configs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "turns" ADD CONSTRAINT "turns_campaign_id_campaigns_id_fk" FOREIGN KEY ("campaign_id") REFERENCES "public"."campaigns"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "spoiler"."story_plans" ADD CONSTRAINT "story_plans_campaign_id_campaigns_id_fk" FOREIGN KEY ("campaign_id") REFERENCES "public"."campaigns"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "evaluations_campaign_idx" ON "loom"."evaluations" USING btree ("campaign_id","turn_seq");--> statement-breakpoint
CREATE INDEX "campaigns_guild_idx" ON "campaigns" USING btree ("guild_id");--> statement-breakpoint
CREATE INDEX "campaigns_thread_idx" ON "campaigns" USING btree ("thread_id");--> statement-breakpoint
CREATE UNIQUE INDEX "canon_entities_name_idx" ON "canon_entities" USING btree ("campaign_id",lower("name"));--> statement-breakpoint
CREATE INDEX "characters_campaign_idx" ON "characters" USING btree ("campaign_id");--> statement-breakpoint
CREATE INDEX "characters_user_idx" ON "characters" USING btree ("campaign_id","user_id");--> statement-breakpoint
CREATE INDEX "events_campaign_idx" ON "events" USING btree ("campaign_id","turn_seq");--> statement-breakpoint
CREATE UNIQUE INDEX "image_assets_cache_idx" ON "image_assets" USING btree ("guild_id","cache_key");--> statement-breakpoint
CREATE UNIQUE INDEX "pending_actions_interaction_idx" ON "pending_actions" USING btree ("interaction_id");--> statement-breakpoint
CREATE INDEX "provider_configs_guild_idx" ON "provider_configs" USING btree ("guild_id");--> statement-breakpoint
CREATE INDEX "rounds_campaign_idx" ON "rounds" USING btree ("campaign_id","status");--> statement-breakpoint
CREATE INDEX "scenes_campaign_idx" ON "scenes" USING btree ("campaign_id");--> statement-breakpoint
CREATE INDEX "task_routes_lookup_idx" ON "task_routes" USING btree ("guild_id","task");--> statement-breakpoint
CREATE UNIQUE INDEX "turns_campaign_seq_idx" ON "turns" USING btree ("campaign_id","seq");--> statement-breakpoint
CREATE INDEX "usage_ledger_guild_idx" ON "usage_ledger" USING btree ("guild_id","created_at");