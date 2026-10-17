import type { CruxSpec, SeedDef } from "../world/schema";

/**
 * A campaign's own story. Built from a world's campaign seed and the heroes themselves when the campaign starts,
 * and grown by the story director at every scene change from what the heroes actually did. Hidden from players:
 * it lives in the spoiler schema.
 */

export const STORY_LENGTHS = ["short", "standard", "long"] as const;
export type StoryLength = (typeof STORY_LENGTHS)[number];

/** About how many scenes a campaign of each length runs to. The director paces fronts and moments to it. */
export const LENGTH_SCENES: Record<StoryLength, number> = { short: 8, standard: 20, long: 40 };

/** The finale never comes before this share of the story's length. */
export const FINALE_EARLIEST = 0.6;

/** A threat with its own momentum: what comes true, step by step, while nobody stops it. */
export interface Front {
  id: string;
  name: string;
  faction: string | null;
  goal: string;
  portents: string[];
  /** How many portents have come true. */
  stage: number;
  doom: string;
  central: boolean;
  /** thwarted: the heroes stopped it. doomed: its doom came true. */
  state: "active" | "thwarted" | "doomed";
}

export const CAST_STATUSES = ["active", "with_heroes", "away", "fled", "captured", "defeated"] as const;
export type CastStatus = (typeof CAST_STATUSES)[number];

/** Someone who matters in this campaign's story. */
export interface CastMember {
  /** A world person's id, or "cast-" plus a slug for someone this campaign brought in. */
  id: string;
  name: string;
  /** Their part in this story. */
  role: string;
  /** What they want. */
  agenda: string;
  /** How they talk and carry themselves. */
  voice: string;
  /** What they're hiding. It shows in what they do; it's never told until the heroes uncover it. */
  secret: string | null;
  /** How they feel about the heroes, from -3 (enemy) to 3 (devoted). */
  attitude: number;
  status: CastStatus;
  regionId: string | null;
  faction: string | null;
  tags: string[];
}

export interface Clue {
  id: string;
  text: string;
  found: boolean;
}

/** A question the story turns on, its answer, and at least three ways to find it. */
export interface Mystery {
  id: string;
  question: string;
  truth: string;
  clues: Clue[];
  solved: boolean;
}

export type MomentOutcome = "success" | "success_by_convergence" | "costly_success" | "fail_forward";

/** A decisive moment the story builds to. It comes when the story has earned it, never on a schedule. */
export interface Moment {
  id: string;
  title: string;
  frontId: string;
  when: string;
  regionId: string | null;
  poiId: string | null;
  summary: string;
  question: string;
  crux: CruxSpec;
  finale: boolean;
  state: "ahead" | "done";
  outcome?: MomentOutcome;
}

/** Something that ties a hero to this story personally. */
export interface HeroHook {
  heroId: string;
  hook: string;
}

/** A finished scene, in a sentence or two. */
export interface SceneRecord {
  seq: number;
  title: string;
  summary: string;
}

export interface StoryPlan {
  version: 1;
  seedId: string;
  title: string;
  pitch: string;
  stakes: string;
  /** The story so far in a few sentences, kept current by the director. */
  storySoFar: string;
  length: StoryLength;
  fronts: Front[];
  cast: CastMember[];
  mysteries: Mystery[];
  moments: Moment[];
  hooks: HeroHook[];
  /** Finished scenes, oldest first (the most recent 40 are kept). */
  scenes: SceneRecord[];
  chapter: { number: number; title: string };
  /** Set pieces already played. Each is used once per campaign. */
  usedSituations: string[];
}

export const MAX_SCENE_RECORDS = 40;

/** Story progress: scenes finished, plus a bonus for each milestone. Idling never advances it. */
export const MILESTONE_PROGRESS_BONUS = 2;

export function storyProgress(scenesDone: number, milestones: number): number {
  return scenesDone + MILESTONE_PROGRESS_BONUS * milestones;
}

/** The decisive moments still ahead, in the order the seed gave them (the finale last). */
export function momentsAhead(plan: Pick<StoryPlan, "moments">): Moment[] {
  return plan.moments.filter((m) => m.state === "ahead");
}

export function finaleMoment(plan: Pick<StoryPlan, "moments">): Moment | null {
  return plan.moments.find((m) => m.finale) ?? null;
}

export function centralFront(plan: Pick<StoryPlan, "fronts">): Front | null {
  return plan.fronts.find((f) => f.central) ?? plan.fronts[0] ?? null;
}

/** Whether the story is long enough for its finale. */
export function finaleAllowed(scenesDone: number, length: StoryLength): boolean {
  return scenesDone >= Math.ceil(LENGTH_SCENES[length] * FINALE_EARLIEST);
}

/**
 * Where each decisive moment ahead is expected to come, in story progress, for the hidden hand's planning: spread
 * evenly over the story's length, the finale at the end. A guide, never a schedule.
 */
export function expectedProgress(plan: Pick<StoryPlan, "moments" | "length">): Map<string, number> {
  const total = LENGTH_SCENES[plan.length];
  const all = plan.moments;
  const out = new Map<string, number>();
  all.forEach((m, i) => {
    out.set(m.id, m.finale ? total : Math.round((total * (i + 1)) / (all.length + 0.5)));
  });
  return out;
}

/** Difficulty of a decisive moment's roll: harder for each portent its front has made come true, and each debt. */
export function cruxDc(crux: CruxSpec, portentsCome: number, snarePressure: number): number {
  const dc =
    crux.check.dc.base +
    crux.check.dc.perPortent * portentsCome +
    crux.check.dc.perSnareSeverity * snarePressure;
  return Math.min(crux.check.dc.max, Math.round(dc));
}

/** A campaign's story plan as a seed sets it out, before the director makes it this campaign's own. */
export function planFromSeed(seed: SeedDef, length: StoryLength): StoryPlan {
  return {
    version: 1,
    seedId: seed.id,
    title: seed.title,
    pitch: seed.pitch.trim(),
    stakes: seed.stakes.trim(),
    storySoFar: "",
    length,
    fronts: seed.fronts.map((f) => ({
      id: f.id,
      name: f.name,
      faction: f.faction ?? null,
      goal: f.goal.trim(),
      portents: f.portents.map((p) => p.trim()),
      stage: 0,
      doom: f.doom.trim(),
      central: f.central,
      state: "active" as const,
    })),
    cast: [],
    mysteries: seed.mysteries.map((m) => ({
      id: m.id,
      question: m.question,
      truth: m.truth.trim(),
      clues: m.clues.map((text, i) => ({ id: `${m.id}-${i + 1}`, text: text.trim(), found: false })),
      solved: false,
    })),
    moments: seed.moments.map((m) => ({
      id: m.id,
      title: m.title,
      frontId: m.front,
      when: m.when.trim(),
      regionId: m.region ?? null,
      poiId: m.poi ?? null,
      summary: m.summary.trim(),
      question: m.question,
      crux: m.crux,
      finale: m.finale,
      state: "ahead" as const,
    })),
    hooks: [],
    scenes: [],
    chapter: { number: 1, title: seed.title },
    usedSituations: [],
  };
}
