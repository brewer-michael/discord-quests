/**
 * Chapter recaps: a few sentences for the journal, and the narrator's memory
 * of the story so far. Built only from what the table saw, by the story
 * writer after each chapter (story-writer/chapter-recap.ts).
 */
import { audienceLine, contentRulesText, type NarrationStory } from "@dq/core/narration";
import type { WorldIndex } from "@dq/core/world";
import { chapterSummaries, type Db } from "@dq/db";
import { desc, eq } from "drizzle-orm";
import { z } from "zod";

export const ChapterRecap = z.object({ recap: z.string().min(20).max(900) });

export function recapSystem(world: WorldIndex["world"], story: NarrationStory): string {
  return [
    `You write the recap of one chapter of ${audienceLine(story.intensity)}, for the players' journal.`,
    "Write 3 to 5 sentences in the past tense, in the same voice as the story. Name the heroes and the choices they made, and end on where the story stands now.",
    "No numbers, dice or game rules. Never mention luck, fate, destiny, threads, hidden forces or anything working behind the scenes.",
    "",
    ...contentRulesText(world, story.intensity),
  ].join("\n");
}

export async function chapterRecaps(db: Db, campaignId: string, limit = 4) {
  const rows = await db
    .select()
    .from(chapterSummaries)
    .where(eq(chapterSummaries.campaignId, campaignId))
    .orderBy(desc(chapterSummaries.chapter))
    .limit(limit);
  return rows.reverse().map((r) => ({ chapter: r.chapter, text: r.text }));
}
