import { SRD_BESTIARY } from "../srd/bestiary.generated";
import type { World } from "./types";

/** Lookup tables over a loaded world. Build once and reuse. */
export interface WorldIndex {
  world: World;
  regions: Map<string, World["regions"][number]>;
  /** The world's own creatures and, unless it opts out, the SRD bestiary. */
  factions: Map<string, World["factions"][number]>;
  classes: Map<string, World["classes"][number]>;
  backgrounds: Map<string, World["backgrounds"][number]>;
  species: Map<string, World["species"][number]>;
  creatures: Map<string, World["creatures"][number]>;
  shortcuts: Map<string, World["shortcuts"][number]>;
  detours: Map<string, World["detours"][number]>;
  archetypes: Map<string, World["npcs"]["archetypes"][number]>;
  namedNpcs: Map<string, World["npcs"]["named"][number]>;
  seeds: Map<string, World["seeds"][number]>;
  situations: Map<string, World["situations"][number]>;
  items: Map<string, { id: string; name: string; kind: ItemKind; rarity?: string; description: string }>;
  pois: Map<string, { regionId: string; poi: World["regions"][number]["pois"][number] }>;
}

export type ItemKind = "weapon" | "armor" | "gear" | "keepsake" | "wondrous" | "consumable";

function byId<T extends { id: string }>(list: readonly T[]): Map<string, T> {
  return new Map(list.map((x) => [x.id, x]));
}

export function indexWorld(world: World): WorldIndex {
  const items: WorldIndex["items"] = new Map();
  for (const x of world.items.weapons) items.set(x.id, { ...x, kind: "weapon" });
  for (const x of world.items.armor) items.set(x.id, { ...x, kind: "armor" });
  for (const x of world.items.gear) items.set(x.id, { ...x, kind: "gear" });
  for (const x of world.items.keepsakes) items.set(x.id, { ...x, kind: "keepsake" });
  for (const x of world.items.wondrous) items.set(x.id, { ...x, kind: "wondrous" });
  for (const x of world.items.consumables) items.set(x.id, { ...x, kind: "consumable" });

  const pois: WorldIndex["pois"] = new Map();
  for (const region of world.regions)
    for (const poi of region.pois) pois.set(poi.id, { regionId: region.id, poi });

  return {
    world,
    regions: byId(world.regions),
    factions: byId(world.factions),
    classes: byId(world.classes),
    backgrounds: byId(world.backgrounds),
    species: byId(world.species),
    creatures: byId([...(world.meta.srdBestiary ? SRD_BESTIARY : []), ...world.creatures]),
    shortcuts: byId(world.shortcuts),
    detours: byId(world.detours),
    archetypes: byId(world.npcs.archetypes),
    namedNpcs: byId(world.npcs.named),
    seeds: byId(world.seeds),
    situations: byId(world.situations),
    items,
    pois,
  };
}
