/**
 * The story writer's material: the outline, the story bible, the plot spine, each chapter in detail, and side
 * quests. Written ahead of the table, checked before it's published (ids, the content rules, and nothing that
 * contradicts what has already happened), and kept in the spoiler schema as a story plan. Players never see it.
 */
import { audienceLine, contentRulesText, type NarrationStory, tableWishesText } from "@dq/core/narration";
import { checkNarration } from "@dq/core/safety";
import type { WorldIndex } from "@dq/core/world";
import {
  campaigns,
  characters,
  type DbOrTx,
  inventoryItems,
  npcs,
  promises,
  quests,
  storyPlans,
} from "@dq/db";
import { and, desc, eq, inArray, sql } from "drizzle-orm";
import { z } from "zod";
import { chapterRecaps, chapterTurns, fitTurns } from "../chronicle";
import type { SceneSpec } from "../director";
import { npcAnchor } from "../director";
import { asStory, isRewound } from "../story-state";

// ---------------------------------------------------------------- the shapes the writer answers in

export const Outline = z.object({
  pitch: z.string(),
  shape: z.string(),
  stakes: z.string(),
  villain: z.object({ name: z.string(), want: z.string() }),
  chapters: z.array(z.object({ number: z.number().int(), title: z.string(), purpose: z.string() })),
});
export type Outline = z.infer<typeof Outline>;

const CastMember = z.object({
  id: z.string(),
  name: z.string(),
  role: z.string(),
  pronouns: z.string(),
  personality: z.string(),
  wants: z.string(),
  secret: z.string(),
  voice: z.string(),
});

export const Bible = z.object({
  places: z.array(z.object({ id: z.string(), now: z.string(), routes: z.array(z.string()) })),
  factions: z.array(z.object({ id: z.string(), wants: z.string(), towardHeroes: z.string() })),
  cast: z.array(CastMember),
  facts: z.array(z.string()),
});
export type Bible = z.infer<typeof Bible>;

export const Spine = z.object({
  chapters: z.array(
    z.object({
      number: z.number().int(),
      marker: z.string(),
      hook: z.string(),
      forks: z.array(
        z.object({
          id: z.string(),
          question: z.string(),
          options: z.array(z.object({ choice: z.string(), keepsOpen: z.array(z.string()) })),
        }),
      ),
    }),
  ),
  endings: z.array(
    z.object({ id: z.string(), title: z.string(), summary: z.string(), reachedWhen: z.string() }),
  ),
});
export type Spine = z.infer<typeof Spine>;

const PreparedScene = z.object({
  beatId: z.string().nullable(),
  place: z.string(),
  situation: z.string(),
  question: z.string(),
  people: z.array(z.string()),
  clues: z.array(z.object({ text: z.string(), alsoAt: z.array(z.string()) })),
  encounter: z.array(z.string()).nullable(),
  temptation: z.string().nullable(),
});
export type PreparedScene = z.infer<typeof PreparedScene>;

export const ChapterDetail = z.object({ chapter: z.number().int(), scenes: z.array(PreparedScene) });
export type ChapterDetail = z.infer<typeof ChapterDetail>;

const SideQuest = z.object({
  id: z.string(),
  title: z.string(),
  place: z.string(),
  people: z.array(z.string()),
  hook: z.string(),
  complication: z.string(),
  payoff: z.string(),
  leadsBack: z.string(),
});
export type SideQuest = z.infer<typeof SideQuest>;

export const SideQuests = z.object({ sideQuests: z.array(SideQuest) });

/** What a DM's change means for the material: facts to add, and the current chapter and side quests rewritten. */
export const Rework = z.object({
  facts: z.array(z.string()),
  chapter: ChapterDetail,
  sideQuests: z.array(SideQuest),
});

/** The parts of the material one job writes. */
export interface MaterialParts {
  outline?: Outline;
  bible?: Bible;
  spine?: Spine;
  chapter?: ChapterDetail;
  sideQuests?: SideQuest[];
  /** Facts a rework adds to the bible. */
  facts?: string[];
}

/** The self-check's answer: what it found, and the job's parts as they should be published. */
export function selfCheckSchema(parts: MaterialParts) {
  return z.object({
    problems: z.array(z.string()),
    ...(parts.outline ? { outline: Outline } : {}),
    ...(parts.bible ? { bible: Bible } : {}),
    ...(parts.spine ? { spine: Spine } : {}),
    ...(parts.chapter ? { chapter: ChapterDetail } : {}),
    ...(parts.sideQuests ? { sideQuests: z.array(SideQuest) } : {}),
    ...(parts.facts ? { facts: z.array(z.string()) } : {}),
  });
}

/** The whole of a campaign's material, as published. */
export interface StoryMaterial {
  kind: "story";
  ready: true;
  source: "writer";
  /** The campaign's turn when the job that published this version was queued. */
  seq: number;
  outline: Outline | null;
  bible: Bible | null;
  spine: Spine | null;
  chapters: Record<string, ChapterDetail>;
  sideQuests: SideQuest[];
}

// ---------------------------------------------------------------- what the writer knows

/** What has happened in a campaign, as the writer is told it: only what the table saw. */
export interface WriterFacts {
  /** The chapter the party is in. */
  chapter: number;
  completedBeats: string[];
  /** Where the party is now. */
  place: string;
  premise: string;
  heroes: string[];
  /** Recaps of finished chapters. */
  story: string[];
  /** Every turn told so far in the chapter the party is in. */
  thisChapter: string[];
  people: string[];
  promises: string[];
  quests: string[];
  /** People who have fled, been captured, been beaten or gone away: never written in as present. */
  away: string[];
  material: StoryMaterial | null;
}

/** About how much of the current chapter's telling the writer reads, in characters. */
const CHAPTER_CHARS = 24_000;

export async function gatherFacts(
  db: DbOrTx,
  index: WorldIndex,
  campaignId: string,
  telling: NarrationStory,
): Promise<WriterFacts> {
  const [c] = await db.select().from(campaigns).where(eq(campaigns.id, campaignId));
  if (!c) throw new Error("no campaign");
  const story = asStory(c.story);
  const chapter = currentChapter(index, story.completedBeats);
  const party = await db
    .select()
    .from(characters)
    .where(and(eq(characters.campaignId, campaignId), eq(characters.status, "active")));
  const items = party.length
    ? await db
        .select()
        .from(inventoryItems)
        .where(
          inArray(
            inventoryItems.characterId,
            party.map((p) => p.id),
          ),
        )
    : [];
  const recaps = await chapterRecaps(db, campaignId, 8);
  const told = (await chapterTurns(db, c, chapter, c.turnSeq)) ?? [];
  const npcRows = await db.select().from(npcs).where(eq(npcs.campaignId, campaignId));
  const promiseRows = await db.select().from(promises).where(eq(promises.campaignId, campaignId));
  const questRows = await db.select().from(quests).where(eq(quests.campaignId, campaignId));
  const material = await materialFor(db, campaignId, c.story);
  return {
    chapter,
    completedBeats: story.completedBeats,
    place: story.poiId ?? story.regionId,
    premise: telling.premise,
    heroes: party.map((p) => {
      const carries = items
        .filter((i) => i.characterId === p.id)
        .map((i) => `${index.items.get(i.itemId)?.name ?? i.itemId}${i.qty > 1 ? ` ×${i.qty}` : ""}`);
      return [
        `${p.name}: level ${p.level} ${index.species.get(p.speciesId ?? "")?.name ?? ""} ${index.classes.get(p.classId ?? "")?.name ?? "hero"}`.replace(
          /\s+/g,
          " ",
        ),
        index.backgrounds.get(p.backgroundId ?? "")?.name,
        `on ${index.world.paths.find((x) => x.id === p.pathId)?.name ?? "their own road"}`,
        `keepsake: ${index.world.items.keepsakes.find((k) => k.id === p.keepsakeId)?.name ?? "none"}`,
        carries.length ? `carries ${carries.join(", ")}` : null,
        p.look ? `looks: ${p.look}` : null,
      ]
        .filter(Boolean)
        .join("; ");
    }),
    story: recaps.map((r) => `Chapter ${r.chapter}: ${r.text}`),
    thisChapter: fitTurns(told, CHAPTER_CHARS),
    people: npcRows.map(
      (n) =>
        `${n.name} [${n.id}]: ${n.status}, ${n.disposition > 0 ? "friendly" : n.disposition < 0 ? "wary" : "neutral"} toward the heroes`,
    ),
    promises: promiseRows.map(
      (p) => `To ${index.namedNpcs.get(p.npcId)?.name ?? p.npcId}: "${p.text}" (${p.status})`,
    ),
    quests: questRows.map((q) => `${q.title} (${q.status}): ${q.objective}`),
    away: npcRows.filter((n) => AWAY.has(n.status)).map((n) => n.id),
    material,
  };
}

const AWAY = new Set(["fled", "captured", "defeated", "away"]);

/** The chapter of the first beat not yet played, or the last chapter when every beat is done. */
export function currentChapter(index: WorldIndex, completed: readonly string[]): number {
  const done = new Set(completed);
  const next = index.beatOrder.find((b) => !b.beat.branch && !done.has(b.beat.id));
  return next?.chapter.number ?? index.beatOrder.at(-1)?.chapter.number ?? 1;
}

/** The world as the writer may use it: its chapters, places and routes, people, factions and creatures, by id. */
export function worldText(index: WorldIndex): string {
  const lines: string[] = ["## The world's chapters (the story's road; keep their numbers and order)"];
  for (const act of [...index.world.acts].sort((a, b) => a.number - b.number)) {
    for (const ch of [...act.chapters].sort((a, b) => a.number - b.number)) {
      lines.push(`### Chapter ${ch.number}: ${ch.title}. ${ch.summary.replace(/\s+/g, " ")}`);
      for (const b of ch.beats) {
        const marks = [b.milestone ? "marker" : "", b.decisive ? "decisive" : "", b.branch ? "branch" : ""]
          .filter(Boolean)
          .join(", ");
        lines.push(
          `- beat: ${b.id} | ${b.title} (${b.kind}${marks ? `; ${marks}` : ""}) at ${b.poi ?? b.region}: ${b.summary.replace(/\s+/g, " ")} Goals: ${b.goals.join(" ")}`,
        );
        if (b.crux)
          lines.push(
            `  - if it goes well: ${b.crux.onSuccess.replace(/\s+/g, " ")}`,
            `  - if it costs them: ${b.crux.onCostlySuccess.replace(/\s+/g, " ")}`,
            `  - if it falls short: ${b.crux.onFailForward.text.replace(/\s+/g, " ")}`,
          );
      }
    }
  }
  lines.push("", "## Places (use these ids)");
  for (const r of index.world.regions) {
    const creatures = r.encounters.table.map((e) => e.creature);
    lines.push(
      `- place: ${r.id} | ${r.name}: ${r.description.replace(/\s+/g, " ")} Routes to: ${r.edges.map((e) => e.to).join(", ") || "none"}.${creatures.length ? ` Creatures here: ${[...new Set(creatures)].join(", ")}.` : ""}`,
    );
    for (const p of r.pois)
      lines.push(`  - place: ${p.id} | ${p.name} (in ${r.name}): ${p.description.replace(/\s+/g, " ")}`);
  }
  lines.push("", "## People of the world (use these ids; new people get ids starting with new-)");
  for (const n of index.world.npcs.named)
    lines.push(
      `- person: ${n.id} | ${n.name}: ${n.role}, in ${index.regions.get(n.region)?.name ?? n.region}`,
    );
  lines.push("", "## Factions (use these ids)");
  for (const f of index.world.factions)
    lines.push(`- faction: ${f.id} | ${f.name}: ${f.description.replace(/\s+/g, " ")}`);
  return lines.join("\n");
}

export function factsText(f: WriterFacts): string {
  const list = (items: string[], none: string) => (items.length > 0 ? items : [none]).map((x) => `- ${x}`);
  return [
    "## The heroes",
    ...list(f.heroes, "(still being made)"),
    "",
    "## The story this table hoped for",
    f.premise ? `"""${f.premise.replaceAll('"""', "'")}"""` : "(no premise given)",
    "",
    "## What has happened: earlier chapters",
    ...list(f.story, "(nothing yet: the story is just beginning)"),
    "",
    `## What has happened: chapter ${f.chapter} so far, turn by turn`,
    ...list(f.thisChapter, "(nothing yet)"),
    "",
    "## People the heroes have met",
    ...list(f.people, "nobody yet"),
    "",
    "## Promises",
    ...list(f.promises, "none"),
    "",
    "## Quests",
    ...list(f.quests, "none"),
    "",
    "## Where the party is",
    `- Chapter ${f.chapter}, at ${f.place}. Beats already played: ${f.completedBeats.join(", ") || "none"}.`,
    ...(f.away.length ? [`- Gone from the story for now (never present): ${f.away.join(", ")}.`] : []),
  ].join("\n");
}

/** The material written so far, for the writer to build on. */
export function materialText(m: StoryMaterial | null, parts: MaterialParts = {}): string {
  const merged = {
    outline: parts.outline ?? m?.outline ?? null,
    bible: parts.bible ?? m?.bible ?? null,
    spine: parts.spine ?? m?.spine ?? null,
    chapters: {
      ...(m?.chapters ?? {}),
      ...(parts.chapter ? { [parts.chapter.chapter]: parts.chapter } : {}),
    },
    sideQuests: [...(m?.sideQuests ?? []), ...(parts.sideQuests ?? [])],
  };
  if (!merged.outline && !merged.bible && !merged.spine && Object.keys(merged.chapters).length === 0)
    return "## The material written so far\n(none yet)";
  return `## The material written so far\n${JSON.stringify(merged, null, 1)}`;
}

/** Lengths the schemas don't carry, since not every service passes schema limits to its model. */
const LENGTHS =
  "Keep it tight: each text field a sentence or two, under 300 characters; at most 8 new people; at most 6 prepared scenes per chapter and 3 side quests.";

export function writerSystem(world: WorldIndex["world"], story: NarrationStory): string {
  const wishes = tableWishesText(story);
  return [
    `You are the story writer for ${audienceLine(story.intensity)}. You write ahead of the table, in the background, so the storyteller always has material ready: the outline, the story bible, the plot spine, each chapter in detail, and side quests.`,
    "Everything you write must agree with what has happened at the table. Never undo it, repeat it as if it hadn't happened, or bring back someone who is gone. Build on where the heroes actually are and what they actually did.",
    "Use ids only from the lists you're given (places, people, factions, beats, creatures). New people get ids that start with new-.",
    "The spine is set now: a marker for each chapter (what must happen to finish it, with no clock), a hook that stays on offer wherever the party is, fork points whose answers decide which endings stay open, and two or three endings decided up front. Side quests are welcome and always lead back.",
    "Never write a game mechanic, number or rule into the story, and never let the heroes learn they are guided, watched over or helped along their path: that is kept for the epilogue at the very end. The world's sense of fate is its own to speak of.",
    LENGTHS,
    "",
    ...contentRulesText(world, story.intensity),
    ...(wishes.length > 0 ? ["", ...wishes] : []),
  ].join("\n");
}

// ---------------------------------------------------------------- the checks before anything is published

/**
 * Leaves out what the table has played since the job began: prepared scenes for beats already played, and a chapter
 * the party has already finished. That's no contradiction, just material that's no longer needed.
 */
export function withoutPlayed(parts: MaterialParts, facts: WriterFacts): MaterialParts {
  if (!parts.chapter) return parts;
  const done = new Set(facts.completedBeats);
  const scenes = parts.chapter.scenes.filter((sc) => sc.beatId === null || !done.has(sc.beatId));
  const { chapter, ...rest } = parts;
  if (chapter.chapter < facts.chapter || !scenes.some((sc) => sc.beatId !== null)) return rest;
  return { ...rest, chapter: { ...chapter, scenes } };
}

/**
 * Everything the engine checks before material is published: every id is real, every text passes the content
 * rules, and nothing contradicts what has happened (people who are gone aren't written in, beats already played
 * aren't prepared again, no chapter already finished is written). Empty when it passes.
 */
export function checkMaterial(
  index: WorldIndex,
  facts: WriterFacts,
  parts: MaterialParts,
  intensity: NarrationStory["intensity"],
): string[] {
  const problems: string[] = [];
  const isPlace = (id: string) => index.regions.has(id) || index.pois.has(id);
  const chapters = new Set(index.beatOrder.map((b) => b.chapter.number));
  const cast = new Set([
    ...index.namedNpcs.keys(),
    ...(parts.bible?.cast ?? facts.material?.bible?.cast ?? []).map((c) => c.id),
  ]);
  const away = new Set(facts.away);
  const done = new Set(facts.completedBeats);
  const place = (id: string, where: string) => {
    if (!isPlace(id)) problems.push(`${where} uses "${id}", which isn't a place in this world.`);
  };
  const person = (id: string, where: string) => {
    if (!cast.has(id)) problems.push(`${where} has "${id}", who isn't in the cast.`);
    else if (away.has(id)) problems.push(`${where} has ${id}, who is gone from the story right now.`);
  };
  const texts: Array<[string, string]> = [];

  if (parts.outline) {
    const o = parts.outline;
    texts.push(["the outline", [o.pitch, o.shape, o.stakes, o.villain.name, o.villain.want].join(" ")]);
    for (const ch of o.chapters) {
      if (!chapters.has(ch.number))
        problems.push(`The outline has a chapter ${ch.number}, which this world doesn't.`);
      texts.push([`the outline's chapter ${ch.number}`, `${ch.title}. ${ch.purpose}`]);
    }
  }
  if (parts.bible) {
    const b = parts.bible;
    for (const p of b.places) {
      place(p.id, "The bible");
      for (const r of p.routes) place(r, `The bible's routes from ${p.id}`);
      texts.push([`the bible's ${p.id}`, p.now]);
    }
    for (const f of b.factions) {
      if (!index.factions.has(f.id))
        problems.push(`The bible has "${f.id}", which isn't a faction in this world.`);
      texts.push([`the bible's ${f.id}`, `${f.wants} ${f.towardHeroes}`]);
    }
    const ids = new Set<string>();
    for (const c of b.cast) {
      if (ids.has(c.id)) problems.push(`The cast lists ${c.id} twice.`);
      ids.add(c.id);
      if (!index.namedNpcs.has(c.id) && !c.id.startsWith("new-"))
        problems.push(`The cast has "${c.id}": a new person's id must start with new-.`);
      texts.push([
        `the cast's ${c.id}`,
        [c.name, c.role, c.personality, c.wants, c.secret, c.voice].join(" "),
      ]);
    }
    for (const fact of b.facts) texts.push(["the bible's facts", fact]);
  }
  if (parts.spine) {
    const s = parts.spine;
    const endings = new Set(s.endings.map((e) => e.id));
    if (s.endings.length < 2 || s.endings.length > 3)
      problems.push(`The spine has ${s.endings.length} endings; it needs two or three, decided now.`);
    for (const ch of s.chapters) {
      if (!chapters.has(ch.number))
        problems.push(`The spine has a chapter ${ch.number}, which this world doesn't.`);
      texts.push([`the spine's chapter ${ch.number}`, `${ch.marker} ${ch.hook}`]);
      for (const fork of ch.forks) {
        texts.push([`the fork ${fork.id}`, fork.question]);
        for (const o of fork.options) {
          texts.push([`the fork ${fork.id}`, o.choice]);
          for (const e of o.keepsOpen)
            if (!endings.has(e))
              problems.push(`The fork ${fork.id} points to "${e}", which isn't one of the endings.`);
        }
      }
    }
    for (const e of s.endings)
      texts.push([`the ending ${e.id}`, `${e.title}. ${e.summary} ${e.reachedWhen}`]);
  }
  if (parts.chapter) {
    const ch = parts.chapter;
    const beatsHere = new Set(
      index.beatOrder.filter((b) => b.chapter.number === ch.chapter).map((b) => b.beat.id),
    );
    if (!chapters.has(ch.chapter)) problems.push(`Chapter ${ch.chapter} doesn't exist in this world.`);
    else if (ch.chapter < facts.chapter)
      problems.push(`Chapter ${ch.chapter} is already finished; the party is in chapter ${facts.chapter}.`);
    if (ch.scenes.length === 0) problems.push(`Chapter ${ch.chapter} has no prepared scenes.`);
    ch.scenes.forEach((sc, i) => {
      const where = `Scene ${i + 1} of chapter ${ch.chapter}`;
      if (sc.beatId !== null && !beatsHere.has(sc.beatId))
        problems.push(`${where} is for "${sc.beatId}", which isn't a beat of chapter ${ch.chapter}.`);
      else if (sc.beatId !== null && done.has(sc.beatId))
        problems.push(`${where} prepares ${sc.beatId}, which the heroes have already played.`);
      place(sc.place, where);
      for (const p of sc.people) person(p, where);
      for (const clue of sc.clues) {
        if (clue.alsoAt.length === 0)
          problems.push(`${where} has a clue found in only one place; every clue needs at least two.`);
        for (const a of clue.alsoAt) place(a, `${where}'s clue`);
        texts.push([where, clue.text]);
      }
      for (const cr of sc.encounter ?? [])
        if (!index.creatures.has(cr))
          problems.push(`${where} has "${cr}", which isn't a creature in this world.`);
      texts.push([where, [sc.situation, sc.question, sc.temptation ?? ""].join(" ")]);
    });
  }
  for (const q of parts.sideQuests ?? []) {
    const where = `The side quest ${q.id}`;
    place(q.place, where);
    for (const p of q.people) person(p, where);
    texts.push([where, [q.title, q.hook, q.complication, q.payoff, q.leadsBack].join(" ")]);
  }
  for (const fact of parts.facts ?? []) texts.push(["a new fact", fact]);

  for (const [where, text] of texts) {
    const verdict = checkNarration(text, index.world, { intensity });
    if (!verdict.ok)
      problems.push(
        `${capital(where)} breaks the content rules (${verdict.findings
          .map((f) => f.match ?? f.category)
          .join(", ")
          .slice(0, 120)}).`,
      );
  }
  return problems;
}

function capital(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

// ---------------------------------------------------------------- publishing and reading

/** The new version of the material: the latest one with this job's parts written in. Facts are only ever added. */
export function mergeMaterial(prev: StoryMaterial | null, parts: MaterialParts, seq: number): StoryMaterial {
  const bible = parts.bible ?? prev?.bible ?? null;
  const facts = [
    ...new Set([...(prev?.bible?.facts ?? []), ...(parts.bible?.facts ?? []), ...(parts.facts ?? [])]),
  ];
  return {
    kind: "story",
    ready: true,
    source: "writer",
    seq,
    outline: parts.outline ?? prev?.outline ?? null,
    bible: bible ? { ...bible, facts } : facts.length ? { places: [], factions: [], cast: [], facts } : null,
    spine: parts.spine ?? prev?.spine ?? null,
    chapters: {
      ...(prev?.chapters ?? {}),
      ...(parts.chapter ? { [String(parts.chapter.chapter)]: parts.chapter } : {}),
    },
    sideQuests: mergeSideQuests(prev?.sideQuests ?? [], parts.sideQuests ?? []),
  };
}

function mergeSideQuests(prev: SideQuest[], added: SideQuest[]): SideQuest[] {
  const byId = new Map(prev.map((q) => [q.id, q]));
  for (const q of added) byId.set(q.id, q);
  return [...byId.values()];
}

/** Writes a new version of the campaign's story plan holding the material. */
export async function publishMaterial(
  tx: DbOrTx,
  campaignId: string,
  material: StoryMaterial,
  reason: string,
): Promise<void> {
  const [last] = await tx
    .select({ version: storyPlans.version })
    .from(storyPlans)
    .where(eq(storyPlans.campaignId, campaignId))
    .orderBy(desc(storyPlans.version))
    .limit(1);
  await tx.insert(storyPlans).values({
    campaignId,
    version: (last?.version ?? 0) + 1,
    plan: material as unknown as Record<string, unknown>,
    reason,
    createdBy: "writer",
  });
}

/** The campaign's newest material, unless a rewind undid the turn it was written for. */
export async function materialFor(
  db: DbOrTx,
  campaignId: string,
  story: unknown,
): Promise<StoryMaterial | null> {
  const rows = await db
    .select({ plan: storyPlans.plan })
    .from(storyPlans)
    .where(and(eq(storyPlans.campaignId, campaignId), sql`${storyPlans.plan}->>'kind' = 'story'`))
    .orderBy(desc(storyPlans.version))
    .limit(10);
  for (const row of rows) {
    const m = row.plan as unknown as StoryMaterial;
    if (!isRewound(story, m.seq)) return m;
  }
  return null;
}

/** The prepared scene for a scene of the world's road, by its beat or, failing that, its place. */
export function preparedScene(
  m: StoryMaterial | null,
  spec: Pick<SceneSpec, "beatId" | "chapterNumber" | "regionId" | "poiId">,
) {
  const scenes = m?.chapters[String(spec.chapterNumber)]?.scenes ?? [];
  return (
    scenes.find((s) => spec.beatId !== null && s.beatId === spec.beatId) ??
    scenes.find((s) => s.beatId === null && (s.place === spec.poiId || s.place === spec.regionId)) ??
    null
  );
}

/**
 * Whether anything is prepared at a place: a prepared scene, a clue or a side quest there, or at the region it's in
 * (or at a place within it, when it's a region).
 */
export function coversPlace(index: WorldIndex, m: StoryMaterial, place: string): boolean {
  const regionOf = (id: string) => index.pois.get(id)?.regionId ?? (index.regions.has(id) ? id : null);
  const here = regionOf(place);
  const places = [
    ...Object.values(m.chapters).flatMap((ch) =>
      ch.scenes.flatMap((sc) => [sc.place, ...sc.clues.flatMap((c) => c.alsoAt)]),
    ),
    ...m.sideQuests.map((q) => q.place),
  ];
  return places.some((p) => p === place || (here !== null && regionOf(p) === here));
}

/**
 * Brings the writer's prepared scene into a scene of the world's road: the storyteller gets it as the scene's note,
 * and the world's people it names are there.
 */
export function applyMaterial(index: WorldIndex, spec: SceneSpec, m: StoryMaterial | null): SceneSpec {
  const sc = preparedScene(m, spec);
  if (!sc) return spec;
  const cast = new Map((m?.bible?.cast ?? []).map((c) => [c.id, c]));
  const nameOf = (id: string) => cast.get(id)?.name ?? index.namedNpcs.get(id)?.name ?? id;
  const placeName = (id: string) => index.pois.get(id)?.poi.name ?? index.regions.get(id)?.name ?? id;
  const entities = [...spec.entities];
  for (const id of sc.people) {
    if (!index.namedNpcs.has(id) || entities.some((e) => e.ref.id === id)) continue;
    const anchor = npcAnchor(index, id);
    entities.push({
      ref: anchor,
      kind: "npc",
      status: "neutral",
      lowly: (anchor.tags ?? []).includes("lowly"),
      present: true,
    });
  }
  const note = [
    sc.situation,
    `The question here: ${sc.question}`,
    sc.people.length ? `Here: ${sc.people.map(nameOf).join(", ")}.` : "",
    ...sc.clues.map(
      (c) => `A clue: ${c.text} (it can also be found at ${c.alsoAt.map(placeName).join(", ")}).`,
    ),
    sc.temptation ? `The quick way on offer: ${sc.temptation}` : "",
  ]
    .filter(Boolean)
    .join(" ");
  return { ...spec, entities, directorNote: note };
}
