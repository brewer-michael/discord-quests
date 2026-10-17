import { fileURLToPath } from "node:url";
import { beforeAll, describe, expect, it } from "vitest";
import { planFromSeed } from "../story/living";
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
  it("loads cleanly, with campaign seeds and set pieces instead of a fixed arc", () => {
    expect(world.meta.id).toBe("lanternreach");
    expect(world.seeds.length).toBeGreaterThanOrEqual(4);
    expect(world.situations.length).toBeGreaterThan(20);
  });

  it("gives every seed one central trouble, mysteries with three ways in, and a finale last", () => {
    for (const seed of world.seeds) {
      expect(seed.fronts.filter((f) => f.central)).toHaveLength(1);
      for (const m of seed.mysteries) expect(m.clues.length).toBeGreaterThanOrEqual(3);
      expect(seed.moments.at(-1)?.finale).toBe(true);
      expect(seed.moments.filter((m) => m.finale)).toHaveLength(1);
    }
  });

  it("lets mercy reach every finale", () => {
    for (const seed of world.seeds) {
      const finale = seed.moments.at(-1);
      expect(
        finale?.crux.sockets.some((s) => s.accepts.includes("mercy")),
        seed.id,
      ).toBe(true);
    }
  });

  it("starts every seed somewhere new heroes can survive", () => {
    const idx = indexWorld(world);
    for (const seed of world.seeds)
      for (const r of seed.startRegions)
        expect(idx.regions.get(r)?.levelBand[0], `${seed.id} ${r}`).toBeLessThanOrEqual(2);
  });

  it("turns a seed into a story plan with numbered clues and every moment ahead", () => {
    const seed = world.seeds.find((s) => s.id === "the-dimming");
    if (!seed) throw new Error("no seed");
    const plan = planFromSeed(seed, "standard");
    expect(plan.mysteries[0]?.clues[0]?.id).toBe("the-missing-coal-1");
    expect(plan.moments.every((m) => m.state === "ahead")).toBe(true);
    expect(plan.fronts.every((f) => f.stage === 0 && f.state === "active")).toBe(true);
  });
});

describe("seeds and set pieces are checked", () => {
  it("rejects a seed with two central troubles or a finale that isn't last", () => {
    const w = clone(world);
    const seed = w.seeds[0];
    if (!seed) throw new Error("no seed");
    for (const f of seed.fronts) f.central = true;
    seed.moments.reverse();
    const errors = errorsOf(w).join("\n");
    expect(errors).toMatch(/exactly one front must be central/);
    expect(errors).toMatch(/finale, and it comes last/);
  });

  it("rejects a set piece in a place that doesn't exist, or a fight with no foes", () => {
    const w = clone(world);
    const fight = w.situations.find((s) => s.kind === "combat");
    if (!fight) throw new Error("no fight");
    fight.foes = [];
    const talk = w.situations.find((s) => s.kind === "social");
    if (talk) talk.poi = "nowhere-at-all";
    const errors = errorsOf(w).join("\n");
    expect(errors).toMatch(/a combat situation needs foes/);
    expect(errors).toMatch(/unknown poi "nowhere-at-all"/);
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

  it("rejects unknown references in set pieces", () => {
    const w = clone(world);
    const situation = w.situations[0];
    if (situation) situation.introduces = ["nobody-at-all"];
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
    for (const sit of w.situations) sit.sockets = sit.sockets.filter((s) => s !== "ambush_avoided");
    for (const seed of w.seeds)
      for (const m of seed.moments)
        m.crux.sockets = m.crux.sockets.filter((s) => s.type !== "ambush_avoided");
    expect(errorsOf(w).some((m) => m.includes("serves no socket"))).toBe(true);
  });

  it("reports YAML syntax errors with the file name", () => {
    const broken = { ...files, "world.yaml": "id: [unclosed" };
    const { world: w, issues } = loadWorld(broken);
    expect(w).toBeNull();
    expect(issues.some((i) => i.file === "world.yaml")).toBe(true);
  });
});
