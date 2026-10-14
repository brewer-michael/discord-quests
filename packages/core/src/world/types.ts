import type {
  ActDef,
  BackgroundDef,
  ClassDef,
  ContentRules,
  CreatureDef,
  DetourDef,
  EpilogueLines,
  FactionDef,
  GuidedOptions,
  ItemsFile,
  MapDef,
  NpcsFile,
  PathDef,
  PayoffsFile,
  RegionDef,
  ShortcutDef,
  SpeciesDef,
  WorldMeta,
} from "./schema";

export interface World {
  meta: WorldMeta;
  tone: string;
  content: ContentRules;
  classes: ClassDef[];
  paths: PathDef[];
  backgrounds: BackgroundDef[];
  species: SpeciesDef[];
  items: ItemsFile;
  creatures: CreatureDef[];
  guided: GuidedOptions;
  shortcuts: ShortcutDef[];
  deflections: string[];
  regions: RegionDef[];
  factions: FactionDef[];
  npcs: NpcsFile;
  acts: ActDef[];
  detours: DetourDef[];
  payoffs: PayoffsFile;
  epilogue: EpilogueLines;
  map: MapDef;
  lore: Record<string, string>;
}

export interface WorldIssue {
  file: string;
  path: string;
  message: string;
  severity: "error" | "warning";
}

export type Beat = ActDef["chapters"][number]["beats"][number];
export type Chapter = ActDef["chapters"][number];

export interface BeatRef {
  act: ActDef;
  chapter: Chapter;
  beat: Beat;
  /** Position of the beat in story order, 0-based, across all acts. */
  order: number;
}
