/**
 * The writer's jobs. Each is a series of steps, each step one AI call saved as it finishes:
 * - bible, when a campaign is created: outline → bible → spine → chapter detail → side quests → self-check;
 * - chapter, when a chapter marker is reached or prepared material runs low: chapter detail → side quests →
 *   self-check;
 * - side_quest, when the party goes off course: side quests → self-check;
 * - rework, when a DM's change touches material already written: rework → self-check.
 * The self-check reads the job's work against what has happened and the rules, and the engine checks it again
 * (ids, content rules, established facts) before a new version of the story plan is published, marked ready.
 */
import { turns } from "@dq/db";
import { and, eq } from "drizzle-orm";
import type { z } from "zod";
import {
  Bible,
  ChapterDetail,
  checkMaterial,
  factsText,
  gatherFacts,
  type MaterialParts,
  materialFor,
  materialText,
  mergeMaterial,
  Outline,
  publishMaterial,
  Rework,
  type SideQuest,
  SideQuests,
  Spine,
  selfCheckSchema,
  type WriterFacts,
  withoutPlayed,
  worldText,
  writerSystem,
} from "./material";
import { type StepContext, StepFailure, type WriterKind } from "./runner";

type Step = WriterKind["steps"][number];

function system(ctx: StepContext) {
  return [
    { text: writerSystem(ctx.index.world, ctx.telling), cache: "1h" as const },
    { text: worldText(ctx.index), cache: "1h" as const },
  ];
}

/** This job's parts so far, from the steps it has finished. */
function partsSoFar(ctx: StepContext): MaterialParts {
  const o = ctx.outputs;
  const rework = o.rework as z.infer<typeof Rework> | undefined;
  return {
    ...(o.outline ? { outline: o.outline as Outline } : {}),
    ...(o.bible ? { bible: o.bible as Bible } : {}),
    ...(o.spine ? { spine: o.spine as Spine } : {}),
    ...(o.chapter ? { chapter: o.chapter as ChapterDetail } : rework ? { chapter: rework.chapter } : {}),
    ...(o.side_quests
      ? { sideQuests: (o.side_quests as { sideQuests: SideQuest[] }).sideQuests }
      : rework
        ? { sideQuests: rework.sideQuests }
        : {}),
    ...(rework ? { facts: rework.facts } : {}),
  };
}

async function write<T>(
  ctx: StepContext,
  facts: WriterFacts,
  schemaName: string,
  schema: z.ZodType<T>,
  task: string,
  expectTokens: number,
): Promise<T> {
  return ctx.ask({
    task: "writer",
    system: system(ctx),
    user: [
      { text: factsText(facts) },
      { text: materialText(facts.material, partsSoFar(ctx)) },
      { text: `## Your task\n${task}` },
    ],
    schema,
    schemaName,
    expectTokens,
    effort: "high",
  });
}

/** The chapter a chapter job is for: its key is the chapter number, or "3+57" for more of chapter 3. */
function chapterOf(key: string): number {
  return Number(key.split("+")[0]);
}

const outline: Step = {
  name: "outline",
  run: async (ctx) =>
    write(
      ctx,
      await gatherFacts(ctx.db, ctx.index, ctx.campaign.id, ctx.telling),
      "outline",
      Outline,
      "Write the outline of this campaign's story: a pitch for this table and these heroes, the story's shape (a quest for a stolen thing, a rescue, a heist...), what's at stake, the villain and what they want, and one line for each chapter of the world's road on what that chapter is for.",
      1200,
    ),
};

const bible: Step = {
  name: "bible",
  run: async (ctx) =>
    write(
      ctx,
      await gatherFacts(ctx.db, ctx.index, ctx.campaign.id, ctx.telling),
      "bible",
      Bible,
      "Write the story bible: the places the story will use (by id), with what's there now and the routes between them; the factions (by id), with what they want and how they feel about the heroes; the cast, the world's people who matter (by id) and up to 8 new people (ids starting with new-), each with role, pronouns, personality, wants, a secret and a voice; and the established facts: what has happened, who knows what, and where everyone is. The facts must agree with everything under What has happened.",
      3000,
    ),
};

const spine: Step = {
  name: "spine",
  run: async (ctx) =>
    write(
      ctx,
      await gatherFacts(ctx.db, ctx.index, ctx.campaign.id, ctx.telling),
      "spine",
      Spine,
      "Write the plot spine for every chapter of the world's road: the marker that finishes the chapter (what must happen, never a deadline), the hook that stays on offer wherever the party is, and the fork points (questions whose answers keep some endings open and close others, with each choice's keepsOpen listing ending ids). Then two or three endings, decided now, each saying when it's reached. Build them from the world's decisive beats and what can happen at them.",
      2500,
    ),
};

/** Chapter detail for the job's chapter (the party's chapter for a new story). */
function chapterStep(chapterFor: (ctx: StepContext, facts: WriterFacts) => number): Step {
  return {
    name: "chapter",
    run: async (ctx) => {
      const facts = await gatherFacts(ctx.db, ctx.index, ctx.campaign.id, ctx.telling);
      const n = chapterFor(ctx, facts);
      const more = ctx.job.kind === "chapter" && ctx.job.key.includes("+");
      return write(
        ctx,
        facts,
        "chapter_detail",
        ChapterDetail,
        [
          `Write chapter ${n} in detail, following on from where the party is and what has happened.`,
          more
            ? "The heroes have used up most of what was prepared for this chapter: write fresh scenes for what is still ahead of them."
            : "",
          `Prepare one scene for each of chapter ${n}'s beats not yet played (its beatId), and one or two extra scenes (beatId null) for where the party might wander. For each: the place id, the situation as the heroes arrive, the scene's question, the people present (cast ids), clues (each also findable in at least one other place, in alsoAt), an encounter (creature ids from the places list) or null, and a temptation (the quick way) or null.`,
        ]
          .filter(Boolean)
          .join(" "),
        2500,
      );
    },
  };
}

function sideQuestStep(task: (ctx: StepContext) => string): Step {
  return {
    name: "side_quests",
    run: async (ctx) =>
      write(
        ctx,
        await gatherFacts(ctx.db, ctx.index, ctx.campaign.id, ctx.telling),
        "side_quests",
        SideQuests,
        `${task(ctx)} Build each from the campaign's own people and places, and say in leadsBack which marker or fork of the spine it leads back to.`,
        1500,
      ),
  };
}

const rework: Step = {
  name: "rework",
  run: async (ctx) => {
    const facts = await gatherFacts(ctx.db, ctx.index, ctx.campaign.id, ctx.telling);
    const seq = Number(ctx.job.key);
    const [turn] = await ctx.db
      .select({ data: turns.data })
      .from(turns)
      .where(and(eq(turns.campaignId, ctx.campaign.id), eq(turns.seq, seq)));
    const told = String((turn?.data.narration as { narration?: string } | undefined)?.narration ?? "").trim();
    return write(
      ctx,
      facts,
      "rework",
      Rework,
      `The DM changed what happened at turn ${seq}. As the DM told it: """${told.replaceAll('"""', "'")}""" Rework the material this touches: list the new facts it makes true, and rewrite chapter ${facts.chapter}'s prepared scenes and the side quests so they agree with it. Keep whatever still fits.`,
      2500,
    );
  },
};

const selfCheck: Step = {
  name: "self_check",
  run: async (ctx): Promise<MaterialParts> => {
    const facts = await gatherFacts(ctx.db, ctx.index, ctx.campaign.id, ctx.telling);
    const parts = partsSoFar(ctx);
    const before =
      ctx.job.attempts > 1 && ctx.job.error ? ` Last time, the checks found: ${ctx.job.error}` : "";
    const answer = (await ctx.ask({
      task: "writer",
      system: system(ctx),
      user: [
        { text: factsText(facts) },
        { text: materialText(facts.material) },
        { text: `## The material this job wrote\n${JSON.stringify(parts)}` },
        {
          text: `## Your task\nCheck the material this job wrote against What has happened, the established facts, the id lists and the rules. Fix anything that contradicts what has happened, uses an id that isn't listed, brings back someone who is gone, prepares a beat already played, leaves a clue findable in only one place, or tells the heroes they are guided or helped along. Return each of the job's parts as it should be published (unchanged where it's fine) and the problems you found.${before}`,
        },
      ],
      schema: selfCheckSchema(parts),
      schemaName: "self_check",
      expectTokens: 6000,
      effort: "high",
    })) as MaterialParts & { problems: string[] };
    const { problems: found, ...answered } = answer;
    if (found.length > 0)
      ctx.log.info("writer self-check fixed", { jobId: ctx.job.id, problems: found.slice(0, 8) });
    // The table kept playing while this was written: what it has played since is no longer needed.
    const checked = withoutPlayed(answered, facts);
    // The engine's own checks: a part that still fails them sends the job round again, with what failed.
    const problems = checkMaterial(ctx.index, facts, checked, ctx.telling.intensity);
    if (problems.length > 0) {
      ctx.log.warn("writer material rejected", { jobId: ctx.job.id, problems: problems.slice(0, 8) });
      throw new StepFailure(
        `its material didn't pass the checks: ${problems.slice(0, 4).join(" ")}`.slice(0, 600),
      );
    }
    return checked;
  },
};

async function publish(
  tx: Parameters<WriterKind["publish"]>[0],
  ctx: StepContext,
  reason: string,
): Promise<void> {
  const parts = ctx.outputs.self_check as MaterialParts;
  const prev = await materialFor(tx, ctx.campaign.id, ctx.campaign.story);
  await publishMaterial(tx, ctx.campaign.id, mergeMaterial(prev, parts, ctx.job.enqueuedSeq), reason);
}

export const bibleKind: WriterKind = {
  kind: "bible",
  minutes: 20,
  label: () => "the story",
  started: (_job, minutes) => ({
    kind: "started",
    text: `📝 Story writer is preparing the story (about ${minutes} min).`,
  }),
  steps: [
    outline,
    bible,
    spine,
    chapterStep((_ctx, facts) => facts.chapter),
    sideQuestStep(() => "Write one to three side quests for the start of the story."),
    selfCheck,
  ],
  publish: async (tx, ctx) => {
    await publish(tx, ctx, "the story");
    return { kind: "ready", text: "✅ The story is ready: its outline, bible, spine and first chapter." };
  },
};

export const chapterKind: WriterKind = {
  kind: "chapter",
  minutes: 10,
  label: (job) =>
    job.key.includes("+") ? `more of chapter ${chapterOf(job.key)}` : `chapter ${chapterOf(job.key)}`,
  started: (job, minutes) => ({
    kind: "started",
    text: `📝 Story writer is preparing ${job.key.includes("+") ? "more of " : ""}chapter ${chapterOf(job.key)} (about ${minutes} min).`,
  }),
  steps: [
    chapterStep((ctx) => chapterOf(ctx.job.key)),
    sideQuestStep((ctx) => `Write one or two side quests for chapter ${chapterOf(ctx.job.key)}.`),
    selfCheck,
  ],
  publish: async (tx, ctx) => {
    const n = chapterOf(ctx.job.key);
    const more = ctx.job.key.includes("+");
    await publish(tx, ctx, more ? `more of chapter ${n}` : `chapter ${n}`);
    return { kind: "ready", text: `✅ ${more ? "More of chapter" : "Chapter"} ${n} is ready.` };
  },
};

export const sideQuestKind: WriterKind = {
  kind: "side_quest",
  minutes: 5,
  label: () => "a side quest",
  started: (_job, minutes) => ({
    kind: "started",
    text: `📝 Story writer is preparing a side quest for where the party went (about ${minutes} min).`,
  }),
  steps: [
    sideQuestStep(
      (ctx) =>
        `The party has gone off course: ${ctx.job.reason}. Write one to three side quests around where they are and where they're heading.`,
    ),
    selfCheck,
  ],
  publish: async (tx, ctx) => {
    await publish(tx, ctx, `side quest: ${ctx.job.reason}`.slice(0, 200));
    return { kind: "ready", text: "✅ A side quest is ready for where the party went." };
  },
};

export const reworkKind: WriterKind = {
  kind: "rework",
  minutes: 5,
  label: (job) => `the rework after turn ${job.key}`,
  started: (job, minutes) => ({
    kind: "started",
    text: `📝 Story writer is reworking what's written to fit the DM's change at turn ${job.key} (about ${minutes} min).`,
  }),
  steps: [rework, selfCheck],
  publish: async (tx, ctx) => {
    await publish(tx, ctx, `rework after turn ${ctx.job.key}`);
    return { kind: "ready", text: `✅ The material now fits the DM's change at turn ${ctx.job.key}.` };
  },
};
