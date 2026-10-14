import { integer, jsonb, pgSchema, primaryKey, text, timestamp, uuid } from "drizzle-orm/pg-core";
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
    createdBy: text("created_by").$type<"director" | "dm" | "seed">().notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.campaignId, t.version] })],
);
