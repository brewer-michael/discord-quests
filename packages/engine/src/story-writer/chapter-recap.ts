/**
 * A chapter's recap, written once the chapter ends, from every turn told in that chapter (not just the first
 * few), for the journal and the storyteller's memory.
 */
import { JudgeOutput, judgeSystem, judgeUser } from "@dq/core/narration";
import { checkNarration } from "@dq/core/safety";
import { chapterSummaries, scenes, turns } from "@dq/db";
import { and, eq, gte, lte, sql } from "drizzle-orm";
import { ChapterRecap, recapCheckProblems, recapSystem, reviewProblems } from "../chronicle";
import { isRewound } from "../story-state";
import { StepFailure, type WriterKind } from "./runner";

/** About how much of the chapter's telling the recap writer reads, in characters. */
const READ_CHARS = 40_000;

interface RecapFacts {
  chapter: number;
  title: string;
  turns: string[];
}

export const chapterRecapKind: WriterKind = {
  kind: "chapter_recap",
  label: (job) => `the recap of chapter ${job.key}`,
  steps: [
    {
      name: "facts",
      run: async (ctx): Promise<RecapFacts> => {
        const chapter = Number(ctx.job.key);
        const story = ctx.campaign.story;
        const sceneRows = await ctx.db
          .select({ startedTurn: scenes.startedTurn })
          .from(scenes)
          .where(
            and(
              eq(scenes.campaignId, ctx.campaign.id),
              sql`(${scenes.state}->>'chapterNumber')::int = ${chapter}`,
            ),
          );
        const starts = sceneRows.map((s) => s.startedTurn).filter((seq) => !isRewound(story, seq));
        if (starts.length === 0) throw new StepFailure(`chapter ${chapter} has no scenes`, { final: true });
        const rows = await ctx.db
          .select({ seq: turns.seq, data: turns.data })
          .from(turns)
          .where(
            and(
              eq(turns.campaignId, ctx.campaign.id),
              eq(turns.status, "committed"),
              gte(turns.seq, Math.min(...starts)),
              lte(turns.seq, ctx.job.enqueuedSeq),
            ),
          )
          .orderBy(turns.seq);
        const told = rows
          .filter((r) => !isRewound(story, r.seq))
          .map((r) =>
            String((r.data.narration as { narration?: string } | undefined)?.narration ?? "").trim(),
          )
          .filter(Boolean);
        if (told.length === 0)
          throw new StepFailure(`nothing was told in chapter ${chapter}`, { final: true });
        // Every turn is read, long chapters' endings included; long turns are shortened to fit.
        const each = Math.max(160, Math.min(600, Math.floor(READ_CHARS / told.length)));
        return {
          chapter,
          title: ctx.index.beatOrder.find((b) => b.chapter.number === chapter)?.chapter.title ?? "",
          turns: told.map((t) => (t.length > each ? `${t.slice(0, each - 1)}…` : t)),
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
