import { describe, expect, it } from "vitest";
import { runMonteCarlo } from "./report";
import { simulateCampaign } from "./simulate";
import { loadIndex } from "./world";

const index = loadIndex();

describe("campaign simulator", () => {
  it("plays a whole campaign deterministically", () => {
    const a = simulateCampaign(index, { policy: "mixed", seed: "same" });
    const b = simulateCampaign(index, { policy: "mixed", seed: "same" });
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
    expect(a.cruxes).toHaveLength(4);
  });

  it("meets the loom's design targets", () => {
    const [merciful, mixed, shortcut] = runMonteCarlo(index, 60);
    // Kindness is carried through at the end.
    expect(merciful?.finaleCarried).toBeGreaterThanOrEqual(0.85);
    // Shortcuts really are riskier at the end, but the story always goes on.
    expect(shortcut?.finaleCarried ?? 1).toBeLessThan(merciful?.finaleCarried ?? 0);
    expect(mixed?.finaleCarried ?? 0).toBeGreaterThan(shortcut?.finaleCarried ?? 1);
    // Snibbet is there when he matters.
    expect(merciful?.snibbetAtFinale).toBeGreaterThanOrEqual(0.85);
    for (const s of [merciful, mixed, shortcut]) {
      expect(s?.maxOptionalIn10).toBeLessThanOrEqual(2);
      expect(s?.detourPayoffRate).toBeGreaterThanOrEqual(0.95);
    }
  });
});
