import { fileURLToPath } from "node:url";
import { beforeAll, describe, expect, it } from "vitest";
import { chapterComplete, finalCrux, nextPlayableBeat } from "../story/progress";
import { readWorldFiles } from "./fs";
import { indexWorld } from "./index-world";
import { loadWorld } from "./load";
import type { World } from "./types";
import { validateWorld } from "./validate";

const WORLD_DIR = fileURLToPath(new URL("../../../../worlds/lanternreach", import.meta.url));

let files: Record<string, string>;
let world: World;

beforeAll(() => {
  files = readWorldFiles(WORLD_DIR);
  const loaded = loadWorld(files);
  expect(loaded.issues.filter((i) => i.severity === "error")).toEqual([]);
  world = loaded.world as World;
});

const clone = (w: World): World => structuredClone(w);
const errorsOf = (w: World) =>
  validateWorld(w)
    .filter((i) => i.severity === "error")
    .map((i) => i.message);

describe("starter world", () => {
  it("loads cleanly", () => {
    expect(world.meta.id).toBe("lanternreach");
    expect(world.acts).toHaveLength(3);
  });

  it("indexes beats in story order", () => {
    const idx = indexWorld(world);
    expect(idx.beatOrder[0]?.beat.id).toBe("ch1-the-last-flame");
    expect(idx.beatOrder.at(-1)?.beat.id).toBe("ch8-the-long-road-home");
    expect(finalCrux(idx)?.beat.id).toBe("ch8-the-last-step");
    expect(idx.beats.get("ch3-the-siege-of-lantern-hall")?.beat.crux?.type).toBe("hold_the_line");
  });

  it("has one decisive crux per act, and the last one is the last_step", () => {
    const idx = indexWorld(world);
    const cruxes = idx.beatOrder.filter((b) => b.beat.decisive);
    expect(cruxes.map((c) => c.act.id)).toEqual(["act1", "act2", "act3", "act3"]);
    expect(cruxes.at(-1)?.beat.crux?.type).toBe("last_step");
  });

  it("introduces Snibbet early and lets mercy reach the final crux", () => {
    const idx = indexWorld(world);
    expect(idx.namedNpcs.get("snibbet")?.tags).toContain("covets-ember");
    const last = idx.beats.get("ch8-the-last-step")?.beat.crux;
    expect(last?.sockets.some((s) => s.accepts.includes("mercy") && s.anchorTag === "covets-ember")).toBe(
      true,
    );
  });
});

describe("branches", () => {
  it("are played only when a failed crux opens them", () => {
    const idx = indexWorld(world);
    const upToFinale = idx.beatOrder.filter((b) => !b.beat.branch).map((b) => b.beat.id);
    expect(nextPlayableBeat(idx, upToFinale)).toBeNull();
    expect(nextPlayableBeat(idx, upToFinale, ["ch8-the-long-road-home"])?.beat.id).toBe(
      "ch8-the-long-road-home",
    );
    expect(chapterComplete(idx, "ch8", new Set(upToFinale))).toBe(true);
  });

  it("must be reachable, and only from an earlier crux", () => {
    const w = clone(world);
    const act3 = w.acts.find((a) => a.number === 3)!;
    const last = act3.chapters.at(-1)!;
    const crux = last.beats.find((b) => b.id === "ch8-the-last-step")!.crux!;
    crux.onFailForward.beat = undefined;
    expect(errorsOf(w).join("\n")).toMatch(/branch beat is not the onFailForward of any crux/);
    crux.onFailForward.beat = "ch8-the-thousand-steps";
    expect(errorsOf(w).join("\n")).toMatch(/must be a later branch beat/);
  });
});

describe("world validation catches mistakes", () => {
  it("rejects asymmetric map edges", () => {
    const w = clone(world);
    w.regions[0]?.edges.push({ to: "gloamhold", travelDays: 1, road: true });
    expect(errorsOf(w).some((m) => m.includes("no matching edge back"))).toBe(true);
  });

  it("rejects illegal guided upbringings", () => {
    const w = clone(world);
    const up = w.guided.upbringings[0];
    if (up) up.scores = { str: 15, dex: 15, con: 15, int: 10, wis: 8, cha: 8 };
    expect(errorsOf(w).some((m) => m.includes("27-point"))).toBe(true);
  });

  it("rejects unknown references in beats", () => {
    const w = clone(world);
    const beat = w.acts[0]?.chapters[0]?.beats[0];
    if (beat) beat.introduces = ["nobody-at-all"];
    expect(errorsOf(w).some((m) => m.includes("unknown npc"))).toBe(true);
  });

  it("rejects banned terms in authored text", () => {
    const w = clone(world);
    if (w.regions[0]) w.regions[0].description = "A village where the geese were killed.";
    expect(errorsOf(w).some((m) => m.includes('banned term "killed"'))).toBe(true);
  });

  it("rejects class kits the class can't use", () => {
    const w = clone(world);
    const wizard = w.classes.find((c) => c.id === "lorewright");
    if (wizard) wizard.startingKit.armor = "warden-mail";
    expect(errorsOf(w).some((m) => m.includes("not trained in heavy armor"))).toBe(true);
  });

  it("rejects detours that serve nothing", () => {
    const w = clone(world);
    for (const act of w.acts)
      for (const ch of act.chapters)
        for (const b of ch.beats) {
          b.sockets = b.sockets.filter((s) => s !== "ambush_avoided");
        }
    expect(errorsOf(w).some((m) => m.includes("serves no socket"))).toBe(true);
  });

  it("reports YAML syntax errors with the file name", () => {
    const broken = { ...files, "world.yaml": "id: [unclosed" };
    const { world: w, issues } = loadWorld(broken);
    expect(w).toBeNull();
    expect(issues.some((i) => i.file === "world.yaml")).toBe(true);
  });
});
