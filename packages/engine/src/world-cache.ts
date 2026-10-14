import { existsSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { hashHex } from "@dq/core/rng";
import { indexWorld, loadWorld, type WorldIndex } from "@dq/core/world";
import { readWorldFiles } from "@dq/core/world-fs";

export const DEFAULT_WORLDS_DIR = fileURLToPath(new URL("../../../worlds", import.meta.url));
export const DEFAULT_WORLD_ID = "lanternreach";

export interface LoadedWorld {
  index: WorldIndex;
  /** Content hash; campaigns pin the version they started with. */
  version: string;
}

/** Loads world folders once and keeps them in memory. */
export class WorldCache {
  private readonly cache = new Map<string, LoadedWorld>();

  constructor(private readonly dir = process.env.WORLDS_DIR ?? DEFAULT_WORLDS_DIR) {}

  get(worldId: string): LoadedWorld {
    const hit = this.cache.get(worldId);
    if (hit) return hit;
    if (!/^[a-z0-9-]+$/.test(worldId)) throw new Error(`bad world id "${worldId}"`);
    const path = join(this.dir, worldId);
    if (!existsSync(path)) throw new Error(`world "${worldId}" not found in ${this.dir}`);
    const files = readWorldFiles(path);
    const { world, issues } = loadWorld(files);
    if (!world) {
      const errors = issues.filter((i) => i.severity === "error").slice(0, 5);
      throw new Error(
        `world "${worldId}" failed to load: ${errors.map((e) => `${e.file} ${e.path} ${e.message}`).join("; ")}`,
      );
    }
    const version = hashHex(
      Object.keys(files)
        .sort()
        .map((k) => `${k}\n${files[k]}`)
        .join("\n"),
    );
    const loaded = { index: indexWorld(world), version };
    this.cache.set(worldId, loaded);
    return loaded;
  }
}
