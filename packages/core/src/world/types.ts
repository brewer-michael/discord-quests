import type {
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
  SeedDef,
  ShortcutDef,
  SituationDef,
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
  seeds: SeedDef[];
  situations: SituationDef[];
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
