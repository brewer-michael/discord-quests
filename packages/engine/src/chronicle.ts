/**
 * Chapter recaps: a few sentences for the journal, and the narrator's memory
 * of the story so far. Built only from what the table saw, by the story
 * writer after each chapter (story-writer/chapter-recap.ts).
 */
import { audienceLine, contentRulesText, type JudgeOutput, type NarrationStory } from "@dq/core/narration";
import type { SafetyFinding } from "@dq/core/safety";
import type { WorldIndex } from "@dq/core/world";
import { chapterSummaries, type DbOrTx, scenes, turns } from "@dq/db";
import { and, desc, eq, gte, lte, sql } from "drizzle-orm";
import { z } from "zod";
import { isRewound } from "./story-state";

export const ChapterRecap = z.object({ recap: z.string().min(20).max(900) });

export function recapSystem(world: WorldIndex["world"], story: NarrationStory): string {
  return [
    `You write the recap of one chapter of ${audienceLine(story.intensity)}, for the players' journal.`,
    "Write 3 to 5 sentences in the past tense, in the same voice as the story. Name the heroes and the choices they made, and end on where the story stands now.",
    "No numbers, dice or game rules. Tell what happened and what the heroes chose; never say they were guided, watched over or helped along their path, or that a stroke of good fortune was the payoff of an earlier kindness. That is kept for the epilogue at the very end of the campaign.",
    "",
    ...contentRulesText(world, story.intensity),
  ].join("\n");
}

/** What the content check found in a recap, as the chronicler is told it on the next try. */
export function recapCheckProblems(findings: readonly SafetyFinding[]): string[] {
  return findings.map((f) =>
    f.category === "banned_word"
      ? `It uses the word "${f.match}", which isn't allowed here.`
      : f.category === "hidden_leak"
        ? `It names a game mechanic ("${f.match}").`
        : "It includes something that looks like real personal information.",
  );
}

/**
 * What the reviewer flagged in a recap, quoting it. The journal and the storyteller's memory must not give the
 * hidden hand away before the epilogue. Empty when the recap passes.
 */
export function reviewProblems(v: JudgeOutput): string[] {
  const said = v.note.trim() ? `: ${v.note.trim()}` : ".";
  return [
    ...(v.revealsHiddenMechanic ? [`It shows the players a game mechanic${said}`] : []),
    ...(v.explainsCauseOfLuck
      ? [`It tells the heroes what is kept for the epilogue: that they were guided or repaid${said}`]
      : []),
    ...(v.crossesLimits ? [`It goes beyond what this story allows${said}`] : []),
  ];
}

/**
 * What was told in a chapter, turn by turn, up to `uptoSeq`: every committed turn since the chapter's first scene,
 * leaving out turns a rewind undid. Null when the chapter has no scenes yet.
 */
export async function chapterTurns(
  db: DbOrTx,
  campaign: { id: string; story: unknown },
  chapter: number,
  uptoSeq: number,
): Promise<string[] | null> {
  const sceneRows = await db
    .select({ startedTurn: scenes.startedTurn })
    .from(scenes)
    .where(
      and(eq(scenes.campaignId, campaign.id), sql`(${scenes.state}->>'chapterNumber')::int = ${chapter}`),
    );
  const starts = sceneRows.map((s) => s.startedTurn).filter((seq) => !isRewound(campaign.story, seq));
  if (starts.length === 0) return null;
  const rows = await db
    .select({ seq: turns.seq, data: turns.data })
    .from(turns)
    .where(
      and(
        eq(turns.campaignId, campaign.id),
        eq(turns.status, "committed"),
        gte(turns.seq, Math.min(...starts)),
        lte(turns.seq, uptoSeq),
      ),
    )
    .orderBy(turns.seq);
  return rows
    .filter((r) => !isRewound(campaign.story, r.seq))
    .map((r) => String((r.data.narration as { narration?: string } | undefined)?.narration ?? "").trim())
    .filter(Boolean);
}

/** Shortens each turn so all of them fit in about `chars` characters; every turn is kept, endings included. */
export function fitTurns(told: readonly string[], chars: number): string[] {
  const each = Math.max(160, Math.min(600, Math.floor(chars / Math.max(1, told.length))));
  return told.map((t) => (t.length > each ? `${t.slice(0, each - 1)}…` : t));
}

export async function chapterRecaps(db: DbOrTx, campaignId: string, limit = 4) {
  const rows = await db
    .select()
    .from(chapterSummaries)
    .where(eq(chapterSummaries.campaignId, campaignId))
    .orderBy(desc(chapterSummaries.chapter))
    .limit(limit);
  return rows.reverse().map((r) => ({ chapter: r.chapter, text: r.text }));
}
