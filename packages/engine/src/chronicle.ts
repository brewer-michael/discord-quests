/**
 * Chapter recaps: a few sentences for the journal, and the narrator's memory
 * of the story so far. Built only from what the table saw.
 */
import type { LlmGateway } from "@dq/core/llm";
import {
  audienceLine,
  contentRulesText,
  JudgeOutput,
  judgeSystem,
  judgeUser,
  type NarrationStory,
} from "@dq/core/narration";
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
    "No numbers, dice or game rules. Tell what happened and what the heroes chose; never say they were guided, watched over or helped along their path, or that a stroke of good fortune was the payoff of an earlier kindness. That is kept for the epilogue at the very end of the campaign.",
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
  const scope = { guildId: args.guildId, campaignId: args.campaignId };
  // The reviewer reads every recap: the journal and the storyteller's memory must not give the hidden hand away
  // before the epilogue. A recap it can't pass, or can't read, gives way to the plain one from the world's text.
  let problems: string[] = [];
  for (let attempt = 0; story.length > 0 && attempt < 2; attempt++) {
    const res = await args.llm.structured(
      {
        task: "summarizer",
        system: [{ text: recapSystem(index.world, args.telling), cache: "1h" }],
        user: [
          {
            text: `Chapter ${args.chapterNumber}: ${chapter?.title ?? ""}\n\nWhat happened, turn by turn:\n${story.map((s) => `- ${s}`).join("\n")}`,
          },
          ...(problems.length > 0
            ? [
                {
                  text: `Your previous recap had these problems. Write it again without them:\n${problems.map((p) => `- ${p}`).join("\n")}`,
                },
              ]
            : []),
        ],
        schema: ChapterRecap,
        schemaName: "recap",
        expectTokens: 600,
        effort: "low",
      },
      scope,
    );
    if (!res.ok) break;
    const text = res.value.recap.trim();
    const verdict = checkNarration(text, index.world, { intensity: args.telling.intensity });
    if (!verdict.ok) {
      args.log.warn("chapter recap rejected", { findings: verdict.findings.map((f) => f.category) });
      problems = verdict.findings.map((f) =>
        f.category === "banned_word"
          ? `It uses the word "${f.match}", which isn't allowed here.`
          : f.category === "hidden_leak"
            ? `It names a game mechanic ("${f.match}").`
            : "It includes something that looks like real personal information.",
      );
      continue;
    }
    const judged = await args.llm.structured(
      {
        task: "judge",
        system: judgeSystem(index.world, args.telling),
        user: judgeUser({ narration: text, npcLines: [] }, [], { recap: true }),
        schema: JudgeOutput,
        schemaName: "review",
        expectTokens: 300,
        effort: "low",
      },
      scope,
    );
    if (!judged.ok) {
      args.log.warn("chapter recap unread", { stop: judged.stop, error: judged.error });
      break;
    }
    const v = judged.value;
    if (!v.revealsHiddenMechanic && !v.explainsCauseOfLuck && !v.crossesLimits) {
      recap = text;
      break;
    }
    const said = v.note.trim() ? `: ${v.note.trim()}` : ".";
    problems = [
      ...(v.revealsHiddenMechanic ? [`It shows the players a game mechanic${said}`] : []),
      ...(v.explainsCauseOfLuck
        ? [`It tells the heroes what is kept for the epilogue: that they were guided or repaid${said}`]
        : []),
      ...(v.crossesLimits ? [`It goes beyond what this story allows${said}`] : []),
    ];
    args.log.warn("chapter recap rejected by the reviewer", { attempt: attempt + 1, problems });
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
