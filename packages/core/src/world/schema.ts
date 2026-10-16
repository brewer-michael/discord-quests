import { z } from "zod";
import { SHORTCUT_TAGS, SNARE_EFFECTS, SOCKET_TYPES, VIRTUE_TAGS } from "../loom/vocab";
import { ABILITIES } from "../rules/abilities";
import { CONDITIONS } from "../rules/conditions";
import { SKILL_IDS } from "../rules/skills";
import { SRD_CLASS_IDS } from "../srd/classes";
import { BIOMES, CRUX_TYPES, SCENE_KINDS } from "../story/vocab";

/**
 * The world file format. Every file in worlds/<id>/ is validated against these
 * schemas, then cross-checked by validate.ts.
 */

export const Id = z.string().regex(/^[a-z0-9][a-z0-9-]*$/, "ids are lowercase words joined by dashes");
const Text = z.string().min(1).max(4000);
const Short = z.string().min(1).max(200);
const Point = z.tuple([z.number(), z.number()]);

export const AbilityId = z.enum(ABILITIES);
export const SkillId = z.enum(SKILL_IDS as [string, ...string[]]);
export const ConditionId = z.enum(Object.keys(CONDITIONS) as [string, ...string[]]);
export const SceneKind = z.enum(SCENE_KINDS);
export const SocketType = z.enum(SOCKET_TYPES);
export const VirtueTag = z.enum(VIRTUE_TAGS);
export const ShortcutTag = z.enum(SHORTCUT_TAGS);
export const DeedTag = z.enum([...VIRTUE_TAGS, ...SHORTCUT_TAGS]);

const AbilityScores = z.strictObject({
  str: z.number().int().min(1).max(20),
  dex: z.number().int().min(1).max(20),
  con: z.number().int().min(1).max(20),
  int: z.number().int().min(1).max(20),
  wis: z.number().int().min(1).max(20),
  cha: z.number().int().min(1).max(20),
});
const AbilityIncrements = z.partialRecord(AbilityId, z.number().int().min(1).max(2));
const Dice = z.string().regex(/^[0-9dkhl+\- ]+$/, "dice notation like 2d6+1");

// ---------------------------------------------------------------- world.yaml

export const WorldMeta = z.strictObject({
  id: Id,
  name: Short,
  version: z.number().int().min(1),
  tagline: Short,
  summary: Text,
  audience: z.enum(["family", "teen"]),
  startRegion: Id,
  startingLevel: z.number().int().min(1).max(3).default(1),
  maxLevel: z.number().int().min(1).max(10).default(10),
  artStyle: Text,
  themes: z.array(Short).min(1),
  storyteller: z.strictObject({ name: Short, voice: Text }),
});
export type WorldMeta = z.infer<typeof WorldMeta>;

// -------------------------------------------------------- content-rules.yaml

const ContentLevel = z.strictObject({
  description: Text,
  rules: z.array(Text).min(1),
  /** Narrator guidance at this intensity: avoid X, say Y instead. */
  substitutions: z.array(z.strictObject({ avoid: Short, prefer: Short })).default([]),
  /** Words narration and players avoid at this intensity only. Authored world text avoids them everywhere. */
  bannedTerms: z.array(z.string().min(2)).default([]),
});

export const ContentRules = z.strictObject({
  /** Rules that hold at every intensity: nothing grotesque, nothing sexual, no detailed dark magic, and so on. */
  hardLimits: z.array(Text).min(1),
  levels: z.strictObject({ light: ContentLevel, classic: ContentLevel, epic: ContentLevel }),
  /** Words that never appear in narration, player text or authored text, at any intensity. */
  bannedTerms: z.array(z.string().min(2)),
});
export type ContentRules = z.infer<typeof ContentRules>;

// -------------------------------------------------------------- classes.yaml

export const ClassDef = z.strictObject({
  id: Id,
  srdClass: z.enum(SRD_CLASS_IDS),
  name: Short,
  tagline: Short,
  description: Text,
  startingKit: z.strictObject({
    weapons: z.array(Id).min(1),
    armor: Id.nullable(),
    shield: z.boolean(),
    gear: z.array(Id),
  }),
  suggestedSkills: z.array(SkillId),
  suggestedSpells: z.array(Id).default([]),
  /** How a hero of this class looks in pictures: clothing and gear only, never age or pose. */
  portraitPrompt: Text,
});
export type ClassDef = z.infer<typeof ClassDef>;

// ---------------------------------------------------------------- paths.yaml

const PerkEffect = z.discriminatedUnion("kind", [
  z.strictObject({ kind: z.literal("advantage_vs_condition"), condition: ConditionId }),
  z.strictObject({ kind: z.literal("reroll_failed_check"), usesPerLongRest: z.number().int().min(1).max(3) }),
  z.strictObject({ kind: z.literal("help_bonus"), amount: z.number().int().min(1).max(3) }),
  z.strictObject({ kind: z.literal("temp_hp_on_rest"), amount: z.number().int().min(1).max(10) }),
  z.strictObject({ kind: z.literal("flavor") }),
]);

export const PathDef = z.strictObject({
  id: z.enum(["long-road", "quick-way"]),
  name: Short,
  tagline: Short,
  description: Text,
  perks: z.array(z.strictObject({ id: Id, name: Short, description: Text, effect: PerkEffect })).min(1),
});
export type PathDef = z.infer<typeof PathDef>;

// ---------------------------------------------------------- backgrounds.yaml

export const BackgroundDef = z.strictObject({
  id: Id,
  name: Short,
  description: Text,
  abilities: z.tuple([AbilityId, AbilityId, AbilityId]),
  skills: z.tuple([SkillId, SkillId]),
  keepsakeSuggestions: z.array(Id),
});
export type BackgroundDef = z.infer<typeof BackgroundDef>;

// -------------------------------------------------------------- species.yaml

const TraitEffect = z.discriminatedUnion("kind", [
  z.strictObject({ kind: z.literal("darkvision"), range: z.number().int() }),
  z.strictObject({ kind: z.literal("hp_per_level"), amount: z.number().int().min(1).max(2) }),
  z.strictObject({ kind: z.literal("lucky") }),
  z.strictObject({ kind: z.literal("skill"), skill: SkillId }),
  z.strictObject({ kind: z.literal("advantage_vs_condition"), condition: ConditionId }),
  z.strictObject({ kind: z.literal("flavor") }),
]);

export const SpeciesDef = z.strictObject({
  id: Id,
  name: Short,
  description: Text,
  size: z.enum(["small", "medium"]),
  speed: z.number().int().min(20).max(40),
  traits: z.array(z.strictObject({ id: Id, name: Short, description: Text, effect: TraitEffect })),
  /** What these people look like in pictures, as grown-ups (heroes are adults unless a player says otherwise). */
  looks: Short.optional(),
});
export type SpeciesDef = z.infer<typeof SpeciesDef>;

// ---------------------------------------------------------------- items.yaml

export const RARITIES = ["common", "uncommon", "rare", "very-rare"] as const;

const ItemEffect = z.discriminatedUnion("kind", [
  z.strictObject({ kind: z.literal("heal"), dice: Dice }),
  z.strictObject({ kind: z.literal("light"), radius: z.number().int() }),
  z.strictObject({
    kind: z.literal("bonus"),
    to: z.enum(["ac", "attack", "save", "check"]),
    amount: z.number().int().min(1).max(3),
    skill: SkillId.optional(),
  }),
  z.strictObject({ kind: z.literal("cure_condition"), condition: ConditionId }),
  z.strictObject({ kind: z.literal("story") }),
]);

export const ItemsFile = z.strictObject({
  weapons: z.array(z.strictObject({ id: Id, name: Short, base: Id, description: Text })),
  armor: z.array(z.strictObject({ id: Id, name: Short, base: Id, description: Text })),
  gear: z.array(z.strictObject({ id: Id, name: Short, description: Text, value: z.number().min(0) })),
  keepsakes: z.array(z.strictObject({ id: Id, name: Short, description: Text })),
  wondrous: z.array(
    z.strictObject({ id: Id, name: Short, rarity: z.enum(RARITIES), description: Text, effect: ItemEffect }),
  ),
  consumables: z.array(
    z.strictObject({ id: Id, name: Short, rarity: z.enum(RARITIES), description: Text, effect: ItemEffect }),
  ),
  lootTables: z.array(
    z.strictObject({
      id: Id,
      gold: Dice.optional(),
      entries: z.array(
        z.strictObject({
          item: Id,
          weight: z.number().positive(),
          qty: z.tuple([z.number().int(), z.number().int()]).optional(),
        }),
      ),
    }),
  ),
});
export type ItemsFile = z.infer<typeof ItemsFile>;

// ------------------------------------------------------------ creatures.yaml

export const CreatureDef = z.strictObject({
  id: Id,
  name: Short,
  description: Text,
  kind: z.enum(["beast", "critter", "shadow", "person", "construct", "spirit"]),
  size: z.enum(["tiny", "small", "medium", "large", "huge"]),
  cr: z.enum(["0", "1/8", "1/4", "1/2", "1", "2", "3", "4", "5", "6", "7", "8"]),
  ac: z.number().int().min(5).max(25),
  hp: Dice,
  speed: z.number().int().min(0).max(120),
  abilities: AbilityScores,
  attacks: z
    .array(
      z.strictObject({
        name: Short,
        bonus: z.number().int().min(-2).max(15),
        damage: Dice,
        damageType: Short,
        range: z.tuple([z.number().int(), z.number().int()]).optional(),
        effect: z.strictObject({ condition: ConditionId, save: AbilityId, dc: z.number().int() }).optional(),
      }),
    )
    .min(1),
  traits: z.array(z.strictObject({ name: Short, description: Text })).default([]),
  morale: z.enum(["brave", "normal", "skittish"]),
  defeat: z.enum(["faints", "flees", "surrenders", "poofs"]),
  /** The faction it serves, if any. Sparing it counts as mercy toward that faction. */
  faction: Id.optional(),
  tags: z.array(Id).default([]),
});
export type CreatureDef = z.infer<typeof CreatureDef>;

// ------------------------------------------------------- guided-options.yaml

export const GuidedOptions = z.strictObject({
  upbringings: z
    .array(
      z.strictObject({
        id: Id,
        label: Short,
        description: Text,
        scores: AbilityScores,
        classAffinity: z.array(Id).min(1),
      }),
    )
    .min(3),
  abilityFlavor: z.strictObject(
    Object.fromEntries(ABILITIES.map((a) => [a, z.strictObject({ plus2: Short, plus1: Short })])) as Record<
      (typeof ABILITIES)[number],
      z.ZodObject<{ plus2: typeof Short; plus1: typeof Short }>
    >,
  ),
  asiOptions: z
    .array(z.strictObject({ id: Id, label: Short, description: Text, increments: AbilityIncrements }))
    .min(6),
});
export type GuidedOptions = z.infer<typeof GuidedOptions>;

// ------------------------------------------------------------ shortcuts.yaml

const Due = z.discriminatedUnion("kind", [
  z.strictObject({ kind: z.literal("crux") }),
  z.strictObject({ kind: z.literal("anchor_reappears") }),
  z.strictObject({ kind: z.literal("after_beats"), beats: z.number().int().min(1).max(12) }),
  z.strictObject({ kind: z.literal("chapter_end") }),
]);

const ShortcutBenefit = z.discriminatedUnion("kind", [
  z.strictObject({ kind: z.literal("advantage_rolls"), count: z.number().int().min(1).max(5) }),
  z.strictObject({ kind: z.literal("skip_travel"), maxDays: z.number().int().min(1).max(5) }),
  z.strictObject({ kind: z.literal("item"), item: Id }),
  z.strictObject({ kind: z.literal("reveal_secret") }),
  z.strictObject({ kind: z.literal("temp_hp"), amount: z.number().int().min(1).max(20) }),
  z.strictObject({ kind: z.literal("auto_success"), checks: z.number().int().min(1).max(2) }),
  z.strictObject({ kind: z.literal("gold"), amount: z.number().int().min(1).max(500) }),
]);

export const ShortcutDef = z.strictObject({
  id: Id,
  name: Short,
  tag: ShortcutTag,
  offeredBy: z.strictObject({ kind: z.enum(["npc", "faction", "situation"]), id: Id }),
  offer: Text,
  price: z.strictObject({
    kind: z.enum(["keepsake", "trust", "promise", "favor_owed", "item", "gold", "none"]),
    detail: Text,
  }),
  benefit: ShortcutBenefit,
  snare: z.strictObject({
    severity: z.number().int().min(1).max(3),
    due: Due,
    effect: z.enum(SNARE_EFFECTS),
    socket: SocketType.optional(),
    faction: Id.optional(),
    hint: Text,
  }),
  contexts: z.array(SceneKind).min(1),
  minChapter: z.number().int().min(1).default(1),
});
export type ShortcutDef = z.infer<typeof ShortcutDef>;

// ---------------------------------------------------------- deflections.yaml

export const Deflections = z.strictObject({ lines: z.array(Text).min(5) });

// --------------------------------------------------------- regions/*.yaml

export const RegionDef = z.strictObject({
  id: Id,
  name: Short,
  description: Text,
  biome: z.enum(BIOMES),
  terrain: z.array(Id).min(1),
  levelBand: z.tuple([z.number().int().min(1), z.number().int().max(10)]),
  polygon: z.array(Point).min(3),
  centroid: Point,
  edges: z.array(z.strictObject({ to: Id, travelDays: z.number().int().min(1).max(10), road: z.boolean() })),
  pois: z.array(
    z.strictObject({
      id: Id,
      name: Short,
      description: Text,
      kind: z.enum(["town", "landmark", "dungeon", "camp", "shrine", "secret"]),
      at: Point.optional(),
    }),
  ),
  encounters: z.strictObject({
    chance: z.number().min(0).max(1),
    table: z.array(
      z.strictObject({
        creature: Id,
        count: z.tuple([z.number().int().min(1), z.number().int().max(8)]),
        weight: z.number().positive(),
      }),
    ),
  }),
  lootTable: Id.optional(),
  secrets: z.array(Text).default([]),
  artPrompt: Text,
  mood: Short,
});
export type RegionDef = z.infer<typeof RegionDef>;

// -------------------------------------------------------- factions/*.yaml

export const FactionDef = z.strictObject({
  id: Id,
  name: Short,
  alignment: z.enum(["long-road", "quick-way", "antagonist", "neutral"]),
  description: Text,
  goals: z.array(Text).min(1),
  methods: z.array(Text).min(1),
  leader: Id.optional(),
  clocks: z
    .array(
      z.strictObject({
        id: Id,
        name: Short,
        segments: z.number().int().min(4).max(12),
        description: Text,
        onFill: Text,
      }),
    )
    .default([]),
  startingDisposition: z.number().int().min(-3).max(3).default(0),
});
export type FactionDef = z.infer<typeof FactionDef>;

// ----------------------------------------------------- npcs/archetypes.yaml

export const NpcsFile = z.strictObject({
  archetypes: z.array(
    z.strictObject({
      id: Id,
      label: Short,
      description: Text,
      namePool: z.array(Short).min(3),
      quirks: z.array(Short).min(2),
      voice: Text,
      creature: Id.optional(),
      faction: Id.optional(),
      tags: z.array(Id).default([]),
    }),
  ),
  named: z.array(
    z.strictObject({
      id: Id,
      name: Short,
      archetype: Id,
      description: Text,
      region: Id,
      faction: Id.optional(),
      role: Short,
      tags: z.array(Id).default([]),
      secret: Text.optional(),
      creature: Id.optional(),
    }),
  ),
});
export type NpcsFile = z.infer<typeof NpcsFile>;

// ----------------------------------------------------------- arc/act*.yaml

export const CruxSpec = z.strictObject({
  type: z.enum(CRUX_TYPES),
  check: z.strictObject({
    ability: AbilityId,
    skill: SkillId.optional(),
    label: Short,
    dc: z.strictObject({
      base: z.number().int().min(5).max(30),
      perEnemyClockSegment: z.number().min(0).max(3).default(0),
      perSnareSeverity: z.number().min(0).max(3).default(0),
      max: z.number().int().min(10).max(35).default(30),
    }),
  }),
  clock: z.strictObject({ faction: Id, clock: Id }).optional(),
  sockets: z
    .array(
      z.strictObject({
        type: SocketType,
        accepts: z.array(VirtueTag).min(1),
        anchorTag: Id.optional(),
        faction: Id.optional(),
        hint: Text,
      }),
    )
    .min(2),
  requiredGrace: z.number().min(0.1).max(5),
  onSuccess: Text,
  onCostlySuccess: Text,
  onFailForward: z.strictObject({ beat: Id.optional(), text: Text }),
});
export type CruxSpec = z.infer<typeof CruxSpec>;

export const BeatDef = z.strictObject({
  id: Id,
  title: Short,
  kind: SceneKind,
  region: Id,
  poi: Id.optional(),
  summary: Text,
  goals: z.array(Text).min(1),
  requires: z.array(Id).default([]),
  optional: z.boolean().default(false),
  milestone: z.boolean().default(false),
  quest: z.strictObject({ id: Id, title: Short, objective: Text }).optional(),
  offersShortcuts: z.array(Id).default([]),
  introduces: z.array(Id).default([]),
  /** Open needs that a quiet-hand detour could later fill. */
  sockets: z.array(SocketType).default([]),
  /** Chances for virtue the scene is built around (for the director and the sim). */
  virtueOpportunities: z
    .array(z.strictObject({ tag: VirtueTag, target: Id.optional(), note: Text }))
    .default([]),
  decisive: z.boolean().default(false),
  /** Played only when a failed crux's onFailForward sends the story here. */
  branch: z.boolean().default(false),
  crux: CruxSpec.optional(),
  /** Who the heroes face in a combat beat (counts are for a party of three). Defaults to the region's table. */
  foes: z
    .array(
      z.strictObject({ creature: Id, count: z.tuple([z.number().int().min(1), z.number().int().max(8)]) }),
    )
    .optional(),
});
export type BeatDef = z.infer<typeof BeatDef>;

export const ActDef = z.strictObject({
  id: Id,
  number: z.number().int().min(1).max(5),
  title: Short,
  summary: Text,
  /** Outlined acts have chapters with fewer details; the director fills them in. */
  detail: z.enum(["full", "outline"]),
  chapters: z
    .array(
      z.strictObject({
        id: Id,
        number: z.number().int().min(1),
        title: Short,
        summary: Text,
        regions: z.array(Id).min(1),
        beats: z.array(BeatDef).min(1),
      }),
    )
    .min(1),
});
export type ActDef = z.infer<typeof ActDef>;

// ---------------------------------------------------- providence/*.yaml

export const DetourDef = z.strictObject({
  id: Id,
  when: z.strictObject({ sceneKinds: z.array(SceneKind).min(1), terrain: z.array(Id).default([]) }),
  setup: Text,
  serves: z.array(SocketType).min(1),
  introduces: z.strictObject({
    kind: z.enum(["npc", "place", "item"]),
    archetype: Id.optional(),
    name: Short,
    tags: z.array(Id).default([]),
  }),
  payoff: Text,
  severity: z.enum(["mild", "moderate"]),
});
export type DetourDef = z.infer<typeof DetourDef>;

export const PayoffsFile = z.strictObject({
  sockets: z.array(
    z.strictObject({
      type: SocketType,
      label: Short,
      description: Text,
      narrationHint: Text,
      accepts: z.array(VirtueTag).min(1),
    }),
  ),
});
export type PayoffsFile = z.infer<typeof PayoffsFile>;

export const EpilogueLines = z.strictObject({
  subtle: z.array(Text).min(3),
  explicit: z.array(Text).min(2),
  echoes: z.array(Text).min(2),
  closing: z.array(Text).min(2),
});
export type EpilogueLines = z.infer<typeof EpilogueLines>;

// -------------------------------------------------------------- map/map.yaml

export const MapDef = z.strictObject({
  title: Short,
  width: z.number().int().min(400).max(4000),
  height: z.number().int().min(300).max(4000),
  colors: z.strictObject({ sea: z.string(), land: z.string(), ink: z.string(), fog: z.string() }),
  baseImage: z.string().optional(),
  compass: Point,
});
export type MapDef = z.infer<typeof MapDef>;
