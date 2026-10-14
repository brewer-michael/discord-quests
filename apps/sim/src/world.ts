import { fileURLToPath } from "node:url";
import { indexWorld, loadWorld, type WorldIndex } from "@dq/core/world";
import { readWorldFiles } from "@dq/core/world-fs";

export function loadIndex(
  dir = fileURLToPath(new URL("../../../worlds/lanternreach", import.meta.url)),
): WorldIndex {
  const { world, issues } = loadWorld(readWorldFiles(dir));
  if (!world) {
    throw new Error(
      `World failed to load:\n${issues.map((i) => `${i.file} ${i.path}: ${i.message}`).join("\n")}`,
    );
  }
  return indexWorld(world);
}
