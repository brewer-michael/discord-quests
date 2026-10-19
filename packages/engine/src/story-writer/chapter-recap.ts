/**
 * A chapter's recap, written once the chapter ends, from every turn told in that chapter (not just the first
 * few), for the journal and the storyteller's memory.
 */
import { JudgeOutput, judgeSystem, judgeUser } from "@dq/core/narration";
import { checkNarration } from "@dq/core/safety";
import { chapterSummaries } from "@dq/db";
import {
  ChapterRecap,
  chapterTurns,
  fitTurns,
  recapCheckProblems,
  recapSystem,
  reviewProblems,
} from "../chronicle";
import { StepFailure, type WriterKind } from "./runner";

/** About how much of the chapter's telling the recap writer reads, in characters. */
const READ_CHARS = 40_000;

interface RecapFacts {
  chapter: number;
  title: string;
  turns: string[];
}

export const chapterRecapKind: WriterKind = {
  kind: "recap",
  label: (job) => `the recap of chapter ${job.key}`,
  steps: [
    {
      name: "facts",
      run: async (ctx): Promise<RecapFacts> => {
        const chapter = Number(ctx.job.key);
        const told = await chapterTurns(ctx.db, ctx.campaign, chapter, ctx.job.enqueuedSeq);
        if (told === null) throw new StepFailure(`chapter ${chapter} has no scenes`, { final: true });
        if (told.length === 0)
          throw new StepFailure(`nothing was told in chapter ${chapter}`, { final: true });
        return {
          chapter,
          title: ctx.index.beatOrder.find((b) => b.chapter.number === chapter)?.chapter.title ?? "",
          // Every turn is read, long chapters' endings included; long turns are shortened to fit.
          turns: fitTurns(told, READ_CHARS),
        };
      },
    },
    {
      // Written, checked, then read by the reviewer, up to twice. The journal and the storyteller's memory must not
      // give the hidden hand away before the epilogue. A recap that can't pass fails the step, so the job tries
      // again later; nothing stands in for it.
      name: "draft",
      run: async (ctx) => {
        const facts = ctx.outputs.facts as RecapFacts;
        let problems: string[] = [];
        for (let attempt = 0; attempt < 2; attempt++) {
          const res = await ctx.ask({
            task: "summarizer",
            system: [{ text: recapSystem(ctx.index.world, ctx.telling), cache: "1h" }],
            user: [
              {
                text: `Chapter ${facts.chapter}: ${facts.title}\n\nWhat happened, turn by turn:\n${facts.turns.map((s) => `- ${s}`).join("\n")}`,
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
          });
          const recap = res.recap.trim();
          const verdict = checkNarration(recap, ctx.index.world, { intensity: ctx.telling.intensity });
          problems = verdict.ok
            ? reviewProblems(
                await ctx.ask({
                  task: "judge",
                  system: judgeSystem(ctx.index.world, ctx.telling),
                  user: judgeUser({ narration: recap, npcLines: [] }, [], { recap: true }),
                  schema: JudgeOutput,
                  schemaName: "review",
                  expectTokens: 300,
                  effort: "low",
                }),
              )
            : recapCheckProblems(verdict.findings);
          if (problems.length === 0) return recap;
          ctx.log.warn("chapter recap rejected", { jobId: ctx.job.id, attempt: attempt + 1, problems });
        }
        throw new StepFailure(`the recap was turned back twice (${problems.join(" ").slice(0, 300)})`);
      },
    },
  ],
  publish: async (tx, ctx) => {
    const text = ctx.outputs.draft as string;
    await tx
      .insert(chapterSummaries)
      .values({ campaignId: ctx.campaign.id, chapter: Number(ctx.job.key), text })
      .onConflictDoUpdate({ target: [chapterSummaries.campaignId, chapterSummaries.chapter], set: { text } });
    // Recaps are quiet: the DM room only hears about them when they fail.
    return null;
  },
};
