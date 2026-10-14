import { bigserial, index, integer, jsonb, pgSchema, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { campaigns } from "./public";

/**
 * The hidden providence. Players never see any of this. Only engine code that
 * runs the loom, and the spoiler-gated DM views, may import it.
 */
export const loom = pgSchema("loom");

export const campaignLoom = loom.table("campaign_loom", {
  campaignId: uuid("campaign_id")
    .primaryKey()
    .references(() => campaigns.id, { onDelete: "cascade" }),
  /** 32 random bytes, hex. Every random draw in the campaign derives from it. */
  masterSeed: text("master_seed").notNull(),
  tuning: jsonb("tuning").$type<Record<string, unknown>>().notNull().default({}),
  state: jsonb("state").$type<Record<string, unknown>>().notNull(),
  /** A loom result waiting for a human DM's approval (Assist mode). */
  pending: jsonb("pending").$type<Record<string, unknown> | null>(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

/** Append-only record of every loom evaluation, for audit and replay. */
export const evaluations = loom.table(
  "evaluations",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    campaignId: uuid("campaign_id")
      .notNull()
      .references(() => campaigns.id, { onDelete: "cascade" }),
    turnSeq: integer("turn_seq").notNull(),
    inputHash: text("input_hash").notNull(),
    result: jsonb("result").$type<Record<string, unknown>>().notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("evaluations_campaign_idx").on(t.campaignId, t.turnSeq)],
);
