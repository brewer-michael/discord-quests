/**
 * The bestiary at the table: which creatures may turn up where, and for whom. A region's biome and terrain say
 * which habitats it has; a campaign's intensity and its "leave out" topics say which creatures may appear; the
 * party's levels say how strong they can be (the balance then decides how many, and how tough).
 */
import type { Rng } from "../rng/index";
import type { CreatureDef, HABITATS } from "../world/schema";
import { creatureXp, type Difficulty, xpBudget } from "./balance";
import { type FoeTableEntry, rollFoes } from "./index";

export type Habitat = (typeof HABITATS)[number];
export type Intensity = "light" | "classic" | "epic";

const RANK: Record<Intensity, number> = { light: 0, classic: 1, epic: 2 };

/** World biomes and terrain words, as habitats. A word that is already a habitat stands for itself. */
const TERRAIN_HABITATS: Record<string, Habitat[]> = {
  village: ["town", "meadow"],
  town: ["town"],
  city: ["town"],
  meadow: ["meadow"],
  grassland: ["meadow"],
  plains: ["meadow"],
  farmland: ["meadow"],
  forest: ["forest"],
  woods: ["forest"],
  marsh: ["marsh"],
  fen: ["marsh"],
  swamp: ["marsh"],
  bog: ["marsh"],
  hills: ["hills"],
  mountain: ["mountain", "hills"],
  cliffs: ["coast", "mountain"],
  coast: ["coast"],
  beach: ["coast"],
  sea: ["sea", "coast"],
  ocean: ["sea"],
  desert: ["desert"],
  dunes: ["desert"],
  ruins: ["ruins"],
  fortress: ["ruins", "caves"],
  castle: ["ruins", "town"],
  volcano: ["volcano", "mountain"],
  mine: ["caves"],
  cave: ["caves"],
  caves: ["caves"],
  underground: ["caves"],
  stream: ["river", "forest"],
  river: ["river"],
  lake: ["river"],
  arctic: ["arctic"],
  tundra: ["arctic"],
  snow: ["arctic", "mountain"],
};

export function regionHabitats(region: { biome: string; terrain: readonly string[] }): Set<Habitat> {
  return new Set([region.biome, ...region.terrain].flatMap((t) => TERRAIN_HABITATS[t] ?? []));
}

/** What a table allows: how dark the story is told, and the topics it asked to leave out. */
export interface TableRules {
  intensity: Intensity;
  avoid: readonly string[];
}

export function creatureAllowed(c: CreatureDef, rules: TableRules): boolean {
  return RANK[c.minIntensity] <= RANK[rules.intensity] && !rules.avoid.some((t) => matchesTopic(c, t));
}

const STOP = new Set(["the", "and", "any", "with", "for", "all", "being", "big", "giant", "small"]);
const singular = (w: string) =>
  w.endsWith("ves") ? `${w.slice(0, -3)}f` : w.endsWith("ies") ? `${w.slice(0, -3)}y` : w.replace(/e?s$/, "");
const words = (s: string) =>
  s
    .toLowerCase()
    .split(/[^a-z]+/)
    .filter((w) => w.length >= 3 && !STOP.has(w))
    .map(singular);

/** Whether a topic the table left out ("spiders", "the undead", "snakes") names this creature. */
export function matchesTopic(c: CreatureDef, topic: string): boolean {
  const mine = new Set([...words(c.name), ...words(c.id), ...c.tags.flatMap(words), ...words(c.kind)]);
  return words(topic).some((w) => mine.has(w));
}

/**
 * A wild encounter in a region: now from the world's own table for it, now from the creatures that live in
 * its habitats, as many as the budget might allow (the balance trims it). Empty if nothing fits.
 */
export function pickWild(args: {
  creatures: ReadonlyMap<string, CreatureDef>;
  region: {
    biome: string;
    terrain: readonly string[];
    encounters: { table: readonly FoeTableEntry[] };
  };
  levels: readonly number[];
  difficulty: Difficulty;
  rules: TableRules;
  rng: Rng;
}): Array<{ creature: CreatureDef; count: number }> {
  const { creatures, region, rules, rng } = args;
  const budget = xpBudget(args.levels, args.difficulty);
  const usable = (c: CreatureDef | undefined): c is CreatureDef =>
    Boolean(c) && creatureAllowed(c as CreatureDef, rules);
  const authored = region.encounters.table.filter((e) => usable(creatures.get(e.creature)));
  const habitats = regionHabitats(region);
  const wild = [...creatures.values()].filter(
    (c) =>
      !c.friendly &&
      !c.tags.includes("boss") &&
      c.habitats.some((h) => habitats.has(h)) &&
      creatureAllowed(c, rules) &&
      creatureXp(c) * 0.5 <= budget &&
      creatureXp(c) >= budget / 10,
  );
  if (authored.length > 0 && (wild.length === 0 || rng.chance(0.5))) {
    return rollFoes(authored, args.levels.length, rng, "pick-one").flatMap((t) => {
      const creature = creatures.get(t.creature);
      return creature ? [{ creature, count: t.count }] : [];
    });
  }
  if (wild.length === 0) return [];
  const creature = rng.pick(wild);
  return [
    { creature, count: Math.min(4, Math.max(1, Math.floor(budget / Math.max(1, creatureXp(creature))))) },
  ];
}
