import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { starterIndex } from "../loom/test-helpers";
import { checkNarration, checkPlayerText, isMetaProbe } from "./index";

const world = starterIndex().world;
const lines = (name: string) =>
  readFileSync(new URL(`./corpus/${name}`, import.meta.url), "utf8")
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l && !l.startsWith("#"));

describe("safety corpus (local layer, no AI)", () => {
  it.each(lines("player-blocked-language.txt"))("blocks strong language: %s", (text) => {
    expect(checkPlayerText(text, world).allow).toBe(false);
  });

  it.each(lines("player-pii.txt"))("blocks real-life details: %s", (text) => {
    const v = checkPlayerText(text, world);
    expect(v.allow).toBe(false);
    expect(v.findings.map((f) => f.category)).toContain("personal_info");
  });

  it.each(lines("player-meta.txt"))("notices questions about hidden mechanics: %s", (text) => {
    expect(isMetaProbe(text) || checkPlayerText(text, world).metaProbe).toBe(true);
  });

  it.each(lines("player-allowed.txt"))("lets ordinary adventure through: %s", (text) => {
    const v = checkPlayerText(text, world);
    expect(v.findings).toEqual([]);
    expect(v.metaProbe).toBe(false);
  });

  it.each(lines("narration-leaks.txt"))("catches narration that gives the hidden hand away: %s", (text) => {
    expect(checkNarration(text, world, { intensity: "light" }).ok).toBe(false);
  });

  it.each(lines("narration-clean.txt"))("leaves ordinary storytelling alone: %s", (text) => {
    expect(checkNarration(text, world, { intensity: "light" }).findings).toEqual([]);
  });

  it.each(world.meta.themes)("never turns back the world's own themes: %s", (theme) => {
    expect(checkNarration(theme, world, { intensity: "light" }).findings).toEqual([]);
  });
});
