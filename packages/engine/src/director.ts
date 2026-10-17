/**
 * The story director, engine side: makes a campaign's own story from a seed and its heroes when it starts, and
 * frames each next scene from where the heroes chose to go. The AI proposes; this module checks every id and
 * name against the world and the plan, and builds the scene the game plays. Nothing here stands in for the AI:
 * when it can't answer, the reasons go back so a person can take over.
 */
import type { CombatState } from "@dq/core/combat";
import { creatureAllowed, type TableRules } from "@dq/core/combat/bestiary";
import type { LlmGateway, PromptBlock } from "@dq/core/llm";
import { type AnchorRef, bearersForScene, isVirtueTag, type LoomState } from "@dq/core/loom";
import {
  DIRECTOR_LIMITS,
  directorSystem,
  FrameOutput,
  type FramePromptInput,
  frameUser,
  type NarrationStory,
  type OpportunityView,
  type SceneDraft,
  type SceneSpecView,
  SeedOutput,
  type SeedPromptInput,
  seedUser,
} from "@dq/core/narration";
import { deriveRng } from "@dq/core/rng";
import { checkNarration } from "@dq/core/safety";
import {
  type CastMember,
  finaleAllowed,
  LENGTH_SCENES,
  MAX_SCENE_RECORDS,
  momentsAhead,
  planFromSeed,
  type SceneKind,
  type StoryLength,
  type StoryPlan,
} from "@dq/core/story";
import type { SeedDef, WorldIndex } from "@dq/core/world";
import type { z } from "zod";
import type { Logger } from "./deps";
import { attitudeWord, castFromWorld, castMember, personAnchor, personView, slug } from "./story-plan";
import type { StoryState } from "./story-state";

export type EntityStatus =
  | "hostile"
  | "at_mercy"
  | "friendly"
  | "neutral"
  | "fled"
  | "captured"
  | "befriended"
  | "away";

export interface SceneEntityState {
  ref: AnchorRef;
  kind: "npc" | "creature" | "place" | "item";
  status: EntityStatus;
  lowly: boolean;
  present: boolean;
  note?: string;
}

/** A scene as the game plays it. Stored on the scene row. */
export interface SceneSpec {
  kind: SceneKind;
  regionId: string;
  poiId: string | null;
  title: string;
  /** What's going on as the heroes arrive. */
  summary: string;
  /** The dramatic question it turns on. When it's answered, the scene is over. */
  question: string;
  /** The people here, and the foes of a fight in progress. */
  entities: SceneEntityState[];
  /** Clue ids the heroes can find here. */
  clues: string[];
  offeredShortcuts: string[];
  opportunities: OpportunityView[];
  /** Creatures that could fight here. */
  foes: Array<{ creature: string; count: number }>;
  /** The decisive moment this scene is, if it is one. */
  momentId: string | null;
  /** The set piece it uses, if any. */
  situationId: string | null;
  chapter: number;
  /** Something here can hurt the heroes besides a fight. */
  dangerous: boolean;
  /** This scene so far, a sentence per turn. */
  log: string[];
  /** Opened by a person when the director couldn't frame it: the director frames the next one properly. */
  provisional?: boolean;
  /** The fight in this scene, if there is one. */
  combat?: CombatState;
  /** The director's note for the storyteller on how this scene grows out of what came before. */
  directorNote?: string;
}

export const MAX_SCENE_LOG = 12;

const clip = (s: string | null | undefined, n: number): string => {
  const t = (s ?? "").replace(/\s+/g, " ").trim();
  return t.length <= n ? t : `${t.slice(0, n - 1).trimEnd()}…`;
};

/** A scene row saved before the living story: a fixed arc's beat. */
export function normalizeSpec(raw: unknown): SceneSpec {
  const v = raw as Partial<SceneSpec> & {
    goals?: string[];
    chapterNumber?: number;
    beatId?: string | null;
  };
  return {
    kind: v.kind ?? "exploration",
    regionId: v.regionId ?? "",
    poiId: v.poiId ?? null,
    title: v.title ?? "",
    summary: v.summary ?? "",
    question: v.question ?? v.goals?.[0] ?? `What do the heroes do in ${v.title ?? "this place"}?`,
    entities: v.entities ?? [],
    clues: v.clues ?? [],
    offeredShortcuts: v.offeredShortcuts ?? [],
    opportunities: v.opportunities ?? [],
    foes: v.foes ?? [],
    momentId: v.momentId ?? null,
    situationId: v.situationId ?? null,
    chapter: v.chapter ?? v.chapterNumber ?? 1,
    dangerous: v.dangerous ?? false,
    log: v.log ?? [],
    ...(v.provisional ? { provisional: true } : {}),
    ...(v.combat ? { combat: v.combat } : {}),
    ...(v.directorNote ? { directorNote: v.directorNote } : {}),
  };
}

function placeNote(index: WorldIndex, regionId: string, poiId: string | null): string {
  const poi = poiId ? index.pois.get(poiId)?.poi : undefined;
  const text = poi?.description ?? index.regions.get(regionId)?.description ?? "";
  const flat = text.replace(/\s+/g, " ").trim();
  return flat.match(/^.*?[.!?](\s|$)/)?.[0]?.trim() ?? flat;
}

/** The scene as the storyteller and the action reader see it. */
export function sceneSpecView(index: WorldIndex, plan: StoryPlan | null, spec: SceneSpec): SceneSpecView {
  const region = index.regions.get(spec.regionId);
  const poi = spec.poiId ? index.pois.get(spec.poiId)?.poi : undefined;
  const found = new Set(
    plan?.mysteries.flatMap((m) => m.clues.filter((c) => c.found).map((c) => c.id)) ?? [],
  );
  const clueText = new Map(plan?.mysteries.flatMap((m) => m.clues.map((c) => [c.id, c.text] as const)) ?? []);
  const fighting = spec.entities.filter((e) => e.kind === "creature" && e.present);
  return {
    title: spec.title,
    kind: spec.kind,
    locationName: poi?.name ?? region?.name ?? spec.regionId,
    regionName: region?.name ?? spec.regionId,
    placeNote: placeNote(index, spec.regionId, spec.poiId),
    summary: spec.summary,
    question: spec.question,
    people: spec.entities
      .filter((e) => e.kind === "npc" && e.present)
      .map((e) => personView(index, plan, e.ref.id, e.note)),
    foes:
      fighting.length > 0
        ? fighting.map((e) => ({ ref: e.ref.id, name: e.ref.name ?? e.ref.id, count: 1 }))
        : spec.foes.map((f) => ({
            ref: f.creature,
            name: index.creatures.get(f.creature)?.name ?? f.creature,
            count: f.count,
          })),
    clues: spec.clues
      .filter((id) => !found.has(id) && clueText.has(id))
      .map((id) => ({ id, text: clueText.get(id) as string })),
    opportunities: spec.opportunities,
    ...(spec.directorNote ? { directorNote: spec.directorNote } : {}),
  };
}

function npcEntity(
  index: WorldIndex,
  plan: StoryPlan,
  id: string,
  status: EntityStatus = "neutral",
): SceneEntityState {
  const ref = personAnchor(index, plan, id);
  return { ref, kind: "npc", status, lowly: (ref.tags ?? []).includes("lowly"), present: true };
}

/** A scene a person opened in the DM room. The director frames the next one properly. */
export function provisionalScene(
  index: WorldIndex,
  plan: StoryPlan | null,
  at: { regionId: string; poiId: string | null; chapter: number },
  told: string,
): SceneSpec {
  const region = index.regions.get(at.regionId);
  const poi = at.poiId ? index.pois.get(at.poiId)?.poi : undefined;
  const companions = (plan?.cast ?? []).filter((c) => c.status === "with_heroes");
  return {
    kind: "exploration",
    regionId: at.regionId,
    poiId: at.poiId,
    title: poi?.name ?? region?.name ?? "On the Road",
    summary: clip(told, DIRECTOR_LIMITS.situation),
    question: "Where do the heroes go from here?",
    entities: plan ? companions.map((c) => npcEntity(index, plan, c.id)) : [],
    clues: [],
    offeredShortcuts: [],
    opportunities: [],
    foes: [],
    momentId: null,
    situationId: null,
    chapter: at.chapter,
    dangerous: false,
    log: [],
    provisional: true,
  };
}

// ------------------------------------------------------------ drafts into scenes

interface DraftContext {
  index: WorldIndex;
  /** Changed in place: people the scene brings in join the cast, a set piece is marked used. */
  plan: StoryPlan;
  loom: LoomState;
  rules: TableRules;
  telling: NarrationStory;
  /** Regions the scene may be in. */
  regions: ReadonlySet<string>;
  /** The temptations the director was offered. */
  temptations: ReadonlySet<string>;
  /** The moment just played, if the scene that ended was one: never two in a row. */
  previousMoment: string | null;
  scenesDoneAfter: number;
  heroNames: readonly string[];
  rng: ReturnType<typeof deriveRng>;
}

interface DraftResult {
  spec: SceneSpec | null;
  /** Why the draft can't be played as it is. */
  problems: string[];
  /** What was left out of it, for the log. */
  dropped: string[];
}

/** Turns the director's draft into a scene the game can play, checking every id and name. */
export function sceneFromDraft(draft: SceneDraft, ctx: DraftContext): DraftResult {
  const { index, plan } = ctx;
  const problems: string[] = [];
  const dropped: string[] = [];
  const region = index.regions.get(draft.regionId);
  if (!region || !ctx.regions.has(draft.regionId)) {
    problems.push(
      `The scene's region "${draft.regionId}" isn't one of the places listed. Use a [region: ...] id from the list.`,
    );
    return { spec: null, problems, dropped };
  }
  const poiId = draft.poiId && region.pois.some((p) => p.id === draft.poiId) ? draft.poiId : null;
  if (draft.poiId && !poiId) dropped.push(`poi ${draft.poiId}`);
  if (!draft.question.trim()) problems.push("Give the scene a question it turns on.");

  // A decisive moment only when it's still ahead, never two in a row, and the finale only once it's earned.
  let moment = draft.momentId ? momentsAhead(plan).find((m) => m.id === draft.momentId) : undefined;
  if (draft.momentId && !moment) dropped.push(`moment ${draft.momentId}`);
  if (moment && ctx.previousMoment) {
    dropped.push(`moment ${moment.id} (right after another)`);
    moment = undefined;
  }
  if (moment?.finale && !finaleAllowed(ctx.scenesDoneAfter, plan.length)) {
    dropped.push(`finale ${moment.id} (too early)`);
    moment = undefined;
  }

  let situation = draft.situationId ? index.situations.get(draft.situationId) : undefined;
  if (situation && (plan.usedSituations.includes(situation.id) || situation.region !== draft.regionId)) {
    dropped.push(`set piece ${situation.id}`);
    situation = undefined;
  } else if (draft.situationId && !situation) dropped.push(`set piece ${draft.situationId}`);

  // People: who the director put here, anyone the set piece brings, new people, and companions.
  const known = new Set(
    [...plan.cast.map((c) => c.name), ...index.world.npcs.named.map((n) => n.name), ...ctx.heroNames].map(
      (n) => n.toLowerCase(),
    ),
  );
  const banned = index.world.content.bannedTerms;
  const join = (member: CastMember) => {
    if (!plan.cast.some((c) => c.id === member.id)) plan.cast.push(member);
  };
  const present: string[] = [];
  const bring = (id: string) => {
    if (present.includes(id)) return;
    const member = castMember(plan, id);
    if (member) {
      if (member.status === "defeated") return dropped.push(`person ${id} (beaten)`);
      present.push(id);
      return;
    }
    const fromWorld = castFromWorld(index, id);
    if (!fromWorld) return dropped.push(`person ${id}`);
    join(fromWorld);
    present.push(id);
  };
  for (const id of draft.present.slice(0, DIRECTOR_LIMITS.present)) bring(id);
  for (const id of situation?.introduces ?? []) bring(id);
  for (const np of draft.newPeople.slice(0, DIRECTOR_LIMITS.newPeople)) {
    const name = clip(np.name, 40);
    const key = name.toLowerCase();
    const text = `${name} ${np.role} ${np.agenda} ${np.voice} ${np.secret ?? ""}`;
    if (name.length < 2 || known.has(key) || banned.some((b) => new RegExp(`\\b${b}\\b`, "i").test(text))) {
      dropped.push(`new person ${name}`);
      continue;
    }
    known.add(key);
    let id = `cast-${slug(name)}`;
    while (plan.cast.some((c) => c.id === id)) id = `${id}-2`;
    join({
      id,
      name,
      role: clip(np.role, DIRECTOR_LIMITS.role),
      agenda: clip(np.agenda, DIRECTOR_LIMITS.agenda),
      voice: clip(np.voice, DIRECTOR_LIMITS.voice),
      secret: np.secret ? clip(np.secret, DIRECTOR_LIMITS.secret) : null,
      attitude: 0,
      status: "active",
      regionId: draft.regionId,
      faction: null,
      tags: [],
    });
    present.push(id);
  }
  for (const c of plan.cast) if (c.status === "with_heroes" && !present.includes(c.id)) present.push(c.id);
  for (const id of present) {
    const member = castMember(plan, id);
    if (member && member.status !== "with_heroes" && member.status !== "captured") {
      member.status = "active";
      member.regionId = draft.regionId;
    }
  }

  const mercyToward = new Set(
    draft.chances.filter((c) => c.deed === "mercy" && c.toward).map((c) => c.toward as string),
  );
  const entities: SceneEntityState[] = present.map((id) =>
    npcEntity(index, plan, id, mercyToward.has(id) ? "at_mercy" : "neutral"),
  );
  // People the heroes' kindness bound to them are close by at a decisive moment, so a payoff can be plausible.
  if (moment)
    for (const id of bearersForScene(ctx.loom, moment.id)) {
      if (entities.some((e) => e.ref.id === id)) continue;
      const member = castMember(plan, id) ?? castFromWorld(index, id);
      if (!member || member.status === "defeated" || member.status === "captured") continue;
      join(member);
      entities.push({
        ...npcEntity(index, plan, id),
        note: "nearby, unnoticed unless someone looks for them",
      });
    }

  // Clues still to be found.
  const unfound = new Set(plan.mysteries.flatMap((m) => m.clues.filter((c) => !c.found).map((c) => c.id)));
  const clues = [...new Set(draft.clues)].filter((id) => {
    if (unfound.has(id)) return true;
    dropped.push(`clue ${id}`);
    return false;
  });

  // Temptations only from those on offer, and only where they fit.
  const shortcuts = [...new Set([...draft.shortcuts, ...(situation?.offersShortcuts ?? [])])].filter(
    (id) => ctx.temptations.has(id) || (situation?.offersShortcuts.includes(id) && index.shortcuts.has(id)),
  );

  // Foes the table allows.
  const foeList = draft.foes.length > 0 ? draft.foes : rolledFoes(situation?.foes ?? [], ctx.rng);
  const foes = foeList
    .filter((f) => {
      const c = index.creatures.get(f.creature);
      const ok = Boolean(c && creatureAllowed(c, ctx.rules));
      if (!ok) dropped.push(`foe ${f.creature}`);
      return ok;
    })
    .slice(0, 3)
    .map((f) => ({ creature: f.creature, count: Math.max(1, Math.min(DIRECTOR_LIMITS.foes, f.count)) }));

  // Chances to do the right thing, and the temptations, as the storyteller offers them.
  const presentIds = new Set(entities.map((e) => e.ref.id));
  const opportunities: OpportunityView[] = [];
  const offer = (o: OpportunityView) => {
    if (opportunities.some((x) => x.kind === o.kind && x.key === o.key && x.targetRef === o.targetRef))
      return;
    opportunities.push(o);
  };
  for (const c of draft.chances.slice(0, DIRECTOR_LIMITS.chances))
    offer({
      kind: "virtue",
      key: c.deed,
      ...(c.toward && presentIds.has(c.toward) ? { targetRef: c.toward } : {}),
      text: clip(c.what, DIRECTOR_LIMITS.chance),
    });
  for (const v of situation?.virtueOpportunities ?? [])
    if (isVirtueTag(v.tag))
      offer({
        kind: "virtue",
        key: v.tag,
        ...(v.target && presentIds.has(v.target) ? { targetRef: v.target } : {}),
        text: clip(v.note, DIRECTOR_LIMITS.chance),
      });
  for (const e of entities)
    if (e.lowly && !e.note)
      offer({
        kind: "virtue",
        key: "kindness_to_lowly",
        targetRef: e.ref.id,
        text: `${e.ref.name} is easy to overlook.`,
      });
  for (const id of shortcuts) {
    const s = index.shortcuts.get(id);
    if (s) offer({ kind: "shortcut", key: id, text: `${s.name}: ${clip(s.offer, 240)}` });
  }

  const quest = situation?.quest;
  const note = [
    clip(draft.note, DIRECTOR_LIMITS.note),
    quest ? `A goal the heroes could take up here: ${quest.title} (${clip(quest.objective, 200)}).` : "",
  ]
    .filter(Boolean)
    .join(" ");
  const kind: SceneKind = moment ? "crux" : draft.kind === "crux" ? "exploration" : draft.kind;
  const spec: SceneSpec = {
    kind,
    regionId: draft.regionId,
    poiId,
    title: clip(draft.title, DIRECTOR_LIMITS.title) || moment?.title || situation?.title || region.name,
    summary:
      clip(draft.situation, DIRECTOR_LIMITS.situation) ||
      clip(moment?.summary ?? situation?.summary, DIRECTOR_LIMITS.situation),
    question: clip(draft.question, DIRECTOR_LIMITS.question) || moment?.question || situation?.question || "",
    entities,
    clues,
    offeredShortcuts: shortcuts,
    opportunities,
    foes,
    momentId: moment?.id ?? null,
    situationId: situation?.id ?? null,
    chapter: plan.chapter.number,
    dangerous: draft.dangerous,
    log: [],
    ...(note ? { directorNote: note } : {}),
  };
  if (situation) plan.usedSituations.push(situation.id);
  return { spec, problems, dropped };
}

function rolledFoes(
  foes: ReadonlyArray<{ creature: string; count: readonly [number, number] }>,
  rng: ReturnType<typeof deriveRng>,
): Array<{ creature: string; count: number }> {
  return foes.map((f) => ({ creature: f.creature, count: rng.int(f.count[0], f.count[1]) }));
}

// ------------------------------------------------------------ talking to the director

export type DirectorResult<T> = { ok: true; value: T } | { ok: false; reasons: string[] };

const STOPPED: Record<string, string> = {
  unconfigured: "No story director service is set for this server (the setup page's “Who does what”).",
  budget: "Today's spending limit for AI services has been reached.",
  error: "The story director service returned an error.",
  invalid: "The story director's answer wasn't in the shape the game needs.",
  refusal: "The story director declined to answer.",
  max_tokens: "The story director ran out of room before finishing.",
};

/**
 * Asks the director, checks its answer, and asks once more with the problems if it got something wrong. Says why
 * when it can't.
 */
async function askDirector<O, T>(args: {
  llm: LlmGateway;
  log: Logger;
  scope: { guildId: string; campaignId: string };
  index: WorldIndex;
  telling: NarrationStory;
  user: PromptBlock[];
  schema: z.ZodType<O>;
  schemaName: string;
  expectTokens: number;
  accept: (out: O) => { value: T | null; problems: string[] };
}): Promise<DirectorResult<T>> {
  let problems: string[] = [];
  let reasons: string[] = [];
  for (let attempt = 0; attempt < 2; attempt++) {
    const feedback =
      attempt === 0 || problems.length === 0
        ? []
        : [
            {
              text: `Your previous answer had these problems. Answer again without them:\n${problems.map((p) => `- ${p}`).join("\n")}`,
            },
          ];
    const res = await args.llm.structured(
      {
        task: "director",
        system: directorSystem(args.index.world, args.telling),
        user: [...args.user, ...feedback],
        schema: args.schema,
        schemaName: args.schemaName,
        expectTokens: args.expectTokens,
        effort: attempt === 0 ? "medium" : "low",
      },
      args.scope,
    );
    if (!res.ok) {
      args.log.warn("director unavailable", { stop: res.stop, error: res.error });
      reasons = [STOPPED[res.stop] ?? `The story director stopped (${res.stop}).`];
      if (res.error) reasons.push(`What the service said: ${res.error.slice(0, 300)}`);
      problems = [];
      if (res.stop === "unconfigured" || res.stop === "budget" || res.stop === "error") break;
      continue;
    }
    const checked = args.accept(res.value);
    problems = checked.problems;
    if (checked.value && problems.length === 0) return { ok: true, value: checked.value };
    args.log.warn("director answer rejected", { problems });
    reasons = problems.map((p) => `The story director's answer was turned back: ${p}`);
  }
  return { ok: false, reasons };
}

function safetyProblems(texts: string[], index: WorldIndex, telling: NarrationStory): string[] {
  const verdict = checkNarration(texts.filter(Boolean).join("\n"), index.world, {
    intensity: telling.intensity,
  });
  return verdict.findings.flatMap((f) =>
    f.category === "banned_word"
      ? [`It uses the word "${f.match}", which isn't allowed here.`]
      : f.category === "hidden_leak"
        ? [`It mentions luck, fate or something working behind the scenes ("${f.match}"). Don't.`]
        : f.category === "personal_info"
          ? ["It includes something that looks like real personal information."]
          : [],
  );
}

function draftTexts(d: SceneDraft): string[] {
  return [
    d.title,
    d.situation,
    d.question,
    d.note,
    ...d.chances.map((c) => c.what),
    ...d.newPeople.flatMap((p) => [p.name, p.role, p.agenda, p.voice, p.secret ?? ""]),
  ];
}

// ------------------------------------------------------------ seeding a campaign

export interface DirectorHero {
  id: string;
  name: string;
  species: string;
  className: string;
  background: string;
  keepsake: string;
  path: string;
  look: string;
}

/** The seed that suits the table's premise best, or one at random when nothing in it points anywhere. */
export function pickSeed(index: WorldIndex, premise: string, masterSeed: string): SeedDef | null {
  const seeds = [...index.seeds.values()];
  if (seeds.length === 0) return null;
  const words = (s: string) =>
    new Set(
      s
        .toLowerCase()
        .split(/[^a-z]+/)
        .filter((w) => w.length >= 4),
    );
  const wanted = words(premise);
  const scored = seeds.map((s) => {
    const text = words(
      [
        s.title,
        s.pitch,
        s.stakes,
        ...s.fronts.flatMap((f) => [f.name, f.goal, f.doom]),
        ...s.moments.flatMap((m) => [m.title, m.summary]),
        ...s.situations.map((id) => index.situations.get(id)?.title ?? ""),
      ].join(" "),
    );
    return { s, score: [...wanted].filter((w) => text.has(w)).length };
  });
  const best = Math.max(...scored.map((x) => x.score));
  const pool = best > 0 ? scored.filter((x) => x.score === best).map((x) => x.s) : seeds;
  return deriveRng(masterSeed, "story", 0, "seed").pick(pool);
}

/** The seed's own plan with its people, for a story a person starts when the director couldn't. */
export function authoredPlan(index: WorldIndex, seed: SeedDef, length: StoryLength): StoryPlan {
  const plan = planFromSeed(seed, length);
  plan.cast = seed.cast.flatMap((id) => castFromWorld(index, id) ?? []);
  return plan;
}

export interface SeedArgs {
  llm: LlmGateway;
  log: Logger;
  scope: { guildId: string; campaignId: string };
  index: WorldIndex;
  telling: NarrationStory;
  seed: SeedDef;
  length: StoryLength;
  heroes: DirectorHero[];
  loom: LoomState;
  rules: TableRules;
  masterSeed: string;
  /** For a campaign already under way: what has happened, where the heroes are, and where they're heading. */
  underway?: {
    history: string[];
    heading: string[];
    regionId: string;
    scenesDone: number;
    chapter: number;
  };
}

/** Makes the campaign's own story from a seed and its heroes, with its first scene. */
export async function seedStory(
  args: SeedArgs,
): Promise<DirectorResult<{ plan: StoryPlan; opening: SceneSpec }>> {
  const { index, seed } = args;
  const startRegions = args.underway
    ? [args.underway.regionId, ...(index.regions.get(args.underway.regionId)?.edges.map((e) => e.to) ?? [])]
    : seed.startRegions;
  const places = startRegions.flatMap((id) => {
    const r = index.regions.get(id);
    return r
      ? [
          {
            regionId: id,
            regionName: r.name,
            description: clip(r.description, 300),
            pois: r.pois.map((p) => ({ id: p.id, name: p.name })),
          },
        ]
      : [];
  });
  const setPieces = fittingSetPieces(index, seed, new Set(startRegions), []).map((s) => ({
    id: s.id,
    title: s.title,
    regionId: s.region,
    summary: clip(s.summary, 240),
  }));
  const user: SeedPromptInput = {
    world: index.world,
    heroes: args.heroes.map((h) => ({
      ref: h.id,
      name: h.name,
      species: h.species,
      className: h.className,
      background: h.background,
      keepsake: h.keepsake,
      path: h.path,
      look: h.look,
    })),
    seed: {
      title: seed.title,
      pitch: seed.pitch.trim(),
      openings: seed.openings.map((o) => o.trim()),
      stakes: seed.stakes.trim(),
      fronts: seed.fronts.map((f) => ({
        id: f.id,
        name: f.name,
        goal: f.goal.trim(),
        portents: f.portents.map((p) => p.trim()),
        doom: f.doom.trim(),
        central: f.central,
      })),
      cast: seed.cast.flatMap((id) => {
        const npc = index.namedNpcs.get(id);
        return npc
          ? [
              {
                ref: id,
                name: npc.name,
                role: npc.role,
                description: clip(npc.description, 300),
                secret: npc.secret ? clip(npc.secret, 300) : null,
              },
            ]
          : [];
      }),
      mysteries: seed.mysteries.map((m) => ({
        id: m.id,
        question: m.question,
        truth: m.truth.trim(),
        clues: m.clues.map((c) => c.trim()),
      })),
      moments: seed.moments.map((m) => ({ id: m.id, title: m.title, when: m.when.trim() })),
    },
    places,
    setPieces,
    ...(args.underway ? { history: args.underway.history, heading: args.underway.heading } : {}),
  };
  return askDirector<SeedOutput, { plan: StoryPlan; opening: SceneSpec }>({
    llm: args.llm,
    log: args.log,
    scope: args.scope,
    index,
    telling: args.telling,
    user: seedUser(user),
    schema: SeedOutput,
    schemaName: "story_seed",
    expectTokens: 3500,
    accept: (out) => {
      const plan = authoredPlan(index, seed, args.length);
      if (args.underway) plan.chapter = { number: args.underway.chapter, title: seed.title };
      plan.pitch = clip(out.pitch, DIRECTOR_LIMITS.pitch) || plan.pitch;
      plan.stakes = clip(out.stakes, DIRECTOR_LIMITS.pitch) || plan.stakes;
      plan.storySoFar = clip(out.storySoFar, DIRECTOR_LIMITS.storySoFar);
      for (const f of out.fronts) {
        const front = plan.fronts.find((x) => x.id === f.id);
        if (front && f.portents.length === front.portents.length)
          front.portents = f.portents.map((p) => clip(p, DIRECTOR_LIMITS.portent));
      }
      for (const c of out.cast) {
        const member = plan.cast.find((x) => x.id === c.ref);
        if (!member) continue;
        member.role = clip(c.role, DIRECTOR_LIMITS.role) || member.role;
        member.agenda = clip(c.agenda, DIRECTOR_LIMITS.agenda) || member.agenda;
        member.voice = clip(c.voice, DIRECTOR_LIMITS.voice) || member.voice;
        member.secret = c.secret ? clip(c.secret, DIRECTOR_LIMITS.secret) : member.secret;
        member.attitude = Math.max(-3, Math.min(3, c.attitude));
      }
      for (const m of out.mysteries) {
        const mystery = plan.mysteries.find((x) => x.id === m.id);
        if (mystery && m.clues.length >= 3)
          mystery.clues = m.clues.slice(0, 8).map((text, i) => ({
            id: `${m.id}-${i + 1}`,
            text: clip(text, DIRECTOR_LIMITS.clue),
            found: false,
          }));
      }
      const heroIds = new Set(args.heroes.map((h) => h.id));
      plan.hooks = out.hooks
        .filter((h) => heroIds.has(h.heroRef))
        .map((h) => ({ heroId: h.heroRef, hook: clip(h.hook, DIRECTOR_LIMITS.hook) }));
      const opening = sceneFromDraft(
        {
          ...out.opening,
          newPeople: [...out.newCast, ...out.opening.newPeople].slice(0, DIRECTOR_LIMITS.newPeople),
        },
        {
          index,
          plan,
          loom: args.loom,
          rules: args.rules,
          telling: args.telling,
          regions: new Set(startRegions),
          temptations: new Set(),
          previousMoment: null,
          scenesDoneAfter: args.underway?.scenesDone ?? 0,
          heroNames: args.heroes.map((h) => h.name),
          rng: deriveRng(args.masterSeed, "story", 0, "director"),
        },
      );
      const problems = [
        ...opening.problems,
        ...(opening.spec?.momentId && !args.underway ? ["The opening can't be a decisive moment."] : []),
        ...safetyProblems(
          [
            plan.pitch,
            plan.stakes,
            plan.storySoFar,
            ...plan.fronts.flatMap((f) => f.portents),
            ...plan.cast.flatMap((c) => [c.role, c.agenda, c.voice, c.secret ?? ""]),
            ...plan.mysteries.flatMap((m) => m.clues.map((c) => c.text)),
            ...plan.hooks.map((h) => h.hook),
            ...draftTexts(out.opening),
            ...out.newCast.flatMap((p) => [p.name, p.role, p.agenda, p.voice, p.secret ?? ""]),
          ],
          index,
          args.telling,
        ),
      ];
      if (opening.dropped.length > 0) args.log.info("opening draft trimmed", { dropped: opening.dropped });
      return { value: opening.spec ? { plan, opening: opening.spec } : null, problems };
    },
  });
}

/** Set pieces that could fit where the heroes are: unused, in these regions, this seed's own first. */
function fittingSetPieces(
  index: WorldIndex,
  seed: SeedDef | undefined,
  regions: ReadonlySet<string>,
  used: string[],
) {
  const own = new Set(seed?.situations ?? []);
  return [...index.situations.values()]
    .filter((s) => regions.has(s.region) && !used.includes(s.id))
    .sort((a, b) => Number(own.has(b.id)) - Number(own.has(a.id)))
    .slice(0, 6);
}

// ------------------------------------------------------------ framing the next scene

export interface FrameArgs {
  llm: LlmGateway;
  log: Logger;
  scope: { guildId: string; campaignId: string };
  index: WorldIndex;
  telling: NarrationStory;
  plan: StoryPlan;
  story: StoryState;
  seq: number;
  /** The scene that's ending. */
  ended: SceneSpec;
  /** It, turn by turn, with how this last turn went (the fight, the decisive moment). */
  endedLog: string[];
  lastNarration: string;
  /** What the heroes chose as it ended. */
  heading: string[];
  heroes: DirectorHero[];
  loom: LoomState;
  /** The hidden hand thinks the heroes are due a temptation. */
  tempt: boolean;
  rules: TableRules;
  masterSeed: string;
}

export interface FrameResult {
  /** The plan with the scene that ended recorded and the next one's people in it. */
  plan: StoryPlan;
  next: SceneSpec;
  milestone: boolean;
  /** A new chapter's title, when one begins. */
  chapterTitle: string | null;
}

/** Frames the next scene from where the heroes chose to go, and keeps the story's memory. */
export async function frameNextScene(args: FrameArgs): Promise<DirectorResult<FrameResult>> {
  const { index, plan, story, ended } = args;
  const here = index.regions.get(ended.regionId) ?? index.regions.get(story.regionId);
  if (!here) return { ok: false, reasons: [`The heroes' region "${ended.regionId}" isn't in this world.`] };
  const nearbyIds = here.edges.map((e) => e.to);
  const regions = new Set([here.id, ...nearbyIds]);
  const scenesDoneAfter = story.scenesDone + 1;
  const seed = index.seeds.get(plan.seedId);
  const setPieces = fittingSetPieces(index, seed, regions, plan.usedSituations);
  const taken = new Set(args.loom.snares.map((s) => s.shortcutId).filter(Boolean));
  const castIds = new Set(plan.cast.filter((c) => c.status !== "defeated").map((c) => c.id));
  const temptations = [...index.shortcuts.values()]
    .filter(
      (s) =>
        !taken.has(s.id) &&
        s.minChapter <= plan.chapter.number &&
        (s.offeredBy.kind === "faction" ||
          (s.offeredBy.kind === "npc" && castIds.has(s.offeredBy.id)) ||
          (s.offeredBy.kind === "situation" && setPieces.some((p) => p.id === s.offeredBy.id))),
    )
    .slice(0, 4);
  const creatureIds = new Set([
    ...[here, ...nearbyIds.map((id) => index.regions.get(id))].flatMap(
      (r) => r?.encounters.table.map((e) => e.creature) ?? [],
    ),
    ...setPieces.flatMap((p) => p.foes?.map((f) => f.creature) ?? []),
  ]);
  const creatures = [...creatureIds]
    .map((id) => index.creatures.get(id))
    .filter((c): c is NonNullable<typeof c> => Boolean(c && creatureAllowed(c, args.rules)))
    .slice(0, 12)
    .map((c) => ({ id: c.id, name: c.name }));

  const regionView = (id: string) => index.regions.get(id);
  const user: FramePromptInput = {
    story: {
      title: plan.title,
      pitch: plan.pitch,
      stakes: plan.stakes,
      storySoFar: plan.storySoFar,
      scenesDone: story.scenesDone,
      scenesTarget: LENGTH_SCENES[plan.length],
      finaleAllowed: finaleAllowed(scenesDoneAfter, plan.length),
      chapter: `Chapter ${plan.chapter.number}: ${plan.chapter.title}`,
    },
    fronts: plan.fronts.map((f) => ({
      id: f.id,
      name: f.name,
      goal: f.goal,
      portents: f.portents,
      stage: f.stage,
      state: f.state,
      central: f.central,
    })),
    mysteries: plan.mysteries,
    cast: plan.cast.map((c) => ({
      ref: c.id,
      name: c.name,
      role: c.role,
      agenda: c.agenda,
      attitude: attitudeWord(c.attitude),
      status: c.status.replace("_", " "),
      where:
        c.status === "with_heroes"
          ? "with the heroes"
          : c.regionId
            ? `last seen in ${regionView(c.regionId)?.name ?? c.regionId}`
            : "whereabouts unknown",
    })),
    hooks: plan.hooks.map((h) => ({
      hero: args.heroes.find((x) => x.id === h.heroId)?.name ?? h.heroId,
      hook: h.hook,
    })),
    moments: momentsAhead(plan).map((m) => ({ id: m.id, title: m.title, when: m.when, finale: m.finale })),
    ended: {
      title: ended.title,
      question: ended.question,
      log: args.endedLog,
      lastNarration: args.lastNarration,
    },
    heading: args.heading,
    places: {
      here: {
        regionId: here.id,
        name: here.name,
        description: clip(here.description, 300),
        pois: here.pois.map((p) => ({ id: p.id, name: p.name, description: clip(p.description, 160) })),
      },
      nearby: here.edges.flatMap((e) => {
        const r = regionView(e.to);
        return r
          ? [
              {
                regionId: r.id,
                name: r.name,
                days: e.travelDays,
                road: e.road,
                pois: r.pois.map((p) => ({ id: p.id, name: p.name })),
              },
            ]
          : [];
      }),
    },
    setPieces: setPieces.map((p) => ({
      id: p.id,
      title: p.title,
      regionId: p.region,
      kind: p.kind,
      summary: clip(p.summary, 240),
    })),
    temptations: temptations.map((t) => ({ id: t.id, name: t.name, offer: clip(t.offer, 200) })),
    tempt: args.tempt,
    creatures,
  };

  return askDirector<FrameOutput, FrameResult>({
    llm: args.llm,
    log: args.log,
    scope: args.scope,
    index,
    telling: args.telling,
    user: frameUser(user),
    schema: FrameOutput,
    schemaName: "next_scene",
    expectTokens: 1800,
    accept: (out) => {
      const next = structuredClone(plan);
      next.storySoFar = clip(out.storySoFar, DIRECTOR_LIMITS.storySoFar) || plan.storySoFar;
      next.scenes = [
        ...next.scenes,
        {
          seq: args.seq,
          chapter: plan.chapter.number,
          title: ended.title,
          summary: clip(out.sceneSummary, DIRECTOR_LIMITS.sceneSummary),
        },
      ].slice(-MAX_SCENE_RECORDS);
      // At most one step per threat per scene.
      const moved = new Set<string>();
      for (const fc of out.frontChanges) {
        const front = next.fronts.find((f) => f.id === fc.front);
        if (front?.state !== "active" || fc.change === "none" || moved.has(front.id)) continue;
        moved.add(front.id);
        if (fc.change === "thwarted") front.state = "thwarted";
        else {
          front.stage += 1;
          if (front.stage >= front.portents.length) front.state = "doomed";
        }
      }
      // A decisive moment that went badly moves its threat on, if the director didn't.
      const played = ended.momentId ? next.moments.find((m) => m.id === ended.momentId) : undefined;
      if (played?.outcome === "fail_forward" && !moved.has(played.frontId)) {
        const front = next.fronts.find((f) => f.id === played.frontId);
        if (front?.state === "active") {
          front.stage += 1;
          if (front.stage >= front.portents.length) front.state = "doomed";
        }
      }
      // Milestones are earned: a decisive moment always is one; otherwise not two scenes running.
      const milestone = Boolean(played) || (out.milestone && scenesDoneAfter - story.lastMilestoneAt >= 2);
      const scenesThisChapter = next.scenes.filter((s) => s.chapter === plan.chapter.number).length;
      const chapterTitle =
        out.chapterTitle && (milestone || scenesThisChapter >= 4) ? clip(out.chapterTitle, 60) : null;
      if (chapterTitle) next.chapter = { number: plan.chapter.number + 1, title: chapterTitle };
      const drafted = sceneFromDraft(out.next, {
        index,
        plan: next,
        loom: args.loom,
        rules: args.rules,
        telling: args.telling,
        regions,
        temptations: new Set(temptations.map((t) => t.id)),
        previousMoment: ended.momentId,
        scenesDoneAfter,
        heroNames: args.heroes.map((h) => h.name),
        rng: deriveRng(args.masterSeed, "story", args.seq, "director"),
      });
      if (drafted.dropped.length > 0) args.log.info("scene draft trimmed", { dropped: drafted.dropped });
      const problems = [
        ...drafted.problems,
        ...safetyProblems(
          [next.storySoFar, out.sceneSummary, chapterTitle ?? "", ...draftTexts(out.next)],
          index,
          args.telling,
        ),
      ];
      return {
        value: drafted.spec ? { plan: next, next: drafted.spec, milestone, chapterTitle } : null,
        problems,
      };
    },
  });
}

/** Where the story could go next, for a person taking over a scene change the director couldn't frame. */
export function whereItCouldGo(index: WorldIndex, plan: StoryPlan | null, regionId: string): string[] {
  const out: string[] = [];
  const here = index.regions.get(regionId);
  if (here) {
    out.push(
      `Nearby: ${here.edges
        .map(
          (e) =>
            `${index.regions.get(e.to)?.name ?? e.to} (${e.travelDays} day${e.travelDays === 1 ? "" : "s"})`,
        )
        .join(", ")}.`,
    );
    if (here.pois.length > 0) out.push(`Places here: ${here.pois.map((p) => p.name).join(", ")}.`);
  }
  if (!plan) return out;
  for (const f of plan.fronts.filter((x) => x.state === "active")) {
    const next = f.portents[f.stage];
    if (next) out.push(`${f.name}, if nobody stops it: ${next}`);
  }
  for (const m of momentsAhead(plan).slice(0, 2)) out.push(`A decisive moment ahead, ${m.title}: ${m.when}`);
  const open = plan.mysteries.filter((m) => !m.solved).map((m) => m.question);
  if (open.length > 0) out.push(`Still unanswered: ${open.join(" ")}`);
  return out;
}
