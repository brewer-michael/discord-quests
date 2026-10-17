import { z } from "zod";
import type { PromptBlock } from "../llm/index";
import { VIRTUE_TAGS } from "../loom/vocab";
import { SCENE_KINDS } from "../story/vocab";
import type { World } from "../world/types";
import { audienceLine, contentRulesText, type NarrationStory, tableWishesText } from "./prompts";

/**
 * The story director: it makes a campaign's own story from one of the world's seeds when the campaign starts,
 * and frames each next scene from where the heroes chose to go. It sees the whole story plan (the storyteller
 * sees only the scene in front of the heroes) but never the hidden hand's state.
 */

export const NewPerson = z.object({
  name: z.string(),
  role: z.string(),
  agenda: z.string(),
  voice: z.string(),
  secret: z.string().nullable(),
});
export type NewPerson = z.infer<typeof NewPerson>;

export const SceneDraft = z.object({
  title: z.string(),
  kind: z.enum(SCENE_KINDS),
  regionId: z.string(),
  poiId: z.string().nullable(),
  /** What's going on as the heroes arrive. */
  situation: z.string(),
  /** The dramatic question the scene turns on. */
  question: z.string(),
  /** Cast refs of the people here. */
  present: z.array(z.string()),
  newPeople: z.array(NewPerson),
  /** Clue ids that can be found here. */
  clues: z.array(z.string()),
  /** Shortcut ids on offer here. */
  shortcuts: z.array(z.string()),
  /** Who could fight here (all of them, at once, in a fight scene). */
  foes: z.array(z.object({ creature: z.string(), count: z.number().int() })),
  /** Chances here to do the right thing at a cost: who it would be toward (a ref, or null), and what it is. */
  chances: z.array(z.object({ deed: z.enum(VIRTUE_TAGS), toward: z.string().nullable(), what: z.string() })),
  /** Something here can hurt the heroes besides a fight: a fall, a flood, fire, a collapse. */
  dangerous: z.boolean(),
  momentId: z.string().nullable(),
  situationId: z.string().nullable(),
  /** For the storyteller: how this scene grows out of what came before. */
  note: z.string(),
});
export type SceneDraft = z.infer<typeof SceneDraft>;

export const SeedOutput = z.object({
  pitch: z.string(),
  stakes: z.string(),
  storySoFar: z.string(),
  fronts: z.array(z.object({ id: z.string(), portents: z.array(z.string()) })),
  cast: z.array(
    z.object({
      ref: z.string(),
      role: z.string(),
      agenda: z.string(),
      voice: z.string(),
      secret: z.string().nullable(),
      attitude: z.number().int(),
    }),
  ),
  newCast: z.array(NewPerson),
  mysteries: z.array(z.object({ id: z.string(), clues: z.array(z.string()) })),
  hooks: z.array(z.object({ heroRef: z.string(), hook: z.string() })),
  opening: SceneDraft,
});
export type SeedOutput = z.infer<typeof SeedOutput>;

export const FrameOutput = z.object({
  /** The scene that just ended, in a sentence or two. */
  sceneSummary: z.string(),
  storySoFar: z.string(),
  frontChanges: z.array(
    z.object({ front: z.string(), change: z.enum(["advance", "thwarted", "none"]), why: z.string() }),
  ),
  milestone: z.boolean(),
  chapterTitle: z.string().nullable(),
  next: SceneDraft,
});
export type FrameOutput = z.infer<typeof FrameOutput>;

export const DIRECTOR_LIMITS = {
  storySoFar: 900,
  sceneSummary: 300,
  title: 60,
  situation: 700,
  question: 160,
  note: 400,
  role: 120,
  agenda: 200,
  voice: 160,
  secret: 300,
  hook: 240,
  portent: 240,
  clue: 240,
  pitch: 900,
  chance: 200,
  chances: 3,
  newPeople: 3,
  present: 6,
  foes: 6,
};

/** The director's standing instructions for a campaign. */
export function directorSystem(world: World, story: NarrationStory): PromptBlock[] {
  const wishes = tableWishesText(story);
  const text = [
    `You are the story director of ${audienceLine(story.intensity)}, set in ${world.meta.name}. You never write the story the players read: the storyteller does that. You decide what situation the heroes face next, and you keep the story's memory.`,
    "",
    "You set up situations, not plots. Threats move when nobody stops them, people want things and remember what the heroes did, and the truth can always be found more than one way. What happens is up to the heroes.",
    "",
    ...contentRulesText(world, story.intensity),
    ...(wishes.length > 0 ? ["", ...wishes] : []),
    "",
    "## Framing a scene",
    "- Follow the heroes. The next scene is where they chose to go or what they set out to do. Never send them somewhere they didn't choose. If they were vague, frame the most natural next step.",
    "- Give it a place, a situation as they arrive, and one question it turns on. When that question is answered, the scene is over.",
    "- Vary the kind of scene: talk, explore, travel, rest, danger, a fight. Not every scene has a fight. A rest scene is a quiet moment with the people travelling with them.",
    "- Bring back people from earlier when it makes sense. People travelling with the heroes come along. Only list people who are really there.",
    "- Put clues where the heroes go. If a way to the truth closes, open another: every truth has at least three ways in.",
    "- Offer a temptation (a shortcut) only where it fits naturally. Foes are creatures who could fight here; a fight scene needs them.",
    "- chances: one to three chances in this scene to do the right thing when it costs something: mercy to someone at the heroes' mercy, honesty when a lie would help, kindness to someone overlooked, patience instead of a shortcut, keeping a promise, putting themselves at risk for someone, making amends. Concrete and natural to the situation, never a test with a right answer. The heroes may take them or not.",
    "- dangerous: true when something here could hurt the heroes besides a fight (a fall, a flood, fire, a collapse).",
    "- Use a set piece when it fits where the heroes are and what they're doing; otherwise build the scene from the world's places, people and creatures.",
    "- Bring a decisive moment only when the story has earned it (its 'when' has come true). The finale only when the story is long enough and the heroes are going after the central trouble.",
    "- note: a sentence or two for the storyteller on how this scene grows out of what came before: who remembers what, what came of the heroes' choices.",
    "",
    "## Keeping the story",
    "- Move a threat one step (advance) when the heroes left it alone a while, time passed on the road, or they failed against it. Mark it thwarted only when they've truly stopped it. At most one step per threat per scene. Let a threat that moved show in the next scene: a rumor, a sign, people in trouble.",
    "- sceneSummary: the scene that just ended, in a sentence or two of what happened and what changed.",
    "- storySoFar: where things stand now, in at most six sentences: what the heroes have done that matters, what they're after, what's hanging over them.",
    "- milestone: true when the scene that ended settled something big: a decisive moment, a threat stopped, a mystery solved, a hard-won goal.",
    "- chapterTitle: when a new chapter begins (usually after a milestone), its title. Otherwise null.",
    "- Never decide what the heroes do, think or feel. Never mention luck, fate or anything working behind the scenes.",
  ].join("\n");
  return [{ text, cache: "1h" }];
}

// ------------------------------------------------------------------ seeding

export interface SeedPromptInput {
  world: World;
  heroes: Array<{
    ref: string;
    name: string;
    species: string;
    className: string;
    background: string;
    keepsake: string;
    path: string;
    look: string;
  }>;
  seed: {
    title: string;
    pitch: string;
    openings: string[];
    stakes: string;
    fronts: Array<{
      id: string;
      name: string;
      goal: string;
      portents: string[];
      doom: string;
      central: boolean;
    }>;
    cast: Array<{ ref: string; name: string; role: string; description: string; secret: string | null }>;
    mysteries: Array<{ id: string; question: string; truth: string; clues: string[] }>;
    moments: Array<{ id: string; title: string; when: string }>;
  };
  /** Where it can begin. */
  places: Array<{
    regionId: string;
    regionName: string;
    description: string;
    pois: Array<{ id: string; name: string }>;
  }>;
  setPieces: Array<{ id: string; title: string; regionId: string; summary: string }>;
  /** A story already under way: what has happened so far, for a campaign moving onto a living story. */
  history?: string[];
  /** For a story under way: where the heroes are heading now. */
  heading?: string[];
}

export function seedUser(input: SeedPromptInput): PromptBlock[] {
  const { seed } = input;
  const lines = [
    "Make this campaign's own story from the seed below, built around these heroes.",
    "",
    `## The world: ${input.world.meta.name}`,
    input.world.meta.summary.trim(),
    "",
    "## The heroes",
    ...input.heroes.map(
      (h) =>
        `- ${h.name} [ref: ${h.ref}]: ${h.species} ${h.className}, ${h.background}, on ${h.path}. Carries ${h.keepsake}.${h.look ? ` Looks: """${h.look.replaceAll('"""', "'")}"""` : ""}`,
    ),
    "",
    `## The seed: ${seed.title}`,
    seed.pitch,
    `Stakes: ${seed.stakes}`,
    "Ways it can begin:",
    ...seed.openings.map((o) => `- ${o}`),
    "",
    "Threats (keep each one's id and the number of its portents; rewrite the portents to fit):",
    ...seed.fronts.flatMap((f) => [
      `- [front: ${f.id}] ${f.name}${f.central ? " (the central trouble)" : ""}: ${f.goal}`,
      ...f.portents.map((p, i) => `  ${i + 1}. ${p}`),
      `  Doom: ${f.doom}`,
    ]),
    "",
    "People in this story (give each a role, a want, a manner, a secret if they have one, and an attitude toward the heroes from -3 to 3):",
    ...seed.cast.map(
      (c) =>
        `- [ref: ${c.ref}] ${c.name}, ${c.role}: ${c.description}${c.secret ? ` Secret: ${c.secret}` : ""}`,
    ),
    "",
    "Mysteries (keep each id, question and truth; write at least three clues, findable in different places and ways):",
    ...seed.mysteries.flatMap((m) => [
      `- [mystery: ${m.id}] ${m.question} Truth: ${m.truth}`,
      ...m.clues.map((c) => `  - ${c}`),
    ]),
    "",
    "Decisive moments it can build to (for your bearings; they come when the story earns them):",
    ...seed.moments.map((m) => `- ${m.title}: ${m.when}`),
    "",
    "## Where it can begin",
    ...input.places.map(
      (p) =>
        `- [region: ${p.regionId}] ${p.regionName}: ${p.description} Places: ${p.pois.map((x) => `${x.name} [poi: ${x.id}]`).join(", ")}`,
    ),
  ];
  if (input.setPieces.length > 0)
    lines.push(
      "",
      "Set pieces there (the opening may use one):",
      ...input.setPieces.map((s) => `- [situation: ${s.id}] ${s.title} (${s.regionId}): ${s.summary}`),
    );
  if (input.history?.length)
    lines.push(
      "",
      "## The story so far",
      "This campaign is already under way. Build its story from where things stand, keeping everything that has happened, and frame the opening as the next scene, from where the heroes are heading.",
      ...input.history.map((h) => `- ${h}`),
      ...(input.heading?.length
        ? ["Where the heroes are heading:", ...input.heading.map((h) => `- ${h}`)]
        : []),
    );
  lines.push(
    "",
    "## What to write",
    "- pitch and stakes: this campaign's version, in a few sentences each.",
    "- fronts: each threat's portents, rewritten to fit (same number, in order). Concrete things people can see and hear.",
    "- cast: everyone above, by ref. newCast: up to three new people (names that fit the world) when the heroes' backgrounds call for them.",
    "- mysteries: each mystery's clues, by id.",
    "- hooks: one for each hero, by ref: a personal stake tied to their background, keepsake, road or looks. A stake, never a destiny.",
    "- opening: the first scene, in one of the regions above, from one of the ways it can begin. Use people from the cast (refs), clue ids that can be found there (as mystery id, a dash and the clue's number, like the-missing-coal-1), and foes only if a fight starts at once.",
    "- storySoFar: two or three sentences: the situation as the heroes come into it.",
  );
  return [{ text: lines.join("\n") }];
}

// ------------------------------------------------------------------ framing

export interface FramePromptInput {
  story: {
    title: string;
    pitch: string;
    stakes: string;
    storySoFar: string;
    scenesDone: number;
    scenesTarget: number;
    finaleAllowed: boolean;
    chapter: string;
  };
  fronts: Array<{
    id: string;
    name: string;
    goal: string;
    portents: string[];
    stage: number;
    state: string;
    central: boolean;
  }>;
  mysteries: Array<{
    id: string;
    question: string;
    truth: string;
    clues: Array<{ id: string; text: string; found: boolean }>;
    solved: boolean;
  }>;
  cast: Array<{
    ref: string;
    name: string;
    role: string;
    agenda: string;
    attitude: string;
    status: string;
    where: string;
  }>;
  hooks: Array<{ hero: string; hook: string }>;
  moments: Array<{ id: string; title: string; when: string; finale: boolean }>;
  ended: { title: string; question: string; log: string[]; lastNarration: string };
  /** What the heroes chose to do as the scene ended. */
  heading: string[];
  places: {
    here: {
      regionId: string;
      name: string;
      description: string;
      pois: Array<{ id: string; name: string; description: string }>;
    };
    nearby: Array<{
      regionId: string;
      name: string;
      days: number;
      road: boolean;
      pois: Array<{ id: string; name: string }>;
    }>;
  };
  setPieces: Array<{ id: string; title: string; regionId: string; kind: string; summary: string }>;
  temptations: Array<{ id: string; name: string; offer: string }>;
  /** The story is ready for a temptation: offer one in this scene if it fits. */
  tempt?: boolean;
  creatures: Array<{ id: string; name: string }>;
}

export function frameUser(input: FramePromptInput): PromptBlock[] {
  const s = input.story;
  const stable = [
    `## The story: ${s.title}`,
    s.pitch,
    `Stakes: ${s.stakes}`,
    "",
    "## Threats",
    ...input.fronts.flatMap((f) => [
      `- [front: ${f.id}] ${f.name}${f.central ? " (the central trouble)" : ""}, ${f.state}: ${f.goal}`,
      ...f.portents.map(
        (p, i) => `  ${i < f.stage ? "[has come true]" : i === f.stage ? "[next]" : "[later]"} ${p}`,
      ),
    ]),
    "",
    "## Mysteries",
    ...input.mysteries.flatMap((m) => [
      `- [mystery: ${m.id}] ${m.question}${m.solved ? " (solved)" : ""} Truth: ${m.truth}`,
      ...m.clues.map((c) => `  - [clue: ${c.id}] ${c.found ? "(found) " : ""}${c.text}`),
    ]),
    "",
    "## People",
    ...input.cast.map(
      (c) =>
        `- [ref: ${c.ref}] ${c.name}, ${c.role}. Wants: ${c.agenda} Feels ${c.attitude} toward the heroes. ${c.status}, ${c.where}.`,
    ),
  ];
  if (input.hooks.length > 0)
    stable.push("", "## The heroes' stakes", ...input.hooks.map((h) => `- ${h.hero}: ${h.hook}`));
  if (input.moments.length > 0)
    stable.push(
      "",
      "## Decisive moments still ahead",
      ...input.moments.map(
        (m) => `- [moment: ${m.id}] ${m.title}${m.finale ? " (the finale)" : ""}: ${m.when}`,
      ),
    );

  const turn = [
    `## Where the story stands (scene ${s.scenesDone + 1} of about ${s.scenesTarget}; ${s.chapter})`,
    s.storySoFar || "Just begun.",
    s.finaleAllowed
      ? "The story is long enough for its finale, if the heroes are going after the central trouble."
      : "It's too early for the finale.",
    "",
    `## The scene that just ended: ${input.ended.title}`,
    `Its question: ${input.ended.question}`,
    ...input.ended.log.map((l) => `- ${l}`),
  ];
  if (input.ended.lastNarration) turn.push("The last passage:", input.ended.lastNarration);
  turn.push(
    "",
    "## Where the heroes are heading (what they chose as it ended)",
    ...(input.heading.length > 0
      ? input.heading.map((h) => `- ${h}`)
      : ["- They didn't say. Frame the most natural next step."]),
    "",
    "## Places",
    `Here: [region: ${input.places.here.regionId}] ${input.places.here.name}: ${input.places.here.description}`,
    ...input.places.here.pois.map((p) => `- [poi: ${p.id}] ${p.name}: ${p.description}`),
    "Nearby:",
    ...input.places.nearby.map(
      (n) =>
        `- [region: ${n.regionId}] ${n.name}, ${n.days} day${n.days === 1 ? "" : "s"} ${n.road ? "by road" : "through wild country"}. Places: ${n.pois.map((p) => `${p.name} [poi: ${p.id}]`).join(", ")}`,
    ),
  );
  if (input.setPieces.length > 0)
    turn.push(
      "",
      "## Set pieces that could fit",
      ...input.setPieces.map(
        (p) => `- [situation: ${p.id}] ${p.title} (${p.kind}, ${p.regionId}): ${p.summary}`,
      ),
    );
  if (input.temptations.length > 0)
    turn.push(
      "",
      "## Temptations that could be on offer",
      ...input.temptations.map((t) => `- [shortcut: ${t.id}] ${t.name}: ${t.offer}`),
      ...(input.tempt
        ? ["The heroes haven't been tempted in a while: offer one of these in this scene if it fits."]
        : []),
    );
  if (input.creatures.length > 0)
    turn.push(
      "",
      `## Creatures around here: ${input.creatures.map((c) => `${c.name} [creature: ${c.id}]`).join(", ")}`,
    );
  turn.push(
    "",
    "Frame the next scene, and keep the story: summarize the scene that ended, update the story so far, move or stop the threats, and say whether a milestone or a new chapter came.",
  );
  return [{ text: stable.join("\n"), cache: "5m" }, { text: turn.join("\n") }];
}
