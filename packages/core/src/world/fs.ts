/**
 * Node-only helper for reading a world folder from disk. Kept out of the pure
 * world index so browser and test code can load worlds from memory instead.
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { parse } from "yaml";

/** Reads one YAML file from disk, for tools that work alongside the world files (the bestiary's curation). */
export function readYamlFile(path: string): unknown {
  return parse(readFileSync(path, "utf8"));
}

export function readWorldFiles(dir: string): Record<string, string> {
  const files: Record<string, string> = {};
  const walk = (d: string) => {
    for (const name of readdirSync(d).sort()) {
      const full = join(d, name);
      if (statSync(full).isDirectory()) walk(full);
      else if (name.endsWith(".yaml") || name.endsWith(".md")) {
        files[relative(dir, full).split("\\").join("/")] = readFileSync(full, "utf8");
      }
    }
  };
  walk(dir);
  return files;
}
