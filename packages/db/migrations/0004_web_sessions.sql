CREATE TABLE "web_sessions" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"username" text NOT NULL,
	"avatar" text,
	"token_ciphertext" "bytea" NOT NULL,
	"token_iv" "bytea" NOT NULL,
	"token_tag" "bytea" NOT NULL,
	"token_key_version" text NOT NULL,
	"guilds" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"guilds_fetched_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "guilds" ADD COLUMN "bot_present" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "provider_configs" ADD COLUMN "self_hosted" boolean DEFAULT false NOT NULL;--> statement-breakpoint
CREATE INDEX "web_sessions_user_idx" ON "web_sessions" USING btree ("user_id");