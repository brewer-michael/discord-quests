/**
 * Chapter recaps: a few sentences for the journal, and the narrator's memory
 * of the story so far. Built only from what the table saw.
 */
import type { LlmGateway } from "@dq/core/llm";
import { audienceLine, contentRulesText, type NarrationStory } from "@dq/core/narration";
import { checkNarration } from "@dq/core/safety";
import type { WorldIndex } from "@dq/core/world";
import { campaigns, chapterSummaries, type Db, turns } from "@dq/db";
import { and, desc, eq, gt } from "drizzle-orm";
import { z } from "zod";
import type { Logger } from "./deps";
import { isRewound } from "./story-state";

export const ChapterRecap = z.object({ recap: z.string().min(20).max(900) });

function recapSystem(world: WorldIndex["world"], story: NarrationStory): string {
  return [
    `You write the recap of one chapter of ${audienceLine(story.intensity)}, for the players' journal.`,
    "Write 3 to 5 sentences in the past tense, in the same voice as the story. Name the heroes and the choices they made, and end on where the story stands now.",
    "No numbers, dice or game rules. Never mention luck, fate, destiny, threads, hidden forces or anything working behind the scenes.",
    "",
    ...contentRulesText(world, story.intensity),
  ].join("\n");
}

/** A plain recap from the world's own text, for when no story AI is available. */
export function fallbackRecap(index: WorldIndex, chapterNumber: number): string {
  const refs = index.beatOrder.filter((b) => b.chapter.number === chapterNumber && !b.beat.branch);
  const chapter = refs[0]?.chapter;
  if (!chapter) return `Chapter ${chapterNumber} came to an end.`;
  const firstSentence = (s: string) => (s.replace(/\s+/g, " ").match(/^.*?[.!?](\s|$)/)?.[0] ?? s).trim();
  return `Chapter ${chapterNumber}, ${chapter.title}: ${firstSentence(chapter.summary)} ${refs
    .map((r) => r.beat.title)
    .join(", ")}.`.slice(0, 900);
}

export async function writeChapterRecap(args: {
  db: Db;
  llm: LlmGateway;
  index: WorldIndex;
  log: Logger;
  campaignId: string;
  guildId: string;
  chapterNumber: number;
  /** How the story is told: intensity, voice and the table's wishes. */
  telling: NarrationStory;
}): Promise<string> {
  const { db, index } = args;
  const [prev] = await db
    .select()
    .from(chapterSummaries)
    .where(eq(chapterSummaries.campaignId, args.campaignId))
    .orderBy(desc(chapterSummaries.chapter))
    .limit(1);
  if (prev && prev.chapter >= args.chapterNumber) return prev.text;
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
  const story = rows
    .filter((r) => !isRewound(c?.story, r.seq))
    .slice(0, 40)
    .map((r) => String((r.data.narration as { narration?: string } | undefined)?.narration ?? ""))
    .filter(Boolean)
    .map((t) => (t.length > 500 ? `${t.slice(0, 499)}…` : t));
  const chapter = index.beatOrder.find((b) => b.chapter.number === args.chapterNumber)?.chapter;

  let recap = fallbackRecap(index, args.chapterNumber);
  if (story.length > 0) {
    const res = await args.llm.structured(
      {
        task: "summarizer",
        system: [{ text: recapSystem(index.world, args.telling), cache: "1h" }],
        user: [
          {
            text: `Chapter ${args.chapterNumber}: ${chapter?.title ?? ""}\n\nWhat happened, turn by turn:\n${story.map((s) => `- ${s}`).join("\n")}`,
          },
        ],
        schema: ChapterRecap,
        schemaName: "recap",
        maxOutputTokens: 1500,
        effort: "low",
      },
      { guildId: args.guildId, campaignId: args.campaignId },
    );
    if (res.ok) {
      const verdict = checkNarration(res.value.recap, index.world, { intensity: args.telling.intensity });
      if (verdict.ok) recap = res.value.recap.trim();
      else args.log.warn("chapter recap rejected", { findings: verdict.findings.map((f) => f.category) });
    }
  }
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
