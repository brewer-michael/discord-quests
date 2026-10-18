import { sql } from "drizzle-orm";
import {
  index,
  integer,
  jsonb,
  pgSchema,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { campaigns } from "./public";

/** Plot plans and secrets: for the story director and the human DM, never for players. */
export const spoiler = pgSchema("spoiler");

export const storyPlans = spoiler.table(
  "story_plans",
  {
    campaignId: uuid("campaign_id")
      .notNull()
      .references(() => campaigns.id, { onDelete: "cascade" }),
    version: integer("version").notNull(),
    plan: jsonb("plan").$type<Record<string, unknown>>().notNull(),
    reason: text("reason").notNull(),
    createdBy: text("created_by").$type<"director" | "dm" | "seed" | "writer">().notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.campaignId, t.version] })],
);

export type StoryJobStatus = "queued" | "running" | "done" | "failed" | "stale";

/** One finished step of a story-writer job: what it produced, saved so a restart resumes after it. */
export interface StoryJobStep {
  name: string;
  output: unknown;
  tokens: number;
  ms: number;
  finishedAt: string;
}

/** What the DM room should hear about a job, until the bot has posted it. */
export interface StoryJobNotice {
  kind: "started" | "ready" | "retrying" | "gave_up";
  text: string;
}

/**
 * The story writer's queue: material written ahead of the table by the writer service. One job runs per
 * campaign at a time, and a job for the same thing is never queued twice.
 */
export const storyJobs = spoiler.table(
  "story_jobs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    campaignId: uuid("campaign_id")
      .notNull()
      .references(() => campaigns.id, { onDelete: "cascade" }),
    kind: text("kind").notNull(),
    /** What the job is for within its kind, such as the chapter number. */
    key: text("key").notNull(),
    reason: text("reason").notNull().default(""),
    status: text("status").$type<StoryJobStatus>().notNull().default("queued"),
    attempts: integer("attempts").notNull().default(0),
    runAfter: timestamp("run_after", { withTimezone: true }).notNull().defaultNow(),
    leaseOwner: text("lease_owner"),
    leaseUntil: timestamp("lease_until", { withTimezone: true }),
    heartbeatAt: timestamp("heartbeat_at", { withTimezone: true }),
    steps: jsonb("steps").$type<StoryJobStep[]>().notNull().default([]),
    tokensUsed: integer("tokens_used").notNull().default(0),
    /** The campaign's turn when the job was queued: a rewind past it makes the job stale. */
    enqueuedSeq: integer("enqueued_seq").notNull(),
    error: text("error"),
    notice: jsonb("notice").$type<StoryJobNotice>(),
    startedAt: timestamp("started_at", { withTimezone: true }),
    finishedAt: timestamp("finished_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("story_jobs_one_running_idx").on(t.campaignId).where(sql`${t.status} = 'running'`),
    uniqueIndex("story_jobs_once_idx")
      .on(t.campaignId, t.kind, t.key)
      .where(sql`${t.status} in ('queued', 'running', 'done')`),
    index("story_jobs_due_idx").on(t.status, t.runAfter),
    index("story_jobs_notice_idx").on(t.campaignId).where(sql`${t.notice} is not null`),
  ],
);
