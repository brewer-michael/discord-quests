import { z } from "zod";
import { CONDITIONS, type Condition } from "../rules/conditions";
import type { WorldIndex } from "../world/index-world";
import { CAST_STATUSES } from "./living";

/**
 * What the storyteller says changed this turn. Nothing it says changes the game until it passes validateChanges:
 * the storyteller describes, the engine decides.
 */
const conditionIds = Object.keys(CONDITIONS) as [Condition, ...Condition[]];

export const StoryChange = z.discriminatedUnion("kind", [
  /** Someone present feels warmer or cooler toward the heroes (-2 to 2). */
  z.object({ kind: z.literal("attitude"), who: z.string(), by: z.number().int() }),
  /** Someone joins the heroes, leaves, flees, is captured or is beaten. */
  z.object({ kind: z.literal("whereabouts"), who: z.string(), status: z.enum(CAST_STATUSES) }),
  /** The heroes found one of the clues this scene holds. */
  z.object({ kind: z.literal("clue"), clue: z.string() }),
  z.object({ kind: z.literal("promise"), who: z.string(), text: z.string() }),
  z.object({ kind: z.literal("promise_settled"), promise: z.string(), kept: z.boolean() }),
  /** A hero gains something the scene allows. */
  z.object({ kind: z.literal("item"), hero: z.string(), item: z.string() }),
  /** A hero uses up or gives away something they carry. */
  z.object({ kind: z.literal("item_used"), hero: z.string(), item: z.string() }),
  z.object({ kind: z.literal("gold"), hero: z.string(), amount: z.number().int() }),
  z.object({ kind: z.literal("new_person"), name: z.string(), description: z.string() }),
  z.object({ kind: z.literal("new_place"), name: z.string(), description: z.string() }),
  z.object({ kind: z.literal("new_thing"), name: z.string(), description: z.string() }),
  /** The heroes take up a goal. */
  z.object({ kind: z.literal("goal"), title: z.string(), objective: z.string() }),
  /** A goal is achieved (done) or lost (not done). */
  z.object({ kind: z.literal("goal_done"), goal: z.string(), done: z.boolean() }),
  /** A fight breaks out with foes the scene allows; it starts with the next round. */
  z.object({ kind: z.literal("fight"), foes: z.array(z.string()) }),
  /** A small hurt from the scene's danger (a fall, a scald), never from a fight. */
  z.object({ kind: z.literal("hazard"), hero: z.string(), amount: z.number().int() }),
  z.object({
    kind: z.literal("condition"),
    hero: z.string(),
    condition: z.enum(conditionIds),
    add: z.boolean(),
  }),
]);
export type StoryChange = z.infer<typeof StoryChange>;

export interface HeroView {
  level: number;
  gold: number;
  inventory: ReadonlyMap<string, number>;
}

export interface ChangeContext {
  index: WorldIndex;
  heroes: ReadonlyMap<string, HeroView>;
  /** People in this campaign's story; protected ones (the hidden hand needs them) flee rather than fall. */
  cast: ReadonlyMap<string, { protected: boolean }>;
  /** Who is in the scene right now. Only they can change how they feel or where they go. */
  present: ReadonlySet<string>;
  /** Clue ids this scene holds that haven't been found yet. */
  clues: ReadonlySet<string>;
  /** Items that can be found in this scene. */
  allowedLoot: ReadonlySet<string>;
  /** Creatures that can fight here. */
  foes: ReadonlySet<string>;
  /** A fight is already on. */
  fighting: boolean;
  promises: ReadonlySet<string>;
  goals: ReadonlySet<string>;
  knownNames: ReadonlySet<string>;
  bannedTerms: readonly string[];
  sceneHasHazard: boolean;
}

export interface ChangeValidation {
  accepted: StoryChange[];
  rejected: Array<{ change: StoryChange; reason: string }>;
}

const RARITY_RANK = { common: 0, uncommon: 1, rare: 2, "very-rare": 3 } as const;

export function maxRarityForLevel(level: number): number {
  if (level <= 4) return RARITY_RANK.uncommon;
  if (level <= 8) return RARITY_RANK.rare;
  return RARITY_RANK["very-rare"];
}

export const MAX_ITEMS_PER_TURN = 3;
export const HAZARD_DAMAGE_MAX = 4;
export const MAX_FIGHT_FOES = 6;

function containsBanned(text: string, banned: readonly string[]): string | null {
  for (const term of banned) {
    if (new RegExp(`\\b${term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "i").test(text)) return term;
  }
  return null;
}

export function validateChanges(changes: readonly StoryChange[], ctx: ChangeContext): ChangeValidation {
  const accepted: StoryChange[] = [];
  const rejected: ChangeValidation["rejected"] = [];
  const reject = (change: StoryChange, reason: string) => rejected.push({ change, reason });
  let items = 0;
  let fight = false;
  const goldGained = new Map<string, number>();
  const introduced = new Set<string>();
  const cluesFound = new Set<string>();

  const newEntity = (c: Extract<StoryChange, { name: string }>) => {
    const name = c.name.trim();
    const key = name.toLowerCase();
    const banned = containsBanned(`${name} ${c.description}`, ctx.bannedTerms);
    if (name.length < 2 || name.length > 40) reject(c, "name must be 2-40 characters");
    else if (c.description.length > 300) reject(c, "description too long");
    else if (banned) reject(c, `uses banned term "${banned}"`);
    else if (ctx.knownNames.has(key) || introduced.has(key)) reject(c, "that name is already in use");
    else {
      introduced.add(key);
      accepted.push({ ...c, name });
    }
  };

  for (const c of changes) {
    switch (c.kind) {
      case "attitude":
        if (!ctx.present.has(c.who)) reject(c, "only someone in the scene can change how they feel");
        else if (c.by === 0 || Math.abs(c.by) > 2) reject(c, "attitude changes by 1 or 2");
        else accepted.push(c);
        break;
      case "whereabouts": {
        if (!ctx.present.has(c.who)) {
          reject(c, "only someone in the scene can come or go");
          break;
        }
        const guarded = ctx.cast.get(c.who)?.protected;
        if (guarded && (c.status === "defeated" || c.status === "captured"))
          accepted.push({ ...c, status: "fled" });
        else accepted.push(c);
        break;
      }
      case "clue":
        if (!ctx.clues.has(c.clue)) reject(c, "that clue isn't here to find");
        else if (cluesFound.has(c.clue)) reject(c, "already found");
        else {
          cluesFound.add(c.clue);
          accepted.push(c);
        }
        break;
      case "promise":
        if (c.text.trim().length < 3 || c.text.length > 200)
          reject(c, "promise text must be 3-200 characters");
        else if (!ctx.present.has(c.who)) reject(c, "promises are made to someone in the scene");
        else accepted.push(c);
        break;
      case "promise_settled":
        if (ctx.promises.has(c.promise)) accepted.push(c);
        else reject(c, "unknown promise");
        break;
      case "item": {
        const hero = ctx.heroes.get(c.hero);
        const item = ctx.index.items.get(c.item);
        if (!hero) reject(c, "unknown hero");
        else if (!item) reject(c, `unknown item "${c.item}"`);
        else if (items >= MAX_ITEMS_PER_TURN) reject(c, "too many items this turn");
        else if (!ctx.allowedLoot.has(c.item)) reject(c, "that item isn't to be found here");
        else if (
          item.rarity &&
          RARITY_RANK[item.rarity as keyof typeof RARITY_RANK] > maxRarityForLevel(hero.level)
        )
          reject(c, "item is too rare for this level");
        else {
          items += 1;
          accepted.push(c);
        }
        break;
      }
      case "item_used": {
        const hero = ctx.heroes.get(c.hero);
        if (!hero) reject(c, "unknown hero");
        else if ((hero.inventory.get(c.item) ?? 0) < 1) reject(c, "the hero doesn't have that");
        else accepted.push(c);
        break;
      }
      case "gold": {
        const hero = ctx.heroes.get(c.hero);
        if (!hero) {
          reject(c, "unknown hero");
          break;
        }
        if (c.amount < 0) {
          if (-c.amount > hero.gold) reject(c, "not enough gold");
          else accepted.push(c);
          break;
        }
        const total = (goldGained.get(c.hero) ?? 0) + c.amount;
        if (total > 50 * hero.level) reject(c, "too much gold for one turn");
        else {
          goldGained.set(c.hero, total);
          accepted.push(c);
        }
        break;
      }
      case "new_person":
      case "new_place":
      case "new_thing":
        newEntity(c);
        break;
      case "goal": {
        const banned = containsBanned(`${c.title} ${c.objective}`, ctx.bannedTerms);
        if (c.title.trim().length < 3 || c.title.length > 60) reject(c, "goal title must be 3-60 characters");
        else if (c.objective.length > 240) reject(c, "objective too long");
        else if (banned) reject(c, `uses banned term "${banned}"`);
        else accepted.push(c);
        break;
      }
      case "goal_done":
        if (ctx.goals.has(c.goal)) accepted.push(c);
        else reject(c, "unknown goal");
        break;
      case "fight": {
        const foes = c.foes.filter((f) => ctx.foes.has(f)).slice(0, MAX_FIGHT_FOES);
        if (ctx.fighting) reject(c, "a fight is already on");
        else if (fight) reject(c, "one fight at a time");
        else if (foes.length === 0) reject(c, "none of those foes can fight here");
        else {
          fight = true;
          accepted.push({ ...c, foes });
        }
        break;
      }
      case "hazard":
        if (!ctx.heroes.has(c.hero)) reject(c, "unknown hero");
        else if (!ctx.sceneHasHazard) reject(c, "nothing here can hurt the heroes but a fight");
        else if (c.amount <= 0 || c.amount > HAZARD_DAMAGE_MAX)
          reject(c, `a hazard hurts 1-${HAZARD_DAMAGE_MAX}`);
        else accepted.push(c);
        break;
      case "condition":
        if (!ctx.heroes.has(c.hero)) reject(c, "unknown hero");
        else if (c.condition === "dazed") reject(c, "only the rules engine can do that");
        else accepted.push(c);
        break;
    }
  }
  return { accepted, rejected };
}
