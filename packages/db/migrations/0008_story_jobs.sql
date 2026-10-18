CREATE TABLE "spoiler"."story_jobs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"campaign_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"key" text NOT NULL,
	"reason" text DEFAULT '' NOT NULL,
	"status" text DEFAULT 'queued' NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"run_after" timestamp with time zone DEFAULT now() NOT NULL,
	"lease_owner" text,
	"lease_until" timestamp with time zone,
	"heartbeat_at" timestamp with time zone,
	"steps" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"tokens_used" integer DEFAULT 0 NOT NULL,
	"enqueued_seq" integer NOT NULL,
	"error" text,
	"notice" jsonb,
	"started_at" timestamp with time zone,
	"finished_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "spoiler"."story_jobs" ADD CONSTRAINT "story_jobs_campaign_id_campaigns_id_fk" FOREIGN KEY ("campaign_id") REFERENCES "public"."campaigns"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "story_jobs_one_running_idx" ON "spoiler"."story_jobs" USING btree ("campaign_id") WHERE "spoiler"."story_jobs"."status" = 'running';--> statement-breakpoint
CREATE UNIQUE INDEX "story_jobs_once_idx" ON "spoiler"."story_jobs" USING btree ("campaign_id","kind","key") WHERE "spoiler"."story_jobs"."status" in ('queued', 'running', 'done');--> statement-breakpoint
CREATE INDEX "story_jobs_due_idx" ON "spoiler"."story_jobs" USING btree ("status","run_after");--> statement-breakpoint
CREATE INDEX "story_jobs_notice_idx" ON "spoiler"."story_jobs" USING btree ("campaign_id") WHERE "spoiler"."story_jobs"."notice" is not null;