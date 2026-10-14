export const SCENE_KINDS = ["exploration", "social", "combat", "travel", "rest", "crux", "choice"] as const;
export type SceneKind = (typeof SCENE_KINDS)[number];

export const CRUX_TYPES = ["overwhelming_odds", "race_against_clock", "hold_the_line", "last_step"] as const;
export type CruxType = (typeof CRUX_TYPES)[number];

export const BIOMES = [
  "village",
  "meadow",
  "forest",
  "marsh",
  "mountain",
  "coast",
  "desert",
  "fen",
  "ruins",
  "fortress",
  "volcano",
] as const;
export type Biome = (typeof BIOMES)[number];
