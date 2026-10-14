/**
 * The story planner: at the end of each chapter it looks at what the heroes
 * actually did and tailors the next chapter's scenes to it. It adds notes
 * and supporting characters; it never adds or removes scenes, decides how
 * anything turns out, or touches the decisive moments' rules.
 *
 * It sees only what the table saw (recaps, promises, who likes the heroes),
 * never the hidden hand. Plans live in the spoiler schema.
 */
import type { LlmGateway } from "@dq/core/llm";
import { checkNarration } from "@dq/core/safety";
import type { WorldIndex } from "@dq/core/world";
import { characters, type Db, npcs, promises, quests, storyPlans } from "@dq/db";
import { and, desc, eq } from "drizzle-orm";
import { z } from "zod";
import { chapterRecaps } from "./chronicle";
import type { Logger } from "./deps";
import type { SceneSpec } from "./director";
import { npcAnchor } from "./director";
import type { StoryState } from "./story-state";

export const PlannerOutput = z.object({
  theme: z.string().max(300),
  beats: z
    .array(
      z.object({
        beatId: z.string().max(80),
        note: z.string().max(400),
        callback: z.string().max(240).nullable(),
        featured: z.array(z.string().max(60)).max(3),
      }),
    )
    .max(10),
});
export type PlannerOutput = z.infer<typeof PlannerOutput>;

export interface ChapterPlan {
  chapter: number;
  theme: string;
  beats: Record<string, { note: string; featured: string[] }>;
  source: "planner" | "fallback";
}

const SYSTEM = [
  "You are the story planner for a children's (8+) fantasy adventure. The next chapter's scenes are fixed; your job is to make them feel like they grew out of what these particular heroes did.",
  "For each scene, write a short note for the storyteller: which earlier choices, promises or friendships should echo here, and how. You may feature up to three characters from the list given (use their ids).",
  "Rules: never add or remove scenes, never decide how anything turns out, never hurt or remove a character, and never mention luck, fate, destiny, threads, hidden forces or anything working behind the scenes. Keep it kind, hopeful and age-appropriate.",
].join(" ");

/** Without a story AI, kept and pending promises still come back when the heroes meet that person again. */
export function fallbackPlan(
  index: WorldIndex,
  chapter: number,
  promiseRows: Array<{ npcId: string; text: string; status: string }>,
): ChapterPlan {
  const beats: ChapterPlan["beats"] = {};
  const refs = index.beatOrder.filter((b) => b.chapter.number === chapter);
  for (const ref of refs) {
    const here = promiseRows.filter((p) => index.namedNpcs.get(p.npcId)?.region === ref.beat.region);
    const p = here[0];
    if (!p) continue;
    const name = index.namedNpcs.get(p.npcId)?.name ?? p.npcId;
    beats[ref.beat.id] = {
      note:
        p.status === "kept"
          ? `${name} remembers that the heroes kept their promise ("${p.text}"), and greets them warmly.`
          : p.status === "broken"
            ? `${name} remembers the promise the heroes didn't keep ("${p.text}"), and is a little wary.`
            : `${name} is waiting to see whether the heroes will keep their promise ("${p.text}").`,
      featured: [p.npcId],
    };
  }
  return { chapter, theme: refs[0]?.chapter.summary ?? "", beats, source: "fallback" };
}

export async function planChapter(args: {
  db: Db;
  llm: LlmGateway;
  index: WorldIndex;
  log: Logger;
  campaignId: string;
  guildId: string;
  chapter: number;
  story: StoryState;
  contentLevel: "gentle" | "adventurous";
}): Promise<ChapterPlan | null> {
  const { db, index } = args;
  const refs = index.beatOrder.filter((b) => b.chapter.number === args.chapter && !b.beat.branch);
  if (refs.length === 0) return null;
  const [recaps, promiseRows, npcRows, questRows, party] = await Promise.all([
    chapterRecaps(db, args.campaignId, 8),
    db.select().from(promises).where(eq(promises.campaignId, args.campaignId)),
    db.select().from(npcs).where(eq(npcs.campaignId, args.campaignId)),
    db.select().from(quests).where(eq(quests.campaignId, args.campaignId)),
    db
      .select()
      .from(characters)
      .where(and(eq(characters.campaignId, args.campaignId), eq(characters.status, "active"))),
  ]);
  let plan = fallbackPlan(index, args.chapter, promiseRows);

  const cast = index.world.npcs.named.map(
    (n) => `- ${n.name} [id: ${n.id}]: ${n.role}, in ${index.regions.get(n.region)?.name ?? n.region}`,
  );
  const user = [
    "## The heroes",
    ...party.map(
      (p) =>
        `- ${p.name}: ${index.classes.get(p.classId ?? "")?.name ?? "hero"} on ${index.world.paths.find((x) => x.id === p.pathId)?.name ?? "their own road"}`,
    ),
    "",
    "## The story so far",
    ...(recaps.length > 0 ? recaps.map((r) => `- Chapter ${r.chapter}: ${r.text}`) : ["- (just beginning)"]),
    "",
    "## Promises",
    ...(promiseRows.length > 0
      ? promiseRows.map(
          (p) => `- To ${index.namedNpcs.get(p.npcId)?.name ?? p.npcId}: "${p.text}" (${p.status})`,
        )
      : ["- none"]),
    "",
    "## People the heroes have met",
    ...(npcRows.length > 0
      ? npcRows.map(
          (n) =>
            `- ${n.name}: ${n.status}, feels ${n.disposition > 0 ? "friendly" : n.disposition < 0 ? "wary" : "neutral"} toward the heroes`,
        )
      : ["- nobody special yet"]),
    "",
    "## How the factions feel about the heroes",
    ...Object.entries(args.story.factionDisposition).map(
      ([id, d]) =>
        `- ${index.factions.get(id)?.name ?? id}: ${d > 0 ? "friendly" : d < 0 ? "unfriendly" : "neutral"}`,
    ),
    "",
    "## Quests",
    ...(questRows.length > 0 ? questRows.map((q) => `- ${q.title} (${q.status})`) : ["- none"]),
    "",
    "## Characters you may feature",
    ...cast,
    "",
    `## Chapter ${args.chapter}'s scenes (fixed; write one note per scene)`,
    ...refs.map(
      (r) =>
        `- beat: ${r.beat.id} | ${r.beat.title} (${r.beat.kind}): ${r.beat.summary.replace(/\s+/g, " ")}`,
    ),
  ].join("\n");

  const res = await args.llm.structured(
    {
      task: "director",
      system: [{ text: SYSTEM, cache: "1h" }],
      user: [{ text: user }],
      schema: PlannerOutput,
      schemaName: "chapter_plan",
      maxOutputTokens: 4000,
      effort: "high",
    },
    { guildId: args.guildId, campaignId: args.campaignId },
  );
  if (res.ok) {
    const beatIds = new Set(refs.map((r) => r.beat.id));
    const away = new Set(
      npcRows.filter((n) => ["fled", "captured", "defeated", "away"].includes(n.status)).map((n) => n.id),
    );
    const safe = (t: string) => checkNarration(t, index.world, { contentLevel: args.contentLevel }).ok;
    const beats: ChapterPlan["beats"] = { ...plan.beats };
    let rejected = 0;
    for (const b of res.value.beats) {
      if (!beatIds.has(b.beatId)) continue;
      const note = [b.note, b.callback].filter(Boolean).join(" ").trim();
      if (!note || !safe(note)) {
        rejected++;
        continue;
      }
      beats[b.beatId] = {
        note,
        featured: b.featured.filter((id) => index.namedNpcs.has(id) && !away.has(id)).slice(0, 3),
      };
    }
    if (rejected > 0) args.log.warn("planner notes rejected", { rejected });
    plan = {
      chapter: args.chapter,
      theme: safe(res.value.theme) ? res.value.theme : plan.theme,
      beats,
      source: "planner",
    };
  }

  const [last] = await db
    .select({ version: storyPlans.version })
    .from(storyPlans)
    .where(eq(storyPlans.campaignId, args.campaignId))
    .orderBy(desc(storyPlans.version))
    .limit(1);
  await db.insert(storyPlans).values({
    campaignId: args.campaignId,
    version: (last?.version ?? 0) + 1,
    plan: plan as unknown as Record<string, unknown>,
    reason: `chapter ${args.chapter}`,
    createdBy: "director",
  });
  return plan;
}

export async function latestPlan(db: Db, campaignId: string): Promise<ChapterPlan | null> {
  const [row] = await db
    .select()
    .from(storyPlans)
    .where(eq(storyPlans.campaignId, campaignId))
    .orderBy(desc(storyPlans.version))
    .limit(1);
  return (row?.plan as unknown as ChapterPlan | undefined) ?? null;
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
