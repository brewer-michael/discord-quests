/**
 * Writes JSON Schemas for the world files to schemas/, so editors with the YAML
 * language server can autocomplete and check world files as you type.
 * Run with `pnpm world:schemas`.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import {
  BackgroundDef,
  ClassDef,
  ContentRules,
  CreatureDef,
  Deflections,
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
} from "@dq/core/world";
import { z } from "zod";

const schemas: Record<string, z.ZodType> = {
  world: WorldMeta,
  "content-rules": ContentRules,
  classes: z.array(ClassDef),
  paths: z.array(PathDef),
  backgrounds: z.array(BackgroundDef),
  species: z.array(SpeciesDef),
  items: ItemsFile,
  creatures: z.array(CreatureDef),
  "guided-options": GuidedOptions,
  shortcuts: z.array(ShortcutDef),
  deflections: Deflections,
  region: RegionDef,
  faction: FactionDef,
  npcs: NpcsFile,
  seed: SeedDef,
  situations: z.array(SituationDef),
  detours: z.array(DetourDef),
  payoffs: PayoffsFile,
  "epilogue-lines": EpilogueLines,
  map: MapDef,
};

mkdirSync("schemas", { recursive: true });
for (const [name, schema] of Object.entries(schemas)) {
  const json = z.toJSONSchema(schema, { io: "input", unrepresentable: "any" });
  writeFileSync(`schemas/${name}.schema.json`, `${JSON.stringify(json, null, 2)}\n`);
}
console.log(`wrote ${Object.keys(schemas).length} schemas to schemas/`);
