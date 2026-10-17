/**
 * Chapter recaps for the players' journal. Built only from what the table saw: the director's summary of each
 * scene, or for a chapter played before the living story, the turns as they were told.
 */
import type { LlmGateway } from "@dq/core/llm";
import { audienceLine, contentRulesText, type NarrationStory } from "@dq/core/narration";
import { checkNarration } from "@dq/core/safety";
import type { StoryPlan } from "@dq/core/story";
import type { WorldIndex } from "@dq/core/world";
import { campaigns, chapterSummaries, type Db, turns } from "@dq/db";
import { and, desc, eq, gt } from "drizzle-orm";
import { z } from "zod";
import type { Logger } from "./deps";
import { isRewound } from "./story-state";

export const ChapterRecap = z.object({ recap: z.string() });

const RECAP_MAX = 900;

function recapSystem(world: WorldIndex["world"], story: NarrationStory): string {
  return [
    `You write the recap of one chapter of ${audienceLine(story.intensity)}, for the players' journal.`,
    "Write 3 to 5 sentences in the past tense, in the same voice as the story. Name the heroes and the choices they made, and end on where the story stands now.",
    "No numbers, dice or game rules. Never mention luck, fate, destiny, threads, hidden forces or anything working behind the scenes.",
    "",
    ...contentRulesText(world, story.intensity),
  ].join("\n");
}

/**
 * Writes the recap of a chapter that just ended. If the AI can't, the journal gets the director's own scene
 * summaries for that chapter, which the table has already seen play out.
 */
export async function writeChapterRecap(args: {
  db: Db;
  llm: LlmGateway;
  index: WorldIndex;
  log: Logger;
  campaignId: string;
  guildId: string;
  chapterNumber: number;
  chapterTitle: string;
  plan: StoryPlan | null;
  /** How the story is told: intensity, voice and the table's wishes. */
  telling: NarrationStory;
}): Promise<string | null> {
  const { db, index } = args;
  const [prev] = await db
    .select()
    .from(chapterSummaries)
    .where(eq(chapterSummaries.campaignId, args.campaignId))
    .orderBy(desc(chapterSummaries.chapter))
    .limit(1);
  if (prev && prev.chapter >= args.chapterNumber) return prev.text;

  const scenes = (args.plan?.scenes ?? []).filter((s) => s.chapter === args.chapterNumber && s.summary);
  let story = scenes.map((s) => `${s.title}: ${s.summary}`);
  if (story.length === 0) {
    const rows = await db
      .select({ seq: turns.seq, data: turns.data })
      .from(turns)
      .where(
        and(
          eq(turns.campaignId, args.campaignId),
          eq(turns.status, "committed"),
          ...(prev ? [gt(turns.committedAt, prev.createdAt)] : []),
        ),
      )
      .orderBy(turns.seq)
      .limit(60);
    const [c] = await db
      .select({ story: campaigns.story })
      .from(campaigns)
      .where(eq(campaigns.id, args.campaignId));
    story = rows
      .filter((r) => !isRewound(c?.story, r.seq))
      .slice(0, 40)
      .map((r) => String((r.data.narration as { narration?: string } | undefined)?.narration ?? ""))
      .filter(Boolean)
      .map((t) => (t.length > 500 ? `${t.slice(0, 499)}…` : t));
  }
  if (story.length === 0) return null;

  let recap: string | null = null;
  const res = await args.llm.structured(
    {
      task: "summarizer",
      system: [{ text: recapSystem(index.world, args.telling), cache: "1h" }],
      user: [
        {
          text: `Chapter ${args.chapterNumber}: ${args.chapterTitle}\n\nWhat happened:\n${story.map((s) => `- ${s}`).join("\n")}`,
        },
      ],
      schema: ChapterRecap,
      schemaName: "recap",
      expectTokens: 600,
      effort: "low",
    },
    { guildId: args.guildId, campaignId: args.campaignId },
  );
  if (res.ok) {
    const text = res.value.recap.trim().slice(0, RECAP_MAX);
    const verdict = checkNarration(text, index.world, { intensity: args.telling.intensity });
    if (verdict.ok && text.length >= 20) recap = text;
    else args.log.warn("chapter recap rejected", { findings: verdict.findings.map((f) => f.category) });
  } else args.log.warn("chapter recap unavailable", { stop: res.stop });
  if (!recap && scenes.length > 0)
    recap = scenes
      .map((s) => s.summary)
      .join(" ")
      .slice(0, RECAP_MAX);
  if (!recap) return null;
  await db
    .insert(chapterSummaries)
    .values({ campaignId: args.campaignId, chapter: args.chapterNumber, text: recap })
    .onConflictDoNothing();
  return recap;
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
