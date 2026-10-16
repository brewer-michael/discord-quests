import { describe, expect, it } from "vitest";
import { rollAttack } from "../rules/combat";
import { createRng, deriveRng, faceValue, hashHex, sequenceRng, trueRng } from "./index";

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

describe("real dice", () => {
  const chiSquare = (counts: number[], n: number) => {
    const expected = n / counts.length;
    return counts.reduce((sum, c) => sum + (c - expected) ** 2 / expected, 0);
  };

  it("roll fair d20s and stay in bounds", () => {
    const rng = trueRng();
    const counts = new Array(20).fill(0);
    const n = 100_000;
    for (let i = 0; i < n; i++) {
      const v = rng.int(1, 20);
      expect(Number.isInteger(v) && v >= 1 && v <= 20).toBe(true);
      counts[v - 1]++;
    }
    // Real randomness, so a looser bar than the seeded test: 19 degrees of freedom at p=0.000001 is ~64.
    expect(chiSquare(counts, n)).toBeLessThan(64);
    expect(rng.draws).toBe(n);
  });

  it("never repeat between fresh sets of dice", () => {
    const a = Array.from({ length: 32 }, () => trueRng().int(1, 20));
    const b = Array.from({ length: 32 }, () => trueRng().int(1, 20));
    expect(a).not.toEqual(b);
    const floats = new Set(Array.from({ length: 1000 }, () => trueRng().next()));
    expect(floats.size).toBe(1000);
    for (const f of floats) expect(f >= 0 && f < 1).toBe(true);
  });

  it("hit as often as the rules say: +7 against armor 13 lands 75% of the time, 94% with advantage", () => {
    const rng = trueRng();
    const n = 20_000;
    const rate = (mode: "normal" | "advantage") =>
      Array.from({ length: n }, () => rollAttack(7, 13, mode, rng).hit).filter(Boolean).length / n;
    expect(Math.abs(rate("normal") - 0.75)).toBeLessThan(0.02);
    expect(Math.abs(rate("advantage") - 0.9375)).toBeLessThan(0.015);
  });
});
