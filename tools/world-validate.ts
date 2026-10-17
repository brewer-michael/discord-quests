/**
 * Validates a world folder: `pnpm world:validate [worlds/<id>]`.
 * Exits non-zero on any error. Warnings are printed but do not fail.
 */
import { readdirSync } from "node:fs";
import { join } from "node:path";
import { loadWorld } from "@dq/core/world";
import { readWorldFiles } from "@dq/core/world-fs";

const dirs = process.argv.slice(2);
const targets = dirs.length > 0 ? dirs : readdirSync("worlds").map((d) => join("worlds", d));
let failed = false;
for (const dir of targets) {
  const { world, issues } = loadWorld(readWorldFiles(dir));
  for (const issue of issues) {
    const tag = issue.severity === "error" ? "ERROR" : "warn ";
    console.log(`${tag} ${dir}/${issue.file}${issue.path ? ` [${issue.path}]` : ""}: ${issue.message}`);
  }
  const errors = issues.filter((i) => i.severity === "error").length;
  if (world) {
    console.log(
      `ok    ${dir}: ${world.meta.name} v${world.meta.version} - ${world.regions.length} regions, ${world.seeds.length} story seeds, ${world.situations.length} set pieces, ${world.creatures.length} creatures`,
    );
  }
  if (errors > 0 || !world) failed = true;
}
process.exit(failed ? 1 : 0);
