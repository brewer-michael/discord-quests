-- The story writer's job kinds take the names the roadmap gives them: a chapter in detail, and a chapter's recap.
UPDATE "spoiler"."story_jobs" SET "kind" = 'chapter' WHERE "kind" = 'chapter_plan';--> statement-breakpoint
UPDATE "spoiler"."story_jobs" SET "kind" = 'recap' WHERE "kind" = 'chapter_recap';
