import { describe, expect, it } from "vitest";
import { createRng, deriveRng, faceValue, hashHex, sequenceRng } from "./index";

describe("rng", () => {
  it("is deterministic for the same key", () => {
    const a = createRng("campaign-1");
    const b = createRng("campaign-1");
    for (let i = 0; i < 100; i++) expect(a.next()).toBe(b.next());
  });

  it("diverges for different keys", () => {
    const a = createRng("campaign-1");
    const b = createRng("campaign-2");
    const same = Array.from({ length: 20 }, () => a.next() === b.next()).filter(Boolean).length;
    expect(same).toBeLessThan(2);
  });

  it("keeps streams independent", () => {
    const rules = deriveRng("seed", "rules", 5);
    const loom = deriveRng("seed", "loom", 5);
    expect(rules.next()).not.toBe(loom.next());
  });

  it("produces fair d20 rolls (chi-square)", () => {
    const rng = createRng("fairness");
    const counts = new Array(20).fill(0);
    const n = 100_000;
    for (let i = 0; i < n; i++) counts[rng.int(1, 20) - 1]++;
    const expected = n / 20;
    const chi = counts.reduce((sum, c) => sum + (c - expected) ** 2 / expected, 0);
    // 19 degrees of freedom; p=0.001 critical value is ~43.8
    expect(chi).toBeLessThan(43.8);
  });

  it("int() stays in bounds", () => {
    const rng = createRng("bounds");
    for (let i = 0; i < 10_000; i++) {
      const v = rng.int(3, 7);
      expect(v).toBeGreaterThanOrEqual(3);
      expect(v).toBeLessThanOrEqual(7);
    }
  });

  it("weighted() never picks zero-weight items", () => {
    const rng = createRng("weights");
    for (let i = 0; i < 1000; i++) {
      expect(rng.weighted(["a", "b", "c"], (x) => (x === "b" ? 0 : 1))).not.toBe("b");
    }
  });

  it("sequenceRng returns the scripted faces", () => {
    const rng = sequenceRng([faceValue(20, 20), faceValue(1, 20), faceValue(4, 6)]);
    expect(rng.int(1, 20)).toBe(20);
    expect(rng.int(1, 20)).toBe(1);
    expect(rng.int(1, 6)).toBe(4);
  });

  it("hashHex is stable", () => {
    expect(hashHex("hello")).toBe(hashHex("hello"));
    expect(hashHex("hello")).toHaveLength(32);
  });
});
