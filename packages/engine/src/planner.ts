/**
 * The story planner: it looks at what the heroes actually did and tailors a
 * chapter's scenes to it. It adds notes and supporting characters; it never
 * adds or removes scenes, decides how anything turns out, or touches the
 * decisive moments' rules. The story writer runs it ahead of the table
 * (story-writer/chapter-plan.ts); turns only read the plans.
 *
 * It sees only what the table saw (recaps, promises, who likes the heroes),
 * never the hidden hand. Plans live in the spoiler schema.
 */
import { audienceLine, contentRulesText, type NarrationStory, tableWishesText } from "@dq/core/narration";
import { checkNarration } from "@dq/core/safety";
import type { WorldIndex } from "@dq/core/world";
import { characters, type Db, npcs, promises, quests, storyPlans } from "@dq/db";
import { and, desc, eq, sql } from "drizzle-orm";
import { z } from "zod";
import { chapterRecaps } from "./chronicle";
import type { SceneSpec } from "./director";
import { npcAnchor } from "./director";
import { isRewound, type StoryState } from "./story-state";

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
  /** Who wrote it. Plans from before the story writer may say "planner" or "fallback". */
  source: "writer" | "planner" | "fallback";
  /** The campaign's turn when it was asked for: a rewind past it sets the plan aside. */
  seq?: number;
}

/** The schema's limits, which services that enforce the shape don't pass on to the model. */
const PLAN_LENGTHS =
  "Lengths: the theme under 300 characters, each note under 400, each callback under 240, and at most three characters featured per scene.";

export function plannerSystem(world: WorldIndex["world"], story: NarrationStory): string {
  const wishes = tableWishesText(story);
  return [
    `You are the story planner for ${audienceLine(story.intensity)}. The next chapter's scenes are fixed; your job is to make them feel like they grew out of what these particular heroes did.`,
    "For each scene, write a short note for the storyteller: which earlier choices, promises or friendships should echo here, and how. You may feature up to three characters from the list given (use their ids).",
    "Rules: never add or remove scenes, never decide how anything turns out, never remove a character, and never mention luck, fate, destiny, threads, hidden forces or anything working behind the scenes.",
    PLAN_LENGTHS,
    "",
    ...contentRulesText(world, story.intensity),
    ...(wishes.length > 0 ? ["", ...wishes] : []),
  ].join("\n");
}

/** What the planner knows about a campaign when it plans a chapter: only what the table saw. */
export interface PlanFacts {
  chapter: number;
  heroes: string[];
  story: string[];
  promises: string[];
  met: string[];
  factions: string[];
  quests: string[];
  cast: string[];
  scenes: string[];
  beatIds: string[];
  /** People the heroes met who have fled, been captured or gone away: never featured. */
  away: string[];
}

/** Gathers what the planner needs for a chapter, or null if the world has no such chapter. */
export async function gatherPlanFacts(
  db: Db,
  index: WorldIndex,
  campaignId: string,
  chapter: number,
  story: StoryState,
): Promise<PlanFacts | null> {
  const refs = index.beatOrder.filter((b) => b.chapter.number === chapter && !b.beat.branch);
  if (refs.length === 0) return null;
  const [recaps, promiseRows, npcRows, questRows, party] = await Promise.all([
    chapterRecaps(db, campaignId, 8),
    db.select().from(promises).where(eq(promises.campaignId, campaignId)),
    db.select().from(npcs).where(eq(npcs.campaignId, campaignId)),
    db.select().from(quests).where(eq(quests.campaignId, campaignId)),
    db
      .select()
      .from(characters)
      .where(and(eq(characters.campaignId, campaignId), eq(characters.status, "active"))),
  ]);
  return {
    chapter,
    heroes: party.map(
      (p) =>
        `${p.name}: ${index.classes.get(p.classId ?? "")?.name ?? "hero"} on ${index.world.paths.find((x) => x.id === p.pathId)?.name ?? "their own road"}`,
    ),
    story: recaps.map((r) => `Chapter ${r.chapter}: ${r.text}`),
    promises: promiseRows.map(
      (p) => `To ${index.namedNpcs.get(p.npcId)?.name ?? p.npcId}: "${p.text}" (${p.status})`,
    ),
    met: npcRows.map(
      (n) =>
        `${n.name}: ${n.status}, feels ${n.disposition > 0 ? "friendly" : n.disposition < 0 ? "wary" : "neutral"} toward the heroes`,
    ),
    factions: Object.entries(story.factionDisposition).map(
      ([id, d]) =>
        `${index.factions.get(id)?.name ?? id}: ${d > 0 ? "friendly" : d < 0 ? "unfriendly" : "neutral"}`,
    ),
    quests: questRows.map((q) => `${q.title} (${q.status})`),
    cast: index.world.npcs.named.map(
      (n) => `${n.name} [id: ${n.id}]: ${n.role}, in ${index.regions.get(n.region)?.name ?? n.region}`,
    ),
    scenes: refs.map(
      (r) => `beat: ${r.beat.id} | ${r.beat.title} (${r.beat.kind}): ${r.beat.summary.replace(/\s+/g, " ")}`,
    ),
    beatIds: refs.map((r) => r.beat.id),
    away: npcRows.filter((n) => ["fled", "captured", "defeated", "away"].includes(n.status)).map((n) => n.id),
  };
}

export function planFactsText(f: PlanFacts): string {
  const list = (items: string[], none: string) => (items.length > 0 ? items : [none]).map((x) => `- ${x}`);
  return [
    "## The heroes",
    ...list(f.heroes, "(none yet)"),
    "",
    "## The story so far",
    ...list(f.story, "(just beginning)"),
    "",
    "## Promises",
    ...list(f.promises, "none"),
    "",
    "## People the heroes have met",
    ...list(f.met, "nobody special yet"),
    "",
    "## How the factions feel about the heroes",
    ...list(f.factions, "nobody has made up their mind yet"),
    "",
    "## Quests",
    ...list(f.quests, "none"),
    "",
    "## Characters you may feature",
    ...f.cast.map((x) => `- ${x}`),
    "",
    `## Chapter ${f.chapter}'s scenes (fixed; write one note per scene)`,
    ...f.scenes.map((x) => `- ${x}`),
  ].join("\n");
}

/** The second pass: the editor checks the planner's draft against what's happened and the rules. */
export function plannerReviseSystem(world: WorldIndex["world"], story: NarrationStory): string {
  const wishes = tableWishesText(story);
  return [
    `You are the story editor for ${audienceLine(story.intensity)}. The story planner has drafted notes for the next chapter's scenes; you return the finished plan.`,
    "Keep what is good. Fix: anything that contradicts what has happened (who the heroes met, what they promised, how people feel about them), characters featured who aren't on the list or have fled, been captured or gone away, notes that decide how a scene turns out, and anything that mentions luck, fate, destiny, threads, hidden forces or anything working behind the scenes.",
    "One note per scene, short and concrete enough for a storyteller to use in the moment. Feature characters by id.",
    PLAN_LENGTHS,
    "",
    ...contentRulesText(world, story.intensity),
    ...(wishes.length > 0 ? ["", ...wishes] : []),
  ].join("\n");
}

/**
 * Keeps the notes that pass every check: a scene of this chapter, the content rules, and featured characters
 * who exist and haven't gone away. Says how many were turned back.
 */
export function checkPlan(
  index: WorldIndex,
  facts: PlanFacts,
  output: PlannerOutput,
  intensity: NarrationStory["intensity"],
): { theme: string; beats: ChapterPlan["beats"]; rejected: number } {
  const beatIds = new Set(facts.beatIds);
  const away = new Set(facts.away);
  const safe = (t: string) => checkNarration(t, index.world, { intensity }).ok;
  const beats: ChapterPlan["beats"] = {};
  let rejected = 0;
  for (const b of output.beats) {
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
  return { theme: safe(output.theme) ? output.theme : "", beats, rejected };
}

/**
 * The plan for a chapter: its newest version, unless a rewind undid the turn it was written for. Plans are
 * written ahead, so the newest plan overall may be for a later chapter.
 */
export async function planFor(
  db: Db,
  campaignId: string,
  chapter: number,
  story: unknown,
): Promise<ChapterPlan | null> {
  const rows = await db
    .select({ plan: storyPlans.plan })
    .from(storyPlans)
    .where(
      and(eq(storyPlans.campaignId, campaignId), sql`(${storyPlans.plan}->>'chapter')::int = ${chapter}`),
    )
    .orderBy(desc(storyPlans.version))
    .limit(5);
  for (const row of rows) {
    const plan = row.plan as unknown as ChapterPlan;
    if (typeof plan.seq === "number" && isRewound(story, plan.seq)) continue;
    return plan;
  }
  return null;
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
