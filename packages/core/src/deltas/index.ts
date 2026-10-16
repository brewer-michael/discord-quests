import { z } from "zod";
import { CONDITIONS, type Condition } from "../rules/conditions";
import type { WorldIndex } from "../world/index-world";

/**
 * Changes the narrator proposes to game state. Nothing the narrator says
 * changes state until it passes validateDeltas: the narrator describes, the
 * rules engine decides.
 */
const conditionIds = Object.keys(CONDITIONS) as [Condition, ...Condition[]];

export const DeltaProposal = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("hp_change"),
    characterId: z.string(),
    amount: z.number().int(),
    source: z.enum(["combat", "hazard", "heal", "rest"]),
  }),
  z.object({
    kind: z.literal("condition"),
    characterId: z.string(),
    condition: z.enum(conditionIds),
    action: z.enum(["add", "remove"]),
  }),
  z.object({
    kind: z.literal("item_grant"),
    characterId: z.string(),
    itemId: z.string(),
    qty: z.number().int(),
  }),
  z.object({
    kind: z.literal("item_remove"),
    characterId: z.string(),
    itemId: z.string(),
    qty: z.number().int(),
  }),
  z.object({ kind: z.literal("gold"), characterId: z.string(), amount: z.number().int() }),
  z.object({ kind: z.literal("xp_milestone"), beatId: z.string() }),
  z.object({
    kind: z.literal("npc_status"),
    npcId: z.string(),
    status: z.enum(["active", "fled", "captured", "befriended", "away", "defeated"]),
  }),
  z.object({ kind: z.literal("npc_disposition"), npcId: z.string(), delta: z.number().int() }),
  z.object({ kind: z.literal("move_party"), regionId: z.string(), poiId: z.string().nullable() }),
  z.object({ kind: z.literal("reveal_region"), regionId: z.string() }),
  z.object({
    kind: z.literal("quest_update"),
    questId: z.string(),
    status: z.enum(["active", "completed", "failed"]),
    note: z.string().nullable(),
  }),
  z.object({ kind: z.literal("promise_made"), npcId: z.string(), text: z.string() }),
  z.object({ kind: z.literal("promise_resolved"), promiseId: z.string(), kept: z.boolean() }),
  z.object({
    kind: z.literal("introduce_entity"),
    entityKind: z.enum(["npc", "place", "item"]),
    name: z.string(),
    description: z.string(),
    tags: z.array(z.string()),
  }),
  z.object({
    kind: z.literal("flag"),
    key: z.string(),
    value: z.union([z.string(), z.number(), z.boolean()]),
  }),
]);
export type DeltaProposal = z.infer<typeof DeltaProposal>;

export interface CharacterView {
  level: number;
  hp: number;
  hpMax: number;
  gold: number;
  inventory: ReadonlyMap<string, number>;
}

export interface DeltaContext {
  index: WorldIndex;
  partyRegionId: string;
  characters: ReadonlyMap<string, CharacterView>;
  /** Hit point changes the rules engine computed this turn (authoritative). */
  ruledHpChanges: ReadonlyMap<string, number>;
  /** Items that can be found in this scene (loot table rolls, NPC inventories). */
  allowedLoot: ReadonlySet<string>;
  /** Beats the director has marked complete this turn, which may award a milestone. */
  milestoneBeats: ReadonlySet<string>;
  sceneHasHazard: boolean;
  npcs: ReadonlyMap<string, { protected: boolean }>;
  quests: ReadonlySet<string>;
  promises: ReadonlySet<string>;
  knownEntityNames: ReadonlySet<string>;
  bannedTerms: readonly string[];
}

export interface DeltaValidation {
  accepted: DeltaProposal[];
  rejected: Array<{ delta: DeltaProposal; reason: string }>;
}

const RARITY_RANK = { common: 0, uncommon: 1, rare: 2, "very-rare": 3 } as const;

export function maxRarityForLevel(level: number): number {
  if (level <= 4) return RARITY_RANK.uncommon;
  if (level <= 8) return RARITY_RANK.rare;
  return RARITY_RANK["very-rare"];
}

export const MAX_ITEMS_PER_SCENE = 4;
export const HAZARD_DAMAGE_MAX = 4;

function containsBanned(text: string, banned: readonly string[]): string | null {
  for (const term of banned) {
    if (new RegExp(`\\b${term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "i").test(text)) return term;
  }
  return null;
}

export function validateDeltas(proposals: readonly DeltaProposal[], ctx: DeltaContext): DeltaValidation {
  const accepted: DeltaProposal[] = [];
  const rejected: DeltaValidation["rejected"] = [];
  const reject = (delta: DeltaProposal, reason: string) => rejected.push({ delta, reason });
  let itemsGranted = 0;
  const goldGained = new Map<string, number>();
  const introduced = new Set<string>();

  for (const d of proposals) {
    switch (d.kind) {
      case "hp_change": {
        const ch = ctx.characters.get(d.characterId);
        if (!ch) {
          reject(d, "unknown character");
          break;
        }
        const ruled = ctx.ruledHpChanges.get(d.characterId);
        if (ruled !== undefined) {
          if (ruled === d.amount) accepted.push(d);
          else reject(d, `hit points must match the rules (${ruled})`);
          break;
        }
        if (d.source === "hazard" && ctx.sceneHasHazard && d.amount < 0 && -d.amount <= HAZARD_DAMAGE_MAX) {
          accepted.push(d);
          break;
        }
        reject(d, "hit point changes come from the rules engine");
        break;
      }
      case "condition":
        if (!ctx.characters.has(d.characterId)) reject(d, "unknown character");
        else if (d.condition === "dazed") reject(d, "only the rules engine can daze a hero");
        else accepted.push(d);
        break;
      case "item_grant": {
        const ch = ctx.characters.get(d.characterId);
        const item = ctx.index.items.get(d.itemId);
        if (!ch) reject(d, "unknown character");
        else if (!item) reject(d, `unknown item "${d.itemId}"`);
        else if (d.qty < 1 || d.qty > 3) reject(d, "quantity must be 1-3");
        else if (itemsGranted >= MAX_ITEMS_PER_SCENE) reject(d, "too many items this scene");
        else if (!ctx.allowedLoot.has(d.itemId)) reject(d, "item is not available in this scene");
        else if (
          item.rarity &&
          RARITY_RANK[item.rarity as keyof typeof RARITY_RANK] > maxRarityForLevel(ch.level)
        ) {
          reject(d, "item is too rare for this level");
        } else {
          itemsGranted += 1;
          accepted.push(d);
        }
        break;
      }
      case "item_remove": {
        const ch = ctx.characters.get(d.characterId);
        if (!ch) reject(d, "unknown character");
        else if ((ch.inventory.get(d.itemId) ?? 0) < d.qty || d.qty < 1)
          reject(d, "character doesn't have that");
        else accepted.push(d);
        break;
      }
      case "gold": {
        const ch = ctx.characters.get(d.characterId);
        if (!ch) {
          reject(d, "unknown character");
          break;
        }
        if (d.amount < 0) {
          if (-d.amount > ch.gold) reject(d, "not enough gold");
          else accepted.push(d);
          break;
        }
        const total = (goldGained.get(d.characterId) ?? 0) + d.amount;
        if (total > 50 * ch.level) reject(d, "too much gold for one scene");
        else {
          goldGained.set(d.characterId, total);
          accepted.push(d);
        }
        break;
      }
      case "xp_milestone":
        if (ctx.milestoneBeats.has(d.beatId) && ctx.index.beats.get(d.beatId)?.beat.milestone)
          accepted.push(d);
        else reject(d, "milestones are awarded by the story director");
        break;
      case "npc_status": {
        const npc = ctx.npcs.get(d.npcId);
        if (!npc && !ctx.index.namedNpcs.has(d.npcId)) reject(d, "unknown npc");
        else if (npc?.protected && (d.status === "defeated" || d.status === "captured")) {
          accepted.push({ ...d, status: "fled" });
        } else accepted.push(d);
        break;
      }
      case "npc_disposition":
        if (Math.abs(d.delta) > 2) reject(d, "disposition changes by at most 2");
        else accepted.push(d);
        break;
      case "move_party": {
        const region = ctx.index.regions.get(d.regionId);
        if (!region) {
          reject(d, "unknown region");
          break;
        }
        const here = ctx.index.regions.get(ctx.partyRegionId);
        const adjacent = d.regionId === ctx.partyRegionId || here?.edges.some((e) => e.to === d.regionId);
        if (!adjacent) reject(d, "the party can only travel to a neighboring region");
        else if (d.poiId && ctx.index.pois.get(d.poiId)?.regionId !== d.regionId)
          reject(d, "that place isn't in that region");
        else accepted.push(d);
        break;
      }
      case "reveal_region": {
        const here = ctx.index.regions.get(ctx.partyRegionId);
        if (!ctx.index.regions.has(d.regionId)) reject(d, "unknown region");
        else if (d.regionId !== ctx.partyRegionId && !here?.edges.some((e) => e.to === d.regionId)) {
          reject(d, "only neighboring regions can be revealed");
        } else accepted.push(d);
        break;
      }
      case "quest_update":
        if (ctx.quests.has(d.questId)) accepted.push(d);
        else reject(d, "unknown quest");
        break;
      case "promise_made":
        if (d.text.length > 200) reject(d, "promise text too long");
        else if (!ctx.npcs.has(d.npcId) && !ctx.index.namedNpcs.has(d.npcId)) reject(d, "unknown npc");
        else accepted.push(d);
        break;
      case "promise_resolved":
        if (ctx.promises.has(d.promiseId)) accepted.push(d);
        else reject(d, "unknown promise");
        break;
      case "introduce_entity": {
        const name = d.name.trim();
        const banned = containsBanned(`${name} ${d.description}`, ctx.bannedTerms);
        const key = name.toLowerCase();
        if (name.length < 2 || name.length > 40) reject(d, "name must be 2-40 characters");
        else if (d.description.length > 300) reject(d, "description too long");
        else if (banned) reject(d, `uses banned term "${banned}"`);
        else if (ctx.knownEntityNames.has(key) || introduced.has(key))
          reject(d, "that name is already in use");
        else {
          introduced.add(key);
          accepted.push({ ...d, name });
        }
        break;
      }
      case "flag":
        if (/^[a-z0-9_.-]{1,40}$/.test(d.key)) accepted.push(d);
        else reject(d, "bad flag key");
        break;
    }
  }
  return { accepted, rejected };
}
