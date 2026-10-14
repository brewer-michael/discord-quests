import { parseDocument } from "yaml";
import { z } from "zod";
import {
  ActDef,
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
  ShortcutDef,
  SpeciesDef,
  WorldMeta,
} from "./schema";
import type { World, WorldIssue } from "./types";
import { validateWorld } from "./validate";

/**
 * Loads a world from a map of relative path -> file contents. Pure: the caller
 * reads the files (see tools/world-validate.ts and the engine's world cache).
 */
export function loadWorld(files: Record<string, string>): { world: World | null; issues: WorldIssue[] } {
  const issues: WorldIssue[] = [];

  function parse<S extends z.ZodType>(file: string, schema: S): z.output<S> | null {
    const text = files[file];
    if (text === undefined) {
      issues.push({ file, path: "", message: "file is missing", severity: "error" });
      return null;
    }
    const doc = parseDocument(text, { prettyErrors: true });
    if (doc.errors.length > 0) {
      for (const err of doc.errors) issues.push({ file, path: "", message: err.message, severity: "error" });
      return null;
    }
    const result = schema.safeParse(doc.toJS());
    if (!result.success) {
      for (const issue of result.error.issues) {
        issues.push({ file, path: issue.path.join("."), message: issue.message, severity: "error" });
      }
      return null;
    }
    return result.data;
  }

  function parseMany<S extends z.ZodType>(prefix: string, schema: S): z.output<S>[] {
    const out: z.output<S>[] = [];
    const matches = Object.keys(files)
      .filter((f) => f.startsWith(prefix) && f.endsWith(".yaml"))
      .sort();
    if (matches.length === 0)
      issues.push({ file: prefix, path: "", message: "no files found", severity: "error" });
    for (const file of matches) {
      const value = parse(file, schema);
      if (value !== null) out.push(value);
    }
    return out;
  }

  const listOf = <S extends z.ZodType>(schema: S) => z.array(schema);

  const meta = parse("world.yaml", WorldMeta);
  const content = parse("content-rules.yaml", ContentRules);
  const classes = parse("classes.yaml", listOf(ClassDef));
  const paths = parse("paths.yaml", listOf(PathDef));
  const backgrounds = parse("backgrounds.yaml", listOf(BackgroundDef));
  const species = parse("species.yaml", listOf(SpeciesDef));
  const items = parse("items.yaml", ItemsFile);
  const creatures = parse("creatures.yaml", listOf(CreatureDef));
  const guided = parse("guided-options.yaml", GuidedOptions);
  const shortcuts = parse("shortcuts.yaml", listOf(ShortcutDef));
  const deflections = parse("deflections.yaml", Deflections);
  const regions = parseMany("regions/", RegionDef);
  const factions = parseMany("factions/", FactionDef);
  const npcs = parse("npcs/archetypes.yaml", NpcsFile);
  const acts = parseMany("arc/", ActDef);
  const detours = parse("providence/detours.yaml", listOf(DetourDef));
  const payoffs = parse("providence/payoffs.yaml", PayoffsFile);
  const epilogue = parse("providence/epilogue-lines.yaml", EpilogueLines);
  const map = parse("map/map.yaml", MapDef);
  const tone = files["tone.md"];
  if (tone === undefined)
    issues.push({ file: "tone.md", path: "", message: "file is missing", severity: "error" });

  const lore: Record<string, string> = {};
  for (const [file, text] of Object.entries(files)) {
    if (file.startsWith("lore/") && file.endsWith(".md")) lore[file.slice(5, -3)] = text;
  }

  if (
    issues.some((i) => i.severity === "error") ||
    !meta ||
    !content ||
    !classes ||
    !paths ||
    !backgrounds ||
    !species ||
    !items ||
    !creatures ||
    !guided ||
    !shortcuts ||
    !deflections ||
    !npcs ||
    !detours ||
    !payoffs ||
    !epilogue ||
    !map ||
    tone === undefined
  ) {
    return { world: null, issues };
  }

  const world: World = {
    meta,
    tone,
    content,
    classes,
    paths,
    backgrounds,
    species,
    items,
    creatures,
    guided,
    shortcuts,
    deflections: deflections.lines,
    regions,
    factions,
    npcs,
    acts,
    detours,
    payoffs,
    epilogue,
    map,
    lore,
  };
  issues.push(...validateWorld(world));
  return { world: issues.some((i) => i.severity === "error") ? null : world, issues };
}
