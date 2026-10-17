CREATE TABLE "loom"."restore_points" (
	"campaign_id" uuid NOT NULL,
	"turn_seq" integer NOT NULL,
	"state" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "restore_points_campaign_id_turn_seq_pk" PRIMARY KEY("campaign_id","turn_seq")
);
--> statement-breakpoint
ALTER TABLE "loom"."restore_points" ADD CONSTRAINT "restore_points_campaign_id_campaigns_id_fk" FOREIGN KEY ("campaign_id") REFERENCES "public"."campaigns"("id") ON DELETE cascade ON UPDATE no action;