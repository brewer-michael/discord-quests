/**
 * Chapter plans from before the story writer's material: a note and featured people for each scene of a chapter.
 * Campaigns that have them keep using them until the writer publishes material for the campaign
 * (story-writer/material.ts). Plans live in the spoiler schema.
 */
import type { WorldIndex } from "@dq/core/world";
import { type Db, storyPlans } from "@dq/db";
import { and, desc, eq, sql } from "drizzle-orm";
import type { SceneSpec } from "./director";
import { npcAnchor } from "./director";
import { isRewound } from "./story-state";

export interface ChapterPlan {
  chapter: number;
  theme: string;
  beats: Record<string, { note: string; featured: string[] }>;
  /** Who wrote it. Plans from before the story writer may say "planner" or "fallback". */
  source: "writer" | "planner" | "fallback";
  /** The campaign's turn when it was asked for: a rewind past it sets the plan aside. */
  seq?: number;
}

/**
 * The plan for a chapter: its newest version, unless a rewind undid the turn it was written for. Plans are
 * written ahead, so the newest plan overall may be for a later chapter.
 */
export async function planFor(
  db: Db,
  campaignId: string,
  chapter: number,
  story: unknown,
): Promise<ChapterPlan | null> {
  const rows = await db
    .select({ plan: storyPlans.plan })
    .from(storyPlans)
    .where(
      and(eq(storyPlans.campaignId, campaignId), sql`(${storyPlans.plan}->>'chapter')::int = ${chapter}`),
    )
    .orderBy(desc(storyPlans.version))
    .limit(5);
  for (const row of rows) {
    const plan = row.plan as unknown as ChapterPlan;
    if (typeof plan.seq === "number" && isRewound(story, plan.seq)) continue;
    return plan;
  }
  return null;
}

/** Adds the planner's note and featured characters to a scene built from the arc. */
export function applyPlan(index: WorldIndex, spec: SceneSpec, plan: ChapterPlan | null): SceneSpec {
  const entry = spec.beatId ? plan?.beats[spec.beatId] : undefined;
  if (!entry) return spec;
  const entities = [...spec.entities];
  for (const id of entry.featured) {
    if (entities.some((e) => e.ref.id === id)) continue;
    const anchor = npcAnchor(index, id);
    entities.push({
      ref: anchor,
      kind: "npc",
      status: "neutral",
      lowly: (anchor.tags ?? []).includes("lowly"),
      present: true,
    });
  }
  return { ...spec, entities, directorNote: entry.note };
}
