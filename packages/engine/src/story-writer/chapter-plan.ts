/**
 * A chapter's plan, written ahead of the table: the planner drafts notes for each of the chapter's scenes from
 * what the heroes have done, an editor checks the draft against the facts and the rules, and the plan shapes
 * every scene of that chapter opened after it's published.
 */
import { storyPlans } from "@dq/db";
import { desc, eq } from "drizzle-orm";
import {
  type ChapterPlan,
  checkPlan,
  gatherPlanFacts,
  type PlanFacts,
  PlannerOutput,
  planFactsText,
  plannerReviseSystem,
  plannerSystem,
} from "../planner";
import { asStory } from "../story-state";
import { StepFailure, type WriterKind } from "./runner";

interface CheckedPlan {
  theme: string;
  beats: ChapterPlan["beats"];
}

export const chapterPlanKind: WriterKind = {
  kind: "chapter_plan",
  label: (job) => `chapter ${job.key}`,
  started: (job) => ({ kind: "started", text: `📝 Writing chapter ${job.key} ahead of the table.` }),
  steps: [
    {
      name: "facts",
      run: async (ctx) => {
        const chapter = Number(ctx.job.key);
        const facts = await gatherPlanFacts(
          ctx.db,
          ctx.index,
          ctx.campaign.id,
          chapter,
          asStory(ctx.campaign.story),
        );
        if (!facts) throw new StepFailure(`this world has no chapter ${chapter}`, { final: true });
        return facts;
      },
    },
    {
      name: "draft",
      run: async (ctx) =>
        ctx.ask({
          task: "writer",
          system: [{ text: plannerSystem(ctx.index.world, ctx.telling), cache: "1h" }],
          user: [{ text: planFactsText(ctx.outputs.facts as PlanFacts) }],
          schema: PlannerOutput,
          schemaName: "chapter_plan",
          expectTokens: 2000,
          effort: "high",
        }),
    },
    {
      name: "revise",
      run: async (ctx): Promise<CheckedPlan> => {
        const facts = ctx.outputs.facts as PlanFacts;
        const revised = await ctx.ask({
          task: "writer",
          system: [{ text: plannerReviseSystem(ctx.index.world, ctx.telling), cache: "1h" }],
          user: [
            { text: planFactsText(facts) },
            { text: `## The planner's draft\n${JSON.stringify(ctx.outputs.draft, null, 2)}` },
          ],
          schema: PlannerOutput,
          schemaName: "chapter_plan_revised",
          expectTokens: 2000,
          effort: "high",
        });
        // The checks run here, not at publishing, so a plan they turn back is asked for again on the next try.
        const checked = checkPlan(ctx.index, facts, revised, ctx.telling.intensity);
        if (checked.rejected > 0)
          ctx.log.warn("planner notes rejected", { jobId: ctx.job.id, rejected: checked.rejected });
        if (Object.keys(checked.beats).length === 0)
          throw new StepFailure("none of its scene notes passed the content check");
        return { theme: checked.theme, beats: checked.beats };
      },
    },
  ],
  publish: async (tx, ctx) => {
    const checked = ctx.outputs.revise as CheckedPlan;
    const chapter = Number(ctx.job.key);
    const plan: ChapterPlan = { chapter, ...checked, source: "writer", seq: ctx.job.enqueuedSeq };
    const [last] = await tx
      .select({ version: storyPlans.version })
      .from(storyPlans)
      .where(eq(storyPlans.campaignId, ctx.campaign.id))
      .orderBy(desc(storyPlans.version))
      .limit(1);
    await tx.insert(storyPlans).values({
      campaignId: ctx.campaign.id,
      version: (last?.version ?? 0) + 1,
      plan: plan as unknown as Record<string, unknown>,
      reason: `chapter ${chapter}`,
      createdBy: "writer",
    });
    return { kind: "ready", text: `✅ Chapter ${chapter} is ready; it shapes the scenes from here.` };
  },
};
