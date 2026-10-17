/**
 * The campaign's own story plan: load and save it (hidden, in the spoiler schema), and the views of it the hidden
 * hand, the director and the storyteller each get.
 */
import type { AnchorRef, LoomMoment, LoomState } from "@dq/core/loom";
import type { PersonView } from "@dq/core/narration";
import { type CastMember, expectedProgress, type StoryPlan } from "@dq/core/story";
import type { WorldIndex } from "@dq/core/world";
import type { DbOrTx } from "@dq/db";
import { characters, storyPlans } from "@dq/db";
import { desc, eq } from "drizzle-orm";

/** A plan saved by the living story, as opposed to a chapter plan from before it. */
function isLivingPlan(value: unknown): value is StoryPlan {
  const v = value as Partial<StoryPlan> | null;
  return Boolean(v && v.version === 1 && typeof v.seedId === "string" && Array.isArray(v.moments));
}

export async function loadPlan(db: DbOrTx, campaignId: string): Promise<StoryPlan | null> {
  const rows = await db
    .select({ plan: storyPlans.plan })
    .from(storyPlans)
    .where(eq(storyPlans.campaignId, campaignId))
    .orderBy(desc(storyPlans.version))
    .limit(1);
  const plan = rows[0]?.plan;
  return isLivingPlan(plan) ? plan : null;
}

export async function savePlan(
  db: DbOrTx,
  campaignId: string,
  plan: StoryPlan,
  reason: string,
  createdBy: "director" | "dm" | "seed" = "director",
): Promise<void> {
  const [last] = await db
    .select({ version: storyPlans.version })
    .from(storyPlans)
    .where(eq(storyPlans.campaignId, campaignId))
    .orderBy(desc(storyPlans.version))
    .limit(1);
  await db.insert(storyPlans).values({
    campaignId,
    version: (last?.version ?? 0) + 1,
    plan: plan as unknown as Record<string, unknown>,
    reason: reason.slice(0, 200),
    createdBy,
  });
}

/** The plan's decisive moments as the hidden hand plans around them. */
export function loomMoments(index: WorldIndex, plan: StoryPlan | null): LoomMoment[] {
  if (!plan) return [];
  const at = expectedProgress(plan);
  return plan.moments.map((m) => {
    const poi = m.poiId ? index.pois.get(m.poiId)?.poi : undefined;
    const region = m.regionId ? index.regions.get(m.regionId) : undefined;
    return {
      id: m.id,
      title: m.title,
      placeName: poi?.name ?? region?.name ?? "the place ahead",
      sockets: m.crux.sockets,
      requiredGrace: m.crux.requiredGrace,
      onSuccess: m.crux.onSuccess,
      onCostlySuccess: m.crux.onCostlySuccess,
      onFailForward: m.crux.onFailForward,
      finale: m.finale,
      at: at.get(m.id) ?? 0,
      done: m.state === "done",
    };
  });
}

/**
 * Hidden-hand state saved before the living story pointed at a fixed arc's beats. A thread kept for a beat that
 * isn't one of this campaign's moments is free again, so the hand can keep it for the real finale.
 */
export function normalizeLoom(state: LoomState, momentIds: ReadonlySet<string>): LoomState {
  const threads = state.threads.map((t) => {
    const legacy = t as typeof t & { reservedForBeat?: string };
    const reserved = t.reservedFor ?? legacy.reservedForBeat;
    const { reservedForBeat: _old, ...rest } = legacy;
    return reserved && momentIds.has(reserved)
      ? { ...rest, reservedFor: reserved }
      : { ...rest, reservedFor: undefined };
  });
  const detours = state.detours.filter((d) => {
    const target = d.target as typeof d.target & { beatId?: string };
    return momentIds.has(target.momentId ?? target.beatId ?? "");
  });
  return { ...state, threads, detours };
}

export function slug(text: string): string {
  return (
    text
      .toLowerCase()
      .normalize("NFKD")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 40) || "someone"
  );
}

/** Someone from the world's own people, as a member of this campaign's story. */
export function castFromWorld(index: WorldIndex, npcId: string): CastMember | null {
  const npc = index.namedNpcs.get(npcId);
  if (!npc) return null;
  const archetype = index.archetypes.get(npc.archetype);
  return {
    id: npc.id,
    name: npc.name,
    role: npc.role,
    agenda: npc.description.replace(/\s+/g, " ").trim(),
    voice: archetype?.voice.replace(/\s+/g, " ").trim() ?? "",
    secret: npc.secret?.replace(/\s+/g, " ").trim() ?? null,
    attitude: 0,
    status: "active",
    regionId: npc.region,
    faction: npc.faction ?? null,
    tags: npc.tags,
  };
}

export function castMember(plan: StoryPlan | null, id: string): CastMember | null {
  return plan?.cast.find((c) => c.id === id) ?? null;
}

/** A person as the hidden hand refers to them. */
export function personAnchor(index: WorldIndex, plan: StoryPlan | null, id: string): AnchorRef {
  const member = castMember(plan, id);
  const npc = index.namedNpcs.get(id);
  const faction = member?.faction ?? npc?.faction;
  return {
    kind: "npc",
    id,
    name: member?.name ?? npc?.name ?? id,
    tags: member?.tags ?? npc?.tags ?? [],
    ...(faction ? { faction } : {}),
  };
}

export function attitudeWord(n: number): string {
  if (n <= -3) return "hostile";
  if (n === -2) return "unfriendly";
  if (n === -1) return "wary";
  if (n === 0) return "neutral";
  if (n === 1) return "friendly";
  if (n === 2) return "warm";
  return "devoted";
}

/** Someone in the scene, as the storyteller plays them. */
export function personView(index: WorldIndex, plan: StoryPlan | null, id: string, note?: string): PersonView {
  const member = castMember(plan, id) ?? castFromWorld(index, id);
  return {
    ref: id,
    name: member?.name ?? id,
    role: [member?.role, note].filter(Boolean).join("; ") || "someone here",
    agenda: member?.agenda ?? "",
    voice: member?.voice ?? "",
    attitude: attitudeWord(member?.attitude ?? 0),
    secret: member?.secret ?? null,
    status: member?.status ?? "active",
  };
}

/** Trouble the heroes can see right now: the latest sign of each threat. */
export function troubles(plan: StoryPlan | null): string[] {
  if (!plan) return [];
  return plan.fronts.flatMap((f) => {
    if (f.state === "doomed") return [f.doom];
    if (f.state === "thwarted" || f.stage === 0) return [];
    return [f.portents[Math.min(f.stage, f.portents.length) - 1] as string];
  });
}

/** What the heroes have found out: the clues they've uncovered. */
export function discoveries(plan: StoryPlan | null): string[] {
  if (!plan) return [];
  return plan.mysteries.flatMap((m) => m.clues.filter((c) => c.found).map((c) => c.text));
}

export function heroHook(plan: StoryPlan | null, heroId: string): string | null {
  return plan?.hooks.find((h) => h.heroId === heroId)?.hook ?? null;
}

/**
 * The story plan for a DM behind the spoiler warning: the threats and how far they've come, what's ahead, the
 * mysteries and their answers, and everyone's secrets.
 */
export async function dmStoryView(db: DbOrTx, campaignId: string) {
  const plan = await loadPlan(db, campaignId);
  if (!plan) return null;
  const heroes = await db
    .select({ id: characters.id, name: characters.name })
    .from(characters)
    .where(eq(characters.campaignId, campaignId));
  return {
    title: plan.title,
    pitch: plan.pitch,
    stakes: plan.stakes,
    storySoFar: plan.storySoFar,
    chapter: plan.chapter,
    length: plan.length,
    scenesPlayed: plan.scenes.length,
    fronts: plan.fronts.map((f) => ({
      name: f.name,
      central: f.central,
      state: f.state,
      come: f.portents.slice(0, f.stage),
      next: f.state === "active" ? (f.portents[f.stage] ?? null) : null,
      doom: f.doom,
    })),
    moments: plan.moments.map((m) => ({
      title: m.title,
      when: m.when,
      finale: m.finale,
      state: m.state,
      outcome: m.outcome ?? null,
    })),
    mysteries: plan.mysteries.map((m) => ({
      question: m.question,
      truth: m.truth,
      found: m.clues.filter((c) => c.found).length,
      clues: m.clues.length,
    })),
    cast: plan.cast.map((c) => ({
      name: c.name,
      role: c.role,
      attitude: attitudeWord(c.attitude),
      status: c.status.replace("_", " "),
      secret: c.secret,
    })),
    hooks: plan.hooks.map((h) => ({
      hero: heroes.find((x) => x.id === h.heroId)?.name ?? "a hero",
      hook: h.hook,
    })),
  };
}
