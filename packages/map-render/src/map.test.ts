import { fileURLToPath } from "node:url";
import { indexWorld, loadWorld } from "@dq/core/world";
import { readWorldFiles } from "@dq/core/world-fs";
import { describe, expect, it } from "vitest";
import { renderMap } from "./index";

const { world } = loadWorld(
  readWorldFiles(fileURLToPath(new URL("../../../worlds/lanternreach", import.meta.url))),
);
const idx = indexWorld(world as NonNullable<typeof world>);

describe("map renderer", () => {
  const base = {
    map: idx.world.map,
    regions: idx.world.regions,
    states: { hearthmoor: "visited", whisperwood: "discovered", reedmarsh: "rumored" } as const,
    partyRegionId: "whisperwood",
    trail: ["hearthmoor", "whisperwood"],
  };

  it("draws a PNG of the whole map", () => {
    const png = renderMap(base);
    expect(png.subarray(1, 4).toString()).toBe("PNG");
    expect(png.byteLength).toBeGreaterThan(20_000);
    expect(png.byteLength).toBeLessThan(8 * 1024 * 1024);
  });

  it("is deterministic", () => {
    expect(renderMap(base).equals(renderMap(base))).toBe(true);
  });

  it("can zoom in on a region", () => {
    const png = renderMap({ ...base, focusRegionId: "whisperwood" });
    expect(png.subarray(1, 4).toString()).toBe("PNG");
  });
});
